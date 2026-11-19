# Contrato: el formulario personalizado

La API recibe los datos del formulario de una empresa y devuelve el diseño completo de **su** formulario: su
marca, sus proyectos, las opciones que tienen sentido para lo que vende y el espacio para el diseño visual.

El diseño visual lo hace **Santiago Dias**. Este contrato es lo que la API le garantiza; lo que se decide en diseño
está en `diseno.decisiones_abiertas` y en [`design/formulario-personalizado/README.md`](../../../design/formulario-personalizado/README.md).

Versión del contrato: `version: 1`. Cualquier cambio que rompa una llave sube la versión.

## Endpoints

| Método y ruta | Qué hace |
|---|---|
| `POST /api/formulario/personalizado` | Recibe los datos del formulario. Lee la marca (unos segundos), firma un token, pone en cola la lectura de proyectos y devuelve el diseño. No manda correo. |
| `GET /api/formulario/personalizado?d=<token>` | El diseño de ese token, ya con los proyectos si terminaron de leerse. Para consultar hasta que `estado` sea `completo` o `sin_proyectos`. |
| `GET /api/formulario/personalizado.js?d=<token>` | Lo mismo como script: define `window.GDF_MARCA`, `window.GDF_PROYECTOS`, `window.GDF_LOCALIDADES_VECINAS` y `window.GDF_FORMULARIO` (el resto del diseño). Mismo formato que `tenants/<slug>/marca.js` y `proyectos.js`. |
| `GET /api/formulario/imagen?d=<token>&p=<id_proyecto>&i=<id_foto>` | Una foto de un proyecto, servida por nosotros (no depende del sitio de la empresa). |

Además, la dependencia de FastAPI `formulario_de_la_demo` (en `api/formulario_personalizado.py`) convierte un token en
este mismo diseño, para cualquier router nuevo: `diseno: dict = Depends(formulario_de_la_demo)`.

### Entrada del `POST`

```json
{
  "nombre": "Laura Gómez",          // de quien lo pide; 2+ caracteres
  "correo": "laura@empresa.com",
  "sitio": "empresa.com",           // el esquema es opcional
  "tipo": "constructora",           // "inmobiliaria" | "constructora"
  "empresa": "Constructora Andes",  // opcional: gana sobre el nombre leído del sitio
  "color": "#0a7f5a"                // opcional: gana sobre el color leído del sitio
}
```

Errores: `400` con el motivo en `detail` (correo, tipo, link inválido o que apunta a la red interna), `429` con
`Retry-After` (12 por conexión y hora, 5 por correo al día, 60 en total por hora), `404` con un token falso o vencido.

### Ciclo

```
POST  ──>  estado: "esperando_proyectos"   (marca lista, proyectos en cola)
GET   ──>  estado: "esperando_proyectos"   (sigue leyendo: hasta 4 minutos)
GET   ──>  estado: "completo"              (con proyectos)  |  "sin_proyectos"  (el sitio no publica fichas legibles)
```

`estado: "solo_marca"` quiere decir que la lectura de proyectos está apagada (`EXTRAER_PROYECTOS_WEB=0`, o fuera de
producción sin la variable) o que falló hace menos de una hora.

## La respuesta

```json
{
  "ok": true,                          // solo en el POST
  "token": "v1.…",                     // solo en el POST; dura 30 días
  "version": 1,
  "estado": "completo",                // completo | sin_proyectos | esperando_proyectos | solo_marca
  "estado_proyectos": "listo",         // el de la cola: en_cola | extrayendo | listo | error | ocupado | null
  "empresa": { … },
  "demo_url": "https://www.machea.co/experiencia/index.html?marca=machea&demo=v1.…",
  "consultar": { "json": "https://<api>/api/formulario/personalizado?d=…", "js": "https://<api>/api/formulario/personalizado.js?d=…" },
  "marca": { … },                      // forma de window.GDF_MARCA
  "proyectos": [ … ],                  // forma de window.GDF_PROYECTOS
  "formulario": { … },                 // opciones sugeridas por pregunta
  "diseno": { … },                     // el espacio de Santiago
  "_incompleto": false                 // la lectura de proyectos se cortó por tiempo
}
```

Todas las URLs (logo, fotos, `consultar`) son **absolutas** y apuntan a la API, porque el formulario vive en otro
dominio. La API las arma con el host y el `X-Forwarded-Proto` de la petición.

### `empresa`

| Llave | Qué es |
|---|---|
| `nombre`, `tipo`, `sitio`, `dominio` | Quién es. |
| `marca_detectada` | `true` si se leyeron sus colores del sitio, `false` si salió con los de Machea; `null` cuando se rearma desde el token (el token no lo guarda). |
| `que_vende` | `{principal, tipos: {vivienda: 12, …}, operaciones: {venta: 10, arriendo: 2}}`, o `null` sin proyectos. |

### `marca`: la forma de `window.GDF_MARCA`

Las mismas llaves que `frontend/public/experiencia/tenants/machea/marca.js`, más dos. La prueba
`test_la_marca_tiene_la_forma_del_tenant_real` compara contra ese archivo: si el front cambia su forma, falla.

