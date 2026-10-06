"""Pruebas de los topes de /api/llamar.   Desde backend/:  python -m unittest tests.test_limites -v"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import app as m  # noqa: E402
from api.limites import limites  # noqa: E402


def cuerpo(telefono="3123506412", **extra):
    c = {
        "nombre": "Prueba", "telefono": telefono, "afiliado": False, "rango_ingreso": "2 a 4 SMMLV",
        "edad": 32, "personas_a_cargo": 2, "entorno_deseado": "Piscina",
        "apartamento": {"nombre_proyecto": "Urbania Terra", "localidad": "Fontibón",
                        "tipo_vivienda": "VIS", "precio_desde_cop": 262300000},
    }
    c.update(extra)
    return c


class FakeCliente:
    """Sustituye httpx.Client: registra los POST a Dapta en vez de enviarlos."""
    enviados = []
    falla = False

    def __init__(self, *a, **k): pass
    def __enter__(self): return self
    def __exit__(self, *a): return False

    def post(self, url, json=None, headers=None):
        if FakeCliente.falla:
            raise RuntimeError("Dapta caído")
        FakeCliente.enviados.append(json)
        resp = mock.Mock(); resp.raise_for_status = lambda: None
        return resp


class Base(unittest.TestCase):
    def setUp(self):
        limites.reiniciar()
        FakeCliente.enviados, FakeCliente.falla = [], False
        for k in ("LLAMADAS_POR_TELEFONO_HORA", "LLAMADAS_POR_IP_HORA", "LLAMADAS_TOTAL_DIA",
                  "DEMO_LLAMADAS_TOTAL_DIA", "LIMITE_TELEFONOS_EXENTOS"):
            os.environ.pop(k, None)
        self.p1 = mock.patch.object(m, "DAPTA_FLOW_WEBHOOK_URL", "https://dapta.test/flow")
        self.p2 = mock.patch("httpx.Client", FakeCliente)
        self.p1.start(); self.p2.start()
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def tearDown(self):
        self.p1.stop(); self.p2.stop()

    def llamar(self, telefono="3123506412", ip="1.1.1.1"):
        return self.c.post("/api/llamar", json=cuerpo(telefono), headers={"cf-connecting-ip": ip})


class TestTopes(Base):
    def test_primera_llamada_pasa_y_segunda_al_mismo_telefono_se_topa(self):
        self.assertEqual(self.llamar().json()["status"], "enviado")
        r = self.llamar()
        self.assertEqual(r.status_code, 429)
        self.assertIn("Intenta de nuevo", r.json()["detail"])
        self.assertGreater(int(r.headers["retry-after"]), 0)
        self.assertEqual(len(FakeCliente.enviados), 1)          # la segunda NO llegó a Dapta

    def test_tope_por_ip(self):
        for i in range(5):
            self.assertEqual(self.llamar(f"31200000{i:02d}").status_code, 200)
        r = self.llamar("3120000099")
        self.assertEqual(r.status_code, 429)
        self.assertIn("conexión", r.json()["detail"])
        # otra IP sí puede
        self.assertEqual(self.llamar("3120000098", ip="2.2.2.2").status_code, 200)

    def test_tope_total_del_dia(self):
        os.environ["LLAMADAS_TOTAL_DIA"] = "3"
        for i in range(3):
            self.assertEqual(self.llamar(f"31300000{i:02d}", ip=f"9.9.9.{i}").status_code, 200)
        r = self.llamar("3130000050", ip="9.9.9.50")
        self.assertEqual(r.status_code, 429)
        self.assertIn("límite de llamadas", r.json()["detail"])

    def test_telefono_exento_no_se_topa(self):
        os.environ["LIMITE_TELEFONOS_EXENTOS"] = "+57 312 350 6412"
        for _ in range(3):
            self.assertEqual(self.llamar("3123506412").status_code, 200)
        self.assertEqual(len(FakeCliente.enviados), 3)

    def test_si_dapta_falla_el_cupo_se_devuelve(self):
        FakeCliente.falla = True
        self.assertEqual(self.llamar().status_code, 500)
        FakeCliente.falla = False
        self.assertEqual(self.llamar().status_code, 200)         # no quedó bloqueado una hora

    def test_telefono_invalido_da_400_y_no_gasta_cupo(self):
        self.assertEqual(self.llamar("12345").status_code, 400)
        self.assertEqual(self.llamar().status_code, 200)

    def test_modo_mock_no_gasta_cupo(self):
        with mock.patch.object(m, "DAPTA_FLOW_WEBHOOK_URL", None):
            for _ in range(4):
                self.assertEqual(self.llamar().json()["status"], "mock_enqueued")
        self.assertEqual(self.llamar().status_code, 200)         # y la real sigue disponible

    def test_ip_sale_de_la_cabecera_de_cloudflare(self):
        for i in range(5):
            self.assertEqual(self.llamar(f"31400000{i:02d}", ip="7.7.7.7").status_code, 200)
        # misma conexión de socket (testclient) pero otra IP declarada por Cloudflare
        self.assertEqual(self.llamar("3140000077", ip="8.8.8.8").status_code, 200)
        self.assertEqual(self.llamar("3140000078", ip="7.7.7.7").status_code, 429)


if __name__ == "__main__":
    unittest.main()
