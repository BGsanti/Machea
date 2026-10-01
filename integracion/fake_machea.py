"""Motor de recomendacion LOCAL, con el contrato de Machea v0.1.

    python integracion/fake_machea.py          # http://localhost:8100

QUE ES Y QUE NO ES
------------------
NO es el modelo. El modelo de Machea es `colaborativo+contenido`: aprende de un
historial simulado de clientes y por eso puede recomendar cosas que las reglas
no verian. Esto son REGLAS, y punto.

Lo que SI es: un servicio que habla el mismo contrato (§3 entra, §6 sale) y
recomienda sobre EL MISMO catalogo real —los 96 proyectos de Bogota de
plataforma/datos/proyectos_bogota.json— con sus fotos de verdad. Sirve para
dos cosas:

  1. Desarrollar y verificar el front sin tener el repo del modelo delante.
  2. Que la demo funcione igual si el dia del montaje el modelo no esta
     levantado. El campo `motor` de la respuesta dice siempre cual de los dos
     contesto, asi que nadie puede confundirlos por accidente.

Cuando el modelo este disponible se cambia a integracion/servicio_machea.py y
el front no se entera: mismo contrato, mismas fotos, mismos ids.

Sin dependencias: solo la libreria estandar, igual que plataforma/servidor.py.
"""

import json
import pathlib
import re
import sys
import unicodedata
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DATOS = RAIZ / "plataforma" / "datos"
CATALOGO = DATOS / "proyectos_bogota.json"
IMAGENES = DATOS / "imagenes_proyectos"

# Las 20 localidades: el indice + 1 es el id del contrato (§4).
LOCALIDADES = [
    "Usaquén", "Chapinero", "Santa Fe", "San Cristóbal", "Usme",
    "Tunjuelito", "Bosa", "Kennedy", "Fontibón", "Engativá",
    "Suba", "Barrios Unidos", "Teusaquillo", "Los Mártires", "Antonio Nariño",
    "Puente Aranda", "La Candelaria", "Rafael Uribe Uribe", "Ciudad Bolívar",
    "Sumapaz",
]

# QUE LOCALIDADES COLINDAN. Hace falta porque 6 de las 20 no tienen ni un
# proyecto (Tunjuelito, Antonio Nariño, La Candelaria, Rafael Uribe Uribe,
# Ciudad Bolivar, Sumapaz): sin esto, elegirlas devolveria lista vacia, y el
# contrato promete en §4 que eso no pasa nunca.
#
# Es geografia del Distrito, no un dato del catalogo. Se escribe por id.
VECINAS = {
    1: [2, 11, 12],                  # Usaquén
    2: [1, 3, 12, 13],               # Chapinero
    3: [2, 4, 13, 14, 17],           # Santa Fe
    4: [3, 5, 17, 18],               # San Cristóbal
    5: [4, 6, 18, 19],               # Usme
    6: [5, 8, 18, 19],               # Tunjuelito
    7: [8, 19],                      # Bosa
    8: [6, 7, 9, 16, 19],            # Kennedy
    9: [8, 10, 16],                  # Fontibón
    10: [9, 11, 12, 13],             # Engativá
    11: [1, 10, 12],                 # Suba
    12: [1, 2, 10, 11, 13],          # Barrios Unidos
    13: [2, 3, 10, 12, 14, 16],      # Teusaquillo
    14: [3, 13, 15, 16, 17],         # Los Mártires
    15: [14, 16, 17, 18],            # Antonio Nariño
    16: [8, 9, 13, 14, 15],          # Puente Aranda
    17: [3, 4, 14, 15],              # La Candelaria
    18: [4, 5, 6, 15],               # Rafael Uribe Uribe
    19: [5, 6, 7, 8],                # Ciudad Bolívar
    20: [5, 19],                     # Sumapaz
}

PISOS = {0: "bajo", 1: "medio", 3: "alto", 4: "sin preferencia"}

# Techo de precio por escalon de salario, en pesos. Es un SUPUESTO nuestro para
# poder ordenar, no un dato del contrato ni una regla de credito: sale de una
# cuota del 30 % del ingreso a 20 años. El modelo de verdad calcula
# `ingreso_requerido_smmlv` en serio.
SMMLV = 1_623_500  # 2026
TECHO = {1: 190_000_000, 2: 380_000_000, 3: 760_000_000, 4: 3_000_000_000}


