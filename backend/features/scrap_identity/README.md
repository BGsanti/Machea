# scrap_identity — la identidad visual de una empresa

Recibe la URL que una inmobiliaria escribe en el formulario y devuelve su
**paleta** y su **logo**, listos para vestir la experiencia con su marca.

```python
from features.scrap_identity import extraer_colores

identidad = extraer_colores("https://www.constructorabolivar.com/")
identidad["primario"]          # '#fed141'
identidad["logo"]["archivo"]   # 'Constructora_Bolivar.svg'
```

```bash
python features/scrap_identity/scrap.py https://www.constructorabolivar.com/
python features/scrap_identity/scrap.py URL1 URL2 -v          # varias de una vez
python features/scrap_identity/scrap.py URL --sin-logo        # solo la paleta
python features/scrap_identity/scrap.py URL --por-apariciones # orden por cuenta cruda
```

Escribe una carpeta por empresa, **nombrada con ella**:

```
features/scrap_identity/identidades/
└── Constructora_Bolivar/
    ├── paleta_Constructora_Bolivar.json
    └── Constructora_Bolivar.svg
```

Es el mismo contrato de `imagenes_proyectos/<id_proyecto>/`: el nombre de la
carpeta **es** la llave, así que el front pasa del nombre de la empresa a sus
archivos sin ninguna tabla intermedia. La raíz la declara `Model/rutas.py`
(`DIR_IDENTIDADES`), no este módulo — invariante 9 del CLAUDE.md.

---

## El JSON

```jsonc
{
  "empresa": "Constructora Bolívar",
  "carpeta": "Constructora_Bolivar",       // la carpeta y el prefijo de los archivos
  "url": "https://www.constructorabolivar.com/",
  "dominio": "www.constructorabolivar.com",
  "extraido_en": "2026-09-22T18:17:19+00:00",
  "_empresa_confianza": "media",           // alta · media · baja
  "_empresa_evidencia": "<title>",         // qué dato dio el nombre

  "primario":   "#fed141",                 // <- lo que el front necesita
  "secundario": "#00843d",
  "acento":     "#0d6efd",                 // null si no hay un tercer tono distinto
  "fondo":      "#ffffff",
  "texto":      "#000000",

  "marca":   ["#0d6efd", "#198754", "#fed141", "#00843d"],   // los saturados
  "neutros": ["#000000", "#ffffff", "#6c757d"],              // grises y blancos

  "paleta": [                              // todo lo medido, ordenado
    {
      "hex": "#fed141",
      "apariciones": 3,                    // veces que aparece escrito
      "peso": 49.04,                       // lo mismo, ponderado por la fuente
      "rol": "marca",                      // marca · neutro
      "tono": 47.8, "saturacion": 0.99, "luminosidad": 0.63,
      "fuentes": ["hoja_css", "logo"]
    }
  ],
  "theme_color": null,                     // <meta name="theme-color">, si lo hay

  "logo": {
    "archivo": "Constructora_Bolivar.svg",
    "origen": "https://.../logo-constructora-bolivar.svg",
    "formato_origen": "svg",               // svg · png · jpeg · webp · ico…
    "vectorial": true,                     // false = ráster envuelto en SVG
    "ancho": 90.0, "alto": 113.0, "bytes": 27680,
    "fondo_recomendado": "claro",          // "oscuro" = el logo es casi blanco
    "colores": [{"hex": "#fed141", "fraccion": 0.817}],
    "_confianza": "alta",                  // alta · media · baja
    "_evidencia": "<img> con pista de logo en la cabecera que nombra a la empresa",
    "_descartados": []                     // candidatos probados y por qué fallaron
  },

  "fuentes": {
    "hojas_css": ["https://…/css/…"],
    "colores_leidos": 972, "colores_distintos": 165,
    "orden": "peso",
    "frameworks": ["bootstrap"]            // ver más abajo: importa
  }
}
```

---

## Las tres decisiones que no son obvias

### 1. El orden no es la cuenta cruda

Se cuenta **cada aparición**, pero cada una suma según *dónde* apareció:

| fuente | peso | por qué |
|---|---:|---|
| `theme_color` | 20 | la marca declarando cuál es su color |
| `variable_css` | 6 | un token de diseño (`--color-primario: …`) |
| `estilo_html` · `svg_html` | 2 | el CSS crítico de la propia página |
| `hoja_css` | 1 | una regla cualquiera de una hoja enlazada |
| `logo` | 60 × fracción | lo que ese color ocupa del logo |

