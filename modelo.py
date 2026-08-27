"""
modelo.py
=========
Motor de recomendación de proyectos inmobiliarios.

Pipeline:

    leer_info_user(path)  ->  usuario_modelo / usuario_segmentado / contacto
              |
    primer_filtro(usuario_segmentado)  ->  proyectos_preseleccionados
              |                            (filtro duro + expansión por grafo)
    modelo(preseleccionados, usuario_modelo)  ->  proyectos_seleccionados
              |                                   (Nearest Neighbors, top N)
    post_arreglos(seleccionados)  ->  proyectos_listos_llamativos
                                      (normalización comercial del score)

Requiere `proyectos_model.json`, generado por `prep.py`.
"""

from __future__ import annotations

import json
import os

import numpy as np
from sklearn.neighbors import NearestNeighbors

from catalogos import (
    LOCALIDADES_BOGOTA,
    ZONAS_COMUNES,
    codigo_tipo_vivienda,
    indice_localidad,
    localidades_por_distancia,
    mapear_zonas,
    nombre_tipo_vivienda,
    nombres_zonas,
)

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RUTA_MODELO = os.path.join(DIRECTORIO, "proyectos_model.json")
RUTA_HISTORIAL = os.path.join(DIRECTORIO, "historial_simulado.json")
RUTA_LLAMATIVOS = os.path.join(DIRECTORIO, "proyectos_listos_llamativos.json")

# ---------------------------------------------------------------------------
# Parámetros del filtro duro
# ---------------------------------------------------------------------------
# Candidatos mínimos que el filtro duro le entrega al modelo. Tiene que ser
# holgadamente mayor que `TOP_N`: si fueran iguales, el Nearest Neighbors no
# elegiría nada —devolvería el filtro entero— y el score dejaría de ordenar.
# Se mantiene la proporción de siempre (~1,7x el tamaño del top).
MINIMO_PRESELECCIONADOS = 30

# Escalera de relajación: cada paso suelta una restricción, de la menos a la
# más costosa para el usuario. El tipo de vivienda nunca entra aquí (VIS y
# No VIS son categorías legales distintas) y las habitaciones se sueltan de
# últimas, porque son el requisito más duro de la búsqueda.
#   (exige_zonas, exige_habitaciones, nivel_de_relajacion)
PASOS_RELAJACION = (
    (True,  True,  0),   # criterio completo
    (False, True,  2),   # se admite que no coincida ninguna zona común
    (False, False, 3),   # último recurso: menos habitaciones de las pedidas
)

# ---------------------------------------------------------------------------
# Parámetros del modelo
# ---------------------------------------------------------------------------
# Cuántas recomendaciones se devuelven. Sube junto con
# `MINIMO_PRESELECCIONADOS`, que tiene que seguir siendo mayor.
TOP_N = 18

# Vecinos consultados en el histórico. `None` = automático.
#
# Lo que hay que consultar no son REGISTROS sino PERFILES DISTINTOS: el
# histórico repite a la misma persona en cada evento que vive, y el vector del
# modelo son solo tres features (salario, personas, edad), así que muchos
# clientes distintos colapsan además en el mismo punto. En el historial actual
# hay 8.710 registros sobre 453 perfiles distintos: 19 registros por perfil.
# Un K fijo de 200 consultaba ~10 perfiles y se quedaba corto.
#
# Por eso K se calcula como PERFILES_A_CONSULTAR x (registros por perfil), que
# se mide del propio historial y se reajusta solo si cambia la simulación.
# Medido sobre 600 clientes de prueba no vistos (simulacion/evaluar.py):
#
#     K=200 -> 68.8%   K=450 -> 75.5%   K=600 -> 77.3%   K=900 -> 76.5%
#
# El óptimo es un plateau ancho entre 520 y 820; 30 perfiles cae en el centro.
# Por debajo el vecindario es demasiado pequeño para promediar, y por encima
# la personalización se diluye hasta degenerar en popularidad global.
K_VECINOS = None
K_VECINOS_MIN, K_VECINOS_MAX = 15, 1500
PERFILES_A_CONSULTAR = 30

# Rangos fijos para escalar cada feature a [0, 1]. Se usan rangos de dominio en
# lugar de ajustar un scaler sobre los candidatos: con 10 candidatos un scaler
# empírico sería inestable y cambiaría de escala en cada consulta.
RANGOS_FEATURES = {
    "salario": (1, 4),
    "personas_a_cargo": (1, 4),
    "edad": (18, 75),
}

# Importancia relativa de cada feature dentro de la distancia.
# La capacidad de pago manda en una compra de vivienda.
PESOS_FEATURES = {
    "salario": 0.50,
    "personas_a_cargo": 0.30,
    "edad": 0.20,
}

