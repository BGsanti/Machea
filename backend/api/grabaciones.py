"""Audio y transcripción de las llamadas de Manuela y Camila, para guardarlos y mostrarlos en el CRM.

Dapta manda la llamada dentro del webhook post-llamada. De ahí salen tres cosas:

- `transcript_object`: los turnos de la conversación, cada uno con su rol, su texto y los segundos en que se dijo
  (permite saltar al minuto exacto en el reproductor). Si falta, se usa `transcript`, el mismo texto en líneas
  «Agent: …» / «User: …», sin tiempos.
- `recording_url`: el enlace al audio. Con la opción «Public call link» del agente encendida es un enlace directo
  (`https://files.dapta.ai/calls/…`) que se puede reproducir; apagada, apunta a la página de la llamada en Dapta,
  que pide iniciar sesión allá.
- `duration_ms`: la duración.

Lo que se guarda es lo mínimo para mostrarlo; nada de esto viaja al navegador de quien pidió la llamada (el
resultado que ve esa persona lo arma app.py aparte) y los registros del servidor lo omiten (`para_registro`).
"""

import os
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

def habilitada(agente: str) -> bool:
    """¿Se guardan el audio y la transcripción de las llamadas de este agente («manuela» o «camila»)?

    Es un interruptor aparte porque guardar la conversación es tratamiento de datos que la persona tiene que conocer:
    la política de privacidad y la apertura de Manuela dicen hoy que la llamada NO se graba, aunque Dapta sí la graba
    y la transcribe. Camila ya avisa que «la llamada puede ser grabada», así que por defecto solo se guardan las de
    Camila. Variable GRABACIONES_GUARDAR: vacía = solo Camila; «todas» o «1» = las dos; «ninguna» o «0» = ninguna;
    o una lista: «manuela,camila».
    """
    valor = os.environ.get("GRABACIONES_GUARDAR", "").strip().lower()
    if valor == "":
        return agente == "camila"
    if valor in ("0", "no", "false", "ninguna"):
        return False
    if valor in ("1", "si", "sí", "true", "todas"):
        return True
    return agente in {x.strip() for x in valor.split(",")}


MAX_TURNOS = 400
MAX_TEXTO_TURNO = 800
MAX_CARACTERES = 40_000
MAX_URL = 600
_CLAVES_PRIVADAS = ("transcript", "transcript_object", "transcript_with_tool_calls", "recording_url", "public_log_url")
_ROLES = {"agent": "a", "assistant": "a", "agente": "a", "user": "u", "usuario": "u", "client": "u", "customer": "u"}


def _limpio(texto: Any) -> str:
    return re.sub(r"\s+", " ", str(texto or "")).strip()


def _normal(texto: str) -> str:
    return re.sub(r"[^\w]+", " ", texto.lower()).strip()


def _segundos(turno: Dict[str, Any]) -> Optional[float]:
    for p in turno.get("words") or []:
        if isinstance(p, dict) and isinstance(p.get("start"), (int, float)):
            return round(float(p["start"]), 1)
    return None


def _agregar(turnos: List[Dict[str, Any]], rol: str, texto: str, segundo: Optional[float]) -> None:
    texto = texto[:MAX_TEXTO_TURNO]
    if not texto:
        return
    # Dapta repite lo que dijo la persona: un turno largo y, justo después, sus mitades. Se descartan los que ya
    # están dentro del turno anterior del mismo rol.
    previo = next((t for t in reversed(turnos) if t["r"] == rol), None)
    if previo is not None and turnos and turnos[-1] is previo and _normal(texto) in _normal(previo["t"]):
        return
    turno: Dict[str, Any] = {"r": rol, "t": texto}
    if segundo is not None:
        turno["s"] = segundo
    turnos.append(turno)


def transcripcion(llamada: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """La conversación como [{"r": "a"|"u", "t": texto, "s": segundo}], o None si no hay."""
    turnos: List[Dict[str, Any]] = []
    objeto = llamada.get("transcript_object")
    if isinstance(objeto, list):
        for t in objeto[:MAX_TURNOS]:
            if not isinstance(t, dict):
                continue
            rol = _ROLES.get(str(t.get("role") or "").lower())
            if rol:
                _agregar(turnos, rol, _limpio(t.get("content")), _segundos(t))
    if not turnos and isinstance(llamada.get("transcript"), str):
        for linea in llamada["transcript"].splitlines()[:MAX_TURNOS]:
            m = re.match(r"\s*(agent|assistant|user)\s*:\s*(.*)", linea, re.I)
            if m:
                _agregar(turnos, _ROLES[m.group(1).lower()], _limpio(m.group(2)), None)
    # Tope de tamaño: se corta por el final, nunca a mitad de un turno.
    total = 0
    for i, t in enumerate(turnos):
        total += len(t["t"])
        if total > MAX_CARACTERES:
            turnos = turnos[:i]
            break
    return turnos or None


def enlace_grabacion(llamada: Dict[str, Any]) -> Optional[str]:
    """El enlace del audio, solo si es una dirección https de Dapta (con la opción apagada Dapta manda otra cosa)."""
    url = str(llamada.get("recording_url") or "").strip()
    if not url or len(url) > MAX_URL:
        return None
    p = urlparse(url)
    host = (p.hostname or "").lower()
    if p.scheme != "https" or not (host == "dapta.ai" or host.endswith(".dapta.ai")):
        return None
    return url


def extraer(llamada: Dict[str, Any]) -> Dict[str, Any]:
    """Lo que se guarda de una llamada: grabacion_url, transcripcion y duracion_ms (solo las que existan)."""
    salida: Dict[str, Any] = {}
    url = enlace_grabacion(llamada)
    if url:
        salida["grabacion_url"] = url
    turnos = transcripcion(llamada)
    if turnos:
        salida["transcripcion"] = turnos
    try:
        duracion = int(llamada.get("duration_ms") or 0)
    except (TypeError, ValueError):
        duracion = 0
    if duracion > 0:
        salida["duracion_ms"] = duracion
    return salida


def para_registro(cuerpo: Any) -> Any:
    """Copia del cuerpo del webhook para el registro del servidor, sin transcripciones ni enlaces de audio."""
    if isinstance(cuerpo, dict):
        return {k: ("[omitido]" if k in _CLAVES_PRIVADAS else para_registro(v)) for k, v in cuerpo.items()}
    if isinstance(cuerpo, list):
        return [para_registro(v) for v in cuerpo]
    return cuerpo


COLUMNAS_NUEVAS = ("grabacion_url", "transcripcion", "duracion_ms")


def columna_faltante(error: Exception) -> bool:
    """¿El error de Supabase es «esa columna no existe»? Pasa si el código sale antes que la migración."""
    texto = str(error)
    return "PGRST204" in texto or "42703" in texto or "does not exist" in texto


def sin_columnas_nuevas(fila: Dict[str, Any], columnas: tuple = COLUMNAS_NUEVAS) -> Dict[str, Any]:
    """La fila sin las columnas de audio y transcripción: para reintentar si la migración aún no se aplicó."""
    return {k: v for k, v in fila.items() if k not in columnas}
