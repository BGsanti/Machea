"""
api/metricas.py
===============
Actividad del backend, en memoria, para el panel de administración (api/admin.py).

QUÉ GUARDA. Un contador por tipo de suceso (llamadas pedidas, rechazadas, resultados
recibidos, demos, correos, accesos al panel…) y las últimas 200 anotaciones, para mostrar
"qué está pasando ahora" y "cuándo fue lo último".

QUÉ NO GUARDA. Ningún dato personal: los teléfonos se anotan como "…3915" y las IPs con el
último tramo tapado (`enmascarar_*`). Un volcado de esta memoria no delata a nadie.

EN MEMORIA, A PROPÓSITO (igual que api/limites.py): es un solo proceso, y al reiniciar el
servicio todo vuelve a cero. El panel lo dice ("desde el último reinicio"). Si algún día
hay varias instancias o hace falta historia larga, esto pasa a una tabla.

`registrar()` nunca lanza: medir no puede romper el servicio.
"""

from __future__ import annotations

import re
import threading
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional

HORA = 3600
DIA = 86400
_MAX_EVENTOS = 200
_MAX_MARCAS = 5000          # marcas de tiempo por tipo (de sobra para 24 h de este tráfico)

NIVELES = ("ok", "info", "aviso", "error")


def enmascarar_telefono(telefono: Optional[str]) -> str:
    """"+573125923915" -> "…3915". Sin dato, "—"."""
    digitos = re.sub(r"\D", "", telefono or "")
    return f"…{digitos[-4:]}" if len(digitos) >= 4 else "—"


def enmascarar_ip(ip: Optional[str]) -> str:
    """"203.0.113.77" -> "203.0.113.•"; IPv6 "2001:db8:1:2::9" -> "2001:db8:1:•"."""
    ip = (ip or "").strip()
    if not ip:
        return "—"
    if ":" in ip:
        partes = ip.split(":")
        return ":".join(partes[:3]) + ":•"
    partes = ip.split(".")
    if len(partes) == 4:
        return ".".join(partes[:3]) + ".•"
    return "—"


class Metricas:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.inicio = time.time()
        self._marcas: Dict[str, Deque[float]] = {}
        self._totales: Dict[str, int] = {}
        self._ultimo: Dict[str, Dict[str, Any]] = {}
        self._eventos: Deque[Dict[str, Any]] = deque(maxlen=_MAX_EVENTOS)

    # -- escritura -----------------------------------------------------------

    def registrar(self, tipo: str, texto: str = "", nivel: str = "info") -> None:
        try:
            ahora = time.time()
            nivel = nivel if nivel in NIVELES else "info"
            evento = {"t": ahora, "tipo": tipo, "nivel": nivel, "texto": (texto or "")[:200]}
            with self._lock:
                marcas = self._marcas.setdefault(tipo, deque(maxlen=_MAX_MARCAS))
                marcas.append(ahora)
                self._totales[tipo] = self._totales.get(tipo, 0) + 1
                self._ultimo[tipo] = evento
                self._eventos.append(evento)
        except Exception:                      # medir nunca rompe nada
            pass

    # -- lectura -------------------------------------------------------------

    def conteo(self, tipo: str, segundos: int) -> int:
        ahora = time.time()
        with self._lock:
            return sum(1 for t in self._marcas.get(tipo, ()) if ahora - t < segundos)

    def ultimo(self, tipo: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            e = self._ultimo.get(tipo)
            return dict(e) if e else None

    def contadores(self, tipos: List[str]) -> Dict[str, Dict[str, int]]:
        return {
            t: {"hora": self.conteo(t, HORA), "dia": self.conteo(t, DIA), "total": self._totales.get(t, 0)}
            for t in tipos
        }

    def eventos(self, tipos: Optional[List[str]] = None, limite: int = 50) -> List[Dict[str, Any]]:
        """Lo más reciente primero."""
        with self._lock:
            lista = [dict(e) for e in self._eventos if tipos is None or e["tipo"] in tipos]
        return list(reversed(lista))[:limite]

    def segundos_activo(self) -> int:
        return int(time.time() - self.inicio)

    def reiniciar(self) -> None:
        """Solo para pruebas."""
        with self._lock:
            self.inicio = time.time()
            self._marcas.clear()
            self._totales.clear()
            self._ultimo.clear()
            self._eventos.clear()


metricas = Metricas()
