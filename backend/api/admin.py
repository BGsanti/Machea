"""
api/admin.py
============
Panel de administración de Machea: el estado en vivo de cada pieza (backend, front, base de
datos, Dapta, correo, IA, nube) y de la actividad. El panel en sí es la página estática
`frontend/public/admin/`; aquí vive todo lo que NO puede estar en el navegador: el acceso y
las comprobaciones.

    POST /api/admin/login           clave (+ código TOTP si está activado)  ->  token de sesión
    POST /api/admin/logout          revoca el token
    GET  /api/admin/estado          todo el estado, en un solo JSON (el panel lo lee cada 10 s)
    POST /api/admin/probar-correo   inicia sesión en el SMTP SIN enviar nada

SEGURIDAD (el panel enseña la salud del negocio; el acceso se cuida como tal):
  * APAGADO por defecto. Sin `ADMIN_PASSWORD` (mínimo 16 caracteres) todas las rutas responden
    404, como si no existieran. Una clave corta cuenta como ausente.
  * La clave se compara en tiempo constante. Cinco fallos desde una misma IP en 15 minutos
    bloquean esa IP (429); todos los fallos devuelven el MISMO mensaje, sin decir qué falló.
  * Segundo factor opcional (`ADMIN_TOTP_SECRET`, base32): código de 6 dígitos de una app de
    autenticación (RFC 6238, ventana ±30 s, sin reutilizar el mismo código).
  * Sesión = token firmado (HMAC-SHA256) de 60 min (`ADMIN_SESION_MINUTOS`), enviado en
    `Authorization: Bearer`, nunca en una cookie: no hay CSRF. La llave sale de la clave
    (PBKDF2) o de `ADMIN_SECRET`; cambiar la clave invalida todas las sesiones. Salir revoca.
  * NUNCA se devuelve el valor de ninguna variable, ni una clave, ni un dato de un lead: solo
    "configurada sí/no", estados, tiempos y teléfonos/IPs enmascarados.
  * Las rutas no salen en `/docs` ni en `/openapi.json`, y toda respuesta es `no-store`.
  * Cada acceso (bueno o malo) queda anotado, enmascarado, y se ve en el panel.
"""

from __future__ import annotations

import base64
import concurrent.futures
import functools
import hashlib
import hmac
import json
import logging
import math
import os
import platform
import secrets
import struct
import threading
import time
from collections import deque
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from api import correo as correo_mod
from api import demo as demo_mod
from api.limites import Rechazo, ip_del_cliente, limites
from api.metricas import enmascarar_ip, metricas

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/admin", include_in_schema=False)

CLAVE_MINIMA = 16
_PAUSA_FALLO = 0.35                # segundos que se hace esperar a quien falla (frena la fuerza bruta)
_PREFIJO_TOKEN = "a1"

# Estados de un servicio, de mejor a peor (los dos últimos no cuentan como "caído").
OK, DEGRADADO, CAIDO, DESCONOCIDO, SIN_CONFIGURAR = "ok", "degradado", "caido", "desconocido", "sin_configurar"
_GRAVEDAD = {OK: 0, SIN_CONFIGURAR: 0, DESCONOCIDO: 1, DEGRADADO: 2, CAIDO: 3}

# Una llamada de un minuto gasta ~666 créditos de Dapta (medido en llamadas reales).
CREDITOS_POR_MINUTO = 666

SUPABASE_URL_DEFECTO = "https://ndfsrstnzttbmcxukixw.supabase.co"
DAPTA_MCP_URL_DEFECTO = "https://mcp.dapta.ai/mcp"

# Páginas de estado públicas (formato Atlassian Statuspage, sin clave).
PROVEEDORES = [
    ("render", "Render", "https://status.render.com/api/v2/status.json", "https://status.render.com"),
    ("vercel", "Vercel", "https://www.vercel-status.com/api/v2/status.json", "https://www.vercel-status.com"),
    ("supabase", "Supabase", "https://status.supabase.com/api/v2/status.json", "https://status.supabase.com"),
    ("cloudflare", "Cloudflare", "https://www.cloudflarestatus.com/api/v2/status.json", "https://www.cloudflarestatus.com"),
]

