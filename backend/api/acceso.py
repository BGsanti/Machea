"""
api/acceso.py
=============
El login de Machea del lado del servidor (contrato: design/login/CONTRATO_AUTH.md).

    POST   /api/cuentas                         {usuario, correo, clave}   -> 201 {correo}
    POST   /api/cuentas/confirmar               {token}                    -> 204
    POST   /api/cuentas/reenviar-confirmacion   {correo}                   -> 204 (siempre)
    POST   /api/sesion                          {correo, clave, recordar}  -> 200 Sesion + cookie
    GET    /api/sesion                                                     -> 200 Sesion | 401
    DELETE /api/sesion                                                     -> 204
    POST   /api/sesion/google                   {idToken, nonce, recordar} -> 503 (apagado, D19)
    POST   /api/clave/recuperar                 {correo}                   -> 204 (siempre)
    POST   /api/clave                           {token, clave}             -> 204

Errores: {"detail": {"codigo": <CodigoError del contrato>, "mensaje": ..., "campos"?: {...}}}.

DECISIÓN (D20): el login es NUESTRO, no de un proveedor. Las cuentas viven en Postgres
(`api/almacen_acceso.py`), y migrar de nube es mover esas tablas.

SEGURIDAD
  * Contraseña con scrypt (N=2^14, r=8, p=1; sal de 16 bytes por cuenta). Nunca sale del servidor.
  * Sesión = token aleatorio en una cookie HttpOnly, Secure, SameSite=Lax y Path=/api. En la base
    solo va su SHA-256. "Recordarme" = cookie de 30 días; sin él, la cookie muere con el navegador y la
    sesión dura máximo 12 h en el servidor.
  * El front llama a /api/... en SU MISMO dominio (Vercel reenvía esas rutas a Render: frontend/vercel.json),
    así la cookie es de primera parte. Las peticiones que cambian algo exigen que, si viene un `Origin`, sea
    uno permitido (FRONT_URL, ORIGENES_ACCESO o localhost).
  * Los mensajes no revelan si un correo existe (salvo "correo_ocupado" al registrarse, inevitable).
    Entrar con un correo inexistente cuesta lo mismo que con uno real: se calcula un hash igual.
  * Topes: 5 fallos por correo en 15 min (en la base) y topes por IP en memoria para registro,
    reenvíos y recuperación.
  * Los correos salen en segundo plano con `api/correo.py`; un fallo nunca rompe la respuesta.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import re
import secrets
import time
from datetime import timedelta
from typing import Any, Dict, Optional, Protocol
from urllib.parse import quote, urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from api import correo as correo_mod
from api import demo as demo_mod
from api.almacen_acceso import CorreoOcupado, UsuarioOcupado, ahora, publica
from api.limites import Rechazo, ip_del_cliente, limites
from api.metricas import metricas

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api", include_in_schema=False)

COOKIE = "machea_sesion"
VIGENCIA_CONFIRMAR = timedelta(hours=24)
VIGENCIA_RECUPERAR = timedelta(hours=1)
SESION_RECORDADA = timedelta(days=30)
SESION_TEMPORAL = timedelta(hours=12)
INTENTOS_MAX = 5
INTENTOS_VENTANA = timedelta(minutes=15)

CLAVE_MIN, CLAVE_MAX = 10, 128
USUARIO_MIN, USUARIO_MAX = 3, 30

MENSAJES = {
    "datos_invalidos": "Revisa los datos marcados.",
    "credenciales": "El correo o la contraseña no coinciden.",
    "correo_sin_confirmar": "Confirma tu correo antes de entrar. Te podemos reenviar el enlace.",
    "usuario_ocupado": "Ese nombre de usuario ya está en uso.",
    "correo_ocupado": "Ese correo ya tiene una cuenta. Entra o recupera tu contraseña.",
    "enlace_invalido": "El enlace venció o ya se usó. Pide uno nuevo.",
    "google_invalido": "No pudimos verificar tu cuenta de Google. Intenta de nuevo.",
    "demasiados_intentos": "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
    "no_disponible": "El acceso todavía no está disponible.",
    "origen": "Petición no permitida.",
}


class AlmacenAcceso(Protocol):
    def crear_cuenta(self, usuario: str, correo: str, clave_hash: str) -> Dict[str, Any]: ...
    def por_correo(self, correo: str) -> Optional[Dict[str, Any]]: ...
    def por_id(self, id_: str) -> Optional[Dict[str, Any]]: ...
    def confirmar(self, id_: str) -> None: ...
    def cambiar_clave(self, id_: str, clave_hash: str) -> None: ...
    def guardar_enlace(self, hash_: str, tipo: str, cuenta_id: str, expira) -> None: ...
    def ver_enlace(self, hash_: str, tipo: str) -> Optional[str]: ...
    def consumir_enlace(self, hash_: str, tipo: str) -> Optional[str]: ...
    def crear_sesion(self, hash_: str, cuenta_id: str, recordar: bool, expira) -> None: ...
    def sesion(self, hash_: str) -> Optional[Dict[str, Any]]: ...
    def borrar_sesion(self, hash_: str) -> None: ...
    def registrar_fallo(self, correo: str) -> None: ...
    def contar_fallos(self, correo: str, desde) -> int: ...
    def limpiar_fallos(self, correo: str) -> None: ...
    def limpiar_vencidos(self) -> None: ...


_almacen: Optional[AlmacenAcceso] = None
_ultima_limpieza = 0.0


def configurar_almacen(almacen: Optional[AlmacenAcceso]) -> None:
    global _almacen
    _almacen = almacen


def _error(status: int, codigo: str, campos: Optional[Dict[str, str]] = None) -> HTTPException:
    detalle: Dict[str, Any] = {"codigo": codigo, "mensaje": MENSAJES.get(codigo, MENSAJES["datos_invalidos"])}
    if campos:
        detalle["campos"] = campos
    return HTTPException(status, detalle)


def _alm() -> AlmacenAcceso:
    global _ultima_limpieza
    if _almacen is None:
        raise _error(503, "no_disponible")
    if time.time() - _ultima_limpieza > 3600:          # una vez por hora: enlaces, sesiones e intentos vencidos
        _ultima_limpieza = time.time()
        try:
            _almacen.limpiar_vencidos()
        except Exception as exc:                        # limpiar nunca debe tumbar un login
            logger.warning("acceso: no se pudo limpiar lo vencido: %s", exc)
    return _almacen


# ---------------------------------------------------------------------------
# Validación (la misma de frontend/src/auth/validacion.ts; el servidor no confía en el navegador)
# ---------------------------------------------------------------------------

_RE_USUARIO = re.compile(r"^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$")
_RE_CORREO = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")


def normalizar_correo(c: str) -> str:
    return (c or "").strip().lower()


def validar_usuario(u: str) -> Optional[str]:
    u = (u or "").strip().lower()
    if not u:
        return "Escribe un nombre de usuario."
    if len(u) < USUARIO_MIN:
        return f"Usa al menos {USUARIO_MIN} caracteres."
    if len(u) > USUARIO_MAX:
        return f"Usa máximo {USUARIO_MAX} caracteres."
    if not _RE_USUARIO.match(u):
        return "Usa minúsculas, números, puntos o guiones, sin espacios ni tildes."
    return None


def validar_correo(c: str) -> Optional[str]:
    c = normalizar_correo(c)
    if not c:
        return "Escribe tu correo."
    if len(c) > 254 or not _RE_CORREO.match(c):
        return "Escribe un correo válido, como nombre@empresa.com."
    return None


def validar_clave(clave: str, usuario: str = "", correo: str = "") -> Optional[str]:
    if not clave:
        return "Escribe una contraseña."
    if len(clave) < CLAVE_MIN:
        return f"Usa al menos {CLAVE_MIN} caracteres."
    if len(clave) > CLAVE_MAX:
        return f"Usa máximo {CLAVE_MAX} caracteres."
    baja = clave.lower()
    u = (usuario or "").strip().lower()
    local = normalizar_correo(correo).split("@")[0]
    if (u and u in baja) or (len(local) >= 4 and local in baja):
        return "No uses tu usuario ni tu correo dentro de la contraseña."
    if len(set(clave)) == 1:
        return "Evita repetir el mismo carácter."
    return None


# ---------------------------------------------------------------------------
# Contraseñas y tokens
# ---------------------------------------------------------------------------

_SCRYPT = {"n": 2 ** 14, "r": 8, "p": 1}


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def hash_clave(clave: str) -> str:
    sal = secrets.token_bytes(16)
    dk = hashlib.scrypt(clave.encode(), salt=sal, dklen=32, maxmem=64 * 1024 * 1024, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${_b64(sal)}${_b64(dk)}"


def verificar_clave(clave: str, guardado: Optional[str]) -> bool:
    try:
        alg, n, r, p, sal, dk = (guardado or "").split("$")
        if alg != "scrypt":
            return False
        calc = hashlib.scrypt(clave.encode(), salt=_b64d(sal), dklen=len(_b64d(dk)), n=int(n), r=int(r), p=int(p),
                              maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(calc, _b64d(dk))
    except (ValueError, TypeError):
        return False


# Para que entrar con un correo inexistente tarde lo mismo que con uno real.
_HASH_SENUELO = hash_clave(secrets.token_urlsafe(16))


def _sha(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _nuevo_token() -> str:
    return secrets.token_urlsafe(32)


# ---------------------------------------------------------------------------
# Origen, cookie y topes
# ---------------------------------------------------------------------------

# Los dominios de producción del front, aunque FRONT_URL apunte a otro (p. ej. la URL de Vercel).
ORIGENES_DEFECTO = ("https://www.machea.co", "https://machea.co")


def _origenes_permitidos() -> set:
    permitidos = set(ORIGENES_DEFECTO)
    for o in [demo_mod._front_url()] + (os.environ.get("ORIGENES_ACCESO") or "").split(","):
        o = o.strip().rstrip("/")
        if o:
            permitidos.add(o)
            u = urlparse(o)
            if u.hostname and u.hostname.startswith("www."):        # www.machea.co y machea.co
                permitidos.add(f"{u.scheme}://{u.hostname[4:]}")
            elif u.hostname and u.hostname.count(".") == 1:
                permitidos.add(f"{u.scheme}://www.{u.hostname}")
    return permitidos


def _exigir_origen(request: Request) -> None:
    origen = (request.headers.get("origin") or "").rstrip("/")
    if not origen:
        return                                   # mismo origen sin Origin (o un cliente que no es navegador)
    host = urlparse(origen).hostname or ""
    if host in ("localhost", "127.0.0.1") or origen in _origenes_permitidos():
        return
    raise _error(403, "origen")


def _ip(request: Request) -> str:
    """La IP de quien usa el login, para los topes por IP.

    Estas rutas llegan por el reenvío de Vercel (vercel.json): para Render/Cloudflare la conexión viene
    de un servidor de Vercel, así que `ip_del_cliente` vería la MISMA IP para todos y el tope por IP
    bloquearía a todo el mundo a la vez. Vercel pone la IP real del navegador en `x-vercel-forwarded-for`
    o como primer valor de `x-forwarded-for`.
    Esas cabeceras se pueden falsificar llamando directo a Render, pero solo sirve para esquivar el tope
    por IP, que aquí es secundario: el tope que importa es por correo y vive en la base.
    """
    for nombre in ("x-vercel-forwarded-for", "x-forwarded-for"):
        valor = (request.headers.get(nombre) or "").split(",")[0].strip()
        if valor:
            return valor
    return ip_del_cliente(request)


def _tope(llave: str, tope: int, segundos: int) -> None:
    try:
        limites.tope_simple(llave=llave, tope=tope, segundos=segundos, mensaje=MENSAJES["demasiados_intentos"])
    except Rechazo as exc:
        raise HTTPException(429, {"codigo": "demasiados_intentos", "mensaje": MENSAJES["demasiados_intentos"]},
                            headers={"Retry-After": str(exc.reintentar_en)}) from exc


def _cookie_segura(request: Request) -> bool:
    # En local (http://localhost) el navegador no guarda cookies Secure servidas por http.
    return not (request.url.scheme == "http" and (request.url.hostname or "") in ("localhost", "127.0.0.1"))


def _poner_cookie(request: Request, response: Response, token: str, recordar: bool) -> None:
    response.set_cookie(COOKIE, token, max_age=int(SESION_RECORDADA.total_seconds()) if recordar else None,
                        httponly=True, secure=_cookie_segura(request), samesite="lax", path="/api")


def _quitar_cookie(request: Request, response: Response) -> None:
    response.delete_cookie(COOKIE, path="/api", httponly=True, secure=_cookie_segura(request), samesite="lax")


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


def _sesion_json(cuenta: Dict[str, Any], expira) -> Dict[str, Any]:
    from api.almacen_acceso import _iso

    return {"cuenta": publica(cuenta), "expiraEn": _iso(expira)}


def _abrir_sesion(request: Request, response: Response, cuenta: Dict[str, Any], recordar: bool) -> Dict[str, Any]:
    token = _nuevo_token()
    expira = ahora() + (SESION_RECORDADA if recordar else SESION_TEMPORAL)
    _alm().crear_sesion(_sha(token), str(cuenta["id"]), recordar, expira)
    _poner_cookie(request, response, token, recordar)
    return _sesion_json(cuenta, expira)


# ---------------------------------------------------------------------------
# Correos
# ---------------------------------------------------------------------------

def _enlace(ruta: str, token: str) -> str:
    return f"{demo_mod._front_url()}{ruta}{quote(token, safe='')}"


def _html_correo(titulo: str, parrafo: str, boton: str, enlace: str, pie: str) -> str:
    return (
        '<div style="font-family:Inter,Arial,sans-serif;color:#1f2e42;max-width:520px;margin:0 auto;padding:24px">'
        f'<p style="font-size:22px;font-weight:800;margin:0 0 12px">{titulo}</p>'
        f'<p style="font-size:15px;line-height:1.6;margin:0 0 20px">{parrafo}</p>'
        f'<p><a href="{enlace}" style="display:inline-block;background:#fc4633;color:#fff;font-weight:700;'
        f'text-decoration:none;padding:12px 22px;border-radius:999px">{boton}</a></p>'
        f'<p style="font-size:13px;color:#5d6876;line-height:1.5;margin:20px 0 0">{pie}</p>'
        f'<p style="font-size:12px;color:#626d7b;margin:16px 0 0">Si el botón no funciona, copia este enlace:<br>{enlace}</p>'
        '</div>'
    )


def correo_confirmar(destino: str, usuario: str, token: str) -> Dict[str, str]:
    enlace = _enlace("/acceso/?confirmar=", token)
    return {
        "to": destino,
        "subject": "Confirma tu correo en Machea",
        "html": _html_correo("Confirma tu correo",
                             f"Hola, {usuario}. Para terminar de crear la cuenta de tu empresa en Machea, confirma que este correo es tuyo.",
                             "Confirmar mi correo", enlace,
                             "El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este correo."),
        "text": f"Confirma tu correo en Machea: {enlace}\nEl enlace vence en 24 horas.",
    }


def correo_recuperar(destino: str, token: str) -> Dict[str, str]:
    enlace = _enlace("/acceso/nueva-clave/?token=", token)
    return {
        "to": destino,
        "subject": "Crea una contraseña nueva en Machea",
        "html": _html_correo("Crea una contraseña nueva",
                             "Recibimos una solicitud para cambiar la contraseña de tu cuenta de Machea.",
                             "Crear contraseña nueva", enlace,
                             "El enlace vence en 1 hora y sirve una sola vez. Si no lo pediste, ignora este correo: tu contraseña sigue igual."),
        "text": f"Crea una contraseña nueva en Machea: {enlace}\nEl enlace vence en 1 hora.",
    }


def correo_decision(cuenta: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """El aviso a la empresa cuando Machea aprueba o rechaza su cuenta (lo usa api/cuentas.py)."""
    acceso = f"{demo_mod._front_url()}/acceso/"
    if cuenta.get("estado") == "aprobada":
        return {"to": cuenta["correo"], "subject": "Tu cuenta de Machea está activa",
                "html": _html_correo("Tu cuenta está activa",
                                     f"Hola, {cuenta['usuario']}. El equipo de Machea revisó y activó la cuenta de tu empresa.",
                                     "Entrar a Machea", acceso, "Gracias por confiar en Machea."),
                "text": f"Tu cuenta de Machea está activa. Entra en {acceso}"}
    if cuenta.get("estado") == "rechazada":
        contacto = os.environ.get("CORREO_RESPUESTA") or correo_mod.CORREO_RESPUESTA_DEFECTO
        return {"to": cuenta["correo"], "subject": "Sobre tu cuenta de Machea",
                "html": _html_correo("Tu cuenta no fue aprobada",
                                     f"Hola, {cuenta['usuario']}. Por ahora no pudimos activar la cuenta de tu empresa. "
                                     f"Si crees que es un error, responde este correo o escríbenos a {contacto}.",
                                     "Ir a Machea", acceso, "Gracias por tu interés en Machea."),
                "text": f"Tu cuenta de Machea no fue aprobada. Escríbenos a {contacto} si crees que es un error."}
    return None


def _avisar_equipo(usuario: str, correo: str) -> Dict[str, str]:
    destino = os.environ.get("CORREO_EQUIPO") or correo_mod.CORREO_RESPUESTA_DEFECTO
    return {"to": destino, "subject": f"Nueva cuenta por revisar: {usuario}",
            "html": f"<p>La empresa <b>{usuario}</b> ({correo}) creó una cuenta en Machea. "
                    f"Cuando confirme su correo, apruébala o recházala en el panel /admin, sección «Cuentas de empresas».</p>",
            "text": f"Nueva cuenta: {usuario} ({correo}). Revísala en /admin."}


def instalar_manejadores(app) -> None:
    """Si la base no responde (red, pooler, credenciales), el login dice "no disponible" en vez de un 500."""
    try:
        import psycopg
        from psycopg_pool import PoolTimeout
    except ImportError:                                 # sin psycopg instalado no hay Postgres que fallar
        return

    async def _base_caida(request: Request, exc: Exception):
        logger.error("acceso: la base de cuentas no responde: %s: %s", type(exc).__name__, exc)
        metricas.registrar("cuentas_base_error", f"La base de cuentas no responde ({type(exc).__name__})", "error")
        return JSONResponse(status_code=503, headers={"Cache-Control": "no-store"},
                            content={"detail": {"codigo": "no_disponible", "mensaje": MENSAJES["no_disponible"]}})

    app.add_exception_handler(psycopg.OperationalError, _base_caida)
    app.add_exception_handler(PoolTimeout, _base_caida)


# Las pruebas reemplazan esto para capturar los correos.
def enviar_correo(payload: Dict[str, str]) -> None:
    correo_mod.enviar(payload)


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

class EntradaRegistro(BaseModel):
    usuario: str = Field(max_length=60)
    correo: str = Field(max_length=300)
    clave: str = Field(max_length=300)


class EntradaToken(BaseModel):
    token: str = Field(max_length=200)


class EntradaCorreo(BaseModel):
    correo: str = Field(max_length=300)


class EntradaSesion(BaseModel):
    correo: str = Field(max_length=300)
    clave: str = Field(max_length=300)
    recordar: bool = False


class EntradaClave(BaseModel):
    token: str = Field(max_length=200)
    clave: str = Field(max_length=300)


@router.post("/cuentas", status_code=201)
def crear_cuenta(datos: EntradaRegistro, request: Request, response: Response, tareas: BackgroundTasks):
    _exigir_origen(request)
    _no_store(response)
    almacen = _alm()
    _tope(f"registro-ip:{_ip(request)}", 20, 3600)
    usuario = datos.usuario.strip().lower()
    correo = normalizar_correo(datos.correo)
    campos = {k: v for k, v in {"usuario": validar_usuario(usuario), "correo": validar_correo(correo),
                                "clave": validar_clave(datos.clave, usuario, correo)}.items() if v}
    if campos:
        raise _error(422, "datos_invalidos", campos)
    try:
        cuenta = almacen.crear_cuenta(usuario, correo, hash_clave(datos.clave))
    except CorreoOcupado:
        raise _error(409, "correo_ocupado")
    except UsuarioOcupado:
        raise _error(409, "usuario_ocupado")
    token = _nuevo_token()
    almacen.guardar_enlace(_sha(token), "confirmar", str(cuenta["id"]), ahora() + VIGENCIA_CONFIRMAR)
    tareas.add_task(enviar_correo, correo_confirmar(correo, usuario, token))
    tareas.add_task(enviar_correo, _avisar_equipo(usuario, correo))
    metricas.registrar("cuenta_creada", f"Cuenta nueva por confirmar: {usuario}", "info")
    return {"correo": correo}


@router.post("/cuentas/confirmar", status_code=204)
def confirmar_correo(datos: EntradaToken, request: Request):
    _exigir_origen(request)
    almacen = _alm()
    cuenta_id = almacen.consumir_enlace(_sha(datos.token), "confirmar")
    if not cuenta_id:
        raise _error(400, "enlace_invalido")
    almacen.confirmar(cuenta_id)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.post("/cuentas/reenviar-confirmacion", status_code=204)
def reenviar_confirmacion(datos: EntradaCorreo, request: Request, tareas: BackgroundTasks):
    _exigir_origen(request)
    almacen = _alm()
    _tope(f"reenviar-ip:{_ip(request)}", 20, 3600)
    correo = normalizar_correo(datos.correo)
    cuenta = almacen.por_correo(correo) if not validar_correo(correo) else None
    if cuenta and cuenta["estado"] == "sin_confirmar":
        _tope(f"reenviar-correo:{correo}", 3, 3600)
        token = _nuevo_token()
        almacen.guardar_enlace(_sha(token), "confirmar", str(cuenta["id"]), ahora() + VIGENCIA_CONFIRMAR)
        tareas.add_task(enviar_correo, correo_confirmar(correo, cuenta["usuario"], token))
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.post("/sesion")
def entrar(datos: EntradaSesion, request: Request, response: Response):
    _exigir_origen(request)
    _no_store(response)
    almacen = _alm()
    correo = normalizar_correo(datos.correo)
    if validar_correo(correo) or not datos.clave:
        raise _error(401, "credenciales")
    if almacen.contar_fallos(correo, ahora() - INTENTOS_VENTANA) >= INTENTOS_MAX:
        raise _error(429, "demasiados_intentos")
    cuenta = almacen.por_correo(correo)
    ok = verificar_clave(datos.clave, cuenta["clave_hash"] if cuenta and cuenta.get("clave_hash") else _HASH_SENUELO)
    if not ok or not cuenta or not cuenta.get("clave_hash"):
        almacen.registrar_fallo(correo)
        raise _error(401, "credenciales")
    almacen.limpiar_fallos(correo)
    if cuenta["estado"] == "sin_confirmar":
        raise _error(403, "correo_sin_confirmar")
    return _abrir_sesion(request, response, cuenta, datos.recordar)


@router.get("/sesion")
def sesion_actual(request: Request, response: Response):
    _no_store(response)
    almacen = _alm()                                     # sin base: 503, para que el front sepa por qué
    token = request.cookies.get(COOKIE)
    s = almacen.sesion(_sha(token)) if token else None
    if not s:
        r = JSONResponse(status_code=401, content={"detail": {"codigo": "sin_sesion", "mensaje": "No hay sesión."}},
                         headers={"Cache-Control": "no-store"})
        if token:
            _quitar_cookie(request, r)
        return r
    return _sesion_json(s["cuenta"], s["expira"])


@router.delete("/sesion", status_code=204)
def salir(request: Request):
    _exigir_origen(request)
    token = request.cookies.get(COOKIE)
    if token and _almacen is not None:
        _almacen.borrar_sesion(_sha(token))
    r = Response(status_code=204, headers={"Cache-Control": "no-store"})
    _quitar_cookie(request, r)
    return r


@router.post("/sesion/google")
def entrar_con_google(request: Request):
    # Apagado por decisión (D19): Google exige política de privacidad y términos publicados. Cuando se
    # active, aquí se verifica el ID token (firma, iss, aud, exp, email_verified y nonce).
    _exigir_origen(request)
    raise _error(503, "no_disponible")


@router.post("/clave/recuperar", status_code=204)
def pedir_recuperacion(datos: EntradaCorreo, request: Request, tareas: BackgroundTasks):
    _exigir_origen(request)
    almacen = _alm()
    _tope(f"recuperar-ip:{_ip(request)}", 20, 3600)
    correo = normalizar_correo(datos.correo)
    cuenta = almacen.por_correo(correo) if not validar_correo(correo) else None
    if cuenta:
        _tope(f"recuperar-correo:{correo}", 3, 3600)
        token = _nuevo_token()
        almacen.guardar_enlace(_sha(token), "recuperar", str(cuenta["id"]), ahora() + VIGENCIA_RECUPERAR)
        tareas.add_task(enviar_correo, correo_recuperar(correo, token))
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.post("/clave", status_code=204)
def cambiar_clave(datos: EntradaClave, request: Request):
    _exigir_origen(request)
    almacen = _alm()
    h = _sha(datos.token)
    # Primero se valida y solo después se gasta el enlace: si la clave no sirve, se reintenta con el mismo.
    cuenta_id = almacen.ver_enlace(h, "recuperar")
    cuenta = almacen.por_id(cuenta_id) if cuenta_id else None
    if not cuenta:
        raise _error(400, "enlace_invalido")
    error = validar_clave(datos.clave, cuenta["usuario"], cuenta["correo"])
    if error:
        raise _error(422, "datos_invalidos", {"clave": error})
    if almacen.consumir_enlace(h, "recuperar") != str(cuenta["id"]):
        raise _error(400, "enlace_invalido")
    almacen.cambiar_clave(str(cuenta["id"]), hash_clave(datos.clave))
    almacen.limpiar_fallos(cuenta["correo"])
    r = Response(status_code=204, headers={"Cache-Control": "no-store"})
    _quitar_cookie(request, r)
    return r
