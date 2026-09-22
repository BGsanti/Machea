"""
features/scrap_identity/scrap.py
================================
Identidad visual de una empresa a partir de su sitio web.

Recibe la URL que el usuario escribe en el formulario y devuelve —y guarda— la
**paleta de la empresa** y su **logo**:

    features/scrap_identity/identidades/<Empresa>/
        paleta_<Empresa>.json
        <Empresa>.svg

Mismo contrato de carpetas que `imagenes_proyectos/<id_proyecto>/`: el nombre
de la carpeta **es** la llave, así que el front pasa del nombre de la empresa a
sus archivos sin ninguna tabla intermedia.

Uso:

    from features.scrap_identity.scrap import extraer_colores
    identidad = extraer_colores("https://www.amarilo.com.co/")

    python features/scrap_identity/scrap.py https://www.amarilo.com.co/
    python features/scrap_identity/scrap.py URL1 URL2 --max-colores 16 -v


De dónde salen los colores
--------------------------
Del CSS, que es donde la marca declara su paleta de verdad — no del HTML a
secas, donde casi no hay colores. Se leen cuatro fuentes y se cuenta **cada
aparición**:

    <meta name="theme-color">     el color que la marca declara como suyo
    --variables CSS               los tokens de diseño (--color-primario: ...)
    <style> y style="..."         el CSS crítico que inyecta el framework
    <link rel="stylesheet">       las hojas enlazadas, hasta MAX_HOJAS_CSS
    el propio logo                sus colores, ponderados por cuánto ocupan

Se entienden los seis formatos que hoy aparecen en una hoja real —`#rgb`,
`#rrggbbaa`, `rgb()`, `hsl()`, `hwb()`, `oklch()`/`oklab()`, `color(srgb …)` y
los nombres CSS más comunes— y todos se normalizan a `#rrggbb` en minúscula.
`oklch` no es un lujo: es lo que emite Tailwind v4, así que un sitio moderno
sin esa conversión sale con la paleta vacía.

**El orden no es la cuenta cruda, y esa es la única desviación del "por más
aparición".** Un reset de CSS declara `#fff` doscientas veces y el
`theme-color` de la marca una sola: ordenar por cuenta pelada pondría el
blanco primero y el color de la empresa último. Así que cada aparición suma
según *dónde* apareció (`PESOS`), y el JSON publica **los dos números**
—`apariciones` y `peso`— para que la decisión se pueda auditar. Con
`--por-apariciones` se ordena por la cuenta cruda.

Los colores se parten además en `marca` (saturados) y `neutros` (grises,
blancos y negros): los dos son de la empresa, pero el que sirve para pintar un
botón es el primero. De ahí salen `primario`, `secundario`, `acento`, `fondo`
y `texto`, ya listos para el front.


Sobre el logo: siempre SVG
--------------------------
`FORMATO_LOGO = "svg"`, sin excepciones: el front busca `<Empresa>.svg` y no
tiene que probar dos extensiones por empresa.

**Se llegó a SVG midiendo, no por preferencia.** El primer diseño normalizaba
todo a PNG, y contra las cuatro constructoras del catálogo el logo real resultó
ser SVG en tres de cuatro (Amarilo, Cusezar, Colsubsidio). Rasterizar esos SVG
pide `cairosvg` o `svglib`, y las dos terminan en una librería nativa de Cairo
que en Windows no está: sin ella el ranking caía hasta el `og:image` y
guardaba la foto de un proyecto como si fuera el logo. Al revés no hay ese
problema — un SVG se guarda tal cual y un ráster se envuelve — así que el
estándar es el que sí cubre el catálogo entero.

    origen SVG      se guarda tal cual: sigue siendo vectorial de verdad
    origen ráster   Pillow lo normaliza a PNG y va dentro de un <image> del SVG

Lo segundo no vectoriza nada, y el JSON no finge que sí: `logo.vectorial` dice
`false` y `logo.formato_origen` dice de dónde salió. Al SVG que se guarda se le
quitan `<script>` y los `on*` (`_limpiar_svg`): viene de un tercero y lo va a
servir nuestro front.

`logo.fondo_recomendado` avisa cuando el logo es casi todo blanco —el de una
cabecera oscura, como el de Cusezar—, que sobre fondo claro desaparece.

Dependencias: requests, beautifulsoup4, lxml, Pillow.
"""

from __future__ import annotations

import argparse
import base64
import colorsys
import io
import json
import math
import os
import re
import sys
import unicodedata
from collections import Counter
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

# Ejecutable por ruta (`python features/scrap_identity/scrap.py`) o como módulo
# (`python -m features.scrap_identity.scrap`): en el primer caso Python pone en
# el path esta carpeta y no `backend/`, así que `Model` no se encontraría.
if __package__ in (None, ""):
    sys.path.insert(
        0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    )

# Dónde se guarda lo extraído lo dice `Model/rutas.py`, que es la única fuente
# de rutas del backend (invariante 9 del CLAUDE.md). Esta feature no calcula la
# suya aunque no forme parte del modelo.
from Model.rutas import DIR_IDENTIDADES

try:  # Pillow normaliza a PNG cualquier ráster (jpg, webp, ico, gif, bmp).
    from PIL import Image
except ImportError:  # pragma: no cover - se reporta al guardar, no al importar
    Image = None

try:  # el aviso de TLS sin verificar se emite una sola vez; ver `_get`
    import urllib3

    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except Exception:  # pragma: no cover - urllib3 viene con requests
    urllib3 = None


# ---------------------------------------------------------------------------
# Parámetros
# ---------------------------------------------------------------------------

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
TIMEOUT = 30
REINTENTOS = 3
ESPERA_REINTENTO = 1.0          # segundos, se duplica en cada intento

MAX_HOJAS_CSS = 8               # hojas enlazadas que se bajan, en orden
MAX_BYTES_CSS = 2_000_000       # una hoja más grande que esto es un bundle
MAX_COLORES = 12                # tamaño de `paleta` en el JSON
MAX_LADO_LOGO = 1024            # px; por encima se reescala manteniendo el aspecto
MIN_LADO_LOGO = 16              # px; por debajo es un pixel de tracking, no un logo
FORMATO_LOGO = "svg"            # uno solo para todo el catálogo. Ver el docstring.

# Cuánto suma una aparición según dónde apareció. Un `theme-color` es la marca
# declarándose; una regla suelta en un bundle de 300 KB puede ser cualquier
# cosa. Con todos los pesos en 1 esto degenera en la cuenta cruda, que es lo
# que hace `--por-apariciones`.
PESOS = {
    "theme_color": 20,          # <meta name="theme-color">
    "variable_css": 6,          # --color-primario: #ff6259
    "estilo_html": 2,           # style="..." y <style> en la página
    "svg_html": 2,              # fill=/stroke= de un SVG embebido
    "hoja_css": 1,              # una regla de una hoja enlazada
}
# El logo no tiene "apariciones" de texto: aporta según la fracción de píxeles
# que ocupa cada color. Un color que cubre el 60 % del logo suma 0,6 x esto.
PESO_LOGO = 60
COLORES_LOGO = 8                # cuántos colores se cuantizan del logo
MIN_FRACCION_LOGO = 0.02        # por debajo es antialiasing, no un color

# Un color con poca saturación es un neutro (gris, blanco, negro): parte de la
# identidad, pero no el color con el que se pinta un botón.
SATURACION_MARCA = 0.18
LUMINOSIDAD_NEUTRA = (0.06, 0.94)   # fuera de este rango, neutro aunque sature
SEPARACION_TONO = 25            # grados mínimos entre primario/secundario/acento
# Entre dos colores del logo el listón es más bajo: una marca puede usar de
# verdad dos tonos vecinos, y ahí manda el logo. Pero no cero — cuantizar un
# logo ráster devuelve el mismo naranja tres veces (#ff5f00, #ff6000, #ff6100)
# y sin este mínimo la paleta se gastaría en repetirlo.
SEPARACION_TONO_LOGO = 10

