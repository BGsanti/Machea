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
from typing import Any, Dict, Tuple

from api.metricas import metricas

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
        metricas.registrar("correo_enviado", "Correo enviado", "ok")
    except Exception as exc:                  # la demo ya se entregó en pantalla
        logger.warning("no se pudo enviar el correo: %s: %s", type(exc).__name__, exc)
        metricas.registrar("correo_error", f"No se pudo enviar el correo ({type(exc).__name__})", "error")


def modo() -> str:
    """"smtp", "flow" o "ninguno": por dónde saldría un correo hoy."""
    if _smtp_configurado():
        return "smtp"
    return "flow" if os.environ.get("DAPTA_EMAIL_FLOW_URL") else "ninguno"


def probar() -> Tuple[bool, str]:
    """Inicia sesión en el SMTP SIN enviar nada: comprueba la contraseña de aplicación.

    Devuelve (ok, mensaje para mostrar). Nunca incluye la contraseña ni lanza.
    """
    if not _smtp_configurado():
        if os.environ.get("DAPTA_EMAIL_FLOW_URL"):
            return False, "El correo sale por un flow de Dapta: no se puede probar sin enviar un mensaje."
        return False, "Falta configurar SMTP_USER y SMTP_PASSWORD en Render."
    usuario = os.environ["SMTP_USER"].strip()
    clave = os.environ["SMTP_PASSWORD"].replace(" ", "").strip()
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    try:
        puerto = int(os.environ.get("SMTP_PORT", "465"))
    except ValueError:
        return False, "SMTP_PORT no es un número."
    contexto = ssl.create_default_context()
    try:
        if puerto == 465:
            with smtplib.SMTP_SSL(host, puerto, timeout=12, context=contexto) as s:
                s.login(usuario, clave)
        else:
            with smtplib.SMTP(host, puerto, timeout=12) as s:
                s.starttls(context=contexto)
                s.login(usuario, clave)
    except smtplib.SMTPAuthenticationError:
        return False, "El servidor rechazó el usuario o la contraseña de aplicación."
    except (OSError, smtplib.SMTPException) as exc:
        return False, f"No se pudo conectar con {host}:{puerto} ({type(exc).__name__})."
    arroba = usuario.find("@")
    visible = usuario[:2] + "•••" + usuario[arroba:] if arroba > 2 else "•••"
    return True, f"Inicio de sesión correcto en {host} como {visible}."
