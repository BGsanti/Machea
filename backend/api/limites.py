"""
api/limites.py
==============
Topes de uso del backend público.

POR QUÉ EXISTE. `/api/llamar` dispara una llamada real de Manuela a cualquier
móvil colombiano que llegue en el cuerpo, sin login y con CORS abierto. Sin topes,
cualquiera puede (1) acosar a un tercero haciéndolo llamar, o (2) vaciar los
créditos de Dapta: una llamada de un minuto gasta ~666. Estos topes lo impiden
sin estorbar a una persona normal, que pide UNA llamada.

QUÉ TOPA (todo configurable por variable de entorno):

    LLAMADAS_POR_TELEFONO_HORA   1     por número, en la última hora
    LLAMADAS_POR_IP_HORA         5     por conexión, en la última hora
    LLAMADAS_TOTAL_DIA           100   en total, en las últimas 24 h
    DEMO_LLAMADAS_TOTAL_DIA      30    de las anteriores, las de demo con marca
    LIMITE_TELEFONOS_EXENTOS     ""    números del equipo que no se topan
                                       (separados por coma), para probar

EN MEMORIA, A PROPÓSITO. Es un solo proceso en Render: no hace falta una base
para esto, y al reiniciar el servicio los contadores vuelven a cero (a lo sumo
alguien se salta un tope una vez). Si algún día hay varias instancias, estos
contadores tienen que pasar a un almacén compartido.

`reservar()` descuenta el cupo ANTES de llamar a Dapta y devuelve una reserva;
si Dapta falla, `reserva.liberar()` lo devuelve, para que un error nuestro no
bloquee a la persona durante una hora.
"""

from __future__ import annotations

import math
import os
import re
import threading
import time
from collections import deque
from typing import Deque, Dict, List, Optional

HORA = 3600
DIA = 86400
_MAX_LLAVES = 5000          # tope de memoria: pasado esto se podan las llaves vacías


def _entero(nombre: str, defecto: int) -> int:
    try:
        valor = int(os.environ.get(nombre, defecto))
    except ValueError:
        return defecto
    return valor if valor >= 0 else defecto


def _solo_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto or "")


def _exentos() -> set:
    crudo = os.environ.get("LIMITE_TELEFONOS_EXENTOS", "")
    # Se comparan por los últimos 10 dígitos: "+573123506412" y "3123506412" son uno.
    return {_solo_digitos(t)[-10:] for t in crudo.split(",") if _solo_digitos(t)}


class Rechazo(Exception):
    """Un tope se pasó. `mensaje` es para mostrar tal cual a la persona."""

    def __init__(self, motivo: str, mensaje: str, reintentar_en: int):
        super().__init__(mensaje)
        self.motivo = motivo
        self.mensaje = mensaje
        self.reintentar_en = max(1, int(reintentar_en))


class Reserva:
    """Cupo descontado. `liberar()` lo devuelve si la acción no llegó a ocurrir."""

    def __init__(self, limites: "Limites", marcas: List[tuple]):
        self._limites = limites
        self._marcas = marcas
        self._liberada = False

    def liberar(self) -> None:
        if self._liberada:
            return
        self._liberada = True
        self._limites._devolver(self._marcas)