def sin_tildes(s):
    s = unicodedata.normalize("NFD", str(s or ""))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower().strip()


CATALOGO_CACHE = None


def catalogo():
    global CATALOGO_CACHE
    if CATALOGO_CACHE is None:
        CATALOGO_CACHE = json.loads(CATALOGO.read_text(encoding="utf-8"))
    return CATALOGO_CACHE


def validar(d):
    """Los errores del formulario, TODOS a la vez — igual que el modelo real.

    El contrato se molesta en juntarlos en un solo texto en vez de parar en el
    primero, para que el front los pueda marcar de una vez. Aqui se respeta.
    """
    e = []

    def rango(campo, lo, hi, texto=None):
        v = d.get(campo)
        if not isinstance(v, int) or isinstance(v, bool) or not (lo <= v <= hi):
            e.append("  - %s (recibido: %r)" % (
                texto or "%s debe estar entre %d y %d" % (campo, lo, hi), v))

    rango("salario", 1, 4)
    rango("personas_a_cargo", 1, 4)
    rango("edad", 18, 125)
    # `Localidad` con L mayuscula; se acepta minuscula por compatibilidad (§1).
    if "Localidad" not in d and "localidad" in d:
        d["Localidad"] = d["localidad"]
    rango("Localidad", 1, 20)
    rango("numero_habitaciones", 1, 3,
          "numero_habitaciones debe estar entre 1 y 3, donde 3 es '3 o mas'")
    if d.get("tipo_vivienda") not in (0, 1):
        e.append("  - tipo_vivienda debe ser 0 (No VIS) o 1 (VIS) (recibido: %r)"
                 % d.get("tipo_vivienda"))
    return e


def zonas_pedidas(d):
    """Separa las zonas del vocabulario de las que no lo son.

    Una zona desconocida NO es un error: §5 dice que se ignora y se reporta
    aparte. La comparacion va sin tildes para que 'Zona de lavanderia' cruce
    con 'Zona de lavandería'.
    """
    z = d.get("zonas_comunes") or []
    if isinstance(z, str):
        z = [x.strip() for x in z.split(",") if x.strip()]
    voc = {sin_tildes(v): v for v in catalogo()["meta"]["zonas_comunes"]}
    dentro = [voc[sin_tildes(x)] for x in z if sin_tildes(x) in voc]
    fuera = [x for x in z if sin_tildes(x) not in voc]
    return dentro, fuera


def distancia_localidad(destino, origen):
    """0 si es la misma, 1 si colinda, 2 si esta a dos saltos, 3 lo demas."""
    if destino == origen:
        return 0
    if destino in VECINAS.get(origen, []):
        return 1
    for v in VECINAS.get(origen, []):
        if destino in VECINAS.get(v, []):
            return 2
    return 3


def puntuar(p, d, pedidas):
    """De 0 a 1. El reparto imita los pesos que declara el contrato."""
    partes = []

    # Ubicacion (30 %). Nunca deja a nadie en cero: por eso el contrato puede
    # prometer que jamas devuelve lista vacia.
    dist = distancia_localidad(p["Localidad"], d["Localidad"])
    partes.append((0.30, [1.0, 0.62, 0.34, 0.12][dist]))

    # Tipo de vivienda (15 %).
    partes.append((0.15, 1.0 if p["tipo_vivienda"] == d["tipo_vivienda"] else 0.25))

    # Precio contra el techo del escalon de salario (20 %). Graduado, no
    # binario: si fuera "cabe / no cabe", dos proyectos que caben de sobra
    # puntuarian igual y mover el salario casi nunca reordenaria nada.
    techo = TECHO[d["salario"]]
    precio = p.get("precio_desde_cop") or 0
    if not precio:
        partes.append((0.20, 0.5))
    elif precio <= techo:
        # Dentro del presupuesto, mejor cuanto mas holgado, sin premiar lo
        # ridiculamente barato: se satura en la mitad del techo.
        partes.append((0.20, min(1.0, 0.6 + 0.4 * (techo - precio) / (techo * 0.5))))
    else:
        partes.append((0.20, max(0.0, 0.45 - 0.45 * (precio - techo) / techo)))

    # Habitaciones (15 %). Sin dato no se castiga: el proyecto no lo publica.
    hab = p.get("numero_habitaciones")
    pedidas_hab = d["numero_habitaciones"]
    if not hab:
        partes.append((0.15, 0.5))
    elif hab == pedidas_hab:
        partes.append((0.15, 1.0))
    elif hab > pedidas_hab:
        partes.append((0.15, 0.75))
    else:
        partes.append((0.15, 0.3))

    # Zonas comunes (20 %) — el peso que declara el contrato. Sin pedir nada,
    # neutro para todos: no se puede premiar al que tiene mas amenidades porque
    # el usuario no dijo que le importaran.
    if not pedidas:
        partes.append((0.20, 0.6))
    else:
        tiene = {sin_tildes(z) for z in p.get("zonas_comunes") or []}
        aciertos = sum(1 for z in pedidas if sin_tildes(z) in tiene)
        partes.append((0.20, aciertos / len(pedidas)))

    return sum(peso * valor for peso, valor in partes)


