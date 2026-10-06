"""
Model/arriendo.py
=================
Match de Arriendo (vivienda, oficina, bodega) sobre el catálogo demo de
`scraping/scraper_arriendo.py`.

Es la misma mecánica que `modelo.py` usa en Compra, aplicada a lo que sí tiene
sentido en un canon mensual:

  - CERCANÍA a la zona elegida en el mapa. Es la pieza que manda: se mide en
    kilómetros por el grafo de barrios cuando el usuario marcó un sector y el
    inmueble tiene barrio (`distancia_barrios`), y por saltos de localidad si
    no. Se puntúa con el MISMO `score_cercania` de Compra, y con varias zonas
    elegidas gana la más cercana de todas (BFS multi-origen, como en Compra).
  - PERFIL, solo en Vivienda: un `NearestNeighbors` sobre las preferencias que
    el quiz sí pregunta (habitaciones, baños, parqueaderos, estrato), igual
    que el componente de contenido de `modelo()`.
  - PRESUPUESTO, solo en Vivienda: el análogo del `esfuerzo` de Compra. No
    hay hipoteca ni subsidio — es cuánto se pasa el canon del techo del rango.

Oficinas y Bodegas solo reciben la zona (su recorrido no pregunta más), así
que su score es la cercanía a secas.

Lo que NO se reusa de Compra, a propósito: el componente colaborativo y la
cota de precio de `modelo.py`. Se alimentan de un histórico simulado de
compras y de cuota de hipoteca; para arriendo no existe ni lo uno ni lo otro,
y fingirlo sería inventar el dato.

Los porcentajes salen de `post_arreglos` de `modelo.py`, sin cambios: el
líder muestra su score con piso de 85 %, cada siguiente resta lo que lo
separa del anterior, y nadie repite porcentaje.
"""

from __future__ import annotations

import json
import os

import numpy as np
from sklearn.neighbors import NearestNeighbors

from Model.catalogos import (
    distancia_localidades,
    indice_localidad,
    nombre_localidad,
    normalizar_texto,
)
from Model.grafo_barrios import distancia_barrios, indice_barrio
from Model.modelo import (
    COBERTURA_ZONAS_SIN_DATO,
    KM_BASE_SIN_BARRIO,
    KM_POR_SALTO_LOCALIDAD,
    PENALIZACION_DATO_INCOMPLETO,
    RADIO_CERCANIA_KM,
    post_arreglos,
    score_cercania,
)
from Model.rutas import RUTA_ARRIENDO

TIPOS_ARRIENDO = ("vivienda", "oficina", "bodega")

# Mezcla del score. Vivienda reparte entre cercanía, presupuesto, perfil y
# estilo de vida; la cercanía lleva la mayor parte porque el catálogo demo es
# chico y disperso, y lo primero que la persona decidió fue DÓNDE (mismo
# criterio que le da a `localidad` su peso en Compra, solo que allí compite con
# un histórico de miles de registros que aquí no existe).
#
# `estilo` es el equivalente de `zonas` en Compra y pesa parecido (0,17 allá):
# lo que se marca en "¿Cuál es tu estilo de vida?" es preferencia, no
# viabilidad — un gimnasio no decide un arriendo como lo decide el canon.
PESOS_VIVIENDA = {"localidad": 0.35, "presupuesto": 0.27, "perfil": 0.23, "estilo": 0.15}
PESOS_COMERCIAL = {"localidad": 1.0}

