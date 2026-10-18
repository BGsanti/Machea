"""
api/fuentes.py
==============
De dónde le llegan leads a cada empresa en su CRM (design/crm/PLAN.md, fase 4). Lo decide Machea desde `/admin`,
nunca la empresa: si una empresa pudiera elegir sus fuentes, podría reclamar los leads de otra.

    GET /api/admin/fuentes/opciones          marcas de formulario, constructoras e inmobiliarias de los catálogos
    GET /api/admin/cuentas/{id}/fuentes      las fuentes de una cuenta
    PUT /api/admin/cuentas/{id}/fuentes      {"fuentes": [{"tipo": "marca"|"constructora"|"inmobiliaria", "slug": "..."}]}

- `marca`: el `?marca=` del formulario (MARCAS_CONOCIDAS en app.py). Le llega todo lo que entra por ese formulario.
- `constructora` / `inmobiliaria`: el dueño del proyecto o inmueble, como lo guarda public.solicitudes_llamada
  (api/llamadas.py, que usa el mismo `slug`). Le llega quien pidió la llamada por un proyecto suyo y autorizó
  compartir.

Cada (tipo, slug) es de una sola empresa. Solo las cuentas aprobadas tienen fuentes. Las filas van a
crm.empresa_fuentes, y los triggers de supabase/migrations/20261018130000_crm_ingesta.sql hacen el resto.

SEGURIDAD: las mismas reglas del panel (api/admin.py, `exigir`): sin ADMIN_PASSWORD responden 404 y no salen en /docs.
"""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from typing import Any, Dict, List, Optional, Protocol

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel

from api.admin import exigir
from api.cuentas import CuentaNoExiste, EstadoInvalido
from api.metricas import metricas

router = APIRouter(prefix="/api/admin", include_in_schema=False)

TIPOS_FUENTE = ("marca", "constructora", "inmobiliaria")
_ID = r"^[A-Za-z0-9_-]{1,64}$"
_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
MAX_FUENTES = 20


class FuenteOcupada(Exception):
    """Ese (tipo, slug) ya es de otra empresa."""

    def __init__(self, tipo: str, slug: str) -> None:
        super().__init__(f"{tipo}:{slug}")
        self.tipo, self.slug = tipo, slug


class CrmNoInstalado(Exception):
    """La base todavía no tiene el esquema crm (design/crm/PUESTA_EN_MARCHA.md)."""


class AlmacenFuentes(Protocol):
    def fuentes(self, cuenta_id: str) -> List[Dict[str, str]]: ...

    def reemplazar_fuentes(self, cuenta_id: str, fuentes: List[Dict[str, str]]) -> List[Dict[str, str]]: ...


_almacen: Optional[AlmacenFuentes] = None


def configurar_almacen(almacen: Optional[AlmacenFuentes]) -> None:
    global _almacen
    _almacen = almacen


def slug(texto: Any) -> Optional[str]:
    """El mismo de api/llamadas.py: 'Constructora Bolívar S.A.' -> 'constructora-bolivar-s-a'."""
    if not texto:
        return None
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode().lower()
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:60].strip("-")
    return t or None


def _leer(ruta: str, clave: str) -> List[Dict[str, Any]]:
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError):
        return []
    filas = datos.get(clave) if isinstance(datos, dict) else datos
    return filas if isinstance(filas, list) else []


@lru_cache(maxsize=1)
def _opciones() -> Dict[str, List[Dict[str, str]]]:
    from Model.rutas import RUTA_ARRIENDO, RUTA_CATALOGO
    from api.app import MARCAS_CONOCIDAS

    def unicos(nombres: List[Any]) -> List[Dict[str, str]]:
        vistos: Dict[str, str] = {}
        for n in nombres:
            s = slug(n)
            if s and s not in vistos:
                vistos[s] = str(n).strip()
        return [{"slug": s, "nombre": n} for s, n in sorted(vistos.items())]

    return {
        "marca": [{"slug": s, "nombre": s} for s in sorted(MARCAS_CONOCIDAS) if s != "machea"],
        "constructora": unicos([p.get("constructora") for p in _leer(RUTA_CATALOGO, "proyectos")]),
        "inmobiliaria": unicos([i.get("inmobiliaria_publicadora") for i in _leer(RUTA_ARRIENDO, "inmuebles")]),
    }


