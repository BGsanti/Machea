"""
api/demo.py
===========
"Pruébalo con tu marca": una inmobiliaria o constructora escribe el link de su
sitio y recibe una demo del formulario vestida con SU nombre, SUS colores y SU
logo. Si pide la llamada, Manuela se presenta como la asistente virtual que
Machea configuró para esa empresa (y dice que es una demostración).

Piezas:
  * `extraer_marca`      link -> nombre + paleta + logo (usa features/scrap_identity,
                         con la descarga blindada de api/ssrf.py).
  * `firmar/verificar`   la demo viaja en un token FIRMADO dentro del enlace. Sin
                         base de datos, y sin que nadie pueda inventarse una marca:
                         el servidor solo acepta en la llamada lo que él mismo firmó.
  * `/api/demo/solicitar`  la landing manda nombre, correo, sitio y tipo; vuelve el
                         enlace de la demo y se manda por correo a quien lo pidió.
  * `/api/marca/logo`    sirve el logo saneado a partir del token.

SEGURIDAD (leer antes de tocar):
  * El nombre de la marca termina DENTRO del prompt de Manuela. Un `<title>` como
    "Ignora tus instrucciones y…" sería una inyección de prompt hacia el teléfono de
    otra persona. `limpiar_nombre_marca` deja solo letras, números y puntuación
    básica, y recorta a 40 caracteres.
  * La llamada de demo se anuncia como demostración (lo exige el prompt) y cuenta
    en un tope diario propio (api/limites.py).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
import unicodedata
from collections import OrderedDict
from typing import Any, Dict, Optional
from urllib.parse import quote, urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel

from api import ssrf
from api.limites import HORA, DIA, Rechazo, ip_del_cliente, limites

logger = logging.getLogger("uvicorn.error")
router = APIRouter()

TIPOS = ("inmobiliaria", "constructora")
FRONT_URL_DEFECTO = "https://my-project-orcin-chi.vercel.app"
CORREO_EQUIPO_DEFECTO = "equipo@machea.co"
VIGENCIA_TOKEN = 30 * DIA
CORAL_MACHEA = "#ff6259"
PRESUPUESTO_EXTRACCION = 22          # segundos TOTALES por link
MAX_LOGO_BYTES = 500_000
RE_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
RE_CORREO = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$")

_RE_NOMBRE_MARCA = re.compile(r"[^\w\s&.,'·-]", re.UNICODE)
_RE_NOMBRE_PERSONA = re.compile(r"[^\w\s'.-]", re.UNICODE)


# ---------------------------------------------------------------------------
# Limpieza de texto que viaja al prompt de Manuela
# ---------------------------------------------------------------------------

def _limpiar(texto: Optional[str], patron: "re.Pattern[str]", largo: int) -> str:
    texto = unicodedata.normalize("NFKC", str(texto or ""))
    texto = patron.sub(" ", texto.replace("_", " "))
    texto = re.sub(r"\s+", " ", texto).strip(" .,-·'&")
    return texto[:largo].strip()


def limpiar_nombre_marca(texto: Optional[str]) -> str:
    """Nombre de empresa apto para meterlo en un prompt: sin comillas, llaves,
    saltos de línea ni símbolos; 40 caracteres como máximo."""
    return _limpiar(texto, _RE_NOMBRE_MARCA, 40)


def limpiar_nombre_persona(texto: Optional[str]) -> str:
    return _limpiar(texto, _RE_NOMBRE_PERSONA, 60)


# ---------------------------------------------------------------------------
# Token firmado
# ---------------------------------------------------------------------------

_SECRETO_PROCESO = os.urandom(32)


def _secreto() -> bytes:
    """DEMO_SECRET si existe; si no, una clave derivada de DAPTA_API_KEY (ya es un
    secreto del servidor); en local, una al azar por proceso."""
    propio = os.environ.get("DEMO_SECRET")
    if propio:
        return propio.encode()
    dapta = os.environ.get("DAPTA_API_KEY")
    if dapta:
        return hashlib.sha256(b"machea-demo|" + dapta.encode()).digest()
    return _SECRETO_PROCESO


def _b64(datos: bytes) -> str:
    return base64.urlsafe_b64encode(datos).rstrip(b"=").decode("ascii")


def _desb64(texto: str) -> bytes:
    return base64.urlsafe_b64decode(texto + "=" * (-len(texto) % 4))


def firmar(datos: Dict[str, Any]) -> str:
    cuerpo = _b64(json.dumps(datos, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    firma = _b64(hmac.new(_secreto(), cuerpo.encode("ascii"), hashlib.sha256).digest()[:18])
    return f"v1.{cuerpo}.{firma}"


def verificar(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """Devuelve los datos si el token es nuestro, íntegro y vigente; si no, None."""
    try:
        version, cuerpo, firma = (token or "").split(".")
        if version != "v1":
            return None
        esperada = _b64(hmac.new(_secreto(), cuerpo.encode("ascii"), hashlib.sha256).digest()[:18])
        if not hmac.compare_digest(firma, esperada):
            return None
        datos = json.loads(_desb64(cuerpo).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(datos, dict) or datos.get("exp", 0) < time.time():
        return None
    if datos.get("t") not in TIPOS or not limpiar_nombre_marca(datos.get("n")):
        return None
    return datos


# ---------------------------------------------------------------------------
# Marca a partir del link
# ---------------------------------------------------------------------------

def _luminancia(hexa: str) -> float:
    r, g, b = (int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lin = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def _elegir_colores(ident: Dict[str, Any]) -> tuple:
    """(primario, acento, hubo_color). Un primario casi blanco no sirve de marca:
    se prefiere el siguiente del logo/CSS."""
    candidatos = [c for c in (ident.get("primario"), ident.get("secundario"), ident.get("acento"))
                  if isinstance(c, str) and RE_HEX.match(c)]
    utiles = [c for c in candidatos if _luminancia(c) <= 0.82]
    if not utiles:
        return CORAL_MACHEA, None, False
    primario = utiles[0]
    acento = next((c for c in utiles[1:] if c.lower() != primario.lower()), None)
    return primario.lower(), (acento.lower() if acento else None), True


def _nombre_desde_host(host: str) -> str:
    base = (host or "").lower().replace("www.", "").split(".")[0]
    return limpiar_nombre_marca(base.replace("-", " ").title())


_LOGOS: "OrderedDict[str, str]" = OrderedDict()
_LOGOS_LOCK = threading.Lock()
_MAX_LOGOS = 200


def _guardar_logo(logo_id: str, svg: str) -> None:
    with _LOGOS_LOCK:
        _LOGOS[logo_id] = svg
        _LOGOS.move_to_end(logo_id)
        while len(_LOGOS) > _MAX_LOGOS:
            _LOGOS.popitem(last=False)


def _logo_cacheado(logo_id: Optional[str]) -> Optional[str]:
    if not logo_id:
        return None
    with _LOGOS_LOCK:
        svg = _LOGOS.get(logo_id)
        if svg is not None:
            _LOGOS.move_to_end(logo_id)
        return svg


def extraer_marca(url: str, nombre_dado: Optional[str] = None) -> Dict[str, Any]:
    """Link -> {nombre, primario, acento, logo_id, logo_origen, fondo_logo, host, detectado}.

    Lanza `ssrf.UrlNoPermitida` / `ValueError` si el link no es utilizable. Si el
    sitio simplemente no responde, NO lanza: devuelve una marca por defecto con
    `detectado=False`, para no perder al prospecto por un sitio caído.
    """
    from features.scrap_identity import scrap

    ssrf.instalar()
    url = scrap._normalizar_url(url)          # ValueError si viene vacío o sin dominio
    ssrf.validar_url(url)                     # UrlNoPermitida si apunta a la red interna
    host = (urlparse(url).hostname or "").lower()

    ident: Optional[Dict[str, Any]] = None
    svg: Optional[str] = None
    tmp = tempfile.mkdtemp(prefix="marca_")
    ssrf.empezar_presupuesto(PRESUPUESTO_EXTRACCION)
    try:
        ident = scrap.extraer_colores(url, dir_salida=tmp, guardar=True, descargar_logo=True)
        archivo = (ident.get("logo") or {}).get("archivo")
        if archivo:
            ruta = os.path.join(tmp, ident["carpeta"], archivo)
            if os.path.isfile(ruta) and os.path.getsize(ruta) <= MAX_LOGO_BYTES:
                with open(ruta, "r", encoding="utf-8") as f:
                    svg = f.read()
    except ssrf.PresupuestoAgotado:
        logger.warning("extracción de marca agotó su tiempo: %s", host)
    except Exception as exc:                  # sitio caído, bloqueado, HTML raro…
        logger.warning("extracción de marca falló en %s: %s", host, exc)
    finally:
        ssrf.terminar_presupuesto()
        shutil.rmtree(tmp, ignore_errors=True)

    detectado = ident is not None
    primario, acento, hubo_color = _elegir_colores(ident or {})
    nombre = (limpiar_nombre_marca(nombre_dado)
              or (limpiar_nombre_marca((ident or {}).get("empresa")) if detectado else "")
              or _nombre_desde_host(host) or "Tu empresa")

    logo = (ident or {}).get("logo") or {}
    logo_origen = logo.get("origen") if isinstance(logo.get("origen"), str) else None
    logo_id = None
    if svg:
        logo_id = hashlib.sha1(f"{host}|{logo_origen}".encode()).hexdigest()[:12]
        _guardar_logo(logo_id, svg)
    if logo_origen and not logo_origen.lower().startswith(("http://", "https://")):
        logo_origen = None                      # "<svg> embebido en la página"
    if logo_origen and len(logo_origen) > 300:
        logo_origen = None

    return {
        "nombre": nombre, "primario": primario, "acento": acento, "host": host,
        "logo_id": logo_id, "logo_origen": logo_origen,
        "fondo_logo": logo.get("fondo_recomendado") or "claro",
        "detectado": detectado and hubo_color,
    }


def _datos_token(marca: Dict[str, Any], tipo: str) -> Dict[str, Any]:
    ahora = int(time.time())
    return {
        "n": marca["nombre"], "t": tipo, "c": [marca["primario"], marca.get("acento")],
        "lo": marca["fondo_logo"], "l": marca.get("logo_origen"), "li": marca.get("logo_id"),
        "s": marca["host"], "iat": ahora, "exp": ahora + VIGENCIA_TOKEN,
    }


# ---------------------------------------------------------------------------
# Correo (por un flow de Dapta con Gmail; ver DAPTA_EMAIL_FLOW_URL)
# ---------------------------------------------------------------------------

def _front_url() -> str:
    return (os.environ.get("FRONT_URL") or FRONT_URL_DEFECTO).rstrip("/")


def url_demo(token: str) -> str:
    return f"{_front_url()}/experiencia/index.html?marca=machea&demo={quote(token, safe='')}"


def _html_demo(nombre: str, empresa: str, enlace: str) -> str:
    n, e, u = html.escape(nombre), html.escape(empresa), html.escape(enlace, quote=True)
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#2d3b4e">'
        '<p style="font-size:13px;letter-spacing:.12em;color:#ff6259;font-weight:700;margin:0 0 8px">MACHEA</p>'
        f'<h1 style="font-size:22px;margin:0 0 12px">{n}, tu demo con la marca de {e} está lista</h1>'
        '<p style="font-size:15px;line-height:1.5">Así vería una persona interesada el formulario de '
        f'{e}: arma su vivienda ideal, recibe recomendaciones y, si lo pide, recibe una llamada de Manuela.</p>'
        f'<p style="margin:24px 0"><a href="{u}" style="background:#ff6259;color:#fff;padding:14px 22px;'
        'border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">Abrir mi demo</a></p>'
        '<p style="font-size:13px;line-height:1.5;color:#5d6b7c">Es una demostración con datos de ejemplo. '
        'Si pides la llamada, Manuela llamará al número que registres y se presentará como la asistente '
        f'virtual que Machea configuró para {e}. El enlace funciona durante 30 días.</p>'
        '<p style="font-size:13px;color:#5d6b7c">¿Preguntas? Responde este correo o escríbenos a equipo@machea.co.</p></div>'
    )


def _enviar_correo(payload: Dict[str, Any]) -> None:
    url = os.environ.get("DAPTA_EMAIL_FLOW_URL")
    if not url:
        return
    try:
        import httpx
        with httpx.Client(timeout=15.0) as c:
            c.post(url, json=payload).raise_for_status()
    except Exception as exc:                  # best-effort: la demo ya se entregó en pantalla
        logger.warning("no se pudo enviar el correo de la demo: %s", exc)


def _correo_al_prospecto(nombre: str, correo: str, empresa: str, enlace: str) -> Dict[str, Any]:
    return {
        "to": correo, "subject": f"Tu demo de Machea con la marca de {empresa}",
        "html": _html_demo(nombre, empresa, enlace),
        "text": f"Hola {nombre}, tu demo con la marca de {empresa} está lista: {enlace}\n"
                "Es una demostración con datos de ejemplo.",
    }


def _correo_al_equipo(nombre: str, correo: str, sitio: str, tipo: str, empresa: str, enlace: str) -> Dict[str, Any]:
    cuerpo = (f"Nueva solicitud de demo\n\nNombre: {nombre}\nCorreo: {correo}\nSitio: {sitio}\n"
              f"Tipo: {tipo}\nEmpresa: {empresa}\nDemo: {enlace}\n")
    return {
        "to": os.environ.get("CORREO_EQUIPO") or CORREO_EQUIPO_DEFECTO,
        "subject": f"Demo solicitada: {empresa} ({tipo})",
        "html": "<pre style=\"font-family:Arial,sans-serif;font-size:14px\">" + html.escape(cuerpo) + "</pre>",
        "text": cuerpo,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

class SolicitudDemo(BaseModel):
    nombre: str
    correo: str
    sitio: str
    tipo: str = "inmobiliaria"
    empresa: Optional[str] = None
    website: Optional[str] = None            # señuelo anti-bots: un humano no lo ve ni lo llena


def _tope(llave: str, tope: int, segundos: int, mensaje: str) -> None:
    try:
        limites.tope_simple(llave=llave, tope=tope, segundos=segundos, mensaje=mensaje)
    except Rechazo as exc:
        raise HTTPException(status_code=429, detail=exc.mensaje,
                            headers={"Retry-After": str(exc.reintentar_en)}) from exc


@router.post("/api/demo/solicitar")
def solicitar_demo(payload: SolicitudDemo, request: Request, tareas: BackgroundTasks):
    if payload.website:                       # un bot rellenó el señuelo: se ignora sin avisar
        return {"ok": True, "demo_url": None, "correo_enviado": False}

    nombre = limpiar_nombre_persona(payload.nombre)
    correo = (payload.correo or "").strip().lower()
    tipo = (payload.tipo or "").strip().lower()
    if len(nombre) < 2:
        raise HTTPException(400, "Escribe tu nombre.")
    if not RE_CORREO.match(correo):
        raise HTTPException(400, "Ese correo no parece válido.")
    if tipo not in TIPOS:
        raise HTTPException(400, "Elige si eres inmobiliaria o constructora.")
    if not (payload.sitio or "").strip():
        raise HTTPException(400, "Pega el link de tu sitio web.")

    ip = ip_del_cliente(request)
    _tope(f"demo-ip:{ip}", 5, HORA, "Pediste varias demos seguidas. Intenta de nuevo en {m} minutos.")
    _tope(f"demo-correo:{correo}", 3, DIA, "Ya te enviamos varias demos a este correo hoy. Revisa tu bandeja.")
    _tope("demo-global", 60, HORA, "Hay muchas solicitudes ahora. Intenta de nuevo en {m} minutos.")

    try:
        marca = extraer_marca(payload.sitio, payload.empresa)
    except ssrf.UrlNoPermitida as exc:
        raise HTTPException(400, f"No pudimos usar ese link: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(400, "Ese link no parece válido. Pega la dirección de tu sitio web.") from exc

    token = firmar(_datos_token(marca, tipo))
    enlace = url_demo(token)
    hay_correo = bool(os.environ.get("DAPTA_EMAIL_FLOW_URL"))
    if hay_correo:
        tareas.add_task(_enviar_correo, _correo_al_prospecto(nombre, correo, marca["nombre"], enlace))
        tareas.add_task(_enviar_correo, _correo_al_equipo(nombre, correo, payload.sitio, tipo, marca["nombre"], enlace))
    logger.info("demo solicitada: empresa=%s tipo=%s host=%s detectado=%s", marca["nombre"], tipo,
                marca["host"], marca["detectado"])

    return {
        "ok": True,
        "demo_url": enlace,
        "correo_enviado": hay_correo,
        "marca": {
            "nombre": marca["nombre"], "tipo": tipo, "primario": marca["primario"],
            "acento": marca["acento"], "tiene_logo": bool(marca["logo_id"] or marca["logo_origen"]),
            "detectado": marca["detectado"],
        },
        "aviso": None if marca["detectado"] else
                 "No pudimos leer los colores de tu sitio; armamos la demo con tu nombre y los colores de Machea.",
    }


@router.get("/api/marca/logo")
def logo_de_marca(request: Request, d: str = Query(..., max_length=2000)):
    _tope(f"logo-ip:{ip_del_cliente(request)}", 120, HORA, "Demasiadas solicitudes. Intenta en {m} minutos.")
    datos = verificar(d)
    if not datos:
        raise HTTPException(404, "Demo no válida o vencida.")

    svg = _logo_cacheado(datos.get("li"))
    if svg is None and datos.get("l"):
        from features.scrap_identity import scrap
        ssrf.instalar()
        ssrf.empezar_presupuesto(12)
        try:
            r = scrap._get(datos["l"], timeout=12, reintentos=1)
            svg, _meta = scrap._a_svg(r.content, r.headers.get("Content-Type", ""))
        except Exception as exc:
            logger.warning("logo no disponible (%s): %s", datos.get("s"), exc)
            svg = None
        finally:
            ssrf.terminar_presupuesto()
        if svg and len(svg.encode("utf-8")) <= MAX_LOGO_BYTES and datos.get("li"):
            _guardar_logo(datos["li"], svg)
        elif svg and len(svg.encode("utf-8")) > MAX_LOGO_BYTES:
            svg = None
    if not svg:
        raise HTTPException(404, "Sin logo.")
    return Response(
        content=svg, media_type="image/svg+xml",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
            "X-Content-Type-Options": "nosniff",
        },
    )