# "¿Cuál es tu estilo de vida?" (ESTILO_VIDA en data.js) -> lo que hay que
# buscar en las comodidades que publica la ficha (`comodidades`, ver
# `_comodidades` en el scraper). Las agujas van en minúscula y sin tildes y se
# comparan por substring, porque el vocabulario de Fincaraíz no es cerrado:
# la misma idea sale como "Ascensor" y "Ascensor(es) inteligente(s)".
#
# Lo que no tiene equivalente en la ficha se queda fuera a propósito (vivir
# solo, o en situación de discapacidad, no es una casilla del catálogo): se
# puntúa sobre lo que SÍ se puede comprobar, en vez de inventar coincidencias.
ESTILO_A_COMODIDAD = {
    "vivo_ninos": ("zona infantil", "salon de juegos", "colegios", "parques cercanos"),
    "vivo_mascotas": ("mascota", "zonas verdes", "jardin", "parques cercanos"),
    "discapacidad": ("ascensor",),
    "biciusuario": ("bici",),
    "gimnasio_personal": ("gimnasio", "sauna", "canchas deportivas"),
    "aire_libre": ("zonas verdes", "parques cercanos", "jardin", "terraza", "canchas deportivas"),
    "balcon_terraza": ("balcon", "terraza"),
    "zona_ropas": ("zona de lavanderia", "ropas"),
    "deposito": ("deposito",),
    "areas_sociales": ("salon comunal", "salon de juegos", "sala de internet", "zonas verdes"),
}

# Features del `NearestNeighbors` de perfil, con su rango de dominio y su peso
# dentro de la distancia. Rangos fijos y no un scaler ajustado sobre los
# candidatos, por la misma razón que en `modelo.py`: con pocos candidatos un
# scaler empírico cambiaría de escala en cada consulta.
RANGOS_PERFIL = {
    "habitaciones": (1, 5),
    "banos": (1, 4),
    "estrato": (1, 6),
    "parqueaderos": (0, 3),
}
PESOS_PERFIL = {
    "habitaciones": 0.40,
    "banos": 0.25,
    "estrato": 0.20,
    "parqueaderos": 0.15,
}
DISTANCIA_MAXIMA_PERFIL = float(np.sqrt(sum(p ** 2 for p in PESOS_PERFIL.values())))

# Los rangos de la pregunta de presupuesto del quiz (PRESUPUESTO en data.js),
# como (piso, techo) del canon mensual. El último no tiene techo.
PRESUPUESTOS = {
    "<1M": (0, 1_000_000),
    "1-2M": (1_000_000, 2_000_000),
    "2-3.5M": (2_000_000, 3_500_000),
    ">3.5M": (3_500_000, None),
}
# Cuánto por encima del techo se tolera antes de que el score de presupuesto
# llegue a 0: a +60 % del techo ya no es "un poco más", es otro rango.
HOLGURA_PRESUPUESTO = 0.60
# Lo que vale un canon que la ficha no publica: "no sé", por debajo de un buen
# encaje (mismo criterio que `COBERTURA_ZONAS_SIN_DATO` en Compra).
PRESUPUESTO_SIN_DATO = 0.35


# ---------------------------------------------------------------------------
# Entrada: zonas elegidas en el mapa
# ---------------------------------------------------------------------------
def parsear_zonas(valores):
    """Traduce las zonas que manda el front a `[(localidad_id, barrio_id|None)]`.

    Cada valor es `"<localidad>"` o `"<localidad>:<barrio>"`, donde la localidad
    es un id 1..20 o su nombre y el barrio un nombre o código de sector
    catastral. Lo que no se reconoce se descarta en vez de romper la consulta:
    una zona ilegible no puede dejar a la persona sin resultados.
    """
    zonas = []
    for valor in valores or []:
        localidad_cruda, _, barrio_crudo = str(valor).partition(":")
        localidad = indice_localidad(localidad_cruda.strip())
        if localidad is None:
            continue
        barrio = None
        if barrio_crudo.strip():
            barrio = indice_barrio(barrio_crudo.strip(), localidad)
        zona = (localidad, barrio)
        if zona not in zonas:
            zonas.append(zona)
    return zonas