# Para *encabezar* la paleta (primario/secundario/acento) no basta con ser un
# color de marca. Un pastel no puede ser el color de un botón: no aguanta texto
# encima. Medido sobre las cuatro constructoras, es lo que separa el amarillo
# de Amarilo (#ffc900, luminosidad 0,50) del amarillo pálido de las barritas
# del logo de Cusezar (#fff39d, 0,81), que como primario sería ilegible.
MAX_LUMINOSIDAD_ROL = 0.80
# Y un color que pinta menos de esto del logo es un detalle, no la marca:
# las mismas barritas de Cusezar ocupan el 2,7 %, mientras el amarillo de
# Colsubsidio —que sí es suyo— ocupa el 4,7 % y el verde de Bolívar el 18 %.
MIN_FRACCION_ROL = 0.04

# Paletas por defecto de los frameworks de CSS. NO se descartan —están en la
# hoja y el sitio las usa— pero se reportan: en dos de las cuatro
# constructoras, Bootstrap declara tantas variables que su azul #0d6efd pesa
# más que el color de la empresa. Saber que la paleta viene de un framework es
# lo que explica que un JSON se parezca al del vecino.
PALETAS_FRAMEWORK = {
    "bootstrap": {
        "#0d6efd", "#6610f2", "#6f42c1", "#d63384", "#dc3545", "#fd7e14",
        "#ffc107", "#198754", "#20c997", "#0dcaf0", "#6c757d", "#212529",
        "#f8f9fa", "#e9ecef", "#dee2e6", "#ced4da", "#adb5bd", "#495057",
    },
    "tailwind": {
        "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#6366f1",
        "#8b5cf6", "#ec4899", "#64748b", "#94a3b8", "#1e293b", "#0f172a",
    },
}
MIN_COLORES_FRAMEWORK = 4       # con menos de esto es coincidencia, no el framework

# Hojas que nunca traen color de marca: pedirlas es un viaje perdido.
HOSTS_SIN_COLOR = ("fonts.googleapis.com", "fonts.gstatic.com", "use.typekit.net")


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------

_SESION = requests.Session()
_SESION.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "es-CO,es;q=0.9"})
_SIN_VERIFICAR: set[str] = set()
_AVISADOS: set[str] = set()


def _get(url, timeout=TIMEOUT, reintentos=REINTENTOS, **kwargs):
    """GET con reintentos y respaldo de TLS por host.

    Mismo criterio que `scraping/scraper_projects._get` y por la misma razón:
    varias constructoras —Amarilo entre ellas— sirven la cadena TLS incompleta,
    y su propio front arranca axios con `rejectUnauthorized: false`. No se
    importa de allá para no acoplar esta feature al scraper del catálogo, que
    arrastra el modelo entero al importarse.
    """
    host = urlparse(url).netloc
    ultimo_error = None
    for intento in range(reintentos):
        verificar = host not in _SIN_VERIFICAR
        try:
            respuesta = _SESION.get(url, timeout=timeout, verify=verificar, **kwargs)
            respuesta.raise_for_status()
            return respuesta
        except requests.exceptions.SSLError as error:
            ultimo_error = error
            if not verificar:
                break                   # ya iba sin verificar y aun así falló
            if host not in _AVISADOS:
                _AVISADOS.add(host)
                print(f"  [aviso] {host} tiene la cadena TLS incompleta; se reintenta sin verificar")
            _SIN_VERIFICAR.add(host)
            continue
        except requests.RequestException as error:
            ultimo_error = error
            if intento == reintentos - 1:
                break
            import time

            time.sleep(ESPERA_REINTENTO * (2 ** intento))
    raise RuntimeError(f"GET falló en {url}: {ultimo_error}")


def _normalizar_url(url):
    """`amarilo.com.co` -> `https://amarilo.com.co`. El formulario recibe lo que
    la persona escriba, y casi nadie escribe el esquema."""
    url = (url or "").strip()
    if not url:
        raise ValueError("La URL viene vacía.")
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url.lstrip("/")
    partes = urlparse(url)
    if not partes.netloc:
        raise ValueError(f"URL sin dominio: {url!r}")
    return url


# ---------------------------------------------------------------------------
# Color: los formatos que hoy aparecen en una hoja de estilos
# ---------------------------------------------------------------------------

# Subconjunto de los 148 nombres CSS: los que de verdad se escriben a mano en
# una hoja. Los 110 restantes ('papayawhip', 'mediumaquamarine'…) no aparecen
# en un sitio corporativo y alargarían el regex sin aportar una sola aparición.
COLORES_NOMBRADOS = {
    "white": "#ffffff", "black": "#000000", "red": "#ff0000", "green": "#008000",
    "blue": "#0000ff", "yellow": "#ffff00", "orange": "#ffa500", "purple": "#800080",
    "pink": "#ffc0cb", "gray": "#808080", "grey": "#808080", "silver": "#c0c0c0",
    "gold": "#ffd700", "navy": "#000080", "teal": "#008080", "aqua": "#00ffff",
    "cyan": "#00ffff", "magenta": "#ff00ff", "lime": "#00ff00", "maroon": "#800000",
    "olive": "#808000", "fuchsia": "#ff00ff", "brown": "#a52a2a", "beige": "#f5f5dc",
    "ivory": "#fffff0", "tan": "#d2b48c", "khaki": "#f0e68c", "coral": "#ff7f50",
    "salmon": "#fa8072", "crimson": "#dc143c", "indigo": "#4b0082", "violet": "#ee82ee",
    "turquoise": "#40e0d0", "tomato": "#ff6347", "orangered": "#ff4500",
    "whitesmoke": "#f5f5f5", "gainsboro": "#dcdcdc", "lightgray": "#d3d3d3",
    "lightgrey": "#d3d3d3", "darkgray": "#a9a9a9", "darkgrey": "#a9a9a9",
    "dimgray": "#696969", "dimgrey": "#696969", "slategray": "#708090",
    "slategrey": "#708090", "lightblue": "#add8e6", "darkblue": "#00008b",
    "darkgreen": "#006400", "darkred": "#8b0000", "skyblue": "#87ceeb",
    "steelblue": "#4682b4", "royalblue": "#4169e1", "seagreen": "#2e8b57",
}

# El orden importa: 8 dígitos antes que 6, 6 antes que 4, 4 antes que 3, o
# `#ff6259` se leería como `#ff6` seguido de basura. El lookahead evita que un
# selector de id (`#header`) entre como color.
RE_HEX = re.compile(
    r"#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])"
)
# Un nivel de anidamiento basta para `rgb(var(--x))`, que igual se descarta.
RE_FUNCION = re.compile(
    r"\b(rgba?|hsla?|hwb|oklch|oklab|color)\(([^()]*(?:\([^()]*\)[^()]*)*)\)", re.I
)
# Los nombres solo se buscan en CSS, nunca en el texto de la página: en HTML
# 'white' aparece en cualquier frase. El lookbehind deja fuera `bg-white` (una
# clase de Tailwind) y `.white` (un selector).
RE_NOMBRE = re.compile(
    r"(?<![\w#.\-])(" + "|".join(sorted(COLORES_NOMBRADOS, key=len, reverse=True)) + r")(?![\w-])",
    re.I,
)
RE_VARIABLE = re.compile(r"--[\w-]+\s*:\s*([^;{}]+)")
RE_NUMERO = re.compile(r"([+-]?(?:\d+\.?\d*|\.\d+))\s*(%|deg|turn|rad|grad)?")

ALFA_VISIBLE = 0.06             # por debajo el color no se ve: no es paleta


def _a_hex(r, g, b):
    """Tres canales 0–255 (ya en sRGB) a `#rrggbb`."""
    return "#%02x%02x%02x" % tuple(
        max(0, min(255, int(round(canal)))) for canal in (r, g, b)
    )


