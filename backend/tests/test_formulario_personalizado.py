"""Pruebas del formulario personalizado: el armado (features/formulario_personalizado) y su API
(api/formulario_personalizado.py).

Desde backend/:  python -m unittest tests.test_formulario_personalizado -v

Sin red: la marca y el catálogo se fabrican aquí."""

import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from features.formulario_personalizado import armar  # noqa: E402
from Model.rutas import DIR_FRONTEND  # noqa: E402

TENANT_MACHEA = os.path.join(DIR_FRONTEND, "public", "experiencia", "tenants", "machea")


def _leer_tenant(archivo, variable):
    """El objeto que un archivo de tenants/<slug>/ asigna a window.<variable>."""
    with open(os.path.join(TENANT_MACHEA, archivo), encoding="utf-8") as fh:
        texto = fh.read()
    m = re.search(r"window\." + variable + r"\s*=\s*(.*?);\s*(?:window\.|$)", texto, re.S)
    return json.loads(m.group(1))


MARCA = {"nombre": "Constructora Andes", "primario": "#0a7f5a", "acento": "#e4572e", "host": "constructoraandes.test",
         "fondo_logo": "claro", "detectado": True}

CATALOGO = {
    "empresa": "Constructora Andes", "dominio": "constructoraandes.test", "incompleto": False,
    "que_vende": {"principal": "vivienda", "tipos": {"vivienda": 2, "oficinas": 1}},
    "proyectos": [
        {"id_proyecto": 1, "nombre": "Bosque Verde", "url": "https://constructoraandes.test/proyectos/bosque-verde/",
         "tipo": "vivienda", "tipos": ["vivienda"], "segmento": "VIS", "operacion": ["venta"],
         "ciudad": "Bogotá", "localidad": {"id": 7, "nombre": "Bosa"}, "direccion": "Carrera 95A # 78 Sur - 20",
         "precio_desde_cop": 230_000_000, "precio_es_canon": False, "area_m2": {"desde": 48.5, "hasta": 62.0},
         "habitaciones": [2, 3], "banos": [2], "zonas_comunes": ["Piscina", "Gimnasio"],
         "primario": "#e4572e", "colores_principales": ["#e4572e"], "carpeta": "Bosque_Verde/1",
         "imagenes": [{"id": "01", "archivo": "01.jpg", "ruta": "Bosque_Verde/1/01.jpg",
                       "origen": "https://constructoraandes.test/media/1.jpg", "portada": True}]},
        {"id_proyecto": 2, "nombre": "Torre 90", "url": "https://constructoraandes.test/proyectos/torre-90",
         "tipo": "oficinas", "tipos": ["oficinas", "locales"], "segmento": None, "operacion": ["arriendo"],
         "ciudad": "Bogotá", "localidad": {"id": 2, "nombre": "Chapinero"}, "precio_desde_cop": 4_500_000,
         "precio_es_canon": True, "area_m2": {"desde": 45.0, "hasta": 300.0}, "habitaciones": [],
         "zonas_comunes": ["Gimnasio", "Coworking"],
         "imagenes": [{"id": "01", "archivo": None, "ruta": None, "origen": "https://constructoraandes.test/t.jpg"}]},
    ],
}