# ---------------------------------------------------------------------------
# Cercanía
# ---------------------------------------------------------------------------
def _anotar_cercania(inmueble, zonas):
    """Escribe `_distancia_localidad` y `_distancia_km` (la más cercana de todas
    las zonas) y devuelve el inmueble. `_distancia_km` es None si ninguna zona
    trae barrio: entonces `score_cercania` cae a la fórmula por saltos.
    """
    destino_localidad = inmueble.get("Localidad")
    destino_barrio = inmueble.get("barrio_id")

    saltos = []
    kms = []
    estimada = False
    hay_barrio_pedido = any(barrio is not None for _, barrio in zonas)

    for localidad, barrio in zonas:
        s = distancia_localidades(localidad, destino_localidad)
        if s is None:
            continue
        saltos.append(s)
        if not hay_barrio_pedido:
            continue
        km = distancia_barrios(barrio, destino_barrio) if barrio is not None else None
        if km is None:
            # Lo que no se sabe vale lo esperado, no lo mejor (ver
            # `KM_BASE_SIN_BARRIO` en modelo.py).
            km = round(KM_BASE_SIN_BARRIO + KM_POR_SALTO_LOCALIDAD * s, 3)
            es_estimada = True
        else:
            es_estimada = False
        kms.append((km, es_estimada))

    inmueble["_distancia_localidad"] = min(saltos) if saltos else 9
    if kms:
        mejor_km, estimada = min(kms, key=lambda par: par[0])
        inmueble["_distancia_km"] = mejor_km
    else:
        inmueble["_distancia_km"] = None
    inmueble["_distancia_estimada"] = estimada
    return inmueble


# ---------------------------------------------------------------------------
# Presupuesto y perfil (solo Vivienda)
# ---------------------------------------------------------------------------
def _score_presupuesto(canon, presupuesto):
    """1.0 si el canon cabe en el techo del rango; decae hasta 0 al pasarse."""
    if canon is None or canon <= 0:
        return PRESUPUESTO_SIN_DATO
    _, techo = PRESUPUESTOS[presupuesto]
    if techo is None or canon <= techo:
        return 1.0
    exceso = (canon - techo) / (techo * HOLGURA_PRESUPUESTO)
    return max(0.0, 1.0 - exceso)


def _coincidencias_estilo(inmueble, estilo_vida):
    """Qué pidió la persona en "estilo de vida" y este inmueble sí tiene.

    Returns:
        (cobertura [0,1], [{estilo, comodidad}]) — la cobertura es la fracción
        de lo pedido que se pudo COMPROBAR contra la ficha. Lo que no tiene
        equivalente en el catálogo (`vivo_solo`) no cuenta ni a favor ni en
        contra: no se puede exigir coincidencia contra algo que no se publica,
        mismo criterio que `_cumple_habitaciones`/zonas en modelo.py.
    """
    comprobables = [e for e in (estilo_vida or []) if e in ESTILO_A_COMODIDAD]
    if not comprobables:
        return None, []

    nombres = [(c.get("nombre") or "") for c in inmueble.get("comodidades") or []]
    normalizados = [normalizar_texto(n) for n in nombres]

    coinciden = []
    for estilo in comprobables:
        for aguja in ESTILO_A_COMODIDAD[estilo]:
            encontrado = next((nombres[i] for i, n in enumerate(normalizados) if aguja in n), None)
            if encontrado:
                coinciden.append({"estilo": estilo, "comodidad": encontrado})
                break
    return len(coinciden) / len(comprobables), coinciden


def _escalar_perfil(valores):
    """Lleva las features a [0, 1] con rangos fijos y aplica sus pesos."""
    vector = []
    for campo in PESOS_PERFIL:
        minimo, maximo = RANGOS_PERFIL[campo]
        valor = min(max(valores[campo], minimo), maximo)
        vector.append(PESOS_PERFIL[campo] * (valor - minimo) / (maximo - minimo))
    return vector


