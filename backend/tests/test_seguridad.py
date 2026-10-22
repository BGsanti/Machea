"""Pruebas de las defensas generales de la API: CORS con lista, cabeceras de seguridad, tope de tamaño y documentación.
Desde backend/:  python -m unittest tests.test_seguridad -v"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import app as m  # noqa: E402


class TestCors(unittest.TestCase):
    def setUp(self):
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def acao(self, origen):
        r = self.c.options("/api/llamar", headers={"Origin": origen, "Access-Control-Request-Method": "POST"})
        return r.headers.get("access-control-allow-origin")

    def test_la_landing_si_puede(self):
        for o in ("https://www.machea.co", "https://machea.co", "https://my-project-orcin-chi.vercel.app", "https://my-project-git-main-bgsantis-projects.vercel.app"):
            self.assertEqual(self.acao(o), o, o)

    def test_cualquier_otra_pagina_no(self):
        for o in ("https://evil.example", "https://machea.co.evil.example", "https://www.machea.co.evil.example", "null", "https://my-project.vercel.app.evil.example", "http://www.machea.co"):
            self.assertIsNone(self.acao(o), o)

    def test_el_origen_extra_sale_de_la_variable(self):
        with mock.patch.dict(os.environ, {"CORS_ORIGENES": "https://stand.example.com/, https://otra.example.com"}):
            self.assertIn("https://stand.example.com", m._origenes_permitidos())
            self.assertIn("https://otra.example.com", m._origenes_permitidos())

    def test_no_se_permiten_metodos_peligrosos(self):
        r = self.c.options("/api/llamar", headers={"Origin": "https://www.machea.co", "Access-Control-Request-Method": "DELETE"})
        self.assertEqual(r.status_code, 400)


class TestCabeceras(unittest.TestCase):
    def setUp(self):
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def test_toda_respuesta_las_lleva_tambien_los_errores(self):
        for ruta in ("/api/health", "/api/admin/cuentas", "/api/captacion/resumen", "/ruta-que-no-existe"):
            r = self.c.get(ruta)
            self.assertEqual(r.headers.get("x-content-type-options"), "nosniff", ruta)
            self.assertEqual(r.headers.get("x-frame-options"), "DENY", ruta)
            self.assertEqual(r.headers.get("referrer-policy"), "no-referrer", ruta)
            self.assertIn("max-age", r.headers.get("strict-transport-security", ""), ruta)
            self.assertIn("camera=()", r.headers.get("permissions-policy", ""), ruta)

    def test_lo_privado_sale_sin_cache(self):
        for ruta in ("/api/captacion/resumen", "/api/sesion"):
            self.assertEqual(self.c.get(ruta).headers.get("cache-control"), "no-store", ruta)

    def test_cuerpo_enorme_se_rechaza_antes_de_leerlo(self):
        r = self.c.post("/api/llamar", content=b"{}", headers={"Content-Length": str(m.MAX_CUERPO_BYTES + 1), "Content-Type": "application/json"})
        self.assertEqual(r.status_code, 413)
        self.assertEqual(r.headers.get("x-content-type-options"), "nosniff")


class TestDocumentacion(unittest.TestCase):
    def test_en_render_no_se_publica(self):
        with mock.patch.dict(os.environ, {"RENDER": "true"}, clear=False):
            os.environ.pop("API_DOCS", None)
            self.assertTrue(m._es_produccion())
            self.assertFalse(m._docs_habilitadas())

    def test_se_puede_encender_a_proposito(self):
        with mock.patch.dict(os.environ, {"RENDER": "true", "API_DOCS": "1"}):
            self.assertTrue(m._docs_habilitadas())

    def test_en_desarrollo_si(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("RENDER", None)
            os.environ.pop("ENTORNO", None)
            self.assertFalse(m._es_produccion())
            self.assertTrue(m._docs_habilitadas())


if __name__ == "__main__":
    unittest.main()