class TestArmado(unittest.TestCase):
    def setUp(self):
        self.d = armar.armar_formulario(MARCA, tipo="constructora", catalogo=CATALOGO, token="v1.x.y",
                                        logo_url="https://api.test/api/marca/logo?d=v1.x.y")

    def test_la_marca_tiene_la_forma_del_tenant_real(self):
        real = _leer_tenant("marca.js", "GDF_MARCA")
        nuestra = self.d["marca"]
        self.assertLessEqual(set(real), set(nuestra))
        for llave in ("identidad", "paleta", "tipografia", "copy", "geo", "negocio", "portada"):
            self.assertLessEqual(set(real[llave]), set(nuestra[llave]), llave)
        self.assertEqual(nuestra["slug"], "machea")              # la superficie clara y la estructura de Machea
        self.assertEqual(nuestra["identidad"]["nombre"], "Constructora Andes")
        self.assertEqual(nuestra["paleta"]["primario"], "#0a7f5a")

    def test_la_llave_demo_es_la_que_arma_demo_js(self):
        demo = self.d["marca"]["demo"]
        self.assertEqual(set(demo), {"nombre", "tipo", "primario", "acento", "tieneLogo", "fondoLogo", "host", "token"})
        self.assertTrue(demo["tieneLogo"])
        self.assertEqual(demo["token"], "v1.x.y")

    def test_los_proyectos_tienen_la_forma_del_catalogo_real(self):
        real = _leer_tenant("proyectos.js", "GDF_PROYECTOS")[0]
        for p in self.d["proyectos"]:
            self.assertLessEqual(set(real), set(p))
        bosque, torre = self.d["proyectos"]
        self.assertEqual((bosque["name"], bosque["price"], bosque["hab"], bosque["habMax"], bosque["vis"]),
                         ("Bosque Verde", 230_000_000, 2, 3, True))
        self.assertEqual(bosque["localidad"], "Bosa")
        self.assertEqual(bosque["amenidades"][0], {"label": "Piscina", "icon": "", "clave": "Piscina"})
        self.assertFalse(torre["vis"])                           # sin segmento escrito no se asume
        self.assertTrue(torre["precio_es_canon"])
        self.assertEqual(torre["galeria"][0]["url"], "https://constructoraandes.test/t.jpg")   # sin archivo: su origen

    def test_opciones_segun_lo_que_vende(self):
        preguntas = self.d["formulario"]["preguntas"]
        self.assertEqual(preguntas["operacion"]["opciones"], ["compra", "arriendo"])
        self.assertEqual(preguntas["tipo_propiedad"]["opciones"], ["Vivienda", "Oficinas"])
        self.assertEqual(preguntas["tipo"]["opciones"], ["VIS"])
        self.assertEqual(preguntas["zona"], {"campo": "localidad", "opciones": ["Bosa", "Chapinero"]})
        self.assertEqual(preguntas["habitaciones"]["opciones"], [2, 3])
        self.assertEqual(preguntas["entorno_deseado"]["amenidades"][0], "Gimnasio")       # el más común primero
        self.assertEqual(self.d["formulario"]["rango_precios"], {"desde": 230_000_000, "hasta": 230_000_000})
        self.assertEqual(self.d["formulario"]["rango_canon"]["desde"], 4_500_000)

    def test_fuera_de_bogota_la_zona_es_la_ciudad(self):
        otro = json.loads(json.dumps(CATALOGO))
        otro["proyectos"][1]["ciudad"], otro["proyectos"][1]["localidad"] = "Chía", None
        zona = armar.armar_formulario(MARCA, catalogo=otro)["formulario"]["preguntas"]["zona"]
        self.assertEqual(zona["campo"], "ciudad")
        self.assertEqual(set(zona["opciones"]), {"Bogotá", "Chía"})

    def test_estados(self):
        self.assertEqual(self.d["estado"], "completo")
        self.assertEqual(armar.armar_formulario(MARCA, catalogo={"proyectos": []})["estado"], "sin_proyectos")
        self.assertEqual(armar.armar_formulario(MARCA, estado_proyectos="en_cola")["estado"], "esperando_proyectos")
        solo = armar.armar_formulario(MARCA)
        self.assertEqual((solo["estado"], solo["proyectos"]), ("solo_marca", []))
        self.assertEqual(solo["formulario"]["preguntas"], {})

    def test_el_nombre_no_puede_meter_html(self):
        d = armar.armar_formulario({**MARCA, "nombre": "<img src=x onerror=alert(1)>"})
        self.assertNotIn("<img", d["marca"]["copy"]["splashLead"])
        self.assertIn("&lt;img", d["marca"]["copy"]["splashLead"])

    def test_espacio_de_diseno(self):
        diseno = self.d["diseno"]
        self.assertEqual((diseno["responsable"], diseno["estado"]), ("Santiago Dias", "pendiente"))
        self.assertTrue(diseno["decisiones_abiertas"])
        self.assertEqual(diseno["imagen_destacada"], "https://constructoraandes.test/media/1.jpg")
        self.assertTrue(os.path.isfile(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
            os.path.abspath(__file__)))), diseno["contrato"])))

    def test_tokens_con_contraste_medido(self):
        oscuro = armar.tokens_sugeridos("#0a3d62", None)
        self.assertEqual(oscuro["--texto-sobre-primario"], "#ffffff")
        self.assertTrue(oscuro["_contraste"]["boton_aa_texto_normal"])
        amarillo = armar.tokens_sugeridos("#fed141", "#00843d")
        self.assertEqual(amarillo["--texto-sobre-primario"], "#111111")      # sobre amarillo, texto oscuro
        self.assertEqual(amarillo["--texto-sobre-acento"], "#ffffff")
        self.assertAlmostEqual(armar.contraste("#ffffff", "#000000"), 21.0, places=1)