def _afinidad_perfil(candidatos, preferencias):
    """Afinidad [0,1] de cada candidato con lo que pidió el usuario, por
    `NearestNeighbors` (mismo componente de contenido que `modelo()`).

    Un dato que la ficha no publica no cuenta como distancia: se le asume el
    valor del propio usuario y se descuenta aparte (`PENALIZACION_DATO_
    INCOMPLETO`), para que no gane por omisión pero tampoco pierda doble.

    Returns:
        (afinidades, faltantes_por_candidato)
    """
    filas = []
    faltantes = []
    for inmueble in candidatos:
        valores = {}
        falta = []
        for campo in PESOS_PERFIL:
            dato = inmueble.get(campo)
            if campo == "parqueaderos" and dato is None:
                dato = 0  # "sin parqueadero" es un dato, no una ausencia
            if dato is None:
                valores[campo] = preferencias[campo]
                falta.append(campo)
            else:
                valores[campo] = dato
        filas.append(_escalar_perfil(valores))
        faltantes.append(falta)

    vector_usuario = np.array([_escalar_perfil(preferencias)])
    vecinos = NearestNeighbors(n_neighbors=len(candidatos), metric="euclidean")
    vecinos.fit(np.array(filas))
    distancias, indices = vecinos.kneighbors(vector_usuario)
    por_indice = dict(zip(indices[0].tolist(), distancias[0].tolist()))

    afinidades = [
        max(0.0, 1.0 - por_indice.get(i, DISTANCIA_MAXIMA_PERFIL) / DISTANCIA_MAXIMA_PERFIL)
        for i in range(len(candidatos))
    ]
    return afinidades, faltantes


# ---------------------------------------------------------------------------
# Explicación del puesto
# ---------------------------------------------------------------------------
#
# Mismo criterio que `razonDeMatch` en js/recommender.js, y por los mismos
# motivos: la apertura nombra el PUESTO (con 95 inmuebles paginados, un único
# "También encaja contigo" se leería como relleno a partir de la página 2), las
# razones van en frases propias y no encadenadas con "y", y el "pero" va
# siempre al final y con su propia entrada — metido entre las buenas se lee
# como una virtud más.
#
# LAS APERTURAS HABLAN EN SEGUNDA PERSONA Y SE MOJAN. "Es el que mejor encaja
# contigo" describe un ranking; "Si solo vas a ver uno, que sea este" dice qué
# hacer con él. La diferencia no es adornar: el primero de la lista se ganó el
# puesto contra otros 94, y leerlo como un empate técnico desperdicia el
# trabajo del modelo.
APERTURAS = (
    "Si solo vas a ver uno, que sea este",
    "Muy cerca del primero, y por poco se lo lleva",
    "El tercero, y tiene con qué pelear",
)
APERTURA_LISTA_CORTA = "Este también merece una visita"
APERTURA_RESTO = "Otra opción que vale la pena mirar"


def _apertura(posicion):
    if posicion <= len(APERTURAS):
        return APERTURAS[posicion - 1]
    return APERTURA_LISTA_CORTA if posicion <= 6 else APERTURA_RESTO


def _lista_natural(frases):
    if len(frases) <= 1:
        return "".join(frases)
    return ", ".join(frases[:-1]) + " y " + frases[-1]


def _mayuscula(texto):
    """Las frases nacen en minúscula porque van detrás de dos puntos; al
    promover una a frase propia hay que levantarla."""
    return texto[0].upper() + texto[1:] if texto else texto


def _pesos_cop(valor):
    """'$1,4 millones' / '$300 mil' — la cifra redonda, la que se lee de un
    vistazo. Por debajo del millón se cuenta en miles: "$0,3 millones" obliga
    a traducir mentalmente una cifra que ya venía fácil."""
    if valor < 1_000_000:
        return f"${int(round(valor / 1000)):,}".replace(",", ".") + " mil"
    texto = f"{valor / 1e6:.1f}".rstrip("0").rstrip(".").replace(".", ",")
    return f"${texto} mill{'ón' if texto == '1' else 'ones'}"