# Distancia euclidiana máxima posible en el espacio escalado y ponderado.
DISTANCIA_MAXIMA = float(np.sqrt(sum(p ** 2 for p in PESOS_FEATURES.values())))

# Mezcla del score final. El componente del modelo domina; las afinidades de
# zonas y localidad desempatan y evitan que un proyecto lejano o que apenas
# coincide en amenidades quede primero solo por parecido demográfico.
PESOS_SCORE = {"modelo": 0.70, "zonas": 0.20, "localidad": 0.10}

# --- Datos que la fuente no publica ---------------------------------------
# No todas las constructoras publican habitaciones ni zonas comunes. Un dato
# ausente NO es un incumplimiento: tratarlo como tal dejaba 7 de los 102
# proyectos del catálogo fuera de cualquier recomendación posible. Se admiten
# y se les descuenta, para que no le ganen a una ficha completa que sí
# demostró cumplir.
COBERTURA_ZONAS_SIN_DATO = 0.35   # "no sé", deliberadamente por debajo de un match parcial
PENALIZACION_DATO_INCOMPLETO = 0.05   # por cada campo que falta

# Peso del componente colaborativo cuando existe histórico. El resto lo aporta
# el componente de contenido, que cubre los proyectos sin interacciones (frío).
# Medido sobre 600 clientes no vistos: 0.4 y 0.5 empatan en 77.7% y de ahí
# hacia arriba baja de forma sostenida (0.6 -> 77.3%, 0.9 -> 75.7%). El
# colaborativo aporta, pero no debe tapar al de contenido: es el que sostiene
# a los proyectos con pocas interacciones.
ALPHA_HISTORIAL = 0.50

# ---------------------------------------------------------------------------
# Parámetros del gancho comercial (post_arreglos)
# ---------------------------------------------------------------------------
# El líder muestra su propio score como porcentaje. Si ese score sale por
# debajo de este mínimo se eleva hasta él: quien abre la lista es lo mejor que
# hay para esa persona y no puede presentarse con un 60%.
PORCENTAJE_TOP_MINIMO = 85.0
# Del segundo hacia abajo no hay mínimo: cada uno resta su diferencia real con
# el de arriba, en caída libre. Un encaje malo tiene que poder verse malo.
PASO_MINIMO = 1         # garantiza que no haya dos porcentajes iguales

# Traducción del campo `piso` del formulario.
PISOS = {0: "bajo", 1: "medio", 3: "alto", 4: "sin preferencia"}
PISO_SIN_PREFERENCIA = 4


