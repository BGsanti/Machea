"""
api/proyectos_web.py
====================
Cuando una empresa escribe el link de su sitio en un formulario de la landing
—"Armar mi demo" (`/api/demo/solicitar`) o "Agenda una demo"
(`/api/captacion/demo`)—, se recorren en segundo plano los proyectos que
publica (features/scrap_proyectos) y quedan en

    features/scrap_proyectos/empresas/<Empresa>/proyectos_<Empresa>.json
    features/scrap_proyectos/empresas/<Empresa>/<Nombre_Proyecto>/<id>/01.jpg …

Reglas:
  * **No frena el formulario.** Corre en un hilo propio, con una cola corta
    (`MAX_EN_COLA`). La persona recibe su respuesta igual que antes.
  * **Una vez por sitio** cada `REUSO_HORAS`: diez personas de la misma
    constructora no disparan diez recorridos.
  * **Va por la descarga blindada** de api/ssrf.py (`ssrf.instalar()` reemplaza
    el `_get` de scrap_identity, por donde sale también esta feature) y con
    presupuesto de tiempo propio.
  * **`EXTRAER_PROYECTOS_WEB`**: `1` lo enciende y `0` lo apaga. Sin la
    variable, solo corre en producción (Render o `ENTORNO=produccion`): en local
    y en las pruebas no sale a internet sin que nadie lo pida.

`GET /api/demo/proyectos?d=<token>` devuelve el estado y el catálogo de la
empresa de esa demo, sin rutas del servidor. El token es el mismo de la demo
(api/demo.py): solo ve el catálogo quien tiene el enlace que el servidor firmó.

OJO: el disco de Render y de Cloud Run es efímero. Lo extraído sobrevive hasta
el próximo despliegue o reinicio; para guardarlo de verdad hay que llevarlo a
un bucket o a la base.
"""

from __future__ import annotations

import glob
import json
import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query, Request

from api import ssrf
from api.limites import HORA, ip_del_cliente
from api.metricas import metricas

logger = logging.getLogger("uvicorn.error")
router = APIRouter()

PRESUPUESTO_SEGUNDOS = 240      # lo que el recorrido se da a sí mismo
MARGEN_SSRF = 30                # y la red de seguridad de api/ssrf.py, un poco más
REUSO_HORAS = 12                # un sitio ya leído no se vuelve a leer antes
REINTENTO_ERROR_HORAS = 1       # un sitio que falló tampoco se martilla
MAX_EN_COLA = 4
MAX_TRABAJOS = 500              # memoria: se olvidan los más viejos ya terminados

_EJECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="proyectos-web")
_TRABAJOS: Dict[str, Dict[str, Any]] = {}
_LOCK = threading.Lock()


def habilitado() -> bool:
    valor = os.environ.get("EXTRAER_PROYECTOS_WEB", "").strip().lower()
    if valor in ("1", "true", "si", "sí", "on"):
        return True
    if valor in ("0", "false", "no", "off"):
        return False
    return bool(os.environ.get("RENDER")) or os.environ.get("ENTORNO", "").strip().lower() == "produccion"


def _clave(host: str) -> str:
    host = (host or "").lower()
    return host[4:] if host.startswith("www.") else host


def _olvidar_viejos() -> None:
    """Se llama con el candado tomado."""
    if len(_TRABAJOS) <= MAX_TRABAJOS:
        return
    terminados = sorted((t.get("terminado", 0), k) for k, t in _TRABAJOS.items()
                        if t.get("estado") in ("listo", "error"))
    for _, clave in terminados[: len(_TRABAJOS) - MAX_TRABAJOS]:
        _TRABAJOS.pop(clave, None)


def programar(url: Optional[str], origen: str) -> Optional[str]:
    """Pone en cola el recorrido del sitio y devuelve su estado. Nunca lanza.

    None si está apagado o el link no sirve; `en_cola`, `extrayendo` o `listo`
    si ya se está leyendo o se leyó hace poco; `ocupado` si la cola está llena.
    """
    if not url or not habilitado():
        return None
    try:
        from features.scrap_identity import scrap as identidad

        url = identidad._normalizar_url(url)
        ssrf.validar_url(url)
    except Exception:
        return None
    clave = _clave(urlparse(url).hostname)
    ahora = time.time()
    with _LOCK:
        previo = _TRABAJOS.get(clave)
        if previo:
            estado = previo.get("estado")
            if estado in ("en_cola", "extrayendo"):
                return estado
            edad = ahora - previo.get("terminado", 0)
            if estado == "listo" and edad < REUSO_HORAS * HORA:
                return estado
            if estado == "error" and edad < REINTENTO_ERROR_HORAS * HORA:
                return estado
        if sum(1 for t in _TRABAJOS.values() if t.get("estado") in ("en_cola", "extrayendo")) >= MAX_EN_COLA:
            logger.warning("proyectos web: cola llena, no se lee %s", clave)
            return "ocupado"
        _TRABAJOS[clave] = {"estado": "en_cola", "url": url, "origen": origen, "pedido": ahora}
        _olvidar_viejos()
    _EJECUTOR.submit(_correr, clave, url)
    return "en_cola"


