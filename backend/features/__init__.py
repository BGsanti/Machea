"""
features
========
Capacidades del backend que **no** deciden qué se recomienda.

Todo lo que ordena, filtra o puntúa proyectos vive en `Model/` (invariante 8
del CLAUDE.md). Aquí van las piezas que acompañan al producto sin tocar esa
decisión, cada una en su carpeta y sin depender de las demás:

    scrap_identity/   paleta y logo de una empresa a partir de su sitio web

Sus rutas de salida se declaran en `Model/rutas.py`, que sigue siendo la única
fuente de rutas del backend.
"""