def _exigir_almacen() -> AlmacenFuentes:
    if _almacen is None:
        raise HTTPException(503, {"codigo": "no_disponible",
                                  "mensaje": "Las cuentas todavía no están conectadas a un servicio de nube."})
    return _almacen


class Fuente(BaseModel):
    tipo: str
    slug: str


class EntradaFuentes(BaseModel):
    fuentes: List[Fuente]


@router.get("/fuentes/opciones")
def opciones(sesion: Dict[str, Any] = Depends(exigir)):
    return _opciones()


@router.get("/cuentas/{id_}/fuentes")
def leer(id_: str = Path(pattern=_ID), sesion: Dict[str, Any] = Depends(exigir)):
    try:
        return {"fuentes": _exigir_almacen().fuentes(id_)}
    except CrmNoInstalado:
        raise HTTPException(503, {"codigo": "crm_no_instalado", "mensaje": "El CRM todavía no está instalado en la base."})


@router.put("/cuentas/{id_}/fuentes")
def guardar(datos: EntradaFuentes, id_: str = Path(pattern=_ID), sesion: Dict[str, Any] = Depends(exigir)):
    limpias: List[Dict[str, str]] = []
    for f in datos.fuentes[: MAX_FUENTES + 1]:
        if f.tipo not in TIPOS_FUENTE or not _SLUG.match(f.slug) or len(f.slug) > 60:
            raise HTTPException(422, {"codigo": "datos_invalidos", "mensaje": f"Fuente no válida: {f.tipo} {f.slug[:60]}."})
        # El formulario de Machea no es de ningún cliente: con esta marca recibiría a todos los interesados.
        if f.tipo == "marca" and f.slug == "machea":
            raise HTTPException(422, {"codigo": "datos_invalidos", "mensaje": "El formulario de Machea no se asigna a una empresa."})
        par = {"tipo": f.tipo, "slug": f.slug}
        if par not in limpias:
            limpias.append(par)
    if len(limpias) > MAX_FUENTES:
        raise HTTPException(422, {"codigo": "datos_invalidos", "mensaje": f"Máximo {MAX_FUENTES} fuentes por empresa."})
    try:
        guardadas = _exigir_almacen().reemplazar_fuentes(id_, limpias)
    except CuentaNoExiste:
        raise HTTPException(404, {"codigo": "no_existe", "mensaje": "Esa cuenta no existe."})
    except EstadoInvalido:
        raise HTTPException(409, {"codigo": "estado_invalido", "mensaje": "Solo las cuentas aprobadas reciben leads."})
    except FuenteOcupada as e:
        raise HTTPException(409, {"codigo": "fuente_ocupada",
                                  "mensaje": f"«{e.slug}» ({e.tipo}) ya es de otra empresa. Quítasela allá primero."})
    except CrmNoInstalado:
        raise HTTPException(503, {"codigo": "crm_no_instalado", "mensaje": "El CRM todavía no está instalado en la base."})
    resumen = ", ".join(f"{f['tipo']} {f['slug']}" for f in guardadas) or "ninguna"
    metricas.registrar("fuentes_cuenta", f"Fuentes de leads de una cuenta: {resumen[:120]}", "ok")
    return {"fuentes": guardadas}


class AlmacenFuentesMemoria:
    """Para pruebas: `estados` es {cuenta_id: estado}."""

    def __init__(self, estados: Dict[str, str]) -> None:
        self.estados = dict(estados)
        self.filas: List[Dict[str, str]] = []

    def fuentes(self, cuenta_id: str) -> List[Dict[str, str]]:
        return sorted(({"tipo": f["tipo"], "slug": f["slug"]} for f in self.filas if f["empresa"] == cuenta_id),
                      key=lambda f: (f["tipo"], f["slug"]))

    def reemplazar_fuentes(self, cuenta_id: str, fuentes: List[Dict[str, str]]) -> List[Dict[str, str]]:
        estado = self.estados.get(cuenta_id)
        if estado is None:
            raise CuentaNoExiste(cuenta_id)
        if estado != "aprobada":
            raise EstadoInvalido(cuenta_id)
        for f in fuentes:
            if any(x["tipo"] == f["tipo"] and x["slug"] == f["slug"] and x["empresa"] != cuenta_id for x in self.filas):
                raise FuenteOcupada(f["tipo"], f["slug"])
        self.filas = [x for x in self.filas if x["empresa"] != cuenta_id] + [{**f, "empresa": cuenta_id} for f in fuentes]
        return self.fuentes(cuenta_id)
