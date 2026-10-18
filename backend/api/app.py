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

import hmac
import json
import logging
import os
import pathlib
import re
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional, Union

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Request
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

from api import acceso as acceso_mod
from api import admin as admin_mod
from api import captacion as captacion_mod
from api import cuentas as cuentas_mod
from api import demo as demo_mod
from api import llamadas
from api import seguimiento
from api.limites import Rechazo, ip_del_cliente, limites
from api.metricas import enmascarar_telefono, metricas

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

app.include_router(demo_mod.router)
app.include_router(admin_mod.router)
app.include_router(captacion_mod.router)
# Aprobación de cuentas de empresas desde /admin (login; ver design/login/CONTRATO_AUTH.md).
# Sin almacén de la nube conectado responde 503 `no_disponible`.
app.include_router(cuentas_mod.router)
# El login (api/acceso.py): rutas públicas /api/cuentas, /api/sesion y /api/clave. Las cuentas viven en
# Postgres (esquema `acceso`, supabase/migrations/20261014090000_cuentas_login.sql) y se conectan con
# DATABASE_URL, solo en las variables de Render. Sin ella, el login y /admin → Cuentas responden 503.
app.include_router(acceso_mod.router)
acceso_mod.instalar_manejadores(app)


def _conectar_cuentas() -> None:
    dsn = (os.environ.get("DATABASE_URL") or "").strip()
    if not dsn:
        return
    try:
        from api.almacen_acceso import AlmacenPostgres

        almacen = AlmacenPostgres(dsn)
    except Exception as exc:                        # nunca tumbar el arranque (el recomendador sigue)
        logging.getLogger("uvicorn.error").error("cuentas: no se pudo conectar la base: %s", type(exc).__name__)
        return
    acceso_mod.configurar_almacen(almacen)
    cuentas_mod.configurar_almacen(almacen)


def _avisar_decision(cuenta) -> None:
    payload = acceso_mod.correo_decision(cuenta)
    if payload:
        acceso_mod.enviar_correo(payload)


cuentas_mod.al_decidir = _avisar_decision
_conectar_cuentas()

# Frases para la actividad del panel de administración (api/admin.py): sin jerga de Dapta.
_MOTIVO_TOPE = {
    "telefono": "ya se pidió una llamada a ese número hace poco",
    "ip": "demasiadas desde la misma conexión",
    "total": "se llegó al cupo diario",
    "demo": "se llegó al cupo diario de demos",
}
_MOTIVO_COLGAR = {
    "user_hangup": "la persona colgó", "agent_hangup": "Manuela terminó la llamada", "voicemail_reached": "cayó en buzón de voz",
    "dial_no_answer": "no contestó", "dial_busy": "línea ocupada", "dial_failed": "no se pudo marcar",
    "invalid_destination": "número inválido", "concurrency_limit_reached": "Dapta sin canal libre",
    "call_transfer": "transferida a un asesor", "inactivity": "silencio prolongado", "max_duration_reached": "duración máxima",
}

@app.middleware("http")
async def _cabeceras_del_panel(request: Request, call_next):
    """Todo lo de /api/admin (también los errores 401/404/429) sale sin caché ni indexación.

    No basta con ponerlas en cada ruta: al lanzar una HTTPException, FastAPI descarta las
    cabeceras de la respuesta inyectada.
    """
    respuesta = await call_next(request)
    if request.url.path.startswith("/api/admin"):
        respuesta.headers["Cache-Control"] = "no-store"
        respuesta.headers["X-Robots-Tag"] = "noindex, nofollow"
        respuesta.headers["X-Content-Type-Options"] = "nosniff"
    return respuesta


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


# Formularios con marca propia (tenants del front) y a qué tipo de cliente
# corresponden. Cualquier otro valor se trata como el formulario neutro de Machea.
MARCAS_CONOCIDAS = {
    "machea": "inmobiliaria",
    "amarilo": "constructora",
    "colsubsidio": "constructora",
    "constructora-bolivar": "constructora",
    "cusezar": "constructora",
}


class ApartamentoLlamada(BaseModel):
    nombre_proyecto: str
    # Id del proyecto (Compra, `id_proyecto` del catálogo) o del inmueble (Arriendo, `id_inmueble`). Con él, el
    # backend sabe de qué constructora o inmobiliaria es, para el CRM (api/llamadas.py). Opcional: el motor local
    # del front no tiene ids.
    id_proyecto: Optional[Union[str, int]] = None
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
    # Marca del formulario desde el que llega el lead (`?marca=` del front). Hoy solo
    # informa: Manuela sigue hablando como Machea. Un slug desconocido cae a "machea".
    marca: Optional[str] = None
    # Token firmado de "Pruébalo con tu marca" (ver api/demo.py). Solo si el servidor
    # lo reconoce, Manuela se presenta como la asistente virtual de esa empresa.
    demo: Optional[str] = None
    # Autorización para compartir los datos con la empresa dueña del proyecto (design/crm/PLAN.md, fase 3).
    # Mientras el formulario no la pida, llega vacía y el lead no se comparte por el proyecto.
    autoriza_compartir: Optional[bool] = None
    version_autorizacion: Optional[str] = None
    apartamento: ApartamentoLlamada