# ===========================================================================
# A. Lectura y estructuración de la información del usuario
# ===========================================================================
def leer_info_user(path_user_info):
    """Lee el formulario del usuario y lo parte en las tres estructuras del pipeline.

    Args:
        path_user_info: acepta tres formas, para que el front no tenga que
            escribir un archivo temporal solo para invocar al modelo:
              - dict ya deserializado (el payload que manda la API)
              - string con el JSON serializado
              - ruta a un archivo .json

    Returns:
        (usuario_modelo, usuario_segmentado, usuario_info_contacto_v1)

        usuario_modelo            -> features numéricas que consume el modelo.
        usuario_segmentado        -> llaves del filtro duro.
        usuario_info_contacto_v1  -> datos de contacto y preferencias restantes.
    """
    crudo = _cargar_formulario(path_user_info)
    if isinstance(crudo, list):          # tolera un archivo con un solo registro
        crudo = crudo[0]

    # Catálogos de referencia usados para traducir los códigos del formulario.
    # Se toman de `catalogos.py` para que prep y modelo compartan exactamente
    # los mismos índices.
    localidades_bogota = list(LOCALIDADES_BOGOTA)   # 20 localidades, índice 0..19
    zonas_comunes = list(ZONAS_COMUNES)             # 25 zonas, índice 0..24

    errores = []

    # --- campos del modelo -------------------------------------------------
    salario = _entero(crudo.get("salario"))
    if salario not in (1, 2, 3, 4):
        errores.append(f"salario debe estar entre 1 y 4 (recibido: {crudo.get('salario')!r})")

    personas = _entero(crudo.get("personas_a_cargo"))
    if personas not in (1, 2, 3, 4):
        errores.append(
            f"personas_a_cargo debe estar entre 1 y 4 (recibido: {crudo.get('personas_a_cargo')!r})"
        )

    edad = _entero(crudo.get("edad"))
    if edad is None or not (18 <= edad <= 125):
        errores.append(f"edad debe estar entre 18 y 125 (recibido: {crudo.get('edad')!r})")

    # --- campos de segmentación -------------------------------------------
    tipo_cod = codigo_tipo_vivienda(crudo.get("tipo_vivienda"))
    if tipo_cod is None:
        errores.append(
            f"tipo_vivienda debe ser 0 (No VIS) o 1 (VIS) (recibido: {crudo.get('tipo_vivienda')!r})"
        )

    # El formulario admite la llave con o sin mayúscula inicial.
    localidad_cruda = crudo.get("Localidad", crudo.get("localidad"))
    localidad_id = indice_localidad(localidad_cruda)
    if localidad_id is None:
        errores.append(
            f"Localidad debe estar entre 1 y {len(localidades_bogota)} (recibido: {localidad_cruda!r})"
        )

    # Requisito duro de la búsqueda: se resuelve en el filtro, no en el modelo.
    habitaciones = _entero(crudo.get("numero_habitaciones"))
    if habitaciones not in (1, 2, 3):
        errores.append(
            "numero_habitaciones debe estar entre 1 y 3, donde 3 es '3 o más' "
            f"(recibido: {crudo.get('numero_habitaciones')!r})"
        )

    # La selección puede llegar como lista de strings o como un único string
    # con los nombres separados por comas; en ambos casos se traduce a índices.
    zonas_idx, zonas_desconocidas = mapear_zonas(crudo.get("zonas_comunes"))

    if errores:
        raise ValueError("JSON de usuario inválido:\n  - " + "\n  - ".join(errores))

    usuario_modelo = {
        "salario": salario,
        "personas_a_cargo": personas,
        "edad": edad,
    }

    usuario_segmentado = {
        "tipo_vivienda": tipo_cod,
        "localidad": localidad_id,
        "zonas_comunes": zonas_idx,
        "numero_habitaciones": habitaciones,
        # Extras legibles, útiles para logging y para la vista; el filtro solo
        # usa las cuatro llaves de arriba.
        "tipo_vivienda_nombre": nombre_tipo_vivienda(tipo_cod),
        "localidad_nombre": localidades_bogota[localidad_id - 1],
        "zonas_comunes_nombres": [zonas_comunes[i] for i in zonas_idx],
    }

    # El piso se captura pero hoy no filtra nada: el seed de proyectos no trae
    # esa columna. Ante ausencia o valor inválido se asume "sin preferencia".
    piso = _entero(crudo.get("piso"))
    if piso not in PISOS:
        piso = PISO_SIN_PREFERENCIA
    usuario_info_contacto_v1 = {
        "nombres": crudo.get("nombres"),
        "apellidos": crudo.get("apellidos"),
        "nombre_completo": " ".join(
            parte for parte in (crudo.get("nombres"), crudo.get("apellidos")) if parte
        ).strip() or None,
        "correo": crudo.get("correo"),
        "telefono": crudo.get("telefono"),
        "afiliado": bool(crudo.get("afiliado")),
        "piso": piso,
        "piso_nombre": PISOS.get(piso),
        "zonas_comunes_no_reconocidas": zonas_desconocidas,
    }

    return usuario_modelo, usuario_segmentado, usuario_info_contacto_v1


def _cargar_formulario(entrada):
    """Normaliza la entrada del formulario a un dict.

    El front manda un payload JSON por HTTP; la CLI manda una ruta. Aceptar
    las dos evita que la capa HTTP tenga que escribir un archivo temporal
    solo para poder llamar al modelo.
    """
    if isinstance(entrada, (dict, list)):
        return entrada
    if isinstance(entrada, (bytes, bytearray)):
        entrada = entrada.decode("utf-8")
    if isinstance(entrada, str):
        texto = entrada.strip()
        if texto.startswith("{") or texto.startswith("["):
            return json.loads(texto)
        with open(entrada, "r", encoding="utf-8") as archivo:
            return json.load(archivo)
    raise TypeError(
        f"El formulario debe ser un dict, un JSON o una ruta; llegó {type(entrada).__name__}"
    )


def _entero(valor):
    """Convierte a int lo que venga del formulario. None si no es convertible."""
    if isinstance(valor, bool):
        return int(valor)
    if isinstance(valor, int):
        return valor
    if isinstance(valor, float) and valor.is_integer():
        return int(valor)
    if isinstance(valor, str) and valor.strip().lstrip("+-").isdigit():
        return int(valor.strip())
    return None


