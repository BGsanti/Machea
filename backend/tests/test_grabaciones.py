"""Pruebas del audio y la transcripción de las llamadas (api/grabaciones.py y su guardado).
Desde backend/:  python -m unittest tests.test_grabaciones -v"""

import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402

from api import captacion as cap  # noqa: E402
from api import grabaciones  # noqa: E402
from api import llamadas  # noqa: E402

# La forma real de una llamada de Dapta (workspace de Machea, 2026-10-20), con el nombre cambiado. Fíjese que la
# persona aparece tres veces: el turno completo y, después, sus dos mitades.
LLAMADA = {
    "call_id": "call_abc123",
    "to_number": "+573001112233",
    "duration_ms": 41508,
    "recording_url": "https://files.dapta.ai/calls/call_abc123_20261020.ogg",
    "transcript": "Agent: Hola Ana.\nUser: Dame\nAgent: Claro.\n",
    "transcript_object": [
        {"role": "agent", "content": "Hola Ana, te habla Manuela de Machea.", "words": [{"start": 1.598, "end": 7.5}], "metadata": {"response_id": 0}},
        {"role": "user", "content": "Dame", "words": [{"start": 10.12, "end": 10.36}], "metadata": {}},
        {"role": "agent", "content": "Claro. ¿Tienes un minuto?", "words": [{"start": 11.88, "end": 17.7}]},
        {"role": "user", "content": "Sí, un poco. pues, no tanto. Tengo afecciones ahí.", "words": [{"start": 27.5, "end": 31.5}]},
        {"role": "user", "content": "Sí, un poco.", "words": [{"start": 28.8, "end": 29.5}]},
        {"role": "user", "content": "pues, no tanto. Tengo afecciones ahí.", "words": [{"start": 29.6, "end": 31.9}]},
        {"role": "agent", "content": "Entiendo. ¿Qué te gustaría resolver?", "words": [{"start": 33.3, "end": 38.7}]},
    ],
}


class TestTranscripcion(unittest.TestCase):
    def test_turnos_con_segundos_y_sin_repetidos(self):
        t = grabaciones.transcripcion(LLAMADA)
        self.assertEqual([x["r"] for x in t], ["a", "u", "a", "u", "a"])
        self.assertEqual(t[0], {"r": "a", "t": "Hola Ana, te habla Manuela de Machea.", "s": 1.6})
        self.assertEqual(t[3]["t"], "Sí, un poco. pues, no tanto. Tengo afecciones ahí.")

    def test_sin_objeto_usa_el_texto_plano(self):
        t = grabaciones.transcripcion({"transcript": "Agent: Hola.\nUser: Buenas\nAgent: ¿Cómo está?\n"})
        self.assertEqual(t, [{"r": "a", "t": "Hola."}, {"r": "u", "t": "Buenas"}, {"r": "a", "t": "¿Cómo está?"}])

    def test_sin_nada_devuelve_none(self):
        self.assertIsNone(grabaciones.transcripcion({}))
        self.assertIsNone(grabaciones.transcripcion({"transcript": "", "transcript_object": []}))

    def test_tope_de_tamano(self):
        largo = [{"role": "agent" if i % 2 == 0 else "user", "content": f"frase {i} " + "x" * 700} for i in range(200)]
        t = grabaciones.transcripcion({"transcript_object": largo})
        self.assertLessEqual(sum(len(x["t"]) for x in t), grabaciones.MAX_CARACTERES)
        self.assertGreater(len(t), 10)


class TestEnlace(unittest.TestCase):
    def test_solo_https_de_dapta(self):
        self.assertEqual(grabaciones.enlace_grabacion(LLAMADA), LLAMADA["recording_url"])
        self.assertEqual(grabaciones.enlace_grabacion({"recording_url": "https://app.dapta.ai/calls/1"}), "https://app.dapta.ai/calls/1")
        self.assertIsNone(grabaciones.enlace_grabacion({"recording_url": "audio/call_1.ogg"}))
        self.assertIsNone(grabaciones.enlace_grabacion({"recording_url": "http://files.dapta.ai/calls/x.ogg"}))
        self.assertIsNone(grabaciones.enlace_grabacion({"recording_url": "https://evil.com/calls/x.ogg"}))
        self.assertIsNone(grabaciones.enlace_grabacion({"recording_url": "https://files.dapta.ai.evil.com/x"}))
        self.assertIsNone(grabaciones.enlace_grabacion({}))

    def test_extraer_junta_las_tres_cosas(self):
        e = grabaciones.extraer(LLAMADA)
        self.assertEqual(set(e), {"grabacion_url", "transcripcion", "duracion_ms"})
        self.assertEqual(e["duracion_ms"], 41508)
        self.assertEqual(grabaciones.extraer({"recording_url": "audio/x.ogg", "duration_ms": 0}), {})


class TestRegistro(unittest.TestCase):
    def test_el_registro_no_lleva_transcripcion_ni_audio(self):
        r = grabaciones.para_registro({"data": LLAMADA, "call": {"recording_url": "https://files.dapta.ai/x"}})
        texto = json.dumps(r, ensure_ascii=False)
        self.assertNotIn("Hola Ana", texto)
        self.assertNotIn("files.dapta.ai", texto)
        self.assertIn("call_abc123", texto)
        self.assertIn("573001112233", texto)


