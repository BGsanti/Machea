"""Pruebas del login del lado del servidor.   Desde backend/:  python -m unittest tests.test_acceso -v

Sin red ni base: el almacén es `AlmacenMemoria` y los correos se capturan en una lista."""

import os
import sys
import unittest
from datetime import timedelta
from unittest import mock
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import acceso, admin, cuentas  # noqa: E402
from api import app as m  # noqa: E402
from api.almacen_acceso import AlmacenMemoria  # noqa: E402
from api.limites import limites  # noqa: E402
from api.metricas import metricas  # noqa: E402

CLAVE = "una frase larga 2026"
ADMIN = "clave-de-prueba-bien-larga-123"
ORIGEN = {"Origin": "https://www.machea.co"}


class Base(unittest.TestCase):
    def setUp(self):
        self.env = {k: os.environ.pop(k, None) for k in ("ADMIN_PASSWORD", "ADMIN_TOTP_SECRET", "FRONT_URL", "ORIGENES_ACCESO", "CORREO_EQUIPO")}
        os.environ["FRONT_URL"] = "https://www.machea.co"
        limites.reiniciar()
        metricas.reiniciar()
        self.almacen = AlmacenMemoria()
        acceso.configurar_almacen(self.almacen)
        cuentas.configurar_almacen(self.almacen)
        self.correos = []
        self.parche = mock.patch.object(acceso, "enviar_correo", side_effect=self.correos.append)
        self.parche.start()
        self.c = TestClient(m.app, base_url="https://www.machea.co", raise_server_exceptions=False)

    def tearDown(self):
        self.parche.stop()
        acceso.configurar_almacen(None)
        cuentas.configurar_almacen(None)
        for k, v in self.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    # utilidades
    def token(self, correo_):
        enlace = [ln for ln in correo_["text"].split() if ln.startswith("http")][0]
        q = parse_qs(urlparse(enlace).query)
        return (q.get("confirmar") or q.get("token"))[0]

    def registrar(self, usuario="constructora-andes", correo="Ventas@Andes.co", clave=CLAVE):
        return self.c.post("/api/cuentas", json={"usuario": usuario, "correo": correo, "clave": clave}, headers=ORIGEN)

    def confirmar(self):
        conf = [c for c in self.correos if c["subject"].startswith("Confirma")][-1]
        return self.c.post("/api/cuentas/confirmar", json={"token": self.token(conf)}, headers=ORIGEN)

    def entrar(self, correo="ventas@andes.co", clave=CLAVE, recordar=True):
        return self.c.post("/api/sesion", json={"correo": correo, "clave": clave, "recordar": recordar}, headers=ORIGEN)