def fotos_de(idp):
    carpeta = IMAGENES / str(idp)
    if not carpeta.is_dir():
        return []
    return ["/imagenes_proyectos/%d/%s" % (idp, f.name)
            for f in sorted(carpeta.iterdir()) if f.is_file()]


CONSTRUCTORAS = ("amarilo", "bolivar", "colsubsidio", "cusezar")

# Proyectos que NO se recomiendan, con el motivo en datos/excluidos.json: tres
# fichas que dan 404, unos locales comerciales que no son vivienda y un
# proyecto vendido. No se borran del catalogo —es la fuente de verdad y sus
# ids tienen que seguir siendo contiguos— asi que se saltan aqui.
def _cargar_excluidos():
    ruta = DATOS / "excluidos.json"
    if not ruta.is_file():
        return frozenset()
    d = json.loads(ruta.read_text(encoding="utf-8"))
    return frozenset(x["id_proyecto"] for x in d.get("excluidos", []))


EXCLUIDOS = _cargar_excluidos()


def recomendar(d, constructora=None):
    """`constructora` es una EXTENSION nuestra, no esta en el contrato.

    La demo se vende como "esta es TU app con TU catalogo", y el contrato no
    tiene forma de pedir una sola constructora: el modelo puntua sobre los 96
    proyectos de Bogota a la vez. Medido sobre 90 perfiles distintos, en NINGUNO
    salian seis proyectos de una sola marca —36 devolvian dos mezcladas, 43 tres
    y 11 las cuatro—, asi que la demo de Amarilo ensenaba tarjetas de Cusezar.

    EL FILTRO VA ANTES DE PUNTUAR, no despues. Filtrar el top 6 dejaria dos o
    tres tarjetas; filtrando el catalogo el top 6 se llena siempre (la mas
    pequena, Cusezar, tiene 14 proyectos) y ademas el porcentaje sale de
    compararse con los suyos, que es lo que la constructora quiere saber.

    Se manda por la URL (`?constructora=bolivar`) para no tocar el cuerpo, que
    esta verificado llave por llave contra el ejemplo del §3.
    """
    P = [p for p in catalogo()["proyectos"] if p["id_proyecto"] not in EXCLUIDOS]
    if constructora:
        # Filtro ESTRICTO por `constructora`, no por pertenencia a
        # `constructoras`. Seis proyectos los publican Bolivar y Colsubsidio a
        # la vez con precios distintos —hasta un 19 % (Baviera Park: $247,7M
        # contra $306,5M)— y en el catalogo el precio que viaja es el de
        # Bolivar. Colarlos en la demo de Colsubsidio pondria un precio
        # equivocado en la tarjeta, que es peor que no ensenarlos.
        P = [p for p in P if p.get("constructora") == constructora]
    pedidas, fuera = zonas_pedidas(d)

    puntuados = sorted(((puntuar(p, d, pedidas), p) for p in P),
                       key=lambda t: -t[0])
    # DIECIOCHO, no seis: el front los reparte en tres paginas de seis. El
    # recorrido de `compatibilidad` no se resiente porque se mapea desde el
    # score CRUDO (ver `a_porcentaje` abajo) y no desde el rango del top, asi
    # que el #18 vale lo que vale y no un 62 por ser el ultimo.
    top = puntuados[:18]

    # El contrato muestra `compatibilidad` entre 62 y 98. El score CRUDO se
    # mapea a ese recorrido, no el rango del top 6.
    #
    # Estirar min..max a 62..98 fue el primer intento y estaba mal: forzaba al
    # #1 a 98 y al #6 a 62 SIEMPRE, aunque los seis fueran mediocres o los seis
    # excelentes. Es el mismo vicio del podio fijo que se quito del front —un
    # numero que describe la POSICION disfrazado de calidad—. Asi, un top 1
    # flojo se ve flojo, que es la informacion que el usuario necesita.
    def a_porcentaje(bruto):
        return max(62, min(98, int(round(62 + bruto * 36))))

    apartamentos = []
    for i, (score, p) in enumerate(top):
        pct = a_porcentaje(score)
        tiene = {sin_tildes(z) for z in p.get("zonas_comunes") or []}
        apartamentos.append({
            "posicion": i + 1,
            "compatibilidad": pct,
            "compatibilidad_texto": "%d%%" % pct,
            "id_proyecto": p["id_proyecto"],
            "nombre_proyecto": p["nombre_proyecto"],
            "tipo_vivienda": "VIS" if p["tipo_vivienda"] == 1 else "No VIS",
            "localidad": p["localidad_nombre"],
            "direccion": p.get("direccion") or "",
            "precio_desde_cop": p.get("precio_desde_cop") or 0,
            "area_construida_m2": p.get("area_desde_m2") or 0,
            "habitaciones": p.get("numero_habitaciones") or 0,
            "cumple_habitaciones": (not p.get("numero_habitaciones")
                                    or p["numero_habitaciones"] >= d["numero_habitaciones"]),
            "aplica_subsidio_caja": bool(p.get("aplica_subsidio_caja")),
            # Cuota a 20 años al 12 % E.A. sobre el 90 % del precio. Es una
            # ESTIMACION para poder enseñar un numero; el modelo la calcula en
            # serio y la UI lo rotula como estimado.
            "cuota_mensual_estimada_cop": cuota(p.get("precio_desde_cop") or 0),
            "ingreso_requerido_smmlv": round(
                cuota(p.get("precio_desde_cop") or 0) / 0.3 / SMMLV, 2),
            "zonas_comunes": p.get("zonas_comunes") or [],
            "zonas_en_comun": [z for z in pedidas if sin_tildes(z) in tiene],
            "url_ficha": p.get("link_proyecto") or "",
            # La misma obra publicada por dos constructoras, con precios
            # distintos: el contrato dice que vale la pena ofrecer las dos.
            "fichas_alternas": p.get("links_alternos") or [],
            "constructoras": p.get("constructoras") or [p.get("constructora")],
            # Lo que la constructora NO publica, para que el front pinte
            # "no informado" y nunca un 0.
            "datos_no_publicados": [c for c, v in (
                ("habitaciones", p.get("numero_habitaciones")),
                ("area_construida_m2", p.get("area_desde_m2")),
                ("precio_desde_cop", p.get("precio_desde_cop")),
            ) if not v],
            "score": round(score, 4),
            "imagenes": fotos_de(p["id_proyecto"]),
        })

    salida = {
        "generado_en": "",
        "motor": "reglas locales (NO es el modelo Machea)",
        # El front comprueba esto: si pidio una constructora y no viene, sabe
        # que el backend no le hizo caso y filtra el mismo.
        "constructora_filtrada": constructora or None,
        "total_preseleccionados": len(P),
        "usuario": {
            "nombre_completo": " ".join(
                x for x in [d.get("nombres"), d.get("apellidos")] if x) or None,
            "correo": d.get("correo"),
            "telefono": d.get("telefono"),
            "afiliado": bool(d.get("afiliado")),
            "perfil": {"salario": d.get("salario"),
                       "personas_a_cargo": d.get("personas_a_cargo"),
                       "edad": d.get("edad")},
            "busqueda": {
                "tipo_vivienda": "VIS" if d.get("tipo_vivienda") == 1 else "No VIS",
                "localidad": LOCALIDADES[d["Localidad"] - 1],
                "numero_habitaciones": d.get("numero_habitaciones"),
                "piso": PISOS.get(d.get("piso", 4), "sin preferencia"),
                "zonas_comunes": pedidas,
            },
        },
        "apartamentos": apartamentos,
        "sin_imagenes": sum(1 for a in apartamentos if not a["imagenes"]),
    }
    if fuera:
        salida["zonas_comunes_ignoradas"] = fuera
    return salida


