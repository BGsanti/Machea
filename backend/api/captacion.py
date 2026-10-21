"""
api/captacion.py
================
El agente PROPIO de Machea (Camila): llama a inmobiliarias y constructoras, las califica y les agenda una
demostración. No es Manuela (que atiende a los leads de compradores de nuestros clientes): ver
docs/agente-captacion.md y backend/dapta/prompt-captacion.md.

QUÉ HACE ESTE MÓDULO
  1. Guarda los PROSPECTOS (lista fría importada o quien pidió una demo en la landing).
  2. Los llama a través de un flow de Dapta (DAPTA_CAPTACION_FLOW_URL), respetando horario y topes.
  3. Recibe el resultado de la llamada (webhook), CALIFICA al prospecto con una puntuación propia
     (A/B/C: no depende de lo que el modelo diga) y guarda la cita (demostración) si quedó.

SEGURIDAD (leer antes de tocar)
  * /api/captacion/demo es PÚBLICO y dispara una llamada real a un teléfono que escribe un desconocido. Lleva
    los mismos topes que /api/llamar (por teléfono, por IP y por día), exige la casilla de autorización, una
    trampa para bots y solo llama dentro del horario. Y está APAGADO por defecto (CAPTACION_LLAMAR_DEMOS=true
    para encenderlo).
  * Todo lo demás exige la sesión del panel (/admin) o la cabecera X-Captacion-Key (CAPTACION_API_KEY, 24+
    caracteres), pensada para scripts.
  * El webhook se protege con un secreto en la URL (CAPTACION_WEBHOOK_SECRET, 24+ caracteres).
  * El nombre de la empresa y de la persona terminan DENTRO del prompt del agente: se limpian igual que en la
    demo con marca (api/demo.py), para que nadie meta instrucciones por ahí.
  * Horario: nunca domingos ni festivos de Colombia; lunes a viernes 8:00-18:00 y sábados 9:00-12:00 (hora de
    Colombia). Es más estricto que la Ley 2300 de 2023 a propósito.

PERSISTENCIA
  Con SUPABASE_URL + SUPABASE_SERVICE_KEY (clave service_role, SOLO en Render) todo queda en las tablas de
  supabase/migrations/20261017180000_captacion.sql. Sin ellas funciona EN MEMORIA (se pierde al reiniciar).
"""

from __future__ import annotations

import hmac
import json
import logging
import os
import re
import threading
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from api import admin as admin_mod
from api import demo as demo_mod
from api import grabaciones
from api import seguimiento
from api.limites import DIA, Rechazo, entero_env, ip_del_cliente, limites
from api.metricas import enmascarar_telefono, metricas

logger = logging.getLogger("uvicorn.error")
router = APIRouter()

TZ = timezone(timedelta(hours=-5))          # Colombia no tiene horario de verano
MAX_INTENTOS = 3
ESTADOS_NO_LLAMAR = {"no_contactar", "numero_invalido", "no_interesado", "demo_agendada"}


# ---------------------------------------------------------------------------
# Teléfonos
# ---------------------------------------------------------------------------

_INDICATIVO_CIUDAD = {"bogota": "601", "medellin": "604", "cali": "602", "barranquilla": "605", "bucaramanga": "607"}


def _sin_tildes(t: str) -> str:
    import unicodedata
    return unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()


def e164_co(raw: Optional[str], ciudad: Optional[str] = None) -> Optional[str]:
    """E.164 de un móvil (3XXXXXXXXX) o de un fijo colombiano (60X + 7 dígitos, o 7 dígitos con la ciudad). Si no se
    puede asegurar, None: es mejor no llamar que marcar a otro número."""
    d = re.sub(r"\D", "", str(raw or ""))
    if d.startswith("00"):
        d = d[2:]
    if d.startswith("57") and len(d) > 10:
        d = d[2:]
    if re.search(r"(\d)\1{6,}", d):                 # 3000000000, 6010000000…: números de relleno, no de una persona
        return None
    if len(d) == 10 and d.startswith("3"):
        return "+57" + d
    if len(d) == 10 and d.startswith("60") and d[2] in "12345678":
        return "+57" + d
    if len(d) == 7:
        ind = _INDICATIVO_CIUDAD.get(_sin_tildes(ciudad or "").split(" ")[0].split(",")[0])
        if ind:
            return "+57" + ind + d
    return None


def e164_co_lista(raw: Optional[str], ciudad: Optional[str] = None) -> Optional[str]:
    """Una celda de directorio puede traer varios números («3183540775 / 4430700»): se toma el primero que sirva y se
    prefiere un móvil (a un fijo de empresa casi nunca contesta quien decide)."""
    trozos = [t for t in re.split(r"[/,;|]|\by\b|\bo\b", str(raw or "")) if re.search(r"\d", t)]
    validos = [e for e in (e164_co(t, ciudad) for t in trozos) if e]
    return next((e for e in validos if e.startswith("+573")), validos[0] if validos else None)


def _digitos(e164: str) -> str:
    return re.sub(r"\D", "", e164)[2:] if e164.startswith("+57") else re.sub(r"\D", "", e164)


