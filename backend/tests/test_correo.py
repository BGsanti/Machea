"""Pruebas del envío de correo.   Desde backend/:  python -m unittest tests.test_correo -v"""

import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import correo  # noqa: E402

PAYLOAD = {"to": "laura@empresa.test", "subject": "Tu demo de Machea", "html": "<p>Hola <b>Laura</b></p>", "text": "Hola Laura"}
VARS = ("SMTP_USER", "SMTP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "SMTP_FROM", "CORREO_RESPUESTA", "DAPTA_EMAIL_FLOW_URL")


class Base(unittest.TestCase):
    def setUp(self):
        for k in VARS:
            os.environ.pop(k, None)
        self.addCleanup(lambda: [os.environ.pop(k, None) for k in VARS])


class TestConfigurado(Base):
    def test_sin_nada_no_esta_configurado(self):
        self.assertFalse(correo.configurado())

    def test_smtp_necesita_usuario_y_clave(self):
        os.environ["SMTP_USER"] = "machea.co@gmail.com"
        self.assertFalse(correo.configurado())
        os.environ["SMTP_PASSWORD"] = "x"
        self.assertTrue(correo.configurado())

    def test_el_flow_de_dapta_tambien_cuenta(self):
        os.environ["DAPTA_EMAIL_FLOW_URL"] = "https://dapta.test/correo"
        self.assertTrue(correo.configurado())


class TestSmtp(Base):
    def setUp(self):
        super().setUp()
        os.environ.update({"SMTP_USER": "machea.co@gmail.com", "SMTP_PASSWORD": "abcd efgh ijkl mnop"})

    def test_por_ssl_en_el_puerto_465(self):
        with mock.patch("smtplib.SMTP_SSL") as ssl_cls:
            conn = ssl_cls.return_value.__enter__.return_value
            correo.enviar(PAYLOAD)
        self.assertEqual(ssl_cls.call_args.args[:2], ("smtp.gmail.com", 465))
        conn.login.assert_called_once_with("machea.co@gmail.com", "abcdefghijklmnop")   # sin los espacios
        msg = conn.send_message.call_args.args[0]
        self.assertEqual(msg["To"], "laura@empresa.test")
        self.assertEqual(msg["Subject"], "Tu demo de Machea")
        self.assertIn("machea.co@gmail.com", msg["From"])
        self.assertEqual(msg["Reply-To"], "equipo@machea.co")
        self.assertTrue(msg.is_multipart())
        tipos = [p.get_content_type() for p in msg.iter_parts()]
        self.assertEqual(tipos, ["text/plain", "text/html"])

    def test_por_starttls_en_el_587(self):
        os.environ["SMTP_PORT"] = "587"
        with mock.patch("smtplib.SMTP") as cls:
            conn = cls.return_value.__enter__.return_value
            correo.enviar(PAYLOAD)
        conn.starttls.assert_called_once()
        conn.login.assert_called_once()
        conn.send_message.assert_called_once()

    def test_remitente_y_respuesta_configurables(self):
        os.environ.update({"SMTP_FROM": "Machea Demos <demo@machea.co>", "CORREO_RESPUESTA": "ventas@machea.co"})
        with mock.patch("smtplib.SMTP_SSL") as ssl_cls:
            conn = ssl_cls.return_value.__enter__.return_value
            correo.enviar(PAYLOAD)
        msg = conn.send_message.call_args.args[0]
        self.assertEqual((msg["From"], msg["Reply-To"]), ("Machea Demos <demo@machea.co>", "ventas@machea.co"))

    def test_si_falla_no_lanza_ni_filtra_la_clave(self):
        with mock.patch("smtplib.SMTP_SSL", side_effect=OSError("connection refused")), \
             self.assertLogs("uvicorn.error", level="WARNING") as logs:
            correo.enviar(PAYLOAD)                                                     # no lanza
        self.assertNotIn("abcdefghijklmnop", "".join(logs.output))

    def test_un_asunto_con_salto_de_linea_no_inyecta_cabeceras(self):
        malo = dict(PAYLOAD, subject="Hola\nBcc: victima@x.test")
        with mock.patch("smtplib.SMTP_SSL") as ssl_cls:
            conn = ssl_cls.return_value.__enter__.return_value
            correo.enviar(malo)                                                        # se traga el error, no envía
        conn.send_message.assert_not_called()


class TestFlowDeDapta(Base):
    def test_usa_el_flow_si_no_hay_smtp(self):
        os.environ["DAPTA_EMAIL_FLOW_URL"] = "https://dapta.test/correo"
        with mock.patch("httpx.Client") as cli:
            correo.enviar(PAYLOAD)
        cli.return_value.__enter__.return_value.post.assert_called_once()

    def test_smtp_tiene_prioridad(self):
        os.environ.update({"SMTP_USER": "a@gmail.com", "SMTP_PASSWORD": "x", "DAPTA_EMAIL_FLOW_URL": "https://dapta.test/c"})
        with mock.patch("smtplib.SMTP_SSL") as ssl_cls, mock.patch("httpx.Client") as cli:
            correo.enviar(PAYLOAD)
        ssl_cls.assert_called_once()
        cli.assert_not_called()

    def test_sin_configuracion_no_hace_nada(self):
        with mock.patch("smtplib.SMTP_SSL") as ssl_cls, mock.patch("httpx.Client") as cli:
            correo.enviar(PAYLOAD)
        ssl_cls.assert_not_called(); cli.assert_not_called()


if __name__ == "__main__":
    unittest.main()
