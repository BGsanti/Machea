"""Pruebas de la lista de exclusión y de los contactos programados fuera de horario.
Desde backend/:  python -m unittest tests.test_exclusiones -v"""

import os
import sys
import unittest
from datetime import datetime
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import app as m  # noqa: E402
from api import captacion as cap  # noqa: E402
from api import exclusiones, horario, programados, seguimiento  # noqa: E402
from api.limites import limites  # noqa: E402
from tests.test_limites import FakeCliente, cuerpo  # noqa: E402
from tests.test_seguimiento import llamada  # noqa: E402

TEL = "+573123506412"
MARTES_NOCHE = datetime(2026, 11, 10, 21, 0, tzinfo=horario.TZ)
MIERCOLES_10 = datetime(2026, 11, 11, 10, 0, tzinfo=horario.TZ)


class Base(unittest.TestCase):
    def setUp(self):
        limites.reiniciar(); seguimiento._ENVIADAS.clear()
        exclusiones.configurar_almacen(exclusiones.AlmacenMemoria())
        programados.configurar_almacen(programados.AlmacenMemoria())
        FakeCliente.enviados, FakeCliente.falla = [], False
        for p in (mock.patch.object(m, "DAPTA_FLOW_WEBHOOK_URL", "https://dapta.test/flow"),
                  mock.patch("httpx.Client", FakeCliente)):
            p.start(); self.addCleanup(p.stop)
        self.c = TestClient(m.app, raise_server_exceptions=False)


class TestLista(Base):
    def test_excluir_consultar_y_readmitir(self):
        self.assertFalse(exclusiones.excluido(TEL))
        self.assertTrue(exclusiones.excluir("312 350 6412", "manuela"))
        self.assertTrue(exclusiones.excluido(TEL))                      # misma llave: los últimos 10 dígitos
        exclusiones.readmitir(TEL)
        self.assertFalse(exclusiones.excluido(TEL))

    def test_si_la_base_falla_no_bloquea_a_nadie(self):
        roto = mock.Mock(esta=mock.Mock(side_effect=RuntimeError("falta la tabla")))
        exclusiones.configurar_almacen(roto)
        self.assertFalse(exclusiones.excluido(TEL))


class TestWebhookManuela(Base):
    def post(self, motivo):
        d = llamada()
        d["call_analysis"]["custom_analysis_data"]["motivo_no_agenda"] = motivo
        with mock.patch.dict(os.environ, {"DAPTA_WHATSAPP_FLOW_URL": "https://dapta.test/wa"}), \
             mock.patch.object(seguimiento, "enviar") as enviar, \
             mock.patch.object(seguimiento.horario, "ventana_permitida", return_value=(True, "ok")):
            self.assertEqual(self.c.post("/webhooks/dapta/resultado", json={"data": d, "call": {}}).json(), {"status": "ok"})
        return enviar

    def test_no_me_llamen_mas_entra_a_la_lista_y_no_se_le_escribe(self):
        enviar = self.post("pidio_no_ser_contactado")
        self.assertTrue(exclusiones.excluido(TEL))
        enviar.assert_not_called()

    def test_otro_motivo_sigue_igual(self):
        enviar = self.post("no_tiene_tiempo")
        self.assertFalse(exclusiones.excluido(TEL))
        enviar.assert_called_once()