# ===========================================================================
# B. Primer filtro (duro) con expansión sobre el grafo urbano
# ===========================================================================
def primer_filtro(usuario_segmentado, ruta_modelo=RUTA_MODELO,
                  minimo=MINIMO_PRESELECCIONADOS):
    """Filtra `proyectos_model.json` por tipo de vivienda, habitaciones,
    localidad y zonas comunes.

    Criterio base (coincidencia exacta):
        - mismo `tipo_vivienda`
        - al menos las `numero_habitaciones` solicitadas
        - misma `localidad`
        - al menos 1 coincidencia en las zonas comunes solicitadas

    Si el resultado trae menos de `minimo` proyectos, se expande en dos ejes.
    Primero el geográfico: se recorre el grafo urbano por saltos de distancia
    mínima (BFS), completando cada nivel entero antes de decidir si hace falta
    seguir. Si ni recorriendo todo el grafo alcanza, entra la escalera de
    `PASOS_RELAJACION`: se sueltan las zonas comunes y, solo como último
    recurso, las habitaciones. El tipo de vivienda nunca se relaja: VIS y
    No VIS son categorías legales y financieras distintas, no una preferencia.

    Returns:
        proyectos_preseleccionados: lista de proyectos enriquecidos con la
        metadata del filtro (`_distancia_localidad`, `_cobertura_zonas`,
        `_cumple_habitaciones`, `_nivel_relajacion`, ...).
    """
    proyectos = _cargar_proyectos(ruta_modelo)

    tipo_usuario = usuario_segmentado["tipo_vivienda"]
    localidad_usuario = usuario_segmentado["localidad"]
    zonas_usuario = set(usuario_segmentado.get("zonas_comunes") or [])
    habitaciones_usuario = usuario_segmentado.get("numero_habitaciones") or 1

    # Restricción no negociable: el universo se reduce al tipo de vivienda.
    universo = [p for p in proyectos if p.get("tipo_vivienda_cod") == tipo_usuario]

    niveles = localidades_por_distancia(localidad_usuario)
    proyectos_preseleccionados = []
    ya_incluidos = set()

    for exige_zonas, exige_habitaciones, nivel in PASOS_RELAJACION:
        if len(proyectos_preseleccionados) >= minimo:
            break
        for distancia in sorted(niveles):
            localidades_nivel = set(niveles[distancia])
            for proyecto in universo:
                if proyecto["id_proyecto"] in ya_incluidos:
                    continue
                if proyecto.get("localidad_id") not in localidades_nivel:
                    continue
                if exige_habitaciones and not _cumple_habitaciones(proyecto, habitaciones_usuario):
                    continue
                zonas_proyecto = set(proyecto.get("zonas_comunes_idx") or [])
                coincidentes = zonas_usuario & zonas_proyecto
                # Sin zonas solicitadas el criterio de amenidades no aplica.
                # Tampoco aplica si el proyecto no publica ninguna: no se puede
                # exigir coincidencia contra una lista que no existe.
                if exige_zonas and zonas_usuario and zonas_proyecto and not coincidentes:
                    continue
                proyectos_preseleccionados.append(
                    _anotar_filtro(proyecto, distancia, coincidentes, zonas_usuario,
                                   habitaciones_usuario, nivel)
                )
                ya_incluidos.add(proyecto["id_proyecto"])
            # Se completa el nivel de distancia antes de cortar, para no partir
            # un empate de localidades igual de cercanas.
            if len(proyectos_preseleccionados) >= minimo:
                break

    # Orden de preferencia: primero lo que cumple todo, después lo relajado.
    proyectos_preseleccionados.sort(
        key=lambda p: (p["_nivel_relajacion"], p["_distancia_localidad"],
                       -p["_n_zonas_coincidentes"])
    )
    return proyectos_preseleccionados


def _cumple_habitaciones(proyecto, solicitadas):
    """¿El proyecto ofrece al menos las habitaciones pedidas?

    El formulario codifica 3 como "3 o más", así que la comparación es `>=`.
    Quien pide 2 habitaciones no queda excluido de un proyecto de 3: el filtro
    garantiza el piso y afinar el exceso es trabajo del modelo, que ya penaliza
    esa distancia vía `personas_objetivo`.

    Un proyecto que **no publica** el dato no se da por incumplido. Antes se
    trataba el vacío como un "no cumple", y eso volvía invisibles a los
    proyectos cuya constructora simplemente no lista habitaciones: 5 de los
    102 del catálogo no aparecían jamás en un Top 6, por un hueco de la fuente
    y no por su ficha. Se admiten, se marcan en `_dato_incompleto` y el score
    los penaliza.
    """
    disponibles = proyecto.get("habitaciones_max")
    if disponibles is None:
        return True
    return disponibles >= solicitadas


def _datos_incompletos(proyecto):
    """Campos que el proyecto no publica y que el filtro necesitaba evaluar."""
    faltantes = []
    if proyecto.get("habitaciones_max") is None:
        faltantes.append("habitaciones")
    if not proyecto.get("zonas_comunes_idx"):
        faltantes.append("zonas_comunes")
    return faltantes


