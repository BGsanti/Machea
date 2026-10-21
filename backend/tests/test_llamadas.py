"""Pruebas de las llamadas guardadas para el CRM (api/llamadas.py).
Desde backend/:  python -m unittest tests.test_llamadas -v"""

import json
import os
import sys
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import app as m  # noqa: E402
from api import demo as demo_mod  # noqa: E402
from api import llamadas  # noqa: E402
from api.limites import limites  # noqa: E402
from Model.rutas import RUTA_ARRIENDO, RUTA_CATALOGO  # noqa: E402

from tests.test_limites import FakeCliente, cuerpo  # noqa: E402

SECRETO = "s" * 32


def proyecto_de(constructora):
    with open(RUTA_CATALOGO, encoding="utf-8") as f:
        return next(p for p in json.load(f)["proyectos"] if p.get("constructora") == constructora)


def inmueble_con_publicadora():
    with open(RUTA_ARRIENDO, encoding="utf-8") as f:
        return next(i for i in json.load(f)["inmuebles"] if i.get("inmobiliaria_publicadora"))


def resultado_dapta(call_id="llamada-1", tel="+573123506412", datos=None, variables=None, razon="agent_hangup"):
    return {"data": {"to_number": tel, "call_status": "ended", "disconnection_reason": razon, "direction": "outbound",
                     "call_id": call_id,
                     "call_analysis": {"call_summary": "Habló con Manuela.", "custom_analysis_data": datos or {}},
                     "dynamic_variables": variables or {}},
            "call": {}}


class TestDueno(unittest.TestCase):
    def test_slug(self):
        self.assertEqual(llamadas.slug("Constructora Bolívar S.A."), "constructora-bolivar-s-a")
        self.assertIsNone(llamadas.slug("  ¡! "))
        self.assertIsNone(llamadas.slug(None))

    def test_constructora_sale_del_catalogo(self):
        p = proyecto_de("bolivar")
        d = llamadas.dueno_del_proyecto("compra", str(p["id_proyecto"]))
        self.assertEqual(d, {"dueno_tipo": "constructora", "dueno_slug": "bolivar", "dueno_nombre": "bolivar"})

    def test_inmobiliaria_en_arriendo(self):
        i = inmueble_con_publicadora()
        d = llamadas.dueno_del_proyecto("arriendo", str(i["id_inmueble"]))
        self.assertEqual(d["dueno_tipo"], "inmobiliaria")
        self.assertEqual(d["dueno_slug"], llamadas.slug(i["inmobiliaria_publicadora"]))

    def test_id_desconocido_o_vacio(self):
        self.assertIsNone(llamadas.dueno_del_proyecto("compra", "999999")["dueno_slug"])
        self.assertIsNone(llamadas.dueno_del_proyecto("compra", None)["dueno_tipo"])

    def test_digitos(self):
        self.assertEqual(llamadas.digitos_telefono("+573123506412"), "3123506412")


class Base(unittest.TestCase):
    def setUp(self):
        limites.reiniciar()
        FakeCliente.enviados, FakeCliente.falla = [], False
        for k in ("LLAMADAS_POR_TELEFONO_HORA", "LLAMADAS_POR_IP_HORA", "LLAMADAS_TOTAL_DIA", "DEMO_LLAMADAS_TOTAL_DIA",
                  "LIMITE_TELEFONOS_EXENTOS", "MANUELA_WEBHOOK_SECRET", "DAPTA_WHATSAPP_FLOW_URL", "DEMO_SECRET"):
            os.environ.pop(k, None)
        for p in (mock.patch.object(m, "DAPTA_FLOW_WEBHOOK_URL", "https://dapta.test/flow"),
                  mock.patch("httpx.Client", FakeCliente)):
            p.start()
            self.addCleanup(p.stop)
        self.almacen = llamadas.AlmacenMemoria()
        llamadas.configurar_almacen(self.almacen)
        self.addCleanup(llamadas.configurar_almacen, None)
        m.RESULTADOS_LLAMADAS.clear()
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def llamar(self, **extra):
        return self.c.post("/api/llamar", json=cuerpo(**extra), headers={"cf-connecting-ip": "1.1.1.1"})


