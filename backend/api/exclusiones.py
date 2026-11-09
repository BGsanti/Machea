"""
api/exclusiones.py
==================
La lista de exclusión: números que pidieron no volver a ser contactados. /privacidad/ la promete ("si nos pides que
no te contactemos, guardamos solo tu número en una lista de exclusión") y la Ley 2300 de 2023 (art. 5, par. 2) exige
un mecanismo ágil para dejar de recibir llamadas y mensajes (design/legal/LLAMADAS_LEY_2300.md).

QUIÉN LA LLENA
  * Manuela, cuando la persona dice "no me llamen más" (motivo_no_agenda = pidio_no_ser_contactado, webhook de app.py).
  * Camila, cuando el prospecto pide no ser contactado (no_contactar, api/captacion.py).

QUIÉN LA CONSULTA
  * Camila, antes de marcar; el seguimiento por WhatsApp (api/seguimiento.py) y la cola de contactos programados
    (api/programados.py), antes de enviar.
  * /api/llamar NO la usa para bloquear: si la persona vuelve a pedir la llamada en el formulario, es una solicitud
    nueva y expresa, y sale de la lista (decisión de Diego, 2026-11-09).

Solo se guardan los últimos 10 dígitos del número, sin nombre ni otros datos.

PERSISTENCIA
  Tabla public.contactos_excluidos (supabase/migrations/20261109120000_exclusiones_y_programados.sql), con
  SUPABASE_URL + SUPABASE_SERVICE_KEY. Sin ellas funciona en memoria. Si la tabla todavía no existe, se avisa en el
  registro y no se bloquea a nadie: el código puede salir antes que la migración sin romper las llamadas.
"""

from __future__ import annotations

import logging
import os
import re
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("uvicorn.error")

ORIGENES = {"manuela", "camila", "whatsapp", "correo", "manual"}


def digitos(telefono: Optional[str]) -> Optional[str]:
    """Los últimos 10 dígitos: la misma llave que usan limites.py y llamadas.py."""
    d = re.sub(r"\D", "", telefono or "")
    return d[-10:] if len(d) >= 10 else None


class AlmacenMemoria:
    """Sin Supabase (local y pruebas). Se pierde al reiniciar."""
    nombre = "memoria"

    def __init__(self) -> None:
        self.filas: Dict[str, Dict[str, Any]] = {}
        self._cerrojo = threading.Lock()

    def esta(self, d: str) -> bool:
        with self._cerrojo:
            return d in self.filas

    def agregar(self, fila: Dict[str, Any]) -> None:
        with self._cerrojo:
            self.filas.setdefault(fila["telefono_digitos"], {**fila, "creado_en": datetime.now(timezone.utc).isoformat()})

    def quitar(self, d: str) -> None:
        with self._cerrojo:
            self.filas.pop(d, None)


class AlmacenSupabase:
    """PostgREST con la clave service_role, como en api/llamadas.py."""
    nombre = "supabase"

    def __init__(self, url: str, clave: str, cliente: Any = None) -> None:
        import httpx
        self.base = url.rstrip("/") + "/rest/v1/contactos_excluidos"
        self.h = {"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"}
        self.c = cliente or httpx.Client(timeout=10.0)

    def _req(self, metodo: str, *, params: Optional[dict] = None, cuerpo: Any = None, prefer: str = "return=minimal") -> Any:
        r = self.c.request(metodo, self.base, params=params, json=cuerpo, headers={**self.h, "Prefer": prefer})
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {metodo} contactos_excluidos: {r.status_code} {r.text[:200]}")
        return r.json() if r.content else []

    def esta(self, d: str) -> bool:
        return bool(self._req("GET", params={"select": "telefono_digitos", "telefono_digitos": f"eq.{d}", "limit": "1"},
                              prefer="return=representation"))

    def agregar(self, fila: Dict[str, Any]) -> None:
        self._req("POST", params={"on_conflict": "telefono_digitos"}, cuerpo=fila,
                  prefer="resolution=ignore-duplicates,return=minimal")

    def quitar(self, d: str) -> None:
        self._req("DELETE", params={"telefono_digitos": f"eq.{d}"})


_ALMACEN: Any = None


def almacen() -> Any:
    global _ALMACEN
    if _ALMACEN is None:
        url, clave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
        _ALMACEN = AlmacenSupabase(url, clave) if (url and clave) else AlmacenMemoria()
        logger.info("exclusiones: almacén %s", _ALMACEN.nombre)
    return _ALMACEN


def configurar_almacen(a: Any) -> None:
    """Para las pruebas."""
    global _ALMACEN
    _ALMACEN = a


def excluido(telefono: Optional[str]) -> bool:
    """¿Este número pidió no ser contactado? Si la base falla, no bloquea (y lo deja en el registro)."""
    d = digitos(telefono)
    if not d:
        return False
    try:
        return almacen().esta(d)
    except Exception as exc:
        logger.warning("exclusiones: no se pudo consultar la lista (¿falta la migración?): %s", exc)
        return False


def excluir(telefono: Optional[str], origen: str, motivo: Optional[str] = None) -> bool:
    """Agrega el número a la lista. Devuelve si quedó guardado."""
    d = digitos(telefono)
    if not d:
        return False
    try:
        almacen().agregar({"telefono_digitos": d, "origen": origen if origen in ORIGENES else "manual",
                           "motivo": (motivo or "")[:120] or None})
        logger.info("exclusiones: ...%s pidió no ser contactado (%s)", d[-4:], origen)
        return True
    except Exception as exc:
        logger.error("exclusiones: NO se pudo guardar el pedido de no contactar de ...%s: %s", d[-4:], exc)
        return False


def readmitir(telefono: Optional[str]) -> None:
    """La persona volvió a pedir que la llamen: sale de la lista."""
    d = digitos(telefono)
    if not d:
        return
    try:
        almacen().quitar(d)
    except Exception as exc:
        logger.warning("exclusiones: no se pudo quitar ...%s de la lista: %s", d[-4:], exc)
