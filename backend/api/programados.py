"""
api/programados.py
==================
Llamadas y mensajes que se pidieron fuera del horario de la Ley 2300 y se hacen cuando abre el siguiente horario
(api/horario.py, design/legal/LLAMADAS_LEY_2300.md).

  * /api/llamar fuera de horario guarda la llamada de Manuela aquí y le dice a la persona cuándo la llaman.
  * El seguimiento por WhatsApp (api/seguimiento.py) guarda aquí lo que tocaba mandar de noche, en domingo o festivo.

QUIÉN LA MUEVE
  `procesar()` toma lo que ya venció, vuelve a revisar el horario y la lista de exclusión, y lo dispara. No hay un
  temporizador dentro de la app (Render duerme en el plan gratuito): lo invoca el mismo cron externo de Camila, que
  llama a POST /api/captacion/cola cada ~10 minutos, o directamente POST /api/programados/cola (api/captacion.py).

CÓMO SE DISPARA
  Cada tipo registra su función en EJECUTORES: app.py registra "llamada" y seguimiento.py registra "whatsapp". Así este
  módulo no importa a ninguno de los dos (evita importaciones circulares).

PERSISTENCIA
  Tabla public.contactos_programados (supabase/migrations/20261109120000_exclusiones_y_programados.sql), con
  SUPABASE_URL + SUPABASE_SERVICE_KEY. Sin ellas funciona en memoria (se pierde al reiniciar).
"""

from __future__ import annotations

import logging
import os
import threading
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from api import exclusiones, horario

logger = logging.getLogger("uvicorn.error")

TIPOS = {"llamada", "whatsapp"}
MAX_INTENTOS = 3

# tipo -> función que recibe el payload y lo dispara (lanza una excepción si falló).
EJECUTORES: Dict[str, Callable[[Dict[str, Any]], Any]] = {}


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class AlmacenMemoria:
    """Sin Supabase (local y pruebas). Se pierde al reiniciar."""
    nombre = "memoria"

    def __init__(self) -> None:
        self.filas: List[Dict[str, Any]] = []
        self._cerrojo = threading.Lock()

    def crear(self, fila: Dict[str, Any]) -> None:
        with self._cerrojo:
            self.filas.append({**fila, "estado": "pendiente", "intentos": 0, "creado_en": _ahora().isoformat()})

    def vencidos(self, hasta: datetime, limite: int) -> List[Dict[str, Any]]:
        with self._cerrojo:
            filas = [dict(f) for f in self.filas
                     if f["estado"] == "pendiente" and datetime.fromisoformat(f["programado_para"]) <= hasta]
        return sorted(filas, key=lambda f: f["programado_para"])[:limite]

    def actualizar(self, id_: str, **cambios: Any) -> None:
        with self._cerrojo:
            for f in self.filas:
                if f["id"] == id_:
                    f.update(cambios)


class AlmacenSupabase:
    """PostgREST con la clave service_role, como en api/llamadas.py."""
    nombre = "supabase"

    def __init__(self, url: str, clave: str, cliente: Any = None) -> None:
        import httpx
        self.base = url.rstrip("/") + "/rest/v1/contactos_programados"
        self.h = {"apikey": clave, "Authorization": f"Bearer {clave}", "Content-Type": "application/json"}
        self.c = cliente or httpx.Client(timeout=10.0)

    def _req(self, metodo: str, *, params: Optional[dict] = None, cuerpo: Any = None, prefer: str = "return=minimal") -> Any:
        r = self.c.request(metodo, self.base, params=params, json=cuerpo, headers={**self.h, "Prefer": prefer})
        if r.status_code >= 400:
            raise RuntimeError(f"Supabase {metodo} contactos_programados: {r.status_code} {r.text[:200]}")
        return r.json() if r.content else []

    def crear(self, fila: Dict[str, Any]) -> None:
        self._req("POST", cuerpo=fila)

    def vencidos(self, hasta: datetime, limite: int) -> List[Dict[str, Any]]:
        return self._req("GET", prefer="return=representation", params={
            "select": "id,tipo,telefono_digitos,payload,programado_para,intentos", "estado": "eq.pendiente",
            "programado_para": f"lte.{hasta.isoformat()}", "order": "programado_para.asc", "limit": str(limite)})

    def actualizar(self, id_: str, **cambios: Any) -> None:
        self._req("PATCH", params={"id": f"eq.{id_}"}, cuerpo=cambios)


_ALMACEN: Any = None


def almacen() -> Any:
    global _ALMACEN
    if _ALMACEN is None:
        url, clave = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
        _ALMACEN = AlmacenSupabase(url, clave) if (url and clave) else AlmacenMemoria()
        logger.info("programados: almacén %s", _ALMACEN.nombre)
    return _ALMACEN


def configurar_almacen(a: Any) -> None:
    """Para las pruebas."""
    global _ALMACEN
    _ALMACEN = a


def programar(tipo: str, telefono: str, payload: Dict[str, Any], cuando: datetime) -> bool:
    """Guarda el contacto para `cuando`. Devuelve si quedó guardado."""
    if tipo not in TIPOS:
        raise ValueError(f"tipo desconocido: {tipo}")
    try:
        almacen().crear({"id": str(uuid.uuid4()), "tipo": tipo, "telefono_digitos": exclusiones.digitos(telefono),
                         "payload": payload, "programado_para": cuando.isoformat()})
        return True
    except Exception as exc:
        logger.error("programados: no se pudo guardar el %s para ...%s: %s", tipo, str(telefono)[-4:], exc)
        return False


def procesar(maximo: int = 5, ahora: Optional[datetime] = None) -> Dict[str, Any]:
    """Dispara lo que ya venció, dentro del horario legal. Pocos por tanda, como la cola de Camila."""
    ahora = ahora or datetime.now(horario.TZ)
    ok, motivo = horario.ventana_permitida(ahora)
    if not ok:
        return {"status": "fuera_de_horario", "detalle": motivo, "hechos": 0}
    try:
        filas = almacen().vencidos(ahora, maximo)
    except Exception as exc:
        logger.warning("programados: no se pudo leer la cola (¿falta la migración?): %s", exc)
        return {"status": "error", "detalle": "no se pudo leer la cola", "hechos": 0}
    hechos = cancelados = errores = 0
    for f in filas:
        if exclusiones.excluido(f.get("telefono_digitos")):
            almacen().actualizar(f["id"], estado="cancelado", hecho_en=_ahora().isoformat(), payload=None)
            cancelados += 1
            continue
        ejecutor = EJECUTORES.get(f["tipo"])
        try:
            if ejecutor is None:
                raise RuntimeError(f"sin ejecutor para {f['tipo']}")
            ejecutor(dict(f["payload"] or {}))
        except Exception as exc:
            intentos = int(f.get("intentos") or 0) + 1
            almacen().actualizar(f["id"], intentos=intentos, estado="error" if intentos >= MAX_INTENTOS else "pendiente")
            logger.warning("programados: falló el %s %s (intento %s): %s", f["tipo"], f["id"], intentos, exc)
            errores += 1
            continue
        # Hecho: ya no hace falta guardar el nombre ni los datos del pedido (minimización, Ley 1581).
        almacen().actualizar(f["id"], estado="hecho", hecho_en=_ahora().isoformat(), payload=None)
        hechos += 1
    return {"status": "ok", "hechos": hechos, "cancelados": cancelados, "errores": errores}