| Llave | Valor |
|---|---|
| `slug` | Siempre `"machea"`: la estructura y la superficie clara de Machea. |
| `identidad` | `{nombre, dominio, sitio, logo, marcaChica}`. `logo` es la URL del SVG saneado, o `""`. |
| `paleta` | `{primario, acento, tinta}` en `#rrggbb`. |
| `tipografia` | `{titulos: "Poppins", cuerpo: "Manrope"}` (no se lee del sitio; decisión abierta). |
| `copy` | Los textos de siempre con el nombre de la empresa. `splashLead` lleva HTML (`<strong>`) con el nombre **escapado**. `habeasData` es el texto de demostración de `js/demo.js`. |
| `geo` | `{ciudades, campoUbicacion, etiquetaZona, vecindad, zonas}`: las zonas donde la empresa tiene proyectos. |
| `negocio`, `portada` | Como en el tenant de Machea. |
| `personalizado` | `true`. Nueva. |
| `demo` | Nueva: exactamente lo que `js/demo.js` arma al leer `?demo=<token>` (`nombre, tipo, primario, acento, tieneLogo, fondoLogo, host, token`). Con ella `js/tema.js` pinta los colores de la empresa **sin cambiar una línea**. |

### `proyectos`: la forma de `window.GDF_PROYECTOS`

Las llaves que el front ya lee, con su nombre de siempre (comparadas contra `tenants/machea/proyectos.js`):

| Llave | De dónde sale |
|---|---|
| `id` | `id_proyecto` (1…N por nombre). |
| `name`, `direccion`, `url` | La ficha del sitio. |
| `localidad`, `ciudad`, `muni` | Localidad oficial si es Bogotá (§6 del CLAUDE.md raíz); ciudad en todo caso. `barrio` va vacío. |
| `price` | Precio "desde" en COP. En arriendo es el canon (`precio_es_canon: true`). `0` si no se publica. |
| `area`, `hab`, `habMax`, `banos` | Mínimos y máximo de habitaciones. `0` si no se publica. |
| `vis` | `true` solo si la ficha **escribe** VIS o VIP. Sin segmento escrito, `false`. |
| `image`, `galeria[]` | La portada y cada foto `{url, label, clave, tipo: "proyecto"}`. `url` es `/api/formulario/imagen…` si la foto se bajó, o la de origen si no. |
| `amenidades[]` | `{label, icon: "", clave}` con el vocabulario de 25 del modelo. |
| `tipologias`, `tour360`, `video` | Vacíos: el sitio no se lee para eso. |

Y las que agrega el sitio de la empresa (el front de hoy no las lee): `tipo`, `tipos`, `segmento`, `operacion`,
`estado_obra`, `precio_es_canon`, `areaHasta`, `lat`, `lon`, `colores: {primario, secundario, acento, principales}`.

### `formulario`: qué preguntar

Sugerencias para el diseño con los ids de `js/data.js`. El formulario de hoy **todavía no las lee**: arma sus
preguntas solo. Si no hay proyectos, `preguntas` va vacío y el formulario sale completo, como el de Machea.

| Pregunta (`id`) | Llave | Qué trae |
|---|---|---|
| `operacion` | `opciones` | `compra` si algún proyecto se vende, `arriendo` si alguno se arrienda. |
| `tipo_propiedad` | `opciones` | `Vivienda`, `Oficinas`, `Bodegas` según lo que vende (consultorios y locales van como Oficinas). |
| `tipo` | `opciones`, `_evidencia` | `VIS` / `No VIS` según los segmentos escritos; las dos si ninguna ficha lo dice. |
| `zona` | `campo`, `opciones` | Las localidades si todo es Bogotá; si no, las ciudades. |
| `habitaciones` | `opciones` | Las cantidades que ofrece. |
| `entorno_deseado` | `amenidades` | Las amenidades de sus proyectos, la más común primero. |

Más `rango_precios` y `rango_canon` (`{desde, hasta}` o `null`).

### `diseno`: el espacio de Santiago

| Llave | Qué es |
|---|---|
| `responsable`, `estado` | `"Santiago Dias"`, `"pendiente"`. |
| `base_actual` | Lo que se ve hoy si se usa el diseño tal cual: el tenant de Machea con los colores de la empresa. |
| `tokens_sugeridos` | `--primario`, `--acento`, `--tinta`, `--fondo`, `--texto-sobre-primario`, `--texto-sobre-acento` y `_contraste` con las razones WCAG medidas (`boton_aa_texto_normal`, `primario_como_texto_aa`…). |
| `imagen_destacada` | La portada del primer proyecto, o `null`. |
| `decisiones_abiertas` | Lo que la API no decide: tipografía, superficie, portada, cómo se ven los proyectos, qué hacer sin contraste AA, si las opciones recortan preguntas. |
| `contrato` | La ruta de este archivo. |

## Qué NO hace

- No manda correo ni dispara llamadas: eso es `/api/demo/solicitar` y `/api/llamar`.
- No guarda nada en la base. El token lleva la marca; los proyectos viven en el disco del servidor
  (`features/scrap_proyectos/empresas/`), que en Render y Cloud Run se borra en cada despliegue.
- No decide qué se recomienda (invariante 8): las recomendaciones siguen saliendo de `/api/recomendar`.