def _numeros(texto):
    """[(valor, unidad), …]. La unidad es '', '%', 'deg', 'turn', 'rad' o 'grad'."""
    return [(float(v), (u or "").lower()) for v, u in RE_NUMERO.findall(texto)]


def _grados(valor, unidad):
    if unidad == "turn":
        return valor * 360.0
    if unidad == "rad":
        return math.degrees(valor)
    if unidad == "grad":
        return valor * 0.9
    return valor


def _desde_hex(digitos):
    """`#rgb`, `#rgba`, `#rrggbb` y `#rrggbbaa` -> (hex de 6, alfa)."""
    if len(digitos) in (3, 4):
        digitos = "".join(c * 2 for c in digitos)
    if len(digitos) == 8:
        return "#" + digitos[:6].lower(), int(digitos[6:8], 16) / 255
    if len(digitos) == 6:
        return "#" + digitos.lower(), 1.0
    return None


def _oklab_a_hex(L, a, b):
    """OK Lab -> sRGB. Es lo que emite Tailwind v4 (`oklch`), así que sin esta
    conversión un sitio moderno sale sin un solo color."""
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    lineales = (
        +4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_,
    )
    canales = []
    for c in lineales:
        c = max(0.0, min(1.0, c))
        c = 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
        canales.append(c * 255)
    return _a_hex(*canales)


def _desde_funcion(nombre, argumentos):
    """`rgb()`, `hsl()`, `hwb()`, `oklch()`, `oklab()`, `color(srgb …)`."""
    nombre = nombre.lower()
    argumentos = argumentos.strip()
    # `var(--x)` y los colores relativos (`rgb(from …)`) no se pueden resolver
    # sin evaluar la cascada entera: se descartan en vez de adivinarlos.
    if "var(" in argumentos.lower() or re.match(r"^from\b", argumentos, re.I):
        return None

    if nombre == "color":
        espacio, _, resto = argumentos.partition(" ")
        if espacio.strip().lower() not in ("srgb", "srgb-linear", "display-p3"):
            return None         # lab/xyz/rec2020: otra escala, no vale aproximar
        argumentos = resto      # el nombre del espacio traía dígitos ('display-p3')

    valores = _numeros(argumentos)
    if len(valores) < 3:
        return None
    alfa = 1.0
    if len(valores) >= 4:
        v, u = valores[3]
        alfa = v / 100 if u == "%" else v
    if alfa < ALFA_VISIBLE:
        return None

    (v1, u1), (v2, u2), (v3, u3) = valores[:3]

    if nombre in ("rgb", "rgba") or nombre == "color":
        escala = 255 if nombre == "color" else 1      # color() viene en 0–1
        canales = [
            v * 2.55 if u == "%" else v * escala
            for v, u in ((v1, u1), (v2, u2), (v3, u3))
        ]
        return _a_hex(*canales), alfa

    if nombre in ("hsl", "hsla"):
        h = (_grados(v1, u1) % 360) / 360
        s, l = min(1.0, v2 / 100), min(1.0, v3 / 100)
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        return _a_hex(r * 255, g * 255, b * 255), alfa

    if nombre == "hwb":
        h = (_grados(v1, u1) % 360) / 360
        blanco, negro = min(1.0, v2 / 100), min(1.0, v3 / 100)
        if blanco + negro >= 1:                        # todo gris
            gris = blanco / (blanco + negro) * 255
            return _a_hex(gris, gris, gris), alfa
        base = colorsys.hls_to_rgb(h, 0.5, 1.0)
        canales = [(c * (1 - blanco - negro) + blanco) * 255 for c in base]
        return _a_hex(*canales), alfa

    if nombre in ("oklch", "oklab"):
        L = v1 / 100 if u1 == "%" else v1
        if nombre == "oklch":
            hue = math.radians(_grados(v3, u3))
            a, b = v2 * math.cos(hue), v2 * math.sin(hue)
        else:
            a, b = v2, v3
        return _oklab_a_hex(L, a, b), alfa

    return None


def colores_en_texto(texto, con_nombres=True):
    """Todos los colores de un bloque de CSS, en orden de aparición.

    Las variables (`--color-x: #ff6259`) salen aparte y se borran del texto
    antes del barrido general: si no, el mismo color se contaría dos veces, con
    dos pesos distintos, y el JSON dejaría de cuadrar consigo mismo.
    """
    if not texto:
        return [], []

    en_variables = []
    for valor in RE_VARIABLE.findall(texto):
        en_variables.extend(_colores_crudos(valor, con_nombres))
    resto = RE_VARIABLE.sub(" ", texto)
    return _colores_crudos(resto, con_nombres), en_variables


def _colores_crudos(texto, con_nombres=True):
    encontrados = []
    for digitos in RE_HEX.findall(texto):
        leido = _desde_hex(digitos)
        if leido and leido[1] >= ALFA_VISIBLE:
            encontrados.append(leido[0])
    for nombre, argumentos in RE_FUNCION.findall(texto):
        leido = _desde_funcion(nombre, argumentos)
        if leido:
            encontrados.append(leido[0])
    if con_nombres:
        for nombre in RE_NOMBRE.findall(texto):
            encontrados.append(COLORES_NOMBRADOS[nombre.lower()])
    return encontrados


def _frameworks_detectados(colores):
    """Qué paleta de plantilla se reconoce entre los colores leídos.

    No cambia nada del resultado: es la explicación de por qué una paleta puede
    salir genérica. Si el JSON dice `["bootstrap"]` y `primario` no cuadra con
    la marca, ya se sabe dónde mirar.
    """
    presentes = set(colores)
    return sorted(
        nombre for nombre, paleta in PALETAS_FRAMEWORK.items()
        if len(presentes & paleta) >= MIN_COLORES_FRAMEWORK
    )