def _anotar_filtro(proyecto, distancia, coincidentes, zonas_usuario,
                   habitaciones_usuario, relajacion):
    """Copia el proyecto y le añade la trazabilidad del filtro."""
    anotado = dict(proyecto)
    coincidentes = sorted(coincidentes)
    # Un match completo pero en localidad vecina se marca como nivel 1.
    nivel = 1 if (relajacion == 0 and distancia > 0) else relajacion
    faltantes = _datos_incompletos(proyecto)

    if not zonas_usuario:
        cobertura = 1.0                      # no pidió zonas: el criterio no aplica
    elif not proyecto.get("zonas_comunes_idx"):
        cobertura = COBERTURA_ZONAS_SIN_DATO  # el proyecto no publica amenidades
    else:
        cobertura = round(len(coincidentes) / len(zonas_usuario), 4)

    anotado.update({
        "_distancia_localidad": distancia,
        "_zonas_coincidentes": coincidentes,
        "_zonas_coincidentes_nombres": nombres_zonas(coincidentes),
        "_n_zonas_coincidentes": len(coincidentes),
        "_cobertura_zonas": cobertura,
        "_dato_incompleto": faltantes,
        "_habitaciones_solicitadas": habitaciones_usuario,
        "_cumple_habitaciones": _cumple_habitaciones(proyecto, habitaciones_usuario),
        # 0 = match completo en la localidad pedida | 1 = localidad vecina
        # 2 = sin coincidencia de zonas   | 3 = menos habitaciones de las pedidas
        "_nivel_relajacion": nivel,
        # Prioridad dura para el ranking final. La expansión geográfica (nivel 1)
        # NO penaliza aquí: ya se paga en `score_localidad`. Lo que sí bloquea es
        # haber roto un requisito del filtro, y nada relajado puede quedar por
        # encima de algo que cumple todo, por mucho score que saque.
        "_prioridad_filtro": 0 if nivel in (0, 1) else nivel,
    })
    return anotado


_CACHE_PROYECTOS = {}


def _cargar_proyectos(ruta_modelo=RUTA_MODELO):
    """Carga `proyectos_model.json`, aceptando lista plana o dict con `meta`.

    Se cachea por (ruta, fecha de modificación): el catálogo se lee en cada
    recomendación y no cambia entre corridas de `prep.py`. Los proyectos que
    salen de aquí nunca se mutan (`_anotar_filtro` trabaja sobre copias).
    """
    if not os.path.exists(ruta_modelo):
        raise FileNotFoundError(
            f"No existe {ruta_modelo}. Ejecuta primero: python prep.py"
        )
    clave = (os.path.abspath(ruta_modelo), os.path.getmtime(ruta_modelo))
    if clave not in _CACHE_PROYECTOS:
        with open(ruta_modelo, "r", encoding="utf-8") as archivo:
            datos = json.load(archivo)
        _CACHE_PROYECTOS.clear()          # solo interesa la versión vigente
        _CACHE_PROYECTOS[clave] = datos["proyectos"] if isinstance(datos, dict) else datos
    return _CACHE_PROYECTOS[clave]