# Variables que el panel revisa (solo si existen, nunca su valor): (nombre, requisito, para qué).
VARIABLES = [
    ("DAPTA_FLOW_WEBHOOK_URL", "obligatoria", "Dispara la llamada de Manuela"),
    ("DAPTA_API_KEY", "obligatoria", "Autoriza el flow y consulta la cuenta de Dapta"),
    ("ADMIN_PASSWORD", "obligatoria", "Acceso a este panel"),
    ("FRONT_URL", "recomendada", "Origen del front para los enlaces de demo"),
    ("DEMO_SECRET", "recomendada", "Firma de los enlaces de demo (si falta, se deriva de DAPTA_API_KEY)"),
    ("SUPABASE_ANON_KEY", "recomendada", "Permite probar la base de datos desde el panel"),
    ("ADMIN_TOTP_SECRET", "recomendada", "Segundo factor (código de app de autenticación) para entrar al panel"),
    ("SMTP_USER", "opcional", "Cuenta de Gmail que envía los correos de la demo"),
    ("SMTP_PASSWORD", "opcional", "Contraseña de aplicación de esa cuenta"),
    ("CORREO_EQUIPO", "opcional", "A dónde avisa cada demo solicitada"),
    ("DAPTA_WHATSAPP_FLOW_URL", "opcional", "Seguimiento por WhatsApp tras una llamada no lograda"),
    ("LIMITE_TELEFONOS_EXENTOS", "opcional", "Teléfonos del equipo que no se topan (pruebas)"),
    ("ANTHROPIC_API_KEY", "opcional", "Comprueba la conexión con Claude si Machea llega a usarlo"),
    ("OPENAI_API_KEY", "opcional", "Comprueba la conexión con OpenAI si Machea llega a usarlo"),
]


# ---------------------------------------------------------------------------
# Acceso
# ---------------------------------------------------------------------------

def _clave() -> Optional[str]:
    c = os.environ.get("ADMIN_PASSWORD") or ""
    return c if len(c) >= CLAVE_MINIMA else None


def _totp_secreto() -> Optional[bytes]:
    """Secreto del segundo factor, o None si no está activado. Lanza ValueError si es inválido."""
    crudo = (os.environ.get("ADMIN_TOTP_SECRET") or "").strip().replace(" ", "").upper()
    if not crudo:
        return None
    try:
        return base64.b32decode(crudo + "=" * (-len(crudo) % 8))
    except Exception as exc:
        raise ValueError("ADMIN_TOTP_SECRET no es base32 válido") from exc


def habilitado() -> bool:
    """El panel existe solo con una clave larga y, si hay segundo factor, bien escrito (falla cerrado)."""
    if _clave() is None:
        return False
    try:
        _totp_secreto()
    except ValueError:
        logger.error("panel de administración apagado: ADMIN_TOTP_SECRET no es base32 válido")
        return False
    return True


def _igual(a: str, b: str) -> bool:
    return hmac.compare_digest(hashlib.sha256(a.encode()).digest(), hashlib.sha256(b.encode()).digest())


@functools.lru_cache(maxsize=4)
def _derivar(clave: str, extra: str) -> bytes:
    # PBKDF2: si alguien consigue un token no puede probar claves a toda velocidad contra él.
    return hashlib.pbkdf2_hmac("sha256", clave.encode(), b"machea-admin-sesion-v1|" + extra.encode(), 200_000)


def _llave() -> bytes:
    secreto = os.environ.get("ADMIN_SECRET") or ""
    if len(secreto) >= 32:
        return hashlib.sha256(secreto.encode()).digest()
    return _derivar(_clave() or "", os.environ.get("ADMIN_TOTP_SECRET") or "")


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _minutos_sesion() -> int:
    try:
        m = int(os.environ.get("ADMIN_SESION_MINUTOS", "60"))
    except ValueError:
        m = 60
    return max(5, min(m, 480))


_REVOCADOS: Dict[str, float] = {}           # jti -> vencimiento
_REVOCADOS_LOCK = threading.Lock()


def emitir_token() -> Tuple[str, int]:
    ahora = int(time.time())
    exp = ahora + _minutos_sesion() * 60
    cuerpo = _b64(json.dumps({"iat": ahora, "exp": exp, "jti": secrets.token_urlsafe(9)}, separators=(",", ":")).encode())
    firma = _b64(hmac.new(_llave(), f"{_PREFIJO_TOKEN}.{cuerpo}".encode(), hashlib.sha256).digest())
    return f"{_PREFIJO_TOKEN}.{cuerpo}.{firma}", exp


