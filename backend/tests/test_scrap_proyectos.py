"""Pruebas de features/scrap_proyectos y de su enganche con los formularios (api/proyectos_web.py).

Desde backend/:  python -m unittest tests.test_scrap_proyectos -v

Todo sin red: el sitio de la constructora es un diccionario y las fotos se fabrican con Pillow."""

import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from PIL import Image  # noqa: E402

from features.scrap_identity import scrap as identidad  # noqa: E402
from features.scrap_proyectos import scrap as sp  # noqa: E402

BASE = "https://www.constructoraandes.test"


def foto(color, tamano=(900, 600), formato="JPEG"):
    """Una "foto" de un color dominante con algo de textura: una de color plano pesa menos de lo que
    pesa cualquier foto real y caería bajo MIN_BYTES_IMAGEN."""
    ruido = Image.effect_noise(tamano, 60).convert("RGB")
    imagen = Image.blend(Image.new("RGB", tamano, color), ruido, 0.12)
    salida = io.BytesIO()
    imagen.save(salida, formato, quality=90)
    return salida.getvalue()


CABECERA = (
    '<header><a href="/"><img src="/img/logo.png" alt="Logo Constructora Andes"></a>'
    '<nav><a href="/proyectos">Proyectos</a><a href="/nosotros">Nosotros</a>'
    '<a href="/blog/feria">Blog</a><a href="/contacto">Contacto</a></nav></header>'
)
PIE = '<footer><img src="/img/sello-calidad.jpg"> Sala de ventas en Medellín y Cali</footer>'
GENERICA = '<img src="/media/comun/render-generico.jpg">'

PORTADA = f"""<html><head><title>Constructora Andes | Vivienda en Bogotá</title>
<meta name="theme-color" content="#0a7f5a"></head><body>{CABECERA}
<main><h1>Construimos hogares</h1><p>Apartamentos, casas y oficinas.</p></main>{PIE}</body></html>"""

LISTADO = f"""<html><head><title>Proyectos | Constructora Andes</title></head><body>{CABECERA}
<main><h1>Nuestros proyectos</h1>
<a href="/proyectos/bosque-verde/">Bosque Verde</a>
<a href="/proyectos/torre-empresarial-90">Torre Empresarial 90</a>
<a href="/proyectos/como-comprar">Cómo comprar</a>
<a href="/proyectos/page/2">Siguiente</a></main>{PIE}</body></html>"""

LISTADO_2 = f"""<html><head><title>Proyectos - página 2</title></head><body>{CABECERA}
<main><a href="/proyectos/reserva-del-lago">Reserva del Lago</a></main>{PIE}</body></html>"""

BOSQUE = f"""<html><head>
<title>Apartamentos VIS en Bogotá - Bosque Verde | Constructora Andes</title>
<meta property="og:title" content="Bosque Verde | Constructora Andes">
<meta property="og:image" content="{BASE}/media/bosque/portada.jpg">
<meta name="description" content="Apartamentos VIS de 2 y 3 habitaciones en Bosa, Bogotá.">
<link rel="canonical" href="{BASE}/proyectos/bosque-verde/">
<script type="application/ld+json">{{"@context": "https://schema.org", "@type": "ApartmentComplex",
 "name": "Bosque Verde", "address": {{"@type": "PostalAddress", "streetAddress": "Carrera 95A # 78 Sur - 20, Bosa",
 "addressLocality": "Bogotá"}}, "geo": {{"latitude": 4.61, "longitude": -74.19}}}}</script>
<style>.hero {{ background: #e4572e; }}</style></head><body>{CABECERA}
<main><h1>Bosque Verde</h1>
<p>Apartamentos VIS desde $ 230.000.000. Áreas desde 48,5 m2 hasta 62 m². 2 y 3 habitaciones, 2 baños.
Sala de ventas abierta todos los días. Sobre planos. Ventanas amplias.</p>
<section class="galeria">
  <img data-src="/media/bosque/1.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">
  <img srcset="/media/bosque/2-480.jpg 480w, /media/bosque/2-1200.jpg 1200w">
  <img src="/media/bosque/icono-piscina.png" width="32" height="32">
  <img src="/media/bosque/mini.jpg">
  <a href="/media/bosque/3.jpg">Ampliar</a>
</section>
<section><h2>Zonas comunes</h2><ul><li>Piscina</li><li>Gimnasio dotado</li><li>Terraza BBQ</li>
<li>Chute de basuras</li><li>Ver más</li><li>2 Alcobas</li></ul></section>
<section><h3>Cercanías de interés</h3><ul><li>Colegios</li><li>Supermercados</li></ul></section>
{GENERICA}
<section class="otros"><h3>Otros proyectos</h3>
  <article class="project-card"><a href="/proyectos/torre-empresarial-90"><img src="/media/torre/card.jpg">
    <p>Torre Empresarial 90 desde $ 150.000.000 · 20 m2</p></a></article>
  <article class="project-card"><a href="/proyectos/reserva-del-lago"><img src="/media/lago/card.jpg">
    <p>Reserva del Lago</p></a></article>
</section></main>{PIE}</body></html>"""

