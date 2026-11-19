"""
api/formulario_personalizado.py
===============================
La API del formulario personalizado: nos dan los datos del formulario de una
empresa (nombre, correo, link de su sitio, tipo) y devolvemos el DISEÑO
COMPLETO de su formulario, listo para que el front lo pinte.

    POST /api/formulario/personalizado          crea: marca + token + lectura de proyectos en cola
    GET  /api/formulario/personalizado?d=<t>    el diseño de ese token, ya con los proyectos si llegaron
    GET  /api/formulario/personalizado.js?d=<t> lo mismo como script: define window.GDF_MARCA y
                                                window.GDF_PROYECTOS, para el cargador de tenants
    GET  /api/formulario/imagen?d=<t>&p=<id>&i=<id>  una foto de un proyecto, servida por nosotros

Y una DEPENDENCIA de FastAPI, `formulario_de_la_demo`, que convierte un token en
el diseño (404 si no es nuestro o venció). Cualquier router nuevo la usa así:

    from fastapi import Depends
    from api.formulario_personalizado import formulario_de_la_demo

    @router.get("/api/lo-que-sea")
    def ruta(diseno: dict = Depends(formulario_de_la_demo)):
        ...

Piezas que reutiliza (no las duplica):
  * `api/demo.py`          marca desde el link (`extraer_marca`), el token firmado y sus topes.
  * `api/proyectos_web.py` la lectura de proyectos en segundo plano y el catálogo ya leído.
  * `features/formulario_personalizado` el armado del diseño (función pura).

El diseño visual lo hace Santiago Dias: la respuesta trae su espacio (`diseno`) con
los tokens sugeridos y las decisiones abiertas. Contrato:
features/formulario_personalizado/CONTRATO.md.

A diferencia de `/api/demo/solicitar`, aquí NO se manda correo: es la versión API.
El token es el mismo de la demo, así que `demo_url` abre el formulario de hoy ya
vestido con la marca.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from api import demo, proyectos_web, ssrf
from api.limites import DIA, HORA, entero_env, ip_del_cliente
from api.metricas import metricas

logger = logging.getLogger("uvicorn.error")
router = APIRouter()

TIPOS_IMAGEN = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "avif": "image/avif"}


class SolicitudFormulario(BaseModel):
    nombre: str
    correo: str
    sitio: str
    tipo: str = "inmobiliaria"
    empresa: Optional[str] = None
    color: Optional[str] = None              # "#rrggbb": manda sobre el detectado
    website: Optional[str] = None            # señuelo anti-bots, como en /api/demo/solicitar


# ---------------------------------------------------------------------------
# Del token al diseño
# ---------------------------------------------------------------------------

def _origen_api(request: Request) -> str:
    """https://<host de la API>. Detrás de Render o de un balanceador el esquema llega en X-Forwarded-Proto.

    Las URLs de fotos y logo van absolutas porque el formulario vive en otro dominio (www.machea.co).
    """
    esquema = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{esquema}://{host.split(',')[0].strip()}"


def marca_del_token(datos: Dict[str, Any]) -> Dict[str, Any]:
    colores = list(datos.get("c") or []) + [None, None]
    return {"nombre": datos.get("n"), "primario": colores[0], "acento": colores[1], "host": datos.get("s"),
            "fondo_logo": datos.get("lo"), "detectado": None}


def diseno_para(token: str, datos: Dict[str, Any], origen: str, estado_proyectos: Optional[str] = None,
                marca: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """El diseño de ese token: la marca firmada y el catálogo que ya se haya leído."""
    from features.formulario_personalizado import armar_formulario

    host = datos.get("s") or ""
    catalogo, _ruta = proyectos_web.catalogo_de(host)
    estado = estado_proyectos or proyectos_web.estado(host).get("estado")
    d = quote(token, safe="")

    def url_imagen(p: Dict[str, Any], imagen: Dict[str, Any]) -> str:
        if imagen.get("archivo") and p.get("id_proyecto") and imagen.get("id"):
            return f"{origen}/api/formulario/imagen?d={d}&p={p['id_proyecto']}&i={imagen['id']}"
        return imagen.get("origen") or ""

    logo = f"{origen}/api/marca/logo?d={d}" if (datos.get("li") or datos.get("l")) else ""
    diseno = armar_formulario(
        marca or marca_del_token(datos), tipo=datos.get("t") or "inmobiliaria", catalogo=catalogo,
        estado_proyectos=estado, token=token, logo_url=logo, url_imagen=url_imagen,
        demo_url=demo.url_demo(token),
    )
    diseno["consultar"] = {
        "json": f"{origen}/api/formulario/personalizado?d={d}",
        "js": f"{origen}/api/formulario/personalizado.js?d={d}",
    }
    return diseno


def formulario_de_la_demo(request: Request, d: str = Query(..., max_length=2000)) -> Dict[str, Any]:
    """Dependencia de FastAPI: token de la demo -> diseño completo. 404 si no es nuestro o venció."""
    demo._tope(f"formulario-ip:{ip_del_cliente(request)}", 240, HORA,
               "Demasiadas solicitudes. Intenta de nuevo en {m} minutos.")
    datos = demo.verificar(d)
    if not datos:
        raise HTTPException(404, "Formulario no válido o vencido.")
    return diseno_para(d, datos, _origen_api(request))


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/api/formulario/personalizado")
def crear_formulario(payload: SolicitudFormulario, request: Request):
    if payload.website:                       # bot: parece éxito y no se hace nada
        return {"ok": True, "estado": None}
    nombre = demo.limpiar_nombre_persona(payload.nombre)
    correo = (payload.correo or "").strip().lower()
    tipo = (payload.tipo or "").strip().lower()
    if len(nombre) < 2:
        raise HTTPException(400, "Escribe tu nombre.")
    if not demo.RE_CORREO.match(correo):
        raise HTTPException(400, "Ese correo no parece válido.")
    if tipo not in demo.TIPOS:
        raise HTTPException(400, "Elige si eres inmobiliaria o constructora.")
    if not (payload.sitio or "").strip():
        raise HTTPException(400, "Pega el link de tu sitio web.")

    ip = ip_del_cliente(request)
    demo._tope(f"formulario-crear-ip:{ip}", entero_env("DEMO_SOLICITUDES_POR_IP_HORA", 12), HORA,
               "Hay muchos formularios pedidos desde esta conexión. Intenta de nuevo en {m} minutos.")
    demo._tope(f"formulario-crear-correo:{correo}", 5, DIA, "Ya armamos varios formularios para este correo hoy.")
    demo._tope("formulario-crear-global", 60, HORA, "Hay muchas solicitudes ahora. Intenta de nuevo en {m} minutos.")

    try:
        marca = demo.extraer_marca(payload.sitio, payload.empresa, payload.color)
    except ssrf.UrlNoPermitida as exc:
        raise HTTPException(400, f"No pudimos usar ese link: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(400, "Ese link no parece válido. Pega la dirección de tu sitio web.") from exc

    token = demo.firmar(demo._datos_token(marca, tipo))
    estado = proyectos_web.programar(payload.sitio, "formulario_api")
    diseno = diseno_para(token, demo.verificar(token) or {}, _origen_api(request), estado, marca)
    logger.info("formulario personalizado: empresa=%s tipo=%s host=%s proyectos=%s", marca["nombre"], tipo,
                marca["host"], estado)
    metricas.registrar("formulario_api", f"Formulario personalizado: {marca['nombre']} · {tipo}",
                       "ok" if marca["detectado"] else "aviso")
    return {"ok": True, "token": token, **diseno}


@router.get("/api/formulario/personalizado")
def consultar_formulario(diseno: Dict[str, Any] = Depends(formulario_de_la_demo)):
    return diseno


def _json_en_script(valor: Any) -> str:
    """JSON que se puede meter en un <script> sin que un texto del sitio cierre la etiqueta."""
    return (json.dumps(valor, ensure_ascii=False)
            .replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


@router.get("/api/formulario/personalizado.js")
def formulario_como_script(diseno: Dict[str, Any] = Depends(formulario_de_la_demo)):
    """Lo mismo que el JSON, como los archivos de tenants/<slug>/: el cargador de index.html lo puede
    escribir con `document.write` en lugar de `tenants/machea/marca.js` y `proyectos.js`."""
    resto = {k: v for k, v in diseno.items() if k not in ("marca", "proyectos")}
    cuerpo = (
        f"// Formulario personalizado de {json.dumps(diseno['empresa']['nombre'], ensure_ascii=False)}"
        " (api/formulario_personalizado.py). Se genera en cada petición.\n"
        f"window.GDF_MARCA = {_json_en_script(diseno['marca'])};\n"
        f"window.GDF_PROYECTOS = {_json_en_script(diseno['proyectos'])};\n"
        "window.GDF_LOCALIDADES_VECINAS = window.GDF_LOCALIDADES_VECINAS || {};\n"
        f"window.GDF_FORMULARIO = {_json_en_script(resto)};\n"
    )
    return Response(content=cuerpo, media_type="application/javascript; charset=utf-8",
                    headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"})


@router.get("/api/formulario/imagen")
def imagen_de_proyecto(request: Request, d: str = Query(..., max_length=2000),
                       p: int = Query(..., ge=1, le=1000), i: str = Query(..., pattern=r"^\d{2,3}$")):
    demo._tope(f"formulario-imagen-ip:{ip_del_cliente(request)}", 1200, HORA,
               "Demasiadas solicitudes. Intenta de nuevo en {m} minutos.")
    datos = demo.verificar(d)
    if not datos:
        raise HTTPException(404, "Formulario no válido o vencido.")
    catalogo, ruta_json = proyectos_web.catalogo_de(datos.get("s") or "")
    if not catalogo or not ruta_json:
        raise HTTPException(404, "Sin proyectos.")
    proyecto = next((x for x in catalogo.get("proyectos") or [] if x.get("id_proyecto") == p), None)
    foto = next((x for x in (proyecto or {}).get("imagenes") or [] if x.get("id") == i and x.get("ruta")), None)
    if not foto:
        raise HTTPException(404, "Sin foto.")
    base = os.path.realpath(os.path.dirname(ruta_json))
    archivo = os.path.realpath(os.path.join(base, *str(foto["ruta"]).split("/")))
    extension = archivo.rsplit(".", 1)[-1].lower()
    # La ruta sale de un JSON nuestro, pero igual no se sirve nada fuera de la carpeta de esa empresa.
    if not archivo.startswith(base + os.sep) or extension not in TIPOS_IMAGEN or not os.path.isfile(archivo):
        raise HTTPException(404, "Sin foto.")
    return FileResponse(archivo, media_type=TIPOS_IMAGEN[extension],
                        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"})
