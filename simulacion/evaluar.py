"""
simulacion/evaluar.py
=====================
Mide si el historial simulado le está sirviendo de algo al modelo.

La pregunta que responde: **¿el componente colaborativo acierta más que el de
contenido solo?** Si la respuesta fuera no, el historial sería peso muerto.

Cómo se mide, sin hacer trampa:

1. Se generan clientes de PRUEBA con una semilla distinta a la del historial,
   así que el modelo nunca los vio.
2. A cada uno se le hace "comprar" un proyecto con el mismo modelo de utilidad
   que produjo el historial. Esa utilidad incluye el **atractivo latente**, una
   señal que el recomendador no puede deducir de `proyectos_model.json`: solo
   puede aprenderla de las interacciones de otros clientes parecidos.
3. Se le piden al recomendador sus primeras `TOP_N_EVALUACION` posiciones y
   se mira si la compra está ahí.

    recall@N = compras que el top acertó / compras totales

Como el atractivo latente es lo único que separa a los dos modos, la
diferencia de recall es exactamente lo que aporta el historial.

Uso:
    python simulacion/evaluar.py
    python simulacion/evaluar.py --clientes-prueba 300 --semilla 7
"""

from __future__ import annotations

import argparse
import os
import random
import sys

DIRECTORIO = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(DIRECTORIO)
for _ruta in (RAIZ, DIRECTORIO):
    if _ruta not in sys.path:
        sys.path.insert(0, _ruta)

from generar_historial import (  # noqa: E402
    RUTA_CLIENTES,
    atractivo_latente,
    cargar_clientes,
    elegir_proyecto,
)
from modelo import (  # noqa: E402
    RUTA_HISTORIAL,
    RUTA_MODELO,
    _cargar_proyectos,
    modelo,
    primer_filtro,
)

import generar_clientes  # noqa: E402

# La ventana del recall NO sigue a `modelo.TOP_N`. Esto es un instrumento de
# calibración: los números que fijaron K_VECINOS y ALPHA_HISTORIAL se midieron
# sobre 6 posiciones, y si la ventana se moviera con el producto dejarían de
# ser comparables. Para medir la lista que se entrega hoy: `--top 18`.
TOP_N_EVALUACION = 6

CLIENTES_PRUEBA = 300
SEMILLA_PRUEBA = 20261231


def _clientes_de_prueba(cantidad, semilla, ruta_modelo):
    """Clientes nuevos, de los mismos arquetipos pero con otra semilla."""
    temporal = os.path.join(DIRECTORIO, ".clientes_prueba.json")
    por_arquetipo = max(1, cantidad // 10)
    generar_clientes.generar(
        variaciones=por_arquetipo, semilla=semilla, ruta_salida=temporal, verbose=False
    )
    try:
        return cargar_clientes(temporal)
    finally:
        if os.path.exists(temporal):
            os.remove(temporal)


def evaluar(cantidad=CLIENTES_PRUEBA, semilla=SEMILLA_PRUEBA, ruta_modelo=RUTA_MODELO,
            ruta_historial=RUTA_HISTORIAL, top_n=TOP_N_EVALUACION, verbose=True):
    """Compara recall@N con y sin historial. Devuelve el resumen como dict."""
    proyectos = _cargar_proyectos(ruta_modelo)
    atractivo = atractivo_latente(proyectos)
    rng = random.Random(semilla)
    clientes = _clientes_de_prueba(cantidad, semilla, ruta_modelo)

    aciertos_contenido = aciertos_colaborativo = evaluados = 0
    posiciones = []

    for usuario in clientes:
        candidatos = primer_filtro(usuario, ruta_modelo=ruta_modelo)
        if not candidatos:
            continue
        # La "verdad": lo que este cliente compraría, atractivo latente incluido.
        comprado = elegir_proyecto(usuario, candidatos, atractivo, rng)["id_proyecto"]
        evaluados += 1

        solo_contenido = modelo(candidatos, usuario, ruta_historial=None, top_n=top_n)
        con_historial = modelo(candidatos, usuario, ruta_historial=ruta_historial, top_n=top_n)

        ids_contenido = [p["id_proyecto"] for p in solo_contenido]
        ids_historial = [p["id_proyecto"] for p in con_historial]
        aciertos_contenido += comprado in ids_contenido
        if comprado in ids_historial:
            aciertos_colaborativo += 1
            posiciones.append(ids_historial.index(comprado) + 1)

    if not evaluados:
        raise RuntimeError("Ningún cliente de prueba superó el primer filtro.")

    resumen = {
        "clientes_evaluados": evaluados,
        "top_n": top_n,
        "recall_contenido": aciertos_contenido / evaluados,
        "recall_colaborativo": aciertos_colaborativo / evaluados,
        "posicion_media_del_acierto": (
            sum(posiciones) / len(posiciones) if posiciones else None
        ),
    }
    resumen["mejora_puntos"] = (
        resumen["recall_colaborativo"] - resumen["recall_contenido"]
    ) * 100

    if verbose:
        _reporte(resumen)
    return resumen


def _reporte(r):
    print("=" * 66)
    print(f" EVALUACIÓN  ·  {r['clientes_evaluados']} clientes de prueba no vistos")
    print("=" * 66)
    print(f" recall@{r['top_n']} solo contenido      : {r['recall_contenido']:6.1%}")
    print(f" recall@{r['top_n']} con historial       : {r['recall_colaborativo']:6.1%}")
    print(f" mejora que aporta el historial : {r['mejora_puntos']:+6.1f} puntos")
    if r["posicion_media_del_acierto"]:
        print(f" posición media del acierto     : {r['posicion_media_del_acierto']:6.2f}")
    print("=" * 66)
    if r["mejora_puntos"] <= 0:
        print(" AVISO: el historial no está aportando. Revisa que "
              "simulacion/clientes_simulados.json y historial_simulado.json")
        print("        se hayan regenerado después del último cambio del catálogo.")


def main():
    parser = argparse.ArgumentParser(description="Evalúa el recomendador contra clientes nuevos.")
    parser.add_argument("--clientes-prueba", type=int, default=CLIENTES_PRUEBA,
                        help="Clientes de prueba a generar (se reparten entre los 10 arquetipos).")
    parser.add_argument("--semilla", type=int, default=SEMILLA_PRUEBA)
    parser.add_argument("--modelo", default=RUTA_MODELO)
    parser.add_argument("--historial", default=RUTA_HISTORIAL)
    parser.add_argument("--top", type=int, default=TOP_N_EVALUACION,
                        help="Posiciones sobre las que se mide el recall.")
    args = parser.parse_args()
    evaluar(cantidad=args.clientes_prueba, semilla=args.semilla, ruta_modelo=args.modelo,
            ruta_historial=args.historial, top_n=args.top)


if __name__ == "__main__":
    main()