class TestApi(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from api import app as m
        from api import proyectos_web
        from api.limites import limites
        from features.scrap_identity import scrap
        from tests.test_demo import dns, falso_extraer
        limites.reiniciar()
        self.pw = proyectos_web
        self.pw._TRABAJOS.clear()
        self.addCleanup(self.pw._TRABAJOS.clear)
        for p in (mock.patch("socket.getaddrinfo", dns({})),
                  mock.patch.object(scrap, "extraer_colores", falso_extraer(["#fed141", "#00843d", None], "<svg/>")),
                  mock.patch.object(proyectos_web, "programar", return_value="en_cola")):
            p.start(); self.addCleanup(p.stop)
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def crear(self, **extra):
        cuerpo = {"nombre": "Laura", "correo": "laura@casalinda.test", "sitio": "casalinda.test",
                  "tipo": "inmobiliaria", **extra}
        return self.c.post("/api/formulario/personalizado", json=cuerpo, headers={"cf-connecting-ip": "6.6.6.6"})

    def test_datos_del_formulario_al_diseno(self):
        r = self.crear()
        self.assertEqual(r.status_code, 200, r.text)
        j = r.json()
        self.assertEqual(j["estado"], "esperando_proyectos")
        self.assertEqual(j["marca"]["identidad"]["nombre"], "Casa Linda Inmobiliaria")
        self.assertEqual(j["marca"]["paleta"]["primario"], "#fed141")
        self.assertTrue(j["marca"]["identidad"]["logo"].startswith("http://testserver/api/marca/logo?d="))
        self.assertIn("/experiencia/index.html?marca=machea&demo=", j["demo_url"])
        self.assertTrue(j["consultar"]["json"].startswith("http://testserver/api/formulario/personalizado?d="))
        self.assertEqual(j["empresa"]["marca_detectada"], True)
        self.pw.programar.assert_called_once_with("casalinda.test", "formulario_api")

    def test_valida_como_la_demo(self):
        self.assertEqual(self.crear(correo="no-es-correo").status_code, 400)
        self.assertEqual(self.crear(tipo="banco").status_code, 400)
        self.assertEqual(self.crear(sitio="http://169.254.169.254/").status_code, 400)
        self.assertEqual(self.crear(website="soy-un-bot").json(), {"ok": True, "estado": None})

    def test_consultar_con_el_token_y_la_dependencia(self):
        token = self.crear().json()["token"]
        j = self.c.get("/api/formulario/personalizado", params={"d": token}).json()
        self.assertEqual(j["empresa"]["nombre"], "Casa Linda Inmobiliaria")
        self.assertIsNone(j["empresa"]["marca_detectada"])      # el token no lo guarda
        self.assertEqual(self.c.get("/api/formulario/personalizado", params={"d": "v1.no.vale"}).status_code, 404)

    def test_como_script_para_el_cargador_de_tenants(self):
        token = self.crear(empresa="Casa </script> Linda").json()["token"]
        r = self.c.get("/api/formulario/personalizado.js", params={"d": token})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.headers["content-type"].startswith("application/javascript"))
        self.assertIn("window.GDF_MARCA = ", r.text)
        self.assertIn("window.GDF_PROYECTOS = ", r.text)
        self.assertNotIn("</script>", r.text)

    def test_con_proyectos_leidos_y_sus_fotos(self):
        tmp = tempfile.mkdtemp(prefix="formulario_")
        self.addCleanup(shutil.rmtree, tmp, True)
        os.makedirs(os.path.join(tmp, "Bosque_Verde", "1"))
        with open(os.path.join(tmp, "Bosque_Verde", "1", "01.jpg"), "wb") as fh:
            fh.write(b"\xff\xd8\xff-foto")
        with open(os.path.join(tmp, "secreto.jpg"), "wb") as fh:
            fh.write(b"no")
        catalogo = json.loads(json.dumps(CATALOGO))
        catalogo["proyectos"][1]["imagenes"] = [{"id": "01", "archivo": "01.jpg", "ruta": "../secreto.jpg"}]
        ruta = os.path.join(tmp, "proyectos_Casa_Linda.json")
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump(catalogo, fh)
        with mock.patch.object(self.pw, "catalogo_de", return_value=(catalogo, ruta)):
            token = self.crear().json()["token"]
            j = self.c.get("/api/formulario/personalizado", params={"d": token}).json()
            self.assertEqual(j["estado"], "completo")
            url = j["proyectos"][0]["galeria"][0]["url"]
            self.assertIn("/api/formulario/imagen?d=", url)
            foto = self.c.get(url.replace("http://testserver", ""))
            self.assertEqual((foto.status_code, foto.headers["content-type"], foto.content),
                             (200, "image/jpeg", b"\xff\xd8\xff-foto"))
            # Una ruta que se sale de la carpeta de la empresa no se sirve, aunque venga en el JSON.
            fuera = self.c.get("/api/formulario/imagen", params={"d": token, "p": 2, "i": "01"})
            self.assertEqual(fuera.status_code, 404)
            self.assertEqual(self.c.get("/api/formulario/imagen", params={"d": token, "p": 1, "i": "../x"}).status_code,
                             422)


if __name__ == "__main__":
    unittest.main()
