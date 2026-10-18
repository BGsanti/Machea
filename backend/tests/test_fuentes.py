"""Pruebas de las fuentes de leads del CRM en /admin (api/fuentes.py).
Desde backend/:  python -m unittest tests.test_fuentes -v

La parte de Postgres necesita una base con los esquemas acceso y crm (design/crm/PUESTA_EN_MARCHA.md):
    TEST_DATABASE_URL=postgresql://... python -m unittest tests.test_fuentes -v"""

import os
import sys
import unittest
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import admin, fuentes  # noqa: E402
from api import app as m  # noqa: E402
from api.cuentas import CuentaNoExiste, EstadoInvalido  # noqa: E402
from api.limites import limites  # noqa: E402
from api.metricas import metricas  # noqa: E402

CLAVE = "clave-de-prueba-bien-larga-123"
ENV = ["ADMIN_PASSWORD", "ADMIN_TOTP_SECRET", "ADMIN_SECRET", "ADMIN_SESION_MINUTOS"]


class Base(unittest.TestCase):
    def setUp(self):
        self.guardado = {k: os.environ.pop(k, None) for k in ENV}
        os.environ["ADMIN_PASSWORD"] = CLAVE
        admin._PAUSA_FALLO = 0
        admin.cerrojo.reiniciar()
        admin._REVOCADOS.clear()
        limites.reiniciar()
        metricas.reiniciar()
        self.almacen = fuentes.AlmacenFuentesMemoria({"a1": "aprobada", "b2": "aprobada", "p3": "pendiente"})
        fuentes.configurar_almacen(self.almacen)
        self.c = TestClient(m.app, raise_server_exceptions=False)
        r = self.c.post("/api/admin/login", json={"clave": CLAVE})
        self.assertEqual(r.status_code, 200, r.text)
        self.h = {"Authorization": "Bearer " + r.json()["token"]}

    def tearDown(self):
        fuentes.configurar_almacen(None)
        for k, v in self.guardado.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def poner(self, id_, lista):
        return self.c.put(f"/api/admin/cuentas/{id_}/fuentes", json={"fuentes": lista}, headers=self.h)


class TestFuentes(Base):
    def test_sin_sesion_401(self):
        self.assertEqual(self.c.get("/api/admin/cuentas/a1/fuentes").status_code, 401)
        self.assertEqual(self.c.put("/api/admin/cuentas/a1/fuentes", json={"fuentes": []}).status_code, 401)
        self.assertEqual(self.c.get("/api/admin/fuentes/opciones").status_code, 401)

    def test_opciones_salen_de_los_catalogos(self):
        o = self.c.get("/api/admin/fuentes/opciones", headers=self.h).json()
        self.assertIn("amarilo", [x["slug"] for x in o["marca"]])
        self.assertNotIn("machea", [x["slug"] for x in o["marca"]])
        self.assertEqual({x["slug"] for x in o["constructora"]}, {"amarilo", "bolivar", "colsubsidio", "cusezar"})
        self.assertTrue(len(o["inmobiliaria"]) > 3)

    def test_guardar_y_leer(self):
        r = self.poner("a1", [{"tipo": "marca", "slug": "amarilo"}, {"tipo": "constructora", "slug": "amarilo"},
                              {"tipo": "marca", "slug": "amarilo"}])
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["fuentes"], [{"tipo": "constructora", "slug": "amarilo"}, {"tipo": "marca", "slug": "amarilo"}])
        self.assertEqual(self.c.get("/api/admin/cuentas/a1/fuentes", headers=self.h).json()["fuentes"], r.json()["fuentes"])
        # Reemplaza, no suma.
        self.poner("a1", [{"tipo": "marca", "slug": "amarilo"}])
        self.assertEqual(len(self.almacen.fuentes("a1")), 1)

    def test_una_fuente_es_de_una_sola_empresa(self):
        self.poner("a1", [{"tipo": "constructora", "slug": "bolivar"}])
        r = self.poner("b2", [{"tipo": "constructora", "slug": "bolivar"}])
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"]["codigo"], "fuente_ocupada")
        self.assertEqual(self.almacen.fuentes("b2"), [])

    def test_solo_cuentas_aprobadas(self):
        self.assertEqual(self.poner("p3", [{"tipo": "marca", "slug": "cusezar"}]).status_code, 409)
        self.assertEqual(self.poner("zz", [{"tipo": "marca", "slug": "cusezar"}]).status_code, 404)

    def test_datos_invalidos(self):
        for f in ({"tipo": "otra", "slug": "x"}, {"tipo": "marca", "slug": "Con Espacios"}, {"tipo": "marca", "slug": "-x"},
                  {"tipo": "marca", "slug": "machea"}):
            self.assertEqual(self.poner("a1", [f]).status_code, 422, f)
        demasiadas = [{"tipo": "inmobiliaria", "slug": f"i{n}"} for n in range(fuentes.MAX_FUENTES + 1)]
        self.assertEqual(self.poner("a1", demasiadas).status_code, 422)

    def test_sin_almacen_503(self):
        fuentes.configurar_almacen(None)
        self.assertEqual(self.c.get("/api/admin/cuentas/a1/fuentes", headers=self.h).status_code, 503)

    def test_slug_igual_al_de_llamadas(self):
        self.assertEqual(fuentes.slug("Constructora Bolívar S.A."), "constructora-bolivar-s-a")
        self.assertEqual(fuentes.slug("MTS Consultoría + Gestión"), "mts-consultoria-gestion")


DSN = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(DSN, "sin TEST_DATABASE_URL")
class TestFuentesPostgres(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from api.almacen_acceso import AlmacenPostgres

        cls.a = AlmacenPostgres(DSN)

    @classmethod
    def tearDownClass(cls):
        cls.a.cerrar()

    def cuenta(self, estado):
        u = f"fuentes-{uuid.uuid4().hex[:8]}"
        with self.a.pool.connection() as con:
            return str(con.execute(
                "insert into acceso.cuentas (usuario, correo, clave_hash, estado, tipo) values (%s, %s, 'x', %s, %s) returning id",
                (u, f"{u}@prueba.example", estado, "constructora" if estado == "aprobada" else None)).fetchone()["id"])

    def test_reemplazar_crea_la_empresa_y_respeta_la_unicidad(self):
        slug = f"prueba-{uuid.uuid4().hex[:6]}"
        a, b = self.cuenta("aprobada"), self.cuenta("aprobada")
        self.assertEqual(self.a.reemplazar_fuentes(a, [{"tipo": "inmobiliaria", "slug": slug}]),
                         [{"tipo": "inmobiliaria", "slug": slug}])
        with self.a.pool.connection() as con:
            self.assertIsNotNone(con.execute("select 1 from crm.empresas where id = %s::uuid", (a,)).fetchone())
        with self.assertRaises(fuentes.FuenteOcupada):
            self.a.reemplazar_fuentes(b, [{"tipo": "marca", "slug": f"{slug}-b"}, {"tipo": "inmobiliaria", "slug": slug}])
        self.assertEqual(self.a.fuentes(b), [])          # todo o nada
        self.assertEqual(self.a.reemplazar_fuentes(a, []), [])

    def test_estados(self):
        with self.assertRaises(EstadoInvalido):
            self.a.reemplazar_fuentes(self.cuenta("pendiente"), [])
        with self.assertRaises(CuentaNoExiste):
            self.a.reemplazar_fuentes(str(uuid.uuid4()), [])
        with self.assertRaises(CuentaNoExiste):
            self.a.reemplazar_fuentes("no-es-uuid", [])


if __name__ == "__main__":
    unittest.main()