# ===========================================================================
# C. Modelo de Nearest Neighbors
# ===========================================================================
def modelo(proyectos_preseleccionados, usuario_modelo, ruta_historial=RUTA_HISTORIAL,
           top_n=TOP_N, k_vecinos=K_VECINOS, usar_subsidio=False):
    """Puntúa los preseleccionados contra el usuario y devuelve el Top `top_n`.

    Trabaja en dos modos, según haya o no histórico disponible:

    1. **Contenido** (siempre activo). Se instancia un `NearestNeighbors` sobre
       el perfil objetivo de cada proyecto preseleccionado
       ([salario_objetivo, personas_objetivo, edad_objetivo]) y se consulta con
       el vector del usuario. La distancia se convierte en afinidad.

    2. **Colaborativo** (si existe `historial_simulado.json`). Se instancia un
       segundo `NearestNeighbors` sobre los vectores de usuarios históricos; se
       buscan los `k_vecinos` más parecidos al usuario actual y se acumulan sus
       interacciones por proyecto, ponderadas por cercanía. Es el modo que
       "establece los clústeres" a partir del historial.

       Formato esperado del histórico (lista de registros; también se acepta
       {"historial": [...]}):

           {"salario": 3, "personas_a_cargo": 2, "edad": 34,
            "id_proyecto": "COL-011", "interaccion": 1.0}

       `interaccion` es opcional (default 1.0) y admite pesos por tipo de
       evento, p. ej. vista=0.2, lead=0.6, compra=1.0. También se acepta la
       forma anidada {"usuario": {...}, "id_proyecto": ..., "interaccion": ...}.

    El score final mezcla el modelo con las afinidades del filtro
    (ver `PESOS_SCORE`); todos los componentes se devuelven por separado para
    que el ranking sea auditable.

    Returns:
        proyectos_seleccionados: lista con los `top_n` mejores proyectos y su
        score, ordenada de mayor a menor.
    """
    if not proyectos_preseleccionados:
        return []

    campo_salario = "salario_objetivo_con_subsidio" if usar_subsidio else "salario_objetivo"

    # --- 1. Componente de contenido ---------------------------------------
    matriz_proyectos = np.array([
        _escalar_vector(
            proyecto.get(campo_salario, proyecto.get("salario_objetivo")),
            proyecto.get("personas_objetivo"),
            proyecto.get("edad_objetivo"),
        )
        for proyecto in proyectos_preseleccionados
    ])
    vector_usuario = np.array([_escalar_vector(
        usuario_modelo["salario"],
        usuario_modelo["personas_a_cargo"],
        usuario_modelo["edad"],
    )])

    vecinos_contenido = NearestNeighbors(
        n_neighbors=len(proyectos_preseleccionados), metric="euclidean"
    )
    vecinos_contenido.fit(matriz_proyectos)
    distancias, indices = vecinos_contenido.kneighbors(vector_usuario)

    distancia_por_indice = dict(zip(indices[0].tolist(), distancias[0].tolist()))

    # --- 2. Componente colaborativo (si hay histórico) --------------------
    scores_historial, motor = _scores_desde_historial(
        usuario_modelo, proyectos_preseleccionados, ruta_historial, k_vecinos
    )

    # --- 3. Score final ----------------------------------------------------
    resultados = []
    for posicion, proyecto in enumerate(proyectos_preseleccionados):
        distancia = distancia_por_indice.get(posicion, DISTANCIA_MAXIMA)
        afinidad_perfil = max(0.0, 1.0 - distancia / DISTANCIA_MAXIMA)

        score_historial = scores_historial.get(proyecto["id_proyecto"], 0.0)
        if scores_historial:
            score_modelo = (
                ALPHA_HISTORIAL * score_historial
                + (1 - ALPHA_HISTORIAL) * afinidad_perfil
            )
        else:
            score_modelo = afinidad_perfil

        score_zonas = float(proyecto.get("_cobertura_zonas", 0.0))
        score_localidad = max(0.0, 1.0 - 0.25 * proyecto.get("_distancia_localidad", 0))

        score = (
            PESOS_SCORE["modelo"] * score_modelo
            + PESOS_SCORE["zonas"] * score_zonas
            + PESOS_SCORE["localidad"] * score_localidad
        )

        # Lo que no se pudo verificar se descuenta una sola vez, aquí, en vez
        # de repartirlo entre los componentes: así queda visible en el JSON
        # cuánto le costó al proyecto no publicar sus datos.
        faltantes = proyecto.get("_dato_incompleto") or []
        penalizacion = PENALIZACION_DATO_INCOMPLETO * len(faltantes)
        score = max(0.0, score - penalizacion)

        seleccionado = dict(proyecto)
        seleccionado.update({
            "score": round(float(score), 4),
            "penalizacion_dato_incompleto": round(float(penalizacion), 4),
            "score_modelo": round(float(score_modelo), 4),
            "score_afinidad_perfil": round(float(afinidad_perfil), 4),
            "score_historial": round(float(score_historial), 4),
            "score_zonas": round(float(score_zonas), 4),
            "score_localidad": round(float(score_localidad), 4),
            "distancia_perfil": round(float(distancia), 4),
            "motor": motor,
        })
        resultados.append(seleccionado)

    # El score ordena DENTRO de cada tramo de prioridad, nunca entre tramos:
    # lo que cumple todos los requisitos del filtro va primero, y solo después
    # entra lo que se admitió relajando zonas o habitaciones.
    resultados.sort(key=lambda p: (p.get("_prioridad_filtro", 0), -p["score"],
                                   p["_distancia_localidad"], p["id_proyecto"]))
    proyectos_seleccionados = resultados[:top_n]
    return proyectos_seleccionados


def _escalar_vector(salario, personas, edad):
    """Lleva las tres features a [0, 1] con rangos fijos y aplica sus pesos."""
    valores = {
        "salario": salario if salario is not None else 2,
        "personas_a_cargo": personas if personas is not None else 2,
        "edad": edad if edad is not None else 35,
    }
    vector = []
    for nombre, valor in valores.items():
        minimo, maximo = RANGOS_FEATURES[nombre]
        normalizado = (float(valor) - minimo) / (maximo - minimo)
        normalizado = max(0.0, min(1.0, normalizado))   # acota fuera de rango
        vector.append(normalizado * PESOS_FEATURES[nombre])
    return vector


