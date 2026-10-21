"""Llamadas de Manuela guardadas en la base: lo que el CRM de cada empresa necesita (design/crm/PLAN.md, fase 2).

Hasta ahora el resultado de una llamada vivía solo en memoria (RESULTADOS_LLAMADAS en app.py) y ningún lead
decía de qué formulario venía ni de quién era el proyecto. Este módulo guarda:

- `public.solicitudes_llamada`: una fila por cada llamada que se le pide a Dapta. Lleva la marca del formulario
  (`?marca=`), el proyecto o inmueble elegido y su dueño (la constructora o la inmobiliaria), que sale del
  catálogo por id y nunca de lo que diga el navegador.
- `public.resultados_llamada`: lo que Dapta manda al colgar, una fila por `call_id`. Se une con su solicitud por
  `external_lead_id` (machea-<id de la solicitud>), que Dapta devuelve en las variables de la llamada.

Tablas: supabase/migrations/20261018120000_llamadas_y_marca.sql. Se escribe por PostgREST con la clave
service_role (igual que api/captacion.py); sin SUPABASE_URL y SUPABASE_SERVICE_KEY queda en memoria. Guardar
nunca rompe una llamada: los errores se registran y la llamada sigue.

No se guardan las demos con marca ("Pruébalo con tu marca"): las hace una empresa que prueba a Manuela con su
propio número, no un interesado.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

from Model.rutas import RUTA_ARRIENDO, RUTA_CATALOGO
from api import grabaciones

logger = logging.getLogger(__name__)

PREFIJO_LEAD = "machea-"
# Si Dapta no devuelve el external_lead_id, el resultado se une con la última solicitud de ese teléfono
# dentro de esta ventana.
VENTANA_SOLICITUD = timedelta(hours=6)


# ---------------------------------------------------------------------------
# Dueño del proyecto (catálogo)
# ---------------------------------------------------------------------------

def slug(texto: Any) -> Optional[str]:
    """'Constructora Bolívar S.A.' -> 'constructora-bolivar-s-a'. None si no queda nada."""
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
        logger.warning("llamadas: no se pudo leer %s", ruta)
        return []
    filas = datos.get(clave) if isinstance(datos, dict) else datos
    return filas if isinstance(filas, list) else []


@lru_cache(maxsize=1)
def _constructoras() -> Dict[str, Tuple[str, str]]:
    salida: Dict[str, Tuple[str, str]] = {}
    for p in _leer(RUTA_CATALOGO, "proyectos"):
        s = slug(p.get("constructora"))
        if p.get("id_proyecto") is not None and s:
            salida[str(p["id_proyecto"])] = (s, str(p["constructora"]))
    return salida


@lru_cache(maxsize=1)
def _inmobiliarias() -> Dict[str, Tuple[str, str]]:
    salida: Dict[str, Tuple[str, str]] = {}
    for i in _leer(RUTA_ARRIENDO, "inmuebles"):
        s = slug(i.get("inmobiliaria_publicadora"))
        if i.get("id_inmueble") is not None and s:
            salida[str(i["id_inmueble"])] = (s, str(i["inmobiliaria_publicadora"]).strip())
    return salida


def dueno_del_proyecto(tipo_operacion: str, id_proyecto: Optional[str]) -> Dict[str, Optional[str]]:
    """De quién es lo que la persona eligió: la constructora (Compra) o la inmobiliaria (Arriendo)."""
    vacio = {"dueno_tipo": None, "dueno_slug": None, "dueno_nombre": None}
    if not id_proyecto:
        return vacio
    if tipo_operacion == "arriendo":
        dato, tipo = _inmobiliarias().get(str(id_proyecto)), "inmobiliaria"
    else:
        dato, tipo = _constructoras().get(str(id_proyecto)), "constructora"
    if not dato:
        return vacio
    return {"dueno_tipo": tipo, "dueno_slug": dato[0], "dueno_nombre": dato[1]}


def digitos_telefono(telefono: Optional[str]) -> Optional[str]:
    """Los 10 dígitos del móvil, como los guarda public.leads (guardar_consulta solo quita lo que no es dígito)."""
    d = re.sub(r"\D", "", telefono or "")
    return d[-10:] if len(d) >= 10 else (d or None)


# ---------------------------------------------------------------------------
# Almacenes
# ---------------------------------------------------------------------------

def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class AlmacenMemoria:
    """Sin Supabase (local y pruebas). Se pierde al reiniciar."""
    nombre = "memoria"
    TOPE = 500

    def __init__(self) -> None:
        self.solicitudes: List[Dict[str, Any]] = []
        self.resultados: Dict[str, Dict[str, Any]] = {}
        self._cerrojo = threading.Lock()

    def crear_solicitud(self, fila: Dict[str, Any]) -> None:
        with self._cerrojo:
            self.solicitudes.append({**fila, "creado_en": _ahora().isoformat()})
            del self.solicitudes[: -self.TOPE]

    def solicitud_reciente(self, telefono: str, desde: datetime) -> Optional[str]:
        with self._cerrojo:
            for s in reversed(self.solicitudes):
                if s["telefono"] == telefono and datetime.fromisoformat(s["creado_en"]) >= desde:
                    return s["id"]
        return None

    def guardar_resultado(self, fila: Dict[str, Any]) -> None:
        with self._cerrojo:
            previo = self.resultados.get(fila["call_id"], {})
            self.resultados[fila["call_id"]] = {**previo, **fila}


class AlmacenSupabase:
    """PostgREST con la clave service_role, como AlmacenSupabase de api/captacion.py."""
    nombre = "supabase"

    def __init__(self, url: str, clave: str, cliente: Any = None) -> None:
        import httpx
        self.base = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"}
        self.c = cliente or httpx.Client(timeout=10.0)

    def _req(self, metodo: str, ruta: str, *, params: Optional[dict] = None, cuerpo: Any = None,
             prefer: str = "return=minimal") -> Any:
        r = self.c.request(metodo, self.base + ruta, params=params, json=cuerpo, headers={**self.h, "Prefer": prefer})
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {metodo} {ruta}: {r.status_code} {r.text[:200]}")
        return r.json() if r.content else []

    def crear_solicitud(self, fila: Dict[str, Any]) -> None:
        self._req("POST", "/solicitudes_llamada", cuerpo=fila)

    def solicitud_reciente(self, telefono: str, desde: datetime) -> Optional[str]:
        f = self._req("GET", "/solicitudes_llamada", prefer="return=representation", params={
            "select": "id", "telefono": f"eq.{telefono}", "creado_en": f"gte.{desde.isoformat()}",
            "order": "creado_en.desc", "limit": "1"})
        return f[0]["id"] if f else None

    def guardar_resultado(self, fila: Dict[str, Any]) -> None:
        # Un evento posterior sin análisis no borra lo que dejó el anterior: solo viajan las columnas con valor
        # y PostgREST actualiza esas (merge-duplicates sobre call_id).
        def enviar(cuerpo: Dict[str, Any]) -> None:
            self._req("POST", "/resultados_llamada", params={"on_conflict": "call_id"}, cuerpo=cuerpo,
                      prefer="resolution=merge-duplicates,return=minimal")

        try:
            enviar(fila)
        except RuntimeError as e:
            # El código puede salir antes que la migración del audio: se guarda lo de siempre y se avisa.
            if not grabaciones.columna_faltante(e):
                raise
            logger.warning("llamadas: falta aplicar la migración del audio y la transcripción; se guarda sin ellos")
            enviar(grabaciones.sin_columnas_nuevas(fila))


_ALMACEN: Any = None


def almacen() -> Any:
    global _ALMACEN
    if _ALMACEN is None:
        url, clave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
        _ALMACEN = AlmacenSupabase(url, clave) if (url and clave) else AlmacenMemoria()
        logger.info("llamadas: almacén %s", _ALMACEN.nombre)
    return _ALMACEN


def configurar_almacen(a: Any) -> None:
    """Para las pruebas."""
    global _ALMACEN
    _ALMACEN = a


# ---------------------------------------------------------------------------
# Lo que usa app.py
# ---------------------------------------------------------------------------

def nueva_solicitud(*, telefono_e164: str, nombre: Optional[str], marca: str, tipo_operacion: str,
                    tipo_inmueble: Optional[str],
                    id_proyecto: Optional[str], nombre_proyecto: str, autoriza_compartir: Optional[bool],
                    version_autorizacion: Optional[str]) -> Dict[str, Any]:
    """La fila de la solicitud, con su id ya puesto: el id viaja a Dapta como external_lead_id."""
    return {
        "id": str(uuid.uuid4()),
        "telefono": telefono_e164,
        "telefono_digitos": digitos_telefono(telefono_e164),
        "nombre": (nombre or "").strip()[:120] or None,
        "marca": marca,
        "tipo_operacion": tipo_operacion,
        "tipo_inmueble": tipo_inmueble,
        "id_proyecto": str(id_proyecto) if id_proyecto else None,
        "nombre_proyecto": (nombre_proyecto or "")[:200] or None,
        **dueno_del_proyecto(tipo_operacion, id_proyecto),
        "autoriza_compartir": autoriza_compartir,
        "version_autorizacion": (version_autorizacion or "")[:40] or None,
    }


def guardar_solicitud(fila: Dict[str, Any]) -> None:
    try:
        almacen().crear_solicitud(fila)
    except Exception:  # noqa: BLE001 - guardar nunca rompe la llamada
        logger.exception("llamadas: no se pudo guardar la solicitud %s", fila.get("id"))


def _solicitud_de(llamada: Dict[str, Any], body: Dict[str, Any], telefono_e164: str) -> Optional[str]:
    variables = next((v for v in (llamada.get("dynamic_variables"), llamada.get("retell_llm_dynamic_variables"),
                                  llamada.get("llm_dynamic_variables"), body.get("dynamic_variables"))
                      if isinstance(v, dict)), {})
    externo = str(variables.get("external_lead_id") or "")
    if externo.startswith(PREFIJO_LEAD):
        posible = externo[len(PREFIJO_LEAD):]
        try:
            return str(uuid.UUID(posible))
        except ValueError:
            pass
    return almacen().solicitud_reciente(telefono_e164, _ahora() - VENTANA_SOLICITUD)


# Las columnas de resultados_llamada que salen del resultado que arma el webhook de app.py.
_COLUMNAS_RESULTADO = (
    "sin_contacto", "call_status", "disconnection_reason", "temperatura_lead", "resumen_llamada",
    "recomendacion_asesor", "estado_del_lead", "nivel_de_urgencia", "tomador_de_decision",
    "presupuesto_confirmado", "fecha_de_seguimiento", "objecion_principal", "cita_agendada", "fecha_hora_cita",
    "canal_cita", "motivo_no_agenda",
)
_TEXTOS_LIBRES = ("tomador_de_decision", "presupuesto_confirmado")


def guardar_resultado(llamada: Dict[str, Any], body: Dict[str, Any], telefono_e164: str,
                      resultado: Dict[str, Any]) -> None:
    """Guarda el resultado que el webhook ya armó (y unió con los eventos anteriores de la misma llamada)."""
    try:
        call_id = str(llamada.get("call_id") or "").strip()[:120]
        if not call_id:
            logger.warning("llamadas: resultado sin call_id, no se guarda")
            return
        fila: Dict[str, Any] = {"call_id": call_id, "telefono": telefono_e164, "recibido_en": _ahora().isoformat()}
        solicitud = _solicitud_de(llamada, body, telefono_e164)
        if solicitud:
            fila["solicitud_id"] = solicitud
        for c in _COLUMNAS_RESULTADO:
            v = resultado.get(c)
            if v in (None, ""):
                continue
            fila[c] = str(v)[:2000] if c in _TEXTOS_LIBRES or isinstance(v, str) else v
        if grabaciones.habilitada("manuela"):
            fila.update(grabaciones.extraer(llamada))
        almacen().guardar_resultado(fila)
    except Exception:  # noqa: BLE001 - guardar nunca rompe el webhook
        logger.exception("llamadas: no se pudo guardar el resultado de %s", telefono_e164[-4:])