def _hsl(hexa):
    """`#rrggbb` -> (tono 0–360, saturación 0–1, luminosidad 0–1)."""
    r, g, b = (int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s, l


def _rol(hexa):
    """`marca` si el color sirve para pintar algo; `neutro` si es fondo o texto."""
    _, s, l = _hsl(hexa)
    if s < SATURACION_MARCA:
        return "neutro"
    if not (LUMINOSIDAD_NEUTRA[0] <= l <= LUMINOSIDAD_NEUTRA[1]):
        return "neutro"
    return "marca"


def _dif_tono(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


# ---------------------------------------------------------------------------
# Hojas de estilo
# ---------------------------------------------------------------------------

def _hojas_enlazadas(sopa, base_url):
    """URLs de las hojas del documento, las del propio dominio primero.

    Un sitio corporativo carga su CSS de marca de su propio host y el de las
    librerías de un CDN; si el tope de MAX_HOJAS_CSS se gasta en el bundle de
    un carrusel, la paleta sale de otra empresa.
    """
    propias, externas = [], []
    host = urlparse(base_url).netloc.lower()
    for etiqueta in sopa.find_all("link"):
        rel = " ".join(etiqueta.get("rel") or []).lower()
        tipo = (etiqueta.get("type") or "").lower()
        if "stylesheet" not in rel and "css" not in tipo:
            continue
        href = etiqueta.get("href")
        if not href:
            continue
        url = urljoin(base_url, href)
        destino = urlparse(url).netloc.lower()
        if any(malo in destino for malo in HOSTS_SIN_COLOR):
            continue
        (propias if destino == host else externas).append(url)
    vistas, orden = set(), []
    for url in propias + externas:
        if url not in vistas:
            vistas.add(url)
            orden.append(url)
    return orden[:MAX_HOJAS_CSS]


def _bajar_css(url, verbose=False):
    try:
        respuesta = _get(url)
    except RuntimeError as error:
        if verbose:
            print(f"  [css] no se pudo leer {url}: {error}")
        return ""
    texto = respuesta.text
    if len(texto) > MAX_BYTES_CSS:
        texto = texto[:MAX_BYTES_CSS]
    return texto


# ---------------------------------------------------------------------------
# Nombre de la empresa
# ---------------------------------------------------------------------------

def _sin_tildes(texto):
    plano = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in plano if not unicodedata.combining(c))


RUIDO_TITULO = re.compile(
    r"\b(inicio|home|bienvenidos?|p[aá]gina principal|proyectos de vivienda|"
    r"vivienda nueva|apartamentos? en venta|constructora oficial|sitio oficial|"
    r"official site)\b",
    re.I,
)


def _raiz_dominio(dominio):
    """`www.constructorabolivar.com` -> `constructorabolivar`."""
    host = re.sub(r"^(www|web|home|portal)\.", "", (dominio or "").lower())
    return host.split(".")[0].replace("-", "")


def _limpiar_nombre(texto, dominio=""):
    """Deja el nombre comercial: corta el eslogan y quita el ruido de SEO.

    Un título es "Marca | Eslogan" o "Eslogan - Marca" según el sitio, y no hay
    forma de saber cuál sin mirar afuera: quedarse con la parte más corta
    convierte "Colsubsidio — Vivienda" en "Vivienda". El desempate lo da el
    dominio, que es el nombre que la empresa ya eligió para sí misma; si no
    coincide con ninguna parte se toma la primera, que es donde la ponen casi
    todas las portadas.
    """
    if not texto:
        return ""
    texto = re.sub(r"[®™©℠]", "", texto)        # 'Constructora Cusezar®'
    texto = re.sub(r"\s+", " ", texto).strip()
    partes = [p.strip() for p in re.split(r"\s*[|•·–—]\s*|\s+-\s+", texto) if p.strip()]
    partes = [p for p in partes if not RUIDO_TITULO.fullmatch(p)]
    if partes:
        raiz = _raiz_dominio(dominio)
        texto = partes[0]
        if raiz:
            for parte in partes:
                plano = re.sub(r"[^a-z0-9]", "", _sin_tildes(parte).lower())
                if plano and (plano in raiz or raiz in plano):
                    texto = parte
                    break
    texto = RUIDO_TITULO.sub("", texto).strip(" -–—|·:,.")
    texto = re.sub(r"\s+", " ", texto).strip()
    # Hay sitios cuyo og:site_name es el dominio pelado ('metrocuadrado.com').
    # Como nombre de empresa el TLD sobra, y en minúscula tampoco se ve como un
    # nombre: se le quita y se capitaliza.
    dominio_pelado = re.fullmatch(r"([a-z0-9][a-z0-9-]*)(?:\.[a-z]{2,4}){1,2}", texto)
    if dominio_pelado:
        texto = dominio_pelado.group(1).replace("-", " ").title()
    return texto


def _de_json_ld(sopa):
    """Los bloques `application/ld+json` del documento, ya parseados."""
    bloques = []
    for etiqueta in sopa.find_all("script", attrs={"type": re.compile("ld\\+json", re.I)}):
        crudo = etiqueta.string or etiqueta.get_text() or ""
        try:
            dato = json.loads(crudo)
        except (ValueError, TypeError):
            continue
        bloques.extend(dato if isinstance(dato, list) else [dato])
    # Los sitios anidan sus entidades en @graph.
    expandidos = []
    for bloque in bloques:
        if isinstance(bloque, dict) and isinstance(bloque.get("@graph"), list):
            expandidos.extend(bloque["@graph"])
        expandidos.append(bloque)
    return [b for b in expandidos if isinstance(b, dict)]


TIPOS_ORGANIZACION = (
    "organization", "corporation", "localbusiness", "realestateagent",
    "homeandconstructionbusiness", "generalcontractor", "website",
)


def _es_organizacion(bloque):
    tipo = bloque.get("@type")
    tipos = tipo if isinstance(tipo, list) else [tipo]
    return any(str(t).lower() in TIPOS_ORGANIZACION for t in tipos if t)


def nombre_empresa(sopa, url):
    """(nombre, confianza, evidencia). De más a menos confiable.

    El dominio es el último recurso y nunca falla, así que siempre hay carpeta
    donde guardar: una identidad sin nombre no se puede archivar.
    """
    dominio = urlparse(url).netloc

    def meta(**criterio):
        etiqueta = sopa.find("meta", attrs=criterio)
        return (etiqueta.get("content") or "").strip() if etiqueta else ""

    candidato = meta(property="og:site_name")
    if candidato:
        limpio = _limpiar_nombre(candidato, dominio)
        if limpio:
            return limpio, "alta", "og:site_name"

    for bloque in _de_json_ld(sopa):
        if _es_organizacion(bloque):
            limpio = _limpiar_nombre(str(bloque.get("name") or ""), dominio)
            if limpio:
                return limpio, "alta", f"JSON-LD {bloque.get('@type')}.name"

    for criterio, evidencia in (
        ({"name": "application-name"}, "meta application-name"),
        ({"name": "apple-mobile-web-app-title"}, "meta apple-mobile-web-app-title"),
        ({"itemprop": "name"}, "meta itemprop=name"),
    ):
        limpio = _limpiar_nombre(meta(**criterio), dominio)
        if limpio:
            return limpio, "media", evidencia

    if sopa.title:
        limpio = _limpiar_nombre(sopa.title.get_text(), dominio)
        if limpio:
            return limpio, "media", "<title>"

    # Dominio: 'www.constructorabolivar.com' -> 'Constructorabolivar'. Es feo,
    # pero es el único que no puede fallar, y queda marcado como tal.
    raiz = _raiz_dominio(dominio)
    return raiz.title() or "empresa", "baja", f"dominio: {dominio}"


def nombre_carpeta(nombre):
    """Nombre de empresa -> nombre de carpeta y de archivo.

    Sin tildes ni caracteres que Windows prohíba, con `_` en vez de espacios:
    la carpeta es la llave que el front compone en una URL, y una tilde en una
    ruta servida es una fuente de 404 que no compensa.
    """
    plano = re.sub(r"[^A-Za-z0-9 _-]+", " ", _sin_tildes(nombre))
    plano = re.sub(r"\s+", "_", plano.strip())
    plano = re.sub(r"_+", "_", plano).strip("_-")
    return plano[:60] or "empresa"


# ---------------------------------------------------------------------------
# Logo
# ---------------------------------------------------------------------------

PISTAS_LOGO = re.compile(r"logo|isotipo|logotipo|brand|marca|imagotipo", re.I)

# Lo que se llama "logo" en una cabecera y no es el logo de la empresa: sellos
# de terceros e iconos de la interfaz. No es hipotético — Colsubsidio publica
# "logo pse blanco" y "Logo-Vigilado-Supersalud" en su propio encabezado, y
# Constructora Bolívar marca como logo los iconos del buscador y de WhatsApp.
RUIDO_LOGO = re.compile(
    r"pse|vigilado|supersalud|superfinanciera|icono|icon[-_]|search|buscar|lupa|"
    r"whats|messag|chat|menu|burger|close|cerrar|arrow|flecha|play|compartir|"
    r"facebook|instagram|linkedin|youtube|tiktok|twitter|spotify|visa|mastercard|"
    r"certificad|premio|aliado|patrocin|camacol|fenalco",
    re.I,
)


def _nombra_a_la_empresa(url, empresa, base_url):
    """¿La URL del archivo contiene el nombre de la empresa o su dominio?"""
    plano = re.sub(r"[^a-z0-9]", "", _sin_tildes(url).lower())
    agujas = {_raiz_dominio(urlparse(base_url).netloc)}
    if empresa:
        agujas.add(re.sub(r"[^a-z0-9]", "", _sin_tildes(empresa).lower()))
        # "Constructora Bolívar" también se archiva como "bolivar".
        agujas.update(
            re.sub(r"[^a-z0-9]", "", _sin_tildes(p).lower())
            for p in empresa.split() if len(p) > 4
        )
    return any(aguja and len(aguja) > 3 and aguja in plano for aguja in agujas)


def _atributos_imagen(etiqueta, base_url):
    """La URL real de un <img>: `src`, o el `data-src` del lazy-loading, o el
    primer candidato del `srcset`. Un sitio moderno deja `src` en un
    placeholder y la imagen de verdad en un `data-`."""
    for atributo in ("src", "data-src", "data-lazy-src", "data-original"):
        valor = (etiqueta.get(atributo) or "").strip()
        if valor and not valor.startswith("data:image/gif"):
            return urljoin(base_url, valor)
    srcset = (etiqueta.get("srcset") or etiqueta.get("data-srcset") or "").strip()
    if srcset:
        primero = srcset.split(",")[0].strip().split(" ")[0]
        if primero:
            return urljoin(base_url, primero)
    return ""


def candidatos_logo(sopa, base_url, empresa=""):
    """[(prioridad, tipo, dato, confianza, evidencia), …] ordenado.

    El orden es el de la certeza, no el de la calidad de imagen: primero lo que
    el sitio **declara** como su logo (JSON-LD, og:logo), después lo que se
    parece a uno (un <img class="logo"> en el header), y al final los iconos,
    que son la marca simplificada y sirven cuando no hay nada mejor.
    """
    candidatos = []

    def agregar(prioridad, tipo, dato, confianza, evidencia):
        if dato:
            candidatos.append((prioridad, tipo, dato, confianza, evidencia))

    # 1. El sitio lo declara.
    for bloque in _de_json_ld(sopa):
        publisher = bloque.get("publisher")
        logo = bloque.get("logo")
        if not logo and isinstance(publisher, dict):
            logo = publisher.get("logo")
        if isinstance(logo, dict):
            logo = logo.get("url") or logo.get("contentUrl")
        if isinstance(logo, str) and logo.strip():
            agregar(10, "url", urljoin(base_url, logo.strip()), "alta",
                    f"JSON-LD {bloque.get('@type')}.logo")

    for criterio, evidencia in (
        ({"property": "og:logo"}, "og:logo"),
        ({"itemprop": "logo"}, "meta itemprop=logo"),
    ):
        etiqueta = sopa.find("meta", attrs=criterio)
        if etiqueta and etiqueta.get("content"):
            agregar(12, "url", urljoin(base_url, etiqueta["content"].strip()),
                    "alta", evidencia)

    # 2. Un <img> que se llama a sí mismo logo. Es el caso común. Los del
    #    header van primero: un "logo" en el pie suele ser el de un aliado.
    for etiqueta in sopa.find_all("img"):
        firma = " ".join(
            str(etiqueta.get(a) or "")
            for a in ("id", "class", "alt", "title", "src", "data-src")
        )
        if not PISTAS_LOGO.search(firma):
            continue
        url = _atributos_imagen(etiqueta, base_url)
        if not url:
            continue
        en_cabecera = any(
            p.name in ("header", "nav") or PISTAS_LOGO.search(" ".join(p.get("class") or []))
            for p in etiqueta.parents if getattr(p, "name", None)
        )
        propio = urlparse(url).netloc.lower() == urlparse(base_url).netloc.lower()
        # El nombre del archivo nombra a la empresa (`logo-cusezar.svg` en
        # cusezar.com): es la confirmación más barata que hay de que el
        # candidato es el logo y no el de un aliado.
        nombrado = _nombra_a_la_empresa(url, empresa, base_url)
        ruido = bool(RUIDO_LOGO.search(url))
        prioridad = (20 + (0 if en_cabecera else 4) + (0 if propio else 2)
                     - (3 if nombrado else 0) + (25 if ruido else 0))
        agregar(prioridad, "url", url,
                "media" if ruido else ("alta" if en_cabecera else "media"),
                "<img> con pista de logo"
                + (" en la cabecera" if en_cabecera else "")
                + (" que nombra a la empresa" if nombrado else "")
                + (" (nombre de sello o icono: se deja de último)" if ruido else ""))

    # 3. Un <svg> embebido en la cabecera. Es el logo vectorial de verdad, pero
    #    hay que rasterizarlo; si no hay con qué, `_a_png` lo dice y se sigue.
    for etiqueta in sopa.find_all("svg"):
        firma = " ".join(
            str(etiqueta.get(a) or "") for a in ("id", "class", "aria-label")
        )
        en_cabecera = any(
            p.name in ("header", "nav") for p in etiqueta.parents
            if getattr(p, "name", None)
        )
        if not (PISTAS_LOGO.search(firma) or (en_cabecera and PISTAS_LOGO.search(
                " ".join(str(p.get("class") or "") for p in etiqueta.parents
                         if getattr(p, "get", None))))):
            continue
        marcado = str(etiqueta)
        if "xmlns" not in marcado:
            marcado = marcado.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
        agregar(30, "svg", marcado, "media", "<svg> embebido en la cabecera")

    # 4. Iconos: la marca simplificada. Sirven, y son PNG limpios.
    for etiqueta in sopa.find_all("link"):
        rel = " ".join(etiqueta.get("rel") or []).lower()
        href = (etiqueta.get("href") or "").strip()
        if not href:
            continue
        url = urljoin(base_url, href)
        if "apple-touch-icon" in rel:
            agregar(40, "url", url, "media", "apple-touch-icon")
        elif "icon" in rel and "mask" not in rel:
            tamano = etiqueta.get("sizes") or ""
            grande = bool(re.search(r"(\d{3,})", tamano))
            agregar(45 if grande else 50, "url", url, "baja", f"link rel={rel}")

    # 5. Último recurso: la imagen de compartir y el favicon de la raíz.
    etiqueta = sopa.find("meta", attrs={"property": "og:image"})
    if etiqueta and etiqueta.get("content"):
        agregar(60, "url", urljoin(base_url, etiqueta["content"].strip()),
                "baja", "og:image (imagen de compartir, no necesariamente el logo)")
    partes = urlparse(base_url)
    agregar(70, "url", f"{partes.scheme}://{partes.netloc}/favicon.ico", "baja",
            "favicon.ico de la raíz")

    vistos, unicos = set(), []
    for candidato in sorted(candidatos, key=lambda c: c[0]):
        llave = candidato[2][:200]
        if llave not in vistos:
            vistos.add(llave)
            unicos.append(candidato)
    return unicos


RE_ETIQUETA_SVG = re.compile(r"<svg\b[^>]*>", re.I | re.S)
RE_SCRIPT_SVG = re.compile(r"<script\b.*?</script\s*>", re.I | re.S)
RE_MANEJADOR = re.compile(r"\son[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", re.I)
RE_LARGO = re.compile(r"^([+-]?(?:\d+\.?\d*|\.\d+))")


def _limpiar_svg(marcado):
    """Le quita al SVG lo ejecutable antes de guardarlo.

    El archivo viene de un tercero y lo va a servir nuestro front. Un `<img
    src>` no ejecuta el script de un SVG, pero un front que lo incruste en
    línea —que es justo lo que se hace para recolorearlo con `currentColor`—
    sí. Quitar `<script>` y los `on*` cuesta dos regex y cierra el agujero.
    """
    marcado = RE_SCRIPT_SVG.sub("", marcado)
    marcado = RE_MANEJADOR.sub("", marcado)
    if "xmlns" not in marcado[:600]:
        marcado = RE_ETIQUETA_SVG.sub(
            lambda m: m.group(0).replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1),
            marcado, count=1,
        )
    return marcado.strip()


