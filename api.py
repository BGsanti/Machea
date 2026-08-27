"""
api.py
======
Capa HTTP sobre recomendar(). Expone el modelo a la landing de Machea para
el formulario en vivo del stand de GO FEST.

    uvicorn api:app --reload --port 8000

Solo para demo local: CORS abierto, sin auth. No exponer así a internet.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from catalogos import LOCALIDADES_BOGOTA, ZONAS_COMUNES
from main import recomendar, respuesta_json

app = FastAPI(title="Machea Recomendador API", version="0.1")

# URL del webhook del flow de Dapta (Flow Studio) que dispara la llamada de
# Manuela. Vacío -> modo mock: arma el payload y lo devuelve sin llamar a
# nadie. Se llena con `export DAPTA_FLOW_WEBHOOK_URL=...` antes de levantar
# uvicorn, nunca hardcodeado aquí.
DAPTA_FLOW_WEBHOOK_URL = os.environ.get("DAPTA_FLOW_WEBHOOK_URL")

TZ_BOGOTA = timezone(timedelta(hours=-5))
SMMLV_COP = 2_000_000  # actualizar cada año — mismo supuesto que prep.py

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class FormularioUsuario(BaseModel):
    nombres: Optional[str] = None
    apellidos: Optional[str] = None
    correo: Optional[str] = None
    telefono: Optional[int] = None
    afiliado: Optional[int] = None
    tipo_vivienda: int
    salario: int
    personas_a_cargo: int
    edad: int
    Localidad: int
    numero_habitaciones: int
    piso: Optional[int] = None
    zonas_comunes: Optional[List[str]] = None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/catalogos")
def catalogos():
    return {
        "localidades": [{"id": i + 1, "nombre": n} for i, n in enumerate(LOCALIDADES_BOGOTA)],
        "zonas_comunes": ZONAS_COMUNES,
    }


@app.post("/api/recomendar")
def api_recomendar(payload: FormularioUsuario):
    data = payload.model_dump(exclude_none=True)
    try:
        resultado = recomendar(data, ruta_salida=None, verbose=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return respuesta_json(resultado, ruta_salida=None)


def normalizar_telefono_e164(raw: str | None) -> str | None:
    """Mismo criterio que dapta_client.py: E.164 de móvil colombiano o None."""
    if not raw:
        return None
    digitos = re.sub(r"\D", "", str(raw))
    if not digitos:
        return None
    if digitos.startswith("00"):
        digitos = digitos[2:]
    if digitos.startswith("57") and len(digitos) > 10:
        digitos = digitos[2:]
    if len(digitos) == 10 and digitos.startswith("3"):
        return "+57" + digitos
    return None


class ApartamentoLlamada(BaseModel):
    nombre_proyecto: str
    localidad: str
    tipo_vivienda: str
    precio_desde_cop: float
    cuota_mensual_estimada_cop: Optional[float] = None
    aplica_subsidio_caja: bool = False


class SolicitudLlamada(BaseModel):
    nombre: str
    telefono: str
    afiliado: bool
    rango_ingreso: str
    edad: int
    personas_a_cargo: int
    entorno_deseado: str
    apartamento: ApartamentoLlamada


@app.post("/api/llamar")
def api_llamar(payload: SolicitudLlamada):
    telefono_e164 = normalizar_telefono_e164(payload.telefono)
    if not telefono_e164:
        raise HTTPException(
            status_code=400,
            detail="Ese número no parece un móvil colombiano válido (+57 3XXXXXXXXX).",
        )

    apto = payload.apartamento
    subsidio_estimado: float = (
        30 * SMMLV_COP if (apto.aplica_subsidio_caja and payload.afiliado) else 0
    )

    payload_dapta: dict[str, Any] = {
        "nombre": payload.nombre,
        "telefono": telefono_e164,
        "proyecto": apto.nombre_proyecto,
        "tipo_vivienda": apto.tipo_vivienda,
        "current_time": datetime.now(TZ_BOGOTA).strftime("%Y-%m-%d %H:%M"),
        "afiliado": payload.afiliado,
        "rango_ingreso": payload.rango_ingreso,
        "zona_interes": apto.localidad,
        "urgencia": "alta",
        "edad": payload.edad,
        "entorno_deseado": payload.entorno_deseado or "Sin preferencia declarada",
        "personas_a_cargo": payload.personas_a_cargo,
        "piso_preferido": "Sin preferencia",
        "tipo_inmueble": "apartamento",
        "proyecto_recomendado": apto.nombre_proyecto,
        "cuota_estimada_mensual": apto.cuota_mensual_estimada_cop or 0,
        "valor_estimado_vivienda": apto.precio_desde_cop,
        "subsidio_estimado": subsidio_estimado,
        "external_lead_id": f"gofest-{int(datetime.now(TZ_BOGOTA).timestamp())}",
    }

    if not DAPTA_FLOW_WEBHOOK_URL:
        return {
            "status": "mock_enqueued",
            "detalle": "DAPTA_FLOW_WEBHOOK_URL no está configurado — no se llamó a nadie.",
            "payload_enviado": payload_dapta,
        }

    import httpx

    with httpx.Client(timeout=20.0) as client:
        r = client.post(DAPTA_FLOW_WEBHOOK_URL, json=payload_dapta)
        r.raise_for_status()
    return {"status": "enviado", "detalle": f"Manuela está llamando a {telefono_e164}."}