def verificar_token(token: str) -> Optional[Dict[str, Any]]:
    """Los datos del token si la firma es buena, no venció y no se revocó; si no, None."""
    try:
        partes = (token or "").split(".")
        if len(partes) != 3 or partes[0] != _PREFIJO_TOKEN or len(token) > 600:
            return None
        esperada = hmac.new(_llave(), f"{partes[0]}.{partes[1]}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(esperada, _b64d(partes[2])):
            return None
        datos = json.loads(_b64d(partes[1]))
        ahora = time.time()
        if not isinstance(datos, dict) or float(datos.get("exp", 0)) <= ahora:
            return None
        with _REVOCADOS_LOCK:
            for jti in [j for j, v in _REVOCADOS.items() if v <= ahora]:
                del _REVOCADOS[jti]
            if datos.get("jti") in _REVOCADOS:
                return None
        return datos
    except Exception:
        return None


def revocar(datos: Dict[str, Any]) -> None:
    with _REVOCADOS_LOCK:
        _REVOCADOS[str(datos.get("jti"))] = float(datos.get("exp", time.time()))


# -- segundo factor (RFC 6238) ----------------------------------------------

_ultimo_contador_totp = 0
_TOTP_LOCK = threading.Lock()


def _codigo_totp(secreto: bytes, contador: int) -> str:
    h = hmac.new(secreto, struct.pack(">Q", contador), hashlib.sha1).digest()
    o = h[-1] & 0x0F
    return f"{(struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000:06d}"


def verificar_totp(codigo: str, secreto: bytes) -> bool:
    """Acepta el código del paso actual, el anterior o el siguiente, y nunca el mismo dos veces."""
    global _ultimo_contador_totp
    codigo = "".join(c for c in (codigo or "") if c.isdigit())
    if len(codigo) != 6:
        return False
    actual = int(time.time() // 30)
    with _TOTP_LOCK:
        for contador in (actual - 1, actual, actual + 1):
            if contador > _ultimo_contador_totp and hmac.compare_digest(_codigo_totp(secreto, contador), codigo):
                _ultimo_contador_totp = contador
                return True
    return False


# -- freno a la fuerza bruta ---------------------------------------------------

class _Cerrojo:
    VENTANA = 900          # 15 min
    MAX_FALLOS = 5         # por IP
    MAX_INTENTOS = 30      # por IP, buenos o malos

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._fallos: Dict[str, Deque[float]] = {}
        self._intentos: Dict[str, Deque[float]] = {}

    @staticmethod
    def _podar(v: Deque[float], ahora: float) -> None:
        while v and ahora - v[0] >= _Cerrojo.VENTANA:
            v.popleft()

    def _compactar(self) -> None:
        for d in (self._fallos, self._intentos):
            if len(d) > 2000:
                for k in [k for k, v in d.items() if not v]:
                    del d[k]

    def espera(self, ip: str) -> int:
        """Segundos que debe esperar esta IP (0 = puede intentar). Cuenta el intento."""
        ahora = time.time()
        with self._lock:
            self._compactar()
            f = self._fallos.setdefault(ip, deque())
            i = self._intentos.setdefault(ip, deque())
            self._podar(f, ahora)
            self._podar(i, ahora)
            if len(f) >= self.MAX_FALLOS:
                return max(1, math.ceil(self.VENTANA - (ahora - f[0])))
            if len(i) >= self.MAX_INTENTOS:
                return max(1, math.ceil(self.VENTANA - (ahora - i[0])))
            i.append(ahora)
            return 0

    def fallo(self, ip: str) -> None:
        with self._lock:
            self._fallos.setdefault(ip, deque()).append(time.time())

    def limpiar(self, ip: str) -> None:
        with self._lock:
            self._fallos.pop(ip, None)

    def reiniciar(self) -> None:
        with self._lock:
            self._fallos.clear()
            self._intentos.clear()


cerrojo = _Cerrojo()


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"


def exigir(request: Request, response: Response) -> Dict[str, Any]:
    """Dependencia: deja pasar solo con un token válido."""
    if not habilitado():
        raise HTTPException(404, "No disponible")
    _no_store(response)
    auth = request.headers.get("authorization") or ""
    datos = verificar_token(auth[7:].strip()) if auth[:7].lower() == "bearer " else None
    if not datos:
        raise HTTPException(401, "Sesión vencida. Vuelve a entrar.")
    try:
        limites.tope_simple(llave=f"admin-api:{ip_del_cliente(request)}", tope=120, segundos=60,
                            mensaje="Demasiadas consultas. Espera {m} min.")
    except Rechazo as exc:
        raise HTTPException(429, exc.mensaje, headers={"Retry-After": str(exc.reintentar_en)}) from exc
    return datos


class EntradaLogin(BaseModel):
    clave: str = Field(max_length=200)
    codigo: Optional[str] = Field(default=None, max_length=12)


@router.post("/login")
def login(datos: EntradaLogin, request: Request, response: Response):
    if not habilitado():
        raise HTTPException(404, "No disponible")
    _no_store(response)
    ip = ip_del_cliente(request)
    espera = cerrojo.espera(ip)
    if espera:
        raise HTTPException(429, f"Demasiados intentos. Intenta de nuevo en {max(1, math.ceil(espera / 60))} minutos.",
                            headers={"Retry-After": str(espera)})

    clave_ok = _igual(datos.clave, _clave() or "")
    secreto = _totp_secreto()
    if clave_ok and secreto is not None:
        if not (datos.codigo or "").strip():
            # La clave es buena y falta el segundo factor: se pide, sin contarlo como fallo.
            return JSONResponse(status_code=401, headers={"Cache-Control": "no-store"},
                                content={"detail": "Escribe el código de tu app de autenticación.", "requiere_codigo": True})
        clave_ok = verificar_totp(datos.codigo or "", secreto)

    if not clave_ok:
        cerrojo.fallo(ip)
        metricas.registrar("admin_login_fallido", f"Intento fallido desde {enmascarar_ip(ip)}", "aviso")
        time.sleep(_PAUSA_FALLO)
        raise HTTPException(401, "Credenciales incorrectas.")

    cerrojo.limpiar(ip)
    token, exp = emitir_token()
    metricas.registrar("admin_login_ok", f"Acceso desde {enmascarar_ip(ip)}", "ok")
    return {"token": token, "expira": exp}


@router.post("/logout")
def logout(sesion: Dict[str, Any] = Depends(exigir)):
    revocar(sesion)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Comprobaciones
# ---------------------------------------------------------------------------

_TRANSPORTE: Optional[httpx.BaseTransport] = None     # las pruebas inyectan uno falso


def _cliente(timeout: float = 6.0) -> httpx.Client:
    return httpx.Client(timeout=httpx.Timeout(timeout, connect=4.0), follow_redirects=False, transport=_TRANSPORTE,
                        headers={"User-Agent": "machea-panel/1"})


def _res(id_: str, nombre: str, grupo: str, estado: str, detalle: str, ms: Optional[int] = None, **meta: Any) -> Dict[str, Any]:
    return {"id": id_, "nombre": nombre, "grupo": grupo, "estado": estado, "detalle": detalle, "ms": ms,
            "meta": meta, "chequeado": time.time()}


def _ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


def _rss_mb() -> Optional[float]:
    try:
        with open("/proc/self/status", encoding="utf-8") as f:
            for linea in f:
                if linea.startswith("VmRSS:"):
                    return round(int(linea.split()[1]) / 1024, 1)
    except OSError:
        pass
    return None


def _chk_backend() -> Dict[str, Any]:
    meta = {
        "activo_s": metricas.segundos_activo(),
        "commit": (os.environ.get("RENDER_GIT_COMMIT") or "")[:7] or None,
        "servicio": os.environ.get("RENDER_SERVICE_NAME"),
        "python": platform.python_version(),
        "hilos": threading.active_count(),
        "memoria_mb": _rss_mb(),
    }
    return _res("backend", "API de Machea", "app", OK, "En línea y respondiendo.", 0, **meta)


def _chk_front() -> Dict[str, Any]:
    url = demo_mod._front_url()
    t0 = time.perf_counter()
    with _cliente() as c:
        r = c.get(url + "/", headers={"Accept": "text/html"})
    ms = _ms(t0)
    region = (r.headers.get("x-vercel-id") or "").split("::")[0] or None
    meta = {"http": r.status_code, "region": region, "host": urlparse(url).hostname}
    if r.status_code >= 500:
        return _res("front", "Sitio web (Vercel)", "app", CAIDO, f"Responde con error {r.status_code}.", ms, **meta)
    if r.status_code >= 400:
        return _res("front", "Sitio web (Vercel)", "app", DEGRADADO, f"Responde {r.status_code}.", ms, **meta)
    if ms > 2500:
        return _res("front", "Sitio web (Vercel)", "app", DEGRADADO, "Responde, pero lento.", ms, **meta)
    return _res("front", "Sitio web (Vercel)", "app", OK, "La landing y el formulario cargan.", ms, **meta)


def _chk_supabase() -> Dict[str, Any]:
    base = (os.environ.get("SUPABASE_URL") or SUPABASE_URL_DEFECTO).rstrip("/")
    clave = os.environ.get("SUPABASE_ANON_KEY") or ""
    meta = {"host": urlparse(base).hostname, "prueba": "completa" if clave else "solo servicio"}
    t0 = time.perf_counter()
    with _cliente() as c:
        if clave:
            # Consulta de verdad por la misma puerta que usa el formulario (clave anónima + función),
            # con un teléfono que no existe: debe contestar 200 y una lista vacía.
            r = c.post(f"{base}/rest/v1/rpc/buscar_resultados",
                       headers={"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"},
                       json={"p_telefono": "0000000000", "p_correo": "salud@machea.invalid"})
        else:
            r = c.get(f"{base}/auth/v1/health")
    ms = _ms(t0)
    if r.status_code >= 500:
        return _res("supabase", "Base de datos (Supabase)", "datos", CAIDO, f"Supabase responde {r.status_code}.", ms, **meta)
    if clave:
        if r.status_code == 200:
            return _res("supabase", "Base de datos (Supabase)", "datos", OK if ms <= 2500 else DEGRADADO,
                        "Consulta de prueba correcta." if ms <= 2500 else "Consulta correcta, pero lenta.", ms, **meta)
        if r.status_code in (401, 403):
            return _res("supabase", "Base de datos (Supabase)", "datos", CAIDO, "La clave anónima no es válida.", ms, **meta)
        if r.status_code == 404:
            return _res("supabase", "Base de datos (Supabase)", "datos", CAIDO,
                        "Falta la función buscar_resultados: hay que aplicar las migraciones.", ms, **meta)
        return _res("supabase", "Base de datos (Supabase)", "datos", DEGRADADO, f"Respuesta inesperada ({r.status_code}).", ms, **meta)
    return _res("supabase", "Base de datos (Supabase)", "datos", OK,
                "El servicio responde. Agrega SUPABASE_ANON_KEY en Render para probar también las consultas.", ms, **meta)


def _json_de_respuesta(r: httpx.Response) -> Dict[str, Any]:
    if "text/event-stream" in (r.headers.get("content-type") or ""):
        ultimo: Dict[str, Any] = {}
        for linea in r.text.splitlines():
            if linea.startswith("data:"):
                try:
                    ultimo = json.loads(linea[5:].strip())
                except ValueError:
                    pass
        return ultimo
    return r.json() if r.content else {}


def _herramienta_mcp(c: httpx.Client, url: str, h: Dict[str, str], id_: int, nombre: str) -> Dict[str, Any]:
    r = c.post(url, headers=h, json={"jsonrpc": "2.0", "id": id_, "method": "tools/call",
                                     "params": {"name": nombre, "arguments": {}}})
    r.raise_for_status()
    resultado = (_json_de_respuesta(r).get("result") or {})
    if isinstance(resultado.get("structuredContent"), dict):
        return resultado["structuredContent"]
    for bloque in resultado.get("content") or []:
        if isinstance(bloque, dict) and bloque.get("type") == "text":
            try:
                datos = json.loads(bloque.get("text") or "")
                return datos if isinstance(datos, dict) else {}
            except ValueError:
                continue
    return {}


def _chk_dapta_api() -> Dict[str, Any]:
    clave = os.environ.get("DAPTA_API_KEY")
    if not clave:
        return _res("dapta_api", "Cuenta de Dapta", "voz", SIN_CONFIGURAR, "Falta DAPTA_API_KEY en Render.")
    url = os.environ.get("DAPTA_MCP_URL") or DAPTA_MCP_URL_DEFECTO
    h = {"x-api-key": clave, "Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
    t0 = time.perf_counter()
    with _cliente(8.0) as c:
        r = c.post(url, headers=h, json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "machea-panel", "version": "1"}}})
        if r.status_code in (401, 403):
            return _res("dapta_api", "Cuenta de Dapta", "voz", DEGRADADO,
                        "La clave no permite consultar la cuenta (créditos). El flow puede seguir funcionando.", _ms(t0))
        r.raise_for_status()
        sesion = r.headers.get("mcp-session-id")
        if sesion:
            h["mcp-session-id"] = sesion
        try:
            c.post(url, headers=h, json={"jsonrpc": "2.0", "method": "notifications/initialized"})
        except httpx.HTTPError:
            pass
        quien = _herramienta_mcp(c, url, h, 2, "whoami")
        saldo = _herramienta_mcp(c, url, h, 3, "get_my_balance")
    ms = _ms(t0)

    taller = ((quien.get("workspace") or {}).get("id") or "")[:8] or None
    datos = ((saldo.get("balance") or {}).get("data")) or {}
    plan = (datos.get("plan") or {}).get("name")
    disponibles = datos.get("available_credits_ledger")
    if not isinstance(disponibles, (int, float)):
        cap, gastados = datos.get("credits_capacity"), (datos.get("usage") or {}).get("credits")
        disponibles = cap - gastados if isinstance(cap, (int, float)) and isinstance(gastados, (int, float)) else None
    meta = {"workspace": taller, "plan": plan, "creditos": disponibles, "puede_escribir": quien.get("can_write")}
    if disponibles is None:
        return _res("dapta_api", "Cuenta de Dapta", "voz", OK, "Cuenta conectada (no se pudo leer el saldo).", ms, **meta)
    minutos = int(disponibles // CREDITOS_POR_MINUTO) if disponibles > 0 else 0
    meta["minutos_aprox"] = minutos
    if disponibles <= 0:
        return _res("dapta_api", "Cuenta de Dapta", "voz", CAIDO, "Sin créditos: las llamadas no saldrán.", ms, **meta)
    if disponibles < 5 * CREDITOS_POR_MINUTO:
        return _res("dapta_api", "Cuenta de Dapta", "voz", DEGRADADO, f"Quedan pocos créditos (≈ {minutos} min de llamada).", ms, **meta)
    return _res("dapta_api", "Cuenta de Dapta", "voz", OK, f"Cuenta conectada · ≈ {minutos} min de llamada disponibles.", ms, **meta)


def _chk_dapta_flow() -> Dict[str, Any]:
    url = os.environ.get("DAPTA_FLOW_WEBHOOK_URL") or ""
    if not url:
        return _res("dapta_flow", "Flow de llamadas (Dapta)", "voz", CAIDO,
                    "Sin DAPTA_FLOW_WEBHOOK_URL: el formulario funciona en modo simulado y no llama a nadie.")
    host = urlparse(url).hostname
    t0 = time.perf_counter()
    # OPTIONS: comprueba que el servidor contesta SIN ejecutar el flow (no se hace ninguna llamada).
    with _cliente() as c:
        r = c.request("OPTIONS", url)
    ms = _ms(t0)
    meta = {"host": host, "http": r.status_code, "clave": bool(os.environ.get("DAPTA_API_KEY"))}
    if r.status_code >= 500:
        return _res("dapta_flow", "Flow de llamadas (Dapta)", "voz", CAIDO, f"Dapta responde {r.status_code}.", ms, **meta)
    detalle = "El webhook del flow responde."
    if not meta["clave"]:
        return _res("dapta_flow", "Flow de llamadas (Dapta)", "voz", DEGRADADO,
                    "El webhook responde, pero falta DAPTA_API_KEY: Dapta rechazaría el pedido.", ms, **meta)
    return _res("dapta_flow", "Flow de llamadas (Dapta)", "voz", OK, detalle, ms, **meta)


def _chk_manuela() -> Dict[str, Any]:
    env = metricas.contadores(["llamada_enviada", "resultado_recibido", "llamada_error"])
    enviadas, recibidas, errores = env["llamada_enviada"]["dia"], env["resultado_recibido"]["dia"], env["llamada_error"]["dia"]
    ultimo = metricas.ultimo("resultado_recibido")
    meta = {"enviadas_24h": enviadas, "resultados_24h": recibidas, "errores_24h": errores,
            "ultimo_resultado": ultimo["t"] if ultimo else None}
    if errores and errores >= max(1, enviadas):
        return _res("manuela", "Agente Manuela (voz)", "voz", DEGRADADO, "Los últimos pedidos de llamada fallaron.", **meta)
    if enviadas and not recibidas:
        return _res("manuela", "Agente Manuela (voz)", "voz", DEGRADADO,
                    "Se pidieron llamadas pero aún no llega ningún resultado (¿webhook post-llamada?).", **meta)
    if not enviadas and not recibidas:
        return _res("manuela", "Agente Manuela (voz)", "voz", OK, "Sin llamadas desde el último reinicio.", **meta)
    return _res("manuela", "Agente Manuela (voz)", "voz", OK, f"{enviadas} llamadas pedidas y {recibidas} resultados en 24 h.", **meta)


def _chk_ia(id_: str, nombre: str, var: str, url: str, cabeceras: Callable[[str], Dict[str, str]]) -> Dict[str, Any]:
    clave = os.environ.get(var)
    if not clave:
        return _res(id_, nombre, "ia", SIN_CONFIGURAR, "No configurado: Machea no lo usa hoy.")
    t0 = time.perf_counter()
    with _cliente() as c:
        r = c.get(url, headers=cabeceras(clave))
    ms = _ms(t0)
    if r.status_code == 200:
        return _res(id_, nombre, "ia", OK, "Conexión correcta.", ms)
    if r.status_code in (401, 403):
        return _res(id_, nombre, "ia", CAIDO, "La clave fue rechazada.", ms)
    return _res(id_, nombre, "ia", DEGRADADO if r.status_code < 500 else CAIDO, f"Responde {r.status_code}.", ms)


def _chk_claude() -> Dict[str, Any]:
    return _chk_ia("claude", "Claude (Anthropic)", "ANTHROPIC_API_KEY", "https://api.anthropic.com/v1/models?limit=1",
                   lambda k: {"x-api-key": k, "anthropic-version": "2023-06-01"})


def _chk_openai() -> Dict[str, Any]:
    return _chk_ia("openai", "OpenAI", "OPENAI_API_KEY", "https://api.openai.com/v1/models",
                   lambda k: {"Authorization": f"Bearer {k}"})


def _chk_correo() -> Dict[str, Any]:
    modo = correo_mod.modo()
    ok, err = metricas.ultimo("correo_enviado"), metricas.ultimo("correo_error")
    meta = {"modo": modo, "ultimo_envio": ok["t"] if ok else None, "ultimo_error": err["t"] if err else None}
    if modo == "ninguno":
        return _res("correo", "Correo (demo con marca)", "comunicacion", SIN_CONFIGURAR,
                    "Sin SMTP_USER y SMTP_PASSWORD: la demo se entrega solo en pantalla.", **meta)
    if err and (not ok or err["t"] > ok["t"]):
        return _res("correo", "Correo (demo con marca)", "comunicacion", DEGRADADO,
                    "El último envío falló. Usa «Probar conexión».", **meta)
    via = "Gmail (SMTP)" if modo == "smtp" else "un flow de Dapta"
    return _res("correo", "Correo (demo con marca)", "comunicacion", OK, f"Configurado por {via}.", **meta)


def _chk_whatsapp() -> Dict[str, Any]:
    if os.environ.get("DAPTA_WHATSAPP_FLOW_URL"):
        return _res("whatsapp", "WhatsApp (seguimiento)", "comunicacion", OK, "Flow de seguimiento configurado.")
    return _res("whatsapp", "WhatsApp (seguimiento)", "comunicacion", SIN_CONFIGURAR,
                "Apagado: falta la línea de WhatsApp Business y su flow en Dapta.")


def _estado_de_proveedor(id_: str, nombre: str, url: str, pagina: str) -> Dict[str, Any]:
    t0 = time.perf_counter()
    try:
        with _cliente(5.0) as c:
            r = c.get(url)
        r.raise_for_status()
        s = (r.json().get("status") or {})
    except (httpx.HTTPError, ValueError, AttributeError):
        # Que NO se pueda leer su página de estado no significa que el proveedor esté caído.
        return _res(id_, nombre, "proveedor", DESCONOCIDO, "No se pudo leer su página de estado.", _ms(t0), pagina=pagina)
    indicador = s.get("indicator")
    estado = {"none": OK, "minor": DEGRADADO, "major": DEGRADADO, "critical": CAIDO}.get(indicador, DESCONOCIDO)
    return _res(id_, nombre, "proveedor", estado, str(s.get("description") or "Sin descripción")[:120], _ms(t0),
                indicador=indicador, pagina=pagina)


def _proveedor(id_: str, nombre: str, url: str, pagina: str) -> Callable[[], Dict[str, Any]]:
    return lambda: _estado_de_proveedor(id_, nombre, url, pagina)


# (id, grupo, nombre, segundos de caché, función). La caché evita martillar a terceros: el panel
# consulta cada 10 s, pero Supabase se prueba cada 20 s, Dapta cada 60 s y los proveedores cada 2 min.
CHEQUEOS: List[Tuple[str, str, str, int, Callable[[], Dict[str, Any]]]] = [
    ("backend", "app", "API de Machea", 0, _chk_backend),
    ("front", "app", "Sitio web (Vercel)", 20, _chk_front),
    ("supabase", "datos", "Base de datos (Supabase)", 20, _chk_supabase),
    ("dapta_api", "voz", "Cuenta de Dapta", 60, _chk_dapta_api),
    ("dapta_flow", "voz", "Flow de llamadas (Dapta)", 30, _chk_dapta_flow),
    ("manuela", "voz", "Agente Manuela (voz)", 0, _chk_manuela),
    ("claude", "ia", "Claude (Anthropic)", 60, _chk_claude),
    ("openai", "ia", "OpenAI", 60, _chk_openai),
    ("correo", "comunicacion", "Correo (demo con marca)", 0, _chk_correo),
    ("whatsapp", "comunicacion", "WhatsApp (seguimiento)", 0, _chk_whatsapp),
]
CHEQUEOS_PROVEEDORES = [(i, "proveedor", n, 120, _proveedor(i, n, u, p)) for i, n, u, p in PROVEEDORES]

# Los que, si caen, dejan a Machea sin servicio: deciden el estado global.
CRITICOS = ("backend", "front", "supabase", "dapta_flow", "dapta_api")

_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_CACHE_LOCK = threading.Lock()
_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=12, thread_name_prefix="panel")


