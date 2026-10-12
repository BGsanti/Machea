"""Pruebas del panel de administración.   Desde backend/:  python -m unittest tests.test_admin -v

Sin red: las comprobaciones hablan con un transporte HTTP falso (`admin._TRANSPORTE`)."""

import json
import os
import smtplib
import sys
import time
import unittest
from unittest import mock

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import admin, correo  # noqa: E402
from api import app as m  # noqa: E402
from api.limites import limites  # noqa: E402
from api.metricas import enmascarar_ip, enmascarar_telefono, metricas  # noqa: E402
from tests.test_limites import Base as BaseLlamadas, FakeCliente, cuerpo  # noqa: E402

CLAVE = "clave-de-prueba-bien-larga-123"
SECRETOS = {
    "ADMIN_PASSWORD": CLAVE,
    "DAPTA_API_KEY": "dapta_pat_NO_DEBE_SALIR_9f3a",
    "DAPTA_FLOW_WEBHOOK_URL": "https://flows.dapta.test/api/webhook/RUTA_SECRETA_77",
    "SUPABASE_ANON_KEY": "anon-NO_DEBE_SALIR_42",
    "SMTP_USER": "machea.co@gmail.com",
    "SMTP_PASSWORD": "abcdefghijklmnop",
    "FRONT_URL": "https://front.test",
    "SUPABASE_URL": "https://db.test",
}
ENV_TODAS = list(SECRETOS) + [
    "ADMIN_TOTP_SECRET", "ADMIN_SECRET", "ADMIN_SESION_MINUTOS", "DAPTA_EMAIL_FLOW_URL", "DAPTA_WHATSAPP_FLOW_URL",
    "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "DAPTA_MCP_URL", "RENDER_GIT_COMMIT", "SMTP_HOST", "SMTP_PORT",
]
SECRETO_TOTP = "JBSWY3DPEHPK3PXP"            # base32 de prueba


def mcp_sse(resultados):
    """Servidor MCP falso: `resultados` {herramienta: dict}. Contesta en formato SSE como el real."""
    def manejador(req: httpx.Request) -> httpx.Response:
        cuerpo_ = json.loads(req.content or b"{}")
        metodo = cuerpo_.get("method")
        if metodo == "initialize":
            return httpx.Response(200, headers={"content-type": "text/event-stream", "mcp-session-id": "sesion-1"},
                                  text='event: message\ndata: ' + json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}}) + "\n\n")
        if metodo == "notifications/initialized":
            return httpx.Response(202)
        nombre = cuerpo_["params"]["name"]
        r = {"jsonrpc": "2.0", "id": cuerpo_["id"], "result": {"content": [{"type": "text", "text": json.dumps(resultados.get(nombre, {}))}]}}
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, text="data: " + json.dumps(r) + "\n\n")
    return manejador


def saldo(disponibles, plan="Pro"):
    return {"success": True, "balance": {"success": True, "data": {"plan": {"name": plan}, "available_credits_ledger": disponibles}}}


class Mundo:
    """El internet falso de las pruebas: cada host contesta lo que se le configure."""

    def __init__(self):
        self.peticiones = []
        self.front = 200
        self.supabase = 200
        self.flow = 204
        self.dapta_init = 200
        self.dapta = {"whoami": {"workspace": {"id": "c61858f2-aaaa"}, "can_write": True}, "get_my_balance": saldo(900000)}
        self.proveedores = {"render": "none", "vercel": "none", "supabase": "none", "cloudflare": "none"}
        self.error_red = None

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.peticiones.append((req.method, str(req.url)))
        if self.error_red and self.error_red in req.url.host:
            raise httpx.ConnectTimeout("tiempo agotado")
        host = req.url.host
        if host == "front.test":
            return httpx.Response(self.front, headers={"x-vercel-id": "gru1::abc123"}, text="<html>")
        if host == "db.test":
            return httpx.Response(self.supabase, json=[] if self.supabase == 200 else {"message": "x"})
        if host == "flows.dapta.test":
            return httpx.Response(self.flow)
        if host == "mcp.dapta.ai":
            if self.dapta_init != 200:
                return httpx.Response(self.dapta_init)
            return mcp_sse(self.dapta)(req)
        for id_, _n, url, _p in admin.PROVEEDORES:
            if host == httpx.URL(url).host:
                ind = self.proveedores[id_]
                return httpx.Response(200, json={"status": {"indicator": ind, "description": f"estado {ind}"}})
        if host in ("api.anthropic.com", "api.openai.com"):
            return httpx.Response(200, json={"data": []})
        return httpx.Response(404)


