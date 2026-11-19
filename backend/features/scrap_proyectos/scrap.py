"""
features/scrap_proyectos/scrap.py
=================================
Los proyectos que publica una empresa en su sitio web, a partir de su URL.

Recibe el link que la empresa escribe en el formulario ("Armar mi demo" o
"Agenda una demo"), recorre su sitio y devuelve —y guarda— un JSON con cada
proyecto: nombre, qué vende (vivienda, oficinas, locales, bodegas, lotes…),
precio, área, habitaciones, ubicación, amenidades, sus colores principales en
hex y sus fotos.

    features/scrap_proyectos/empresas/<Empresa>/
        proyectos_<Empresa>.json
        <Nombre_Proyecto>/<id_proyecto>/01.jpg, 02.webp, ...

Mismo contrato de carpetas que `imagenes_proyectos/<id_proyecto>/` y que
`scrap_identity/identidades/<Empresa>/`: el nombre de la carpeta **es** la
llave. Dentro de la carpeta del proyecto va una con su `id_proyecto`, y ahí
todas sus fotos; cada foto lleva su propio `id` (`01`, `02`…), que es también
su nombre de archivo. La primera es siempre la portada.

Uso:

    from features.scrap_proyectos import extraer_proyectos
    catalogo = extraer_proyectos("https://www.constructora.com/")

    python features/scrap_proyectos/scrap.py https://www.constructora.com/ -v
    python features/scrap_proyectos/scrap.py URL --max-proyectos 10 --sin-imagenes


Cómo encuentra los proyectos
----------------------------
Cada constructora arma su sitio distinto, así que no hay una API que leer
como en `scraping/scraper_projects.py`. Se combinan tres fuentes, de la más a
la menos confiable:

    sitemaps        robots.txt y /sitemap.xml. Un `proyecto-sitemap.xml` (lo que
                    publica WordPress por cada tipo de contenido) es una lista
                    exacta de fichas.
    listados        /proyectos, /nuestros-proyectos, /oficinas… Sus enlaces que
                    NO están también en la portada son fichas: los que se repiten
                    son el menú.
    la URL          /proyectos/bosque-verde tiene forma de ficha; /blog/… no.

Y una página solo cuenta como proyecto si **lo parece por dentro**
(`es_pagina_de_proyecto`): JSON-LD de tipo `ApartmentComplex`/`Residence`, o
varias señales a la vez (m², habitaciones, precio, sala de ventas, tipología).
La URL sola no alcanza: hay sitios con `/proyectos/noticia-de-la-feria`.


Qué vende
---------
`clasificar_oferta` cuenta palabras de siete familias (vivienda, oficinas,
consultorios, locales, bodegas, lotes, hotelero). Lo que aparece en el título,
el h1, la descripción, la URL o el JSON-LD pesa `PESO_ZONA_FUERTE` veces más
que el cuerpo, porque el cuerpo de un conjunto residencial menciona "locales
comerciales" y "oficina de ventas" sin vender ninguna de las dos. `tipos` lista
todas las familias con peso real (un proyecto mixto vende dos), `tipo` es la
principal, y `_tipo_evidencia` dice qué palabras decidieron.

`segmento` (VIS, VIP, No VIS) solo sale cuando la página lo escribe. Nunca se
deduce del precio: eso lo hace `Model/prep.py` con su simulación de crédito.


Colores
-------
Tres capas, de la más propia del proyecto a la más genérica:

    colores_pagina   los colores del CSS de ESA ficha que no están en el resto del
                     sitio. Es la marca del proyecto cuando la constructora le
                     da una propia (pasa mucho).
    paleta           los colores dominantes de sus fotos, cuantizados con Pillow.
    primario...      `primario`, `secundario` y `acento`, con las mismas reglas
                     que `scrap_identity`: color de marca, no pastel y con tonos
                     separados.

La identidad de la empresa (su paleta y su logo) la sigue sacando
`scrap_identity.extraer_colores`, y aquí se resume en `empresa_identidad`.


Fotos
-----
Se toman de `og:image`, del JSON-LD, de `<img>`/`<source>` (el `data-src` de la
carga diferida antes que el `src`, y del `srcset` la más grande), de los
enlaces de galería y de los `background-image`. Se descartan logos, íconos,
sprites, las que viven en la cabecera o el pie, las de menos de
`MIN_LADO_IMAGEN` px, las bandas muy alargadas, las repetidas (por hash) y las
que aparecen en la mitad de los proyectos o más (son el cromo del sitio, no
fotos del proyecto).


Límites honestos
----------------
- **No ejecuta JavaScript.** Un sitio que pinta sus proyectos desde React sin
  publicar sitemap ni HTML del lado del servidor sale con pocos o ningún
  proyecto. Queda dicho en `fuentes` y en `descartados`, no se esconde.
- Todo sale de lo público del sitio. Lo dudoso va marcado (`_evidencia`,
  `_confianza`), igual que en el catálogo.
- Corre con presupuesto de tiempo (`presupuesto_s`). Si se acaba, guarda lo que
  alcanzó y lo marca con `incompleto: true`.
- En la API, toda descarga pasa por `scrap_identity._get`, que `api/ssrf.py`
  reemplaza por su versión segura. Esta feature no abre conexiones por su
  cuenta.

Dependencias: requests, beautifulsoup4, lxml, Pillow.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import html as html_mod
import io
import json
import math
import os
import re
import shutil
import sys
import time
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup

# Ejecutable por ruta (`python features/scrap_proyectos/scrap.py`) o como módulo:
# en el primer caso Python pone en el path esta carpeta y no `backend/`.
if __package__ in (None, ""):
    sys.path.insert(
        0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    )

# Dónde se guarda lo extraído lo dice `Model/rutas.py` (invariante 9).
from Model.rutas import DIR_PROYECTOS_WEB

# La identidad de la empresa, el nombre de las carpetas, los colores y —sobre
# todo— la descarga. `_ident._get` se busca en cada llamada y nunca se copia a
# un nombre local: `api/ssrf.py` lo reemplaza en el módulo para blindarlo, y
# una copia local se saltaría ese blindaje.
from features.scrap_identity import scrap as _ident

try:
    from PIL import Image
except ImportError:  # pragma: no cover - se reporta al bajar fotos, no al importar
    Image = None


# ---------------------------------------------------------------------------
# Parámetros
# ---------------------------------------------------------------------------

TIMEOUT_PAGINA = 15             # segundos por página HTML
TIMEOUT_IMAGEN = 12             # segundos por foto
REINTENTOS = 2                  # 2 y no 1: el segundo es el respaldo de TLS de `_get`

MAX_PAGINAS = 80                # HTML que se bajan en total (portada, listados, fichas)
MAX_PROYECTOS = 30
MAX_IMAGENES_PROYECTO = 12
MAX_IMAGENES_TOTAL = 200
MAX_SITEMAPS = 8
MAX_URLS_SITEMAP = 3000
MAX_LISTADOS = 6
MAX_BYTES_SITEMAP = 3_000_000   # también descomprimido: un .gz no puede inflarse sin tope
PRESUPUESTO_SEGUNDOS = 240
# Fracción del presupuesto que se reserva para las fotos: recorrer el sitio no
# puede comerse el tiempo entero y dejar el JSON sin una sola imagen.
RESERVA_IMAGENES = 0.40

MIN_LADO_IMAGEN = 300           # px; por debajo es un ícono o una miniatura
MAX_PROPORCION_IMAGEN = 4.0     # más alargada que 4:1 es una banda o un separador
MAX_PIXELES_IMAGEN = 40_000_000  # tope contra bombas de descompresión
MIN_BYTES_IMAGEN = 2_000
MAX_BYTES_IMAGEN = 8_000_000
FRACCION_CROMO = 0.5            # una foto en la mitad de los proyectos es del sitio

MAX_COLORES_PROYECTO = 8
COLORES_POR_IMAGEN = 6
IMAGENES_PARA_PALETA = 6        # las primeras N fotos de cada proyecto
DISTANCIA_COLOR = 28            # en RGB; más cerca que esto es el mismo color
FRACCION_COLOR_SITIO = 0.6      # un color de CSS en el 60 % de las fichas es del sitio

UMBRAL_PROYECTO = 4             # puntos mínimos de `es_pagina_de_proyecto`
MAX_FRACCION_AJENA = 0.6        # un bloque de "otros proyectos" nunca es la mayor parte de la ficha
PESO_ZONA_FUERTE = 4            # título/h1/URL/JSON-LD frente al cuerpo
MAX_TEXTO = 60_000              # caracteres de cuerpo que se analizan por página


# ---------------------------------------------------------------------------
# Texto
# ---------------------------------------------------------------------------

def _sin_tildes(texto):
    return "".join(c for c in unicodedata.normalize("NFKD", str(texto or ""))
                   if not unicodedata.combining(c))


def _norm(texto):
    """Minúsculas, sin tildes y con un solo espacio: lo que comparan las reglas."""
    return re.sub(r"\s+", " ", _sin_tildes(texto).lower()).strip()


def _clave(texto):
    return re.sub(r"[^a-z0-9]+", " ", _norm(texto)).strip()


def _corto(texto, largo):
    texto = re.sub(r"\s+", " ", str(texto or "")).strip()
    return texto if len(texto) <= largo else texto[: largo - 1].rstrip() + "…"


# ---------------------------------------------------------------------------
# URLs del mismo sitio
# ---------------------------------------------------------------------------

# Colombia usa segundo nivel bajo .co: el sitio de `ventas.amarilo.com.co` es
# `amarilo.com.co`, no `com.co`.
_SEGUNDO_NIVEL = ("com", "net", "org", "gov", "edu", "mil", "nom", "co")


def dominio_raiz(host):
    partes = [p for p in (host or "").lower().split(".") if p]
    if partes and partes[0] == "www":
        partes = partes[1:]
    if len(partes) >= 3 and partes[-2] in _SEGUNDO_NIVEL and len(partes[-1]) == 2:
        return ".".join(partes[-3:])
    return ".".join(partes[-2:])


def _mismo_sitio(url, raiz):
    host = (urlparse(url).hostname or "").lower()
    return bool(host) and (host == raiz or host.endswith("." + raiz))


_PARAMS_RASTREO = re.compile(r"^(utm_|fbclid$|gclid$|_ga$|mc_|ref$|source$)", re.I)


def normalizar_enlace(href, base):
    """Absoluta, sin fragmento ni parámetros de rastreo. None si no es una página."""
    href = (href or "").strip()
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:", "whatsapp:", "data:")):
        return None
    url = urljoin(base, href)
    partes = urlparse(url)
    if partes.scheme not in ("http", "https") or not partes.hostname:
        return None
    consulta = [(k, v) for k, v in parse_qsl(partes.query, keep_blank_values=True)
                if not _PARAMS_RASTREO.match(k)]
    ruta = partes.path or "/"
    return urlunparse((partes.scheme, partes.netloc.lower(), ruta, "", urlencode(consulta), ""))


def _llave_url(url):
    """Para deduplicar: sin esquema, sin www y sin barra final."""
    p = urlparse(url)
    host = (p.hostname or "").lower()
    host = host[4:] if host.startswith("www.") else host
    return f"{host}{p.path.rstrip('/') or '/'}{'?' + p.query if p.query else ''}"


# Palabras que, en un segmento de la ruta, dicen "esto es un proyecto".
RE_SEGMENTO_PROYECTO = re.compile(
    r"proyecto|project|vivienda|apartamento|apto|apartaestudio|casa|oficina|local|"
    r"bodega|lote|inmueble|desarrollo|obra|portafolio|residencial|conjunto|torre|"
    r"condominio|edificio|macroproyecto|consultorio|parcelacion"
)
# Segmentos que son un listado, no una ficha.
SEGMENTOS_LISTADO = {
    "proyectos", "nuestros-proyectos", "projects", "portafolio", "viviendas", "vivienda",
    "apartamentos", "casas", "oficinas", "locales", "bodegas", "lotes", "inmuebles",
    "desarrollos", "obras", "proyectos-de-vivienda", "proyectos-vivienda", "nuestras-obras",
    "proyectos-en-venta", "proyectos-nuevos", "consultorios", "comercial", "corporativo",
}
RE_RUTA_EXCLUIDA = re.compile(
    r"/(blog|noticias?|news|prensa|articulos?|contacto|contactenos|contact|trabaja|empleo|"
    r"vacantes|politica|politicas|privacidad|terminos|condiciones|tratamiento|habeas|"
    r"login|ingresar|registro|mi-cuenta|cuenta|carrito|cart|checkout|wp-admin|wp-json|"
    r"wp-login|tag|tags|etiqueta|categoria|category|autor|author|feed|buscar|search|"
    r"preguntas|faq|pqr|pqrs|servicio-al-cliente|sostenibilidad|nosotros|quienes-somos|"
    r"historia|inversionistas|eventos?|ferias?|premios|testimonios?|aliados|proveedores|"
    r"simulador|financiacion|subsidios?|credito|calculadora)(/|$)|/(page|pagina)/\d+/?$"
)
RE_PAGINACION = re.compile(r"/(page|pagina)/\d+/?$|[?&](page|pagina|pg|paged)=\d+", re.I)
RE_ARCHIVO = re.compile(r"\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|css|js|xml|json|txt)$", re.I)

CIUDADES = {
    "bogota": "Bogotá", "medellin": "Medellín", "cali": "Cali", "barranquilla": "Barranquilla",
    "cartagena": "Cartagena", "bucaramanga": "Bucaramanga", "pereira": "Pereira",
    "manizales": "Manizales", "armenia": "Armenia", "ibague": "Ibagué",
    "villavicencio": "Villavicencio", "santa marta": "Santa Marta", "cucuta": "Cúcuta",
    "pasto": "Pasto", "neiva": "Neiva", "monteria": "Montería", "sincelejo": "Sincelejo",
    "valledupar": "Valledupar", "popayan": "Popayán", "tunja": "Tunja", "chia": "Chía",
    "cajica": "Cajicá", "zipaquira": "Zipaquirá", "soacha": "Soacha", "mosquera": "Mosquera",
    "funza": "Funza", "madrid": "Madrid", "facatativa": "Facatativá", "la calera": "La Calera",
    "sopo": "Sopó", "tocancipa": "Tocancipá", "girardot": "Girardot",
    "fusagasuga": "Fusagasugá", "rionegro": "Rionegro", "envigado": "Envigado",
    "sabaneta": "Sabaneta", "itagui": "Itagüí", "bello": "Bello", "la estrella": "La Estrella",
    "jamundi": "Jamundí", "palmira": "Palmira", "floridablanca": "Floridablanca",
    "giron": "Girón", "piedecuesta": "Piedecuesta", "dosquebradas": "Dosquebradas",
    "ricaurte": "Ricaurte", "melgar": "Melgar", "anapoima": "Anapoima", "cota": "Cota",
    "tenjo": "Tenjo", "tabio": "Tabio", "puerto colombia": "Puerto Colombia",
}
_RE_CIUDADES = re.compile(r"\b(" + "|".join(sorted(map(re.escape, CIUDADES), key=len, reverse=True)) + r")\b")
# Nombres de ciudad que también son palabras comunes del texto de un proyecto.
CIUDADES_AMBIGUAS = {"bello", "pasto", "cota", "madrid", "armenia", "palmira", "giron", "la estrella", "tabio"}


def puntaje_url(url, raiz):
    """(puntaje, es_listado) de una URL por su forma, antes de bajarla.

    4   /proyectos/bosque-verde        un segmento de proyecto y algo después
    3   /proyecto-bosque-verde         la palabra va dentro del slug
    1   /bogota/bosque-verde           una ciudad y algo después
    0   cualquier otra cosa del sitio  se baja solo si sobra presupuesto
    -1  /blog/…, /contacto, un .pdf     nunca
    """
    if not _mismo_sitio(url, raiz):
        return -1, False
    ruta = urlparse(url).path.lower()
    if RE_ARCHIVO.search(ruta):
        return -1, False
    segmentos = [s for s in ruta.split("/") if s]
    if not segmentos:
        return -1, False                      # la portada se lee aparte
    if RE_RUTA_EXCLUIDA.search("/" + "/".join(segmentos)):
        return -1, False
    planos = [_sin_tildes(s) for s in segmentos]
    if len(planos) == 1 and planos[0] in SEGMENTOS_LISTADO:
        return 1, True
    if len(planos) == 2 and planos[0] in SEGMENTOS_LISTADO and (
            planos[1].replace("-", " ") in CIUDADES or planos[1] in SEGMENTOS_LISTADO):
        return 1, True                        # /proyectos/bogota, /proyectos/vivienda: un filtro, no una ficha
    for i, seg in enumerate(planos):
        if RE_SEGMENTO_PROYECTO.search(seg):
            if i < len(planos) - 1:
                return (4 if len(planos) <= 4 else 3), False
            if "-" in seg and seg not in SEGMENTOS_LISTADO:
                return 3, False
    if len(planos) >= 2 and planos[0].replace("-", " ") in CIUDADES:
        return 1, False
    return 0, False


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

class _Reloj:
    """Presupuesto de tiempo de una extracción."""

    def __init__(self, segundos):
        self.inicio = time.monotonic()
        self.limite = self.inicio + max(1.0, float(segundos or PRESUPUESTO_SEGUNDOS))

    def queda(self):
        return self.limite - time.monotonic()

    def agotado(self, reserva=0.0):
        total = self.limite - self.inicio
        return self.queda() <= total * reserva


def _bajar(url, timeout=TIMEOUT_PAGINA):
    return _ident._get(url, timeout=timeout, reintentos=REINTENTOS)


def _es_html(respuesta):
    tipo = (respuesta.headers.get("Content-Type") or "").lower()
    return not tipo or "html" in tipo


def _sopa(respuesta):
    tipo = (respuesta.headers.get("Content-Type") or "").lower()
    codificacion = respuesta.encoding if "charset=" in tipo else None
    return BeautifulSoup(respuesta.content, "lxml", from_encoding=codificacion)


# ---------------------------------------------------------------------------
# Sitemaps
# ---------------------------------------------------------------------------

RE_LOC = re.compile(r"<loc>\s*(.*?)\s*</loc>", re.I | re.S)
RE_SITEMAP_PROYECTOS = re.compile(
    r"(proyecto|project|vivienda|inmueble|desarrollo|apartamento|oficina|bodega|lote)", re.I)
RE_SITEMAP_DESCARTE = re.compile(r"(post|blog|noticia|news|category|categoria|tag|author|autor|product_cat)", re.I)


def _texto_sitemap(respuesta):
    """El cuerpo del sitemap, descomprimido si viene en .gz, siempre con tope."""
    datos = respuesta.content or b""
    if datos[:2] == b"\x1f\x8b":
        with gzip.GzipFile(fileobj=io.BytesIO(datos)) as fh:
            datos = fh.read(MAX_BYTES_SITEMAP)
    return datos[:MAX_BYTES_SITEMAP].decode("utf-8", errors="replace")


def sitemaps_de_robots(texto, base):
    salida = []
    for linea in (texto or "").splitlines():
        if linea.lower().startswith("sitemap:"):
            url = normalizar_enlace(linea.split(":", 1)[1].strip(), base)
            if url:
                salida.append(url)
    return salida


def leer_sitemaps(base, raiz, reloj, fuentes, verbose=False):
    """{url: bono} de las URLs que listan los sitemaps del sitio.

    Un sitemap de proyectos (`proyecto-sitemap.xml`) le da bono 3 a todas sus
    URLs: es la lista exacta de fichas. Un índice de sitemaps se sigue, primero
    por sus hijos con nombre de proyecto, y nunca por los de blog o etiquetas.
    No se usa un parser de XML: el sitemap es de un tercero, y una expresión
    regular sobre `<loc>` no se puede inflar con entidades.
    """
    pendientes = []
    try:
        robots = _bajar(urljoin(base, "/robots.txt"), timeout=TIMEOUT_PAGINA)
        pendientes += sitemaps_de_robots(robots.text, base)
    except TimeoutError:
        raise
    except Exception as error:
        fuentes["avisos"].append(f"robots.txt: {_corto(error, 120)}")
    for ruta in ("/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"):
        pendientes.append(urljoin(base, ruta))

    vistos, urls = set(), {}
    leidos = 0
    while pendientes and leidos < MAX_SITEMAPS and not reloj.agotado(reserva=0.6):
        # Primero los que tienen nombre de proyecto: en un índice grande son los que importan.
        pendientes.sort(key=lambda u: 0 if RE_SITEMAP_PROYECTOS.search(urlparse(u).path) else 1)
        actual = pendientes.pop(0)
        if actual in vistos or not _mismo_sitio(actual, raiz):
            continue
        vistos.add(actual)
        try:
            texto = _texto_sitemap(_bajar(actual))
        except TimeoutError:
            raise
        except Exception:
            continue
        leidos += 1
        fuentes["sitemaps"].append(actual)
        es_de_proyectos = bool(RE_SITEMAP_PROYECTOS.search(urlparse(actual).path))
        locs = [html_mod.unescape(x) for x in RE_LOC.findall(texto)][:MAX_URLS_SITEMAP]
        es_indice = "<sitemapindex" in texto[:2000].lower()
        for loc in locs:
            url = normalizar_enlace(loc, actual)
            if not url:
                continue
            if es_indice or urlparse(url).path.lower().endswith((".xml", ".xml.gz")):
                if not RE_SITEMAP_DESCARTE.search(urlparse(url).path):
                    pendientes.append(url)
                continue
            if _mismo_sitio(url, raiz):
                urls[url] = max(urls.get(url, 0), 3 if es_de_proyectos else 0)
        if verbose:
            print(f"  [sitemap] {len(locs):4d} urls en {actual}")
    return urls


# ---------------------------------------------------------------------------
# Lectura de una página
# ---------------------------------------------------------------------------

TIPOS_LD_FUERTES = {
    "apartmentcomplex", "residence", "apartment", "house", "singlefamilyresidence",
    "accommodation", "realestatelisting", "gatedresidencecommunity",
}
TIPOS_LD_DEBILES = {"product", "place", "offer", "landmarksorhistoricalbuildings"}


def _tipos_ld(bloque):
    tipo = bloque.get("@type")
    tipos = tipo if isinstance(tipo, list) else [tipo]
    return {str(t).lower().rsplit("/", 1)[-1] for t in tipos if t}


def bloques_ld(sopa):
    """Todos los objetos JSON-LD de la página, aplanados (@graph incluido)."""
    salida = []

    def recorrer(nodo, profundidad=0):
        if profundidad > 6:
            return
        if isinstance(nodo, list):
            for x in nodo:
                recorrer(x, profundidad + 1)
        elif isinstance(nodo, dict):
            salida.append(nodo)
            for clave in ("@graph", "itemListElement", "containsPlace", "item", "mainEntity", "offers"):
                if clave in nodo:
                    recorrer(nodo[clave], profundidad + 1)

    for etiqueta in sopa.find_all("script", type=re.compile(r"ld\+json", re.I)):
        try:
            recorrer(json.loads(etiqueta.string or etiqueta.get_text() or "", strict=False))
        except (ValueError, TypeError):
            continue
    return salida


def _metas(sopa):
    salida = {}
    for etiqueta in sopa.find_all("meta"):
        clave = (etiqueta.get("property") or etiqueta.get("name") or "").strip().lower()
        valor = (etiqueta.get("content") or "").strip()
        if clave and valor and clave not in salida:
            salida[clave] = valor
    return salida


def _en_cromo(etiqueta):
    """¿Vive en la cabecera, el pie o el menú del sitio (y no dentro del contenido)?"""
    padre = etiqueta.find_parent(["header", "footer", "nav"])
    return bool(padre) and not etiqueta.find_parent(["main", "article"])


RUIDO_IMAGEN = re.compile(
    r"logo|isotipo|favicon|icon|icono|sprite|avatar|placeholder|lazy|loader|loading|spinner|"
    r"pixel|tracking|blank|transparent|spacer|whatsapp|facebook|instagram|twitter|linkedin|"
    r"youtube|tiktok|google-?play|app-?store|badge|sello|bandera|flag|arrow|flecha|btn|boton|"
    r"cookie|captcha|gravatar|emoji|marker|pin-?map|mapa-?ubicacion|qr-?code|firma",
    re.I,
)
RE_EXT_IMAGEN = re.compile(r"\.(jpe?g|png|webp|avif)$", re.I)
RE_EXT_NO_FOTO = re.compile(r"\.(svg|gif|ico|bmp)$", re.I)
RE_URL_CSS = re.compile(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", re.I)
ATRIBUTOS_IMG = ("data-src", "data-lazy-src", "data-original", "data-full", "data-large",
                 "data-zoom-image", "data-bg", "data-image", "src")


def _url_imagen(valor, base):
    valor = (valor or "").strip()
    if not valor or valor.startswith(("data:", "blob:", "javascript:")):
        return None
    url = urljoin(base, valor)
    partes = urlparse(url)
    if partes.scheme not in ("http", "https") or not partes.hostname:
        return None
    ruta = partes.path.lower()
    if RE_EXT_NO_FOTO.search(ruta) or RUIDO_IMAGEN.search("/".join(ruta.rsplit("/", 2)[-2:])):
        return None
    return urlunparse(partes._replace(fragment=""))


def _mayor_de_srcset(srcset):
    """La URL más grande de un srcset ("a.jpg 480w, b.jpg 1200w" -> b.jpg)."""
    mejor, mejor_ancho = None, -1.0
    for parte in (srcset or "").split(","):
        trozos = parte.strip().split()
        if not trozos:
            continue
        ancho = 1.0
        if len(trozos) > 1:
            m = re.match(r"(\d+(?:\.\d+)?)([wx])", trozos[1])
            if m:
                ancho = float(m.group(1)) * (1 if m.group(2) == "w" else 1000)
        if ancho > mejor_ancho:
            mejor, mejor_ancho = trozos[0], ancho
    return mejor


def _urls_imagen_ld(valor):
    if not valor:
        return []
    if isinstance(valor, str):
        return [valor]
    if isinstance(valor, dict):
        return [v for v in (valor.get("url"), valor.get("contentUrl")) if isinstance(v, str)]
    if isinstance(valor, list):
        return [u for x in valor for u in _urls_imagen_ld(x)]
    return []


def imagenes_candidatas(sopa, base, ld=(), metas=None):
    """[(url, fuente)] en orden de preferencia: portada primero, galería después."""
    vistas, salida = set(), []

    def agregar(valor, fuente):
        url = _url_imagen(valor, base)
        if url and url not in vistas:
            vistas.add(url)
            salida.append((url, fuente))

    metas = metas or {}
    for clave in ("og:image:secure_url", "og:image", "og:image:url", "twitter:image"):
        agregar(metas.get(clave), "og")
    for bloque in ld:
        for url in _urls_imagen_ld(bloque.get("image")) + _urls_imagen_ld(bloque.get("photo")):
            agregar(url, "json-ld")

    for etiqueta in sopa.find_all(["img", "source"]):
        if _en_cromo(etiqueta):
            continue
        pista = " ".join(str(etiqueta.get(a) or "") for a in ("alt", "class", "id"))
        if etiqueta.name == "img" and RUIDO_IMAGEN.search(pista):
            continue
        try:
            if int(etiqueta.get("width") or 999) <= 100 and int(etiqueta.get("height") or 999) <= 100:
                continue
        except ValueError:
            pass
        elegida = _mayor_de_srcset(etiqueta.get("data-srcset") or etiqueta.get("srcset"))
        if not elegida:
            elegida = next((etiqueta.get(a) for a in ATRIBUTOS_IMG
                            if etiqueta.get(a) and not str(etiqueta.get(a)).startswith("data:")), None)
        agregar(elegida, "img")

    for enlace in sopa.find_all("a", href=True):
        if RE_EXT_IMAGEN.search(urlparse(enlace["href"]).path) and not _en_cromo(enlace):
            agregar(enlace["href"], "galeria")
    for etiqueta in sopa.find_all(style=re.compile("background", re.I)):
        if not _en_cromo(etiqueta):
            for url in RE_URL_CSS.findall(etiqueta.get("style") or ""):
                agregar(url, "fondo")
    return salida


def colores_de_pagina(sopa):
    """Counter de los colores que la página declara en su propio HTML."""
    cuenta = Counter()
    textos = [b.get_text() for b in sopa.find_all("style")]
    textos += [e.get("style") or "" for e in sopa.find_all(style=True)]
    for texto in textos:
        generales, variables = _ident.colores_en_texto(texto)
        cuenta.update(generales)
        cuenta.update(variables)
    for etiqueta in sopa.find_all(["path", "rect", "circle", "polygon", "stop"]):
        for atributo in ("fill", "stroke", "stop-color"):
            valor = etiqueta.get(atributo)
            if valor and valor.lower() not in ("none", "currentcolor", "transparent"):
                cuenta.update(_ident._colores_crudos(valor))
    tema = sopa.find("meta", attrs={"name": re.compile("^theme-color$", re.I)})
    if tema and tema.get("content"):
        cuenta.update(_ident._colores_crudos(tema["content"]))
    return cuenta


RE_COORDENADAS = (
    (re.compile(r"!3d(-?\d{1,2}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})"), False),   # embed de Google Maps
    (re.compile(r"!2d(-?\d{1,3}\.\d{3,})!3d(-?\d{1,2}\.\d{3,})"), True),    # mismo embed, lon primero
    (re.compile(r"[@=](-?\d{1,2}\.\d{4,}),\s*(-?\d{1,3}\.\d{4,})"), False),  # @lat,lon · q= · ll=
    (re.compile(r"lat(?:itude)?['\"]?\s*[:=]\s*['\"]?(-?\d{1,2}\.\d{4,}).{0,60}?"
                r"(?:lng|lon|longitude)['\"]?\s*[:=]\s*['\"]?(-?\d{1,3}\.\d{4,})", re.S), False),
)


def _coordenada_valida(lat, lon):
    return -90 <= lat <= 90 and -180 <= lon <= 180 and not (abs(lat) < 0.01 and abs(lon) < 0.01)


def coordenadas(sopa, ld=()):
    """(lat, lon, evidencia) o (None, None, None)."""
    for bloque in ld:
        geo = bloque.get("geo") if isinstance(bloque.get("geo"), dict) else None
        if geo:
            try:
                lat, lon = float(geo.get("latitude")), float(geo.get("longitude"))
                if _coordenada_valida(lat, lon):
                    return lat, lon, "json-ld geo"
            except (TypeError, ValueError):
                pass
    fuentes = [("iframe", e.get("src") or "") for e in sopa.find_all("iframe")]
    fuentes += [("enlace", a.get("href") or "") for a in sopa.find_all("a", href=re.compile(r"map|waze|goo\.gl", re.I))]
    for etiqueta in sopa.find_all(attrs={"data-lat": True}):
        lng = etiqueta.get("data-lng") or etiqueta.get("data-lon") or etiqueta.get("data-long")
        fuentes.append(("data-lat", f"lat:{etiqueta['data-lat']} lng:{lng}"))
    fuentes += [("script", (s.string or "")[:200_000]) for s in sopa.find_all("script") if s.string]
    for origen, texto in fuentes:
        for patron, invertido in RE_COORDENADAS:
            m = patron.search(texto)
            if not m:
                continue
            a, b = float(m.group(1)), float(m.group(2))
            lat, lon = (b, a) if invertido else (a, b)
            if _coordenada_valida(lat, lon):
                return lat, lon, origen
    return None, None, None


RE_TITULO_AMENIDADES = re.compile(
    r"amenidad|amenit|zonas? comun|zonas? social|areas? comun|espacios? comun|zonas? humeda|"
    r"zonas? recreativ|zonas? de recreacion|equipamiento comunal|zonas comunales|"
    r"lo que (vas a )?(tener|disfrutar)|zonas para disfrutar"
)
RE_CONTENEDOR_AMENIDADES = re.compile(r"amenid|amenit|zonas?[-_ ]?comun|zona[-_ ]social|common[-_]area", re.I)
# Textos de interfaz que viven dentro de una sección de amenidades sin ser una.
RE_TEXTO_DE_INTERFAZ = re.compile(
    r"^(ver|conoce|descubre|cerrar|siguiente|anterior|mas|menos|leer|haz clic|clic|ampliar|galeria)\b")
# Lo que comparte sección con las amenidades sin serlo: las cifras de la ficha
# ("2 Alcobas", "Plazo de cuota inicial…") y lo que queda cerca del proyecto
# ("Colegios", "Supermercados"). Medido contra un sitio real, era más de la mitad
# de lo que llegaba a `zonas_comunes_no_mapeadas`.
RE_NO_ES_AMENIDAD = re.compile(
    r"caracteristica|descripcion|cercania|plazo|cuota|tipologia|alcoba|habitacion|\bbanos?\b|\bpisos?\b|"
    r"\btorres?\b|unidades|construida|privada|meses|interes|ubicacion|precio|desde|separa|"
    r"colegio|universidad|supermercado|centros? comercial|hospital|clinica|restaurante|transmilenio|"
    r"estacion|almacen|bancos?\b|iglesia|plaza de mercado|vias? de acceso|aeropuerto|\bclubes\b"
)
MAX_TEXTO_SECCION = 2500          # una "sección" más larga es media página, no una lista


def etiquetas_amenidades(sopa):
    """Los textos de las listas que la página presenta como zonas comunes."""
    etiquetas = []

    def tomar(contenedor, solo_listas=False):
        if len(contenedor.get_text(" ", strip=True)) > MAX_TEXTO_SECCION:
            return
        items = contenedor.find_all(["li", "figcaption"])
        if not items and not solo_listas:
            items = contenedor.find_all(["h3", "h4", "h5", "h6", "span", "p", "strong"])
        for item in items:
            texto = re.sub(r"\s+", " ", item.get_text(" ", strip=True))
            plano = _norm(texto)
            if 2 < len(texto) <= 50 and not any(c.isdigit() for c in texto) and not texto.endswith(":") \
                    and not RE_TITULO_AMENIDADES.search(plano) and not RE_TEXTO_DE_INTERFAZ.search(plano) \
                    and not RE_NO_ES_AMENIDAD.search(plano):
                etiquetas.append(texto)

    for titulo in sopa.find_all(["h2", "h3", "h4", "h5", "strong", "p"]):
        texto = _norm(titulo.get_text(" ", strip=True))
        if len(texto) <= 60 and RE_TITULO_AMENIDADES.search(texto):
            # Primero la lista que viene justo después del título; solo si no hay,
            # la sección que lo contiene.
            siguiente = titulo.find_next_sibling(["ul", "ol", "div"])
            if siguiente is not None and siguiente.find(["li", "figcaption"]):
                tomar(siguiente)
                continue
            contenedor = titulo.parent
            if contenedor is not None and contenedor.name not in ("body", "html", "[document]", "main"):
                tomar(contenedor)
    for atributo in ("class", "id"):
        for contenedor in sopa.find_all(attrs={atributo: RE_CONTENEDOR_AMENIDADES}):
            tomar(contenedor, solo_listas=True)

    vistas, salida = set(), []
    for texto in etiquetas:
        llave = _clave(texto)
        if llave and llave not in vistas:
            vistas.add(llave)
            salida.append(texto)
    return salida[:60]


def quitar_otros_proyectos(sopa, url_actual):
    """Saca de la ficha los bloques que presentan OTROS proyectos. Devuelve cuántos.

    Medido contra un sitio real: las fichas cierran con un carrusel de "otros
    proyectos", cada tarjeta con su precio, su área y su foto. Sin quitarlo, el
    "desde" más bajo de la página era el de otro proyecto (el mismo en cuatro de
    cinco fichas) y las fotos de uno aparecían en otro. Un bloque es eso cuando
    es el contenedor más pequeño que enlaza a dos o más fichas distintas de esta
    misma. Las subpáginas de la ficha (/proyectos/x/tipologias) no cuentan: son
    del mismo proyecto.

    No se detiene en <article>: en ese mismo sitio cada tarjeta del carrusel ES
    un `<article class="project-card">`. Lo que protege a la ficha es otra cosa:
    nunca se quita un bloque que contenga su <h1> ni uno con más de
    `MAX_FRACCION_AJENA` del texto de la página, y nunca se sube más allá de <main>.
    """
    raiz = dominio_raiz(urlparse(url_actual).hostname)
    propia = _llave_url(url_actual)
    ruta_propia = urlparse(url_actual).path.rstrip("/") + "/"
    ajenos = []
    for a in sopa.find_all("a", href=True):
        destino = normalizar_enlace(a["href"], url_actual)
        if not destino or _llave_url(destino) == propia or urlparse(destino).path.startswith(ruta_propia):
            continue
        puntaje, listado = puntaje_url(destino, raiz)
        if puntaje >= 3 and not listado:
            ajenos.append((a, _llave_url(destino)))
    if len({llave for _, llave in ajenos}) < 2:
        return 0
    h1 = sopa.find("h1")
    total = len(sopa.get_text(" ", strip=True)) or 1
    marcados = []
    for a, _ in ajenos:
        nodo = a.parent
        while nodo is not None and nodo.name not in ("body", "html", "[document]", "main"):
            distintos = {llave for otro, llave in ajenos if otro is nodo or nodo in otro.parents}
            if len(distintos) >= 2:
                es_la_ficha = (h1 is not None and (nodo is h1 or nodo in h1.parents)) \
                    or len(nodo.get_text(" ", strip=True)) > MAX_FRACCION_AJENA * total
                if not es_la_ficha and not any(nodo is m for m in marcados):
                    marcados.append(nodo)
                break
            nodo = nodo.parent
    for nodo in marcados:
        try:
            nodo.decompose()
        except Exception:
            continue
    return len(marcados)


def leer_pagina(respuesta, url):
    """Todo lo que se necesita de una página, leído una sola vez."""
    sopa = _sopa(respuesta)
    url_final = getattr(respuesta, "url", None) or url
    ld = bloques_ld(sopa)
    metas = _metas(sopa)
    canonica = None
    for enlace in sopa.find_all("link", href=True):
        rel = enlace.get("rel") or []
        if "canonical" in (rel if isinstance(rel, list) else [rel]):
            canonica = normalizar_enlace(enlace["href"], url_final)
            break

    enlaces = []
    for a in sopa.find_all("a", href=True):
        destino = normalizar_enlace(a["href"], url_final)
        if destino:
            enlaces.append((destino, re.sub(r"\s+", " ", a.get_text(" ", strip=True))[:80]))

    titulo = sopa.title.get_text(" ", strip=True) if sopa.title else ""
    h1 = next((h.get_text(" ", strip=True) for h in sopa.find_all("h1") if h.get_text(strip=True)), "")
    migas = " ".join(e.get_text(" ", strip=True) for e in sopa.find_all(
        attrs={"class": re.compile(r"breadcrumb|migas", re.I)})[:2])
    # Los enlaces ya se tomaron (sirven para recorrer el sitio); desde aquí todo
    # lo que se lee es solo de ESTA ficha.
    otros = quitar_otros_proyectos(sopa, url_final)
    h2 = [h.get_text(" ", strip=True) for h in sopa.find_all("h2")[:4]]
    imagenes = imagenes_candidatas(sopa, url_final, ld, metas)
    colores = colores_de_pagina(sopa)
    lat, lon, evidencia_geo = coordenadas(sopa, ld)

    # Fuera el cromo del sitio antes de leer el texto: el pie de página de una
    # constructora lista sus salas de ventas en cinco ciudades y diría que cada
    # proyecto está en todas.
    for etiqueta in list(sopa.find_all(["script", "style", "noscript", "template", "svg", "iframe"])):
        etiqueta.decompose()
    for etiqueta in list(sopa.find_all(["header", "footer", "nav"])):
        try:
            if not etiqueta.find_parent(["main", "article"]):
                etiqueta.decompose()
        except Exception:
            continue
    amenidades = etiquetas_amenidades(sopa)
    cuerpo = re.sub(r"\s+", " ", sopa.get_text(" ", strip=True))[:MAX_TEXTO]

    fuerte = " · ".join(x for x in (
        titulo, metas.get("og:title", ""), metas.get("description", ""), metas.get("og:description", ""),
        h1, " ".join(h2), migas, urlparse(url_final).path.replace("-", " ").replace("/", " "),
    ) if x)
    return {
        "url": url_final, "canonica": canonica, "ld": ld, "metas": metas, "enlaces": enlaces,
        "titulo": titulo, "h1": h1, "fuerte": fuerte, "cuerpo": cuerpo, "imagenes": imagenes,
        "colores": colores, "lat": lat, "lon": lon, "evidencia_geo": evidencia_geo,
        "amenidades": amenidades, "bloques_ajenos": otros,
    }


# ---------------------------------------------------------------------------
# ¿Es la ficha de un proyecto?
# ---------------------------------------------------------------------------

SENALES_PROYECTO = (
    ("area", re.compile(r"\d\s*(m2|m²|mts2|mt2|metros cuadrados)")),
    ("habitaciones", re.compile(r"\d\s*(habitacion|alcoba|dormitorio)")),
    ("precio", re.compile(r"\$\s*\d|\d\s*millones|\d\s*smmlv|precio")),
    ("venta", re.compile(r"sala de ventas|separa|cuota inicial|agenda(r)? (tu|una) visita|cotiza|"
                         r"conoce (el|este) proyecto|subsidio|financiacion")),
    ("tipologia", re.compile(r"\b(tipologias?|apartamentos?|casas|oficinas?|locales|bodegas?|lotes?|"
                             r"apartaestudios?|consultorios?)\b")),
    ("obra", re.compile(r"\b(torres?|etapas?|pisos|unidades|entrega|sobre planos|en construccion)\b")),
    ("ubicacion", re.compile(r"ubicacion|como llegar|direccion|localizacion")),
)


def es_pagina_de_proyecto(pagina, bono_url=0):
    """(puntaje, señales). La forma de la URL suma, pero sola no alcanza."""
    senales = []
    puntaje = min(bono_url, 2)
    tipos = set()
    for bloque in pagina["ld"]:
        tipos |= _tipos_ld(bloque)
    if tipos & TIPOS_LD_FUERTES:
        puntaje += 3
        senales.append("json-ld " + "/".join(sorted(tipos & TIPOS_LD_FUERTES)))
    elif tipos & TIPOS_LD_DEBILES:
        puntaje += 1
        senales.append("json-ld " + "/".join(sorted(tipos & TIPOS_LD_DEBILES)))
    texto = _norm(pagina["fuerte"] + " " + pagina["cuerpo"])
    de_texto = [nombre for nombre, patron in SENALES_PROYECTO if patron.search(texto)]
    if pagina["amenidades"]:
        de_texto.append("amenidades")
    puntaje += min(len(de_texto), 4)
    senales += de_texto
    return puntaje, senales


# ---------------------------------------------------------------------------
# Qué vende
# ---------------------------------------------------------------------------

CATEGORIAS = {
    "vivienda": re.compile(r"\b(apartamentos?|aptos?|apartaestudios?|casas?|viviendas?|penthouses?|"
                           r"duplex|lofts?|vis|vip|habitaciones|alcobas)\b"),
    "oficinas": re.compile(r"\b(oficinas?|centro empresarial|edificio empresarial|torre empresarial|"
                           r"business center|corporativo)\b"),
    "consultorios": re.compile(r"\b(consultorios?|centro medico|torre medica)\b"),
    "locales": re.compile(r"\b(locales?( comerciales?)?|centro comercial|plaza comercial|"
                          r"local comercial)\b"),
    "bodegas": re.compile(r"\b(bodegas?|minibodegas?|naves? industriales?|parque industrial|"
                          r"parque logistico|centro logistico|zona franca)\b"),
    "lotes": re.compile(r"\b(lotes?|parcelas?|parcelacion|terrenos?)\b"),
    "hotelero": re.compile(r"\b(hotel|hoteles|suites? hoteleras?|apartahotel|renta corta)\b"),
}
# Frases que nombran una de esas palabras sin venderla.
RE_NO_ES_OFERTA = re.compile(
    r"(oficinas?|sala|salas|local|punto) de (ventas?|administracion|atencion|informacion)|"
    r"casa (club|modelo|de la cultura)|lotes? de parqueo"
)
SUBTIPOS_VIVIENDA = {
    "apartamentos": re.compile(r"\b(apartamentos?|aptos?)\b"),
    "apartaestudios": re.compile(r"\bapartaestudios?\b"),
    "casas": re.compile(r"\bcasas\b|\bcasa (de|en) \d|\bcasas? campestres?\b"),
    "penthouses": re.compile(r"\bpenthouses?\b|\bph\b"),
}
ESTADOS_OBRA = (
    ("vendido", re.compile(r"\b(100 ?% vendido|vendido|agotado)\b")),
    ("entrega inmediata", re.compile(r"entrega inmediata|listo para (estrenar|habitar|entregar)")),
    ("en construcción", re.compile(r"en construccion")),
    ("sobre planos", re.compile(r"sobre planos|en planos|preventa|lanzamiento")),
)


def clasificar_oferta(fuerte, cuerpo, tipos_ld=()):
    """Qué vende una página: tipo principal, todos los que vende y la evidencia."""
    fuerte_n = RE_NO_ES_OFERTA.sub(" ", _norm(fuerte))
    cuerpo_n = RE_NO_ES_OFERTA.sub(" ", _norm(cuerpo))
    pesos, en_zona_fuerte, evidencia = Counter(), Counter(), {}
    for categoria, patron in CATEGORIAS.items():
        en_fuerte = patron.findall(fuerte_n)
        en_cuerpo = patron.findall(cuerpo_n)
        peso = PESO_ZONA_FUERTE * len(en_fuerte) + len(en_cuerpo)
        if peso:
            pesos[categoria] = peso
            en_zona_fuerte[categoria] = len(en_fuerte)
            palabras = Counter(m if isinstance(m, str) else m[0] for m in en_fuerte + en_cuerpo)
            evidencia[categoria] = [p for p, _ in palabras.most_common(3)]
    if set(tipos_ld) & TIPOS_LD_FUERTES:
        pesos["vivienda"] += PESO_ZONA_FUERTE * 2
        en_zona_fuerte["vivienda"] += 1
        evidencia.setdefault("vivienda", []).insert(0, "json-ld")

    if not pesos:
        return {"tipo": None, "tipos": [], "subtipos": [], "_tipo_evidencia": "sin palabras de oferta"}
    principal, peso_max = pesos.most_common(1)[0]
    # Un proyecto mixto vende dos cosas, y lo dice donde se anuncia (título, h1,
    # descripción, URL). Lo que solo aparece en el cuerpo es contexto: el
    # conjunto residencial que menciona "locales comerciales" no vende locales.
    tipos = [c for c, p in pesos.most_common()
             if c == principal or (en_zona_fuerte[c] and p >= 0.2 * peso_max)]
    subtipos = []
    if "vivienda" in tipos:
        texto = fuerte_n + " " + cuerpo_n
        subtipos = [nombre for nombre, patron in SUBTIPOS_VIVIENDA.items() if patron.search(texto)]
    return {
        "tipo": principal,
        "tipos": tipos,
        "subtipos": subtipos,
        "_tipo_evidencia": "; ".join(f"{c}: {', '.join(evidencia[c])}" for c in tipos),
    }


# "Sala VIP" es una de las 25 zonas comunes, no el segmento del proyecto.
RE_VIP_QUE_NO_ES_SEGMENTO = re.compile(r"\b(sala|salon|salón|zona|lounge|area|área|club|room)\s+VIP\b|\bVIP\s+(lounge|room)\b",
                                       re.I)
# Topes legales del precio, en SMMLV: por encima, el segmento que escribe la
# página contradice su propio precio. No se corrige (sería adivinar): se avisa.
TOPE_SMMLV = {"VIP": 90, "VIS": 150}


def segmento_vivienda(texto):
    """VIS, VIP o No VIS, solo si la página lo escribe. Nunca se deduce."""
    plano = _norm(texto)
    if re.search(r"\bno vis\b", plano):
        return "No VIS"
    if re.search(r"\bVIP\b", RE_VIP_QUE_NO_ES_SEGMENTO.sub(" ", texto or "")) or "vivienda de interes prioritario" in plano:
        return "VIP"
    if re.search(r"\bVIS\b", texto or "") or "vivienda de interes social" in plano or "tope vis" in plano:
        return "VIS"
    return None


def operacion(texto):
    plano = _norm(texto)
    salida = []
    # "desde $" no sirve de señal: "canon desde $ 4.500.000" es un arriendo.
    if re.search(r"\b(venta|ventas|se vende|compra|separa(lo|la|tu)?|separacion|cuota inicial|"
                 r"precio desde)\b", plano):
        salida.append("venta")
    if re.search(r"\b(arriendo|arrienda|arrendamiento|alquiler|renta mensual|canon)\b", plano):
        salida.append("arriendo")
    return salida


def estado_obra(texto):
    plano = _norm(texto)
    return next((nombre for nombre, patron in ESTADOS_OBRA if patron.search(plano)), None)


# ---------------------------------------------------------------------------
# Cifras
# ---------------------------------------------------------------------------

RE_PRECIO = re.compile(
    r"(\$\s*)?(\d{1,3}(?:[.,'’´]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|millon|mill|mm|smmlv|smlmv)?\b",
    re.I,
)
PRECIO_VENTA = (20_000_000, 60_000_000_000)
PRECIO_ARRIENDO = (300_000, 300_000_000)


def _numero(texto, miles_si_tres=True):
    """'230.000.000' -> 230000000 · '48,5' -> 48.5 · '1.200' -> 1200."""
    texto = texto.replace("'", ".").replace("’", ".").replace("´", ".")
    partes = re.split(r"[.,]", texto)
    if len(partes) > 1 and miles_si_tres and all(len(p) == 3 for p in partes[1:]):
        return float("".join(partes))
    if len(partes) == 2:
        return float(f"{partes[0]}.{partes[1]}")
    return float("".join(partes))


def precios_en_texto(texto, smmlv=None):
    """[(valor_cop, es_desde, fragmento)] de los precios que escribe la página."""
    salida = []
    for m in RE_PRECIO.finditer(texto or ""):
        signo, cifra, unidad = m.group(1), m.group(2), (m.group(3) or "").lower()
        if not signo and not unidad:
            continue
        try:
            valor = _numero(cifra)
        except ValueError:
            continue
        if unidad.startswith(("millon", "mill", "mm")):
            valor *= 1_000_000
        elif unidad in ("smmlv", "smlmv"):
            if not smmlv:
                continue
            valor *= smmlv
        antes = _norm(texto[max(0, m.start() - 30): m.start()])
        salida.append((int(round(valor)), "desde" in antes,
                       _corto(texto[max(0, m.start() - 25): m.end() + 5], 80)))
    return salida


def precio_desde(texto, arriendo=False, smmlv=None):
    """(precio, fragmento): el 'desde' más bajo; si no hay 'desde', el más bajo plausible."""
    piso, techo = PRECIO_ARRIENDO if arriendo else PRECIO_VENTA
    validos = [(v, d, f) for v, d, f in precios_en_texto(texto, smmlv) if piso <= v <= techo]
    if not validos:
        return None, None
    con_desde = [x for x in validos if x[1]]
    valor, _, fragmento = min(con_desde or validos, key=lambda x: x[0])
    return valor, fragmento


RE_AREA = re.compile(r"(\d{1,5}(?:[.,]\d{1,3})?)\s*(?:m²|m2|mts²|mts2|mt2|mts|metros cuadrados)(?![a-z0-9])", re.I)


def areas(texto):
    """{'desde': m², 'hasta': m²} o None."""
    valores = []
    for m in RE_AREA.finditer(texto or ""):
        try:
            valor = _numero(m.group(1))
        except ValueError:
            continue
        if 12 <= valor <= 200_000:
            valores.append(round(valor, 1))
    if not valores:
        return None
    return {"desde": min(valores), "hasta": max(valores)}


def _conteos(texto, palabra):
    """'1, 2 y 3 habitaciones' -> [1, 2, 3] · 'de 1 a 3 alcobas' -> [1, 2, 3]."""
    patron = re.compile(r"(?<![\d.,])((?:\d\s*(?:,|y|o|a|-|/)\s*)*\d)\s*(?:" + palabra + r")", re.I)
    salida = set()
    for m in patron.finditer(_norm(texto)):
        grupo = m.group(1)
        numeros = [int(n) for n in re.findall(r"\d", grupo)]
        if len(numeros) == 2 and re.search(r"\d\s*(a|-)\s*\d", grupo):
            numeros = list(range(min(numeros), max(numeros) + 1))
        salida.update(n for n in numeros if 1 <= n <= 6)
    return sorted(salida)


def habitaciones(texto):
    return _conteos(texto, r"habitaciones|habitacion|alcobas?|dormitorios?|habs?\b")


def banos(texto):
    return _conteos(texto, r"banos?\b")


RE_DIRECCION = re.compile(
    r"\b(?:Avenida|Av\.?|Calle|Cl\.?|Cll\.?|Carrera|Cra\.?|Kr\.?|Kra\.?|Diagonal|Dg\.?|"
    r"Transversal|Tv\.?|Autopista|Circular|Vía|Via)\s*\d+[A-Za-z]?(?:\s*(?:Bis|Sur|Este))?"
    r"\s*(?:#|No\.?|N°|Nº|n\.?)\s*\d+[A-Za-z]?\s*-\s*\d+(?:\s*(?:Sur|Este))?",
    re.I,
)


def ciudad(pagina):
    """(ciudad, evidencia): JSON-LD, luego la URL y el título, luego el cuerpo."""
    for bloque in pagina["ld"]:
        direccion = bloque.get("address")
        if isinstance(direccion, dict):
            localidad = _norm(direccion.get("addressLocality") or direccion.get("addressRegion") or "")
            m = _RE_CIUDADES.search(localidad)
            if m:
                return CIUDADES[m.group(1)], "json-ld addressLocality"
    fuertes = Counter(_RE_CIUDADES.findall(_norm(pagina["fuerte"])))
    if fuertes:
        return CIUDADES[fuertes.most_common(1)[0][0]], "título, URL o descripción"
    # En el cuerpo, "un bello proyecto" o "zonas de pasto" no son ciudades: esas
    # solo cuentan si las nombra el título, la URL o el JSON-LD.
    cuerpo = Counter(c for c in _RE_CIUDADES.findall(_norm(pagina["cuerpo"])) if c not in CIUDADES_AMBIGUAS)
    if cuerpo:
        return CIUDADES[cuerpo.most_common(1)[0][0]], "texto de la página"
    return None, None


def direccion(pagina):
    for bloque in pagina["ld"]:
        valor = bloque.get("address")
        if isinstance(valor, dict) and valor.get("streetAddress"):
            return _corto(valor["streetAddress"], 140), "json-ld streetAddress"
        if isinstance(valor, str) and RE_DIRECCION.search(valor):
            return _corto(valor, 140), "json-ld address"
    m = RE_DIRECCION.search(pagina["cuerpo"])
    if m:
        return _corto(m.group(0), 140), "texto de la página"
    return None, None


# ---------------------------------------------------------------------------
# Nombre del proyecto
# ---------------------------------------------------------------------------

SEPARADORES_TITULO = re.compile(r"\s+[|\-–—:·•»]\s+|\s*[:,|]\s+")
TITULOS_GENERICOS = {
    "inicio", "home", "proyectos", "proyecto", "nuestros proyectos", "vivienda", "apartamentos",
    "casas", "oficinas", "venta", "ventas", "proyectos de vivienda", "bienvenidos", "sitio oficial",
} | set(CIUDADES)


def limpiar_titulo(texto, empresa="", raiz="", slug=""):
    """'Bosque Verde | Constructora X' -> 'Bosque Verde'.

    Si quedan varias partes ("Apartamentos en venta en Bogotá - Bosque Verde"),
    gana la que comparte más palabras con la URL de la ficha: el slug casi
    siempre es el nombre del proyecto, y el resto del título es SEO.
    """
    partes = [p.strip() for p in SEPARADORES_TITULO.split(texto or "") if p.strip()]
    empresa_k = _clave(empresa)
    raiz_k = _clave(raiz.split(".")[0]) if raiz else ""

    def es_de_la_empresa(parte):
        k = _clave(parte)
        if not k:
            return True
        if empresa_k and (k == empresa_k or (empresa_k in k and len(k) <= len(empresa_k) + 12)):
            return True
        return bool(raiz_k) and k.replace(" ", "") == raiz_k.replace(" ", "")

    utiles = [p for p in partes if _clave(p) not in TITULOS_GENERICOS and not es_de_la_empresa(p)]
    if not utiles:
        return ""
    palabras_slug = set(_clave(slug).split())
    if palabras_slug and len(utiles) > 1:
        utiles.sort(key=lambda p: -len(set(_clave(p).split()) & palabras_slug))
    return _corto(utiles[0], 120)


def _slug(url):
    segmentos = [s for s in urlparse(url).path.split("/") if s]
    return re.sub(r"^(proyecto|project)s?-", "", segmentos[-1]) if segmentos else ""


def _nombre_desde_slug(url):
    return _corto(re.sub(r"[-_]+", " ", _slug(url)).strip().title(), 120)


# Lo que un slug le agrega al nombre: la categoría al principio
# ("apartamentos-bosque-verde") y la ciudad al final ("bosque-verde-bogota").
PALABRAS_DE_CATEGORIA = {
    "proyecto", "proyectos", "apartamentos", "apartamento", "aptos", "casas", "casa", "vivienda",
    "viviendas", "venta", "arriendo", "nuevo", "nuevos", "nueva", "nuevas", "vis", "vip", "oficinas",
    "locales", "bodegas", "lotes", "en", "de", "del", "y",
}


def _tokens_recortados(tokens):
    tokens = list(tokens)
    while tokens and tokens[0] in PALABRAS_DE_CATEGORIA:
        tokens.pop(0)
    cambio = True
    while tokens and cambio:
        cambio = False
        for n in (2, 1):
            if len(tokens) > n and " ".join(tokens[-n:]) in CIUDADES:
                del tokens[-n:]
                cambio = True
                break
        if tokens and tokens[-1] in PALABRAS_DE_CATEGORIA:
            tokens.pop()
            cambio = True
    return tokens


def tramo_del_slug(texto, slug):
    """El pedazo de `texto` que dice lo mismo que la URL, con sus mayúsculas.

    'Proyecto Murales: Apartamentos VIS en Bogotá' + /proyectos/murales -> 'Murales'.
    Medido contra un sitio real, el `<title>` y hasta el JSON-LD `name` traen el
    SEO completo ("Apartamentos en Venta Lagos de Torca Vizcaya"), y la URL es
    lo único que trae el nombre limpio. Primero se busca el slug entero; si no
    aparece, sin la categoría del principio ni la ciudad del final.
    """
    completos = _clave(slug).split()
    palabras = [(m.start(), m.end(), _clave(m.group(0))) for m in re.finditer(r"[^\W_]+", texto or "")]
    claves = [p[2] for p in palabras]
    for tokens in (completos, _tokens_recortados(completos)):
        if not tokens or all(t.isdigit() or t in PALABRAS_DE_CATEGORIA for t in tokens):
            continue
        for i in range(len(claves) - len(tokens) + 1):
            if claves[i: i + len(tokens)] == tokens:
                tramo = texto[palabras[i][0]: palabras[i + len(tokens) - 1][1]]
                return tramo if any(c.isupper() for c in tramo) else tramo.title()
    return None


def nombre_proyecto(pagina, empresa="", raiz=""):
    """(nombre, evidencia). Lo que coincide con la URL; si no, JSON-LD, og:title, <title> y h1."""
    slug = _slug(pagina["canonica"] or pagina["url"]).replace("-", " ")
    nombre_ld = next((b["name"] for b in pagina["ld"] if isinstance(b.get("name"), str)
                      and _tipos_ld(b) & (TIPOS_LD_FUERTES | TIPOS_LD_DEBILES)), "")
    for fuente, texto in (("json-ld name", nombre_ld), ("h1", pagina["h1"]),
                          ("og:title", pagina["metas"].get("og:title", "")), ("<title>", pagina["titulo"])):
        tramo = tramo_del_slug(texto, slug)
        if tramo and _clave(tramo) not in TITULOS_GENERICOS:
            return _corto(tramo, 120), f"{fuente}, lo que coincide con la URL"
    for bloque in pagina["ld"]:
        if _tipos_ld(bloque) & (TIPOS_LD_FUERTES | TIPOS_LD_DEBILES) and isinstance(bloque.get("name"), str):
            nombre = limpiar_titulo(bloque["name"], empresa, raiz, slug)
            if nombre:
                return nombre, "json-ld name"
    for fuente, texto in (("og:title", pagina["metas"].get("og:title", "")),
                          ("<title>", pagina["titulo"]), ("h1", pagina["h1"])):
        nombre = limpiar_titulo(texto, empresa, raiz, slug)
        if nombre:
            return nombre, fuente
    return _nombre_desde_slug(pagina["url"]), "url"


# ---------------------------------------------------------------------------
# Colores
# ---------------------------------------------------------------------------

def _rgb(hexa):
    return tuple(int(hexa[i:i + 2], 16) for i in (1, 3, 5))


def _distancia(a, b):
    return math.dist(_rgb(a), _rgb(b))


def colores_de_imagen(imagen, n=COLORES_POR_IMAGEN):
    """[(hex, fracción)] de una imagen de Pillow ya abierta."""
    rgb = imagen.convert("RGB")
    rgb.thumbnail((96, 96))
    metodo = getattr(getattr(Image, "Quantize", Image), "MEDIANCUT", 0)
    cuantizada = rgb.quantize(colors=n, method=metodo)
    paleta = cuantizada.getpalette() or []
    cuentas = cuantizada.getcolors() or []
    total = sum(c for c, _ in cuentas) or 1
    salida = []
    for cuenta, indice in sorted(cuentas, reverse=True):
        r, g, b = paleta[3 * indice: 3 * indice + 3]
        salida.append((_ident._a_hex(r, g, b), cuenta / total))
    return salida


def paleta_de_imagenes(listas, maximo=MAX_COLORES_PROYECTO):
    """Une los colores de varias fotos; los muy parecidos cuentan como uno."""
    listas = [lista for lista in listas if lista]
    if not listas:
        return []
    acumulado = Counter()
    for lista in listas:
        for hexa, fraccion in lista:
            acumulado[hexa] += fraccion / len(listas)
    grupos = []
    for hexa, peso in acumulado.most_common():
        for grupo in grupos:
            if _distancia(grupo[0], hexa) < DISTANCIA_COLOR:
                grupo[1] += peso
                break
        else:
            grupos.append([hexa, peso])
    grupos.sort(key=lambda g: -g[1])
    return [{"hex": h, "fraccion": round(p, 3), "rol": _ident._rol(h)} for h, p in grupos[:maximo]]


def destacados(hexes):
    """primario, secundario y acento: color de marca, no pastel, tonos separados."""
    elegidos = []
    for hexa in hexes:
        if len(elegidos) == 3:
            break
        if hexa in elegidos or _ident._rol(hexa) != "marca" or _ident._hsl(hexa)[2] > _ident.MAX_LUMINOSIDAD_ROL:
            continue
        tono = _ident._hsl(hexa)[0]
        if any(_ident._dif_tono(tono, _ident._hsl(otro)[0]) < _ident.SEPARACION_TONO for otro in elegidos):
            continue
        elegidos.append(hexa)
    return elegidos + [None] * (3 - len(elegidos))


# ---------------------------------------------------------------------------
# Amenidades
# ---------------------------------------------------------------------------

def mapear_amenidades(etiquetas, cuerpo=""):
    """(zonas_comunes, no_mapeadas, evidencia) con el vocabulario de 25 del modelo.

    Usa `scraping/scraper_projects.mapear_zonas_comunes`, la misma tabla de alias
    explícita del catálogo: una amenidad desconocida se reporta, no se adivina
    (invariante 2). Si la página no tiene una lista de amenidades, se buscan en
    el texto solo los 25 nombres canónicos, tal cual.
    """
    from Model.catalogos import ZONAS_COMUNES

    if etiquetas:
        from scraping.scraper_projects import mapear_zonas_comunes

        nombres, _indices, no_mapeadas = mapear_zonas_comunes(etiquetas)
        if nombres:
            return nombres, no_mapeadas[:30], "lista de zonas comunes"
    plano = _norm(cuerpo)
    encontrados = [z for z in ZONAS_COMUNES if re.search(r"\b" + re.escape(_norm(z)) + r"\b", plano)]
    return encontrados, [], ("nombres del vocabulario en el texto" if encontrados else None)


# ---------------------------------------------------------------------------
# Fotos
# ---------------------------------------------------------------------------

_EXTENSIONES = {"JPEG": "jpg", "MPO": "jpg", "PNG": "png", "WEBP": "webp", "AVIF": "avif"}


def bajar_imagen(url):
    """La foto ya verificada: bytes, extensión, tamaño, hash y colores. Lanza si no sirve."""
    if Image is None:
        raise RuntimeError("Pillow no está instalado")
    datos = _bajar(url, timeout=TIMEOUT_IMAGEN).content or b""
    if not MIN_BYTES_IMAGEN <= len(datos) <= MAX_BYTES_IMAGEN:
        raise ValueError(f"{len(datos)} bytes")
    imagen = Image.open(io.BytesIO(datos))
    ancho, alto = imagen.size
    if ancho * alto > MAX_PIXELES_IMAGEN:
        raise ValueError("demasiados píxeles")
    if min(ancho, alto) < MIN_LADO_IMAGEN:
        raise ValueError(f"pequeña ({ancho}x{alto})")
    if max(ancho, alto) / max(1, min(ancho, alto)) > MAX_PROPORCION_IMAGEN:
        raise ValueError(f"banda ({ancho}x{alto})")
    extension = _EXTENSIONES.get((imagen.format or "").upper())
    if not extension:
        raise ValueError(f"formato {imagen.format}")
    colores = colores_de_imagen(imagen)          # decodifica entera: una foto truncada falla aquí
    return {"datos": datos, "extension": extension, "ancho": ancho, "alto": alto,
            "formato": extension, "bytes": len(datos), "sha1": hashlib.sha1(datos).hexdigest(),
            "colores": colores}


# ---------------------------------------------------------------------------
# Extracción completa
# ---------------------------------------------------------------------------

def _resumen_identidad(ident):
    if not ident:
        return None
    logo = ident.get("logo") or {}
    return {
        "primario": ident.get("primario"), "secundario": ident.get("secundario"),
        "acento": ident.get("acento"), "fondo": ident.get("fondo"), "texto": ident.get("texto"),
        "marca": (ident.get("marca") or [])[:8], "neutros": (ident.get("neutros") or [])[:6],
        "logo": logo.get("archivo"),
        "carpeta_identidad": ident.get("carpeta"),
    }


def _smmlv():
    try:
        from Model.prep import SMMLV  # invariante 5: el SMMLV vive en un solo sitio
        return SMMLV
    except Exception:  # pragma: no cover
        return None


def _localidad_bogota(direccion_texto):
    if not direccion_texto:
        return None
    try:
        from scraping.scraper_projects import localidad_desde_direccion

        r = localidad_desde_direccion(direccion_texto) or {}
    except Exception:
        return None
    if not r.get("localidad"):
        return None
    return {"id": r["localidad"], "nombre": r.get("nombre"), "_confianza": r.get("confianza"),
            "_evidencia": r.get("evidencia")}


def describir_proyecto(pagina, empresa, raiz, smmlv=None):
    """Lo que se sabe de un proyecto por su ficha, sin bajar todavía sus fotos."""
    nombre, evidencia_nombre = nombre_proyecto(pagina, empresa, raiz)
    tipos_ld = set()
    for bloque in pagina["ld"]:
        tipos_ld |= _tipos_ld(bloque)
    texto = pagina["fuerte"] + " · " + pagina["cuerpo"]
    oferta = clasificar_oferta(pagina["fuerte"], pagina["cuerpo"], tipos_ld)
    operaciones = operacion(texto)
    solo_arriendo = operaciones == ["arriendo"]
    precio, precio_texto = precio_desde(texto, arriendo=solo_arriendo, smmlv=smmlv)
    zonas, no_mapeadas, evidencia_zonas = mapear_amenidades(pagina["amenidades"], pagina["cuerpo"])
    ciudad_nombre, evidencia_ciudad = ciudad(pagina)
    direccion_texto, evidencia_direccion = direccion(pagina)
    descripcion = (pagina["metas"].get("og:description") or pagina["metas"].get("description") or "")
    segmento = segmento_vivienda(texto) if "vivienda" in oferta["tipos"] else None
    aviso_segmento = None
    if segmento in TOPE_SMMLV and precio and smmlv and not solo_arriendo and precio > TOPE_SMMLV[segmento] * smmlv:
        aviso_segmento = (f"la página dice {segmento}, pero su precio desde supera el tope "
                          f"de {TOPE_SMMLV[segmento]} SMMLV")
    return {
        "nombre": nombre,
        "url": pagina["canonica"] or pagina["url"],
        "tipo": oferta["tipo"],
        "tipos": oferta["tipos"],
        "subtipos": oferta["subtipos"],
        "segmento": segmento,
        "operacion": operaciones,
        "estado_obra": estado_obra(texto),
        "descripcion": _corto(html_mod.unescape(descripcion), 300) or None,
        "ciudad": ciudad_nombre,
        "direccion": direccion_texto,
        "localidad": _localidad_bogota(direccion_texto) if ciudad_nombre == "Bogotá" else None,
        "lat": pagina["lat"],
        "lon": pagina["lon"],
        "precio_desde_cop": precio,
        "precio_es_canon": bool(precio) and solo_arriendo,
        "area_m2": areas(texto),
        "habitaciones": habitaciones(texto),
        "banos": banos(texto),
        "zonas_comunes": zonas,
        "zonas_comunes_no_mapeadas": no_mapeadas,
        "_nombre_evidencia": evidencia_nombre,
        "_tipo_evidencia": oferta["_tipo_evidencia"],
        "_segmento_aviso": aviso_segmento,
        "_precio_evidencia": precio_texto,
        "_ciudad_evidencia": evidencia_ciudad,
        "_direccion_evidencia": evidencia_direccion,
        "_ubicacion_evidencia": pagina["evidencia_geo"],
        "_zonas_evidencia": evidencia_zonas,
    }


def _escribir_atomico(dir_final, construir):
    """Arma la carpeta de la empresa al lado y la cambia de un golpe.

    Una corrida nueva puede renumerar los proyectos (la empresa publicó o retiró
    uno): mezclar carpetas de dos corridas dejaría fotos de un proyecto bajo el
    id de otro. Se construye en `<carpeta>.nueva`, y solo al final reemplaza a la
    anterior.
    """
    nueva, vieja = dir_final + ".nueva", dir_final + ".vieja"
    shutil.rmtree(nueva, ignore_errors=True)
    os.makedirs(nueva, exist_ok=True)
    try:
        resultado = construir(nueva)
    except BaseException:
        shutil.rmtree(nueva, ignore_errors=True)
        raise
    shutil.rmtree(vieja, ignore_errors=True)
    if os.path.isdir(dir_final):
        os.replace(dir_final, vieja)
    os.replace(nueva, dir_final)
    shutil.rmtree(vieja, ignore_errors=True)
    return resultado


def extraer_proyectos(
    url,
    dir_salida=None,
    guardar=True,
    descargar_imagenes=True,
    max_proyectos=MAX_PROYECTOS,
    max_imagenes=MAX_IMAGENES_PROYECTO,
    presupuesto_s=PRESUPUESTO_SEGUNDOS,
    identidad=None,
    con_identidad=True,
    verbose=False,
):
    """Los proyectos de la empresa que vive en `url`.

    Deja todo en

        <dir_salida>/<Empresa>/proyectos_<Empresa>.json
        <dir_salida>/<Empresa>/<Nombre_Proyecto>/<id_proyecto>/01.jpg ...

    y devuelve el mismo dict que escribe en el JSON.

    url             lo que la persona escribió en el formulario ('constructora.com' vale).
    dir_salida      raíz donde crear la carpeta de la empresa. Por defecto, DIR_PROYECTOS_WEB
                    (y la identidad en DIR_IDENTIDADES); con un valor, las dos van ahí.
    guardar         False no escribe nada ni baja fotos: solo devuelve el dict.
    identidad       el dict de `scrap_identity.extraer_colores` si ya se tiene.
    con_identidad   False no calcula la identidad de la empresa (más rápido).
    presupuesto_s   tiempo total. Si se acaba, guarda lo que alcanzó (`incompleto`).
    """
    reloj = _Reloj(presupuesto_s)
    url = _ident._normalizar_url(url)
    if verbose:
        print(f"[scrap_proyectos] {url}")

    respuesta = _bajar(url)
    portada = leer_pagina(respuesta, url)
    base = portada["url"]
    raiz = dominio_raiz(urlparse(base).hostname)

    if identidad is None and con_identidad:
        # Con `dir_salida`, la identidad también va ahí (`_identidades/<Empresa>/`): una
        # corrida de prueba no puede reescribir las identidades versionadas del repo.
        dir_identidad = os.path.join(dir_salida, "_identidades") if dir_salida else None
        try:
            identidad = _ident.extraer_colores(url, dir_salida=dir_identidad, guardar=guardar,
                                               descargar_logo=guardar)
        except TimeoutError:
            raise
        except Exception as error:
            identidad = None
            if verbose:
                print(f"  [aviso] identidad: {error}")
    if identidad:
        empresa = identidad.get("empresa")
    else:
        sopa_portada = _sopa(respuesta)
        empresa = _ident.nombre_empresa(sopa_portada, base)[0]
    carpeta_empresa = _ident.nombre_carpeta(empresa)
    if verbose:
        print(f"  empresa: {empresa}  (sitio {raiz})")

    fuentes = {"sitemaps": [], "listados": [], "paginas_leidas": 1, "avisos": []}
    descartados = []
    incompleto = None

    # --- 1. Candidatos ---------------------------------------------------------
    candidatos = {}                       # url -> bono

    def proponer(destino, bono):
        puntaje, listado = puntaje_url(destino, raiz)
        if puntaje < 0 or listado:
            return
        candidatos[destino] = max(candidatos.get(destino, -1), puntaje + bono)

    enlaces_portada = {destino for destino, _ in portada["enlaces"]}
    listados = []
    for destino, texto in portada["enlaces"]:
        puntaje, listado = puntaje_url(destino, raiz)
        if listado or (puntaje >= 0 and re.search(r"^(nuestros |ver (todos los )?)?proyectos$|portafolio", _norm(texto))):
            if destino not in listados:
                listados.append(destino)
        elif puntaje >= 0:
            proponer(destino, 0)

    try:
        for destino, bono in leer_sitemaps(base, raiz, reloj, fuentes, verbose).items():
            puntaje, listado = puntaje_url(destino, raiz)
            if listado:
                if destino not in listados:
                    listados.append(destino)
            else:
                proponer(destino, bono)

        indice = 0
        while indice < len(listados) and indice < MAX_LISTADOS:
            listado = listados[indice]
            indice += 1
            if reloj.agotado(reserva=0.55) or fuentes["paginas_leidas"] >= MAX_PAGINAS:
                break
            try:
                pagina = leer_pagina(_bajar(listado), listado)
            except TimeoutError:
                raise
            except Exception as error:
                descartados.append({"url": listado, "motivo": f"listado no responde: {_corto(error, 100)}"})
                continue
            fuentes["paginas_leidas"] += 1
            fuentes["listados"].append(listado)
            # Lo que el listado enlaza y la portada no: las fichas. Lo que se repite es el menú.
            for destino, _ in pagina["enlaces"]:
                if destino in enlaces_portada or _llave_url(destino) == _llave_url(listado):
                    continue
                partes = urlparse(destino)
                if _mismo_sitio(destino, raiz) and (
                        RE_PAGINACION.search(partes.path) or RE_PAGINACION.search("?" + partes.query)):
                    if destino not in listados:
                        listados.append(destino)     # /proyectos/page/2 es otro listado, no una ficha
                    continue
                proponer(destino, 2)
    except TimeoutError:
        incompleto = "se acabó el tiempo buscando proyectos"

    # --- 2. Fichas -------------------------------------------------------------
    ordenados = sorted(candidatos.items(), key=lambda kv: (-kv[1], urlparse(kv[0]).path.count("/")))
    ordenados = [(u, b) for u, b in ordenados if b >= 1] + [(u, b) for u, b in ordenados if b < 1]
    leidas, proyectos, llaves = set(), [], {}
    smmlv = _smmlv()
    for destino, bono in ordenados:
        if incompleto or len(proyectos) >= max_proyectos:
            break
        if fuentes["paginas_leidas"] >= MAX_PAGINAS:
            incompleto = f"se alcanzó el tope de {MAX_PAGINAS} páginas"
            break
        if reloj.agotado(reserva=RESERVA_IMAGENES if descargar_imagenes and guardar else 0.05):
            incompleto = "se acabó el tiempo leyendo fichas"
            break
        if bono < 1 and len(proyectos) >= 3:
            break                            # con fichas ya halladas, lo de forma desconocida sobra
        if _llave_url(destino) in leidas:
            continue
        leidas.add(_llave_url(destino))
        try:
            respuesta = _bajar(destino)
            if not _es_html(respuesta):
                continue
            pagina = leer_pagina(respuesta, destino)
        except TimeoutError:
            incompleto = "se acabó el tiempo leyendo fichas"
            break
        except Exception as error:
            descartados.append({"url": destino, "motivo": f"no responde: {_corto(error, 100)}"})
            continue
        fuentes["paginas_leidas"] += 1
        if pagina["canonica"]:
            if _llave_url(pagina["canonica"]) in leidas and _llave_url(pagina["canonica"]) != _llave_url(destino):
                continue
            leidas.add(_llave_url(pagina["canonica"]))
        puntaje, senales = es_pagina_de_proyecto(pagina, bono_url=bono)
        if puntaje < UMBRAL_PROYECTO:
            descartados.append({"url": destino, "motivo": f"no parece un proyecto ({puntaje} puntos: "
                                f"{', '.join(senales) or 'sin señales'})"})
            continue
        ficha = describir_proyecto(pagina, empresa, raiz, smmlv)
        if not ficha["nombre"] or _clave(ficha["nombre"]) in TITULOS_GENERICOS:
            descartados.append({"url": destino, "motivo": f"parece un listado, no una ficha "
                                f"(nombre «{ficha['nombre'] or '-'}»)"})
            continue
        llave = _clave(ficha["nombre"])
        if llave in llaves:                  # /proyecto-x y /proyecto-x/galeria son el mismo
            previo = llaves[llave]
            previo["_candidatas"] += [c for c in pagina["imagenes"] if c not in previo["_candidatas"]]
            continue
        ficha["_confianza"] = "alta" if puntaje >= UMBRAL_PROYECTO + 3 else "media"
        ficha["_evidencia"] = ", ".join(senales)
        ficha["_candidatas"] = list(pagina["imagenes"])
        ficha["_colores_css"] = pagina["colores"]
        llaves[llave] = ficha
        proyectos.append(ficha)
        if verbose:
            print(f"  [proyecto] {ficha['nombre']}  ({ficha['tipo']})  <- {destino}")

    # --- 3. Lo que es del sitio, no del proyecto --------------------------------
    n = len(proyectos)
    if n >= 2:
        conteo = Counter(u for p in proyectos for u in {c[0] for c in p["_candidatas"]})
        cromo = {u for u, c in conteo.items() if c >= max(2, math.ceil(FRACCION_CROMO * n))}
        for p in proyectos:
            p["_candidatas"] = [c for c in p["_candidatas"] if c[0] not in cromo]
    colores_sitio = set(portada["colores"])
    if identidad:
        colores_sitio |= {c["hex"] for c in identidad.get("paleta") or [] if isinstance(c, dict)}
    if n >= 3:
        en_fichas = Counter(h for p in proyectos for h in p["_colores_css"])
        colores_sitio |= {h for h, c in en_fichas.items() if c >= math.ceil(FRACCION_COLOR_SITIO * n)}
    for p in proyectos:
        propios = [h for h, _ in p["_colores_css"].most_common() if h not in colores_sitio]
        p["colores_pagina"] = propios[:6]

    # Ids estables: por nombre, como el catálogo ordena por constructora y nombre.
    proyectos.sort(key=lambda p: _clave(p["nombre"]))
    for i, p in enumerate(proyectos, start=1):
        p["id_proyecto"] = i
        p["carpeta"] = f"{_ident.nombre_carpeta(p['nombre']) or f'Proyecto_{i}'}/{i}"

    # --- 4. Fotos y colores ------------------------------------------------------
    def bajar_fotos(dir_empresa):
        nonlocal incompleto
        total, vistas = 0, set()
        for p in proyectos:
            p["imagenes"], colores = [], []
            destino = os.path.join(dir_empresa, *p["carpeta"].split("/")) if dir_empresa else None
            for url_imagen, fuente in p["_candidatas"]:
                if len(p["imagenes"]) >= max_imagenes or total >= MAX_IMAGENES_TOTAL:
                    break
                if reloj.agotado(reserva=0.02):
                    incompleto = incompleto or "se acabó el tiempo bajando fotos"
                    break
                try:
                    foto = bajar_imagen(url_imagen)
                except TimeoutError:
                    incompleto = incompleto or "se acabó el tiempo bajando fotos"
                    break
                except Exception:
                    continue
                if foto["sha1"] in vistas:
                    continue
                vistas.add(foto["sha1"])
                id_imagen = f"{len(p['imagenes']) + 1:02d}"
                archivo = f"{id_imagen}.{foto['extension']}"
                os.makedirs(destino, exist_ok=True)
                with open(os.path.join(destino, archivo), "wb") as salida:
                    salida.write(foto["datos"])
                total += 1
                if len(colores) < IMAGENES_PARA_PALETA:
                    colores.append(foto["colores"])
                p["imagenes"].append({
                    "id": id_imagen, "archivo": archivo, "ruta": f"{p['carpeta']}/{archivo}",
                    "origen": url_imagen, "fuente": fuente, "portada": not p["imagenes"],
                    "ancho": foto["ancho"], "alto": foto["alto"], "formato": foto["formato"],
                    "bytes": foto["bytes"],
                })
            p["paleta"] = paleta_de_imagenes(colores)

    def armar(dir_empresa):
        if dir_empresa and descargar_imagenes:
            bajar_fotos(dir_empresa)
        for p in proyectos:
            if "imagenes" not in p:          # sin bajar fotos: se listan sus candidatas
                p["imagenes"] = [{"id": f"{i:02d}", "archivo": None, "ruta": None, "origen": u,
                                  "fuente": f, "portada": i == 1}
                                 for i, (u, f) in enumerate(p["_candidatas"][:max_imagenes], start=1)]
                p["paleta"] = []
            hexes = list(p["colores_pagina"]) + [c["hex"] for c in p["paleta"]]
            p["primario"], p["secundario"], p["acento"] = destacados(hexes)
            p["colores_principales"] = [h for h in (p["primario"], p["secundario"], p["acento"]) if h] \
                or [c["hex"] for c in p["paleta"][:3]]
        resultado = _armar_resultado()
        if dir_empresa:
            ruta = os.path.join(dir_empresa, f"proyectos_{carpeta_empresa}.json")
            with open(ruta, "w", encoding="utf-8") as salida:
                json.dump(resultado, salida, ensure_ascii=False, indent=2)
        return resultado

    def _armar_resultado():
        oferta_portada = clasificar_oferta(portada["fuerte"], portada["cuerpo"])
        conteo_tipos = Counter(t for p in proyectos for t in p["tipos"])
        conteo_ops = Counter(o for p in proyectos for o in p["operacion"])
        principal = (conteo_tipos.most_common(1)[0][0] if conteo_tipos else oferta_portada["tipo"])
        orden = ("id_proyecto", "nombre", "url", "tipo", "tipos", "subtipos", "segmento", "operacion",
                 "estado_obra", "descripcion", "ciudad", "direccion", "localidad", "lat", "lon",
                 "precio_desde_cop", "precio_es_canon", "area_m2", "habitaciones", "banos",
                 "zonas_comunes", "zonas_comunes_no_mapeadas", "colores_principales", "primario",
                 "secundario", "acento", "colores_pagina", "paleta", "carpeta", "imagenes")
        limpios = []
        for p in proyectos:
            fila = {k: p.get(k) for k in orden}
            fila.update({k: v for k, v in p.items() if k.startswith("_") and k not in ("_candidatas", "_colores_css")})
            limpios.append(fila)
        return {
            "empresa": empresa,
            "carpeta": carpeta_empresa,
            "url": url,
            "url_final": base,
            "dominio": urlparse(base).hostname,
            "extraido_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "que_vende": {
                "principal": principal,
                "tipos": dict(conteo_tipos.most_common()),
                "operaciones": dict(conteo_ops.most_common()),
                "_portada": oferta_portada["_tipo_evidencia"],
            },
            "empresa_identidad": _resumen_identidad(identidad),
            "total_proyectos": len(proyectos),
            "total_imagenes": sum(len([i for i in p.get("imagenes") or [] if i.get("archivo")]) for p in proyectos),
            "incompleto": bool(incompleto),
            "_incompleto_motivo": incompleto,
            "proyectos": limpios,
            "descartados": descartados[:80],
            "fuentes": {**fuentes, "candidatos": len(candidatos),
                        "segundos": round(time.monotonic() - reloj.inicio, 1),
                        "sin_javascript": "las páginas se leen como llegan del servidor"},
        }

    if not guardar:
        return armar(None)
    dir_empresa = os.path.join(dir_salida or DIR_PROYECTOS_WEB, carpeta_empresa)
    resultado = _escribir_atomico(dir_empresa, armar)
    resultado["_ruta_json"] = os.path.join(dir_empresa, f"proyectos_{carpeta_empresa}.json")
    if verbose:
        print(f"  -> {resultado['_ruta_json']}")
    return resultado


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _resumen(resultado):
    print(f"\n{resultado['empresa']}  ({resultado['dominio']})")
    oferta = resultado["que_vende"]
    print(f"  vende        : {oferta['principal']}  {oferta['tipos']}")
    print(f"  proyectos    : {resultado['total_proyectos']}   fotos: {resultado['total_imagenes']}"
          f"   {'INCOMPLETO: ' + resultado['_incompleto_motivo'] if resultado['incompleto'] else ''}")
    for p in resultado["proyectos"]:
        precio = f"${p['precio_desde_cop']:,}".replace(",", ".") if p["precio_desde_cop"] else "-"
        print(f"    {p['id_proyecto']:>3}  {p['nombre'][:40]:<40} {str(p['tipo']):<10} "
              f"{str(p['ciudad'] or '-'):<12} {precio:<16} {len(p['imagenes'])} fotos  {p['primario'] or ''}")
    print(f"  descartados  : {len(resultado['descartados'])}   páginas leídas: "
          f"{resultado['fuentes']['paginas_leidas']}   {resultado['fuentes']['segundos']} s")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Extrae los proyectos que una empresa publica en su sitio web.")
    parser.add_argument("urls", nargs="+", help="una o más URLs de empresa")
    parser.add_argument("--salida", default=None,
                        help=f"raíz donde crear las carpetas (por defecto {DIR_PROYECTOS_WEB})")
    parser.add_argument("--max-proyectos", type=int, default=MAX_PROYECTOS)
    parser.add_argument("--max-imagenes", type=int, default=MAX_IMAGENES_PROYECTO)
    parser.add_argument("--presupuesto", type=float, default=PRESUPUESTO_SEGUNDOS, help="segundos por empresa")
    parser.add_argument("--sin-imagenes", action="store_true", help="no baja fotos (sí las lista)")
    parser.add_argument("--sin-identidad", action="store_true", help="no calcula la paleta ni el logo de la empresa")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    fallos = 0
    for url in args.urls:
        try:
            resultado = extraer_proyectos(
                url, dir_salida=args.salida, descargar_imagenes=not args.sin_imagenes,
                max_proyectos=args.max_proyectos, max_imagenes=args.max_imagenes,
                presupuesto_s=args.presupuesto, con_identidad=not args.sin_identidad,
                verbose=args.verbose,
            )
            _resumen(resultado)
        except Exception as error:
            fallos += 1
            print(f"\n[error] {url}: {type(error).__name__}: {error}")
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