class TestRegistro(Base):
    def test_flujo_completo(self):
        r = self.registrar()
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(r.json(), {"correo": "ventas@andes.co"})
        asuntos = [c["subject"] for c in self.correos]
        self.assertIn("Confirma tu correo en Machea", asuntos)
        self.assertTrue(any(a.startswith("Nueva cuenta por revisar") for a in asuntos), asuntos)
        conf = [c for c in self.correos if c["subject"].startswith("Confirma")][0]
        self.assertIn("https://www.machea.co/acceso/?confirmar=", conf["text"])

        self.assertEqual(self.entrar().json()["detail"]["codigo"], "correo_sin_confirmar")
        self.assertEqual(self.confirmar().status_code, 204)
        self.assertEqual(self.confirmar().json()["detail"]["codigo"], "enlace_invalido")   # un solo uso

        r = self.entrar()
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["cuenta"]["estado"], "pendiente")
        self.assertNotIn("clave_hash", r.text)
        galleta = r.headers["set-cookie"]
        for atributo in ("machea_sesion=", "HttpOnly", "Secure", "SameSite=lax", "Path=/api", "Max-Age="):
            self.assertIn(atributo.lower(), galleta.lower())

        s = self.c.get("/api/sesion")
        self.assertEqual(s.status_code, 200)
        self.assertEqual(s.json()["cuenta"]["usuario"], "constructora-andes")
        self.assertEqual(s.headers["cache-control"], "no-store")

        self.assertEqual(self.c.delete("/api/sesion", headers=ORIGEN).status_code, 204)
        self.assertEqual(self.c.get("/api/sesion").status_code, 401)

    def test_la_clave_se_guarda_con_scrypt(self):
        self.registrar()
        fila = self.almacen.por_correo("ventas@andes.co")
        self.assertTrue(fila["clave_hash"].startswith("scrypt$16384$8$1$"))
        self.assertNotIn(CLAVE, fila["clave_hash"])
        self.assertTrue(acceso.verificar_clave(CLAVE, fila["clave_hash"]))
        self.assertFalse(acceso.verificar_clave("otra cosa larga", fila["clave_hash"]))

    def test_datos_invalidos_por_campo(self):
        r = self.registrar(usuario="Con Espacio", correo="malo", clave="corta")
        self.assertEqual(r.status_code, 422)
        self.assertEqual(set(r.json()["detail"]["campos"]), {"usuario", "correo", "clave"})
        r = self.registrar(clave="constructora-andes-2026")
        self.assertIn("usuario", r.json()["detail"]["campos"]["clave"])

    def test_correo_y_usuario_ocupados(self):
        self.registrar()
        self.assertEqual(self.registrar(usuario="otra").json()["detail"]["codigo"], "correo_ocupado")
        self.assertEqual(self.registrar(correo="b@andes.co").json()["detail"]["codigo"], "usuario_ocupado")

    def test_reenviar_no_revela_y_solo_si_falta_confirmar(self):
        self.registrar()
        n = len(self.correos)
        r = self.c.post("/api/cuentas/reenviar-confirmacion", json={"correo": "nadie@x.co"}, headers=ORIGEN)
        self.assertEqual(r.status_code, 204)
        self.assertEqual(len(self.correos), n)
        self.c.post("/api/cuentas/reenviar-confirmacion", json={"correo": "VENTAS@andes.co"}, headers=ORIGEN)
        self.assertEqual(len(self.correos), n + 1)
        # el enlace nuevo invalida el anterior
        viejo = [c for c in self.correos if c["subject"].startswith("Confirma")][0]
        self.assertEqual(self.c.post("/api/cuentas/confirmar", json={"token": self.token(viejo)}, headers=ORIGEN).status_code, 400)
        self.assertEqual(self.confirmar().status_code, 204)

    def test_tope_por_ip_usa_la_ip_real_detras_de_vercel(self):
        # Para Render todas llegan desde Vercel (misma CF-Connecting-IP); la IP real viene en x-forwarded-for.
        base = {**ORIGEN, "CF-Connecting-IP": "76.76.21.21"}
        for i in range(20):
            self.c.post("/api/cuentas", json={"usuario": "x", "correo": "malo", "clave": "c"},
                        headers={**base, "X-Forwarded-For": "200.1.1.1, 76.76.21.21"})
        bloqueada = self.c.post("/api/cuentas", json={"usuario": "x", "correo": "malo", "clave": "c"},
                                headers={**base, "X-Forwarded-For": "200.1.1.1, 76.76.21.21"})
        self.assertEqual(bloqueada.status_code, 429)
        otra = self.c.post("/api/cuentas", json={"usuario": "x", "correo": "malo", "clave": "c"},
                           headers={**base, "X-Forwarded-For": "181.2.2.2, 76.76.21.21"})
        self.assertEqual(otra.status_code, 422)                 # otra persona no comparte el tope

    def test_enlace_vencido(self):
        self.registrar()
        for e in self.almacen.enlaces.values():
            e["expira"] -= timedelta(days=2)
        self.assertEqual(self.confirmar().json()["detail"]["codigo"], "enlace_invalido")