class Base(unittest.TestCase):
    def setUp(self):
        self.guardado = {k: os.environ.pop(k, None) for k in ENV_TODAS}
        os.environ.update(SECRETOS)
        self.mundo = Mundo()
        admin._TRANSPORTE = httpx.MockTransport(self.mundo)
        admin._PAUSA_FALLO = 0
        admin.cerrojo.reiniciar()
        admin._CACHE.clear()
        admin._REVOCADOS.clear()
        admin._ultimo_contador_totp = 0
        limites.reiniciar()
        metricas.reiniciar()
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def tearDown(self):
        admin._TRANSPORTE = None
        for k in ENV_TODAS:
            os.environ.pop(k, None)
        os.environ.update({k: v for k, v in self.guardado.items() if v is not None})

    def entrar(self, ip="9.9.9.9", clave=CLAVE, **extra):
        return self.c.post("/api/admin/login", json={"clave": clave, **extra}, headers={"cf-connecting-ip": ip})

    def token(self):
        return self.entrar().json()["token"]

    def pedir_estado(self, token=None, ip="9.9.9.9"):
        token = token or self.token()
        return self.c.get("/api/admin/estado", headers={"Authorization": f"Bearer {token}", "cf-connecting-ip": ip})

    def servicio(self, estado_json, id_):
        return next(s for s in estado_json["servicios"] if s["id"] == id_)


# ---------------------------------------------------------------------------