# Las comodidades que de verdad mueven una decisión, en orden de peso. La
# ficha publica hasta 30 ("Zona Residencial", "Sobre vía secundaria"), y
# nombrarlas todas diluye las que importan: se escogen las dos primeras de
# esta lista que el inmueble tenga.
COMODIDADES_QUE_VENDEN = (
    ("ascensor", "ascensor"),
    ("porter", "portería"),
    ("recepci", "recepción"),
    ("vigilancia", "vigilancia"),
    ("circuito cerrado", "circuito cerrado de TV"),
    ("planta el", "planta eléctrica"),
    ("parqueadero visitantes", "parqueadero para visitantes"),
    ("gimnasio", "gimnasio"),
    ("terraza", "terraza"),
    ("amoblado", "amoblado"),
    ("dep", "depósito"),
    ("balc", "balcón"),
    ("salón de videoconferencias", "salón de videoconferencias"),
    ("cableado de red", "cableado de red"),
    ("aire acondicionado", "aire acondicionado"),
    ("trans. p", "transporte público cerca"),
    ("zona comercial", "zona comercial alrededor"),
)


def _comodidades_destacadas(inmueble, maximo=2):
    nombres = [(c.get("nombre") or "").lower() for c in inmueble.get("comodidades") or []]
    elegidas = []
    for aguja, etiqueta in COMODIDADES_QUE_VENDEN:
        if any(aguja in nombre for nombre in nombres) and etiqueta not in elegidas:
            elegidas.append(etiqueta)
            if len(elegidas) == maximo:
                break
    return elegidas


def _frases_cercania(inmueble):
    """La única razón que siempre existe: qué tan cerca quedó de lo que marcó."""
    km = inmueble.get("_distancia_km")
    saltos = inmueble.get("_distancia_localidad", 0)
    localidad = (inmueble.get("localidad_nombre")
                 or nombre_localidad(inmueble.get("Localidad")) or "Bogotá")

    # Los kilómetros solo se citan cuando son una MEDIDA: si el inmueble no
    # tiene barrio, `_distancia_km` es el típico de su salto de localidad
    # (ver `_anotar_cercania`) y darlo como exacto sería inventarlo.
    if km is not None and not inmueble.get("_distancia_estimada"):
        texto_km = f"{km:.1f}".replace(".", ",")
        if km < 0.5:
            return "cae justo dentro del sector que marcaste en el mapa", None
        if km <= 3:
            return f"lo tienes a {texto_km} km de donde marcaste, prácticamente caminando", None
        if km <= RADIO_CERCANIA_KM:
            return f"queda a {texto_km} km de tu zona, un trayecto corto", None
        return None, f"queda a {texto_km} km de tu zona, que no es al lado"

    if saltos == 0:
        return f"está en {localidad}, exactamente donde querías", None
    if saltos == 1:
        return f"está en {localidad}, pegado a la zona que elegiste", None
    return None, f"está en {localidad}, a {saltos} localidades de tu zona"