def _dimensiones_svg(marcado):
    """(ancho, alto) del SVG. El `viewBox` manda sobre `width`/`height`, que
    pueden venir en porcentaje y entonces no dicen nada del tamaño real."""
    etiqueta = RE_ETIQUETA_SVG.search(marcado)
    if not etiqueta:
        return None, None
    abre = etiqueta.group(0)
    caja = re.search(r'viewBox\s*=\s*["\']([^"\']+)["\']', abre, re.I)
    if caja:
        numeros = re.findall(r"[+-]?(?:\d+\.?\d*|\.\d+)", caja.group(1))
        if len(numeros) == 4:
            return round(float(numeros[2]), 2), round(float(numeros[3]), 2)
    medidas = []
    for atributo in ("width", "height"):
        valor = re.search(rf'\b{atributo}\s*=\s*["\']([^"\']+)["\']', abre, re.I)
        numero = RE_LARGO.match(valor.group(1).strip()) if valor else None
        medidas.append(round(float(numero.group(1)), 2) if numero else None)
    return medidas[0], medidas[1]


def _svg_con_raster(png, ancho, alto):
    """Envuelve un PNG en un SVG. Es lo que mantiene una sola extensión.

    No convierte el mapa de bits en vectores —eso no se puede— pero produce un
    `.svg` válido que cualquier navegador pinta igual que el PNG. El JSON dice
    `vectorial: false` y `formato_origen`, así que nadie tiene que adivinar si
    el archivo escala de verdad.
    """
    datos = base64.b64encode(png).decode("ascii")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{ancho}" height="{alto}" '
        f'viewBox="0 0 {ancho} {alto}">'
        f'<image width="{ancho}" height="{alto}" '
        f'href="data:image/png;base64,{datos}"/></svg>'
    )