class TestAcceso(Base):
    def test_apagado_sin_clave_o_con_clave_corta(self):
        os.environ.pop("ADMIN_PASSWORD")
        self.assertEqual(self.entrar().status_code, 404)
        self.assertEqual(self.c.get("/api/admin/estado").status_code, 404)
        os.environ["ADMIN_PASSWORD"] = "a" * 15                         # una menos que el mínimo
        self.assertEqual(self.entrar(clave="a" * 15).status_code, 404)
        os.environ["ADMIN_PASSWORD"] = "a" * 16
        self.assertEqual(self.entrar(clave="a" * 16).status_code, 200)

    def test_login_malo_y_bueno(self):
        r = self.entrar(clave="otra-clave-cualquiera")
        self.assertEqual(r.status_code, 401)
        self.assertEqual(r.json()["detail"], "Credenciales incorrectas.")
        self.assertNotIn("token", r.json())
        r = self.entrar()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.headers["cache-control"], "no-store")
        j = r.json()
        self.assertTrue(j["token"].startswith("a1."))
        self.assertAlmostEqual(j["expira"] - time.time(), 3600, delta=5)

    def test_sin_token_o_con_token_malo(self):
        self.assertEqual(self.c.get("/api/admin/estado").status_code, 401)
        self.assertEqual(self.c.get("/api/admin/estado", headers={"Authorization": "Bearer nada"}).status_code, 401)
        self.assertEqual(self.c.get("/api/admin/estado", headers={"Authorization": "Basic abc"}).status_code, 401)
        self.assertEqual(self.c.get("/api/admin/estado", headers={"Authorization": "Bearer " + "a1.x.y" * 200}).status_code, 401)

    def test_token_adulterado_o_vencido(self):
        t = self.token()
        pref, cuerpo_, firma = t.split(".")
        self.assertIsNotNone(admin.verificar_token(t))
        self.assertIsNone(admin.verificar_token(f"{pref}.{cuerpo_}.{firma[:-2]}AA"))
        otro = admin._b64(json.dumps({"iat": 1, "exp": time.time() + 99999, "jti": "x"}).encode())
        self.assertIsNone(admin.verificar_token(f"{pref}.{otro}.{firma}"))          # cuerpo cambiado, firma vieja
        with mock.patch("time.time", return_value=time.time() + 3601):
            self.assertIsNone(admin.verificar_token(t))                              # venció

    def test_cambiar_la_clave_invalida_las_sesiones(self):
        t = self.token()
        os.environ["ADMIN_PASSWORD"] = "una-clave-nueva-igual-de-larga"
        self.assertEqual(self.pedir_estado(t).status_code, 401)

    def test_salir_revoca_el_token(self):
        t = self.token()
        self.assertEqual(self.pedir_estado(t).status_code, 200)
        self.assertEqual(self.c.post("/api/admin/logout", headers={"Authorization": f"Bearer {t}"}).status_code, 200)
        self.assertEqual(self.pedir_estado(t).status_code, 401)

    def test_duracion_de_la_sesion_configurable_y_acotada(self):
        os.environ["ADMIN_SESION_MINUTOS"] = "1"
        self.assertEqual(admin._minutos_sesion(), 5)
        os.environ["ADMIN_SESION_MINUTOS"] = "99999"
        self.assertEqual(admin._minutos_sesion(), 480)
        os.environ["ADMIN_SESION_MINUTOS"] = "abc"
        self.assertEqual(admin._minutos_sesion(), 60)

    def test_cinco_fallos_bloquean_a_esa_ip_aunque_la_clave_sea_buena(self):
        for _ in range(5):
            self.assertEqual(self.entrar(clave="mala-mala-mala-mala").status_code, 401)
        r = self.entrar()                                                            # ya con la clave buena
        self.assertEqual(r.status_code, 429)
        self.assertGreater(int(r.headers["retry-after"]), 0)
        self.assertEqual(self.entrar(ip="8.8.8.8").status_code, 200)                 # otra IP no se afecta

    def test_un_acceso_bueno_borra_los_fallos(self):
        for _ in range(4):
            self.entrar(clave="mala-mala-mala-mala")
        self.assertEqual(self.entrar().status_code, 200)
        for _ in range(4):
            self.assertEqual(self.entrar(clave="mala-mala-mala-mala").status_code, 401)
        self.assertEqual(self.entrar().status_code, 200)

    def test_no_cuenta_para_el_bloqueo_pedir_el_codigo(self):
        os.environ["ADMIN_TOTP_SECRET"] = SECRETO_TOTP
        for _ in range(8):
            self.assertEqual(self.entrar().status_code, 401)                         # falta el código: no es fallo
        self.assertNotEqual(self.entrar().status_code, 429)

    def test_todas_las_respuestas_del_panel_salen_sin_cache(self):
        malo = self.entrar(clave="mala-mala-mala-mala")                              # 401
        sin_token = self.c.get("/api/admin/estado")                                   # 401
        bueno = self.entrar()                                                         # 200
        os.environ.pop("ADMIN_PASSWORD")
        apagado = self.entrar()                                                       # 404
        for r in (malo, sin_token, bueno, apagado):
            self.assertEqual(r.headers["cache-control"], "no-store", r.status_code)
            self.assertIn("noindex", r.headers["x-robots-tag"])
            self.assertEqual(r.headers["x-content-type-options"], "nosniff")
        self.assertNotIn("no-store", self.c.get("/api/health").headers.get("cache-control", ""))   # el resto no cambia

    def test_las_rutas_no_salen_en_la_documentacion(self):
        paths = self.c.get("/openapi.json").json()["paths"]
        self.assertFalse([p for p in paths if "admin" in p])

    def test_quedan_anotados_los_accesos_con_ip_enmascarada(self):
        self.entrar(ip="203.0.113.77", clave="mala-mala-mala-mala")
        self.entrar(ip="203.0.113.77")
        ev = metricas.eventos(["admin_login_ok", "admin_login_fallido"])
        self.assertEqual([e["tipo"] for e in ev], ["admin_login_ok", "admin_login_fallido"])
        self.assertTrue(all("203.0.113.•" in e["texto"] and "77" not in e["texto"] for e in ev))