class TestEntrar(Base):
    def setUp(self):
        super().setUp()
        self.registrar()
        self.confirmar()

    def test_credenciales_malas_genericas(self):
        a = self.entrar(clave="clave equivocada 123")
        b = self.entrar(correo="nadie@x.co")
        self.assertEqual(a.status_code, 401)
        self.assertEqual(a.json(), b.json())

    def test_tope_de_cinco_fallos(self):
        for _ in range(5):
            self.entrar(clave="clave equivocada 123")
        self.assertEqual(self.entrar().json()["detail"]["codigo"], "demasiados_intentos")
        # pasados 15 minutos se libera
        for i in self.almacen.intentos:
            i["en"] -= timedelta(minutes=16)
        self.assertEqual(self.entrar().status_code, 200)

    def test_sin_recordar_la_cookie_es_de_sesion(self):
        r = self.entrar(recordar=False)
        self.assertNotIn("max-age", r.headers["set-cookie"].lower())
        s = list(self.almacen.sesiones.values())[0]
        self.assertFalse(s["recordar"])

    def test_sesion_vencida_y_cookie_basura(self):
        self.entrar()
        for s in self.almacen.sesiones.values():
            s["expira"] -= timedelta(days=31)
        self.assertEqual(self.c.get("/api/sesion").status_code, 401)
        self.c.cookies.set("machea_sesion", "inventada", domain="www.machea.co", path="/api")
        self.assertEqual(self.c.get("/api/sesion").status_code, 401)

    def test_origen_ajeno_403(self):
        r = self.c.post("/api/sesion", json={"correo": "ventas@andes.co", "clave": CLAVE}, headers={"Origin": "https://malo.com"})
        self.assertEqual(r.status_code, 403)
        for origen in ("https://machea.co", "http://localhost:5173"):
            self.assertEqual(self.c.post("/api/sesion", json={"correo": "ventas@andes.co", "clave": CLAVE},
                                         headers={"Origin": origen}).status_code, 200, origen)

    def test_google_apagado(self):
        r = self.c.post("/api/sesion/google", json={"idToken": "x", "nonce": "y"}, headers=ORIGEN)
        self.assertEqual(r.json()["detail"]["codigo"], "no_disponible")


class TestRecuperar(Base):
    def setUp(self):
        super().setUp()
        self.registrar()
        self.confirmar()

    def test_recuperar_cambia_la_clave_y_cierra_sesiones(self):
        self.entrar()
        n = len(self.correos)
        self.assertEqual(self.c.post("/api/clave/recuperar", json={"correo": "nadie@x.co"}, headers=ORIGEN).status_code, 204)
        self.assertEqual(len(self.correos), n)
        self.c.post("/api/clave/recuperar", json={"correo": "ventas@andes.co"}, headers=ORIGEN)
        rec = self.correos[-1]
        self.assertIn("/acceso/nueva-clave/?token=", rec["text"])
        token = self.token(rec)

        r = self.c.post("/api/clave", json={"token": token, "clave": "corta"}, headers=ORIGEN)
        self.assertEqual(r.json()["detail"]["campos"]["clave"], "Usa al menos 10 caracteres.")
        self.assertEqual(self.c.post("/api/clave", json={"token": token, "clave": "otra frase larga 2027"}, headers=ORIGEN).status_code, 204)
        self.assertEqual(self.c.post("/api/clave", json={"token": token, "clave": "otra frase larga 2028"}, headers=ORIGEN).status_code, 400)
        self.assertEqual(self.c.get("/api/sesion").status_code, 401)
        self.assertEqual(self.entrar().status_code, 401)
        self.assertEqual(self.entrar(clave="otra frase larga 2027").status_code, 200)


class TestAdminYBase(Base):
    def test_aprobar_desde_admin_avisa_a_la_empresa(self):
        os.environ["ADMIN_PASSWORD"] = ADMIN
        admin._PAUSA_FALLO = 0
        admin.cerrojo.reiniciar()
        admin._REVOCADOS.clear()
        self.registrar()
        self.confirmar()
        t = self.c.post("/api/admin/login", json={"clave": ADMIN}).json()["token"]
        h = {"Authorization": "Bearer " + t}
        [c] = self.c.get("/api/admin/cuentas?estado=pendiente", headers=h).json()["cuentas"]
        r = self.c.post(f"/api/admin/cuentas/{c['id']}/aprobar", json={"tipo": "constructora"}, headers=h)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.correos[-1]["subject"], "Tu cuenta de Machea está activa")
        self.assertEqual(self.entrar().json()["cuenta"]["tipo"], "constructora")

    def test_sin_base_503(self):
        acceso.configurar_almacen(None)
        self.assertEqual(self.registrar().json()["detail"]["codigo"], "no_disponible")
        self.assertEqual(self.c.get("/api/sesion").status_code, 503)

    def test_base_caida_503_y_no_500(self):
        import psycopg

        with mock.patch.object(self.almacen, "por_correo", side_effect=psycopg.OperationalError("sin red")):
            r = self.entrar()
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["detail"]["codigo"], "no_disponible")


if __name__ == "__main__":
    unittest.main()
