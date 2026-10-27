"""Pruebas del acceso del equipo: una empresa invita (desde el CRM) y la persona invitada crea su cuenta.
Desde backend/:  python -m unittest tests.test_equipo -v

Sin red ni base: el almacén es `AlmacenMemoria`. Las invitaciones las crea el CRM en `crm.invitaciones`; aquí se
siembran a mano en el almacén de memoria."""

import hashlib
import os
import sys
import unittest
from datetime import timedelta
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from api import acceso, admin, cuentas  # noqa: E402
from api import app as m  # noqa: E402
from api.almacen_acceso import AlmacenMemoria, ahora  # noqa: E402
from api.limites import limites  # noqa: E402
from api.metricas import metricas  # noqa: E402

CLAVE = "una frase larga 2026"
ORIGEN = {"Origin": "https://www.machea.co"}


def huella(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Base(unittest.TestCase):
    def setUp(self):
        self.env = {k: os.environ.pop(k, None) for k in ("ADMIN_PASSWORD", "ADMIN_TOTP_SECRET", "FRONT_URL", "ORIGENES_ACCESO")}
        os.environ["FRONT_URL"] = "https://www.machea.co"
        limites.reiniciar()
        metricas.reiniciar()
        self.almacen = AlmacenMemoria()
        acceso.configurar_almacen(self.almacen)
        cuentas.configurar_almacen(self.almacen)
        self.c = TestClient(m.app, base_url="https://www.machea.co", raise_server_exceptions=False)
        # La empresa dueña: una cuenta aprobada de una constructora.
        self.duena = self.almacen.crear_cuenta("constructora-andes", "ventas@andes.co", acceso.hash_clave(CLAVE))
        self.almacen.confirmar(self.duena["id"])
        self.almacen.aprobar(self.duena["id"], "constructora")

    def tearDown(self):
        acceso.configurar_almacen(None)
        cuentas.configurar_almacen(None)
        for k, v in self.env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

    def invitar(self, token="token-de-la-invitacion", correo="laura@andes.co", rol="asesor", vence=timedelta(days=7)):
        self.almacen.invitaciones[huella(token)] = {
            "empresa_id": self.duena["id"], "nombre": "Laura Gómez", "correo": correo, "rol": rol, "expira": ahora() + vence,
        }
        return token

    def unirse(self, token="token-de-la-invitacion", usuario="laura.gomez", clave=CLAVE, headers=ORIGEN):
        return self.c.post("/api/cuentas/unirse", json={"token": token, "usuario": usuario, "clave": clave}, headers=headers)


class TestUnirse(Base):
    def test_flujo_completo(self):
        t = self.invitar()
        r = self.unirse(t)
        self.assertEqual(r.status_code, 201, r.text)
        self.assertIn("machea_sesion", r.cookies)
        cuenta = r.json()["cuenta"]
        self.assertEqual(cuenta["usuario"], "laura.gomez")
        self.assertEqual(cuenta["correo"], "laura@andes.co")      # el de la invitación, no uno que ella elija
        self.assertEqual(cuenta["estado"], "aprobada")
        self.assertEqual(cuenta["tipo"], "constructora")         # el de su empresa
        fila = self.almacen.cuentas[cuenta["id"]]
        self.assertEqual(fila["empresa_id"], self.duena["id"])
        # La sesión sirve y la invitación queda gastada.
        self.assertEqual(self.c.get("/api/sesion").status_code, 200)
        self.assertIsNotNone(self.almacen.invitaciones[huella(t)]["usada_en"])
        self.assertEqual(self.almacen.invitaciones[huella(t)]["cuenta_id"], cuenta["id"])

    def test_puede_entrar_despues_con_su_correo(self):
        self.unirse(self.invitar())
        self.c.cookies.clear()
        r = self.c.post("/api/sesion", json={"correo": "laura@andes.co", "clave": CLAVE, "recordar": True}, headers=ORIGEN)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()["cuenta"]["estado"], "aprobada")

    def test_la_invitacion_se_gasta_una_sola_vez(self):
        t = self.invitar()
        self.assertEqual(self.unirse(t).status_code, 201)
        r = self.unirse(t, usuario="otra.persona")
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()["detail"]["codigo"], "invitacion_invalida")

    def test_invitacion_vencida_o_inexistente(self):
        self.assertEqual(self.unirse(self.invitar(vence=timedelta(seconds=-1))).json()["detail"]["codigo"], "invitacion_invalida")
        self.assertEqual(self.unirse("no-existe").json()["detail"]["codigo"], "invitacion_invalida")

    def test_si_la_empresa_ya_no_esta_aprobada_no_sirve(self):
        t = self.invitar()
        self.almacen.rechazar(self.duena["id"])
        self.assertEqual(self.unirse(t).json()["detail"]["codigo"], "invitacion_invalida")

    def test_una_persona_de_equipo_no_puede_invitar_a_su_vez(self):
        """La invitación apunta a la cuenta dueña: si apunta a una cuenta de equipo, no sirve (no hay cadenas de equipos)."""
        self.unirse(self.invitar())
        miembro = next(c for c in self.almacen.cuentas.values() if c.get("empresa_id"))
        self.almacen.invitaciones[huella("cadena")] = {
            "empresa_id": miembro["id"], "nombre": "X", "correo": "x@andes.co", "rol": "asesor", "expira": ahora() + timedelta(days=1),
        }
        self.assertEqual(self.unirse("cadena", usuario="x.persona").json()["detail"]["codigo"], "invitacion_invalida")

    def test_clave_debil_o_con_el_correo_dentro(self):
        t = self.invitar()
        r = self.unirse(t, clave="corta")
        self.assertEqual(r.status_code, 422)
        self.assertIn("clave", r.json()["detail"]["campos"])
        r = self.unirse(t, clave="mi laura@andes y mas texto")
        self.assertEqual(r.status_code, 422)
        # Sigue sirviendo: un error de datos no gasta la invitación.
        self.assertEqual(self.unirse(t).status_code, 201)

    def test_usuario_invalido_u_ocupado(self):
        t = self.invitar()
        self.assertEqual(self.unirse(t, usuario="Con Espacios").status_code, 422)
        r = self.unirse(t, usuario="constructora-andes")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"]["codigo"], "usuario_ocupado")

    def test_el_correo_invitado_ya_tiene_cuenta(self):
        t = self.invitar(correo="ventas@andes.co")      # el de la empresa dueña
        r = self.unirse(t)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["detail"]["codigo"], "correo_con_cuenta")

    def test_origen_ajeno(self):
        r = self.unirse(self.invitar(), headers={"Origin": "https://sitio-malo.example"})
        self.assertEqual(r.status_code, 403)

    def test_tope_por_invitacion(self):
        t = self.invitar()
        for _ in range(10):
            self.unirse(t, clave="corta")
        self.assertEqual(self.unirse(t).status_code, 429)

    def test_sin_almacen_responde_503(self):
        acceso.configurar_almacen(None)
        self.assertEqual(self.unirse().status_code, 503)

    def test_las_personas_de_equipo_no_aparecen_para_revisar_en_admin(self):
        self.unirse(self.invitar())
        usuarios = [c["usuario"] for c in self.almacen.listar(None)]
        self.assertIn("constructora-andes", usuarios)
        self.assertNotIn("laura.gomez", usuarios)