class Limites:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ventanas: Dict[str, Deque[float]] = {}

    # -- mecánica de una ventana deslizante ---------------------------------

    def _ventana(self, llave: str) -> Deque[float]:
        return self._ventanas.setdefault(llave, deque())

    @staticmethod
    def _podar(v: Deque[float], ahora: float, segundos: int) -> None:
        while v and ahora - v[0] >= segundos:
            v.popleft()

    def _espera(self, v: Deque[float], ahora: float, segundos: int) -> int:
        return math.ceil(segundos - (ahora - v[0])) if v else 1

    def _compactar(self) -> None:
        if len(self._ventanas) > _MAX_LLAVES:
            for llave in [k for k, v in self._ventanas.items() if not v]:
                del self._ventanas[llave]

    def _devolver(self, marcas: List[tuple]) -> None:
        with self._lock:
            for llave, ts in marcas:
                v = self._ventanas.get(llave)
                if v and ts in v:
                    v.remove(ts)

    # -- API pública ---------------------------------------------------------

    def reservar_llamada(self, *, telefono: str, ip: str, demo: bool = False) -> Reserva:
        """Aplica los topes de una llamada. Lanza `Rechazo` si alguno se pasó."""
        por_tel = _entero("LLAMADAS_POR_TELEFONO_HORA", 1)
        por_ip = _entero("LLAMADAS_POR_IP_HORA", 5)
        total = _entero("LLAMADAS_TOTAL_DIA", 100)
        total_demo = _entero("DEMO_LLAMADAS_TOTAL_DIA", 30)

        tel = _solo_digitos(telefono)[-10:]
        exento = tel in _exentos()

        # (llave, tope, segundos, motivo, mensaje)
        reglas = []
        if not exento:
            reglas.append((f"tel:{tel}", por_tel, HORA, "telefono",
                           "Ya le pedimos una llamada a este número hace poco. "
                           "Intenta de nuevo en {m} minutos."))
            reglas.append((f"ip:{ip}", por_ip, HORA, "ip",
                           "Se hicieron demasiadas solicitudes desde esta conexión. "
                           "Intenta de nuevo en {m} minutos."))
        reglas.append(("total", total, DIA, "total",
                       "Hoy llegamos al límite de llamadas. Vuelve mañana o escríbenos "
                       "a equipo@machea.co y te contactamos."))
        if demo:
            reglas.append(("demo", total_demo, DIA, "demo",
                           "Hoy llegamos al límite de demostraciones con llamada. "
                           "Vuelve mañana o escríbenos a equipo@machea.co."))

        ahora = time.time()
        with self._lock:
            self._compactar()
            # 1) Se mira TODO antes de descontar nada: o entra completo o no entra.
            for llave, tope, segundos, motivo, mensaje in reglas:
                v = self._ventana(llave)
                self._podar(v, ahora, segundos)
                if len(v) >= tope:
                    espera = self._espera(v, ahora, segundos)
                    raise Rechazo(motivo, mensaje.format(m=max(1, math.ceil(espera / 60))), espera)
            # 2) Pasó todo: se descuenta.
            marcas = []
            for llave, _tope, _seg, _motivo, _msg in reglas:
                self._ventana(llave).append(ahora)
                marcas.append((llave, ahora))
        return Reserva(self, marcas)

    def tope_simple(self, *, llave: str, tope: int, segundos: int, mensaje: str) -> None:
        """Un tope suelto (p. ej. por IP en un endpoint caro). Lanza `Rechazo`."""
        ahora = time.time()
        with self._lock:
            self._compactar()
            v = self._ventana(llave)
            self._podar(v, ahora, segundos)
            if len(v) >= tope:
                espera = self._espera(v, ahora, segundos)
                raise Rechazo("tope", mensaje.format(m=max(1, math.ceil(espera / 60))), espera)
            v.append(ahora)

    def reiniciar(self) -> None:
        """Solo para pruebas."""
        with self._lock:
            self._ventanas.clear()


limites = Limites()


def ip_del_cliente(request) -> str:
    """La IP real de quien llama.

    Render va detrás de Cloudflare, que pone `CF-Connecting-IP` y lo
    sobrescribe en su borde: un cliente no puede falsificarlo. Se cae a
    `True-Client-IP`, luego al primer valor de `X-Forwarded-For`, y por último
    a la conexión directa (en local).
    """
    h = request.headers
    for nombre in ("cf-connecting-ip", "true-client-ip"):
        valor = (h.get(nombre) or "").strip()
        if valor:
            return valor
    xff = (h.get("x-forwarded-for") or "").split(",")[0].strip()
    if xff:
        return xff
    return request.client.host if request.client else "desconocida"