def _correr(item: Tuple[str, str, str, int, Callable[[], Dict[str, Any]]]) -> Dict[str, Any]:
    id_, grupo, nombre, ttl, fn = item
    ahora = time.time()
    # La llave lleva el grupo: el proveedor "supabase" (su página de estado) y el servicio
    # "supabase" (nuestra base de datos) comparten id y NO pueden compartir caché.
    llave = f"{grupo}:{id_}"
    if ttl:
        with _CACHE_LOCK:
            hit = _CACHE.get(llave)
        if hit and ahora - hit[0] < ttl:
            return hit[1]
    try:
        res = fn()
    except httpx.TimeoutException:
        res = _res(id_, nombre, grupo, CAIDO, "No respondió a tiempo.")
    except httpx.HTTPError as exc:
        res = _res(id_, nombre, grupo, CAIDO, f"No se pudo conectar ({type(exc).__name__}).")
    except Exception as exc:                  # una comprobación rota no tumba el panel
        logger.warning("panel: la comprobación %s falló: %s: %s", id_, type(exc).__name__, exc)
        res = _res(id_, nombre, grupo, DESCONOCIDO, f"No se pudo comprobar ({type(exc).__name__}).")
    if ttl:
        with _CACHE_LOCK:
            _CACHE[llave] = (time.time(), res)
    return res