class TestSolicitud(Base):
    def test_se_guarda_con_marca_y_dueno(self):
        p = proyecto_de("amarilo")
        os.environ["MARCAS_CON_ACUERDO"] = "amarilo"
        self.addCleanup(os.environ.pop, "MARCAS_CON_ACUERDO", None)
        r = self.llamar(marca="amarilo", apartamento={
            "nombre_proyecto": p["nombre_proyecto"], "id_proyecto": p["id_proyecto"], "localidad": "Suba",
            "tipo_vivienda": "VIS", "precio_desde_cop": 200000000})
        self.assertEqual(r.json()["status"], "enviado")
        self.assertEqual(len(self.almacen.solicitudes), 1)
        s = self.almacen.solicitudes[0]
        self.assertEqual((s["marca"], s["dueno_tipo"], s["dueno_slug"]), ("amarilo", "constructora", "amarilo"))
        self.assertEqual((s["telefono"], s["telefono_digitos"]), ("+573123506412", "3123506412"))
        self.assertEqual(s["id_proyecto"], str(p["id_proyecto"]))
        self.assertIsNone(s["autoriza_compartir"])
        self.assertEqual(s["nombre"], "Prueba")
        # El id de la solicitud viaja a Dapta para unir el resultado.
        self.assertEqual(FakeCliente.enviados[0]["external_lead_id"], f"machea-{s['id']}")

    def test_el_dueno_no_lo_decide_el_navegador(self):
        p = proyecto_de("cusezar")
        self.llamar(apartamento={"nombre_proyecto": "Otro nombre", "id_proyecto": str(p["id_proyecto"]),
                                 "localidad": "Suba", "tipo_vivienda": "VIS", "precio_desde_cop": 1,
                                 "dueno_slug": "amarilo"})
        self.assertEqual(self.almacen.solicitudes[0]["dueno_slug"], "cusezar")

    def test_marca_sin_acuerdo_es_demo_y_no_llama(self):
        os.environ.pop("MARCAS_CON_ACUERDO", None)
        r = self.llamar(marca="amarilo")
        self.assertEqual(r.status_code, 403)
        self.assertIn("demostración", r.json()["detail"])
        self.assertEqual(FakeCliente.enviados, [])
        self.assertEqual(self.almacen.solicitudes, [])
        with mock.patch.dict(os.environ, {"MARCAS_CON_ACUERDO": "cusezar, amarilo "}):
            self.assertEqual(self.llamar(marca="amarilo").json()["status"], "enviado")

    def test_formulario_de_machea_no_necesita_acuerdo(self):
        os.environ.pop("MARCAS_CON_ACUERDO", None)
        self.assertEqual(self.llamar(marca="machea").json()["status"], "enviado")
        self.assertEqual(self.llamar(telefono="3123506499").json()["status"], "enviado")   # otro número: el tope es por teléfono

    def test_marca_desconocida_cae_a_machea_y_sin_id_no_hay_dueno(self):
        self.llamar(marca="inventada")
        s = self.almacen.solicitudes[0]
        self.assertEqual(s["marca"], "machea")
        self.assertIsNone(s["dueno_slug"])

    def test_autorizacion_de_compartir_viaja_con_la_solicitud(self):
        self.llamar(autoriza_compartir=True, version_autorizacion="compartir-v1")
        s = self.almacen.solicitudes[0]
        self.assertIs(s["autoriza_compartir"], True)
        self.assertEqual(s["version_autorizacion"], "compartir-v1")

    def test_demo_con_marca_no_se_guarda(self):
        with mock.patch.dict(os.environ, {"DEMO_SECRET": "clave-demo"}):
            token = demo_mod.firmar({"n": "Casa Linda", "t": "inmobiliaria", "c": ["#ff0000", None],
                                     "exp": int(time.time()) + 100})
            r = self.llamar(demo=token)
        self.assertEqual(r.json()["status"], "enviado")
        self.assertEqual(self.almacen.solicitudes, [])

    def test_si_dapta_falla_no_se_guarda(self):
        FakeCliente.falla = True
        self.llamar()
        self.assertEqual(self.almacen.solicitudes, [])

    def test_si_guardar_falla_la_llamada_sigue(self):
        class Roto(llamadas.AlmacenMemoria):
            def crear_solicitud(self, fila):
                raise RuntimeError("Supabase caído")
        llamadas.configurar_almacen(Roto())
        self.assertEqual(self.llamar(telefono="3123506499").json()["status"], "enviado")   # otro número: el tope es por teléfono


