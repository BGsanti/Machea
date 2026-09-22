"""
features.scrap_identity
=======================
Identidad visual de una empresa a partir de su URL: la paleta de colores y el
logo, guardados en una carpeta con el nombre de la empresa.

    from features.scrap_identity import extraer_colores
    identidad = extraer_colores("https://www.amarilo.com.co/")

El detalle —de dónde salen los colores, por qué el logo siempre es PNG y cómo
se ordena la paleta— está en el docstring de `scrap.py` y en el README.
"""

from features.scrap_identity.scrap import (          # noqa: F401
    FORMATO_LOGO,
    candidatos_logo,
    extraer_colores,
    nombre_carpeta,
    nombre_empresa,
)

__all__ = [
    "extraer_colores",
    "candidatos_logo",
    "nombre_empresa",
    "nombre_carpeta",
    "FORMATO_LOGO",
]