def _a_svg(datos, content_type=""):
    """Cualquier logo -> SVG estándar. (marcado, meta) o (None, motivo)."""
    if not datos:
        return None, "respuesta vacía"

    es_svg = b"<svg" in datos[:2000].lower() or "svg" in (content_type or "").lower()
    if es_svg:
        marcado = _limpiar_svg(datos.decode("utf-8", errors="replace"))
        if "<svg" not in marcado.lower():
            return None, "el content-type decía SVG pero el cuerpo no lo es"
        ancho, alto = _dimensiones_svg(marcado)
        return marcado, {
            "formato_origen": "svg", "vectorial": True,
            "ancho": ancho, "alto": alto, "bytes": len(marcado.encode("utf-8")),
        }

    if Image is None:
        return None, "Pillow no está instalado: pip install Pillow"
    try:
        with Image.open(io.BytesIO(datos)) as imagen:
            formato_origen = (imagen.format or "?").lower()
            imagen = imagen.convert("RGBA")
            ancho, alto = imagen.size
            if min(ancho, alto) < MIN_LADO_LOGO:
                return None, f"imagen de {ancho}x{alto}: demasiado chica para un logo"
            if max(ancho, alto) > MAX_LADO_LOGO:
                escala = MAX_LADO_LOGO / max(ancho, alto)
                imagen = imagen.resize(
                    (max(1, int(ancho * escala)), max(1, int(alto * escala))),
                    Image.LANCZOS,
                )
                ancho, alto = imagen.size
            crudo = io.BytesIO()
            imagen.save(crudo, format="PNG", optimize=True)
            png = crudo.getvalue()
    except Exception as error:
        return None, f"no se pudo leer como imagen ({type(error).__name__})"

    marcado = _svg_con_raster(png, ancho, alto)
    return marcado, {
        "formato_origen": formato_origen, "vectorial": False,
        "ancho": ancho, "alto": alto, "bytes": len(marcado.encode("utf-8")),
        "_png_interno": png,
    }


# Elementos que pintan algo, y los atributos de los que sale su geometría.
GEOMETRIA_SVG = {
    "path": ("d",), "polygon": ("points",), "polyline": ("points",),
    "rect": ("x", "y", "width", "height"), "circle": ("cx", "cy", "r"),
    "ellipse": ("cx", "cy", "rx", "ry"), "line": ("x1", "y1", "x2", "y2"),
    "text": (), "use": (), "image": (),
}
RE_NUM_SVG = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)")


def _pintura_heredada(etiqueta, propiedad):
    """El `fill` (o `stroke`) que de verdad se aplica a un elemento.

    Hay que subir por los padres: un logo real es `<g fill="#fff">` con quince
    `<path>` adentro, y mirar solo el elemento pintado no encontraría un solo
    color.
    """
    for actual in [etiqueta, *etiqueta.parents]:
        if not getattr(actual, "get", None):
            continue
        en_estilo = re.search(rf"\b{propiedad}\s*:\s*([^;]+)", actual.get("style") or "", re.I)
        valor = (en_estilo.group(1) if en_estilo else actual.get(propiedad)) or ""
        valor = valor.strip()
        if valor:
            return valor
    return ""


def _peso_geometria(etiqueta, por_id, profundidad=0):
    """Cuánto dibujo hace este elemento, en cantidad de coordenadas.

    Es un sustituto del área, no el área: calcularla de verdad pide interpretar
    los comandos relativos de cada `path`. Pero separa lo que hay que separar —
    un logotipo de quince letras trae cientos de coordenadas y una barra
    decorativa trae seis— y eso es lo que decide cuál es el color de la marca.

    `<use href="#id">` se sigue hasta el elemento que referencia: si no, los
    tres `<use>` de un logo real pesarían lo mismo que el logotipo entero.
    """
    nombre = (etiqueta.name or "").lower()
    if nombre == "use" and profundidad < 3:
        referencia = (etiqueta.get("href") or etiqueta.get("xlink:href") or "").strip().lstrip("#")
        destino = por_id.get(referencia)
        if destino is not None:
            return _peso_geometria(destino, por_id, profundidad + 1)
        return 1
    coordenadas = sum(
        len(RE_NUM_SVG.findall(etiqueta.get(atributo) or ""))
        for atributo in GEOMETRIA_SVG.get(nombre, ())
    )
    return max(coordenadas, 1)


def _colores_de_svg(marcado):
    """Counter{hex: peso} de lo que el SVG pinta de verdad."""
    cuenta = Counter()
    try:
        sopa = BeautifulSoup(marcado, "xml")
    except Exception:
        return cuenta
    por_id = {e["id"]: e for e in sopa.find_all(id=True)}
    for etiqueta in sopa.find_all(list(GEOMETRIA_SVG)):
        # Un `<path>` dentro de `<defs>` no se pinta por sí mismo: lo pinta el
        # `<use>` que lo referencia, y contarlo dos veces duplicaría su color.
        if any(getattr(p, "name", "") == "defs" for p in etiqueta.parents):
            continue
        for propiedad in ("fill", "stroke"):
            valor = _pintura_heredada(etiqueta, propiedad)
            if not valor or valor.lower() in ("none", "currentcolor", "transparent"):
                continue
            if valor.lower().startswith("url("):     # gradiente: se lee abajo
                continue
            leidos = _colores_crudos(valor)
            for hexa in leidos:
                cuenta[hexa] += _peso_geometria(etiqueta, por_id)
            if leidos:
                break                                 # el relleno manda sobre el trazo
    # Los gradientes no pintan un elemento sino que lo rellenan: sus paradas
    # son colores de marca igual, pero sin geometría de la que colgarse.
    for parada in sopa.find_all("stop"):
        valor = (parada.get("stop-color")
                 or re.search(r"stop-color\s*:\s*([^;]+)", parada.get("style") or "", re.I))
        if hasattr(valor, "group"):
            valor = valor.group(1)
        for hexa in _colores_crudos(valor or ""):
            cuenta[hexa] += 1
    return cuenta