class TestHashDeLaClave(Base):
    """La contraseña se guarda con scrypt más fuerte y las antiguas se actualizan solas al entrar."""

    def test_los_hashes_nuevos_usan_parametros_actuales(self):
        partes = acceso.hash_clave(CLAVE).split("$")
        self.assertEqual((partes[1], partes[2], partes[3]), ("32768", "8", "3"))
        self.assertFalse(acceso.necesita_nuevo_hash(acceso.hash_clave(CLAVE)))

    def test_un_hash_antiguo_sirve_y_se_actualiza_al_entrar(self):
        import base64
        import hashlib

        sal = b"s" * 16
        dk = hashlib.scrypt(CLAVE.encode(), salt=sal, dklen=32, n=2 ** 14, r=8, p=1, maxmem=64 * 1024 * 1024)
        b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
        antiguo = f"scrypt$16384$8$1${b64(sal)}${b64(dk)}"
        self.assertTrue(acceso.verificar_clave(CLAVE, antiguo))
        self.assertTrue(acceso.necesita_nuevo_hash(antiguo))

        self.almacen.cuentas[self.duena["id"]]["clave_hash"] = antiguo
        r = self.c.post("/api/sesion", json={"correo": "ventas@andes.co", "clave": CLAVE, "recordar": True}, headers=ORIGEN)
        self.assertEqual(r.status_code, 200, r.text)
        nuevo = self.almacen.cuentas[self.duena["id"]]["clave_hash"]
        self.assertNotEqual(nuevo, antiguo)
        self.assertFalse(acceso.necesita_nuevo_hash(nuevo))
        self.assertTrue(acceso.verificar_clave(CLAVE, nuevo))     # la misma contraseña sigue sirviendo
        # Un intento con clave equivocada no toca el hash.
        self.almacen.cuentas[self.duena["id"]]["clave_hash"] = antiguo
        self.c.post("/api/sesion", json={"correo": "ventas@andes.co", "clave": "otra frase larga 2026", "recordar": True}, headers=ORIGEN)
        self.assertEqual(self.almacen.cuentas[self.duena["id"]]["clave_hash"], antiguo)


if __name__ == "__main__":
    unittest.main()
