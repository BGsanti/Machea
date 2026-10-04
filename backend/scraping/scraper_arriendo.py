"""
scraper_arriendo.py
====================
Catálogo DEMO de inmuebles en arriendo de Bogotá D.C. (vivienda, oficina,
bodega), para la sección de Arriendo de Machea.

Es demo a propósito: por defecto se detiene en 50 inmuebles en total entre
los tres tipos (ver `--tope`). No es el catálogo de venta — ese sigue siendo
`scraper_projects.py` + `proyectos_bogota.json`, sin tocar. Arriendo tiene su
propio contrato (no hay VIS ni cuota de hipoteca en un canon mensual) y su
propio archivo de salida (`Model.rutas.RUTA_ARRIENDO`).

Fuente: Fincaraíz. Cada página de listado (`/arriendo/<tipo>/bogota-dc`) es
Next.js y trae un `<script id="__NEXT_DATA__">` con
`props.pageProps.fetchResult.searchFast.data`: precio, dirección, lat/lon,
área y fotos ya estructurados — mismo patrón que `_next_data()` ya usa para
Colsubsidio en `scraper_projects.py`. Verificado en vivo antes de escribir
esto (1.086 bodegas y 5.329 oficinas en arriendo en Bogotá, 21 por página;
`robots.txt` no bloquea estas páginas de listado).

Uso:
    python -m scraping.scraper_arriendo                 # 50 inmuebles, los 3 tipos
    python -m scraping.scraper_arriendo --tipo bodega
    python -m scraping.scraper_arriendo --tope 20
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

if __package__ in (None, ""):
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scraping.scraper_projects import (
    _get,
    _next_data,
    asignar_barrios,
    localidad_desde_direccion,
)

from Model.catalogos import normalizar_texto
from Model.rutas import RUTA_ARRIENDO

BASE_URL = "https://www.fincaraiz.com.co"

# Slug de Fincaraíz -> nuestro tipo_inmueble. "apartamentos" hace de
# vivienda: con el tope de 50 no vale la pena sumar también "casas".
SLUGS_FINCARAIZ = {
    "vivienda": "apartamentos",
    "oficina": "oficinas",
    "bodega": "bodegas",
}

# 36 por tipo (108 entre los tres): el tope es sobre registros CRUDOS, antes
# de descartar los que no resuelven una localidad de Bogotá (~19% en la
# corrida de referencia), así que el catálogo final ronda 85-90 inmuebles
# reales -- variedad de sobra para la demo sin inventar nada. Fincaraíz tiene
# de lejos para dar ese volumen (1.086 bodegas, 5.329 oficinas, 7.301
# apartamentos en arriendo en Bogotá, verificado en vivo).
TOPE_POR_DEFECTO = 108
# Cada página trae 21 registros, pero entre páginas se repiten fichas (ver
# `scrape_fincaraiz`), así que juntar 36 DISTINTAS pide más de dos. El límite
# es una cota de seguridad para no insistir si Fincaraíz cambia su paginación.
PAGINAS_MAXIMO = 8


def _estrato(item):
    """El estrato, o None si la fuente no lo tiene.

    Fincaraíz publica `110` cuando el inmueble no tiene estrato (es lo normal
    en bodegas y oficinas). Es un centinela, no un valor: pintarlo dejaba
    "Estrato 110" en la ficha, que se lee como un error de la app.
    """
    estrato = item.get("stratum")
    return estrato if isinstance(estrato, int) and 1 <= estrato <= 6 else None


def _ficha(item):
    """La tabla "Detalles de la Propiedad" tal como la publica la ficha.

    Fincaraíz ya la manda rotulada en `technicalSheet` ({field, text, value}),
    así que no hay que inventar etiquetas ni traducir códigos: se copia lo que
    dice la fuente. Los campos vacíos se descartan — en la ficha salen como
    "¡Pregúntale!", que es la ausencia del dato, no un dato.
    """
    ficha = []
    for campo in item.get("technicalSheet") or []:
        valor = (campo.get("value") or "").strip()
        etiqueta = (campo.get("text") or "").strip()
        if not valor or not etiqueta:
            continue
        if campo.get("field") == "stratum" and _estrato(item) is None:
            continue
        ficha.append({"campo": campo.get("field"), "etiqueta": etiqueta, "valor": valor})
    return ficha


def _comodidades(item):
    """Las "Comodidades de la propiedad", con el grupo que les da la ficha
    (Interior, Exterior, Sector, Instalaciones...)."""
    comodidades = []
    for f in item.get("facilities") or []:
        nombre = (f.get("name") or "").strip()
        if nombre:
            comodidades.append({"nombre": nombre, "grupo": (f.get("group") or "").strip()})
    return comodidades


def _registro_fincaraiz(item, tipo_inmueble):
    """Traduce un registro de `searchFast.data` al contrato de arriendo."""
    precio = (item.get("price") or {}).get("amount")
    imagenes = [img.get("image") for img in (item.get("images") or []) if img.get("image")]
    link = item.get("link")
    return {
        "fuente": "fincaraiz",
        # El id de la publicación. Es la llave para no repetir un inmueble:
        # Fincaraíz reordena los resultados entre petición y petición (los
        # avisos pagados rotan), así que la página 2 devuelve fichas que ya
        # habían salido en la 1. Ver `scrape_fincaraiz`.
        "id_origen": item.get("id"),
        "tipo_operacion": "arriendo",
        "tipo_inmueble": tipo_inmueble,
        "nombre": item.get("title"),
        "direccion": item.get("address"),
        "lat": item.get("latitude"),
        "lon": item.get("longitude"),
        "precio_canon_cop": precio,
        "administracion_cop": (item.get("commonExpenses") or {}).get("amount") or None,
        "area_m2": item.get("m2Built") or item.get("m2"),
        "area_privada_m2": item.get("m2apto") or None,
        "habitaciones": item.get("bedrooms") or None,
        "banos": item.get("bathrooms") or None,
        "parqueaderos": item.get("garage") or None,
        "estrato": _estrato(item),
        "piso": item.get("floor") or None,
        "imagenes": imagenes,
        "ficha": _ficha(item),
        "comodidades": _comodidades(item),
        "link_origen": (BASE_URL + link) if link else None,
        "inmobiliaria_publicadora": (item.get("owner") or {}).get("name"),
    }


def _huella(registro):
    """Qué hace a una unidad la MISMA, aunque el aviso sea otro.

    El id de publicación no alcanza: una inmobiliaria republica el mismo
    apartamento con id nuevo, fotos nuevas y hasta otro precio, y los dos
    avisos conviven en el listado. En la Calle 93a #19-50 había cinco avisos
    del mismo edificio y dos eran literalmente la misma unidad.

    La huella es dirección + área + habitaciones, y NO incluye el precio: dos
    avisos del mismo apartamento a $6.800.000 y $7.500.000 siguen siendo el
    mismo apartamento. Tampoco basta la dirección sola: en un edificio hay
    varias unidades distintas en la misma dirección, y colapsarlas borraría
    oferta real (en ese mismo edificio hay un apartaestudio de 65 m² que sí es
    otro inmueble).
    """
    direccion = normalizar_texto(registro.get("direccion") or "")
    if not direccion:
        # Sin dirección no hay con qué comparar: se usa el id, que nunca
        # choca, para que el registro no se descarte por parecido.
        return ("sin-direccion", registro.get("id_origen"))
    return (
        registro.get("tipo_inmueble"),
        direccion,
        registro.get("area_m2"),
        registro.get("habitaciones"),
    )


def scrape_fincaraiz(tipo_inmueble, tope, pagina_maximo=PAGINAS_MAXIMO):
    """Páginas de `/arriendo/<slug>/bogota-dc` hasta juntar `tope` fichas DISTINTAS.

    Se cuenta por `id_origen`, no por posición: Fincaraíz rota los avisos
    pagados entre una petición y la siguiente, así que la página 2 repite
    fichas de la 1. Sin esto, 40 de 95 inmuebles del catálogo eran el mismo
    aviso dos veces, y en pantalla salían tarjetas idénticas seguidas.
    """
    slug = SLUGS_FINCARAIZ[tipo_inmueble]
    registros = []
    vistos = set()
    for pagina in range(1, pagina_maximo + 1):
        # La página va en la RUTA, no como parámetro: `?pagina=N` responde 200
        # y devuelve siempre la primera, sin un solo error que lo delate.
        sufijo = "" if pagina == 1 else f"/pagina{pagina}"
        url = f"{BASE_URL}/arriendo/{slug}/bogota-dc{sufijo}"
        print(f"[fincaraiz] {tipo_inmueble} pagina {pagina}...")
        html = _get(url).text
        datos = _next_data(html)
        if not datos:
            print(f"  [aviso] sin __NEXT_DATA__ en {url}, se detiene aqui")
            break
        try:
            resultado = datos["props"]["pageProps"]["fetchResult"]["searchFast"]
        except (KeyError, TypeError):
            print(f"  [aviso] forma inesperada de __NEXT_DATA__ en {url}, se detiene aqui")
            break
        items = resultado.get("data") or []
        if not items:
            break
        nuevos = 0
        for item in items:
            registro = _registro_fincaraiz(item, tipo_inmueble)
            # Sin id no hay con qué comparar: se cae al enlace de la ficha,
            # que también identifica la publicación.
            clave = registro["id_origen"] or registro["link_origen"]
            if clave in vistos:
                continue
            # La MISMA unidad republicada con otro id (ver `_huella`): dos
            # avisos distintos para el mismo apartamento se ven en pantalla
            # como una tarjeta repetida, que es lo que hay que evitar.
            huella = _huella(registro)
            if huella in vistos:
                continue
            vistos.add(clave)
            vistos.add(huella)
            registros.append(registro)
            nuevos += 1
            if len(registros) >= tope:
                return registros
        print(f"  pagina {pagina}: {nuevos} nuevos de {len(items)} (acumulado {len(registros)})")
        if not (resultado.get("paginatorInfo") or {}).get("hasMorePages"):
            break
    return registros


def construir_catalogo(tipos=None, tope_total=TOPE_POR_DEFECTO):
    """Scrapea, resuelve localidad y numera. Descarta lo que no cae en Bogotá.

    Returns:
        (catalogo, descartados)
    """
    tipos = tipos or list(SLUGS_FINCARAIZ)
    tope_por_tipo = max(1, tope_total // len(tipos))

    crudos = []
    for tipo in tipos:
        crudos += scrape_fincaraiz(tipo, tope_por_tipo)

    catalogo, descartados = [], []
    for registro in crudos:
        veredicto = localidad_desde_direccion(registro["direccion"])
        if veredicto["localidad"] is None:
            descartados.append({**registro, "motivo": veredicto["evidencia"]})
            continue
        registro["Localidad"] = veredicto["localidad"]
        registro["localidad_nombre"] = veredicto["nombre"]
        catalogo.append(registro)

    # El barrio (sector catastral) es lo que permite medir la cercanía en
    # kilómetros por el grafo de barrios, igual que en el catálogo de venta
    # (ver Model/arriendo.py y `score_cercania` en Model/modelo.py).
    catalogo = asignar_barrios(catalogo)

    catalogo.sort(key=lambda r: (r["tipo_inmueble"], normalizar_texto(r["nombre"])))
    for numero, registro in enumerate(catalogo, start=1):
        registro["id_inmueble"] = numero

    return catalogo, descartados


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Catalogo demo de arriendo (Bogota D.C.) desde Fincaraiz."
    )
    parser.add_argument(
        "--tipo", nargs="+", choices=sorted(SLUGS_FINCARAIZ), default=sorted(SLUGS_FINCARAIZ),
        help="tipos de inmueble a traer (por defecto, los tres)",
    )
    parser.add_argument(
        "--tope", type=int, default=TOPE_POR_DEFECTO,
        help="maximo de inmuebles en total entre todos los tipos (demo: 50)",
    )
    parser.add_argument("--salida", default=RUTA_ARRIENDO, help="ruta del JSON de salida")
    args = parser.parse_args(argv)

    catalogo, descartados = construir_catalogo(tipos=args.tipo, tope_total=args.tope)
    if not catalogo:
        print("No se obtuvo ningun inmueble.")
        return 1

    salida = {
        "meta": {
            "generado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "fuente": "fincaraiz",
            "tipos": args.tipo,
            "tope": args.tope,
            "n_inmuebles": len(catalogo),
            "n_descartados": len(descartados),
        },
        "inmuebles": catalogo,
        "descartados": descartados,
    }
    with open(args.salida, "w", encoding="utf-8") as archivo:
        json.dump(salida, archivo, ensure_ascii=False, indent=2)
    print(f"\n[salida] {args.salida} ({len(catalogo)} inmuebles, {len(descartados)} descartados)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