def colores_del_logo(marcado, vectorial):
    """[(hex, fracción), …]: los colores del logo y cuánto ocupa cada uno.

    Son la paleta más fiable que hay — el CSS de un sitio mezcla el color de la
    marca con el del plugin de turno, pero el logo es solo la marca.

    En un SVG se leen del marcado, así que son el hex exacto que dibujó el
    diseñador. En un ráster hay que cuantizar los píxeles, y los transparentes
    no cuentan: si contaran, todo logo saldría blanco.
    """
    if vectorial:
        cuenta = _colores_de_svg(marcado)
        total = sum(cuenta.values())
        if not total:
            return []
        return [(hexa, n / total) for hexa, n in cuenta.most_common(COLORES_LOGO)
                if n / total >= MIN_FRACCION_LOGO]

    png = marcado
    if Image is None or not png:
        return []
    try:
        with Image.open(io.BytesIO(png)) as imagen:
            imagen = imagen.convert("RGBA")
            imagen.thumbnail((160, 160))
            # `tobytes()` en vez de `getdata()`: el segundo quedó obsoleto en
            # Pillow 12 y desaparece en la 14.
            crudo = imagen.tobytes()
            opacos = [crudo[i:i + 3] for i in range(0, len(crudo), 4) if crudo[i + 3] > 128]
            if not opacos:
                return []
            plano = Image.frombytes("RGB", (len(opacos), 1), b"".join(opacos))
            reducido = plano.quantize(colors=COLORES_LOGO, method=Image.MEDIANCUT)
            paleta = reducido.getpalette() or []
            total = len(opacos)
            salida = []
            for cuenta, indice in reducido.getcolors(1 << 16) or []:
                fraccion = cuenta / total
                if fraccion < MIN_FRACCION_LOGO:
                    continue
                r, g, b = paleta[indice * 3: indice * 3 + 3]
                salida.append((_a_hex(r, g, b), fraccion))
            return sorted(salida, key=lambda c: -c[1])
    except Exception:
        return []


def guardar_logo(candidatos, destino, nombre_base, verbose=False):
    """Baja el primer candidato que se pueda dejar en SVG y lo escribe.

    Se prueban en orden de certeza y se para en el primero que sirva: bajarlos
    todos para elegir "el mejor" costaría una decena de descargas por empresa y
    obligaría a inventar un criterio de calidad que el sitio ya dio al declarar
    cuál es su logo.

    Devuelve (dict del logo, colores del logo). El dict va tal cual al JSON.
    """
    intentos = []
    for _, tipo, dato, confianza, evidencia in candidatos:
        if tipo == "svg":
            crudo, content_type = dato.encode("utf-8"), "image/svg+xml"
            origen = "<svg> embebido en la página"
        else:
            origen = dato
            try:
                respuesta = _get(dato, timeout=25, reintentos=2)
            except RuntimeError as error:
                intentos.append(f"{origen}: {error}")
                continue
            crudo = respuesta.content
            content_type = respuesta.headers.get("Content-Type", "")

        marcado, meta = _a_svg(crudo, content_type)
        if not marcado:
            intentos.append(f"{origen}: {meta}")
            if verbose:
                print(f"  [logo] descartado {origen[:80]} -> {meta}")
            continue

        png_interno = meta.pop("_png_interno", None)
        colores = colores_del_logo(
            png_interno if png_interno is not None else marcado, meta["vectorial"]
        )
        # Un logo casi todo blanco (el de una cabecera oscura) desaparece sobre
        # fondo claro. No se descarta —muchas marcas solo publican ese— pero el
        # front tiene que saber sobre qué pintarlo.
        claro = colores and _hsl(colores[0][0])[2] >= 0.85

        os.makedirs(destino, exist_ok=True)
        archivo = f"{nombre_base}.{FORMATO_LOGO}"
        with open(os.path.join(destino, archivo), "w", encoding="utf-8") as salida:
            salida.write(marcado)

        return {
            "archivo": archivo,
            "origen": origen,
            "fondo_recomendado": "oscuro" if claro else "claro",
            "colores": [{"hex": h, "fraccion": round(f, 3)} for h, f in colores],
            "_confianza": confianza,
            "_evidencia": evidencia,
            "_descartados": intentos[:5],
            **meta,
        }, colores

    return {
        "archivo": None,
        "origen": None,
        "_confianza": None,
        "_evidencia": f"ningún candidato se pudo dejar en {FORMATO_LOGO.upper()}",
        "_descartados": intentos[:8],
    }, []


# ---------------------------------------------------------------------------
# La función que pide el formulario
# ---------------------------------------------------------------------------