def _frases(inmueble, preferencias, presupuesto):
    """(buenas, malas), en minúscula y listas para ir detrás de dos puntos."""
    buenas, malas = [], []

    buena, mala = _frases_cercania(inmueble)
    if buena:
        buenas.append(buena)
    if mala:
        malas.append(mala)

    canon = inmueble.get("precio_canon_cop")
    if presupuesto and canon:
        _, techo = PRESUPUESTOS[presupuesto]
        if techo is None:
            buenas.append(f"el canon es de {_pesos_cop(canon)} al mes")
        elif canon <= techo:
            # El margen es más convincente que un "sí, cabe": dice cuánto le
            # queda libre cada mes, que es la cuenta que la persona va a hacer
            # de todos modos.
            margen = techo - canon
            if margen >= 200_000:
                buenas.append(f"a {_pesos_cop(canon)} al mes te deja {_pesos_cop(margen)} "
                              "de margen frente a tu tope")
            else:
                buenas.append(f"el canon de {_pesos_cop(canon)} al mes entra en tu presupuesto")
        else:
            malas.append(f"el canon de {_pesos_cop(canon)} al mes se pasa de tu presupuesto")

    if preferencias:
        pedidas = preferencias.get("habitaciones")
        tiene = inmueble.get("habitaciones")
        if pedidas and tiene:
            if tiene > pedidas:
                buenas.append(f"tiene {tiene} habitaciones, una más de las que pediste"
                              if tiene == pedidas + 1 else
                              f"tiene {tiene} habitaciones, más de las que pediste")
            elif tiene == pedidas:
                buenas.append(f"tiene las {tiene} habitaciones que pediste"
                              if tiene > 1 else "tiene la habitación que pediste")
            else:
                # Sin "y" interna: `_lista_natural` une las malas con " y ", y
                # dos en la misma frase dejan "…pediste 2 y no tiene parqueadero".
                malas.append(f"se queda en {tiene} habitación{'es' if tiene > 1 else ''} "
                             f"frente a las {pedidas} que pediste")

        banos_pedidos = preferencias.get("banos")
        banos = inmueble.get("banos")
        if banos_pedidos and banos and banos >= banos_pedidos:
            buenas.append(f"tiene {banos} baño{'s' if banos > 1 else ''}")

        parq_pedidos = preferencias.get("parqueaderos") or 0
        parq = inmueble.get("parqueaderos") or 0
        if parq_pedidos:
            if parq >= parq_pedidos:
                buenas.append(f"incluye {parq} parqueadero{'s' if parq > 1 else ''}")
            else:
                malas.append("no tiene parqueadero" if not parq else
                             f"solo tiene {parq} parqueadero{'s' if parq > 1 else ''}")

        estrato_pedido = preferencias.get("estrato")
        estrato = inmueble.get("estrato")
        if estrato_pedido and estrato and estrato == estrato_pedido:
            buenas.append(f"es estrato {estrato}, el que buscabas")

    area = inmueble.get("area_m2")
    if area and not preferencias:
        # Comercial: sin perfil que cruzar, el área es lo que de verdad decide
        # si el espacio sirve para lo que la persona tiene en mente.
        buenas.append(f"son {area} m² para montar lo que tengas pensado")

    # Lo que la persona marcó en "estilo de vida" y este inmueble sí tiene.
    # Va antes que las comodidades genéricas: es lo que ELLA pidió, no lo que
    # el inmueble presume. La tarjeta además lo resalta aparte con un ✓.
    coinciden = [c["comodidad"].lower() for c in inmueble.get("_estilo_coinciden") or []]
    if coinciden:
        sobran = len(coinciden) - 2
        if sobran > 0:
            # Las dos primeras con coma, no con "y": el "y" se reserva para
            # enganchar el "N más" y dos seguidos dejan "A y B y 2 cosas más".
            cabeza = ", ".join(coinciden[:2])
            cola = f" y {sobran} cosa{'s' if sobran > 1 else ''} más de lo que marcaste"
        else:
            cabeza = _lista_natural(coinciden)
            cola = ", de lo que marcaste"
        buenas.append("tiene " + cabeza + cola)

    # Las comodidades que la ficha publica (ver `_comodidades` en el scraper).
    # Van de últimas y como máximo dos: son el remate, no el argumento. Se
    # saltan las que ya se nombraron arriba, para no repetirlas.
    destacadas = [d for d in _comodidades_destacadas(inmueble, maximo=4)
                  if not any(d in c for c in coinciden)][:2]
    if destacadas:
        buenas.append("suma " + _lista_natural(destacadas))

    # La administración solo se nombra cuando es plata aparte del canon: es el
    # costo que más sorprende después de firmar.
    administracion = inmueble.get("administracion_cop")
    if administracion and canon and administracion > canon * 0.05:
        malas.append(f"la administración son {_pesos_cop(administracion)} más al mes")

    return buenas, malas


