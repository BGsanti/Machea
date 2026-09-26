"""Expone el modelo de recomendacion (Machea v0.1) por HTTP.

COPIA ESTE ARCHIVO A LA RAIZ DEL REPO DEL MODELO, junto a `main.py`, y
levantalo con:

    pip install fastapi uvicorn
    python servicio_machea.py            # escucha en http://localhost:8100

POR QUE HACE FALTA
------------------
El contrato del modelo es `from main import recomendar`: una funcion de
Python, no un endpoint. El front no puede importar Python, asi que alguien
tiene que envolverlo. Este archivo es ese alguien, y no toca `recomendar()`
ni una linea: solo lo llama y le añade lo que al front le falta.

LO QUE AÑADE (y por que)
------------------------
1. LAS FOTOS. El contrato las deja FUERA de la respuesta a proposito: dice que
   viven en `imagenes_proyectos/<id_proyecto>/`, numeradas 01, 02, y que la 01
   es la portada. Lo que NO dice es la extension. Si el front tuviera que
   adivinar entre .jpg, .webp y .png acabaria probando las tres y fallando en
   silencio en la que no acierte.

   Aqui se lista la carpeta del id y se devuelve `imagenes: [url, ...]` ya
   resuelto. Es una capa ENCIMA del contrato, no un cambio del contrato: si el
   modelo empieza a devolverlas el dia de mañana, esto sobra y se quita.

2. LOS ERRORES ENTEROS. `recomendar()` levanta un `ValueError` que junta TODOS
   los fallos del formulario en un solo texto en vez de parar en el primero,
   justamente para que el front los pueda marcar de una vez. Devolver solo el
   primero tiraria ese trabajo, asi que el 400 lleva el texto integro.

3. UN /salud QUE SIRVA. Dice si estan `proyectos_model.json` y las carpetas de
   imagenes. Un despliegue a medias se ve asi en una peticion, en vez de en
   seis tarjetas rotas y media hora de depuracion.
"""

import os
import pathlib
import sys

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from fastapi.staticfiles import StaticFiles
except ImportError:  # pragma: no cover - mensaje para quien lo levanta a mano
    sys.exit("Falta FastAPI. Instala con:  pip install fastapi uvicorn")

# La raiz del repo del modelo es donde esta este archivo.
RAIZ = pathlib.Path(__file__).resolve().parent
IMAGENES = RAIZ / "imagenes_proyectos"
CATALOGO = RAIZ / "proyectos_model.json"

# Las extensiones que puede haber dentro de una carpeta de proyecto. Se ordena
# por NOMBRE, no por extension: el contrato dice que la 01 es la portada, y eso
# es el nombre del archivo.
EXTENSIONES = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}

app = FastAPI(title="Machea v0.1 — servicio")

# El front se sirve desde otro origen (localhost:5500 o :7000), asi que sin
# esto el navegador bloquea la respuesta antes de que el JS la vea.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _fotos_de(id_proyecto) -> list:
    """Las URLs de las fotos de un proyecto, en orden. Vacio si no hay carpeta.

    No se inventa nada: si la carpeta no existe la lista sale vacia y el front
    pinta el degradado de siempre. Peor que una tarjeta sin foto es una tarjeta
    con la foto de otro proyecto.
    """
    if id_proyecto is None:
        return []
    carpeta = IMAGENES / str(id_proyecto)
    if not carpeta.is_dir():
        return []
    nombres = sorted(
        f.name for f in carpeta.iterdir()
        if f.is_file() and f.suffix.lower() in EXTENSIONES
    )
    return ["/imagenes_proyectos/%s/%s" % (id_proyecto, n) for n in nombres]


def _con_fotos(respuesta: dict) -> dict:
    """Añade `imagenes` a cada apartamento y cuenta a cuantos les falto."""
    sin = 0
    for apto in respuesta.get("apartamentos", []):
        apto["imagenes"] = _fotos_de(apto.get("id_proyecto"))
        if not apto["imagenes"]:
            sin += 1
    # Se dice cuantos se quedaron sin foto en vez de dejarlo notar por la
    # ausencia. Si un dia salen 6 de 6, es que la carpeta no esta donde toca.
    respuesta["sin_imagenes"] = sin
    return respuesta


