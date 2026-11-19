# `backend/features/` — guía de las funciones que leen el sitio de una empresa

Tres piezas que **no deciden qué se recomienda** (eso es `Model/`, invariante 8 del CLAUDE.md raíz) y que juntas
convierten el link de una empresa en un formulario personalizado:

```
link del sitio ──> scrap_identity ──> nombre, paleta, logo
               └─> scrap_proyectos ─> proyectos: qué vende, cifras, colores, fotos
                                         │
                   formulario_personalizado (puro) ──> diseño completo del formulario
                                         │
                   api/formulario_personalizado.py ──> POST/GET /api/formulario/personalizado
```

| Pieza | Archivo | Qué hace | Sale a internet |
|---|---|---|---|
| Identidad | `scrap_identity/scrap.py` | `extraer_colores(url)`: paleta y logo SVG (§10.1 del CLAUDE.md raíz). | Sí, por `_get` |
| Proyectos | `scrap_proyectos/scrap.py` | `extraer_proyectos(url)`: las fichas que publica, con fotos (§10.2). | Sí, por `scrap_identity._get` |
| Formulario | `formulario_personalizado/armar.py` | `armar_formulario(marca, catalogo=…)`: el diseño en las formas que lee el front. | No: función pura |

Y en `backend/api/`, la capa HTTP que los usa:

| Módulo | Rutas | Qué hace |
|---|---|---|
| `api/demo.py` | `POST /api/demo/solicitar`, `GET /api/marca/logo` | "Armar mi demo": marca + token firmado + correo. Ahora también pone en cola la lectura de proyectos. |
| `api/proyectos_web.py` | `GET /api/demo/proyectos` | Cola de lectura de proyectos en segundo plano (`programar`) y el catálogo ya leído (`catalogo_de`). |
| `api/formulario_personalizado.py` | `POST/GET /api/formulario/personalizado`, `…/personalizado.js`, `/api/formulario/imagen` | La versión API: datos del formulario → diseño completo. Expone la dependencia `formulario_de_la_demo`. |
| `api/captacion.py` | `POST /api/captacion/demo` | "Agenda una demo": si trae el sitio, también pone en cola la lectura de proyectos. |

---

## 1. Cómo usarlas

### Desde Python (backend/ como directorio de trabajo)

```python
from features.scrap_identity import extraer_colores
from features.scrap_proyectos import extraer_proyectos
from features.formulario_personalizado import armar_formulario

identidad = extraer_colores("constructora.com")                        # paleta + logo, guarda en identidades/
catalogo = extraer_proyectos("constructora.com", identidad=identidad)  # proyectos + fotos, guarda en empresas/
marca = {"nombre": identidad["empresa"], "primario": identidad["primario"],
         "acento": identidad["secundario"], "host": catalogo["dominio"]}
diseno = armar_formulario(marca, tipo="constructora", catalogo=catalogo)
```

`extraer_proyectos(url, guardar=False)` no escribe ni baja fotos (solo lista las candidatas). Con `dir_salida=…`
todo —también la identidad, en `_identidades/`— va a esa carpeta: úsalo para probar, así no se reescriben las
identidades versionadas del repo.

### Desde la consola

```bash
python features/scrap_identity/scrap.py https://www.constructora.com/ -v
python features/scrap_proyectos/scrap.py https://www.constructora.com/ -v --salida /tmp/prueba
python features/scrap_proyectos/scrap.py URL --max-proyectos 5 --sin-imagenes --sin-identidad --presupuesto 60
```

### Por HTTP (la API, ver el contrato)

```bash
# 1. Con los datos del formulario: marca + token, proyectos en cola
curl -s -X POST https://<api>/api/formulario/personalizado -H 'Content-Type: application/json' \
  -d '{"nombre":"Laura","correo":"laura@empresa.com","sitio":"empresa.com","tipo":"constructora"}'

# 2. Hasta que estado sea "completo" (o "sin_proyectos"): hasta ~4 minutos
curl -s "https://<api>/api/formulario/personalizado?d=<token>"

# 3. El mismo diseño como script, en el formato de tenants/<slug>/
curl -s "https://<api>/api/formulario/personalizado.js?d=<token>"
```

Contrato campo por campo: [`formulario_personalizado/CONTRATO.md`](formulario_personalizado/CONTRATO.md).

### Como dependencia de FastAPI

```python
from fastapi import APIRouter, Depends
from api.formulario_personalizado import formulario_de_la_demo

router = APIRouter()

@router.get("/api/algo-de-la-empresa")
def algo(diseno: dict = Depends(formulario_de_la_demo)):     # 404 sola si el token no es nuestro o venció
    return {"empresa": diseno["empresa"]["nombre"], "proyectos": len(diseno["proyectos"])}
```

Recuerda registrar el router en `api/app.py` (`app.include_router(...)`).

---

## 2. Dónde implementarlas

### Ya conectado

- **"Armar mi demo"** (landing, `frontend/index.html` `#demoForm` → `src/landing/landing.js` → `POST /api/demo/solicitar`):
  devuelve la demo como siempre y además `proyectos_web: "en_cola"`.
- **"Agenda una demo"** (landing, formulario por pasos → `POST /api/captacion/demo`): si trae `sitio`, sus proyectos
  se leen en segundo plano. Sirve para que Camila y quien atienda la demo sepan qué vende.