@app.post("/api/llamar")
def api_llamar(payload: SolicitudLlamada, request: Request, tareas: BackgroundTasks):
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

    datos_demo = demo_mod.verificar(payload.demo) if payload.demo else None
    slug = (payload.marca or "").strip().lower()
    slug = slug if slug in MARCAS_CONOCIDAS else "machea"

    # Lo que el CRM de la empresa necesita de esta llamada (api/llamadas.py). Las demos con marca no se guardan.
    solicitud = None if datos_demo else llamadas.nueva_solicitud(
        telefono_e164=telefono_e164, nombre=demo_mod.limpiar_nombre_persona(payload.nombre), marca=slug,
        tipo_operacion=payload.tipo_operacion,
        tipo_inmueble=payload.tipo_inmueble, id_proyecto=str(apto.id_proyecto) if apto.id_proyecto is not None else None,
        nombre_proyecto=apto.nombre_proyecto, autoriza_compartir=payload.autoriza_compartir,
        version_autorizacion=payload.version_autorizacion)

    payload_dapta: dict[str, Any] = {
        # El nombre llega al prompt de Manuela: se limpia de todo lo que no sea un nombre.
        "nombre": demo_mod.limpiar_nombre_persona(payload.nombre) or "Cliente",
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
        # Dapta lo devuelve en las variables de la llamada: así el resultado se une con su solicitud.
        "external_lead_id": (f"{llamadas.PREFIJO_LEAD}{solicitud['id']}" if solicitud
                             else f"machea-{int(datetime.now(TZ_BOGOTA).timestamp())}"),
        # Marca: informa el formulario de origen; en demo, Manuela se presenta como la
        # asistente virtual de la empresa del prospecto Y avisa que es una demostración.
        "marca": slug,
        "tipo_cliente": datos_demo["t"] if datos_demo else MARCAS_CONOCIDAS[slug],
        "modo_demo": bool(datos_demo),
        "nombre_marca": datos_demo["n"] if datos_demo else "Machea",
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
            telefono=telefono_e164, ip=ip_del_cliente(request), demo=bool(datos_demo)
        )
    except Rechazo as exc:
        logger.warning("llamada rechazada (%s): tel=%s ip=%s", exc.motivo, telefono_e164[-4:], ip_del_cliente(request))
        metricas.registrar("llamada_rechazada", f"Llamada rechazada: {_MOTIVO_TOPE.get(exc.motivo, exc.motivo)} · "
                           f"{enmascarar_telefono(telefono_e164)}", "aviso")
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
        metricas.registrar("llamada_error", f"Dapta no aceptó el pedido de llamada · {enmascarar_telefono(telefono_e164)}", "error")
        raise
    metricas.registrar("llamada_enviada", f"Llamada de Manuela pedida a Dapta · {enmascarar_telefono(telefono_e164)}"
                       + (" · demo con marca" if datos_demo else ""), "ok")
    if solicitud:
        tareas.add_task(llamadas.guardar_solicitud, solicitud)
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


def _booleano(valor: Any) -> Optional[bool]:
    """Dapta entrega los booleanos del análisis como bool o como texto ("true"/"false")."""
    if isinstance(valor, bool):
        return valor
    if isinstance(valor, str) and valor.strip().lower() in ("true", "false"):
        return valor.strip().lower() == "true"
    return None


def _webhook_manuela_autorizado(request: Request) -> bool:
    """¿Se puede guardar lo que trae este webhook?

    Con MANUELA_WEBHOOK_SECRET (24+ caracteres) puesto en Render, el webhook exige `?k=<secreto>` (lo pone el
    agente de Dapta en su webhook_url, como el de Camila) y responde 401 sin él. Sin el secreto funciona como
    antes, para no cortar el resumen post-llamada mientras se configura, pero no guarda nada en la base.
    """
    secreto = os.environ.get("MANUELA_WEBHOOK_SECRET", "")
    if not secreto:
        return False
    if len(secreto) < 24:
        logger.error("MANUELA_WEBHOOK_SECRET tiene menos de 24 caracteres: se ignora y no se guardan resultados")
        return False
    if not hmac.compare_digest(request.query_params.get("k", ""), secreto):
        raise HTTPException(status_code=401, detail="No autorizado")
    return True


