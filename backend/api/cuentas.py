"""
api/cuentas.py
==============
Aprobación de las cuentas de empresas (constructoras e inmobiliarias) desde el panel `/admin`.
Contrato completo del login: `design/login/CONTRATO_AUTH.md`.

    GET  /api/admin/cuentas?estado=pendiente     lista de cuentas (por estado, o todas)
    POST /api/admin/cuentas/{id}/aprobar         {"tipo": "constructora" | "inmobiliaria"}
    POST /api/admin/cuentas/{id}/rechazar

INDEPENDIENTE DE LA NUBE: Machea va a migrar de Supabase a otro servicio, así que este módulo NO sabe
dónde viven las cuentas. Habla con un `AlmacenCuentas`, que se conecta con `configurar_almacen()` al
elegir la nube. Mientras no haya almacén, las rutas responden 503 `no_disponible` y el panel lo explica.

SEGURIDAD: las mismas reglas del panel (api/admin.py). Pide su sesión (`exigir`), así que sin
ADMIN_PASSWORD las rutas responden 404, y las respuestas son no-store y no salen en /docs.
Las cuentas son de empresas: el panel ve su usuario, su correo de contacto y su estado, nunca una
contraseña ni un dato de un lead. Cada aprobación o rechazo queda anotado en la actividad.
"""

from __future__ import annotations

import re
from typing import Any, Callable, Dict, List, Optional, Protocol

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Path, Query
from pydantic import BaseModel

from api.admin import exigir
from api.metricas import metricas

router = APIRouter(prefix="/api/admin/cuentas", include_in_schema=False)

ESTADOS = ("sin_confirmar", "pendiente", "aprobada", "rechazada")
TIPOS = ("constructora", "inmobiliaria")
_ID = r"^[A-Za-z0-9_-]{1,64}$"


class CuentaNoExiste(Exception):
    pass


class EstadoInvalido(Exception):
    """La cuenta no se puede aprobar o rechazar en su estado actual (p. ej. sin confirmar el correo)."""


class AlmacenCuentas(Protocol):
    """Lo que debe implementar el almacén de la nube. Las cuentas van con la forma `Cuenta` del contrato:
    {id, usuario, correo, estado, tipo, metodos, creadaEn}."""

    def listar(self, estado: Optional[str]) -> List[Dict[str, Any]]: ...

    def aprobar(self, id_: str, tipo: str) -> Dict[str, Any]: ...

    def rechazar(self, id_: str) -> Dict[str, Any]: ...


_almacen: Optional[AlmacenCuentas] = None

# Se llama (en segundo plano) con la cuenta ya decidida: el arranque lo conecta al correo de aviso a la
# empresa (api/acceso.py, correo_decision). None = no se avisa.
al_decidir: Optional[Callable[[Dict[str, Any]], None]] = None


def configurar_almacen(almacen: Optional[AlmacenCuentas]) -> None:
    """Conecta (o desconecta, con None) el almacén de cuentas. Lo llama el arranque al elegir la nube."""
    global _almacen
    _almacen = almacen


def _exigir_almacen() -> AlmacenCuentas:
    if _almacen is None:
        raise HTTPException(503, {"codigo": "no_disponible",
                                  "mensaje": "Las cuentas todavía no están conectadas a un servicio de nube."})
    return _almacen


_SEGURO = re.compile(r"[^\w@.+\- ]", re.UNICODE)


def _publica(c: Dict[str, Any]) -> Dict[str, Any]:
    """Solo los campos del contrato: si el almacén trae algo más (hashes, tokens), no sale."""
    return {
        "id": str(c.get("id", "")),
        "usuario": str(c.get("usuario", "")),
        "correo": str(c.get("correo", "")),
        "estado": c.get("estado") if c.get("estado") in ESTADOS else "pendiente",
        "tipo": c.get("tipo") if c.get("tipo") in TIPOS else None,
        "metodos": [m for m in (c.get("metodos") or []) if m in ("correo", "google")],
        "creadaEn": str(c.get("creadaEn", "")),
    }


class EntradaAprobar(BaseModel):
    tipo: str


@router.get("")
def listar(estado: Optional[str] = Query(default=None, max_length=20), sesion: Dict[str, Any] = Depends(exigir)):
    if estado is not None and estado not in ESTADOS:
        raise HTTPException(422, {"codigo": "datos_invalidos", "mensaje": "Estado desconocido."})
    cuentas = [_publica(c) for c in _exigir_almacen().listar(estado)]
    cuentas.sort(key=lambda c: c["creadaEn"], reverse=True)
    return {"cuentas": cuentas}


def _cambiar(id_: str, accion: str, tipo: Optional[str] = None, tareas: Optional[BackgroundTasks] = None) -> Dict[str, Any]:
    almacen = _exigir_almacen()
    try:
        cuenta = almacen.aprobar(id_, tipo or "") if accion == "aprobar" else almacen.rechazar(id_)
    except CuentaNoExiste:
        raise HTTPException(404, {"codigo": "no_existe", "mensaje": "Esa cuenta no existe."})
    except EstadoInvalido:
        raise HTTPException(409, {"codigo": "estado_invalido",
                                  "mensaje": "La cuenta todavía no confirmó su correo; no se puede decidir sobre ella."})
    c = _publica(cuenta)
    usuario = _SEGURO.sub("", c["usuario"])[:40]
    if accion == "aprobar":
        metricas.registrar("cuenta_aprobada", f"Cuenta aprobada: {usuario} ({c['tipo']})", "ok")
    else:
        metricas.registrar("cuenta_rechazada", f"Cuenta rechazada: {usuario}", "aviso")
    if al_decidir is not None and tareas is not None:
        tareas.add_task(al_decidir, c)
    return {"cuenta": c}


@router.post("/{id_}/aprobar")
def aprobar(datos: EntradaAprobar, tareas: BackgroundTasks, id_: str = Path(pattern=_ID),
            sesion: Dict[str, Any] = Depends(exigir)):
    if datos.tipo not in TIPOS:
        raise HTTPException(422, {"codigo": "datos_invalidos", "mensaje": "El tipo debe ser constructora o inmobiliaria."})
    return _cambiar(id_, "aprobar", datos.tipo, tareas)


@router.post("/{id_}/rechazar")
def rechazar(tareas: BackgroundTasks, id_: str = Path(pattern=_ID), sesion: Dict[str, Any] = Depends(exigir)):
    return _cambiar(id_, "rechazar", tareas=tareas)


class AlmacenEnMemoria:
    """Almacén de prueba (tests y demos locales). NO persiste: se pierde al reiniciar el proceso."""

    def __init__(self, cuentas: Optional[List[Dict[str, Any]]] = None):
        self.cuentas: Dict[str, Dict[str, Any]] = {c["id"]: dict(c) for c in (cuentas or [])}

    def listar(self, estado: Optional[str]) -> List[Dict[str, Any]]:
        return [dict(c) for c in self.cuentas.values() if estado is None or c.get("estado") == estado]

    def _decidir(self, id_: str, estado: str, tipo: Optional[str]) -> Dict[str, Any]:
        c = self.cuentas.get(id_)
        if c is None:
            raise CuentaNoExiste(id_)
        if c.get("estado") == "sin_confirmar":
            raise EstadoInvalido(id_)
        c["estado"] = estado
        if tipo:
            c["tipo"] = tipo
        return dict(c)

    def aprobar(self, id_: str, tipo: str) -> Dict[str, Any]:
        return self._decidir(id_, "aprobada", tipo)

    def rechazar(self, id_: str) -> Dict[str, Any]:
        return self._decidir(id_, "rechazada", None)