def k_automatico(n_registros, registros_por_perfil=1.0):
    """Vecinos a consultar para llegar a `PERFILES_A_CONSULTAR` perfiles distintos.

    Args:
        registros_por_perfil: cuántas filas del historial comparten, en
            promedio, el mismo vector (salario, personas, edad). Es lo que
            traduce "quiero 30 vecinos" a "pídele 570 filas al índice".
    """
    objetivo = PERFILES_A_CONSULTAR * max(1.0, float(registros_por_perfil))
    return max(K_VECINOS_MIN, min(K_VECINOS_MAX, int(round(objetivo))))


def _registros_por_perfil(registros):
    """Factor de repetición del historial: filas por vector distinto."""
    if not registros:
        return 1.0
    perfiles = {(r["salario"], r["personas_a_cargo"], r["edad"]) for r in registros}
    return len(registros) / len(perfiles)


def _scores_desde_historial(usuario_modelo, proyectos_preseleccionados,
                            ruta_historial, k_vecinos):
    """Puntaje colaborativo por vecinos históricos. Devuelve ({}, motor) si no hay datos."""
    registros = _cargar_historial(ruta_historial)
    if not registros:
        return {}, "contenido"

    matriz_historial = np.array([
        _escalar_vector(r["salario"], r["personas_a_cargo"], r["edad"]) for r in registros
    ])

    if k_vecinos is None:
        k_vecinos = k_automatico(len(registros), _registros_por_perfil(registros))
    k = int(min(k_vecinos, len(registros)))
    vecinos_historial = NearestNeighbors(n_neighbors=k, metric="euclidean")
    vecinos_historial.fit(matriz_historial)

    vector_usuario = np.array([_escalar_vector(
        usuario_modelo["salario"],
        usuario_modelo["personas_a_cargo"],
        usuario_modelo["edad"],
    )])
    distancias, indices = vecinos_historial.kneighbors(vector_usuario)

    ids_candidatos = {p["id_proyecto"] for p in proyectos_preseleccionados}
    acumulado = {}
    for distancia, indice in zip(distancias[0], indices[0]):
        registro = registros[int(indice)]
        id_proyecto = registro["id_proyecto"]
        if id_proyecto not in ids_candidatos:
            continue
        peso = 1.0 / (1.0 + float(distancia))    # vecino más cercano, más voto
        acumulado[id_proyecto] = acumulado.get(id_proyecto, 0.0) + peso * registro["interaccion"]

    if not acumulado:
        # Hay histórico, pero ningún vecino interactuó con estos candidatos.
        return {}, "contenido"

    maximo = max(acumulado.values())
    return {k_: v / maximo for k_, v in acumulado.items()}, "colaborativo+contenido"


def _cargar_historial(ruta_historial):
    """Lee y normaliza el histórico de interacciones. Lista vacía si no existe."""
    if not ruta_historial or not os.path.exists(ruta_historial):
        return []
    with open(ruta_historial, "r", encoding="utf-8") as archivo:
        datos = json.load(archivo)
    if isinstance(datos, dict):
        datos = datos.get("historial", [])

    registros = []
    for fila in datos:
        usuario = fila.get("usuario", fila)      # admite forma plana o anidada
        salario = _entero(usuario.get("salario"))
        personas = _entero(usuario.get("personas_a_cargo"))
        edad = _entero(usuario.get("edad"))
        id_proyecto = fila.get("id_proyecto")
        if None in (salario, personas, edad) or not id_proyecto:
            continue                             # registro incompleto: se ignora
        registros.append({
            "salario": salario,
            "personas_a_cargo": personas,
            "edad": edad,
            "id_proyecto": id_proyecto,
            "interaccion": float(fila.get("interaccion", 1.0)),
        })
    return registros


# ===========================================================================
# D. Normalización comercial del score
# ===========================================================================
def _precio_desempate(proyecto):
    """Precio del proyecto para desempatar, o infinito si no lo publica.

    Un proyecto sin precio no puede reclamar ser la mejor oferta del empate,
    así que se va al final del grupo en vez de ganarlo por defecto.
    """
    try:
        precio = float(proyecto.get("precio_desde_cop"))
    except (TypeError, ValueError):
        return float("inf")
    return precio if precio > 0 else float("inf")


def _desempatar_por_precio(ordenados, brutos):
    """Reordena los grupos que quedaron con el mismo porcentaje redondeado.

    Dentro de un empate manda el precio: entre dos proyectos que el modelo ve
    igual de compatibles, el más barato es la mejor oferta y se queda con el
    porcentaje alto; el otro baja un punto en `post_arreglos`.

    El empate se rompe **solo dentro del mismo tramo de `_prioridad_filtro`**:
    un proyecto admitido relajando requisitos no puede adelantar a uno que
    cumple todo por ser más barato. Como `brutos` no crece dentro de un tramo,
    los empates son siempre posiciones consecutivas.

    Returns:
        [(proyecto, porcentaje_bruto), ...] con los grupos reordenados.
    """
    pares = list(zip(ordenados, brutos))
    claves = [(proyecto.get("_prioridad_filtro", 0), bruto) for proyecto, bruto in pares]

    desempatados = []
    inicio = 0
    while inicio < len(pares):
        fin = inicio + 1
        while fin < len(pares) and claves[fin] == claves[inicio]:
            fin += 1
        desempatados.extend(sorted(pares[inicio:fin],
                                   key=lambda par: _precio_desempate(par[0])))
        inicio = fin
    return desempatados