TORRE = f"""<html><head>
<title>Torre Empresarial 90 | Oficinas en arriendo | Constructora Andes</title>
<meta name="description" content="Oficinas y locales comerciales en arriendo en Bogotá.">
<meta property="og:image" content="{BASE}/media/torre/portada.png"></head><body>{CABECERA}
<main><h1>Torre Empresarial 90</h1>
<p>Oficinas desde 45 m2 hasta 300 m2. Locales comerciales en el primer piso.
Canon desde $ 4.500.000 al mes. Entrega inmediata. Calle 90 # 11 - 20, Bogotá.</p>
{GENERICA}</main>{PIE}</body></html>"""

LAGO = f"""<html><head><title>Reserva del Lago - Casas campestres en Chía</title>
<meta property="og:image" content="{BASE}/media/lago/portada.webp"></head><body>{CABECERA}
<main><h1>Reserva del Lago</h1>
<p>Casas de 3 y 4 habitaciones desde 180 m2. Lotes desde 1.200 m2. Precio desde 850 millones.
Un bello proyecto rodeado de pasto y montañas.</p>
{GENERICA}</main>{PIE}</body></html>"""

COMO_COMPRAR = f"""<html><head><title>Cómo comprar | Constructora Andes</title></head><body>{CABECERA}
<main><h1>Guía para comprar</h1><p>Te contamos paso a paso.</p></main>{PIE}</body></html>"""

ROBOTS = f"User-agent: *\nDisallow:\nSitemap: {BASE}/sitemap_index.xml\n"
INDICE = f"""<?xml version="1.0"?><sitemapindex>
<sitemap><loc>{BASE}/post-sitemap.xml</loc></sitemap>
<sitemap><loc>{BASE}/proyecto-sitemap.xml</loc></sitemap></sitemapindex>"""
SITEMAP_PROYECTOS = f"""<?xml version="1.0"?><urlset>
<url><loc>{BASE}/proyectos/bosque-verde/</loc></url>
<url><loc>{BASE}/proyectos/torre-empresarial-90</loc></url></urlset>"""
SITEMAP_POSTS = f"""<?xml version="1.0"?><urlset><url><loc>{BASE}/blog/feria</loc></url></urlset>"""

ROJO = foto((208, 64, 42))
SITIO = {
    "/": (PORTADA, "text/html; charset=utf-8"),
    "/robots.txt": (ROBOTS, "text/plain"),
    "/sitemap_index.xml": (INDICE, "application/xml"),
    "/proyecto-sitemap.xml": (SITEMAP_PROYECTOS, "application/xml"),
    "/post-sitemap.xml": (SITEMAP_POSTS, "application/xml"),
    "/proyectos": (LISTADO, "text/html"),
    "/proyectos/page/2": (LISTADO_2, "text/html"),
    "/proyectos/bosque-verde": (BOSQUE, "text/html"),
    "/proyectos/torre-empresarial-90": (TORRE, "text/html"),
    "/proyectos/reserva-del-lago": (LAGO, "text/html"),
    "/proyectos/como-comprar": (COMO_COMPRAR, "text/html"),
    "/media/bosque/portada.jpg": (foto((200, 60, 40)), "image/jpeg"),
    "/media/bosque/1.jpg": (ROJO, "image/jpeg"),
    "/media/bosque/3.jpg": (ROJO, "image/jpeg"),                 # la misma foto: se guarda una vez
    "/media/bosque/2-1200.jpg": (foto((215, 70, 50), (1200, 800)), "image/jpeg"),
    "/media/bosque/mini.jpg": (foto((215, 70, 50), (200, 150)), "image/jpeg"),
    "/media/torre/portada.png": (foto((30, 60, 160), (1000, 700), "PNG"), "image/png"),
    "/media/lago/portada.webp": (foto((40, 140, 70), (1200, 800), "WEBP"), "image/webp"),
    "/media/comun/render-generico.jpg": (foto((128, 128, 128)), "image/jpeg"),
    "/media/torre/card.jpg": (foto((30, 60, 160)), "image/jpeg"),       # tarjetas de OTROS proyectos
    "/media/lago/card.jpg": (foto((40, 140, 70)), "image/jpeg"),
    "/img/sello-calidad.jpg": (foto((250, 250, 250)), "image/jpeg"),
}


