"""
features/formulario_personalizado/armar.py
==========================================
El diseño completo del formulario personalizado de una empresa, a partir de su
marca (`scrap_identity`, vía `api/demo.extraer_marca`) y de sus proyectos
(`scrap_proyectos`).

Es una función pura: no baja nada ni toca el disco. Recibe lo que ya se
extrajo y devuelve un dict con las MISMAS formas que el formulario
(`frontend/public/experiencia/`) ya sabe leer:

    marca       la forma de `window.GDF_MARCA` (tenants/<slug>/marca.js), con la
                llave `demo` que hoy arma js/demo.js: con ella tema.js pinta los
                colores de la empresa sin cambiar una línea.
    proyectos   la forma de `window.GDF_PROYECTOS` (tenants/<slug>/proyectos.js).
    formulario  qué opciones tienen sentido para lo que esta empresa vende
                (tipo de propiedad, VIS/No VIS, zonas, habitaciones, amenidades).
    diseno      el espacio de Santiago Dias: tokens sugeridos con su contraste y
                la lista de decisiones de diseño que quedan abiertas.

El contrato campo por campo está en CONTRATO.md, al lado de este archivo.

Por qué vive en `features/` y no en `api/`: no decide qué se recomienda
(invariante 8) y no sabe de HTTP. `api/formulario_personalizado.py` es quien le
pasa los datos, el token y las URLs.
"""

from __future__ import annotations

import html
from collections import Counter
from typing import Any, Callable, Dict, List, Optional

VERSION = 1
RESPONSABLE_DISENO = "Santiago Dias"

# La superficie y la tinta de Machea (js/tema.js, SUPERFICIE_MACHEA): el
# formulario personalizado se monta hoy sobre el tenant `machea`.
FONDO_MACHEA = "#fdf6f0"
TINTA_MACHEA = "#2d3b4e"
CORAL_MACHEA = "#ff6259"

# Lo que el scraper llama "tipo" y lo que el formulario pregunta en
# `tipo_propiedad` (js/data.js, TIPO_PROPIEDAD). Consultorios y locales se
# arriendan como oficinas en ese formulario; lotes y hotelero no tienen opción.
TIPO_A_PROPIEDAD = {
    "vivienda": "Vivienda",
    "oficinas": "Oficinas",
    "consultorios": "Oficinas",
    "locales": "Oficinas",
    "bodegas": "Bodegas",
}

ESTADOS = ("completo", "sin_proyectos", "esperando_proyectos", "solo_marca")


# ---------------------------------------------------------------------------
# Color
# ---------------------------------------------------------------------------

def _luminancia(hexa: str) -> float:
    r, g, b = (int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5))
    lineal = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in (r, g, b)]
    return 0.2126 * lineal[0] + 0.7152 * lineal[1] + 0.0722 * lineal[2]