- **El token** de las dos es el mismo de `api/demo.py`: con él se consulta `/api/demo/proyectos` o
  `/api/formulario/personalizado`.

### Para conectar (lo que falta, y dónde va)

| Qué | Dónde | Notas |
|---|---|---|
| **Diseño visual del formulario personalizado** | Santiago Dias | Handoff completo en [`design/formulario-personalizado/README.md`](../../design/formulario-personalizado/README.md). |
| Cargar el diseño en el formulario | `frontend/public/experiencia/index.html`, el bloque que hace `document.write` de `tenants/<slug>/marca.js` y `proyectos.js` | Con `?formulario=<token>`, escribir en su lugar `<script src="/api/formulario/personalizado.js?d=<token>">`. Sigue cargando `tenants/machea/planos.js`. |
| Permitir ese script | `frontend/vercel.json` | Lo más limpio: un rewrite `/api/formulario/:ruta*` → la API (como `/api/cuentas`), así el script es del mismo origen y la CSP no cambia. La otra opción es sumar el host de la API a `script-src` de `/experiencia/(.*)`. Las fotos y el logo ya pasan: `img-src` incluye la API. |
| Hay que esperar los proyectos | El front | Consultar el JSON cada ~10 s hasta `estado` `completo`/`sin_proyectos`; mientras tanto el formulario funciona con `marca` y `proyectos: []`. |
| Mostrar los proyectos de la empresa en `/admin` o en el CRM | `api/admin.py` / el CRM | Con `proyectos_web.catalogo_de(host)`. |
| Guardar lo leído para que sobreviva un despliegue | `api/proyectos_web.py` (`_correr`) | Hoy queda en el disco del servidor. Un bucket (Cloud Storage) para las fotos y una tabla para el JSON. |

---

## 3. Reglas que no se rompen

1. **Toda descarga pasa por `scrap_identity._get`**, buscado en cada llamada (`_ident._get(...)`, nunca copiado a
   un nombre local). `api/ssrf.py` (`instalar()`) lo reemplaza por la versión segura: solo IPs públicas, cada
   redirección revalidada, tope de tamaño y de tiempo. Una feature que abra su propia conexión se salta el blindaje.
2. **Lo que no se sabe no se inventa.** El segmento (VIS/VIP/No VIS) solo sale si la página lo escribe; un segmento que
   contradice su precio se avisa (`_segmento_aviso`), no se corrige. `vis` en el front es `false` sin segmento.
3. **Una amenidad desconocida se reporta** (invariante 2): `mapear_zonas_comunes` del scraper del catálogo, la misma
   tabla de alias; lo que no encaja va a `zonas_comunes_no_mapeadas`.
4. **Las rutas las declara `Model/rutas.py`** (invariante 9): `DIR_IDENTIDADES`, `DIR_PROYECTOS_WEB`.
5. **El diseño habla el idioma del front.** `marca` y `proyectos` tienen la forma de `tenants/<slug>/marca.js` y
   `proyectos.js`. `tests/test_formulario_personalizado.py` lo compara contra los archivos reales: si el front cambia,
   falla esa prueba, no la pantalla de un cliente.
6. **Nada de texto de un sitio ajeno llega crudo al HTML ni al prompt de Manuela.** El nombre pasa por
   `demo.limpiar_nombre_marca` y se escapa en `copy`; el `.js` escapa `</` y los separadores de línea.
7. **Las salidas de `scrap_proyectos` no se versionan**: `features/scrap_proyectos/empresas/` está en `.gitignore`
   (fotos). Las cuatro identidades de las constructoras del catálogo en `scrap_identity/identidades/` sí están en el
   repo: una corrida de prueba sin `dir_salida` las reescribe, así que revisa `git status` después de probar.

## 4. Variables

| Variable | Efecto |
|---|---|
| `EXTRAER_PROYECTOS_WEB` | `1` enciende la lectura de proyectos, `0` la apaga. Sin la variable, solo en producción (`RENDER` o `ENTORNO=produccion`). En local y en las pruebas no sale a internet. |
| `DEMO_SECRET` | Firma de los tokens (si falta, se deriva de `DAPTA_API_KEY`). Cambiarla invalida todos los formularios. |
| `DEMO_SOLICITUDES_POR_IP_HORA` | Tope de creación por conexión (12 por defecto), compartido con la demo. |
| `FRONT_URL` | Origen del front para `demo_url`. |

## 5. Pruebas

```bash
python -m unittest tests.test_scrap_proyectos tests.test_formulario_personalizado -v   # sin red
python -m unittest discover -s tests -t .                                               # todo el backend
```

Las de la API necesitan las dependencias de `requirements.txt` (FastAPI). Ninguna sale a internet: el sitio de la
constructora es un diccionario y las fotos se fabrican con Pillow.

## 6. Límites conocidos

- **No se ejecuta JavaScript**: un sitio que pinta sus precios en el navegador sale sin precios (Amarilo).
- Los proyectos tardan hasta 4 minutos; la marca, segundos.
- El disco de Render y Cloud Run es efímero.
- Tipografía, superficie y portada no se leen del sitio: son decisiones de diseño (`diseno.decisiones_abiertas`).