def _correr_todas(items) -> List[Dict[str, Any]]:
    futuros = {_POOL.submit(_correr, it): it for it in items}
    salida: Dict[str, Dict[str, Any]] = {}
    hecho, pendiente = concurrent.futures.wait(futuros, timeout=14)
    for f in hecho:
        salida[futuros[f][0]] = f.result()
    for f in pendiente:
        id_, grupo, nombre, _t, _fn = futuros[f]
        salida[id_] = _res(id_, nombre, grupo, DESCONOCIDO, "La comprobación tardó demasiado.")
    return [salida[it[0]] for it in items]


def _estado_global(servicios: List[Dict[str, Any]]) -> Dict[str, Any]:
    criticos = [s for s in servicios if s["id"] in CRITICOS and s["estado"] != SIN_CONFIGURAR]
    peor = max((_GRAVEDAD[s["estado"]] for s in criticos), default=0)
    caidos = [s["nombre"] for s in criticos if s["estado"] == CAIDO]
    flojos = [s["nombre"] for s in criticos if s["estado"] in (DEGRADADO, DESCONOCIDO)]
    if peor >= 3:
        return {"estado": CAIDO, "titulo": "Hay un servicio caído", "resumen": "Sin servicio: " + ", ".join(caidos) + "."}
    if peor >= 1:
        return {"estado": DEGRADADO, "titulo": "Funciona con avisos", "resumen": "Revisa: " + ", ".join(flojos) + "."}
    return {"estado": OK, "titulo": "Todo operativo", "resumen": f"{len(criticos)} servicios críticos funcionando."}


