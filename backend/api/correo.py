"""
api/correo.py
=============
Envío de los correos del backend (hoy: el enlace de la demo con marca y el aviso al equipo).

DOS CAMINOS, en este orden:
  1. SMTP directo con una cuenta de Gmail y su "contraseña de aplicación".
         SMTP_USER=machea.co@gmail.com   SMTP_PASSWORD=<16 letras>
     Opcionales: SMTP_HOST (smtp.gmail.com), SMTP_PORT (465 = SSL; 587 = STARTTLS),
     SMTP_FROM ("Machea <machea.co@gmail.com>"), CORREO_RESPUESTA (equipo@machea.co).
     Sale desde la propia cuenta de Gmail: SPF y DKIM alinean y llega a la bandeja, no a spam.
  2. Un flow de Dapta con un nodo de Gmail (`DAPTA_EMAIL_FLOW_URL`), que necesita conectar
     Google en Dapta.

Sin ninguno configurado no se envía nada, y la página lo dice (muestra el enlace para abrirlo).

RENDER: el plan GRATIS bloquea el correo saliente (puertos 25, 465 y 587 desde sep-2025); los
planes de pago (desde Starter) no. Si el servicio volviera al plan gratis, hay que pasar a un
proveedor por API (Resend, Brevo…).

Es best-effort: un fallo se registra y NUNCA rompe la respuesta al usuario.
"""

from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Any, Dict

logger = logging.getLogger("uvicorn.error")

CORREO_RESPUESTA_DEFECTO = "equipo@machea.co"


def _smtp_configurado() -> bool:
    return bool(os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD"))


def configurado() -> bool:
    return _smtp_configurado() or bool(os.environ.get("DAPTA_EMAIL_FLOW_URL"))


def _por_smtp(payload: Dict[str, Any]) -> None:
    usuario = os.environ["SMTP_USER"].strip()
    # Google muestra la contraseña de aplicación en grupos de 4 con espacios: se quitan.
    clave = os.environ["SMTP_PASSWORD"].replace(" ", "").strip()
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    puerto = int(os.environ.get("SMTP_PORT", "465"))

    msg = EmailMessage()
    msg["From"] = os.environ.get("SMTP_FROM") or formataddr(("Machea", usuario))
    msg["To"] = payload["to"]
    msg["Reply-To"] = os.environ.get("CORREO_RESPUESTA") or CORREO_RESPUESTA_DEFECTO
    msg["Subject"] = payload["subject"]
    msg.set_content(payload.get("text") or "")
    if payload.get("html"):
        msg.add_alternative(payload["html"], subtype="html")

    contexto = ssl.create_default_context()
    if puerto == 465:
        with smtplib.SMTP_SSL(host, puerto, timeout=15, context=contexto) as s:
            s.login(usuario, clave)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, puerto, timeout=15) as s:
            s.starttls(context=contexto)
            s.login(usuario, clave)
            s.send_message(msg)


def _por_flow_de_dapta(payload: Dict[str, Any]) -> None:
    import httpx

    with httpx.Client(timeout=15.0) as c:
        c.post(os.environ["DAPTA_EMAIL_FLOW_URL"], json=payload).raise_for_status()


def enviar(payload: Dict[str, Any]) -> None:
    """`payload` = {to, subject, html, text}. No lanza nunca."""
    try:
        if _smtp_configurado():
            _por_smtp(payload)
        elif os.environ.get("DAPTA_EMAIL_FLOW_URL"):
            _por_flow_de_dapta(payload)
        else:
            return
        logger.info("correo enviado a ...%s (%s)", str(payload.get("to"))[-12:], payload.get("subject", "")[:40])
    except Exception as exc:                  # la demo ya se entregó en pantalla
        logger.warning("no se pudo enviar el correo: %s: %s", type(exc).__name__, exc)