class TestResultado(Base):
    def webhook(self, cuerpo_, k=None):
        ruta = "/webhooks/dapta/resultado" + (f"?k={k}" if k is not None else "")
        return self.c.post(ruta, json=cuerpo_)

    def test_sin_secreto_funciona_como_antes_pero_no_guarda(self):
        self.assertEqual(self.webhook(resultado_dapta(datos={"temperatura_lead": "caliente"})).status_code, 200)
        d = self.c.get("/api/llamar/resultado", params={"telefono": "3123506412"}).json()
        self.assertEqual(d["temperatura_lead"], "caliente")       # el resumen del formulario sigue
        self.assertEqual(self.almacen.resultados, {})

    def test_con_secreto_exige_k(self):
        with mock.patch.dict(os.environ, {"MANUELA_WEBHOOK_SECRET": SECRETO}):
            self.assertEqual(self.webhook(resultado_dapta()).status_code, 401)
            self.assertEqual(self.webhook(resultado_dapta(), k="otro").status_code, 401)
            self.assertEqual(self.webhook(resultado_dapta(), k=SECRETO).status_code, 200)
        self.assertIn("llamada-1", self.almacen.resultados)

    def test_el_audio_y_la_transcripcion_se_guardan_pero_no_llegan_al_navegador(self):
        llamada = {**resultado_dapta(datos={"temperatura_lead": "tibio"})["data"], "duration_ms": 30000,
                   "recording_url": "https://files.dapta.ai/calls/llamada-1.ogg",
                   "transcript_object": [{"role": "agent", "content": "Hola, te habla Manuela.", "words": [{"start": 1.0}]},
                                         {"role": "user", "content": "Buenas.", "words": [{"start": 4.0}]}]}
        with mock.patch.dict(os.environ, {"MANUELA_WEBHOOK_SECRET": SECRETO}):
            self.webhook({"data": llamada, "call": {}}, k=SECRETO)
        guardado = self.almacen.resultados["llamada-1"]
        self.assertEqual(guardado["grabacion_url"], "https://files.dapta.ai/calls/llamada-1.ogg")
        self.assertEqual(guardado["transcripcion"][1], {"r": "u", "t": "Buenas.", "s": 4.0})
        self.assertEqual(guardado["duracion_ms"], 30000)
        publico = self.c.get("/api/llamar/resultado", params={"telefono": "3123506412"}).text
        self.assertNotIn("te habla Manuela", publico)
        self.assertNotIn("files.dapta.ai", publico)
        self.assertNotIn("transcripcion", publico)

    def test_secreto_corto_se_ignora(self):
        with mock.patch.dict(os.environ, {"MANUELA_WEBHOOK_SECRET": "corto"}):
            self.assertEqual(self.webhook(resultado_dapta()).status_code, 200)
        self.assertEqual(self.almacen.resultados, {})

    def test_resultado_se_une_con_su_solicitud(self):
        self.llamar()
        s = self.almacen.solicitudes[0]
        datos = {"temperatura_lead": "caliente", "cita_agendada": "true", "fecha_hora_cita": "2026-10-21 16:00",
                 "canal_cita": "llamada_asesor", "resumen_llamada": "Quiere visitar el sábado."}
        with mock.patch.dict(os.environ, {"MANUELA_WEBHOOK_SECRET": SECRETO}):
            self.webhook(resultado_dapta(datos=datos, variables={"external_lead_id": f"machea-{s['id']}"}), k=SECRETO)
        r = self.almacen.resultados["llamada-1"]
        self.assertEqual(r["solicitud_id"], s["id"])
        self.assertIs(r["cita_agendada"], True)
        self.assertEqual((r["temperatura_lead"], r["fecha_hora_cita"]), ("caliente", "2026-10-21 16:00"))
        self.assertEqual(r["telefono"], "+573123506412")

    def test_sin_external_lead_id_se_une_por_telefono(self):
        self.llamar()
        with mock.patch.dict(os.environ, {"MANUELA_WEBHOOK_SECRET": SECRETO}):
            self.webhook(resultado_dapta(), k=SECRETO)
        self.assertEqual(self.almacen.resultados["llamada-1"]["solicitud_id"], self.almacen.solicitudes[0]["id"])

    def test_un_evento_sin_analisis_no_borra_lo_guardado(self):
        with mock.patch.dict(os.environ, {"MANUELA_WEBHOOK_SECRET": SECRETO}):
            self.webhook(resultado_dapta(datos={"temperatura_lead": "tibio", "objecion_principal": "precio"}), k=SECRETO)
            m.RESULTADOS_LLAMADAS.clear()                          # como si el backend se hubiera reiniciado
            self.webhook(resultado_dapta(datos={}), k=SECRETO)
        r = self.almacen.resultados["llamada-1"]
        self.assertEqual((r["temperatura_lead"], r["objecion_principal"]), ("tibio", "precio"))

    def test_buzon_queda_como_sin_contacto(self):
        with mock.patch.dict(os.environ, {"MANUELA_WEBHOOK_SECRET": SECRETO}):
            self.webhook(resultado_dapta(razon="voicemail_reached"), k=SECRETO)
        r = self.almacen.resultados["llamada-1"]
        self.assertIs(r["sin_contacto"], True)
        self.assertEqual(r["motivo_no_agenda"], "buzon")

    def test_sin_call_id_no_se_guarda(self):
        c = resultado_dapta()
        del c["data"]["call_id"]
        with mock.patch.dict(os.environ, {"MANUELA_WEBHOOK_SECRET": SECRETO}):
            self.assertEqual(self.webhook(c, k=SECRETO).status_code, 200)
        self.assertEqual(self.almacen.resultados, {})