Un reset de CSS declara `#fff` doscientas veces y el `theme-color` de la marca
una sola: ordenar por cuenta pelada pondría el blanco primero y el color de la
empresa último. El JSON publica **los dos números** —`apariciones` y `peso`—
para que se pueda auditar, y `--por-apariciones` ordena por la cuenta cruda.

### 2. El logo manda sobre el CSS

`primario`, `secundario` y `acento` salen **del logo** cuando el logo tiene
color; el CSS solo rellena lo que quede libre.

No es una preferencia estética, es lo que salió al medir las cuatro
constructoras del catálogo. En **Constructora Bolívar y Colsubsidio** la hoja
de estilos está dominada por las variables por defecto de Bootstrap, y el
color más pesado del CSS resultaba ser el azul `#0d6efd` de la plantilla:

| | por CSS (antes) | por logo (hoy) | el de verdad |
|---|---|---|---|
| Amarilo | `#ffc900` | `#ffc900` | amarillo |
| Cusezar | `#fb010b` | `#fb010b` | rojo |
| Constructora Bolívar | `#0d6efd` ❌ | `#fed141` + `#00843d` | amarillo y verde |
| Colsubsidio | `#0d6efd` ❌ | `#0067b1` + `#ffd000` | azul y amarillo |

Un sitio mete en su CSS el color de cada plugin que instala; en su logo, no.
`fuentes.frameworks` avisa cuando se reconoce una paleta de plantilla, que es
la explicación de por qué un JSON puede parecerse al del vecino.

Dos guardas evitan que el logo mande de más: un color que pinta menos del
**4 %** del logo es un detalle (las barritas del de Cusezar), y un color con
luminosidad por encima de **0,80** no puede encabezar nada — un pastel no
aguanta texto encima.

### 3. El logo siempre es SVG

`FORMATO_LOGO = "svg"`, sin excepciones: el front busca `<Empresa>.svg` y no
tiene que probar dos extensiones por empresa.

Se llegó ahí midiendo. El primer diseño normalizaba todo a PNG, pero el logo
real resultó ser SVG en **tres de las cuatro** constructoras, y rasterizar un
SVG pide `cairosvg` o `svglib` → una librería nativa de Cairo que en Windows no
está. Sin ella el ranking se caía hasta el `og:image` y guardaba **la foto de
un proyecto** como si fuera el logo. Al revés no hay ese problema:

- **origen SVG** → se guarda tal cual, sigue siendo vectorial de verdad.
- **origen ráster** → Pillow lo normaliza a PNG y va dentro de un `<image>`.

Eso último no vectoriza nada y el JSON no finge que sí: `vectorial: false` y
`formato_origen` dicen de dónde salió. Al SVG se le quitan `<script>` y los
`on*` antes de guardarlo: viene de un tercero y lo va a servir nuestro front.

---

## Lo que no hace

- **No ejecuta JavaScript.** Lee el HTML que sirve el servidor. En un sitio que
  pinta la cabecera desde React —Metrocuadrado, por ejemplo— el `<img>` del
  logo no está en el HTML y se cae al favicon; queda dicho en
  `logo._confianza: "baja"` y en `_evidencia`, nunca en silencio.
- **No adivina el nombre.** Se prueban `og:site_name`, el JSON-LD de la
  organización, las metas de aplicación y el `<title>`, en ese orden; el
  desempate entre "Marca | Eslogan" y "Eslogan - Marca" lo da el dominio. Si
  nada sirve, el nombre es el dominio y `_empresa_confianza` dice `baja`.
- **No toca el modelo.** Nada de aquí entra en `recomendar()` (invariante 8).
- **No está conectado al front todavía.** No hay endpoint en `api/app.py`; se
  llama desde Python o por CLI. Para el endpoint, `extraer_colores(url,
  guardar=False)` devuelve el dict sin escribir en disco.

## Las carpetas de `identidades/` se versionan

Son 80 KB de texto para las cuatro constructoras y sirven de ejemplo concreto
del contrato. Se regeneran corriendo el módulo; si una empresa cambia de
imagen, se vuelve a correr con su URL y la carpeta se sobreescribe.
