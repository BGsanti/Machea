"""
features.scrap_proyectos
========================
Los proyectos que una empresa publica en su sitio web, a partir de su URL: qué
vende, sus cifras, sus colores y sus fotos, guardados en una carpeta por
empresa y una por proyecto.

    from features.scrap_proyectos import extraer_proyectos
    catalogo = extraer_proyectos("https://www.constructora.com/")

El detalle —cómo se encuentran las fichas, cómo se decide qué vende cada una y
qué fotos se descartan— está en el docstring de `scrap.py` y en el README.
"""

from features.scrap_proyectos.scrap import (          # noqa: F401
    clasificar_oferta,
    es_pagina_de_proyecto,
    extraer_proyectos,
    puntaje_url,
)

__all__ = [
    "extraer_proyectos",
    "clasificar_oferta",
    "es_pagina_de_proyecto",
    "puntaje_url",
]
