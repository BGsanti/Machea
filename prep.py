"""
prep.py
=======
Etapa de preparación de datos del recomendador.

Lee `proyectos_seed.json` (datos crudos scrapeados de las fichas de proyecto),
normaliza los campos categóricos y **etiqueta** cada proyecto con el perfil de
comprador al que apunta, de modo que quede en el mismo espacio de features que
el `usuario_modelo` que consume el modelo de Nearest Neighbors:

    perfil_vector = [salario_objetivo, personas_objetivo, edad_objetivo]

El resultado se escribe en `proyectos_model.json`.

Uso:
    python prep.py
    python prep.py --seed otros_datos.json --salida otro_modelo.json
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from datetime import datetime, timezone

from catalogos import (
    LOCALIDADES_BOGOTA,
    ZONAS_COMUNES,
    codigo_tipo_vivienda,
    indice_localidad,
    mapear_zonas,
    nombre_localidad,
    nombre_tipo_vivienda,
    nombres_zonas,
    vector_zonas,
)

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
# El catálogo por defecto es el que produce `scraper_projects.py`. Se mantiene
# el seed manual como respaldo para poder correr prep sin haber scrapeado.
RUTA_CATALOGO = os.path.join(DIRECTORIO, "proyectos_bogota.json")
RUTA_SEED_MANUAL = os.path.join(DIRECTORIO, "proyectos_seed.json")
RUTA_SEED = RUTA_CATALOGO if os.path.exists(RUTA_CATALOGO) else RUTA_SEED_MANUAL
RUTA_MODELO = os.path.join(DIRECTORIO, "proyectos_model.json")

# ---------------------------------------------------------------------------
# Supuestos económicos usados para etiquetar el salario objetivo.
# Están centralizados aquí porque son los parámetros que más se revisan.
# ---------------------------------------------------------------------------
SMMLV = 2_000_000          # Salario mínimo vigente 2026 (COP). Actualizar cada año.
CUOTA_INICIAL = 0.30       # % del precio que aporta el comprador
PLAZO_MESES = 240          # Crédito hipotecario a 20 años
TASA_MENSUAL = 0.01        # ~12.7% E.A.
CAPACIDAD_ENDEUDAMIENTO = 0.30   # La cuota no debe superar el 30% del ingreso
SUBSIDIO_SMMLV = 30        # Subsidio de vivienda aplicable a VIS con caja

# Rangos de salario declarados en el formulario del usuario.
#   1: hasta 2 SMMLV | 2: de 2 a 4 | 3: de 4 a 8 | 4: más de 8
TOPES_SALARIO_SMMLV = [2, 4, 8]

# ---------------------------------------------------------------------------
# Perfiles de amenidades (por índice de ZONAS_COMUNES).
# Sirven como etiquetas cualitativas del proyecto y alimentan la estimación de
# la edad objetivo.
# ---------------------------------------------------------------------------
PERFILES_AMENIDADES = {
    "familiar": {5, 18, 17, 8, 3, 19, 4, 6},
    "joven_profesional": {12, 13, 10, 14, 11, 15, 7, 0},
    "bienestar": {1, 24, 9, 20, 22, 21, 7, 15},
    "practico": {16, 2, 23, 6, 0},
}


# ---------------------------------------------------------------------------
# Utilidades numéricas
# ---------------------------------------------------------------------------
def _percentil(valores_ordenados, fraccion):
    """Percentil por interpolación lineal (evita depender de numpy aquí)."""
    if not valores_ordenados:
        return 0.0
    if len(valores_ordenados) == 1:
        return float(valores_ordenados[0])
    posicion = fraccion * (len(valores_ordenados) - 1)
    inferior = int(posicion)
    superior = min(inferior + 1, len(valores_ordenados) - 1)
    peso = posicion - inferior
    return valores_ordenados[inferior] * (1 - peso) + valores_ordenados[superior] * peso


def _acotar(valor, minimo, maximo):
    return max(minimo, min(maximo, valor))


# ---------------------------------------------------------------------------
# Etiquetado económico
# ---------------------------------------------------------------------------
def cuota_mensual(monto_financiado):
    """Cuota fija de un crédito de anualidad vencida."""
    if monto_financiado <= 0:
        return 0.0
    factor = (1 + TASA_MENSUAL) ** -PLAZO_MESES
    return monto_financiado * TASA_MENSUAL / (1 - factor)


def ingreso_requerido_smmlv(precio, aplica_subsidio=False):
    """Ingreso familiar necesario, en SMMLV, para comprar el proyecto.

    Se descuenta la cuota inicial, se calcula la cuota del crédito y se exige
    que esa cuota no supere `CAPACIDAD_ENDEUDAMIENTO` del ingreso.
    """
    precio_efectivo = float(precio or 0)
    if aplica_subsidio:
        precio_efectivo = max(0.0, precio_efectivo - SUBSIDIO_SMMLV * SMMLV)
    financiado = precio_efectivo * (1 - CUOTA_INICIAL)
    ingreso = cuota_mensual(financiado) / CAPACIDAD_ENDEUDAMIENTO
    return ingreso / SMMLV


def rango_salario(ingreso_smmlv):
    """Traduce un ingreso en SMMLV al código 1..4 del formulario."""
    for codigo, tope in enumerate(TOPES_SALARIO_SMMLV, start=1):
        if ingreso_smmlv <= tope:
            return codigo
    return 4


# ---------------------------------------------------------------------------
# Etiquetado de habitaciones / capacidad
# ---------------------------------------------------------------------------
def codificar_habitaciones(habitaciones):
    """Devuelve (min, max, codigo 1..3) donde 3 significa '3 o más'.

    Acepta la lista de tipologías del seed manual y también el entero único
    del catálogo scrapeado, que ya viene codificado 1..3.
    """
    if isinstance(habitaciones, (int, float)) and not isinstance(habitaciones, bool):
        habitaciones = [habitaciones]
    valores = [int(h) for h in (habitaciones or []) if isinstance(h, (int, float))]
    if not valores:
        return None, None, 1
    return min(valores), max(valores), _acotar(max(valores), 1, 3)


def personas_objetivo(codigo_habitaciones, area_m2):
    """Tamaño de hogar al que apunta el inmueble (1..4, donde 4 es '4 o más').

    Parte del número de habitaciones y ajusta por área: un 2 habitaciones de
    60 m² alberga cómodamente a un hogar más grande que uno de 40 m².
    """
    base = {1: 1, 2: 2, 3: 4}.get(codigo_habitaciones, 2)
    area = float(area_m2 or 0)
    if area >= 55 and base < 4:
        base += 1
    elif 0 < area < 32 and base > 1:
        base -= 1
    return _acotar(base, 1, 4)


# ---------------------------------------------------------------------------
# Etiquetado de perfil de amenidades y edad
# ---------------------------------------------------------------------------
def perfil_amenidades(indices_zonas):
    """Cobertura [0..1] de cada perfil cualitativo según las zonas comunes."""
    presentes = set(indices_zonas)
    return {
        nombre: round(len(presentes & conjunto) / len(conjunto), 4)
        for nombre, conjunto in PERFILES_AMENIDADES.items()
    }


def edad_objetivo(personas, perfiles, salario_obj, codigo_habitaciones, area_m2):
    """Edad estimada del comprador tipo.

    Heurística explícita y auditable (no hay histórico todavía para aprenderla):
      - la etapa familiar es el factor dominante: más habitaciones y más
        personas a cargo desplazan la edad hacia arriba;
      - amenidades de perfil joven (coworking, sala VIP, zona cool) la bajan;
      - amenidades de bienestar (sauna, spa, pista de trote) la suben;
      - mayor poder adquisitivo correlaciona con mayor edad.
    """
    edad = 30.0
    edad += 4.0 * (personas - 1)
    edad -= 6.0 * perfiles["joven_profesional"]
    edad += 5.0 * perfiles["bienestar"]
    edad += 1.5 * (salario_obj - 2)
    if codigo_habitaciones == 1 and float(area_m2 or 0) < 35:
        edad -= 2.0          # aparta-estudio: típicamente primer comprador
    return int(round(_acotar(edad, 25, 55)))


# ---------------------------------------------------------------------------
# Transformación de un proyecto
# ---------------------------------------------------------------------------
# El seed original y el catálogo que produce `scraper_projects.py` nombran los
# mismos datos distinto: el seed viene del volcado manual y el catálogo sigue
# el contrato del formulario. En vez de duplicar campos en el JSON, prep lee
# cualquiera de los dos nombres.
_ALIAS_CAMPOS = {
    "localidad": ("localidad", "Localidad"),
    "amenidades_entorno": ("amenidades_entorno", "zonas_comunes"),
    "area_construida_m2": ("area_construida_m2", "area_desde_m2"),
    "habitaciones_ofrecidas": ("habitaciones_ofrecidas", "numero_habitaciones"),
    "url_ficha": ("url_ficha", "link_proyecto"),
}


def _campo(crudo, nombre):
    """Valor del campo `nombre`, aceptando los alias del catálogo scrapeado."""
    for llave in _ALIAS_CAMPOS.get(nombre, (nombre,)):
        valor = crudo.get(llave)
        if valor not in (None, "", []):
            return valor
    return None


def preparar_proyecto(crudo, avisos):
    """Convierte un registro crudo del seed en un registro etiquetado."""
    id_proyecto = crudo.get("id_proyecto")

    tipo_cod = codigo_tipo_vivienda(crudo.get("tipo_vivienda"))
    if tipo_cod is None:
        avisos["tipo_vivienda_desconocido"].append(
            f"{id_proyecto}: {crudo.get('tipo_vivienda')!r}"
        )

    localidad_id = indice_localidad(_campo(crudo, "localidad"))
    if localidad_id is None:
        avisos["localidad_desconocida"].append(
            f"{id_proyecto}: {_campo(crudo, 'localidad')!r}"
        )

    zonas_idx, zonas_desconocidas = mapear_zonas(_campo(crudo, "amenidades_entorno"))
    for zona in zonas_desconocidas:
        avisos["amenidad_desconocida"].append(f"{id_proyecto}: {zona!r}")

    hab_min, hab_max, hab_cod = codificar_habitaciones(_campo(crudo, "habitaciones_ofrecidas"))
    area = float(_campo(crudo, "area_construida_m2") or 0)
    precio = float(crudo.get("precio_desde_cop") or 0)
    aplica_subsidio = bool(crudo.get("aplica_subsidio_caja"))

    ingreso_smmlv = ingreso_requerido_smmlv(precio, aplica_subsidio=False)
    ingreso_smmlv_sub = ingreso_requerido_smmlv(
        precio, aplica_subsidio=aplica_subsidio and tipo_cod == 1
    )
    salario_obj = rango_salario(ingreso_smmlv)
    salario_obj_sub = rango_salario(ingreso_smmlv_sub)

    personas_obj = personas_objetivo(hab_cod, area)
    perfiles = perfil_amenidades(zonas_idx)
    edad_obj = edad_objetivo(personas_obj, perfiles, salario_obj, hab_cod, area)
    perfil_dominante = max(perfiles, key=perfiles.get) if any(perfiles.values()) else None

    return {
        # --- identificación y datos de presentación ---
        "id_proyecto": id_proyecto,
        "nombre_proyecto": crudo.get("nombre_proyecto"),
        "direccion": crudo.get("direccion"),
        "url_ficha": _campo(crudo, "url_ficha"),
        # Los proyectos que publican dos constructoras traen la segunda ficha.
        # Viaja hasta la respuesta del front, porque el precio difiere entre
        # las dos y el usuario debe poder ver ambas.
        "constructoras": crudo.get("constructoras") or [],
        "links_alternos": crudo.get("links_alternos") or [],
        "precio_desde_cop": precio,
        "area_construida_m2": area,
        "aplica_subsidio_caja": aplica_subsidio,
        "direccion_es_aproximada": bool(crudo.get("_direccion_es_aproximada")),

        # --- claves del filtro duro ---
        "tipo_vivienda": nombre_tipo_vivienda(tipo_cod),
        "tipo_vivienda_cod": tipo_cod,
        "localidad": nombre_localidad(localidad_id) or crudo.get("localidad"),
        "localidad_id": localidad_id,
        "zonas_comunes": nombres_zonas(zonas_idx),
        "zonas_comunes_idx": zonas_idx,
        "zonas_comunes_vector": vector_zonas(zonas_idx),
        "n_zonas_comunes": len(zonas_idx),

        # --- etiquetas derivadas ---
        "habitaciones_min": hab_min,
        "habitaciones_max": hab_max,
        "habitaciones_cod": hab_cod,
        "precio_por_m2": round(precio / area, 2) if area else None,
        "ingreso_requerido_smmlv": round(ingreso_smmlv, 2),
        "ingreso_requerido_cop": round(ingreso_smmlv * SMMLV),
        "cuota_mensual_estimada_cop": round(cuota_mensual(precio * (1 - CUOTA_INICIAL))),
        "ingreso_requerido_smmlv_con_subsidio": round(ingreso_smmlv_sub, 2),
        "salario_objetivo_con_subsidio": salario_obj_sub,
        "perfil_amenidades": perfiles,
        "perfil_dominante": perfil_dominante,

        # --- espacio de features del modelo ---
        "salario_objetivo": salario_obj,
        "personas_objetivo": personas_obj,
        "edad_objetivo": edad_obj,
        "perfil_vector": [salario_obj, personas_obj, edad_obj],
    }


def etiquetar_segmento_precio(proyectos):
    """Añade `segmento_precio` usando terciles del precio por m² del dataset."""
    valores = sorted(p["precio_por_m2"] for p in proyectos if p["precio_por_m2"])
    corte_bajo = _percentil(valores, 1 / 3)
    corte_alto = _percentil(valores, 2 / 3)
    for proyecto in proyectos:
        valor = proyecto["precio_por_m2"]
        if not valor:
            proyecto["segmento_precio"] = None
        elif valor <= corte_bajo:
            proyecto["segmento_precio"] = "economico"
        elif valor <= corte_alto:
            proyecto["segmento_precio"] = "medio"
        else:
            proyecto["segmento_precio"] = "alto"
    return {"tercil_bajo": round(corte_bajo, 2), "tercil_alto": round(corte_alto, 2)}


# ---------------------------------------------------------------------------
# Orquestación
# ---------------------------------------------------------------------------
def preparar(ruta_seed=RUTA_SEED, ruta_salida=RUTA_MODELO, verbose=True):
    """Lee el seed, etiqueta todos los proyectos y escribe `proyectos_model.json`."""
    with open(ruta_seed, "r", encoding="utf-8") as archivo:
        crudos = json.load(archivo)
    if isinstance(crudos, dict):
        crudos = crudos.get("proyectos", [])

    avisos = {
        "tipo_vivienda_desconocido": [],
        "localidad_desconocida": [],
        "amenidad_desconocida": [],
    }
    proyectos = [preparar_proyecto(crudo, avisos) for crudo in crudos]
    cortes_precio = etiquetar_segmento_precio(proyectos)

    salida = {
        "meta": {
            "generado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "fuente": os.path.basename(ruta_seed),
            "n_proyectos": len(proyectos),
            "smmlv": SMMLV,
            "supuestos_credito": {
                "cuota_inicial": CUOTA_INICIAL,
                "plazo_meses": PLAZO_MESES,
                "tasa_mensual": TASA_MENSUAL,
                "capacidad_endeudamiento": CAPACIDAD_ENDEUDAMIENTO,
                "subsidio_smmlv": SUBSIDIO_SMMLV,
            },
            "cortes_precio_m2": cortes_precio,
            "features_modelo": ["salario_objetivo", "personas_objetivo", "edad_objetivo"],
            "localidades_bogota": LOCALIDADES_BOGOTA,
            "zonas_comunes": ZONAS_COMUNES,
            "avisos": {k: v for k, v in avisos.items() if v},
        },
        "proyectos": proyectos,
    }

    with open(ruta_salida, "w", encoding="utf-8") as archivo:
        json.dump(salida, archivo, ensure_ascii=False, indent=2)

    if verbose:
        _reporte(salida, ruta_salida)
    return salida


def _reporte(salida, ruta_salida):
    proyectos = salida["proyectos"]
    print(f"[prep] {len(proyectos)} proyectos -> {os.path.basename(ruta_salida)}")
    print(f"[prep] tipo_vivienda   : {dict(Counter(p['tipo_vivienda'] for p in proyectos))}")
    print(f"[prep] localidades     : {len({p['localidad_id'] for p in proyectos})} de 20 con oferta")
    print(f"[prep] salario_objetivo: {dict(sorted(Counter(p['salario_objetivo'] for p in proyectos).items()))}")
    print(f"[prep] personas_objetivo: {dict(sorted(Counter(p['personas_objetivo'] for p in proyectos).items()))}")
    edades = [p["edad_objetivo"] for p in proyectos]
    print(f"[prep] edad_objetivo   : min={min(edades)} max={max(edades)} media={sum(edades)/len(edades):.1f}")
    print(f"[prep] perfil_dominante: {dict(Counter(p['perfil_dominante'] for p in proyectos))}")
    for clave, mensajes in salida["meta"]["avisos"].items():
        print(f"[prep] AVISO {clave}: {mensajes}")


def main():
    parser = argparse.ArgumentParser(description="Prepara y etiqueta los proyectos para el modelo.")
    parser.add_argument("--seed", default=RUTA_SEED, help="Ruta del JSON crudo de entrada.")
    parser.add_argument("--salida", default=RUTA_MODELO, help="Ruta del JSON etiquetado de salida.")
    args = parser.parse_args()
    preparar(args.seed, args.salida)


if __name__ == "__main__":
    main()