def extraer_colores(
    url,
    dir_salida=None,
    max_colores=MAX_COLORES,
    descargar_logo=True,
    guardar=True,
    por_apariciones=False,
    verbose=False,
):
    """Identidad visual de la empresa que vive en `url`.

    Baja el HTML y sus hojas de estilo, cuenta los colores, identifica el
    nombre de la empresa y su logo, y deja todo en

        <dir_salida>/<Empresa>/paleta_<Empresa>.json
        <dir_salida>/<Empresa>/<Empresa>.png

    Devuelve el mismo dict que escribe en el JSON.

    url             lo que la persona escribió en el formulario; el esquema es
                    opcional ('amarilo.com.co' vale).
    dir_salida      raíz donde crear la carpeta. Por defecto, DIR_IDENTIDADES.
    max_colores     cuántos colores lleva `paleta`.
    descargar_logo  False deja `logo` en null y no baja ningún binario.
    guardar         False no escribe nada: solo devuelve el dict. Es lo que
                    necesitará el endpoint HTTP cuando el front lo conecte.
    por_apariciones ordena por la cuenta cruda en vez de por el peso (ver el
                    docstring del módulo).
    """
    url = _normalizar_url(url)
    if verbose:
        print(f"[scrap_identity] {url}")

    respuesta = _get(url)
    html = respuesta.text
    url_final = respuesta.url or url        # el sitio puede redirigir de dominio
    sopa = BeautifulSoup(html, "lxml")

    empresa, confianza_nombre, evidencia_nombre = nombre_empresa(sopa, url_final)
    carpeta = nombre_carpeta(empresa)
    if verbose:
        print(f"  empresa: {empresa}  ({confianza_nombre}: {evidencia_nombre})")

    apariciones, pesos, fuentes_de = Counter(), Counter(), {}

    def anotar(colores, fuente, factor=1.0):
        peso = PESOS[fuente] * factor
        for hexa in colores:
            apariciones[hexa] += 1
            pesos[hexa] += peso
            fuentes_de.setdefault(hexa, set()).add(fuente)

    # 1. El color que la marca declara suyo.
    theme_color = None
    etiqueta = sopa.find("meta", attrs={"name": re.compile("^theme-color$", re.I)})
    if etiqueta and etiqueta.get("content"):
        leidos = _colores_crudos(etiqueta["content"], con_nombres=True)
        if leidos:
            theme_color = leidos[0]
            anotar([theme_color], "theme_color")

    # 2. El CSS que viaja dentro de la página.
    for bloque in sopa.find_all("style"):
        generales, variables = colores_en_texto(bloque.get_text())
        anotar(generales, "estilo_html")
        anotar(variables, "variable_css")
    for etiqueta in sopa.find_all(style=True):
        generales, variables = colores_en_texto(etiqueta["style"])
        anotar(generales, "estilo_html")
        anotar(variables, "variable_css")

    # 3. Los SVG embebidos pintan con atributos, no con CSS.
    for etiqueta in sopa.find_all(["svg", "path", "rect", "circle", "polygon", "stop"]):
        for atributo in ("fill", "stroke", "stop-color"):
            valor = etiqueta.get(atributo)
            if valor and valor.lower() not in ("none", "currentcolor", "transparent"):
                anotar(_colores_crudos(valor), "svg_html")

    # 4. Las hojas enlazadas: es donde está la paleta de verdad.
    hojas = _hojas_enlazadas(sopa, url_final)
    leidas = []
    for hoja in hojas:
        texto = _bajar_css(hoja, verbose=verbose)
        if not texto:
            continue
        leidas.append(hoja)
        generales, variables = colores_en_texto(texto)
        anotar(generales, "hoja_css")
        anotar(variables, "variable_css")
        if verbose:
            print(f"  [css] {len(generales) + len(variables):5d} colores en {hoja}")

    # 5. El logo, que además aporta sus propios colores.
    destino = os.path.join(dir_salida or DIR_IDENTIDADES, carpeta)
    logo, colores_logo = None, []
    if descargar_logo:
        candidatos = candidatos_logo(sopa, url_final, empresa)
        if guardar:
            logo, colores_logo = guardar_logo(candidatos, destino, carpeta, verbose=verbose)
            if verbose:
                print(f"  logo: {logo.get('archivo')} <- {str(logo.get('origen'))[:80]}")
        else:
            # Sin escribir en disco no hay logo, y por tanto tampoco sus
            # colores: la paleta sale solo del CSS. Queda dicho en el JSON.
            logo = {"archivo": None, "_evidencia": "guardar=False: no se bajó el logo",
                    "candidatos": [c[2][:200] for c in candidatos[:5]]}
        # El logo suma peso, no apariciones: no aparece en ningún texto. Cada
        # color entra según la fracción del logo que ocupa.
        for hexa, fraccion in colores_logo:
            pesos[hexa] += PESO_LOGO * fraccion
            fuentes_de.setdefault(hexa, set()).add("logo")

    # --- Orden y roles -----------------------------------------------------
    clave = (lambda h: (apariciones[h], pesos[h])) if por_apariciones \
        else (lambda h: (pesos[h], apariciones[h]))
    ordenados = sorted(pesos, key=lambda h: (-clave(h)[0], -clave(h)[1], h))

    # La paleta se corta en `max_colores`, pero los colores del logo entran
    # siempre. En un sitio montado sobre Bootstrap el bundle declara cien
    # colores de plantilla que pesan más que el de la empresa, y el recorte
    # dejaría fuera justo el color que el logo demuestra que es suyo — con un
    # `primario` que no aparecería en su propia paleta.
    del_logo = [h for h, f in colores_logo if f >= MIN_FRACCION_ROL]
    elegidos = ordenados[:max_colores]
    elegidos += [h for h in del_logo if h not in elegidos]
    elegidos.sort(key=lambda h: (-clave(h)[0], -clave(h)[1], h))

    paleta = []
    for hexa in elegidos:
        tono, saturacion, luminosidad = _hsl(hexa)
        paleta.append({
            "hex": hexa,
            "apariciones": apariciones[hexa],
            "peso": round(pesos[hexa], 2),
            "rol": _rol(hexa),
            "tono": round(tono, 1),
            "saturacion": round(saturacion, 3),
            "luminosidad": round(luminosidad, 3),
            "fuentes": sorted(fuentes_de.get(hexa, ())),
        })

    marca = [c["hex"] for c in paleta if c["rol"] == "marca"]
    neutros = [c["hex"] for c in paleta if c["rol"] == "neutro"]

    # primario / secundario / acento.
    #
    # **El logo manda sobre el CSS**, y eso se aprendió midiendo: en dos de las
    # cuatro constructoras —Constructora Bolívar y Colsubsidio— la hoja de
    # estilos está dominada por las variables por defecto de Bootstrap, y el
    # color más pesado del CSS resultaba ser el azul #0d6efd de la plantilla,
    # no el de la empresa. El logo de las dos, en cambio, trae exactamente su
    # identidad (amarillo y verde; azul y amarillo). Un sitio mete en su CSS el
    # color de cada plugin que instala; en su logo, no.
    #
    # El CSS completa las casillas que el logo deje libres —es lo que salva a
    # una marca de logotipo monocromo, como Cusezar— y se evita repetir tono:
    # dos variantes del mismo azul no son una paleta, el front las pintaría una
    # encima de otra sin que se note.
    def _sirve_de_rol(hexa):
        return _rol(hexa) == "marca" and _hsl(hexa)[2] <= MAX_LUMINOSIDAD_ROL

    destacados = []

    def _proponer(hexa, separacion):
        if hexa in destacados or not _sirve_de_rol(hexa):
            return
        tono = _hsl(hexa)[0]
        if any(_dif_tono(tono, _hsl(otro)[0]) < separacion for otro in destacados):
            return
        destacados.append(hexa)

    for hexa, fraccion in colores_logo:
        if fraccion >= MIN_FRACCION_ROL and len(destacados) < 3:
            _proponer(hexa, SEPARACION_TONO_LOGO)
    for hexa in marca:
        if len(destacados) < 3:
            _proponer(hexa, SEPARACION_TONO)

    claros = [c["hex"] for c in paleta if c["luminosidad"] >= 0.85]
    oscuros = [c["hex"] for c in paleta if c["luminosidad"] <= 0.35]

    identidad = {
        "empresa": empresa,
        "carpeta": carpeta,
        "url": url,
        "url_final": url_final,
        "dominio": urlparse(url_final).netloc,
        "extraido_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "_empresa_confianza": confianza_nombre,
        "_empresa_evidencia": evidencia_nombre,

        "paleta": paleta,
        "marca": marca,
        "neutros": neutros,
        "primario": destacados[0] if destacados else None,
        "secundario": destacados[1] if len(destacados) > 1 else None,
        "acento": destacados[2] if len(destacados) > 2 else None,
        "fondo": claros[0] if claros else "#ffffff",
        "texto": oscuros[0] if oscuros else "#000000",
        "theme_color": theme_color,

        "logo": logo,

        "fuentes": {
            "hojas_css": leidas,
            "hojas_omitidas": [h for h in hojas if h not in leidas],
            "colores_leidos": int(sum(apariciones.values())),
            "colores_distintos": len(pesos),
            "orden": "apariciones" if por_apariciones else "peso",
            "pesos": PESOS | {"logo": PESO_LOGO},
            "frameworks": _frameworks_detectados(pesos),
        },
    }

    if guardar:
        os.makedirs(destino, exist_ok=True)
        ruta_json = os.path.join(destino, f"paleta_{carpeta}.json")
        with open(ruta_json, "w", encoding="utf-8") as salida:
            json.dump(identidad, salida, ensure_ascii=False, indent=2)
        identidad["_ruta_json"] = ruta_json
        if verbose:
            print(f"  -> {ruta_json}")

    return identidad


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _resumen(identidad):
    logo = identidad.get("logo") or {}
    paleta = identidad["paleta"]
    print(f"\n{identidad['empresa']}  ({identidad['dominio']})")
    print(f"  carpeta      : {identidad['carpeta']}/")
    print(f"  primario     : {identidad['primario']}   "
          f"secundario: {identidad['secundario']}   acento: {identidad['acento']}")
    print(f"  fondo/texto  : {identidad['fondo']} / {identidad['texto']}")
    print(f"  logo         : {logo.get('archivo') or '(ninguno)'}"
          f"  [{logo.get('_evidencia')}]")
    print(f"  colores      : {identidad['fuentes']['colores_distintos']} distintos en "
          f"{len(identidad['fuentes']['hojas_css'])} hojas")
    for color in paleta[:8]:
        print(f"    {color['hex']}  {color['rol']:<6} "
              f"apariciones={color['apariciones']:<5} peso={color['peso']:<8} "
              f"{','.join(color['fuentes'])}")


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Extrae la paleta y el logo de una empresa desde su sitio web."
    )
    parser.add_argument("urls", nargs="+", help="una o más URLs de empresa")
    parser.add_argument("--salida", default=None,
                        help=f"raíz donde crear las carpetas (por defecto {DIR_IDENTIDADES})")
    parser.add_argument("--max-colores", type=int, default=MAX_COLORES)
    parser.add_argument("--sin-logo", action="store_true",
                        help="no baja el logo (y entonces tampoco usa sus colores)")
    parser.add_argument("--por-apariciones", action="store_true",
                        help="ordena por la cuenta cruda en vez de por el peso")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    fallos = 0
    for url in args.urls:
        try:
            identidad = extraer_colores(
                url,
                dir_salida=args.salida,
                max_colores=args.max_colores,
                descargar_logo=not args.sin_logo,
                por_apariciones=args.por_apariciones,
                verbose=args.verbose,
            )
            _resumen(identidad)
        except Exception as error:
            fallos += 1
            print(f"\n[error] {url}: {type(error).__name__}: {error}")
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(main())
