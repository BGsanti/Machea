"""Pruebas del seguimiento por WhatsApp.   Desde backend/:  python -m unittest tests.test_seguimiento -v"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import app as m  # noqa: E402
from api import seguimiento  # noqa: E402
from api.limites import limites  # noqa: E402


def llamada(razon="user_hangup", dur=63000, exitosa=False, estado="callback", call_id="c1", voicemail=False, **extra):
    d = {"call_id": call_id, "to_number": "+573123506412", "direction": "outbound", "call_status": "ended",
         "disconnection_reason": razon, "duration_ms": dur,
         "call_analysis": {"call_summary": "Resumen corto.", "call_successful": exitosa, "in_voicemail": voicemail,
                           "custom_analysis_data": {"estado_del_lead": estado}},
         "dynamic_variables": {"contact_name": "Juan", "proyecto_recomendado": "Urbania Terra",
                               "nombre_marca": "Casa Linda", "modo_demo": "true"}}
    d.update(extra)
    return d


class TestClasificar(unittest.TestCase):
    def test_casos(self):
        c = seguimiento.clasificar
        self.assertEqual(c(llamada("voicemail_reached", 5000)), "no_contesto")
        self.assertEqual(c(llamada("dial_no_answer", 0)), "no_contesto")
        self.assertEqual(c(llamada("dial_busy", 0)), "no_contesto")
        self.assertEqual(c(llamada("user_hangup", 3000)), "no_contesto")            # colgó casi al instante
        self.assertEqual(c(llamada(voicemail=True)), "no_contesto")
        self.assertEqual(c(llamada("user_hangup", 63000)), "colgo")                 # mi llamada de prueba real
        self.assertEqual(c(llamada("inactivity", 59000)), "colgo")
        self.assertEqual(c(llamada("agent_hangup", 120000, exitosa=True, estado="qualified")), "completa")
        self.assertEqual(c(llamada("agent_hangup", 120000, exitosa=False, estado="qualified")), "completa")

    def test_algo_raro_no_escribe(self):
        self.assertIsNone(seguimiento.clasificar(llamada("agent_hangup", 90000, exitosa=None, estado="callback",
                                                         call_analysis=None)))


class TestPreparar(unittest.TestCase):
    def setUp(self):
        limites.reiniciar(); seguimiento._ENVIADAS.clear()

    def test_arma_el_pedido(self):
        p = seguimiento.preparar(llamada(), "+573123506412")
        self.assertEqual((p["caso"], p["plantilla"], p["nombre"], p["proyecto"], p["modo_demo"], p["nombre_marca"]),
                         ("colgo", "contacto_no_logrado", "Juan", "Urbania Terra", True, "Casa Linda"))
        self.assertEqual(seguimiento.preparar(llamada(exitosa=True, estado="qualified", call_id="c2"),
                                              "+573123506412")["plantilla"], "resumen_y_ficha")

    def test_un_solo_envio_por_llamada(self):
        self.assertIsNotNone(seguimiento.preparar(llamada(), "+573123506412"))
        self.assertIsNone(seguimiento.preparar(llamada(), "+573123506412"))

    def test_maximo_dos_al_dia_por_telefono(self):
        for i in range(2):
            self.assertIsNotNone(seguimiento.preparar(llamada(call_id=f"d{i}"), "+573123506412"))
        self.assertIsNone(seguimiento.preparar(llamada(call_id="d9"), "+573123506412"))

    def test_plantillas_configurables(self):
        with mock.patch.dict(os.environ, {"WHATSAPP_PLANTILLA_NO_LOGRADO": "mi_plantilla"}):
            self.assertEqual(seguimiento.preparar(llamada(), "+573123506412")["plantilla"], "mi_plantilla")


class TestWebhook(unittest.TestCase):
    def setUp(self):
        limites.reiniciar(); seguimiento._ENVIADAS.clear()
        self.c = TestClient(m.app, raise_server_exceptions=False)
        self.enviados = []
        p = mock.patch.object(seguimiento, "enviar", side_effect=self.enviados.append); p.start(); self.addCleanup(p.stop)

    def post(self, **k):
        return self.c.post("/webhooks/dapta/resultado", json={"data": llamada(**k), "call": {}})

    def test_sin_la_variable_no_se_envia_nada(self):
        os.environ.pop("DAPTA_WHATSAPP_FLOW_URL", None)
        self.assertEqual(self.post().json(), {"status": "ok"})
        self.assertEqual(self.enviados, [])

    def test_con_la_variable_se_dispara_el_seguimiento(self):
        with mock.patch.dict(os.environ, {"DAPTA_WHATSAPP_FLOW_URL": "https://dapta.test/wa"}):
            self.post()
            self.post()                                                    # reintento del mismo webhook
        self.assertEqual(len(self.enviados), 1)
        self.assertEqual(self.enviados[0]["caso"], "colgo")

    def test_una_llamada_entrante_no_dispara_nada(self):
        with mock.patch.dict(os.environ, {"DAPTA_WHATSAPP_FLOW_URL": "https://dapta.test/wa"}):
            self.post(direction="inbound")
        self.assertEqual(self.enviados, [])


class TestEnviar(unittest.TestCase):
    def test_no_rompe_si_dapta_falla(self):
        with mock.patch.dict(os.environ, {"DAPTA_WHATSAPP_FLOW_URL": "https://dapta.test/wa"}), \
             mock.patch("httpx.Client", side_effect=RuntimeError("caído")):
            seguimiento.enviar({"caso": "colgo", "telefono": "+573123506412"})      # no lanza

    def test_sin_la_variable_no_hace_ninguna_peticion(self):
        os.environ.pop("DAPTA_WHATSAPP_FLOW_URL", None)
        with mock.patch("httpx.Client") as c:
            seguimiento.enviar({"caso": "colgo", "telefono": "+573123506412"})
        c.assert_not_called()


if __name__ == "__main__":
    unittest.main()
