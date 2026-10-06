"""
api/app.py
==========
Capa HTTP sobre recomendar(). Expone el modelo a la landing de Machea para
el formulario en vivo del stand de GO FEST.

    uvicorn api.app:app --reload --port 8000     # desde backend/

Desplegado en Render (ver render.yaml). CORS abierto a propósito: la
landing y la experiencia embebida son públicas, sin login, y no hay dato
sensible propio que proteger aquí — el que sí importa (la API key de Dapta)
nunca sale de las variables de entorno del servidor.
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logger = logging.getLogger("uvicorn.error")

# `backend/` en el path: uvicorn puede arrancarse desde la raíz del repo, y ahí
# `Model` no sería importable sin esto.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from Model.arriendo import PRESUPUESTOS, TIPOS_ARRIENDO, parsear_zonas, recomendar_arriendo
from Model.catalogos import LOCALIDADES_BOGOTA, ZONAS_COMUNES, indice_localidad
from Model.grafo_barrios import barrios_de_localidad, hay_grafo_barrios
from Model.pipeline import recomendar, respuesta_json

from api.limites import Rechazo, ip_del_cliente, limites

app = FastAPI(title="Machea Recomendador API", version="0.1")

# URL del webhook del flow de Dapta (Flow Studio) que dispara la llamada de
# Manuela. Vacío -> modo mock: arma el payload y lo devuelve sin llamar a
# nadie. Se llena con `export DAPTA_FLOW_WEBHOOK_URL=...` antes de levantar
# uvicorn, nunca hardcodeado aquí.
DAPTA_FLOW_WEBHOOK_URL = os.environ.get("DAPTA_FLOW_WEBHOOK_URL")

# API key de la cuenta de Dapta dueña del flow. El endpoint del webhook
# responde 401 sin ella (header x-api-key). Se llena con
# `export DAPTA_API_KEY=...` antes de levantar uvicorn, nunca hardcodeada aquí.
DAPTA_API_KEY = os.environ.get("DAPTA_API_KEY")

TZ_BOGOTA = timezone(timedelta(hours=-5))
# El SMMLV se lee de `Model.prep`, que es donde vive el supuesto económico.
# Antes estaba duplicado aquí y el invariante 5 pedía actualizar los dos
# archivos a mano; ahora desfasarlos es imposible.
from Model.prep import SMMLV as SMMLV_COP

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Las fotos de cada proyecto NO viven en este servicio: son estáticos del
# front (`frontend/public/experiencia/imagenes_proyectos/<id_proyecto>/`,
# ~76 MB), y ese front ya las publica en su propio origen (Vercel) junto con
# la landing. Duplicarlas aquí y servirlas desde Render sería repetir ese
# peso en un segundo lugar sin necesidad. Por eso `imagenes` sale como rutas
# RELATIVAS (`/experiencia/imagenes_proyectos/12/01.webp`) para que el front
# las resuelva contra SU PROPIO origen (ver urlDeFoto() en recommender.js) y
# no contra MACHEA_BASE. Mismo criterio que integracion/servicio_machea.py
# (pensado para correr junto al modelo en un stand, con su propia copia de
# las fotos), pero sin copiarlas: aquí solo se listan las que ya existen en
# el repo del front.
_RAIZ_REPO = pathlib.Path(__file__).resolve().parent.parent.parent
_IMAGENES_DIR = _RAIZ_REPO / "frontend" / "public" / "experiencia" / "imagenes_proyectos"
_EXTENSIONES_IMAGEN = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}


def _fotos_de(id_proyecto: Any) -> List[str]:
    """Rutas relativas de las fotos de un proyecto, en orden (01 = portada).

    No se inventa nada: si la carpeta no existe la lista sale vacía y la
    tarjeta pinta el degradado de siempre — peor que una tarjeta sin foto es
    una tarjeta con la foto de otro proyecto.
    """
    if id_proyecto is None:
        return []
    carpeta = _IMAGENES_DIR / str(id_proyecto)
    if not carpeta.is_dir():
        return []
    nombres = sorted(
        f.name for f in carpeta.iterdir()
        if f.is_file() and f.suffix.lower() in _EXTENSIONES_IMAGEN
    )
    return ["/experiencia/imagenes_proyectos/%s/%s" % (id_proyecto, n) for n in nombres]


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
    # Opcional: nombre o código de sector catastral (ver GET /api/barrios).
    # No filtra; afina la distancia con la que el score mide la cercanía.
    barrio: Optional[str] = None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/catalogos")
def catalogos():
    return {
        "localidades": [{"id": i + 1, "nombre": n} for i, n in enumerate(LOCALIDADES_BOGOTA)],
        "zonas_comunes": ZONAS_COMUNES,
    }


@app.get("/api/barrios")
def barrios(localidad: int):
    """Los barrios (sectores catastrales) de una localidad, para un desplegable
    dependiente. Es la vía para que el front mande un `barrio` que el modelo
    reconozca sin copiarse los 1.164 nombres (invariante 6 del CLAUDE.md).
    """
    if indice_localidad(localidad) is None:
        raise HTTPException(status_code=400, detail="Localidad debe estar entre 1 y 20")
    return {
        "localidad": localidad,
        "disponible": hay_grafo_barrios(),
        "barrios": [{"id": codigo, "nombre": nombre}
                    for codigo, nombre in barrios_de_localidad(localidad)],
    }


@app.get("/api/arriendo")
def api_arriendo(
    tipo_inmueble: str,
    zona: List[str] = Query(default=[]),
    presupuesto: Optional[str] = None,
    habitaciones: Optional[int] = None,
    banos: Optional[int] = None,
    estrato: Optional[int] = None,
    parqueaderos: Optional[int] = None,
    estilo_vida: List[str] = Query(default=[]),
):
    """Match de Arriendo (vivienda/oficina/bodega) sobre el catálogo demo de
    scraper_arriendo.py, con porcentaje de compatibilidad -- ver
    `Model/arriendo.py` para la mezcla del score.

    Usa la misma cercanía, el mismo k-NN de perfil y la misma normalización de
    porcentajes que Compra, pero NO el componente colaborativo ni la cota de
    precio de `modelo.py`: esos se alimentan de un histórico de compras y de
    la cuota de una hipoteca, y arriendo no tiene ni lo uno ni lo otro.

    `zona` se repite una vez por sector elegido en el mapa, como `<localidad>`
    o `<localidad>:<barrio>`. Bodega/oficina solo mandan zona; Vivienda manda
    además presupuesto y las cuatro preferencias del contador del quiz.
    """
    tipo_inmueble = tipo_inmueble.strip().lower()
    if tipo_inmueble not in TIPOS_ARRIENDO:
        raise HTTPException(
            status_code=400,
            detail=f"tipo_inmueble debe ser uno de: {', '.join(TIPOS_ARRIENDO)}",
        )
    if presupuesto is not None and presupuesto not in PRESUPUESTOS:
        raise HTTPException(
            status_code=400,
            detail=f"presupuesto debe ser uno de: {', '.join(PRESUPUESTOS)}",
        )

    zonas = parsear_zonas(zona)
    if zona and not zonas:
        raise HTTPException(status_code=400, detail="Ninguna zona se reconoció (localidad 1 a 20)")

    preferencias = None
    if habitaciones is not None and banos is not None and estrato is not None:
        preferencias = {
            "habitaciones": habitaciones,
            "banos": banos,
            "estrato": estrato,
            "parqueaderos": parqueaderos or 0,
        }

    inmuebles = recomendar_arriendo(
        tipo_inmueble, zonas=zonas, presupuesto=presupuesto, preferencias=preferencias,
        estilo_vida=estilo_vida,
    )
    return {"tipo_inmueble": tipo_inmueble, "total": len(inmuebles), "inmuebles": inmuebles}


@app.post("/api/recomendar")
def api_recomendar(payload: FormularioUsuario):
    data = payload.model_dump(exclude_none=True)
    try:
        resultado = recomendar(data, ruta_salida=None, verbose=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    respuesta = respuesta_json(resultado, ruta_salida=None)
    sin_fotos = 0
    for apto in respuesta.get("apartamentos", []):
        apto["imagenes"] = _fotos_de(apto.get("id_proyecto"))
        if not apto["imagenes"]:
            sin_fotos += 1
    # Se dice cuántos se quedaron sin foto en vez de dejarlo notar por la
    # ausencia — si un día salen todos en cero, es que la carpeta no está
    # donde toca (o el checkout de Render no trajo `frontend/`).
    respuesta["sin_imagenes"] = sin_fotos
    return respuesta


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
    # Opcional desde que Arriendo también llama: su recorrido no pregunta la
    # edad (ver QUESTIONS_ARRIENDO en data.js), y mandar un 0 para cumplir el
    # contrato le diría a Manuela que tiene delante a alguien de cero años.
    edad: Optional[int] = None
    personas_a_cargo: int
    entorno_deseado: str
    # "compra" (por defecto, el recorrido de siempre) o "arriendo". Decide qué
    # le decimos a Manuela que está vendiendo: un canon mensual no se habla
    # como una cuota de hipoteca.
    tipo_operacion: str = "compra"
    # Solo Arriendo: vivienda | oficina | bodega. Compra siempre es vivienda.
    tipo_inmueble: Optional[str] = None
    apartamento: ApartamentoLlamada


@app.post("/api/llamar")
def api_llamar(payload: SolicitudLlamada, request: Request):
    telefono_e164 = normalizar_telefono_e164(payload.telefono)
    if not telefono_e164:
        raise HTTPException(
            status_code=400,
            detail="Ese número no parece un móvil colombiano válido (+57 3XXXXXXXXX).",
        )

    apto = payload.apartamento
    es_arriendo = payload.tipo_operacion == "arriendo"
    # En arriendo no hay subsidio de caja que estimar: es de compra de vivienda.
    subsidio_estimado: float = (
        30 * SMMLV_COP if (not es_arriendo and apto.aplica_subsidio_caja and payload.afiliado) else 0
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
        # Lo que el recorrido no preguntó va declarado como tal, no como un 0.
        "edad": payload.edad if payload.edad is not None else "No informada",
        "entorno_deseado": payload.entorno_deseado or "Sin preferencia declarada",
        "personas_a_cargo": payload.personas_a_cargo,
        "piso_preferido": "Sin preferencia",
        "tipo_operacion": payload.tipo_operacion,
        "tipo_inmueble": payload.tipo_inmueble or "apartamento",
        "proyecto_recomendado": apto.nombre_proyecto,
        # En arriendo el canon ES el pago mensual, y no hay un valor de compra
        # que estimar: dejarlo en `valor_estimado_vivienda` haría que Manuela
        # hablara de un apartamento de $4 millones.
        "cuota_estimada_mensual": (
            apto.precio_desde_cop if es_arriendo else (apto.cuota_mensual_estimada_cop or 0)
        ),
        "valor_estimado_vivienda": 0 if es_arriendo else apto.precio_desde_cop,
        "subsidio_estimado": subsidio_estimado,
        "external_lead_id": f"machea-{int(datetime.now(TZ_BOGOTA).timestamp())}",
    }

    if not DAPTA_FLOW_WEBHOOK_URL:
        return {
            "status": "mock_enqueued",
            "detalle": "DAPTA_FLOW_WEBHOOK_URL no está configurado — no se llamó a nadie.",
            "payload_enviado": payload_dapta,
        }

    import httpx

    # TOPES (ver api/limites.py): este endpoint llama de verdad a un móvil, sin
    # login y con CORS abierto. Se aplican solo en modo real: en mock no se
    # llama a nadie y no hay nada que proteger (ni que gastar).
    try:
        reserva = limites.reservar_llamada(
            telefono=telefono_e164, ip=ip_del_cliente(request), demo=False
        )
    except Rechazo as exc:
        logger.warning("llamada rechazada (%s): tel=%s ip=%s", exc.motivo, telefono_e164[-4:], ip_del_cliente(request))
        raise HTTPException(
            status_code=429, detail=exc.mensaje, headers={"Retry-After": str(exc.reintentar_en)}
        ) from exc

    # Se limpia cualquier resultado viejo para este número: si vuelve a llamar
    # (reintento o segunda vuelta), que el polling no devuelva el resumen de la
    # llamada anterior mientras la nueva sigue en curso.
    RESULTADOS_LLAMADAS.pop(telefono_e164, None)

    headers = {"x-api-key": DAPTA_API_KEY} if DAPTA_API_KEY else {}
    try:
        with httpx.Client(timeout=20.0) as client:
            r = client.post(DAPTA_FLOW_WEBHOOK_URL, json=payload_dapta, headers=headers)
            r.raise_for_status()
    except Exception:
        # Si Dapta no recibió el pedido, el cupo se devuelve: un fallo nuestro
        # no puede dejar a la persona sin poder reintentar durante una hora.
        reserva.liberar()
        raise
    return {
        "status": "enviado",
        "detalle": f"Manuela está llamando a {telefono_e164}.",
        "telefono": telefono_e164,
    }


# ---------------------------------------------------------------------------
# Paso 3: resumen de la llamada apenas Manuela cuelga.
#
# Dapta empuja el análisis post-llamada por su propio webhook (configurado en
# el agente, campo `webhook_url` — no está en este repo, se pone desde el
# dashboard de Dapta o por MCP). Este backend solo lo recibe, lo guarda en
# memoria por teléfono, y el frontend hace polling corto hasta que aparece.
#
# EN MEMORIA A PROPÓSITO. Un solo proceso, para un stand, sin necesidad de
# sobrevivir un redeploy: una base de datos sería reescribir todo esto para
# un problema que no existe todavía. Se pierde al reiniciar el servicio, y
# está bien que sea así.
#
# CORRELACIÓN POR TELÉFONO, con la misma limitación ya conocida del proyecto
# hermano (Colsubsidio): si dos leads comparten número en la misma ventana de
# tiempo, el resultado puede cruzarse. Para un stand de GO FEST, con tráfico
# bajo y cada quien probando con su propio celular, el riesgo es aceptable.
RESULTADOS_LLAMADAS: dict[str, dict[str, Any]] = {}


def _texto(valor: Any) -> Optional[str]:
    return str(valor) if valor not in (None, "") else None


@app.post("/webhooks/dapta/resultado")
async def webhook_resultado_llamada(request: Request):
    """Receptor del webhook post-call de Dapta (agente Manuela — Machea).

    Dapta manda la llamada ANIDADA: el cuerpo trae las claves `data` y `call`,
    y `to_number`, `call_status` y `call_analysis` viven dentro de `data` (se
    comprobó con un envío real, 2026-10-06). Por eso se busca la llamada en
    `data`, luego en `call` y por último en el nivel superior. El cuerpo crudo
    se sigue registrando, por si Dapta cambia la forma otra vez.
    `custom_analysis_data` puede llegar como dict o como string JSON.
    """
    body = await request.json()
    logger.info("webhook post-call de Dapta: %s", json.dumps(body, ensure_ascii=False)[:4000])

    def _con_telefono(d: Any) -> bool:
        return isinstance(d, dict) and any(d.get(k) for k in ("to_number", "telefono", "phone"))

    llamada = next(
        (c for c in (body.get("data"), body.get("call"), body) if _con_telefono(c)), None
    )
    if llamada is None:
        logger.warning("webhook post-call sin to_number reconocible: %s", list(body.keys()))
        return {"status": "ignorado", "detalle": "sin to_number"}

    telefono = _texto(llamada.get("to_number") or llamada.get("telefono") or llamada.get("phone"))
    telefono_e164 = normalizar_telefono_e164(telefono) or telefono

    analisis = llamada.get("call_analysis") or body.get("call_analysis")
    if isinstance(analisis, str):
        try:
            analisis = json.loads(analisis)
        except ValueError:
            analisis = {}
    analisis = analisis or {}

    datos = analisis.get("custom_analysis_data") or llamada.get("custom_analysis_data") or {}
    if isinstance(datos, str):
        try:
            datos = json.loads(datos)
        except ValueError:
            datos = {}

    nuevo = {
        "listo": True,
        "recibido_en": datetime.now(TZ_BOGOTA).isoformat(),
        "call_status": llamada.get("call_status"),
        "disconnection_reason": llamada.get("disconnection_reason"),
        "temperatura_lead": datos.get("temperatura_lead"),
        "resumen_llamada": datos.get("resumen_llamada") or analisis.get("call_summary"),
        "recomendacion_asesor": datos.get("recomendacion_asesor"),
        "estado_del_lead": datos.get("estado_del_lead"),
        "nivel_de_urgencia": datos.get("nivel_de_urgencia"),
        "tomador_de_decision": datos.get("tomador_de_decision"),
        "presupuesto_confirmado": datos.get("presupuesto_confirmado"),
        "fecha_de_seguimiento": datos.get("fecha_de_seguimiento"),
        "objecion_principal": datos.get("objecion_principal"),
    }
    # Si Dapta manda más de un evento por llamada, uno sin análisis no debe
    # borrar los datos que dejó el anterior.
    previo = RESULTADOS_LLAMADAS.get(telefono_e164) or {}
    for clave, valor in nuevo.items():
        if valor in (None, "") and previo.get(clave) not in (None, ""):
            nuevo[clave] = previo[clave]
    RESULTADOS_LLAMADAS[telefono_e164] = nuevo
    return {"status": "ok"}


@app.get("/api/llamar/resultado")
def api_resultado_llamada(telefono: str):
    telefono_e164 = normalizar_telefono_e164(telefono)
    if not telefono_e164:
        raise HTTPException(status_code=400, detail="Teléfono inválido.")
    return RESULTADOS_LLAMADAS.get(telefono_e164, {"listo": False})