def post_arreglos(proyectos_seleccionados, semilla=None, ruta_salida=RUTA_LLAMATIVOS):
    """Convierte los scores del modelo en porcentajes de compatibilidad.

    Dos capas, en este orden:

    1. **Normalización encadenada.** El primero muestra su propio score como
       porcentaje, elevado a `PORCENTAJE_TOP_MINIMO` si se queda corto. Cada
       uno de los siguientes resta los puntos de score que lo separan del
       proyecto inmediatamente anterior, no del líder: si el 3º tiene 0,06 de
       score menos que el 2º, muestra 6 puntos menos que el 2º. En caída
       libre, sin piso: si el encaje es malo, el porcentaje lo dice.

    2. **Desempate por precio.** La capa de arriba produce empates a propósito
       —dos scores casi iguales redondean al mismo número—, y ningún proyecto
       puede mostrar el mismo porcentaje que otro. Entre los empatados se
       queda con el número alto **el más barato**, y el resto baja de a un
       punto (`_desempatar_por_precio`).

    Args:
        semilla: se acepta por compatibilidad; ya no hay nada aleatorio que
            fijar. El porcentaje del líder sale de su score.
        ruta_salida: si no es None, guarda el resultado en ese JSON.

    Returns:
        proyectos_listos_llamativos, ordenada de mayor a menor porcentaje.
    """
    if not proyectos_seleccionados:
        return []

    # Mismo criterio que `modelo()`: la prioridad del filtro manda sobre el score.
    ordenados = sorted(proyectos_seleccionados,
                       key=lambda p: (p.get("_prioridad_filtro", 0), -p.get("score", 0.0)))
    scores = [float(p.get("score", 0.0)) for p in ordenados]

    # Capa 1. El líder: su score en porcentaje, con el mínimo de arriba.
    porcentaje = max(scores[0] * 100.0, PORCENTAJE_TOP_MINIMO)
    brutos = [int(round(porcentaje))]

    for anterior, actual in zip(scores, scores[1:]):
        # Cuánto peor es este que el de arriba, en puntos de score. Como la
        # cadena arranca en el score del líder, el porcentaje de cada uno
        # termina siendo su propio score más lo que se elevó al líder.
        # Se acota en 0 porque un proyecto admitido relajando requisitos puede
        # traer score bruto mayor y aun así ir detrás: nunca sube el
        # porcentaje, y el empate que eso produce lo resuelve la capa 2.
        porcentaje -= max(0.0, (anterior - actual) * 100.0)
        brutos.append(int(round(porcentaje)))

    # Capa 2. Entre los que quedaron con el mismo número manda el precio.
    ordenados = _desempatar_por_precio(ordenados, brutos)
    brutos = [bruto for _, bruto in ordenados]
    ordenados = [proyecto for proyecto, _ in ordenados]
    total = len(ordenados)

    proyectos_listos_llamativos = []
    porcentaje_anterior = None
    for posicion, (proyecto, porcentaje) in enumerate(zip(ordenados, brutos), start=1):
        if porcentaje_anterior is not None:
            # El orden debe leerse claro: siempre al menos un punto por debajo
            # del anterior. Es lo que separa a los empatados una vez que el
            # precio ya decidió cuál de ellos se queda con el número alto.
            porcentaje = min(porcentaje, porcentaje_anterior - PASO_MINIMO)
        # Que nadie se salga por abajo: se le reserva un punto a cada uno de
        # los que vienen detrás. No es un piso comercial —el último puede
        # aterrizar en 0— sino lo que impide que dos choquen contra el 0 y
        # terminen mostrando el mismo número.
        porcentaje = max(porcentaje, (total - posicion) * PASO_MINIMO)
        porcentaje_anterior = porcentaje

        listo = dict(proyecto)
        listo.update({
            "posicion": posicion,
            "porcentaje_compatibilidad": porcentaje,
            "porcentaje_texto": f"{porcentaje}%",
        })
        proyectos_listos_llamativos.append(listo)

    proyectos_listos_llamativos.sort(key=lambda p: -p["porcentaje_compatibilidad"])

    if ruta_salida:
        with open(ruta_salida, "w", encoding="utf-8") as archivo:
            json.dump(proyectos_listos_llamativos, archivo, ensure_ascii=False, indent=2)

    return proyectos_listos_llamativos