@app.post("/webhooks/dapta/resultado")
async def webhook_resultado_llamada(request: Request, tareas: BackgroundTasks):
    """Receptor del webhook post-call de Dapta (agente Manuela — Machea).

    Dapta manda la llamada ANIDADA: el cuerpo trae las claves `data` y `call`,
    y `to_number`, `call_status` y `call_analysis` viven dentro de `data` (se
    comprobó con un envío real, 2026-10-06). Por eso se busca la llamada en
    `data`, luego en `call` y por último en el nivel superior. El cuerpo crudo
    se sigue registrando, por si Dapta cambia la forma otra vez.
    `custom_analysis_data` puede llegar como dict o como string JSON.
    """
    guardar = _webhook_manuela_autorizado(request)
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

    # ¿Nadie habló con Manuela? Buzón, ocupado, sin respuesta o el filtro de llamadas del teléfono
    # (iPhone con iOS 26 "Filtrar llamadas de desconocidos"): Dapta lo reporta como `voicemail_reached`
    # y devuelve un resumen en inglés. Se dice en español y con la causa probable.
    razon_corte = str(llamada.get("disconnection_reason") or "").lower()
    sin_contacto = razon_corte in seguimiento.SIN_CONTACTO or bool(analisis.get("in_voicemail"))
    resumen_dapta = datos.get("resumen_llamada") or analisis.get("call_summary")
    if sin_contacto and (not resumen_dapta or re.search(r"voicemail|skipped|no answer|busy", str(resumen_dapta), re.I)):
        resumen_dapta = ("No se llegó a hablar: la llamada se fue al buzón de voz o a un filtro de llamadas del teléfono "
                         "(en iPhone: Ajustes > Teléfono > Filtrar llamadas de desconocidos).")

    nuevo = {
        "listo": True,
        "sin_contacto": sin_contacto,
        "recibido_en": datetime.now(TZ_BOGOTA).isoformat(),
        "call_status": llamada.get("call_status"),
        "disconnection_reason": llamada.get("disconnection_reason"),
        "temperatura_lead": datos.get("temperatura_lead"),
        "resumen_llamada": resumen_dapta,
        "recomendacion_asesor": datos.get("recomendacion_asesor") or (
            "No se logró hablar con la persona: escribirle por WhatsApp para coordinar una hora." if sin_contacto else None),
        "estado_del_lead": datos.get("estado_del_lead"),
        "nivel_de_urgencia": datos.get("nivel_de_urgencia"),
        "tomador_de_decision": datos.get("tomador_de_decision"),
        "presupuesto_confirmado": datos.get("presupuesto_confirmado"),
        "fecha_de_seguimiento": datos.get("fecha_de_seguimiento"),
        "objecion_principal": datos.get("objecion_principal"),
        # Agenda (Manuela v2, docs/agente-manuela-v2.md): la cita que quedó acordada, si quedó.
        "cita_agendada": _booleano(datos.get("cita_agendada")),
        "fecha_hora_cita": datos.get("fecha_hora_cita"),
        "canal_cita": datos.get("canal_cita"),
        "motivo_no_agenda": datos.get("motivo_no_agenda") or ("buzon" if sin_contacto else None),
    }
    # Si Dapta manda más de un evento por llamada, uno sin análisis no debe
    # borrar los datos que dejó el anterior.
    previo = RESULTADOS_LLAMADAS.get(telefono_e164) or {}
    for clave, valor in nuevo.items():
        if valor in (None, "") and previo.get(clave) not in (None, ""):
            nuevo[clave] = previo[clave]
    RESULTADOS_LLAMADAS[telefono_e164] = nuevo
    motivo = nuevo.get("disconnection_reason")
    metricas.registrar("resultado_recibido", "Resultado de llamada recibido: "
                       f"{_MOTIVO_COLGAR.get(motivo, motivo or nuevo.get('call_status') or 'sin detalle')} · "
                       f"{enmascarar_telefono(telefono_e164)}", "ok")

    # Seguimiento por WhatsApp (api/seguimiento.py): si no contestó, colgó antes de calificar
    # o la llamada salió completa. Solo si el flow de envío está configurado, y solo para
    # llamadas salientes (en una entrante, `to_number` es el nuestro, no el del lead).
    # A la base solo llega lo que trae el secreto: es lo que verá la empresa en su CRM.
    if guardar and str(llamada.get("direction") or "outbound") != "inbound":
        tareas.add_task(llamadas.guardar_resultado, llamada, body, telefono_e164, dict(nuevo))

    if os.environ.get("DAPTA_WHATSAPP_FLOW_URL") and str(llamada.get("direction") or "outbound") != "inbound":
        pedido = seguimiento.preparar(llamada, telefono_e164)
        if pedido:
            tareas.add_task(seguimiento.enviar, pedido)
    return {"status": "ok"}


@app.get("/api/llamar/resultado")
def api_resultado_llamada(telefono: str):
    telefono_e164 = normalizar_telefono_e164(telefono)
    if not telefono_e164:
        raise HTTPException(status_code=400, detail="Teléfono inválido.")
    return RESULTADOS_LLAMADAS.get(telefono_e164, {"listo": False})