class TestSegundoFactor(Base):
    def setUp(self):
        super().setUp()
        os.environ["ADMIN_TOTP_SECRET"] = SECRETO_TOTP
        self.secreto = admin._totp_secreto()

    def codigo(self, delta=0):
        return admin._codigo_totp(self.secreto, int(time.time() // 30) + delta)

    def test_vector_rfc_6238(self):
        # Apéndice B del RFC 6238 (SHA-1, secreto "12345678901234567890"), T = 59 s -> 94287082 -> últimos 6.
        self.assertEqual(admin._codigo_totp(b"12345678901234567890", 59 // 30), "287082")

    def test_clave_sola_pide_el_codigo(self):
        r = self.entrar()
        self.assertEqual(r.status_code, 401)
        self.assertTrue(r.json()["requiere_codigo"])
        self.assertNotIn("token", r.json())

    def test_con_codigo_correcto_entra(self):
        r = self.entrar(codigo=self.codigo())
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(self.c.get("/api/admin/estado", headers={"Authorization": "Bearer " + r.json()["token"]}).json()["seguridad"]["segundo_factor"])

    def test_codigo_malo_o_clave_mala_dan_el_mismo_mensaje(self):
        a = self.entrar(codigo="000000")
        b = self.entrar(clave="mala-mala-mala-mala", codigo=self.codigo())
        c = self.entrar(clave="mala-mala-mala-mala")
        for r in (a, b, c):
            self.assertEqual(r.status_code, 401)
            self.assertEqual(r.json(), {"detail": "Credenciales incorrectas."})

    def test_un_codigo_no_se_puede_reusar(self):
        cod = self.codigo()
        self.assertEqual(self.entrar(codigo=cod).status_code, 200)
        self.assertEqual(self.entrar(codigo=cod, ip="7.7.7.7").status_code, 401)

    def test_acepta_el_paso_anterior_pero_no_uno_lejano(self):
        self.assertEqual(self.entrar(codigo=self.codigo(-1)).status_code, 200)
        self.assertEqual(self.entrar(codigo=self.codigo(-3), ip="7.7.7.7").status_code, 401)

    def test_secreto_invalido_apaga_el_panel(self):
        os.environ["ADMIN_TOTP_SECRET"] = "esto no es base32 !!"
        self.assertEqual(self.entrar().status_code, 404)


class TestEstado(Base):
    def test_todo_bien(self):
        r = self.pedir_estado()
        self.assertEqual(r.status_code, 200, r.text)
        j = r.json()
        self.assertEqual(j["global"]["estado"], "ok", j["global"])
        ids = [s["id"] for s in j["servicios"]]
        self.assertEqual(ids, ["backend", "front", "supabase", "dapta_api", "dapta_flow", "manuela", "claude", "openai", "correo", "whatsapp"])
        self.assertEqual(self.servicio(j, "front")["meta"]["region"], "gru1")
        self.assertEqual(self.servicio(j, "supabase")["meta"]["prueba"], "completa")
        self.assertEqual({p["id"] for p in j["proveedores"]}, {"render", "vercel", "supabase", "cloudflare"})
        self.assertEqual(self.servicio(j, "claude")["estado"], "sin_configurar")

    def test_el_flow_se_prueba_con_options_nunca_con_post(self):
        self.pedir_estado()
        a_dapta = [(met, url) for met, url in self.mundo.peticiones if "flows.dapta.test" in url]
        self.assertEqual(a_dapta, [("OPTIONS", SECRETOS["DAPTA_FLOW_WEBHOOK_URL"])])

    def test_no_se_filtra_ningun_secreto(self):
        metricas.registrar("llamada_enviada", "Llamada pedida · …3915", "ok")
        texto = self.pedir_estado().text
        for nombre in ("ADMIN_PASSWORD", "DAPTA_API_KEY", "SUPABASE_ANON_KEY", "SMTP_PASSWORD"):
            self.assertNotIn(SECRETOS[nombre], texto, nombre)
        self.assertNotIn("RUTA_SECRETA_77", texto)                                   # ni la ruta del webhook
        self.assertNotIn("abcdefghijklmnop", texto)
        cfg = {c["variable"]: c["configurada"] for c in json.loads(texto)["configuracion"]}
        self.assertTrue(cfg["DAPTA_API_KEY"] and cfg["SMTP_PASSWORD"])
        self.assertFalse(cfg["ANTHROPIC_API_KEY"])

    def test_la_cache_evita_repetir_llamadas_a_terceros(self):
        t = self.token()
        self.pedir_estado(t)
        n = len(self.mundo.peticiones)
        self.pedir_estado(t)
        self.assertEqual(len(self.mundo.peticiones), n)                              # todo salió de la caché

    def test_front_caido_o_lento(self):
        self.mundo.front = 503
        j = self.pedir_estado().json()
        self.assertEqual((self.servicio(j, "front")["estado"], j["global"]["estado"]), ("caido", "caido"))
        admin._CACHE.clear(); self.mundo.front = 404
        self.assertEqual(self.servicio(self.pedir_estado().json(), "front")["estado"], "degradado")

    def test_supabase(self):
        casos = [(200, "ok"), (401, "caido"), (404, "caido"), (503, "caido"), (418, "degradado")]
        for codigo, esperado in casos:
            admin._CACHE.clear(); self.mundo.supabase = codigo
            self.assertEqual(self.servicio(self.pedir_estado().json(), "supabase")["estado"], esperado, codigo)
        admin._CACHE.clear(); self.mundo.supabase = 200
        os.environ.pop("SUPABASE_ANON_KEY")                                           # sin clave: solo el servicio
        s = self.servicio(self.pedir_estado().json(), "supabase")
        self.assertEqual((s["estado"], s["meta"]["prueba"]), ("ok", "solo servicio"))
        self.assertIn("SUPABASE_ANON_KEY", s["detalle"])

    def test_flow_de_dapta(self):
        self.assertEqual(self.servicio(self.pedir_estado().json(), "dapta_flow")["estado"], "ok")
        admin._CACHE.clear(); self.mundo.flow = 405
        self.assertEqual(self.servicio(self.pedir_estado().json(), "dapta_flow")["estado"], "ok")     # 405 también es "responde"
        admin._CACHE.clear(); self.mundo.flow = 502
        self.assertEqual(self.servicio(self.pedir_estado().json(), "dapta_flow")["estado"], "caido")
        admin._CACHE.clear(); os.environ.pop("DAPTA_FLOW_WEBHOOK_URL")
        j = self.pedir_estado().json()
        self.assertEqual((self.servicio(j, "dapta_flow")["estado"], j["global"]["estado"]), ("caido", "caido"))
        admin._CACHE.clear(); os.environ["DAPTA_FLOW_WEBHOOK_URL"] = SECRETOS["DAPTA_FLOW_WEBHOOK_URL"]
        self.mundo.flow = 204
        os.environ.pop("DAPTA_API_KEY")
        self.assertEqual(self.servicio(self.pedir_estado().json(), "dapta_flow")["estado"], "degradado")

    def test_cuenta_de_dapta_y_creditos(self):
        casos = [(900000, "ok"), (2000, "degradado"), (0, "caido"), (-1328, "caido")]
        for creditos, esperado in casos:
            admin._CACHE.clear(); self.mundo.dapta["get_my_balance"] = saldo(creditos)
            s = self.servicio(self.pedir_estado().json(), "dapta_api")
            self.assertEqual(s["estado"], esperado, creditos)
        admin._CACHE.clear(); self.mundo.dapta["get_my_balance"] = saldo(900000)
        s = self.servicio(self.pedir_estado().json(), "dapta_api")
        self.assertEqual((s["meta"]["workspace"], s["meta"]["plan"], s["meta"]["minutos_aprox"]), ("c61858f2", "Pro", 1351))

    def test_cuenta_de_dapta_saldo_ilegible_o_clave_sin_permiso(self):
        self.mundo.dapta["get_my_balance"] = {"success": True, "balance": None}
        self.assertEqual(self.servicio(self.pedir_estado().json(), "dapta_api")["estado"], "ok")
        admin._CACHE.clear(); self.mundo.dapta_init = 401
        s = self.servicio(self.pedir_estado().json(), "dapta_api")
        self.assertEqual(s["estado"], "degradado")
        admin._CACHE.clear(); os.environ.pop("DAPTA_API_KEY")
        self.assertEqual(self.servicio(self.pedir_estado().json(), "dapta_api")["estado"], "sin_configurar")

    def test_saldo_calculado_si_no_viene_el_libro(self):
        self.mundo.dapta["get_my_balance"] = {"balance": {"data": {"credits_capacity": 10000, "usage": {"credits": 4000}}}}
        s = self.servicio(self.pedir_estado().json(), "dapta_api")
        self.assertEqual((s["estado"], s["meta"]["creditos"]), ("ok", 6000))

    def test_proveedores(self):
        self.mundo.proveedores.update(render="minor", cloudflare="critical", vercel="major")
        j = self.pedir_estado().json()
        est = {p["id"]: p["estado"] for p in j["proveedores"]}
        self.assertEqual(est, {"render": "degradado", "vercel": "degradado", "supabase": "ok", "cloudflare": "caido"})
        self.assertEqual(j["global"]["estado"], "ok")                                # un proveedor caído no tumba el estado propio…
        self.assertIn("Cloudflare", j["global"]["resumen"])                          # …pero se avisa

    def test_el_proveedor_supabase_no_hereda_el_resultado_del_servicio_supabase(self):
        # Mismo id, cosas distintas: la base de datos responde bien, pero su página de estado reporta un problema.
        self.mundo.proveedores["supabase"] = "critical"
        j = self.pedir_estado().json()
        self.assertEqual(self.servicio(j, "supabase")["estado"], "ok")
        prov = next(p for p in j["proveedores"] if p["id"] == "supabase")
        self.assertEqual((prov["estado"], prov["grupo"]), ("caido", "proveedor"))
        self.assertIn("critical", prov["detalle"])

    def test_proveedor_ilegible_es_desconocido_no_caido(self):
        self.mundo.error_red = "vercel-status.com"
        est = {p["id"]: p["estado"] for p in self.pedir_estado().json()["proveedores"]}
        self.assertEqual(est["vercel"], "desconocido")

    def test_timeout_es_caido_y_el_resto_sigue(self):
        self.mundo.error_red = "db.test"
        j = self.pedir_estado().json()
        s = self.servicio(j, "supabase")
        self.assertEqual((s["estado"], s["detalle"]), ("caido", "No respondió a tiempo."))
        self.assertEqual(self.servicio(j, "front")["estado"], "ok")
        self.assertEqual(j["global"]["estado"], "caido")

    def test_una_comprobacion_rota_no_tumba_el_panel(self):
        with mock.patch.object(admin, "_chk_whatsapp", side_effect=RuntimeError("boom")):
            items = [(i, g, n, 0, admin._chk_whatsapp if i == "whatsapp" else f) for i, g, n, _t, f in admin.CHEQUEOS]
            with mock.patch.object(admin, "CHEQUEOS", items):
                j = self.pedir_estado().json()
        self.assertEqual(self.servicio(j, "whatsapp")["estado"], "desconocido")
        self.assertEqual(self.servicio(j, "backend")["estado"], "ok")

    def test_sin_configurar_no_cuenta_como_caido(self):
        j = self.pedir_estado().json()
        self.assertEqual(self.servicio(j, "whatsapp")["estado"], "sin_configurar")
        self.assertEqual(j["global"]["estado"], "ok")

    def test_ia_configurada(self):
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-NO_DEBE_SALIR"
        j = self.pedir_estado().json()
        self.assertEqual(self.servicio(j, "claude")["estado"], "ok")
        self.assertNotIn("sk-ant-NO_DEBE_SALIR", json.dumps(j))

    def test_manuela_segun_la_actividad(self):
        self.assertEqual(self.servicio(self.pedir_estado().json(), "manuela")["estado"], "ok")
        metricas.registrar("llamada_enviada", "x", "ok")
        s = self.servicio(self.pedir_estado().json(), "manuela")
        self.assertEqual(s["estado"], "degradado")                                    # pidió, pero nunca llegó un resultado
        metricas.registrar("resultado_recibido", "x", "ok")
        self.assertEqual(self.servicio(self.pedir_estado().json(), "manuela")["estado"], "ok")

    def test_correo(self):
        os.environ.pop("SMTP_USER"); os.environ.pop("SMTP_PASSWORD")
        self.assertEqual(self.servicio(self.pedir_estado().json(), "correo")["estado"], "sin_configurar")
        os.environ["SMTP_USER"] = "machea.co@gmail.com"; os.environ["SMTP_PASSWORD"] = "abcdefghijklmnop"
        self.assertEqual(self.servicio(self.pedir_estado().json(), "correo")["estado"], "ok")
        metricas.registrar("correo_error", "falló", "error")
        self.assertEqual(self.servicio(self.pedir_estado().json(), "correo")["estado"], "degradado")
        metricas.registrar("correo_enviado", "bien", "ok")
        self.assertEqual(self.servicio(self.pedir_estado().json(), "correo")["estado"], "ok")

    def test_uso_de_los_topes(self):
        with mock.patch.object(m, "DAPTA_FLOW_WEBHOOK_URL", "https://dapta.test/flow"), mock.patch("httpx.Client", FakeCliente):
            FakeCliente.enviados = []
            self.c.post("/api/llamar", json=cuerpo("3001234567"), headers={"cf-connecting-ip": "1.2.3.4"})
        uso = self.pedir_estado().json()["uso"]
        self.assertEqual((uso["total"], uso["tope_total"], uso["demo"], uso["tope_demo"]), (1, 100, 0, 30))


class TestActividad(BaseLlamadas):
    """Las llamadas, rechazos, errores y resultados quedan anotados, sin teléfonos completos."""

    def setUp(self):
        super().setUp()
        metricas.reiniciar()

    def test_llamada_enviada_rechazada_y_con_error(self):
        self.assertEqual(self.llamar("3125923915").status_code, 200)
        self.assertEqual(self.llamar("3125923915").status_code, 429)
        FakeCliente.falla = True
        self.llamar("3001112233")
        tipos = [e["tipo"] for e in metricas.eventos()]
        self.assertEqual(tipos, ["llamada_error", "llamada_rechazada", "llamada_enviada"])
        self.assertIn("ya se pidió una llamada a ese número", metricas.ultimo("llamada_rechazada")["texto"])
        todo = json.dumps(metricas.eventos(), ensure_ascii=False)
        self.assertIn("…3915", todo)
        self.assertNotIn("3125923915", todo)
        self.assertNotIn("3001112233", todo)
        self.assertEqual(metricas.conteo("llamada_enviada", 3600), 1)

    def test_resultado_del_webhook(self):
        self.c.post("/webhooks/dapta/resultado", json={"data": {"to_number": "+573125923915", "call_status": "ended",
                                                                "disconnection_reason": "user_hangup"}})
        e = metricas.ultimo("resultado_recibido")
        self.assertIn("la persona colgó", e["texto"])
        self.assertNotIn("3125923915", e["texto"])

    def test_medir_nunca_rompe(self):
        with mock.patch.object(metricas, "_lock", None):                              # un fallo interno cualquiera
            metricas.registrar("x", "y")                                              # no lanza


class TestProbarCorreo(Base):
    def test_requiere_sesion_y_tiene_tope(self):
        self.assertEqual(self.c.post("/api/admin/probar-correo").status_code, 401)
        t = self.token()
        h = {"Authorization": f"Bearer {t}"}
        with mock.patch.object(correo, "probar", return_value=(True, "Inicio de sesión correcto.")):
            for _ in range(3):
                self.assertEqual(self.c.post("/api/admin/probar-correo", headers=h).json(), {"ok": True, "mensaje": "Inicio de sesión correcto."})
            self.assertEqual(self.c.post("/api/admin/probar-correo", headers=h).status_code, 429)

    def test_probar_no_envia_nada_y_no_filtra_la_clave(self):
        enviado = []

        class SMTP:
            def __init__(self, *a, **k): pass
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def login(self, u, p): enviado.append(("login", u, p))
            def send_message(self, *_): enviado.append("MENSAJE")

        with mock.patch("smtplib.SMTP_SSL", SMTP):
            ok, msg = correo.probar()
        self.assertTrue(ok)
        self.assertEqual([e[0] for e in enviado], ["login"])                          # solo inició sesión
        self.assertNotIn("abcdefghijklmnop", msg)
        self.assertIn("ma•••@gmail.com", msg)

    def test_probar_errores(self):
        class Rechaza:
            def __init__(self, *a, **k): pass
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def login(self, u, p): raise smtplib.SMTPAuthenticationError(535, b"BadCredentials abcdefghijklmnop")

        with mock.patch("smtplib.SMTP_SSL", Rechaza):
            ok, msg = correo.probar()
        self.assertFalse(ok)
        self.assertNotIn("abcdefghijklmnop", msg)
        self.assertIn("rechazó", msg)
        with mock.patch("smtplib.SMTP_SSL", side_effect=OSError("sin red")):
            self.assertIn("No se pudo conectar", correo.probar()[1])
        os.environ.pop("SMTP_USER")
        self.assertIn("Falta configurar", correo.probar()[1])
        os.environ["DAPTA_EMAIL_FLOW_URL"] = "https://flow.test"
        self.assertIn("flow de Dapta", correo.probar()[1])


class TestMascaras(unittest.TestCase):
    def test_telefono_e_ip(self):
        self.assertEqual(enmascarar_telefono("+573125923915"), "…3915")
        self.assertEqual(enmascarar_telefono(None), "—")
        self.assertEqual(enmascarar_telefono("12"), "—")
        self.assertEqual(enmascarar_ip("203.0.113.77"), "203.0.113.•")
        self.assertEqual(enmascarar_ip("2001:db8:1:2::9"), "2001:db8:1:•")
        self.assertEqual(enmascarar_ip(""), "—")
        self.assertEqual(enmascarar_ip("rara"), "—")


if __name__ == "__main__":
    unittest.main()
