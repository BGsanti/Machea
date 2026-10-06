"""
api/seguimiento.py
==================
Qué hacer cuando Manuela termina una llamada: si la persona no contestó, colgó antes
de calificar, o la llamada salió completa, se le escribe por WhatsApp.

CÓMO FUNCIONA. El receptor del webhook post-llamada (`/webhooks/dapta/resultado`) llama a
`seguimiento_de(...)` con la llamada que Dapta reporta. Si hay que escribir, se dispara
un flow de Dapta (`DAPTA_WHATSAPP_FLOW_URL`) que envía una PLANTILLA aprobada de WhatsApp.
Sin esa variable no pasa nada: se puede desplegar ya y encender cuando exista la línea.

REGLAS DE META que condicionan esto (por eso es una plantilla y no un texto libre):
  * El primer mensaje a alguien que no ha escrito en 24 h tiene que ser una plantilla
    aprobada.
  * La persona tiene que haber dado su permiso para que la contacten por WhatsApp. El
    formulario lo pide en su texto de consentimiento.

TRES CASOS:
  no_contesto  buzón, ocupado, sin respuesta, no se pudo marcar, o colgó casi al instante.
  colgo        contestó pero colgó (o dejó de hablar) sin llegar a calificar.
  completa     la llamada salió bien: se le deja por escrito el resumen y la ficha.

Un solo envío por llamada (`call_id`) y como máximo 2 al día por teléfono.
"""

from __future__ import annotations

import json
import logging
import os
from collections import OrderedDict
from typing import Any, Dict, Optional

from api.limites import DIA, Rechazo, limites

logger = logging.getLogger("uvicorn.error")

# Razones de desconexión de Dapta que significan "nadie habló con Manuela".
SIN_CONTACTO = {
    "voicemail_reached", "dial_no_answer", "dial_busy", "dial_failed", "no_answer", "busy",
    "failed", "machine_detected", "invalid_destination", "telephony_provider_permission_denied",
    "error_no_audio_received",
}
COLGO = {"user_hangup", "inactivity", "max_duration_reached"}
DURACION_MINIMA_MS = 8_000          # menos que esto no hubo conversación, aunque la razón sea otra

_ENVIADAS: "OrderedDict[str, bool]" = OrderedDict()
_MAX_ENVIADAS = 2000


def _analisis(llamada: Dict[str, Any]) -> Dict[str, Any]:
    a = llamada.get("call_analysis")
    if isinstance(a, str):
        try:
            a = json.loads(a)
        except ValueError:
            a = {}
    return a if isinstance(a, dict) else {}


def clasificar(llamada: Dict[str, Any]) -> Optional[str]:
    """'no_contesto' | 'colgo' | 'completa' | None (no escribir)."""
    razon = str(llamada.get("disconnection_reason") or "").lower()
    try:
        duracion = int(llamada.get("duration_ms") or 0)
    except (TypeError, ValueError):
        duracion = 0
    analisis = _analisis(llamada)
    datos = analisis.get("custom_analysis_data") or {}
    if isinstance(datos, str):
        try:
            datos = json.loads(datos)
        except ValueError:
            datos = {}

    if razon in SIN_CONTACTO or (razon and razon not in COLGO and duracion < DURACION_MINIMA_MS):
        return "no_contesto"
    if analisis.get("in_voicemail"):
        return "no_contesto"
    if duracion < DURACION_MINIMA_MS:
        return "no_contesto"
    if analisis.get("call_successful") is True or datos.get("estado_del_lead") == "qualified":
        return "completa"
    if razon in COLGO or analisis.get("call_successful") is False:
        return "colgo"
    return None


def _plantilla(caso: str) -> str:
    if caso == "completa":
        return os.environ.get("WHATSAPP_PLANTILLA_RESUMEN", "resumen_y_ficha")
    return os.environ.get("WHATSAPP_PLANTILLA_NO_LOGRADO", "contacto_no_logrado")


def preparar(llamada: Dict[str, Any], telefono_e164: str) -> Optional[Dict[str, Any]]:
    """El pedido para el flow de WhatsApp, o None si no hay que escribir (o ya se escribió)."""
    caso = clasificar(llamada)
    if not caso:
        return None
    call_id = str(llamada.get("call_id") or llamada.get("id") or "")
    if call_id:
        if call_id in _ENVIADAS:
            return None
        _ENVIADAS[call_id] = True
        while len(_ENVIADAS) > _MAX_ENVIADAS:
            _ENVIADAS.popitem(last=False)
    try:
        limites.tope_simple(llave=f"wa:{telefono_e164[-10:]}", tope=2, segundos=DIA, mensaje="")
    except Rechazo:
        logger.warning("seguimiento: tope diario de WhatsApp para ...%s", telefono_e164[-4:])
        return None

    v = llamada.get("dynamic_variables") or llamada.get("llm_dynamic_variables") or {}
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except ValueError:
            v = {}
    resumen = (_analisis(llamada).get("call_summary") or "")[:300]
    return {
        "telefono": telefono_e164,
        "plantilla": _plantilla(caso),
        "caso": caso,
        "motivo": str(llamada.get("disconnection_reason") or ""),
        "nombre": v.get("contact_name") or "",
        "proyecto": v.get("proyecto_recomendado") or "",
        "nombre_marca": v.get("nombre_marca") or "Machea",
        "modo_demo": str(v.get("modo_demo") or "false").lower() == "true",
        "resumen": resumen,
    }


def enviar(pedido: Dict[str, Any]) -> None:
    """Dispara el flow de Dapta que manda la plantilla. Best-effort: nunca rompe el webhook."""
    url = os.environ.get("DAPTA_WHATSAPP_FLOW_URL")
    if not url:
        return
    try:
        import httpx
        with httpx.Client(timeout=15.0) as c:
            c.post(url, json=pedido).raise_for_status()
        logger.info("seguimiento WhatsApp enviado: caso=%s tel=...%s", pedido["caso"], pedido["telefono"][-4:])
    except Exception as exc:
        logger.warning("seguimiento WhatsApp falló: %s", exc)