class TestAlmacenSupabase(unittest.TestCase):
    def setUp(self):
        self.pedidos = []
        pedidos = self.pedidos

        class Cliente:
            def request(self, metodo, url, params=None, json=None, headers=None):
                pedidos.append({"metodo": metodo, "url": url, "params": params, "json": json, "headers": headers})
                r = mock.Mock(status_code=201, content=b"")
                return r

        self.a = llamadas.AlmacenSupabase("https://x.supabase.co", "clave-servicio", cliente=Cliente())

    def test_resultado_es_upsert_por_call_id(self):
        self.a.guardar_resultado({"call_id": "c1", "telefono": "+57", "temperatura_lead": "frio"})
        p = self.pedidos[0]
        self.assertEqual((p["metodo"], p["url"]), ("POST", "https://x.supabase.co/rest/v1/resultados_llamada"))
        self.assertEqual(p["params"], {"on_conflict": "call_id"})
        self.assertIn("resolution=merge-duplicates", p["headers"]["Prefer"])
        self.assertEqual(p["headers"]["apikey"], "clave-servicio")

    def test_solicitud_va_a_su_tabla(self):
        self.a.crear_solicitud({"id": "x", "telefono": "+57"})
        self.assertTrue(self.pedidos[0]["url"].endswith("/solicitudes_llamada"))


if __name__ == "__main__":
    unittest.main()
