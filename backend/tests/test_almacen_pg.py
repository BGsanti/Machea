"""Pruebas del almacén Postgres del login contra una base REAL.   Desde backend/:

    TEST_DATABASE_URL=postgresql://... python -m unittest tests.test_almacen_pg -v

La base tiene que tener aplicada supabase/migrations/20261014090000_cuentas_login.sql. Sin
TEST_DATABASE_URL las pruebas se saltan (así corren en cualquier máquina sin Postgres).
NUNCA apuntar a la base de producción: estas pruebas crean y borran cuentas."""

import os
import sys
import unittest
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import acceso  # noqa: E402
from api.almacen_acceso import ahora, CorreoOcupado, UsuarioOcupado  # noqa: E402
from api.cuentas import CuentaNoExiste, EstadoInvalido  # noqa: E402

DSN = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(DSN, "sin TEST_DATABASE_URL")
class TestAlmacenPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from api.almacen_acceso import AlmacenPostgres

        cls.a = AlmacenPostgres(DSN, min_size=1, max_size=1)

    @classmethod
    def tearDownClass(cls):
        cls.a.cerrar()

    def setUp(self):
        with self.a.pool.connection() as con:
            con.execute("delete from acceso.intentos")
            con.execute("delete from acceso.cuentas")

    def nueva(self, usuario="constructora-andes", correo="ventas@andes.co"):
        return self.a.crear_cuenta(usuario, correo, acceso.hash_clave("una frase larga 2026"))

    def test_crear_leer_y_unicos(self):
        c = self.nueva()
        self.assertEqual(c["estado"], "sin_confirmar")
        self.assertEqual(self.a.por_correo("ventas@andes.co")["id"], c["id"])
        self.assertEqual(self.a.por_id(str(c["id"]))["usuario"], "constructora-andes")
        self.assertIsNone(self.a.por_id("no-es-uuid"))
        with self.assertRaises(CorreoOcupado):
            self.nueva(usuario="otra")
        with self.assertRaises(UsuarioOcupado):
            self.nueva(correo="b@andes.co")

    def test_enlaces_de_un_solo_uso_y_reemplazo(self):
        c = self.nueva()
        self.a.guardar_enlace("a" * 64, "confirmar", str(c["id"]), ahora() + timedelta(hours=1))
        self.a.guardar_enlace("b" * 64, "confirmar", str(c["id"]), ahora() + timedelta(hours=1))   # reemplaza al anterior
        self.assertIsNone(self.a.ver_enlace("a" * 64, "confirmar"))
        self.assertIsNone(self.a.ver_enlace("b" * 64, "recuperar"))                             # otro tipo
        self.assertEqual(self.a.consumir_enlace("b" * 64, "confirmar"), str(c["id"]))
        self.assertIsNone(self.a.consumir_enlace("b" * 64, "confirmar"))
        self.a.guardar_enlace("c" * 64, "recuperar", str(c["id"]), ahora() - timedelta(seconds=1))
        self.assertIsNone(self.a.ver_enlace("c" * 64, "recuperar"))                             # vencido

    def test_confirmar_sesiones_y_cambiar_clave(self):
        c = self.nueva()
        self.a.confirmar(str(c["id"]))
        self.assertEqual(self.a.por_id(str(c["id"]))["estado"], "pendiente")
        self.a.crear_sesion("d" * 64, str(c["id"]), True, ahora() + timedelta(days=30))
        s = self.a.sesion("d" * 64)
        self.assertEqual(s["cuenta"]["usuario"], "constructora-andes")
        self.a.crear_sesion("e" * 64, str(c["id"]), False, ahora() - timedelta(seconds=1))
        self.assertIsNone(self.a.sesion("e" * 64))
        self.a.cambiar_clave(str(c["id"]), acceso.hash_clave("otra frase larga 2027"))
        self.assertIsNone(self.a.sesion("d" * 64))                                              # cerró las sesiones
        self.assertTrue(acceso.verificar_clave("otra frase larga 2027", self.a.por_id(str(c["id"]))["clave_hash"]))

    def test_intentos(self):
        for _ in range(3):
            self.a.registrar_fallo("x@y.co")
        self.assertEqual(self.a.contar_fallos("x@y.co", ahora() - timedelta(minutes=15)), 3)
        self.a.limpiar_fallos("x@y.co")
        self.assertEqual(self.a.contar_fallos("x@y.co", ahora() - timedelta(minutes=15)), 0)

    def test_admin_listar_aprobar_rechazar(self):
        c = self.nueva()
        with self.assertRaises(EstadoInvalido):
            self.a.aprobar(str(c["id"]), "constructora")
        self.a.confirmar(str(c["id"]))
        [p] = self.a.listar("pendiente")
        self.assertNotIn("clave_hash", p)
        self.assertEqual(p["metodos"], ["correo"])
        r = self.a.aprobar(str(c["id"]), "inmobiliaria")
        self.assertEqual((r["estado"], r["tipo"]), ("aprobada", "inmobiliaria"))
        self.assertEqual(self.a.rechazar(str(c["id"]))["estado"], "rechazada")
        with self.assertRaises(CuentaNoExiste):
            self.a.rechazar("00000000-0000-0000-0000-000000000000")
        self.assertEqual(len(self.a.listar(None)), 1)

    def test_limpiar_vencidos(self):
        c = self.nueva()
        self.a.guardar_enlace("f" * 64, "confirmar", str(c["id"]), ahora() - timedelta(seconds=1))
        self.a.limpiar_vencidos()
        with self.a.pool.connection() as con:
            self.assertEqual(con.execute("select count(*) as n from acceso.enlaces").fetchone()["n"], 0)


if __name__ == "__main__":
    unittest.main()