class FakeResp:
    def __init__(self, cuerpo, tipo, url):
        self.content = cuerpo.encode("utf-8") if isinstance(cuerpo, str) else cuerpo
        self.headers = {"Content-Type": tipo}
        self.url = url
        self.encoding = "utf-8"

    @property
    def text(self):
        return self.content.decode("utf-8")


def get_falso(pedidas):
    def get(url, timeout=None, reintentos=None, **kw):
        pedidas.append(url)
        ruta = url.replace(BASE, "").split("?")[0].rstrip("/") or "/"
        if not url.startswith(BASE) or ruta not in SITIO:
            raise RuntimeError(f"GET falló en {url}: 404")
        cuerpo, tipo = SITIO[ruta]
        return FakeResp(cuerpo, tipo, url)
    return get


IDENTIDAD = {"empresa": "Constructora Andes", "carpeta": "Constructora_Andes", "primario": "#0a7f5a",
             "secundario": None, "acento": None, "fondo": "#ffffff", "texto": "#111111",
             "paleta": [{"hex": "#0a7f5a"}], "marca": ["#0a7f5a"], "neutros": [], "logo": {"archivo": None}}


class TestExtraccionCompleta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="proyectos_")
        cls.pedidas = []
        with mock.patch.object(identidad, "_get", get_falso(cls.pedidas)):
            cls.r = sp.extraer_proyectos("www.constructoraandes.test", dir_salida=cls.tmp,
                                         identidad=dict(IDENTIDAD), presupuesto_s=60)
        cls.por_nombre = {p["nombre"]: p for p in cls.r["proyectos"]}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_encuentra_los_tres_proyectos_y_nada_mas(self):
        self.assertEqual(sorted(self.por_nombre), ["Bosque Verde", "Reserva del Lago", "Torre Empresarial 90"])
        self.assertEqual([p["id_proyecto"] for p in self.r["proyectos"]], [1, 2, 3])   # ids por nombre
        self.assertFalse(self.r["incompleto"])

    def test_lo_que_no_es_proyecto_queda_descartado_con_motivo(self):
        motivos = {d["url"]: d["motivo"] for d in self.r["descartados"]}
        self.assertIn(f"{BASE}/proyectos/como-comprar", motivos)
        self.assertIn("no parece un proyecto", motivos[f"{BASE}/proyectos/como-comprar"])
        self.assertFalse(any("/blog/" in u or "/contacto" in u or "/nosotros" in u for u in self.pedidas))

    def test_sigue_el_sitemap_de_proyectos_y_no_el_de_posts(self):
        self.assertIn(f"{BASE}/proyecto-sitemap.xml", self.r["fuentes"]["sitemaps"])
        self.assertNotIn(f"{BASE}/post-sitemap.xml", self.r["fuentes"]["sitemaps"])
        self.assertIn(f"{BASE}/proyectos/page/2", self.r["fuentes"]["listados"])

    def test_ficha_de_vivienda(self):
        p = self.por_nombre["Bosque Verde"]
        self.assertEqual((p["tipo"], p["segmento"], p["ciudad"]), ("vivienda", "VIS", "Bogotá"))
        self.assertIn("apartamentos", p["subtipos"])
        self.assertEqual(p["precio_desde_cop"], 230_000_000)
        self.assertEqual(p["area_m2"], {"desde": 48.5, "hasta": 62.0})
        self.assertEqual((p["habitaciones"], p["banos"]), ([2, 3], [2]))
        self.assertEqual(p["operacion"], ["venta"])
        self.assertEqual(p["estado_obra"], "sobre planos")
        self.assertEqual((p["lat"], p["lon"]), (4.61, -74.19))
        self.assertTrue(p["direccion"].startswith("Carrera 95A"))
        self.assertEqual(p["url"], f"{BASE}/proyectos/bosque-verde/")

    def test_amenidades_con_el_vocabulario_del_modelo(self):
        p = self.por_nombre["Bosque Verde"]
        self.assertEqual(set(p["zonas_comunes"]), {"Piscina", "Gimnasio", "Zona BBQ"})
        self.assertEqual(p["zonas_comunes_no_mapeadas"], ["Chute de basuras"])   # se reporta, no se adivina
        # "Ver más", "2 Alcobas", "Colegios" y "Supermercados" comparten página con las amenidades sin serlo.

    def test_el_carrusel_de_otros_proyectos_no_contamina_la_ficha(self):
        p = self.por_nombre["Bosque Verde"]
        self.assertEqual(p["precio_desde_cop"], 230_000_000)                 # no el $150 M de la tarjeta de al lado
        self.assertEqual(p["area_m2"]["desde"], 48.5)                         # ni sus 20 m2
        self.assertFalse(any("card.jpg" in i["origen"] for i in p["imagenes"]))
        # Y los enlaces del carrusel sí sirven para recorrer el sitio.
        self.assertIn("Torre Empresarial 90", self.por_nombre)

    def test_oficinas_en_arriendo(self):
        p = self.por_nombre["Torre Empresarial 90"]
        self.assertEqual(p["tipo"], "oficinas")
        self.assertIn("locales", p["tipos"])
        self.assertIsNone(p["segmento"])
        self.assertEqual(p["operacion"], ["arriendo"])
        self.assertEqual((p["precio_desde_cop"], p["precio_es_canon"]), (4_500_000, True))
        self.assertEqual(p["estado_obra"], "entrega inmediata")
        self.assertEqual(p["area_m2"]["desde"], 45.0)

    def test_casas_fuera_de_bogota_y_ciudades_ambiguas(self):
        p = self.por_nombre["Reserva del Lago"]
        self.assertEqual((p["tipo"], p["ciudad"], p["precio_desde_cop"]), ("vivienda", "Chía", 850_000_000))
        self.assertIn("casas", p["subtipos"])
        self.assertEqual(p["habitaciones"], [3, 4])
        self.assertIsNone(p["localidad"])

    def test_que_vende_la_empresa(self):
        self.assertEqual(self.r["que_vende"]["principal"], "vivienda")
        self.assertEqual(self.r["que_vende"]["tipos"]["vivienda"], 2)

    def test_fotos_en_carpeta_nombre_e_id(self):
        p = self.por_nombre["Bosque Verde"]
        self.assertEqual(p["carpeta"], "Bosque_Verde/1")
        origenes = [i["origen"] for i in p["imagenes"]]
        self.assertEqual(origenes, [f"{BASE}/media/bosque/portada.jpg", f"{BASE}/media/bosque/1.jpg",
                                    f"{BASE}/media/bosque/2-1200.jpg"])
        self.assertEqual([i["id"] for i in p["imagenes"]], ["01", "02", "03"])
        self.assertTrue(p["imagenes"][0]["portada"] and not p["imagenes"][1]["portada"])
        carpeta = os.path.join(self.tmp, "Constructora_Andes", "Bosque_Verde", "1")
        self.assertEqual(sorted(os.listdir(carpeta)), ["01.jpg", "02.jpg", "03.jpg"])
        lago = self.por_nombre["Reserva del Lago"]["imagenes"]
        self.assertEqual((len(lago), lago[0]["archivo"]), (1, "01.webp"))
        self.assertEqual(self.por_nombre["Torre Empresarial 90"]["imagenes"][0]["archivo"], "01.png")

    def test_descarta_cromo_iconos_miniaturas_y_repetidas(self):
        todas = [i["origen"] for p in self.r["proyectos"] for i in p["imagenes"]]
        for sobra in ("render-generico", "logo", "icono", "mini", "sello", "3.jpg", "2-480"):
            self.assertFalse(any(sobra in u for u in todas), sobra)

    def test_colores_del_proyecto(self):
        bosque = self.por_nombre["Bosque Verde"]
        self.assertEqual(bosque["colores_pagina"], ["#e4572e"])               # propio de esa ficha
        self.assertEqual(bosque["primario"], "#e4572e")
        self.assertTrue(all(c["hex"].startswith("#") and len(c["hex"]) == 7 for c in bosque["paleta"]))
        r, g, b = sp._rgb(bosque["paleta"][0]["hex"])
        self.assertGreater(r, g + 80)                                         # sus fotos son rojizas
        torre = self.por_nombre["Torre Empresarial 90"]
        self.assertNotIn("#0a7f5a", torre["colores_pagina"])                  # el color del sitio no es del proyecto
        r, g, b = sp._rgb(torre["primario"])
        self.assertGreater(b, r + 60)                                         # sus fotos son azules

    def test_json_en_disco_igual_al_devuelto(self):
        ruta = os.path.join(self.tmp, "Constructora_Andes", "proyectos_Constructora_Andes.json")
        with open(ruta, encoding="utf-8") as fh:
            disco = json.load(fh)
        self.assertEqual(disco["total_proyectos"], 3)
        self.assertEqual(disco["total_imagenes"], 5)
        self.assertEqual(disco["empresa_identidad"]["primario"], "#0a7f5a")
        self.assertFalse(any(k in disco["proyectos"][0] for k in ("_candidatas", "_colores_css")))
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "Constructora_Andes.nueva")))


