"""Pruebas de la aprobación de cuentas en /admin.   Desde backend/:  python -m unittest tests.test_cuentas -v

Sin nube: el almacén es `AlmacenEnMemoria`, y el arranque sin almacén se prueba aparte."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import admin, cuentas  # noqa: E402
from api import app as m  # noqa: E402
from api.limites import limites  # noqa: E402
from api.metricas import metricas  # noqa: E402

CLAVE = "clave-de-prueba-bien-larga-123"
ENV = ["ADMIN_PASSWORD", "ADMIN_TOTP_SECRET", "ADMIN_SECRET", "ADMIN_SESION_MINUTOS"]


def cuenta(id_, estado="pendiente", usuario=None, creada="2026-10-13T12:00:00Z", **extra):
    c = {"id": id_, "usuario": usuario or f"empresa-{id_}", "correo": f"{id_}@empresa.co", "estado": estado,
         "tipo": None, "metodos": ["correo"], "creadaEn": creada}
    c.update(extra)
    return c


class Base(unittest.TestCase):
    def setUp(self):
        self.guardado = {k: os.environ.pop(k, None) for k in ENV}
        os.environ["ADMIN_PASSWORD"] = CLAVE
        admin._PAUSA_FALLO = 0
        admin.cerrojo.reiniciar()
        admin._REVOCADOS.clear()
        limites.reiniciar()
        metricas.reiniciar()
        self.almacen = cuentas.AlmacenEnMemoria([
            cuenta("a1", creada="2026-10-13T10:00:00Z"),
            cuenta("b2", estado="sin_confirmar", creada="2026-10-13T11:00:00Z"),
            cuenta("c3", estado="aprobada", tipo="inmobiliaria", creada="2026-10-12T09:00:00Z"),
        ])
        cuentas.configurar_almacen(self.almacen)
        self.c = TestClient(m.app, raise_server_exceptions=False)
        r = self.c.post("/api/admin/login", json={"clave": CLAVE})
        self.assertEqual(r.status_code, 200, r.text)
        self.h = {"Authorization": "Bearer " + r.json()["token"]}

    def tearDown(self):
        cuentas.configurar_almacen(None)
        for k, v in self.guardado.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


class TestAcceso(Base):
    def test_sin_sesion_401(self):
        self.assertEqual(self.c.get("/api/admin/cuentas").status_code, 401)
        self.assertEqual(self.c.post("/api/admin/cuentas/a1/aprobar", json={"tipo": "constructora"}).status_code, 401)

    def test_panel_apagado_404(self):
        os.environ.pop("ADMIN_PASSWORD")
        self.assertEqual(self.c.get("/api/admin/cuentas", headers=self.h).status_code, 404)

    def test_no_store_y_fuera_de_docs(self):
        r = self.c.get("/api/admin/cuentas", headers=self.h)
        self.assertEqual(r.headers.get("cache-control"), "no-store")
        self.assertNotIn("/api/admin/cuentas", self.c.get("/openapi.json").text)

    def test_sin_almacen_503_no_disponible(self):
        cuentas.configurar_almacen(None)
        r = self.c.get("/api/admin/cuentas", headers=self.h)
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["detail"]["codigo"], "no_disponible")


class TestCuentas(Base):
    def test_listar_todas_ordenadas_y_por_estado(self):
        todas = self.c.get("/api/admin/cuentas", headers=self.h).json()["cuentas"]
        self.assertEqual([c["id"] for c in todas], ["b2", "a1", "c3"])
        pend = self.c.get("/api/admin/cuentas?estado=pendiente", headers=self.h).json()["cuentas"]
        self.assertEqual([c["id"] for c in pend], ["a1"])
        self.assertEqual(self.c.get("/api/admin/cuentas?estado=inventado", headers=self.h).status_code, 422)

    def test_no_salen_campos_fuera_del_contrato(self):
        self.almacen.cuentas["a1"]["claveHash"] = "NO_DEBE_SALIR"
        self.almacen.cuentas["a1"]["tokens"] = ["NO_DEBE_SALIR"]
        r = self.c.get("/api/admin/cuentas", headers=self.h)
        self.assertNotIn("NO_DEBE_SALIR", r.text)
        self.assertEqual(set(r.json()["cuentas"][0]), {"id", "usuario", "correo", "estado", "tipo", "metodos", "creadaEn"})

    def test_aprobar_con_tipo(self):
        r = self.c.post("/api/admin/cuentas/a1/aprobar", json={"tipo": "constructora"}, headers=self.h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["cuenta"]["estado"], "aprobada")
        self.assertEqual(r.json()["cuenta"]["tipo"], "constructora")
        self.assertEqual(metricas.ultimo("cuenta_aprobada")["texto"], "Cuenta aprobada: empresa-a1 (constructora)")

    def test_aprobar_tipo_invalido_422(self):
        r = self.c.post("/api/admin/cuentas/a1/aprobar", json={"tipo": "banco"}, headers=self.h)
        self.assertEqual(r.status_code, 422)
        self.assertEqual(self.almacen.cuentas["a1"]["estado"], "pendiente")

    def test_rechazar(self):
        r = self.c.post("/api/admin/cuentas/a1/rechazar", headers=self.h)
        self.assertEqual(r.json()["cuenta"]["estado"], "rechazada")
        self.assertIsNotNone(metricas.ultimo("cuenta_rechazada"))

    def test_sin_confirmar_409_y_no_existe_404(self):
        self.assertEqual(self.c.post("/api/admin/cuentas/b2/aprobar", json={"tipo": "constructora"}, headers=self.h).status_code, 409)
        self.assertEqual(self.c.post("/api/admin/cuentas/zz/rechazar", headers=self.h).status_code, 404)

    def test_id_con_caracteres_raros_se_rechaza(self):
        r = self.c.post("/api/admin/cuentas/a1%20OR%201=1/rechazar", headers=self.h)
        self.assertEqual(r.status_code, 422)

    def test_usuario_raro_no_ensucia_la_actividad(self):
        self.almacen.cuentas["a1"]["usuario"] = "<script>x</script>"
        self.c.post("/api/admin/cuentas/a1/rechazar", headers=self.h)
        self.assertNotIn("<", metricas.ultimo("cuenta_rechazada")["texto"])


if __name__ == "__main__":
    unittest.main()
