"""Pruebas de lo que mide el consumo de cada empresa (duración de las llamadas y WhatsApp enviados).
Desde backend/:  python -m unittest tests.test_consumo -v"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import app as m  # noqa: E402,F401  (registra seguimiento.AL_ENVIAR)
from api import llamadas, seguimiento  # noqa: E402
from tests.test_limites import FakeCliente  # noqa: E402

TEL = "+573123506412"


def llamada(call_id="c-consumo", dur=95_000):
    return {"call_id": call_id, "to_number": TEL, "duration_ms": dur,
            "recording_url": "https://files.dapta.ai/calls/abc.wav"}


class TestDuracion(unittest.TestCase):
    def setUp(self):
        self.a = llamadas.AlmacenMemoria()
        llamadas.configurar_almacen(self.a)

    def test_se_guarda_aunque_las_grabaciones_esten_apagadas(self):
        with mock.patch.dict(os.environ, {"GRABACIONES_GUARDAR": "ninguna"}):
            llamadas.guardar_resultado(llamada(), {}, TEL, {"temperatura_lead": "tibio"})
        fila = self.a.resultados["c-consumo"]
        self.assertEqual(fila["duracion_ms"], 95_000)
        self.assertNotIn("grabacion_url", fila)                          # el audio sigue dependiendo del interruptor


class TestWhatsApp(unittest.TestCase):
    def setUp(self):
        self.a = llamadas.AlmacenMemoria()
        llamadas.configurar_almacen(self.a)
        self.a.guardar_resultado({"call_id": "c-wa", "telefono": TEL})
        FakeCliente.enviados, FakeCliente.falla = [], False

    def enviar(self):
        with mock.patch.dict(os.environ, {"DAPTA_WHATSAPP_FLOW_URL": "https://dapta.test/wa"}), \
             mock.patch("httpx.Client", FakeCliente):
            seguimiento.enviar({"call_id": "c-wa", "telefono": TEL, "caso": "completa"})

    def test_un_envio_que_sale_queda_marcado_en_su_llamada(self):
        self.enviar()
        fila = self.a.resultados["c-wa"]
        self.assertTrue(fila.get("whatsapp_enviado_en"))
        self.assertEqual(fila["whatsapp_caso"], "completa")

    def test_un_envio_que_falla_no_se_cuenta(self):
        FakeCliente.falla = True
        self.enviar()
        self.assertNotIn("whatsapp_enviado_en", self.a.resultados["c-wa"])


if __name__ == "__main__":
    unittest.main()