class TestSalidaAparte(unittest.TestCase):
    def test_con_dir_salida_la_identidad_no_toca_las_versionadas(self):
        tmp = tempfile.mkdtemp(prefix="salida_")
        self.addCleanup(shutil.rmtree, tmp, True)
        vistos = []

        def extraer(url, dir_salida=None, **k):
            vistos.append(dir_salida)
            return dict(IDENTIDAD)
        with mock.patch.object(identidad, "_get", get_falso([])), \
             mock.patch.object(identidad, "extraer_colores", side_effect=extraer):
            sp.extraer_proyectos(BASE, dir_salida=tmp, descargar_imagenes=False, presupuesto_s=30)
        self.assertEqual(vistos, [os.path.join(tmp, "_identidades")])


class TestReglas(unittest.TestCase):
    def test_forma_de_la_url(self):
        raiz = "andes.com.co"
        casos = {
            "https://www.andes.com.co/proyectos/bosque-verde": (4, False),
            "https://www.andes.com.co/proyecto-bosque-verde": (3, False),
            "https://www.andes.com.co/proyectos": (1, True),
            "https://www.andes.com.co/proyectos/bogota": (1, True),
            "https://www.andes.com.co/blog/feria-de-vivienda": (-1, False),
            "https://www.andes.com.co/proyectos/page/3": (-1, False),
            "https://www.andes.com.co/brochure.pdf": (-1, False),
            "https://otro-sitio.com/proyectos/x": (-1, False),
            "https://ventas.andes.com.co/proyectos/x": (4, False),
        }
        for url, esperado in casos.items():
            self.assertEqual(sp.puntaje_url(url, raiz), esperado, url)

    def test_dominio_raiz_colombiano(self):
        self.assertEqual(sp.dominio_raiz("ventas.amarilo.com.co"), "amarilo.com.co")
        self.assertEqual(sp.dominio_raiz("www.cusezar.com"), "cusezar.com")

    def test_precios(self):
        self.assertEqual(sp.precio_desde("Desde $ 230.000.000")[0], 230_000_000)
        self.assertEqual(sp.precio_desde("Desde $230'500.000")[0], 230_500_000)
        self.assertEqual(sp.precio_desde("Precio desde 1.200 millones")[0], 1_200_000_000)
        self.assertEqual(sp.precio_desde("desde 135 SMMLV", smmlv=2_000_000)[0], 270_000_000)
        self.assertEqual(sp.precio_desde("Separa con $ 2.000.000; desde $ 250.000.000")[0], 250_000_000)
        self.assertIsNone(sp.precio_desde("Llámanos al 300 123 4567")[0])

    def test_habitaciones(self):
        self.assertEqual(sp.habitaciones("1, 2 y 3 habitaciones"), [1, 2, 3])
        self.assertEqual(sp.habitaciones("de 1 a 3 alcobas"), [1, 2, 3])
        self.assertEqual(sp.habitaciones("hotel de 102 habitaciones"), [])

    def test_lo_que_se_menciona_sin_venderse_no_es_la_oferta(self):
        o = sp.clasificar_oferta("Bosque Verde | Apartamentos", "Apartamentos de 2 y 3 habitaciones. "
                                 "Locales comerciales. Oficina de ventas. Casa club. Salas de ventas.")
        self.assertEqual(o["tipos"], ["vivienda"])

    def test_segmento_solo_si_lo_dice(self):
        self.assertEqual(sp.segmento_vivienda("Proyecto No VIS"), "No VIS")
        self.assertEqual(sp.segmento_vivienda("Vivienda de interés prioritario"), "VIP")
        self.assertIsNone(sp.segmento_vivienda("Apartamentos de 2 habitaciones desde $ 180.000.000"))
        self.assertIsNone(sp.segmento_vivienda("Zonas comunes: piscina, Sala VIP y gimnasio"))   # una amenidad

    def test_venta_no_es_ventana(self):
        self.assertEqual(sp.operacion("Ventanas de piso a techo"), [])

    def test_nombre_es_lo_que_coincide_con_la_url(self):
        casos = [("Proyecto Murales: Apartamentos VIS en Bogotá", "murales", "Murales"),
                 ("Apartamentos en Venta Lagos de Torca Vizcaya", "vizcaya", "Vizcaya"),
                 ("El Zorzal, Proyecto de vivienda VIP Sur de Cali", "el-zorzal", "El Zorzal"),
                 ("Puerto Tranquilo apartamentos Ricaurte", "puerto-tranquilo", "Puerto Tranquilo"),
                 ("Bosque Verde | Constructora Andes", "bosque-verde-bogota", "Bosque Verde"),
                 ("Ficha 123", "123", None)]
        for titulo, slug, esperado in casos:
            self.assertEqual(sp.tramo_del_slug(titulo, slug.replace("-", " ")), esperado, titulo)

    def test_nombre_desde_un_titulo_con_seo(self):
        self.assertEqual(sp.limpiar_titulo("Apartamentos en venta en Bogotá - Bosque Verde | Constructora X",
                                           "Constructora X", "constructorax.com", "bosque verde"), "Bosque Verde")
        self.assertEqual(sp.limpiar_titulo("Proyectos | Constructora X", "Constructora X"), "")

    def test_sitemap_comprimido_con_tope(self):
        import gzip
        r = FakeResp(gzip.compress(SITEMAP_PROYECTOS.encode()), "application/x-gzip", BASE + "/s.xml.gz")
        self.assertIn("bosque-verde", sp._texto_sitemap(r))