def _correr(clave: str, url: str) -> None:
    from features.scrap_proyectos import scrap as proyectos

    with _LOCK:
        _TRABAJOS.setdefault(clave, {}).update(estado="extrayendo", empezado=time.time())
    ssrf.instalar()
    ssrf.empezar_presupuesto(PRESUPUESTO_SEGUNDOS + MARGEN_SSRF)
    try:
        r = proyectos.extraer_proyectos(url, guardar=True, presupuesto_s=PRESUPUESTO_SEGUNDOS)
        datos = {"estado": "listo", "terminado": time.time(), "empresa": r["empresa"],
                 "carpeta": r["carpeta"], "ruta_json": r.get("_ruta_json"),
                 "proyectos": r["total_proyectos"], "imagenes": r["total_imagenes"],
                 "incompleto": r["incompleto"]}
        logger.info("proyectos web: %s -> %d proyectos, %d fotos%s", clave, r["total_proyectos"],
                    r["total_imagenes"], " (incompleto)" if r["incompleto"] else "")
        metricas.registrar("proyectos_web", f"Proyectos leídos de {clave}: {r['total_proyectos']} "
                           f"· {r['total_imagenes']} fotos", "ok" if r["total_proyectos"] else "aviso")
    except Exception as exc:                  # sitio caído, bloqueado, sin proyectos legibles…
        datos = {"estado": "error", "terminado": time.time(), "error": str(exc)[:200]}
        logger.warning("proyectos web: falló %s: %s", clave, exc)
        metricas.registrar("proyectos_web", f"No se pudieron leer los proyectos de {clave}", "aviso")
    finally:
        ssrf.terminar_presupuesto()
    with _LOCK:
        _TRABAJOS.setdefault(clave, {}).update(datos)


def estado(host: str) -> Dict[str, Any]:
    with _LOCK:
        return dict(_TRABAJOS.get(_clave(host)) or {})


# ---------------------------------------------------------------------------
# Lectura del catálogo para el front
# ---------------------------------------------------------------------------

def _buscar_en_disco(clave: str) -> Optional[str]:
    """Después de un reinicio la memoria se pierde, pero el JSON sigue: se busca por dominio."""
    from Model.rutas import DIR_PROYECTOS_WEB

    for ruta in glob.glob(os.path.join(DIR_PROYECTOS_WEB, "*", "proyectos_*.json"))[:500]:
        try:
            with open(ruta, "r", encoding="utf-8") as fh:
                if _clave(json.load(fh).get("dominio")) == clave:
                    return ruta
        except (OSError, ValueError):
            continue
    return None


def catalogo_de(host: str) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """(catálogo, ruta del JSON) de la empresa de ese dominio, o (None, None) si no hay.

    Lo usan `/api/demo/proyectos` y el formulario personalizado (api/formulario_personalizado.py).
    """
    clave = _clave(host)
    ruta = estado(clave).get("ruta_json") or _buscar_en_disco(clave)
    if not ruta or not os.path.isfile(ruta):
        return None, None
    try:
        with open(ruta, "r", encoding="utf-8") as fh:
            return json.load(fh), ruta
    except (OSError, ValueError):
        return None, None


CAMPOS_PUBLICOS = (
    "id_proyecto", "nombre", "url", "tipo", "tipos", "subtipos", "segmento", "operacion",
    "estado_obra", "descripcion", "ciudad", "precio_desde_cop", "precio_es_canon", "area_m2",
    "habitaciones", "banos", "zonas_comunes", "colores_principales", "primario", "secundario", "acento",
)


def _publico(proyecto: Dict[str, Any]) -> Dict[str, Any]:
    fila = {k: proyecto.get(k) for k in CAMPOS_PUBLICOS}
    localidad = proyecto.get("localidad") or {}
    fila["localidad"] = localidad.get("nombre")
    fila["imagenes"] = [{k: i.get(k) for k in ("id", "origen", "ancho", "alto", "portada")}
                        for i in proyecto.get("imagenes") or []]
    return fila


@router.get("/api/demo/proyectos")
def proyectos_de_la_demo(request: Request, d: str = Query(..., max_length=2000)):
    from api import demo

    demo._tope(f"proyectos-ip:{ip_del_cliente(request)}", 60, HORA, "Demasiadas solicitudes. Intenta en {m} minutos.")
    datos = demo.verificar(d)
    if not datos:
        raise HTTPException(404, "Demo no válida o vencida.")
    trabajo = estado(datos.get("s"))
    catalogo, _ruta = catalogo_de(datos.get("s"))
    return {
        "estado": trabajo.get("estado") or ("listo" if catalogo else "sin_datos"),
        "empresa": (catalogo or {}).get("empresa") or trabajo.get("empresa"),
        "que_vende": (catalogo or {}).get("que_vende"),
        "incompleto": bool((catalogo or {}).get("incompleto")),
        "proyectos": [_publico(p) for p in (catalogo or {}).get("proyectos") or []],
    }
