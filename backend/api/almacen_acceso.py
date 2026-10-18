"""
api/almacen_acceso.py
=====================
Dónde viven las cuentas del login. Dos implementaciones con la MISMA interfaz:

  * `AlmacenPostgres`: producción. Tablas del esquema `acceso`
    (supabase/migrations/20261014090000_cuentas_login.sql) en cualquier Postgres: hoy la base de
    Supabase `machea-leads` usada como Postgres normal, mañana la nube que se elija. Se conecta con
    `DATABASE_URL` (variable de entorno de Render; nunca en el repo).
  * `AlmacenMemoria`: pruebas y demos locales. No persiste.

Las dos cumplen también `cuentas.AlmacenCuentas` (listar/aprobar/rechazar), así que el panel /admin
usa el mismo almacén que el login.

Este módulo solo guarda y lee: las reglas (validación, hash de la clave, topes, correos) están en
`api/acceso.py`.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from api.cuentas import CuentaNoExiste, EstadoInvalido

ESTADOS = ("sin_confirmar", "pendiente", "aprobada", "rechazada")


class CorreoOcupado(Exception):
    pass


class UsuarioOcupado(Exception):
    pass


def ahora() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: Optional[datetime]) -> str:
    if d is None:
        return ""
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def publica(fila: Dict[str, Any]) -> Dict[str, Any]:
    """La cuenta con la forma del contrato (`Cuenta`). Nunca incluye el hash de la clave."""
    metodos = []
    if fila.get("clave_hash"):
        metodos.append("correo")
    if fila.get("google_sub"):
        metodos.append("google")
    return {
        "id": str(fila["id"]),
        "usuario": fila["usuario"],
        "correo": fila["correo"],
        "estado": fila["estado"],
        "tipo": fila.get("tipo"),
        "metodos": metodos,
        "creadaEn": _iso(fila.get("creada_en")),
    }


# ---------------------------------------------------------------------------
# Memoria (pruebas)
# ---------------------------------------------------------------------------

class AlmacenMemoria:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.cuentas: Dict[str, Dict[str, Any]] = {}
        self.enlaces: Dict[str, Dict[str, Any]] = {}
        self.sesiones: Dict[str, Dict[str, Any]] = {}
        self.intentos: List[Dict[str, Any]] = []

    # --- cuentas
    def crear_cuenta(self, usuario: str, correo: str, clave_hash: str) -> Dict[str, Any]:
        with self._lock:
            if any(c["correo"] == correo for c in self.cuentas.values()):
                raise CorreoOcupado(correo)
            if any(c["usuario"] == usuario for c in self.cuentas.values()):
                raise UsuarioOcupado(usuario)
            fila = {"id": str(uuid.uuid4()), "usuario": usuario, "correo": correo, "clave_hash": clave_hash,
                    "google_sub": None, "estado": "sin_confirmar", "tipo": None, "creada_en": ahora()}
            self.cuentas[fila["id"]] = fila
            return dict(fila)

    def por_correo(self, correo: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            return next((dict(c) for c in self.cuentas.values() if c["correo"] == correo), None)

    def por_id(self, id_: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            c = self.cuentas.get(str(id_))
            return dict(c) if c else None

    def confirmar(self, id_: str) -> None:
        with self._lock:
            c = self.cuentas.get(str(id_))
            if c and c["estado"] == "sin_confirmar":
                c["estado"] = "pendiente"

    def cambiar_clave(self, id_: str, clave_hash: str) -> None:
        """Nueva clave + cierra todas las sesiones de la cuenta. Abrir el enlace confirma el correo."""
        with self._lock:
            c = self.cuentas[str(id_)]
            c["clave_hash"] = clave_hash
            if c["estado"] == "sin_confirmar":
                c["estado"] = "pendiente"
            for h in [h for h, s in self.sesiones.items() if s["cuenta_id"] == str(id_)]:
                del self.sesiones[h]

    # --- enlaces
    def guardar_enlace(self, hash_: str, tipo: str, cuenta_id: str, expira: datetime) -> None:
        with self._lock:
            for h in [h for h, e in self.enlaces.items() if e["cuenta_id"] == str(cuenta_id) and e["tipo"] == tipo]:
                del self.enlaces[h]
            self.enlaces[hash_] = {"tipo": tipo, "cuenta_id": str(cuenta_id), "expira": expira}

    def ver_enlace(self, hash_: str, tipo: str) -> Optional[str]:
        with self._lock:
            e = self.enlaces.get(hash_)
            return e["cuenta_id"] if e and e["tipo"] == tipo and e["expira"] > ahora() else None

    def consumir_enlace(self, hash_: str, tipo: str) -> Optional[str]:
        with self._lock:
            cuenta_id = self.ver_enlace(hash_, tipo)
            if cuenta_id:
                del self.enlaces[hash_]
            return cuenta_id

    # --- sesiones
    def crear_sesion(self, hash_: str, cuenta_id: str, recordar: bool, expira: datetime) -> None:
        with self._lock:
            self.sesiones[hash_] = {"cuenta_id": str(cuenta_id), "recordar": recordar, "expira": expira}

    def sesion(self, hash_: str) -> Optional[Dict[str, Any]]:
        """{"cuenta": fila, "expira": datetime} si la sesión existe y no venció."""
        with self._lock:
            s = self.sesiones.get(hash_)
            if not s or s["expira"] <= ahora():
                self.sesiones.pop(hash_, None)
                return None
            c = self.cuentas.get(s["cuenta_id"])
            return {"cuenta": dict(c), "expira": s["expira"]} if c else None

    def borrar_sesion(self, hash_: str) -> None:
        with self._lock:
            self.sesiones.pop(hash_, None)

    # --- intentos fallidos
    def registrar_fallo(self, correo: str) -> None:
        with self._lock:
            self.intentos.append({"correo": correo, "en": ahora()})

    def contar_fallos(self, correo: str, desde: datetime) -> int:
        with self._lock:
            return sum(1 for i in self.intentos if i["correo"] == correo and i["en"] >= desde)

    def limpiar_fallos(self, correo: str) -> None:
        with self._lock:
            self.intentos = [i for i in self.intentos if i["correo"] != correo]

    # --- /admin (cuentas.AlmacenCuentas)
    def listar(self, estado: Optional[str]) -> List[Dict[str, Any]]:
        with self._lock:
            return [publica(c) for c in self.cuentas.values() if estado is None or c["estado"] == estado]

    def _decidir(self, id_: str, estado: str, tipo: Optional[str]) -> Dict[str, Any]:
        with self._lock:
            c = self.cuentas.get(str(id_))
            if c is None:
                raise CuentaNoExiste(id_)
            if c["estado"] == "sin_confirmar":
                raise EstadoInvalido(id_)
            c["estado"] = estado
            if tipo:
                c["tipo"] = tipo
            return publica(c)

    def aprobar(self, id_: str, tipo: str) -> Dict[str, Any]:
        return self._decidir(id_, "aprobada", tipo)

    def rechazar(self, id_: str) -> Dict[str, Any]:
        return self._decidir(id_, "rechazada", None)

    def limpiar_vencidos(self) -> None:
        with self._lock:
            n = ahora()
            self.enlaces = {h: e for h, e in self.enlaces.items() if e["expira"] > n}
            self.sesiones = {h: s for h, s in self.sesiones.items() if s["expira"] > n}
            self.intentos = [i for i in self.intentos if i["en"] > n - timedelta(days=1)]


# ---------------------------------------------------------------------------
# Postgres (producción)
# ---------------------------------------------------------------------------

_COLUMNAS = "id, usuario, correo, clave_hash, google_sub, estado, tipo, creada_en"


class AlmacenPostgres:
    """Postgres con psycopg 3 y un pool chico de conexiones.

    `prepare_threshold=None`: sin sentencias preparadas, para que funcione igual detrás de un pooler en
    modo transacción (pgbouncer / Supavisor) que en conexión directa o modo sesión."""

    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 5) -> None:
        from psycopg.rows import dict_row
        from psycopg_pool import ConnectionPool

        self.pool = ConnectionPool(
            dsn, min_size=min_size, max_size=max_size, open=True, timeout=10,
            kwargs={"row_factory": dict_row, "prepare_threshold": None, "autocommit": False},
        )

    def cerrar(self) -> None:
        self.pool.close()

    # --- fuentes de leads del CRM (api/fuentes.py): tablas del esquema crm, de la migración del CRM
    def fuentes(self, cuenta_id: str) -> List[Dict[str, str]]:
        import psycopg

        from api.fuentes import CrmNoInstalado

        try:
            with self.pool.connection() as con:
                filas = con.execute(
                    "select tipo, slug from crm.empresa_fuentes where empresa_id = %s::uuid order by tipo, slug",
                    (cuenta_id,)).fetchall()
        except psycopg.errors.UndefinedTable as exc:
            raise CrmNoInstalado() from exc
        except psycopg.errors.InvalidTextRepresentation:
            return []
        return [{"tipo": f["tipo"], "slug": f["slug"]} for f in filas]

    def reemplazar_fuentes(self, cuenta_id: str, fuentes: List[Dict[str, str]]) -> List[Dict[str, str]]:
        import psycopg

        from api.fuentes import CrmNoInstalado, FuenteOcupada

        try:
            with self.pool.connection() as con:
                with con.transaction():
                    cuenta = con.execute("select usuario, estado from acceso.cuentas where id = %s::uuid for update",
                                         (cuenta_id,)).fetchone()
                    if cuenta is None:
                        raise CuentaNoExiste(cuenta_id)
                    if cuenta["estado"] != "aprobada":
                        raise EstadoInvalido(cuenta_id)
                    # La empresa del CRM puede no existir todavía (la crea su primera visita): se crea aquí.
                    con.execute("insert into crm.empresas (id, nombre) values (%s::uuid, %s) on conflict (id) do nothing",
                                (cuenta_id, cuenta["usuario"]))
                    con.execute("delete from crm.empresa_fuentes where empresa_id = %s::uuid", (cuenta_id,))
                    for f in fuentes:
                        try:
                            with con.transaction():
                                con.execute("insert into crm.empresa_fuentes (empresa_id, tipo, slug) values (%s::uuid, %s, %s)",
                                            (cuenta_id, f["tipo"], f["slug"]))
                        except psycopg.errors.UniqueViolation as exc:
                            raise FuenteOcupada(f["tipo"], f["slug"]) from exc
        except psycopg.errors.UndefinedTable as exc:
            raise CrmNoInstalado() from exc
        except psycopg.errors.InvalidTextRepresentation as exc:
            raise CuentaNoExiste(cuenta_id) from exc
        return self.fuentes(cuenta_id)

    def _uno(self, sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        with self.pool.connection() as con:
            return con.execute(sql, params).fetchone()

    def _ejecutar(self, sql: str, params: tuple = ()) -> int:
        with self.pool.connection() as con:
            return con.execute(sql, params).rowcount

    # --- cuentas
    def crear_cuenta(self, usuario: str, correo: str, clave_hash: str) -> Dict[str, Any]:
        import psycopg

        try:
            fila = self._uno(
                f"insert into acceso.cuentas (usuario, correo, clave_hash) values (%s, %s, %s) returning {_COLUMNAS}",
                (usuario, correo, clave_hash))
        except psycopg.errors.UniqueViolation as exc:
            restriccion = getattr(getattr(exc, "diag", None), "constraint_name", "") or ""
            if "correo" in restriccion:
                raise CorreoOcupado(correo) from exc
            raise UsuarioOcupado(usuario) from exc
        return dict(fila)  # type: ignore[arg-type]

    def por_correo(self, correo: str) -> Optional[Dict[str, Any]]:
        return self._uno(f"select {_COLUMNAS} from acceso.cuentas where correo = %s", (correo,))

    def por_id(self, id_: str) -> Optional[Dict[str, Any]]:
        try:
            uuid.UUID(str(id_))
        except ValueError:
            return None
        return self._uno(f"select {_COLUMNAS} from acceso.cuentas where id = %s", (str(id_),))

    def confirmar(self, id_: str) -> None:
        self._ejecutar("update acceso.cuentas set estado = 'pendiente', confirmada_en = now() "
                       "where id = %s and estado = 'sin_confirmar'", (str(id_),))

    def cambiar_clave(self, id_: str, clave_hash: str) -> None:
        with self.pool.connection() as con:
            con.execute("update acceso.cuentas set clave_hash = %s, "
                        "estado = case when estado = 'sin_confirmar' then 'pendiente' else estado end, "
                        "confirmada_en = coalesce(confirmada_en, now()) where id = %s", (clave_hash, str(id_)))
            con.execute("delete from acceso.sesiones where cuenta_id = %s", (str(id_),))

    # --- enlaces
    def guardar_enlace(self, hash_: str, tipo: str, cuenta_id: str, expira: datetime) -> None:
        with self.pool.connection() as con:
            con.execute("delete from acceso.enlaces where cuenta_id = %s and tipo = %s", (str(cuenta_id), tipo))
            con.execute("insert into acceso.enlaces (hash, tipo, cuenta_id, expira) values (%s, %s, %s, %s)",
                        (hash_, tipo, str(cuenta_id), expira))

    def ver_enlace(self, hash_: str, tipo: str) -> Optional[str]:
        f = self._uno("select cuenta_id from acceso.enlaces where hash = %s and tipo = %s and expira > now()", (hash_, tipo))
        return str(f["cuenta_id"]) if f else None

    def consumir_enlace(self, hash_: str, tipo: str) -> Optional[str]:
        # Borrar y devolver en una sola sentencia: dos pestañas no pueden gastar el mismo enlace.
        f = self._uno("delete from acceso.enlaces where hash = %s and tipo = %s and expira > now() returning cuenta_id",
                      (hash_, tipo))
        return str(f["cuenta_id"]) if f else None

    # --- sesiones
    def crear_sesion(self, hash_: str, cuenta_id: str, recordar: bool, expira: datetime) -> None:
        self._ejecutar("insert into acceso.sesiones (hash, cuenta_id, recordar, expira) values (%s, %s, %s, %s)",
                       (hash_, str(cuenta_id), recordar, expira))

    def sesion(self, hash_: str) -> Optional[Dict[str, Any]]:
        f = self._uno(
            "select s.expira as sesion_expira, " + ", ".join("c." + x.strip() for x in _COLUMNAS.split(",")) +
            " from acceso.sesiones s join acceso.cuentas c on c.id = s.cuenta_id where s.hash = %s and s.expira > now()",
            (hash_,))
        if not f:
            return None
        expira = f.pop("sesion_expira")
        return {"cuenta": f, "expira": expira}

    def borrar_sesion(self, hash_: str) -> None:
        self._ejecutar("delete from acceso.sesiones where hash = %s", (hash_,))

    # --- intentos fallidos
    def registrar_fallo(self, correo: str) -> None:
        self._ejecutar("insert into acceso.intentos (correo) values (%s)", (correo,))

    def contar_fallos(self, correo: str, desde: datetime) -> int:
        f = self._uno("select count(*)::int as n from acceso.intentos where correo = %s and en >= %s", (correo, desde))
        return int(f["n"]) if f else 0

    def limpiar_fallos(self, correo: str) -> None:
        self._ejecutar("delete from acceso.intentos where correo = %s", (correo,))

    # --- /admin (cuentas.AlmacenCuentas)
    def listar(self, estado: Optional[str]) -> List[Dict[str, Any]]:
        with self.pool.connection() as con:
            if estado:
                filas = con.execute(f"select {_COLUMNAS} from acceso.cuentas where estado = %s "
                                    "order by creada_en desc limit 500", (estado,)).fetchall()
            else:
                filas = con.execute(f"select {_COLUMNAS} from acceso.cuentas order by creada_en desc limit 500").fetchall()
        return [publica(f) for f in filas]

    def _decidir(self, id_: str, estado: str, tipo: Optional[str]) -> Dict[str, Any]:
        actual = self.por_id(id_)
        if actual is None:
            raise CuentaNoExiste(id_)
        if actual["estado"] == "sin_confirmar":
            raise EstadoInvalido(id_)
        f = self._uno(
            f"update acceso.cuentas set estado = %s, tipo = coalesce(%s, tipo), decidida_en = now() "
            f"where id = %s and estado <> 'sin_confirmar' returning {_COLUMNAS}", (estado, tipo, str(id_)))
        if f is None:                                  # cambió entre la lectura y la escritura
            raise EstadoInvalido(id_)
        return publica(f)

    def aprobar(self, id_: str, tipo: str) -> Dict[str, Any]:
        return self._decidir(id_, "aprobada", tipo)

    def rechazar(self, id_: str) -> Dict[str, Any]:
        return self._decidir(id_, "rechazada", None)

    def limpiar_vencidos(self) -> None:
        with self.pool.connection() as con:
            con.execute("delete from acceso.enlaces where expira <= now()")
            con.execute("delete from acceso.sesiones where expira <= now()")
            con.execute("delete from acceso.intentos where en < now() - interval '1 day'")
