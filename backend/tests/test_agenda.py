"""Pruebas de la agenda de Manuela v2: el resultado de la llamada trae la cita y el seguimiento la recuerda.
Desde backend/:  python -m unittest tests.test_agenda -v"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import app as m  # noqa: E402
from api import seguimiento  # noqa: E402


def cuerpo(datos, tel="+573001112233", razon="agent_hangup", dur=118000):
    return {"data": {"to_number": tel, "call_status": "ended", "disconnection_reason": razon, "duration_ms": dur,
                     "direction": "outbound", "call_id": "cita-1",
                     "call_analysis": {"call_summary": "Quedó una cita.", "call_successful": True,
                                       "custom_analysis_data": datos},
                     "dynamic_variables": {"contact_name": "Ana", "proyecto_recomendado": "Urbania Terra"}},
            "call": {}}


class TestAgendaEnResultado(unittest.TestCase):
    def setUp(self):
        m.RESULTADOS_LLAMADAS.clear()
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def test_la_cita_llega_al_resultado(self):
        r = self.c.post("/webhooks/dapta/resultado", json=cuerpo({
            "estado_del_lead": "qualified", "temperatura_lead": "caliente",
            "cita_agendada": True, "fecha_de_seguimiento": "martes 21 de octubre, 4:00 p. m.",
            "fecha_hora_cita": "2026-10-21 16:00", "canal_cita": "llamada_asesor"}))
        self.assertEqual(r.status_code, 200)
        d = self.c.get("/api/llamar/resultado", params={"telefono": "3001112233"}).json()
        self.assertTrue(d["listo"])
        self.assertIs(d["cita_agendada"], True)
        self.assertEqual(d["fecha_de_seguimiento"], "martes 21 de octubre, 4:00 p. m.")
        self.assertEqual(d["fecha_hora_cita"], "2026-10-21 16:00")
        self.assertEqual(d["canal_cita"], "llamada_asesor")

    def test_booleano_como_texto(self):
        self.c.post("/webhooks/dapta/resultado", json=cuerpo({"cita_agendada": "true"}))
        self.assertIs(self.c.get("/api/llamar/resultado", params={"telefono": "3001112233"}).json()["cita_agendada"], True)
        self.c.post("/webhooks/dapta/resultado", json=cuerpo({"cita_agendada": "false", "motivo_no_agenda": "sin_tiempo"}, tel="+573004445566"))
        d = self.c.get("/api/llamar/resultado", params={"telefono": "3004445566"}).json()
        self.assertIs(d["cita_agendada"], False)
        self.assertEqual(d["motivo_no_agenda"], "sin_tiempo")

    def test_sin_cita_no_rompe_lo_anterior(self):
        self.c.post("/webhooks/dapta/resultado", json=cuerpo({"estado_del_lead": "callback", "fecha_de_seguimiento": ""}))
        d = self.c.get("/api/llamar/resultado", params={"telefono": "3001112233"}).json()
        self.assertTrue(d["listo"])
        self.assertIsNone(d["cita_agendada"])
        self.assertEqual(d["estado_del_lead"], "callback")

    def test_un_evento_sin_analisis_no_borra_la_cita(self):
        self.c.post("/webhooks/dapta/resultado", json=cuerpo({"cita_agendada": True, "fecha_de_seguimiento": "mañana 10:00 a. m."}))
        self.c.post("/webhooks/dapta/resultado", json=cuerpo({}))
        d = self.c.get("/api/llamar/resultado", params={"telefono": "3001112233"}).json()
        self.assertIs(d["cita_agendada"], True)
        self.assertEqual(d["fecha_de_seguimiento"], "mañana 10:00 a. m.")


class TestSinContacto(unittest.TestCase):
    def setUp(self):
        m.RESULTADOS_LLAMADAS.clear()
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def test_buzon_se_explica_en_espanol(self):
        b = cuerpo({}, tel="+573125923915", razon="voicemail_reached", dur=5200)
        b["data"]["call_analysis"] = {"call_summary": "Call reached voicemail. Post-call analysis skipped.", "in_voicemail": True,
                                      "custom_analysis_data": {}}
        self.c.post("/webhooks/dapta/resultado", json=b)
        d = self.c.get("/api/llamar/resultado", params={"telefono": "3125923915"}).json()
        self.assertTrue(d["sin_contacto"])
        self.assertIn("filtro de llamadas", d["resumen_llamada"])
        self.assertNotIn("voicemail", d["resumen_llamada"].lower())
        self.assertEqual(d["motivo_no_agenda"], "buzon")
        self.assertIn("WhatsApp", d["recomendacion_asesor"])

    def test_nadie_contesto_tambien_se_explica_en_espanol(self):
        # Caso real (2026-10-20): la red devolvió SIP 480 «Temporarily not available» y Dapta resumió en inglés.
        b = cuerpo({}, tel="+573005912503", razon="dial_no_answer", dur=0)
        b["data"]["call_analysis"] = {"call_summary": "Call was not answered by the recipient", "in_voicemail": False, "custom_analysis_data": {}}
        self.c.post("/webhooks/dapta/resultado", json=b)
        d = self.c.get("/api/llamar/resultado", params={"telefono": "3005912503"}).json()
        self.assertTrue(d["sin_contacto"])
        self.assertNotIn("answered", d["resumen_llamada"].lower())
        self.assertIn("WhatsApp", d["recomendacion_asesor"])

    def test_una_llamada_con_conversacion_no_es_sin_contacto(self):
        self.c.post("/webhooks/dapta/resultado", json=cuerpo({"estado_del_lead": "qualified"}))
        d = self.c.get("/api/llamar/resultado", params={"telefono": "3001112233"}).json()
        self.assertFalse(d["sin_contacto"])
        self.assertEqual(d["resumen_llamada"], "Quedó una cita.")
        self.assertIsNone(d["motivo_no_agenda"])


class TestSeguimientoConCita(unittest.TestCase):
    def llamada(self, **datos):
        return cuerpo(datos)["data"]

    def test_una_cita_cuenta_como_llamada_completa(self):
        ll = self.llamada(cita_agendada="true")
        ll["call_analysis"]["call_successful"] = False
        self.assertEqual(seguimiento.clasificar(ll), "completa")

    def test_el_pedido_trae_la_cita(self):
        seguimiento._ENVIADAS.clear()
        ll = self.llamada(cita_agendada=True, fecha_de_seguimiento="martes 21 de octubre, 4:00 p. m.", fecha_hora_cita="2026-10-21 16:00")
        ll["call_id"] = "cita-xyz"
        p = seguimiento.preparar(ll, "+573009990000")
        self.assertIsNotNone(p)
        self.assertEqual(p["caso"], "completa")
        self.assertTrue(p["cita_confirmada"])
        self.assertEqual(p["cita"], "martes 21 de octubre, 4:00 p. m.")
        self.assertEqual(p["fecha_hora_cita"], "2026-10-21 16:00")

    def test_sin_cita_el_pedido_va_vacio(self):
        seguimiento._ENVIADAS.clear()
        ll = self.llamada(estado_del_lead="qualified")
        ll["call_id"] = "sin-cita-1"
        p = seguimiento.preparar(ll, "+573008880000")
        self.assertFalse(p["cita_confirmada"])
        self.assertEqual(p["cita"], "")


if __name__ == "__main__":
    unittest.main()