def contraste(a: str, b: str) -> float:
    """Razón de contraste WCAG entre dos colores #rrggbb."""
    la, lb = sorted((_luminancia(a), _luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def texto_sobre(hexa: str) -> str:
    """Blanco o casi negro: el que más contraste haga sobre `hexa`."""
    return "#ffffff" if contraste(hexa, "#ffffff") >= contraste(hexa, "#111111") else "#111111"


def tokens_sugeridos(primario: str, acento: Optional[str], tinta: str = TINTA_MACHEA,
                     fondo: str = FONDO_MACHEA) -> Dict[str, Any]:
    """Las custom properties que el diseño puede usar tal cual, con su contraste medido."""
    acento = acento or primario
    sobre_primario = texto_sobre(primario)
    return {
        "--primario": primario,
        "--acento": acento,
        "--tinta": tinta,
        "--fondo": fondo,
        "--texto-sobre-primario": sobre_primario,
        "--texto-sobre-acento": texto_sobre(acento),
        "_contraste": {
            "texto_sobre_primario": round(contraste(primario, sobre_primario), 2),
            "primario_sobre_fondo": round(contraste(primario, fondo), 2),
            "tinta_sobre_fondo": round(contraste(tinta, fondo), 2),
            # 4,5 para texto normal, 3 para texto grande y para bordes de controles (WCAG AA).
            "boton_aa_texto_normal": contraste(primario, sobre_primario) >= 4.5,
            "primario_como_texto_aa": contraste(primario, fondo) >= 4.5,
        },
    }


# ---------------------------------------------------------------------------
# Proyectos en la forma de GDF_PROYECTOS
# ---------------------------------------------------------------------------

def proyecto_para_el_front(p: Dict[str, Any], url_imagen: Callable[[Dict, Dict], str]) -> Dict[str, Any]:
    """Una ficha de `scrap_proyectos` con las llaves de tenants/<slug>/proyectos.js.

    Las llaves que el front ya lee van con su nombre de siempre (`name`, `price`,
    `hab`, `vis`, `galeria`…). Las que agrega el sitio de la empresa (`tipo`,
    `segmento`, `colores`…) van aparte: el front ignora las que no conoce.
    """
    habitaciones = p.get("habitaciones") or []
    banos = p.get("banos") or []
    area = p.get("area_m2") or {}
    galeria = [{"url": url_imagen(p, imagen), "label": "Foto del proyecto", "clave": "", "tipo": "proyecto"}
               for imagen in p.get("imagenes") or [] if imagen.get("archivo") or imagen.get("origen")]
    localidad = (p.get("localidad") or {}).get("nombre") if isinstance(p.get("localidad"), dict) else None
    return {
        "id": p.get("id_proyecto"),
        "name": p.get("nombre") or "",
        "direccion": p.get("direccion") or "",
        "barrio": "",
        "localidad": localidad or "",
        "ciudad": p.get("ciudad") or "",
        "muni": p.get("ciudad") or "",
        "price": p.get("precio_desde_cop") or 0,
        "area": area.get("desde") or 0,
        "hab": min(habitaciones) if habitaciones else 0,
        "habMax": max(habitaciones) if habitaciones else 0,
        "banos": min(banos) if banos else 0,
        # VIS y VIP son las dos de interés social: las dos aplican subsidio. Sin segmento escrito, False.
        "vis": p.get("segmento") in ("VIS", "VIP"),
        "image": galeria[0]["url"] if galeria else "",
        "url": p.get("url") or "",
        "amenidades": [{"label": z, "icon": "", "clave": z} for z in p.get("zonas_comunes") or []],
        "galeria": galeria,
        "tipologias": [],
        "tour360": "",
        "video": "",
        # --- Del sitio de la empresa (scrap_proyectos). El front de hoy no las lee. ---
        "tipo": p.get("tipo"),
        "tipos": p.get("tipos") or [],
        "segmento": p.get("segmento"),
        "operacion": p.get("operacion") or [],
        "estado_obra": p.get("estado_obra"),
        "precio_es_canon": bool(p.get("precio_es_canon")),
        "areaHasta": area.get("hasta") or 0,
        "lat": p.get("lat"),
        "lon": p.get("lon"),
        "colores": {"primario": p.get("primario"), "secundario": p.get("secundario"),
                    "acento": p.get("acento"), "principales": p.get("colores_principales") or []},
        "_fuentes": {"nombre": "sitio de la empresa", "ficha": p.get("url") or ""},
    }


# ---------------------------------------------------------------------------
# Qué preguntar
# ---------------------------------------------------------------------------

def opciones_del_formulario(proyectos: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Las opciones que tienen sentido para lo que esta empresa vende.

    Son sugerencias para el diseño: el formulario de hoy arma sus preguntas en
    js/data.js y todavía no las lee. Los ids son los de ahí (`operacion`,
    `tipo_propiedad`, `tipo`, `zona`, `habitaciones`, `entorno_deseado`).
    """
    if not proyectos:
        return {"_nota": "sin proyectos: el formulario sale completo, como el de Machea", "preguntas": {}}
    operaciones = Counter(o for p in proyectos for o in (p.get("operacion") or []))
    propiedades = []
    for p in proyectos:
        for t in p.get("tipos") or []:
            opcion = TIPO_A_PROPIEDAD.get(t)
            if opcion and opcion not in propiedades:
                propiedades.append(opcion)
    segmentos = {p.get("segmento") for p in proyectos if p.get("segmento")}
    tipo_vivienda = []
    if segmentos & {"VIS", "VIP"}:
        tipo_vivienda.append("VIS")
    if "No VIS" in segmentos:
        tipo_vivienda.append("No VIS")
    ciudades = Counter(p.get("ciudad") for p in proyectos if p.get("ciudad"))
    localidades = sorted({(p.get("localidad") or {}).get("nombre") for p in proyectos
                          if isinstance(p.get("localidad"), dict) and p["localidad"].get("nombre")})
    solo_bogota = set(ciudades) == {"Bogotá"}
    habitaciones = sorted({h for p in proyectos for h in p.get("habitaciones") or []})
    amenidades = Counter(z for p in proyectos for z in p.get("zonas_comunes") or [])
    precios = [p["precio_desde_cop"] for p in proyectos if p.get("precio_desde_cop") and not p.get("precio_es_canon")]
    canones = [p["precio_desde_cop"] for p in proyectos if p.get("precio_desde_cop") and p.get("precio_es_canon")]
    return {
        "_nota": "sugerencias para el diseño; los ids son los de js/data.js",
        "preguntas": {
            "operacion": {"opciones": [o for o in ("compra", "arriendo")
                                       if (o == "compra" and operaciones.get("venta")) or operaciones.get(o)]
                          or ["compra", "arriendo"]},
            "tipo_propiedad": {"opciones": propiedades or ["Vivienda"]},
            # Sin ningún segmento escrito no se sabe: van las dos, como hoy.
            "tipo": {"opciones": tipo_vivienda or ["VIS", "No VIS"],
                     "_evidencia": "segmentos escritos en las fichas" if tipo_vivienda else "ninguna ficha lo escribe"},
            "zona": {"campo": "localidad" if solo_bogota and localidades else "ciudad",
                     "opciones": localidades if solo_bogota and localidades else [c for c, _ in ciudades.most_common()]},
            "habitaciones": {"opciones": habitaciones},
            "entorno_deseado": {"amenidades": [z for z, _ in amenidades.most_common()]},
        },
        "rango_precios": {"desde": min(precios), "hasta": max(precios)} if precios else None,
        "rango_canon": {"desde": min(canones), "hasta": max(canones)} if canones else None,
    }


# ---------------------------------------------------------------------------
# El diseño completo
# ---------------------------------------------------------------------------

def _estado(catalogo: Optional[Dict[str, Any]], estado_proyectos: Optional[str]) -> str:
    if catalogo is not None:
        return "completo" if catalogo.get("proyectos") else "sin_proyectos"
    if estado_proyectos in ("en_cola", "extrayendo", "ocupado"):
        return "esperando_proyectos"
    return "solo_marca"


def armar_formulario(
    marca: Dict[str, Any],
    tipo: str = "inmobiliaria",
    catalogo: Optional[Dict[str, Any]] = None,
    estado_proyectos: Optional[str] = None,
    token: Optional[str] = None,
    logo_url: str = "",
    url_imagen: Optional[Callable[[Dict, Dict], str]] = None,
    demo_url: Optional[str] = None,
) -> Dict[str, Any]:
    """El diseño completo del formulario personalizado.

    marca             {nombre, primario, acento, host, fondo_logo, detectado, …}: lo que
                      devuelve `api/demo.extraer_marca` o lo que se lee del token firmado.
    tipo              'inmobiliaria' o 'constructora'.
    catalogo          el JSON de `scrap_proyectos` (o None si todavía no existe).
    estado_proyectos  el de `api/proyectos_web.programar`, para decir si hay que esperar.
    logo_url          dónde pedir el logo (en la API: /api/marca/logo?d=<token>).
    url_imagen(p, i)  dónde pedir cada foto; por defecto, su URL de origen.
    """
    url_imagen = url_imagen or (lambda _p, imagen: imagen.get("origen") or "")
    nombre = marca.get("nombre") or "Tu empresa"
    host = (marca.get("host") or (catalogo or {}).get("dominio") or "").lower()
    primario = (marca.get("primario") or CORAL_MACHEA).lower()
    acento = (marca.get("acento") or "").lower() or None
    proyectos_crudos = (catalogo or {}).get("proyectos") or []
    proyectos = [proyecto_para_el_front(p, url_imagen) for p in proyectos_crudos]
    formulario = opciones_del_formulario(proyectos_crudos)
    zona = (formulario.get("preguntas") or {}).get("zona") or {}
    vende = ((catalogo or {}).get("que_vende") or {}).get("principal")
    nombre_html = html.escape(nombre)
    sitio = f"https://{host}" if host else ""

    marca_front = {
        "slug": "machea",                     # la estructura y la superficie clara de Machea
        "version": 2,
        "constructora": "",
        "personalizado": True,
        "identidad": {"nombre": nombre, "dominio": host, "sitio": sitio, "logo": logo_url, "marcaChica": ""},
        "paleta": {"primario": primario, "acento": acento or primario, "tinta": TINTA_MACHEA},
        "tipografia": {"titulos": "Poppins", "cuerpo": "Manrope"},
        "copy": {
            "splashTitulo": "Encuentra tu próxima oficina" if vende == "oficinas" else "Encuentra tu próximo hogar",
            "splashLead": f"Responde jugando y descubre qué encaja contigo, con <strong>{nombre_html}</strong>.",
            # El mismo texto que js/demo.js: es una demostración de Machea, no el sitio de la empresa.
            "habeasData": ("Autorizo el tratamiento de mis datos personales para esta demostración de Machea, "
                           "incluida la llamada de prueba de Manuela y mi contacto por correo o WhatsApp (Habeas Data)."),
            "disclaimerCatalogo": (f"Datos tomados de las fichas publicadas en {html.escape(host)}. Demostración."
                                   if host else "Demostración."),
            "fichaOficial": "Ver ficha oficial ↗",
            "sinPlanos": "Aún no tenemos los planos de este proyecto.",
        },
        "geo": {
            "ciudades": [c for c in {p["ciudad"]: None for p in proyectos if p["ciudad"]}] or ["Bogotá"],
            "campoUbicacion": zona.get("campo") or "localidad",
            "etiquetaZona": zona.get("campo") or "localidad",
            "vecindad": "distrito",
            "zonas": zona.get("opciones") or [],
        },
        "negocio": {"tipo": "privada"},
        "portada": {"modo": "generica"},
        # Lo mismo que arma js/demo.js al leer ?demo=<token>: tema.js pinta con esto.
        "demo": {"nombre": nombre, "tipo": tipo, "primario": primario, "acento": acento,
                 "tieneLogo": bool(logo_url), "fondoLogo": marca.get("fondo_logo") or "claro",
                 "host": host, "token": token},
    }

    portada = next((g["url"] for p in proyectos for g in p["galeria"][:1]), None)
    return {
        "version": VERSION,
        "estado": _estado(catalogo, estado_proyectos),
        "estado_proyectos": estado_proyectos,
        "empresa": {"nombre": nombre, "tipo": tipo, "sitio": sitio, "dominio": host,
                    # None cuando el diseño se rearma desde el token: el token no lo guarda.
                    "marca_detectada": marca.get("detectado"),
                    "que_vende": (catalogo or {}).get("que_vende")},
        "demo_url": demo_url,
        "marca": marca_front,
        "proyectos": proyectos,
        "formulario": formulario,
        "diseno": {
            "responsable": RESPONSABLE_DISENO,
            "estado": "pendiente",
            "base_actual": "tenant machea (superficie clara) con los colores de la empresa: "
                           "lo que hoy pintan js/demo.js y js/tema.js",
            "tokens_sugeridos": tokens_sugeridos(primario, acento),
            "imagen_destacada": portada,
            "decisiones_abiertas": [
                "tipografía: el sitio de la empresa no se lee para esto; hoy Poppins y Manrope",
                "superficie: la clara de Machea o una propia de la marca",
                "portada: genérica o con la foto del proyecto destacado",
                "cómo se ven los proyectos de la empresa en los resultados (galería, precio, segmento)",
                "qué hacer cuando el texto sobre el primario no llega a AA (ver tokens_sugeridos._contraste)",
                "si las opciones de `formulario` recortan las preguntas o solo las ordenan",
            ],
            "contrato": "backend/features/formulario_personalizado/CONTRATO.md",
        },
        "_incompleto": bool((catalogo or {}).get("incompleto")),
    }
