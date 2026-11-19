"""
features.formulario_personalizado
=================================
El diseño completo del formulario personalizado de una empresa: su marca en la
forma de `GDF_MARCA`, sus proyectos en la forma de `GDF_PROYECTOS`, las
opciones que tienen sentido para lo que vende y el espacio del diseño.

    from features.formulario_personalizado import armar_formulario
    diseno = armar_formulario(marca, tipo="constructora", catalogo=catalogo)

Función pura: no baja nada. La API (`api/formulario_personalizado.py`) le pasa
la marca, el catálogo, el token y las URLs. Contrato en CONTRATO.md.
"""

from features.formulario_personalizado.armar import (  # noqa: F401
    RESPONSABLE_DISENO,
    VERSION,
    armar_formulario,
    contraste,
    opciones_del_formulario,
    proyecto_para_el_front,
    tokens_sugeridos,
)

__all__ = [
    "armar_formulario",
    "proyecto_para_el_front",
    "opciones_del_formulario",
    "tokens_sugeridos",
    "contraste",
    "VERSION",
    "RESPONSABLE_DISENO",
]