# ---------------------------------------------------------------------------
# Horario: nunca domingos ni festivos de Colombia
# ---------------------------------------------------------------------------

def _pascua(año: int) -> date:
    """Domingo de Pascua (algoritmo gregoriano anónimo)."""
    a, b, c = año % 19, año // 100, año % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = (h + l - 7 * m + 114) % 31 + 1
    return date(año, mes, dia)


def _lunes(d: date) -> date:
    """Ley Emiliani: el festivo pasa al lunes siguiente (el mismo día si ya es lunes)."""
    return d + timedelta(days=(7 - d.weekday()) % 7)


def festivos_colombia(año: int) -> set:
    p = _pascua(año)
    fijos = {date(año, 1, 1), date(año, 5, 1), date(año, 7, 20), date(año, 8, 7), date(año, 12, 8), date(año, 12, 25),
             p - timedelta(days=3), p - timedelta(days=2)}                                   # Jueves y Viernes Santo
    moviles = [date(año, 1, 6), date(año, 3, 19), date(año, 6, 29), date(año, 8, 15), date(año, 10, 12),
               date(año, 11, 1), date(año, 11, 11),
               p + timedelta(days=39), p + timedelta(days=60), p + timedelta(days=68)]      # Ascensión, Corpus, Sagrado Corazón
    return fijos | {_lunes(x) for x in moviles}


def es_festivo(d: date) -> bool:
    return d in festivos_colombia(d.year)


# (hora_inicio, hora_fin) en horas decimales, por día de la semana (0 = lunes)
VENTANAS = {0: (8.0, 18.0), 1: (8.0, 18.0), 2: (8.0, 18.0), 3: (8.0, 18.0), 4: (8.0, 18.0), 5: (9.0, 12.0)}


def ventana_permitida(ahora: Optional[datetime] = None) -> Tuple[bool, str]:
    ahora = (ahora or datetime.now(TZ)).astimezone(TZ)
    if es_festivo(ahora.date()):
        return False, "festivo"
    v = VENTANAS.get(ahora.weekday())
    if not v:
        return False, "domingo"
    h = ahora.hour + ahora.minute / 60
    if h < v[0]:
        return False, "antes_de_hora"
    if h >= v[1]:
        return False, "despues_de_hora"
    return True, "ok"


def proxima_ventana(ahora: Optional[datetime] = None) -> datetime:
    """El primer instante dentro del horario a partir de `ahora` (con una pausa de 5 min al abrir)."""
    ahora = (ahora or datetime.now(TZ)).astimezone(TZ)
    ok, _ = ventana_permitida(ahora)
    if ok:
        return ahora
    for dias in range(0, 10):
        d = (ahora + timedelta(days=dias)).date()
        v = VENTANAS.get(d.weekday())
        if not v or es_festivo(d):
            continue
        apertura = datetime(d.year, d.month, d.day, int(v[0]), int((v[0] % 1) * 60) + 5, tzinfo=TZ)
        if apertura > ahora:
            return apertura
    return ahora + timedelta(days=1)


# ---------------------------------------------------------------------------
# Calificación (propia, no depende de la etiqueta del modelo)
# ---------------------------------------------------------------------------

def _numero_mayor(valor: Any) -> Optional[int]:
    """'unos 300', 'entre 100 y 200', '1.500', 450 -> el mayor número que aparezca."""
    if valor is None or isinstance(valor, bool):
        return None
    if isinstance(valor, (int, float)):
        return int(valor)
    nums = [int(n.replace(".", "").replace(",", "")) for n in re.findall(r"\d[\d.,]*", str(valor)) if re.sub(r"\D", "", n)]
    return max(nums) if nums else None


def puntuar(c: Dict[str, Any]) -> Tuple[int, str]:
    """Puntos 0-100 y letra: A (llamar primero), B (interesante), C (frío), X (no contactar)."""
    if str(c.get("no_contactar")).lower() == "true":
        return 0, "X"
    pts = 0
    leads = _numero_mayor(c.get("leads_mes"))
    if leads is not None:
        pts += 30 if leads >= 300 else 20 if leads >= 100 else 10 if leads >= 30 else 3
    pts += {"mas_6m": 20, "2_6m": 12, "menos_2m": 5, "ninguna": 0}.get(str(c.get("inversion_pauta_mes") or "").lower(), 0)
    pts += {"24h_o_mas": 15, "mismo_dia": 15, "menos_1h": 8, "no_sabe": 8, "menos_5min": 2}.get(str(c.get("tiempo_respuesta") or "").lower(), 0)
    pts += {"si": 15, "influye": 8}.get(str(c.get("es_decisor") or "").lower(), 0)
    pts += {"alto": 20, "medio": 10}.get(str(c.get("interes") or "").lower(), 0)
    if str(c.get("demo_agendada")).lower() == "true":
        pts += 15
    pts = min(100, pts)
    return pts, "A" if pts >= 70 else "B" if pts >= 40 else "C"