class TestInterruptor(unittest.TestCase):
    def prueba(self, valor, manuela, camila):
        with mock.patch.dict(os.environ, {"GRABACIONES_GUARDAR": valor}):
            self.assertEqual((grabaciones.habilitada("manuela"), grabaciones.habilitada("camila")), (manuela, camila), valor)

    def test_por_defecto_solo_camila(self):
        os.environ.pop("GRABACIONES_GUARDAR", None)
        self.assertEqual((grabaciones.habilitada("manuela"), grabaciones.habilitada("camila")), (False, True))

    def test_valores(self):
        self.prueba("todas", True, True)
        self.prueba("1", True, True)
        self.prueba("0", False, False)
        self.prueba("ninguna", False, False)
        self.prueba("manuela", True, False)
        self.prueba("manuela, camila", True, True)
        self.prueba("otra", False, False)


class TestGuardado(unittest.TestCase):
    def setUp(self):
        p = mock.patch.dict(os.environ, {"GRABACIONES_GUARDAR": "todas"})
        p.start()
        self.addCleanup(p.stop)

    def test_apagado_no_guarda_nada_de_manuela(self):
        a = llamadas.AlmacenMemoria()
        llamadas.configurar_almacen(a)
        self.addCleanup(llamadas.configurar_almacen, None)
        with mock.patch.dict(os.environ, {"GRABACIONES_GUARDAR": "camila"}):
            llamadas.guardar_resultado(LLAMADA, {}, "+573001112233", {"resumen_llamada": "Poco interés."})
        fila = a.resultados["call_abc123"]
        self.assertNotIn("transcripcion", fila)
        self.assertNotIn("grabacion_url", fila)
        self.assertEqual(fila["resumen_llamada"], "Poco interés.")

    def test_guardar_resultado_incluye_audio_y_transcripcion(self):
        a = llamadas.AlmacenMemoria()
        llamadas.configurar_almacen(a)
        self.addCleanup(llamadas.configurar_almacen, None)
        llamadas.guardar_resultado(LLAMADA, {}, "+573001112233", {"resumen_llamada": "Poco interés."})
        fila = a.resultados["call_abc123"]
        self.assertEqual(fila["grabacion_url"], LLAMADA["recording_url"])
        self.assertEqual(len(fila["transcripcion"]), 5)
        self.assertEqual(fila["duracion_ms"], 41508)

    def _supabase(self, rechazar_columnas: bool):
        enviados = []

        def manejador(req: httpx.Request) -> httpx.Response:
            cuerpo = json.loads(req.content) if req.content else None
            enviados.append(cuerpo)
            if rechazar_columnas and cuerpo and "transcripcion" in cuerpo:
                return httpx.Response(400, text='{"code":"PGRST204","message":"Could not find the \'transcripcion\' column"}')
            return httpx.Response(201, json=[])

        return enviados, httpx.Client(transport=httpx.MockTransport(manejador))

    def test_si_falta_la_migracion_se_guarda_sin_audio(self):
        enviados, cliente = self._supabase(rechazar_columnas=True)
        a = llamadas.AlmacenSupabase("https://x.supabase.co", "clave", cliente=cliente)
        a.guardar_resultado({"call_id": "c1", "telefono": "+573001112233", "grabacion_url": "https://files.dapta.ai/x", "transcripcion": [{"r": "a", "t": "hola"}],
                             "duracion_ms": 10, "resumen_llamada": "ok"})
        self.assertEqual(len(enviados), 2)
        self.assertNotIn("transcripcion", enviados[1])
        self.assertEqual(enviados[1]["resumen_llamada"], "ok")

    def test_otros_errores_si_suben(self):
        cliente = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500, text="boom")))
        a = llamadas.AlmacenSupabase("https://x.supabase.co", "clave", cliente=cliente)
        with self.assertRaises(RuntimeError):
            a.guardar_resultado({"call_id": "c1", "telefono": "+573001112233", "transcripcion": []})

    def test_captacion_guarda_audio_y_si_falta_la_migracion_reintenta(self):
        enviados = []

        def manejador(req: httpx.Request) -> httpx.Response:
            if req.method == "GET":
                return httpx.Response(200, json=[])
            cuerpo = json.loads(req.content)
            enviados.append(cuerpo)
            if "transcripcion" in cuerpo:
                return httpx.Response(400, text='{"code":"PGRST204"}')
            return httpx.Response(201, json=[])

        a = cap.AlmacenSupabase("https://x.supabase.co", "k", httpx.Client(transport=httpx.MockTransport(manejador)))
        ok = a.registrar_llamada({"prospecto_id": "p1", "call_id": "c9", "duracion_ms": 5000, "resumen": "x", "analisis": {},
                                  "grabacion_url": "https://files.dapta.ai/y", "transcripcion": [{"r": "a", "t": "hola"}]})
        self.assertTrue(ok)
        self.assertEqual(len(enviados), 2)
        self.assertNotIn("grabacion_url", enviados[1])
        self.assertEqual(enviados[1]["duracion_ms"], 5000)


if __name__ == "__main__":
    unittest.main()