class TestEngancheFormulario(unittest.TestCase):
    """api/proyectos_web.py: se dispara solo, una vez por sitio, y no frena el formulario."""

    def setUp(self):
        from api import proyectos_web
        self.pw = proyectos_web
        self.pw._TRABAJOS.clear()
        self.addCleanup(self.pw._TRABAJOS.clear)
        p = mock.patch("socket.getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 443))])
        p.start(); self.addCleanup(p.stop)
        for k in ("EXTRAER_PROYECTOS_WEB", "RENDER", "ENTORNO"):
            v = os.environ.pop(k, None)
            if v is not None:
                self.addCleanup(os.environ.__setitem__, k, v)

    def test_apagado_fuera_de_produccion(self):
        with mock.patch.object(self.pw._EJECUTOR, "submit") as enviar:
            self.assertIsNone(self.pw.programar("constructoraandes.test", "demo_marca"))
        enviar.assert_not_called()

    def test_en_produccion_se_programa_una_vez_por_sitio(self):
        with mock.patch.dict(os.environ, {"ENTORNO": "produccion"}), \
             mock.patch.object(self.pw._EJECUTOR, "submit") as enviar:
            self.assertEqual(self.pw.programar("www.constructoraandes.test", "demo_marca"), "en_cola")
            self.assertEqual(self.pw.programar("https://constructoraandes.test/", "agenda_demo"), "en_cola")
        self.assertEqual(enviar.call_count, 1)

    def test_link_interno_no_se_programa(self):
        with mock.patch.dict(os.environ, {"EXTRAER_PROYECTOS_WEB": "1"}), \
             mock.patch.object(self.pw._EJECUTOR, "submit") as enviar:
            self.assertIsNone(self.pw.programar("http://169.254.169.254/", "demo_marca"))
            self.assertIsNone(self.pw.programar("", "demo_marca"))
        enviar.assert_not_called()

    def test_correr_deja_el_estado_listo_o_error(self):
        falso = {"empresa": "Andes", "carpeta": "Andes", "_ruta_json": "/tmp/x.json",
                 "total_proyectos": 2, "total_imagenes": 4, "incompleto": False}
        from features.scrap_proyectos import scrap as modulo
        with mock.patch.object(modulo, "extraer_proyectos", return_value=falso):
            self.pw._correr("andes.test", "https://andes.test")
        self.assertEqual((self.pw.estado("andes.test")["estado"], self.pw.estado("www.andes.test")["proyectos"]),
                         ("listo", 2))
        with mock.patch.object(modulo, "extraer_proyectos", side_effect=RuntimeError("403")):
            self.pw._correr("caido.test", "https://caido.test")
        self.assertEqual(self.pw.estado("caido.test")["estado"], "error")

    def test_cola_llena(self):
        with mock.patch.dict(os.environ, {"EXTRAER_PROYECTOS_WEB": "1"}), \
             mock.patch.object(self.pw._EJECUTOR, "submit"):
            for i in range(self.pw.MAX_EN_COLA):
                self.assertEqual(self.pw.programar(f"sitio{i}.test", "demo_marca"), "en_cola")
            self.assertEqual(self.pw.programar("otro.test", "demo_marca"), "ocupado")


class TestApi(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from api import app as m
        from api import demo, proyectos_web
        from api.limites import limites
        from tests.test_demo import dns, falso_extraer
        limites.reiniciar()
        self.demo, self.pw = demo, proyectos_web
        self.pw._TRABAJOS.clear()
        self.addCleanup(self.pw._TRABAJOS.clear)
        for p in (mock.patch("socket.getaddrinfo", dns({})),
                  mock.patch.object(identidad, "extraer_colores", falso_extraer(["#fed141", "#00843d", None]))):
            p.start(); self.addCleanup(p.stop)
        self.c = TestClient(m.app, raise_server_exceptions=False)

    def test_armar_mi_demo_programa_la_lectura_del_sitio(self):
        with mock.patch.object(self.pw, "programar", return_value="en_cola") as programar:
            j = self.c.post("/api/demo/solicitar", json={"nombre": "Laura", "correo": "laura@casalinda.test",
                            "sitio": "casalinda.test", "tipo": "inmobiliaria"},
                            headers={"cf-connecting-ip": "5.5.5.5"}).json()
        programar.assert_called_once_with("casalinda.test", "demo_marca")
        self.assertEqual(j["proyectos_web"], "en_cola")

    def test_catalogo_con_el_token_de_la_demo(self):
        tmp = tempfile.mkdtemp(prefix="catalogo_")
        self.addCleanup(shutil.rmtree, tmp, True)
        ruta = os.path.join(tmp, "proyectos_Casa_Linda.json")
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump({"empresa": "Casa Linda", "dominio": "casalinda.test", "incompleto": False,
                       "que_vende": {"principal": "vivienda"},
                       "proyectos": [{"id_proyecto": 1, "nombre": "Bosque", "tipo": "vivienda",
                                      "imagenes": [{"id": "01", "ruta": "Bosque/1/01.jpg", "origen": "https://x/1.jpg",
                                                    "ancho": 900, "alto": 600, "portada": True}],
                                      "_evidencia": "interna"}]}, fh)
        self.pw._TRABAJOS["casalinda.test"] = {"estado": "listo", "ruta_json": ruta}
        token = self.demo.firmar({"n": "Casa Linda", "t": "inmobiliaria", "s": "casalinda.test",
                                  "exp": 4102444800})
        j = self.c.get("/api/demo/proyectos", params={"d": token}).json()
        self.assertEqual((j["estado"], j["empresa"], j["proyectos"][0]["nombre"]), ("listo", "Casa Linda", "Bosque"))
        self.assertNotIn("ruta", j["proyectos"][0]["imagenes"][0])            # nada del disco del servidor
        self.assertNotIn("_evidencia", j["proyectos"][0])
        self.assertEqual(self.c.get("/api/demo/proyectos", params={"d": "v1.basura.firma"}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