def cuota(precio, tasa_ea=0.12, años=20):
    """Amortizacion francesa sobre el 90 % del precio. Estimacion, no oferta."""
    if not precio:
        return 0
    monto = precio * 0.9
    i = (1 + tasa_ea) ** (1 / 12) - 1
    n = años * 12
    return int(round(monto * i / (1 - (1 + i) ** -n)))


TIPOS = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
         ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif"}


class Handler(BaseHTTPRequestHandler):
    def _responder(self, cuerpo, codigo=200, tipo="application/json; charset=utf-8"):
        if isinstance(cuerpo, (dict, list)):
            cuerpo = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "*")
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_OPTIONS(self):
        self._responder(b"", 204, "text/plain")

    def do_POST(self):
        if self.path.split("?")[0] != "/recomendar":
            return self._responder({"error": "no existe"}, 404)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            d = json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return self._responder({"error": "El cuerpo no es JSON valido."}, 400)
        errores = validar(d)
        if errores:
            return self._responder(
                {"error": "JSON de usuario invalido:\n" + "\n".join(errores)}, 400)
        # Una constructora que no existe se ignora en vez de dar 400: no es un
        # dato del usuario ni del contrato, es una extension nuestra, y una
        # demo entera no puede caerse por un slug mal escrito en la URL.
        pedida = urllib.parse.parse_qs(
            urllib.parse.urlparse(self.path).query).get("constructora", [""])[0]
        if pedida and pedida not in CONSTRUCTORAS:
            print("  aviso: constructora %r desconocida, se ignora el filtro" % pedida)
            pedida = ""
        self._responder(recomendar(d, pedida or None))

    def do_GET(self):
        ruta = self.path.split("?")[0]
        if ruta == "/salud":
            carpetas = [c for c in IMAGENES.iterdir() if c.is_dir()] if IMAGENES.is_dir() else []
            return self._responder({
                "motor": "reglas locales (NO es el modelo Machea)",
                "catalogo": CATALOGO.name if CATALOGO.is_file() else None,
                "proyectos": len(catalogo()["proyectos"]) if CATALOGO.is_file() else 0,
                "carpetas_de_imagenes": len(carpetas),
                "fotos": sum(1 for _ in IMAGENES.rglob("*")) if IMAGENES.is_dir() else 0,
            })
        if ruta.startswith("/imagenes_proyectos/"):
            # Se resuelve DENTRO de la carpeta y se comprueba: sin esto, un
            # `../` en la ruta serviria cualquier archivo del disco.
            rel = ruta[len("/imagenes_proyectos/"):]
            f = (IMAGENES / rel).resolve()
            if not str(f).startswith(str(IMAGENES.resolve())) or not f.is_file():
                return self._responder({"error": "no existe"}, 404)
            return self._responder(f.read_bytes(), 200,
                                   TIPOS.get(f.suffix.lower(), "application/octet-stream"))
        self._responder({"error": "no existe"}, 404)

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8100
    if not CATALOGO.is_file():
        sys.exit("Falta %s" % CATALOGO)
    n = len(catalogo()["proyectos"])
    print("Motor LOCAL en  http://localhost:%d/   (NO es el modelo Machea)" % puerto)
    print("  %d proyectos de Bogota · POST /recomendar · GET /salud" % n)
    if not IMAGENES.is_dir():
        print("  OJO: no hay fotos. Corre  python plataforma/tools/generar_modelo.py")
    ThreadingHTTPServer(("127.0.0.1", puerto), Handler).serve_forever()