CONSTRUCTORAS = ("amarilo", "bolivar", "colsubsidio", "cusezar")


def _solo_de(respuesta: dict, constructora: str) -> dict:
    """Deja en la respuesta solo los proyectos de esa constructora.

    ESTO ES UN PARCHE, Y CONVIENE QUE SE VEA COMO TAL. El contrato no tiene
    forma de pedir una sola constructora: `recomendar()` puntua sobre los 96
    proyectos de Bogota y devuelve SEIS. Aqui solo se puede filtrar DESPUES,
    asi que la respuesta se puede quedar en dos o tres tarjetas — medido sobre
    90 perfiles contra el motor local, sin filtro no habia NI UNO que
    devolviera seis proyectos de una sola marca.

    El arreglo de verdad es que el formulario del modelo acepte la
    constructora y filtre antes de puntuar, que es lo que hace
    `fake_machea.recomendar(d, constructora)`. Hasta entonces, la demo de una
    sola marca solo esta garantizada con el motor local, y por eso se dice
    cuantos se cayeron en vez de dejarlo notar por el hueco.
    """
    aptos = respuesta.get("apartamentos", [])
    quedan = [a for a in aptos
              if constructora in (a.get("constructoras") or [a.get("constructora")])]
    respuesta["apartamentos"] = quedan
    respuesta["constructora_filtrada"] = constructora
    respuesta["descartados_por_constructora"] = len(aptos) - len(quedan)
    respuesta["filtrado_despues_de_puntuar"] = True
    return respuesta


@app.post("/recomendar")
async def recomendar_http(request: Request):
    # El import va DENTRO para que el servicio arranque aunque el modelo tenga
    # un problema al importarse: asi /salud sigue contestando y dice cual es.
    try:
        from main import recomendar, respuesta_json
    except Exception as e:
        return JSONResponse({"error": "No se pudo importar el modelo: %s" % e}, 503)

    try:
        cuerpo = await request.json()
    except Exception:
        return JSONResponse({"error": "El cuerpo no es JSON valido."}, 400)

    try:
        resultado = recomendar(cuerpo, ruta_salida=None, verbose=False)
        respuesta = respuesta_json(resultado, ruta_salida=None)
    except ValueError as e:
        # El texto integro, con TODOS los errores del formulario juntos.
        return JSONResponse({"error": str(e)}, 400)
    except Exception as e:  # el modelo reventó por otra cosa
        return JSONResponse({"error": "El modelo fallo: %s" % e}, 500)

    # `?constructora=` es una extension NUESTRA, no del contrato. Una clave
    # desconocida se ignora en vez de dar 400: no es un dato del usuario, y una
    # demo entera no puede caerse por un slug mal escrito en la URL.
    pedida = (request.query_params.get("constructora") or "").strip()
    if pedida and pedida in CONSTRUCTORAS:
        respuesta = _solo_de(respuesta, pedida)
    else:
        respuesta["constructora_filtrada"] = None

    return JSONResponse(_con_fotos(respuesta))


@app.get("/salud")
async def salud():
    carpetas = []
    if IMAGENES.is_dir():
        carpetas = [d.name for d in IMAGENES.iterdir() if d.is_dir()]
    try:
        from main import recomendar  # noqa: F401
        modelo = "importable"
    except Exception as e:
        modelo = "NO importable: %s" % e
    return {
        "modelo": modelo,
        "proyectos_model.json": CATALOGO.is_file(),
        "imagenes_proyectos": IMAGENES.is_dir(),
        "carpetas_de_imagenes": len(carpetas),
        "raiz": str(RAIZ),
    }


# Las fotos, servidas tal cual. Va al final: montar en "/" antes que las rutas
# se las comeria.
if IMAGENES.is_dir():
    app.mount("/imagenes_proyectos", StaticFiles(directory=str(IMAGENES)), name="imagenes")


if __name__ == "__main__":
    import uvicorn

    puerto = int(os.environ.get("PUERTO", "8100"))
    print("Servicio Machea en  http://localhost:%d/" % puerto)
    print("  POST /recomendar   ·  GET /salud")
    if not IMAGENES.is_dir():
        print("  OJO: no existe %s — las tarjetas saldran sin foto." % IMAGENES)
    uvicorn.run(app, host="127.0.0.1", port=puerto)