# ---------------------------------------------------------------------------
# Almacén: memoria (por defecto) o Supabase (con la clave service_role)
# ---------------------------------------------------------------------------

def _ahora_iso() -> str:
    return datetime.now(TZ).isoformat()


class AlmacenMemoria:
    nombre = "memoria"

    def __init__(self) -> None:
        self._l = threading.Lock()
        self.prospectos: Dict[str, Dict[str, Any]] = {}
        self.llamadas: List[Dict[str, Any]] = []
        self.citas: List[Dict[str, Any]] = []

    def por_telefono(self, tel: str) -> Optional[Dict[str, Any]]:
        with self._l:
            return next((p for p in self.prospectos.values() if p["telefono"] == tel), None)

    def obtener(self, pid: str) -> Optional[Dict[str, Any]]:
        with self._l:
            return self.prospectos.get(pid)

    def crear_o_traer(self, datos: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        with self._l:
            ex = next((p for p in self.prospectos.values() if p["telefono"] == datos["telefono"]), None)
            if ex:
                return ex, False
            p = {"id": str(uuid.uuid4()), "creado_en": _ahora_iso(), "estado": "nuevo", "intentos": 0, "calificacion": {}, **datos}
            self.prospectos[p["id"]] = p
            return p, True

    def actualizar(self, pid: str, **cambios: Any) -> Optional[Dict[str, Any]]:
        with self._l:
            p = self.prospectos.get(pid)
            if p is not None:
                p.update(cambios)
                p["actualizado_en"] = _ahora_iso()
            return p

    def listar(self, estado: Optional[str] = None, limite: int = 100) -> List[Dict[str, Any]]:
        with self._l:
            filas = [p for p in self.prospectos.values() if not estado or p["estado"] == estado]
        return sorted(filas, key=lambda p: p.get("creado_en", ""), reverse=True)[:limite]

    def registrar_llamada(self, fila: Dict[str, Any]) -> bool:
        with self._l:
            if fila.get("call_id") and any(x.get("call_id") == fila["call_id"] for x in self.llamadas):
                return False
            self.llamadas.append({"creado_en": _ahora_iso(), **fila})
            return True

    def crear_cita(self, fila: Dict[str, Any]) -> Dict[str, Any]:
        with self._l:
            c = {"id": str(uuid.uuid4()), "creado_en": _ahora_iso(), "estado": "confirmada", **fila}
            self.citas.append(c)
            return c

    def listar_citas(self, limite: int = 200) -> List[Dict[str, Any]]:
        with self._l:
            return sorted(self.citas, key=lambda c: c.get("inicio") or c["creado_en"])[:limite]

    def resumen(self) -> Dict[str, Any]:
        with self._l:
            ps = list(self.prospectos.values())
            return _armar_resumen(ps, len(self.llamadas), len(self.citas))


def _armar_resumen(ps: List[Dict[str, Any]], llamadas: int, citas: int) -> Dict[str, Any]:
    por_estado: Dict[str, int] = {}
    por_score: Dict[str, int] = {}
    for p in ps:
        por_estado[p["estado"]] = por_estado.get(p["estado"], 0) + 1
        if p.get("score"):
            por_score[p["score"]] = por_score.get(p["score"], 0) + 1
    return {"prospectos": len(ps), "por_estado": por_estado, "por_score": por_score, "llamadas": llamadas, "citas": citas}


class AlmacenSupabase:
    """PostgREST con la clave service_role. Tablas: supabase/migrations/20261017180000_captacion.sql."""
    nombre = "supabase"

    def __init__(self, url: str, clave: str, cliente: Any = None) -> None:
        import httpx
        self.base = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"}
        self.c = cliente or httpx.Client(timeout=12.0)

    def _req(self, metodo: str, ruta: str, *, params: Optional[dict] = None, cuerpo: Any = None, prefer: str = "return=representation"):
        r = self.c.request(metodo, self.base + ruta, params=params, json=cuerpo, headers={**self.h, "Prefer": prefer})
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {metodo} {ruta}: {r.status_code} {r.text[:200]}")
        return r.json() if r.content else []

    def por_telefono(self, tel: str) -> Optional[Dict[str, Any]]:
        f = self._req("GET", "/prospectos", params={"telefono": f"eq.{tel}", "limit": "1"})
        return f[0] if f else None

    def obtener(self, pid: str) -> Optional[Dict[str, Any]]:
        f = self._req("GET", "/prospectos", params={"id": f"eq.{pid}", "limit": "1"})
        return f[0] if f else None

    def crear_o_traer(self, datos: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        ex = self.por_telefono(datos["telefono"])
        if ex:
            return ex, False
        return self._req("POST", "/prospectos", cuerpo=datos)[0], True

    def actualizar(self, pid: str, **cambios: Any) -> Optional[Dict[str, Any]]:
        f = self._req("PATCH", "/prospectos", params={"id": f"eq.{pid}"}, cuerpo=cambios)
        return f[0] if f else None

    def listar(self, estado: Optional[str] = None, limite: int = 100) -> List[Dict[str, Any]]:
        p = {"order": "creado_en.desc", "limit": str(limite)}
        if estado:
            p["estado"] = f"eq.{estado}"
        return self._req("GET", "/prospectos", params=p)

    def registrar_llamada(self, fila: Dict[str, Any]) -> bool:
        if fila.get("call_id") and self._req("GET", "/llamadas_captacion", params={"call_id": f"eq.{fila['call_id']}", "select": "id"}):
            return False
        try:
            self._req("POST", "/llamadas_captacion", cuerpo=fila, prefer="return=minimal")
        except RuntimeError as e:
            # El código puede salir antes que la migración del audio: se guarda lo de siempre y se avisa.
            if not grabaciones.columna_faltante(e):
                raise
            logger.warning("captación: falta aplicar la migración del audio y la transcripción; se guarda sin ellos")
            self._req("POST", "/llamadas_captacion", cuerpo=grabaciones.sin_columnas_nuevas(fila, ("grabacion_url", "transcripcion")),
                      prefer="return=minimal")
        return True

    def crear_cita(self, fila: Dict[str, Any]) -> Dict[str, Any]:
        return self._req("POST", "/citas", cuerpo=fila)[0]

    def listar_citas(self, limite: int = 200) -> List[Dict[str, Any]]:
        return self._req("GET", "/citas", params={"order": "inicio.asc.nullslast", "limit": str(limite)})

    def resumen(self) -> Dict[str, Any]:
        ps = self._req("GET", "/prospectos", params={"select": "estado,score", "limit": "5000"})
        return _armar_resumen(ps, len(self._req("GET", "/llamadas_captacion", params={"select": "id", "limit": "10000"})),
                              len(self._req("GET", "/citas", params={"select": "id", "limit": "10000"})))


_ALMACEN: Any = None


def almacen() -> Any:
    global _ALMACEN
    if _ALMACEN is None:
        url, clave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
        _ALMACEN = AlmacenSupabase(url, clave) if (url and clave) else AlmacenMemoria()
        logger.info("captación: almacén %s", _ALMACEN.nombre)
    return _ALMACEN


# ---------------------------------------------------------------------------
# Llamar
# ---------------------------------------------------------------------------

TIPOS_EMPRESA = ("inmobiliaria", "constructora", "otro")


def payload_flow(p: Dict[str, Any], tel_e164: str) -> Dict[str, Any]:
    """Las variables que recibe el flow de Dapta (y de ahí el prompt de Camila). Nada sin limpiar."""
    declarado = (p.get("calificacion") or {}).get("declarado") or {}
    return {
        "telefono": tel_e164,
        "nombre": demo_mod.limpiar_nombre_persona(p.get("contacto_nombre")) or "",
        "empresa": demo_mod.limpiar_nombre_marca(p.get("empresa")) or "la empresa",
        "tipo_empresa": p.get("tipo_empresa") or "",
        "ciudad": demo_mod.limpiar_nombre_marca(p.get("ciudad")) if p.get("ciudad") else "",
        "sitio": (p.get("sitio") or "")[:120],
        "origen": "demo_web" if p.get("origen") == "demo_web" else "lista_frio",
        "current_time": datetime.now(TZ).strftime("%Y-%m-%d %H:%M"),
        "prospecto_id": p["id"],
        "external_lead_id": f"cap-{p['id']}",
        "problema_declarado": demo_mod.limpiar_nombre_marca(declarado.get("problema")),
        "fuente_leads": demo_mod.limpiar_nombre_marca(declarado.get("fuente_leads")),
        "pauta_mensual": demo_mod.limpiar_nombre_marca(declarado.get("pauta_mensual")),
        "leads_mes": str(declarado.get("leads_mes") or ""),
        "crm_actual": demo_mod.limpiar_nombre_marca(declarado.get("crm")),
    }


def _disparar_flow(payload: Dict[str, Any]) -> str:
    url = os.environ.get("DAPTA_CAPTACION_FLOW_URL")
    if not url:
        return "mock"
    import httpx
    # La URL del flow de Dapta ya trae su propia clave (?x-api-key=…): si además se manda otra en la cabecera, chocan.
    clave = None if "x-api-key=" in url else os.environ.get("DAPTA_API_KEY")
    with httpx.Client(timeout=20.0) as c:
        r = c.post(url, json=payload, headers={"x-api-key": clave} if clave else {})
        r.raise_for_status()
    return "enviado"


def llamar_prospecto(p: Dict[str, Any], *, ip: str = "", publico: bool = False) -> Dict[str, Any]:
    """Pide a Dapta la llamada de Camila a un prospecto, si el horario, los topes y su estado lo permiten."""
    a = almacen()
    tel = p["telefono"]
    if p["estado"] in ESTADOS_NO_LLAMAR:
        return {"status": "bloqueado", "detalle": f"El prospecto está en estado «{p['estado']}»."}
    if p.get("intentos", 0) >= MAX_INTENTOS and p.get("origen") != "demo_web":
        return {"status": "agotado", "detalle": f"Ya se intentó {MAX_INTENTOS} veces."}
    ok, motivo = ventana_permitida()
    if not ok:
        prox = proxima_ventana()
        a.actualizar(p["id"], estado="en_cola", proximo_intento=prox.isoformat())
        return {"status": "fuera_de_horario", "detalle": f"Fuera de horario ({motivo}). Se llama desde {prox.strftime('%Y-%m-%d %H:%M')}.",
                "proximo_intento": prox.isoformat()}
    payload = payload_flow(p, tel)
    if not os.environ.get("DAPTA_CAPTACION_FLOW_URL"):
        return {"status": "mock_enqueued", "detalle": "DAPTA_CAPTACION_FLOW_URL no está configurado: no se llamó a nadie.",
                "payload_enviado": payload}
    reserva = None
    try:
        if publico:
            reserva = limites.reservar_llamada(telefono=tel, ip=ip or "?", demo=True)
        else:
            limites.tope_simple(llave=f"cap:{tel}", tope=1, segundos=DIA, mensaje="A este número ya se le llamó hoy. Intenta en {m} minutos.")
            limites.tope_simple(llave="cap:total", tope=entero_env("CAPTACION_LLAMADAS_DIA", 60), segundos=DIA,
                                mensaje="Se llegó al tope diario de llamadas de captación. Intenta en {m} minutos.")
    except Rechazo as exc:
        return {"status": "limite", "detalle": exc.mensaje, "reintentar_en": exc.reintentar_en}
    try:
        _disparar_flow(payload)
    except Exception:
        if reserva:
            reserva.liberar()
        metricas.registrar("captacion_error", f"Dapta no aceptó la llamada de captación · {enmascarar_telefono(tel)}", "error")
        raise
    a.actualizar(p["id"], estado="llamando", intentos=p.get("intentos", 0) + 1, ultimo_intento=_ahora_iso())
    metricas.registrar("captacion_llamada", f"Camila llamando · {enmascarar_telefono(tel)}" + (" · demo web" if p.get("origen") == "demo_web" else ""), "ok")
    return {"status": "llamando", "detalle": "Camila está llamando.", "prospecto_id": p["id"]}


# ---------------------------------------------------------------------------
# Resultado de la llamada (webhook de Dapta)
# ---------------------------------------------------------------------------

def _dict(valor: Any) -> Dict[str, Any]:
    if isinstance(valor, str):
        try:
            valor = json.loads(valor)
        except ValueError:
            return {}
    return valor if isinstance(valor, dict) else {}


def _bool(v: Any) -> Optional[bool]:
    if isinstance(v, bool):
        return v
    if isinstance(v, str) and v.strip().lower() in ("true", "false"):
        return v.strip().lower() == "true"
    return None


def _inicio_cita(texto: Any) -> Optional[str]:
    """'2026-10-21 16:00' (hora de Colombia) -> ISO con zona, o None si no es una hora exacta."""
    m = re.match(r"^\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})", str(texto or ""))
    if not m:
        return None
    try:
        return datetime(*[int(x) for x in m.groups()], tzinfo=TZ).isoformat()
    except ValueError:
        return None


def procesar_resultado(body: Dict[str, Any]) -> Dict[str, Any]:
    llamada = next((c for c in (body.get("data"), body.get("call"), body) if isinstance(c, dict) and (c.get("to_number") or c.get("call_id") or c.get("dynamic_variables") or c.get("llm_dynamic_variables"))), None)
    if llamada is None:
        return {"status": "ignorado", "detalle": "sin datos de llamada"}
    a = almacen()
    variables = _dict(llamada.get("dynamic_variables") or llamada.get("llm_dynamic_variables") or body.get("dynamic_variables"))
    analisis = _dict(llamada.get("call_analysis") or body.get("call_analysis"))
    datos = _dict(analisis.get("custom_analysis_data") or llamada.get("custom_analysis_data"))

    p = None
    pid = str(variables.get("prospecto_id") or "")
    if pid:
        p = a.obtener(pid)
    if p is None:
        tel = e164_co(llamada.get("to_number") or llamada.get("telefono"))
        p = a.por_telefono(_digitos(tel)) if tel else None
    if p is None:
        logger.warning("captación: resultado sin prospecto conocido")
        return {"status": "ignorado", "detalle": "prospecto no encontrado"}

    razon = str(llamada.get("disconnection_reason") or "").lower()
    sin_contacto = razon in seguimiento.SIN_CONTACTO or bool(analisis.get("in_voicemail"))
    resumen = datos.get("resumen_llamada") or analisis.get("call_summary") or ""
    if sin_contacto and (not resumen or re.search(r"voicemail|skipped|no answer|not answered|unanswered|unavailable|busy", str(resumen), re.I)):
        resumen = "No se llegó a hablar: buzón de voz, ocupado, sin respuesta o filtro de llamadas."
    try:
        dur = int(llamada.get("duration_ms") or 0)
    except (TypeError, ValueError):
        dur = 0

    nuevo = a.registrar_llamada({
        "prospecto_id": p["id"], "call_id": str(llamada.get("call_id") or llamada.get("id") or "") or None,
        "motivo_corte": razon or None, "duracion_ms": dur, "sin_contacto": sin_contacto, "resumen": str(resumen)[:1000], "analisis": datos,
        **({k: v for k, v in grabaciones.extraer(llamada).items() if k != "duracion_ms"} if grabaciones.habilitada("camila") else {}),
    })
    if not nuevo:
        return {"status": "duplicado", "prospecto_id": p["id"]}

    calif = {**(p.get("calificacion") or {})}
    for k in ("tipo_empresa_confirmado", "leads_mes", "inversion_pauta_mes", "tiempo_respuesta", "crm_actual", "es_decisor",
              "dolor_principal", "interes", "motivo_no_demo", "siguiente_paso", "objecion_principal"):
        if datos.get(k) not in (None, ""):
            calif[k] = datos[k]
    demo = _bool(datos.get("demo_agendada")) is True
    no_contactar = _bool(datos.get("no_contactar")) is True
    puntos, letra = puntuar({**calif, "demo_agendada": demo, "no_contactar": no_contactar}) if not sin_contacto or demo else (p.get("puntos") or 0, p.get("score") or "C")

    cambios: Dict[str, Any] = {"calificacion": calif}
    if str(datos.get("tipo_empresa_confirmado") or "").lower() in TIPOS_EMPRESA:
        cambios["tipo_empresa"] = str(datos["tipo_empresa_confirmado"]).lower()
    if datos.get("nombre_contacto"):
        cambios["contacto_nombre"] = demo_mod.limpiar_nombre_persona(datos["nombre_contacto"])[:120]
    if datos.get("cargo_contacto"):
        cambios["contacto_cargo"] = demo_mod.limpiar_nombre_marca(datos["cargo_contacto"])[:120]

    cita = None
    if no_contactar:
        cambios.update(estado="no_contactar", score="X", puntos=0)
    elif demo:
        cambios.update(estado="demo_agendada", score=letra, puntos=puntos)
        cita = a.crear_cita({"prospecto_id": p["id"], "tipo": "demo", "inicio": _inicio_cita(datos.get("fecha_hora_demo")),
                             "texto_acordado": str(datos.get("fecha_demo_texto") or datos.get("fecha_hora_demo") or "")[:160] or None,
                             "canal": "llamada", "estado": "confirmada", "origen": "agente_camila"})
    elif sin_contacto:
        if p.get("intentos", 0) >= MAX_INTENTOS:
            cambios.update(estado="sin_respuesta")
        else:
            cambios.update(estado="en_cola", proximo_intento=proxima_ventana(datetime.now(TZ) + timedelta(days=1)).isoformat())
    elif str(datos.get("interes") or "").lower() == "bajo" or str(datos.get("motivo_no_demo") or "").lower() in ("no_interesado", "ya_tiene_solucion"):
        cambios.update(estado="no_interesado", score=letra, puntos=puntos)
    else:
        cambios.update(estado="calificado", score=letra, puntos=puntos)
        if datos.get("fecha_seguimiento") or str(datos.get("siguiente_paso") or "").lower() == "volver_a_llamar":
            cita = a.crear_cita({"prospecto_id": p["id"], "tipo": "llamada_seguimiento", "inicio": _inicio_cita(datos.get("fecha_hora_seguimiento")),
                                 "texto_acordado": str(datos.get("fecha_seguimiento") or "")[:160] or None, "canal": "llamada",
                                 "estado": "confirmada" if _inicio_cita(datos.get("fecha_hora_seguimiento")) else "propuesta",
                                 "origen": "agente_camila"})
    a.actualizar(p["id"], **cambios)
    metricas.registrar("captacion_resultado", f"Camila: {cambios.get('estado', 'resultado')} ({letra}) · {enmascarar_telefono(p['telefono'])}", "ok")
    return {"status": "ok", "prospecto_id": p["id"], "estado": cambios.get("estado"), "score": cambios.get("score"), "cita": bool(cita)}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def exigir_acceso(request: Request, response: Response) -> Dict[str, Any]:
    """Sesión del panel o cabecera X-Captacion-Key (scripts)."""
    clave = os.environ.get("CAPTACION_API_KEY", "")
    enviada = request.headers.get("x-captacion-key", "")
    if len(clave) >= 24 and enviada and hmac.compare_digest(enviada, clave):
        return {"via": "clave"}
    return admin_mod.exigir(request, response)


class ProspectoEntrada(BaseModel):
    empresa: str = Field(min_length=2, max_length=200)
    telefono: str = Field(min_length=7, max_length=20)
    tipo_empresa: Optional[str] = Field(default=None, max_length=20)
    ciudad: Optional[str] = Field(default=None, max_length=120)
    sitio: Optional[str] = Field(default=None, max_length=300)
    contacto_nombre: Optional[str] = Field(default=None, max_length=120)
    contacto_cargo: Optional[str] = Field(default=None, max_length=120)
    correo: Optional[str] = Field(default=None, max_length=254)
    origen: str = Field(default="lista_frio", max_length=20)
    notas: Optional[str] = Field(default=None, max_length=500)


class ImportarEntrada(BaseModel):
    prospectos: List[ProspectoEntrada] = Field(max_length=500)


class LlamarEntrada(BaseModel):
    prospecto_id: Optional[str] = None
    telefono: Optional[str] = None


def _fila_prospecto(e: ProspectoEntrada) -> Optional[Dict[str, Any]]:
    tel = e164_co_lista(e.telefono, e.ciudad)
    if not tel:
        return None
    tipo = (e.tipo_empresa or "").strip().lower()
    tipo = tipo if tipo in TIPOS_EMPRESA else ("inmobiliaria" if "inmob" in tipo else "constructora" if "constr" in tipo else None)
    origen = e.origen if e.origen in ("lista_frio", "demo_web", "referido", "manual") else "lista_frio"
    fila = {"empresa": e.empresa.strip(), "telefono": _digitos(tel), "tipo_empresa": tipo, "ciudad": e.ciudad, "sitio": e.sitio,
            "contacto_nombre": e.contacto_nombre, "contacto_cargo": e.contacto_cargo, "correo": e.correo, "origen": origen, "notas": e.notas}
    return {k: v for k, v in fila.items() if v not in (None, "")}


def _e164_de_fila(p: Dict[str, Any]) -> str:
    d = re.sub(r"\D", "", p["telefono"])
    return "+57" + d if not d.startswith("57") else "+" + d


@router.post("/api/captacion/importar")
def importar(entrada: ImportarEntrada, _s=Depends(exigir_acceso)):
    a = almacen()
    nuevos = repetidos = invalidos = 0
    for e in entrada.prospectos:
        fila = _fila_prospecto(e)
        if not fila:
            invalidos += 1
            continue
        _, creado = a.crear_o_traer(fila)
        nuevos += 1 if creado else 0
        repetidos += 0 if creado else 1
    metricas.registrar("captacion_importados", f"Prospectos importados: {nuevos} nuevos, {repetidos} repetidos, {invalidos} inválidos", "info")
    return {"nuevos": nuevos, "repetidos": repetidos, "invalidos": invalidos, "almacen": a.nombre}


@router.post("/api/captacion/llamar")
def llamar(entrada: LlamarEntrada, _s=Depends(exigir_acceso)):
    a = almacen()
    p = a.obtener(entrada.prospecto_id) if entrada.prospecto_id else None
    if p is None and entrada.telefono:
        tel = e164_co(entrada.telefono)
        p = a.por_telefono(_digitos(tel)) if tel else None
    if p is None:
        raise HTTPException(404, "Prospecto no encontrado.")
    p = {**p, "telefono": _e164_de_fila(p)}
    r = llamar_prospecto(p)
    return r


LLAMANDO_VENCIDO = timedelta(minutes=45)      # si el webhook nunca llegó, el prospecto no se queda trabado


def _fecha(valor: Any) -> Optional[datetime]:
    try:
        d = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=TZ)


def procesar_cola(maximo: int = 3) -> Dict[str, Any]:
    """Llama a los prospectos cuyo turno ya llegó. Lo invoca un cron cada ~10 minutos (docs/agente-captacion.md §6).
    Va despacio a propósito: pocas llamadas por tanda (Dapta limita las simultáneas y las entrantes compiten con ellas)."""
    ok, motivo = ventana_permitida()
    if not ok:
        return {"status": "fuera_de_horario", "detalle": motivo, "llamados": 0}
    a = almacen()
    ahora = datetime.now(TZ)
    liberados = 0
    for p in a.listar("llamando", 500):                       # llamadas sin resultado hace rato: se reprograman
        ult = _fecha(p.get("ultimo_intento"))
        if ult and ahora - ult > LLAMANDO_VENCIDO:
            agotado = p.get("intentos", 0) >= MAX_INTENTOS
            a.actualizar(p["id"], estado="sin_respuesta" if agotado else "en_cola",
                         proximo_intento=None if agotado else proxima_ventana(ahora).isoformat())
            liberados += 1
    demos = os.environ.get("CAPTACION_LLAMAR_DEMOS", "").lower() == "true"
    turno = [p for est in ("en_cola", "nuevo") for p in a.listar(est, 500)
             if (demos or p.get("origen") != "demo_web") and (not p.get("proximo_intento") or (_fecha(p["proximo_intento"]) or ahora) <= ahora)]
    turno.sort(key=lambda p: (p.get("origen") != "demo_web", p.get("creado_en", "")))   # primero quien pidió la demo, luego los más antiguos
    llamados, errores, detalle = 0, 0, []
    for p in turno:
        if llamados >= maximo or errores >= 2:
            break
        try:
            r = llamar_prospecto({**p, "telefono": _e164_de_fila(p)})
        except Exception as exc:                              # Dapta caído: no se insiste con toda la lista
            errores += 1
            logger.warning("captación: no se pudo llamar a %s: %s", p["id"], exc)
            continue
        if r["status"] == "llamando":
            llamados += 1
        elif r["status"] == "limite":                         # tope diario o del número: no tiene sentido seguir
            detalle.append(r["detalle"])
            if "tope diario" in r["detalle"]:
                break
    return {"status": "ok", "llamados": llamados, "errores": errores, "liberados": liberados, "en_turno": len(turno), "detalle": detalle}


@router.post("/api/captacion/cola")
def cola(maximo: int = 3, _s=Depends(exigir_acceso)):
    return procesar_cola(max(1, min(maximo, 10)))


@router.get("/api/captacion/prospectos")
def prospectos(estado: Optional[str] = None, limite: int = 100, _s=Depends(exigir_acceso)):
    filas = almacen().listar(estado, max(1, min(limite, 500)))
    return {"prospectos": [{**p, "telefono": enmascarar_telefono("+57" + re.sub(r"\D", "", p["telefono"])[-10:])} for p in filas]}


@router.get("/api/captacion/citas")
def citas(_s=Depends(exigir_acceso)):
    return {"citas": almacen().listar_citas()}


@router.get("/api/captacion/resumen")
def resumen(_s=Depends(exigir_acceso)):
    return {**almacen().resumen(), "almacen": almacen().nombre, "llamadas_demo_activas": os.environ.get("CAPTACION_LLAMAR_DEMOS", "").lower() == "true",
            "dentro_de_horario": ventana_permitida()[0]}


class DemoEntrada(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
    telefono: str = Field(min_length=7, max_length=20)
    correo: Optional[str] = Field(default=None, max_length=254)
    empresa: Optional[str] = Field(default=None, max_length=200)
    sitio: Optional[str] = Field(default=None, max_length=300)
    tipo_empresa: Optional[str] = Field(default=None, max_length=60)
    problema: Optional[str] = Field(default=None, max_length=200)
    fuente_leads: Optional[str] = Field(default=None, max_length=200)
    pauta_mensual: Optional[str] = Field(default=None, max_length=200)
    leads_mes: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    crm: Optional[str] = Field(default=None, max_length=200)
    acepto: bool = False
    website: Optional[str] = None            # trampa para bots


@router.post("/api/captacion/demo")
def demo(entrada: DemoEntrada, request: Request):
    """La landing lo llama (además de guardar en Supabase) cuando alguien pide una demostración."""
    if entrada.website:
        return {"status": "registrado", "llamada": False}                       # bot: parece éxito y no se hace nada
    if not entrada.acepto:
        raise HTTPException(400, "Falta la autorización para contactarte.")
    tel = e164_co(entrada.telefono)
    if not tel or not tel.startswith("+573"):
        raise HTTPException(400, "Escribe un celular colombiano de 10 dígitos que empiece por 3.")
    if almacen().nombre == "memoria" and os.environ.get("RENDER_SERVICE_NAME"):
        # En producción sin Supabase la solicitud se perdería al reiniciar y el visitante vería «¡Listo!». Mejor un 503:
        # la landing entonces guarda por su otro camino (Supabase) o le ofrece escribir por correo.
        raise HTTPException(503, "El almacén de captación no está configurado.")
    declarado = {k: v for k, v in {"problema": entrada.problema, "fuente_leads": entrada.fuente_leads, "pauta_mensual": entrada.pauta_mensual,
                                   "leads_mes": entrada.leads_mes, "crm": entrada.crm}.items() if v not in (None, "")}
    e = ProspectoEntrada(empresa=entrada.empresa or entrada.nombre, telefono=entrada.telefono, tipo_empresa=entrada.tipo_empresa,
                         sitio=entrada.sitio, contacto_nombre=entrada.nombre, correo=entrada.correo, origen="demo_web")
    fila = _fila_prospecto(e) or {}
    a = almacen()
    p, creado = a.crear_o_traer({**fila, "calificacion": {"declarado": declarado}})
    if not creado:
        p = a.actualizar(p["id"], origen="demo_web", calificacion={**(p.get("calificacion") or {}), "declarado": declarado}) or p
    metricas.registrar("captacion_demo", f"Demostración pedida · {enmascarar_telefono(tel)}", "info")
    if os.environ.get("CAPTACION_LLAMAR_DEMOS", "").lower() != "true":
        return {"status": "registrado", "llamada": False}
    r = llamar_prospecto({**p, "telefono": tel, "origen": "demo_web"}, ip=ip_del_cliente(request), publico=True)
    return {"status": r["status"], "llamada": r["status"] == "llamando", "detalle": r.get("detalle")}


@router.post("/webhooks/dapta/captacion")
async def webhook(request: Request):
    secreto = os.environ.get("CAPTACION_WEBHOOK_SECRET", "")
    if len(secreto) < 24:
        raise HTTPException(404, "No disponible")
    if not hmac.compare_digest(request.query_params.get("k", ""), secreto):
        raise HTTPException(401, "No autorizado")
    body = await request.json()
    logger.info("webhook captación: %s", json.dumps(grabaciones.para_registro(body), ensure_ascii=False)[:3000])
    return procesar_resultado(body)