def _configuracion() -> List[Dict[str, Any]]:
    return [{"variable": v, "requisito": req, "para": para, "configurada": bool(os.environ.get(v))}
            for v, req, para in VARIABLES]


_TIPOS_ACTIVIDAD = ["llamada_enviada", "llamada_rechazada", "llamada_error", "resultado_recibido",
                    "demo_creada", "correo_enviado", "correo_error"]
_TIPOS_EVENTO = _TIPOS_ACTIVIDAD + ["admin_login_ok", "admin_login_fallido"]


@router.get("/estado")
def estado(sesion: Dict[str, Any] = Depends(exigir)):
    servicios = _correr_todas(CHEQUEOS)
    proveedores = _correr_todas(CHEQUEOS_PROVEEDORES)
    global_ = _estado_global(servicios)
    if global_["estado"] == OK and any(p["estado"] in (DEGRADADO, CAIDO) for p in proveedores):
        malos = [p["nombre"] for p in proveedores if p["estado"] in (DEGRADADO, CAIDO)]
        global_["resumen"] += " Aviso de proveedores: " + ", ".join(malos) + "."
    return {
        "generado": time.time(),
        "global": global_,
        "servicios": servicios,
        "proveedores": proveedores,
        "uso": limites.uso(),
        "actividad": {"desde": metricas.inicio, "contadores": metricas.contadores(_TIPOS_ACTIVIDAD)},
        "eventos": metricas.eventos(_TIPOS_EVENTO, 40),
        "accesos": metricas.eventos(["admin_login_ok", "admin_login_fallido"], 8),
        "configuracion": _configuracion(),
        "sesion": {"expira": sesion.get("exp")},
        "seguridad": {"segundo_factor": _totp_secreto() is not None},
    }


@router.post("/probar-correo")
def probar_correo(sesion: Dict[str, Any] = Depends(exigir)):
    try:
        limites.tope_simple(llave="admin-probar-correo", tope=3, segundos=600,
                            mensaje="Ya probaste el correo varias veces. Espera {m} min.")
    except Rechazo as exc:
        raise HTTPException(429, exc.mensaje, headers={"Retry-After": str(exc.reintentar_en)}) from exc
    ok, mensaje = correo_mod.probar()
    metricas.registrar("correo_prueba", mensaje, "ok" if ok else "aviso")
    with _CACHE_LOCK:
        _CACHE.pop("comunicacion:correo", None)
    return {"ok": ok, "mensaje": mensaje}