def _razon(inmueble, preferencias, presupuesto):
    """Por qué quedó en este puesto, con los mismos criterios del score."""
    buenas, malas = _frases(inmueble, preferencias, presupuesto)
    texto = _apertura(inmueble.get("posicion", 99))

    if buenas:
        texto += ": " + buenas[0] + "."
        # Cada razón su frase, sin unirlas con "y": ya traen comas dentro y
        # encadenadas no se sabe dónde termina una y empieza la otra. La última
        # entra con "Y" para que el bloque cierre en vez de cortarse en seco.
        resto = buenas[1:]
        for i, frase in enumerate(resto):
            ultima = i == len(resto) - 1 and len(resto) > 1
            texto += " " + ("Y " + frase if ultima else _mayuscula(frase)) + "."
    else:
        texto += "."

    if malas:
        texto += " Lo único: " + _lista_natural(malas) + "."
    return texto


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------
def cargar_catalogo(ruta=RUTA_ARRIENDO):
    """Los inmuebles del catálogo de arriendo, o [] si el archivo no existe."""
    if not os.path.exists(ruta):
        return []
    with open(ruta, "r", encoding="utf-8") as archivo:
        return json.load(archivo).get("inmuebles", [])


def recomendar_arriendo(tipo_inmueble, zonas=None, presupuesto=None,
                        preferencias=None, estilo_vida=None,
                        ruta_catalogo=RUTA_ARRIENDO):
    """Ordena el catálogo de un tipo de inmueble por compatibilidad con la zona
    (y, en Vivienda, con el presupuesto y las preferencias) y le pone su
    porcentaje de match.

    Args:
        tipo_inmueble: "vivienda" | "oficina" | "bodega".
        zonas: `[(localidad_id, barrio_id|None)]`, ver `parsear_zonas`. Sin
            zonas no hay nada con qué medir cercanía y el score es parejo: se
            devuelve ordenado por canon, sin porcentaje real que defender.
        presupuesto: clave de `PRESUPUESTOS`, o None.
        preferencias: `{habitaciones, banos, estrato, parqueaderos}` (enteros)
            o None. Solo Vivienda las usa.
        estilo_vida: los slugs de "¿Cuál es tu estilo de vida?" (ver
            ESTILO_A_COMODIDAD), o None. Solo Vivienda lo usa.

    Returns:
        Lista de inmuebles, de mayor a menor compatibilidad, cada uno con
        `porcentaje_compatibilidad`, `posicion`, `razon`, `distancia_km`,
        `distancia_km_estimada` y `estilo_coinciden` (lo que la persona pidió
        y este inmueble sí tiene).
    """
    if tipo_inmueble not in TIPOS_ARRIENDO:
        raise ValueError(f"tipo_inmueble debe ser uno de: {', '.join(TIPOS_ARRIENDO)}")
    if presupuesto is not None and presupuesto not in PRESUPUESTOS:
        raise ValueError(f"presupuesto debe ser uno de: {', '.join(PRESUPUESTOS)}")

    candidatos = [dict(r) for r in cargar_catalogo(ruta_catalogo)
                  if r.get("tipo_inmueble") == tipo_inmueble]
    if not candidatos:
        return []

    zonas = zonas or []
    es_vivienda = tipo_inmueble == "vivienda"
    usa_presupuesto = es_vivienda and presupuesto is not None
    usa_perfil = es_vivienda and preferencias is not None
    estilo_vida = estilo_vida if es_vivienda else None

    # Se anota siempre (aunque no haya zona) para que la tarjeta pueda pintar
    # el "Tiene lo que buscas ✓" en cualquier caso.
    for inmueble in candidatos:
        cobertura, coinciden = _coincidencias_estilo(inmueble, estilo_vida)
        inmueble["_estilo_cobertura"] = cobertura
        inmueble["_estilo_coinciden"] = coinciden
        inmueble["estilo_coinciden"] = coinciden
    usa_estilo = any(r["_estilo_cobertura"] is not None for r in candidatos)

    if not zonas:
        # Sin zona no hay score que valga: se ordena por precio, sin inventar
        # un porcentaje de compatibilidad.
        candidatos.sort(key=lambda r: (r.get("precio_canon_cop") or float("inf")))
        for posicion, inmueble in enumerate(candidatos, start=1):
            inmueble["posicion"] = posicion
            inmueble["porcentaje_compatibilidad"] = None
            inmueble["razon"] = ""
            inmueble["distancia_km"] = None
            inmueble["distancia_km_estimada"] = False
        return [_limpiar(r) for r in candidatos]

    for inmueble in candidatos:
        _anotar_cercania(inmueble, zonas)

    afinidades_perfil, faltantes = ([0.0] * len(candidatos), [[] for _ in candidatos])
    if usa_perfil:
        afinidades_perfil, faltantes = _afinidad_perfil(candidatos, preferencias)

    pesos = dict(PESOS_VIVIENDA if es_vivienda else PESOS_COMERCIAL)
    # Un componente sin dato de entrada no puntúa: su peso se reparte entre
    # los que sí tienen con qué medirse, en vez de regalarles un 1.0.
    if not usa_presupuesto:
        pesos.pop("presupuesto", None)
    if not usa_perfil:
        pesos.pop("perfil", None)
    if not usa_estilo:
        pesos.pop("estilo", None)
    total_pesos = sum(pesos.values())
    pesos = {k: v / total_pesos for k, v in pesos.items()}

    seleccionados = []
    for inmueble, afinidad, falta in zip(candidatos, afinidades_perfil, faltantes):
        score_localidad = score_cercania(inmueble)
        score = pesos["localidad"] * score_localidad
        score_presupuesto = None
        if usa_presupuesto:
            score_presupuesto = _score_presupuesto(inmueble.get("precio_canon_cop"), presupuesto)
            score += pesos["presupuesto"] * score_presupuesto
        if usa_perfil:
            score += pesos["perfil"] * afinidad
        score_estilo = None
        if usa_estilo:
            # Un inmueble sin comodidades publicadas no puede demostrar que
            # cumple, pero tampoco incumple: vale lo mismo que "no sé" en
            # Compra (`COBERTURA_ZONAS_SIN_DATO`), por debajo de un match
            # parcial y por encima de un 0 que lo sacaría de la lista.
            cobertura = inmueble.get("_estilo_cobertura")
            score_estilo = (COBERTURA_ZONAS_SIN_DATO
                            if not inmueble.get("comodidades") else cobertura)
            score += pesos["estilo"] * score_estilo
        penalizacion = PENALIZACION_DATO_INCOMPLETO * len(falta)
        score = max(0.0, score - penalizacion)

        inmueble.update({
            "score": round(float(score), 4),
            "score_localidad": round(float(score_localidad), 4),
            "score_presupuesto": None if score_presupuesto is None else round(float(score_presupuesto), 4),
            "score_perfil": round(float(afinidad), 4) if usa_perfil else None,
            "score_estilo": None if score_estilo is None else round(float(score_estilo), 4),
            "penalizacion_dato_incompleto": round(float(penalizacion), 4),
            # `post_arreglos` desempata por este campo (el más barato se queda
            # con el porcentaje alto del empate).
            "precio_desde_cop": inmueble.get("precio_canon_cop"),
        })
        seleccionados.append(inmueble)

    listos = post_arreglos(seleccionados, ruta_salida=None)

    for inmueble in listos:
        km = inmueble.get("_distancia_km")
        inmueble["distancia_km"] = km
        inmueble["distancia_km_estimada"] = bool(inmueble.get("_distancia_estimada"))
        inmueble["razon"] = _razon(
            inmueble,
            preferencias if usa_perfil else None,
            presupuesto if usa_presupuesto else None,
        )
    return [_limpiar(r) for r in listos]


def _limpiar(inmueble):
    """Quita las llaves internas (`_...`) y el desempate de precio: son del
    cálculo, no del contrato de la API."""
    return {k: v for k, v in inmueble.items()
            if not k.startswith("_") and k != "precio_desde_cop"}