class TestLlamar(Base):
    def llamar(self, en_horario):
        with mock.patch.object(m, "_en_horario_de_llamadas", return_value=en_horario):
            return self.c.post("/api/llamar", json=cuerpo(), headers={"cf-connecting-ip": "1.1.1.1"})

    def test_pedirla_otra_vez_la_saca_de_la_lista(self):
        exclusiones.excluir(TEL, "manuela")
        self.assertEqual(self.llamar(True).json()["status"], "enviado")
        self.assertFalse(exclusiones.excluido(TEL))
        self.assertEqual(len(FakeCliente.enviados), 1)

    def test_fuera_de_horario_se_programa_y_no_se_llama(self):
        with mock.patch.object(m.horario, "proxima_ventana", return_value=MIERCOLES_10.replace(hour=7)):
            r = self.llamar(False).json()
        self.assertEqual(r["status"], "programada")
        self.assertIn("el miércoles 11 de noviembre a las 7:00 a. m.", r["detalle"])
        self.assertEqual(FakeCliente.enviados, [])                      # no llegó a Dapta
        fila = programados.almacen().filas[0]
        self.assertEqual((fila["tipo"], fila["telefono_digitos"]), ("llamada", "3123506412"))

    def test_la_cola_la_dispara_cuando_abre_el_horario(self):
        with mock.patch.object(m.horario, "proxima_ventana", return_value=MIERCOLES_10.replace(hour=7)):
            self.llamar(False)
        self.assertEqual(programados.procesar(ahora=MARTES_NOCHE)["status"], "fuera_de_horario")
        r = programados.procesar(ahora=MIERCOLES_10)
        self.assertEqual(r["hechos"], 1)
        self.assertEqual(FakeCliente.enviados[0]["telefono"], TEL)
        self.assertNotEqual(FakeCliente.enviados[0]["current_time"], "")  # se recalcula al llamar
        fila = programados.almacen().filas[0]
        self.assertEqual(fila["estado"], "hecho")
        self.assertIsNone(fila["payload"])                              # ya no se guardan sus datos

    def test_la_cola_no_llama_a_quien_pidio_no_ser_contactado(self):
        programados.programar("llamada", TEL, {"dapta": {"telefono": TEL}}, MIERCOLES_10)
        exclusiones.excluir(TEL, "manuela")
        r = programados.procesar(ahora=MIERCOLES_10)
        self.assertEqual((r["hechos"], r["cancelados"]), (0, 1))
        self.assertEqual(FakeCliente.enviados, [])

    def test_si_dapta_falla_se_reintenta_y_luego_queda_en_error(self):
        programados.programar("llamada", TEL, {"dapta": {"telefono": TEL}}, MIERCOLES_10)
        FakeCliente.falla = True
        for _ in range(programados.MAX_INTENTOS):
            programados.procesar(ahora=MIERCOLES_10)
        self.assertEqual(programados.almacen().filas[0]["estado"], "error")


class TestWhatsApp(Base):
    def test_fuera_de_horario_se_programa(self):
        with mock.patch.object(seguimiento, "enviar") as enviar:
            self.assertEqual(seguimiento.despachar({"telefono": TEL, "caso": "colgo"}, ahora=MARTES_NOCHE), "programado")
        enviar.assert_not_called()
        self.assertEqual(programados.almacen().filas[0]["tipo"], "whatsapp")

    def test_a_un_excluido_no_se_le_escribe(self):
        exclusiones.excluir(TEL, "manuela")
        with mock.patch.object(seguimiento, "enviar") as enviar:
            self.assertEqual(seguimiento.despachar({"telefono": TEL, "caso": "colgo"}, ahora=MIERCOLES_10), "excluido")
        enviar.assert_not_called()


class TestCamila(Base):
    def setUp(self):
        super().setUp()
        cap._ALMACEN = cap.AlmacenMemoria()

    def test_no_marca_a_un_numero_de_la_lista(self):
        p, _ = cap._ALMACEN.crear_o_traer({"empresa": "Inmobiliaria X", "telefono": "3123506412", "origen": "lista_frio"})
        exclusiones.excluir(TEL, "manuela")
        with mock.patch.object(cap, "ventana_permitida", return_value=(True, "ok")):
            r = cap.llamar_prospecto({**p, "telefono": TEL})
        self.assertEqual(r["status"], "bloqueado")
        self.assertEqual(cap._ALMACEN.obtener(p["id"])["estado"], "no_contactar")


if __name__ == "__main__":
    unittest.main()
