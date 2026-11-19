# `scrap_proyectos`: los proyectos de una empresa, desde su sitio

Recibe la URL que una inmobiliaria o constructora escribe en el formulario y devuelve, y guarda, un JSON con
cada proyecto que publica: qué vende, sus cifras, su ubicación, sus amenidades, sus colores en hex y sus fotos.

```
features/scrap_proyectos/empresas/<Empresa>/
    proyectos_<Empresa>.json
    <Nombre_Proyecto>/<id_proyecto>/01.jpg
                                    02.webp
                                    ...
```

Cada proyecto tiene su carpeta con su nombre, dentro una con su `id_proyecto`, y ahí todas sus fotos. Cada foto
lleva su propio `id` (`01`, `02`…), que es también su nombre de archivo; la primera es la portada. El nombre de
la carpeta es la llave, igual que en `imagenes_proyectos/<id_proyecto>/` y en `scrap_identity/identidades/`.

## Uso

```bash
# desde backend/
python features/scrap_proyectos/scrap.py https://www.constructora.com/ -v
python features/scrap_proyectos/scrap.py URL --max-proyectos 10 --sin-imagenes --presupuesto 120
```

```python
from features.scrap_proyectos import extraer_proyectos
catalogo = extraer_proyectos("constructora.com")          # el esquema es opcional
catalogo["proyectos"][0]["tipo"]                           # 'vivienda'
catalogo["proyectos"][0]["imagenes"][0]["ruta"]            # 'Bosque_Verde/1/01.jpg'
```

En producción corre sola: cuando alguien envía "Armar mi demo" o "Agenda una demo" con el link de su sitio,
`api/proyectos_web.py` la pone en cola en segundo plano (ver más abajo).

## El JSON

| Campo | Qué es |
|---|---|
| `empresa`, `carpeta`, `dominio` | Quién es y dónde quedó. |
| `que_vende` | `principal` y cuántos proyectos hay de cada tipo (`{"vivienda": 12, "oficinas": 2}`). |
| `empresa_identidad` | Resumen de `scrap_identity`: `primario`, `secundario`, `acento`, `marca`, logo. |
| `proyectos[]` | Una ficha por proyecto (tabla siguiente). |
| `descartados[]` | Cada página que se leyó y no se aceptó, con su motivo. Nada se cae en silencio. |
| `incompleto`, `_incompleto_motivo` | Si se acabó el tiempo o se llegó al tope de páginas. |
| `fuentes` | Sitemaps y listados leídos, páginas, segundos. |

| Campo del proyecto | Qué es |
|---|---|
| `id_proyecto` | 1…N, ordenados por nombre. |
| `nombre`, `url`, `descripcion` | De JSON-LD, `og:title`, `<title>` o `h1`, sin el nombre de la empresa. |
| `tipo`, `tipos`, `subtipos` | Qué vende: `vivienda`, `oficinas`, `consultorios`, `locales`, `bodegas`, `lotes`, `hotelero`. Un mixto trae dos en `tipos`. En vivienda, `subtipos`: apartamentos, casas… |
| `segmento` | `VIS`, `VIP` o `No VIS`, **solo si la página lo escribe**. |
| `operacion`, `estado_obra` | `venta` / `arriendo`; sobre planos, en construcción, entrega inmediata, vendido. |
| `ciudad`, `direccion`, `localidad`, `lat`, `lon` | Si es Bogotá, `localidad` sale de `scraper_projects.localidad_desde_direccion`. |
| `precio_desde_cop`, `precio_es_canon` | El "desde" más bajo. En arriendo es el canon mensual. |
| `area_m2`, `habitaciones`, `banos` | `{"desde", "hasta"}` y las cantidades que ofrece. |
| `zonas_comunes`, `zonas_comunes_no_mapeadas` | Con el vocabulario de 25 del modelo y la tabla de alias del catálogo (invariante 2). |
| `colores_principales`, `primario`, `secundario`, `acento` | Los colores del proyecto en hex. |
| `colores_pagina` | Los colores del CSS de esa ficha que no están en el resto del sitio. |
| `paleta` | Colores dominantes de sus fotos (`hex`, `fraccion`, `rol`). |
| `carpeta`, `imagenes[]` | `Nombre/id` y cada foto: `id`, `archivo`, `ruta`, `origen`, `portada`, `ancho`, `alto`. |
| `_confianza`, `_evidencia`, `_*_evidencia` | Qué dato decidió cada cosa. |

## Cómo decide

- **Qué páginas son proyectos.** Sitemaps (un `proyecto-sitemap.xml` de WordPress es la lista exacta), listados
  (`/proyectos`, con su paginación) y la forma de la URL. Sobre eso, la página tiene que *parecerlo por dentro*:
  JSON-LD `ApartmentComplex`/`Residence`, o varias señales a la vez (m², habitaciones, precio, sala de ventas,
  tipología, obra) **y** cifras de inmueble: m², o habitaciones con precio. Una URL de proyecto sin nada adentro se
  descarta con su motivo. Medido contra Cusezar, sin la regla de las cifras entraban seis artículos del blog
  ("Pasos para adquirir vivienda"…), que nombran precios y ventas sin publicar un solo m².
- **Lo que no es ficha, aunque lo parezca.** Los slugs de artículos (`tips-`, `pasos-`, `guia-`, `como-`…) ni se
  bajan; "proyectos" en plural en el slug (`/home-proyectos/`) es un listado; "vivienda" o "apartamento" dentro de un
  slug no basta para ser ficha. Y lo que manda es a dónde llegó la página: si redirige o declara como canónica una del
  blog, se descarta.
- **Solo lo de esa ficha.** Antes de leerla se quita el bloque que presenta *otros* proyectos (el contenedor más
  pequeño que enlaza a dos fichas distintas), sin tocar nunca el que contiene su `<h1>`. Contra Cusezar, sin esto
  seis de ocho fichas salían con el precio, el área y hasta las fotos de la tarjeta vecina.
- **El nombre.** Lo que en el JSON-LD, el `h1` o el `<title>` coincide con la URL: el título trae el SEO
  ("Proyecto Murales: Apartamentos VIS en Bogotá") y `/proyectos/murales` trae "Murales".
- **Qué vende.** Palabras de siete familias, con el título, la descripción, la URL y el JSON-LD pesando 4 veces
  más que el cuerpo. "Locales comerciales" en el cuerpo de un conjunto residencial no lo vuelve comercial; "oficina
  de ventas", "casa club" y "sala de ventas" no cuentan.
- **Qué fotos.** `og:image` y JSON-LD primero (portada), luego galería. Se descartan logos, íconos, lo que vive en la
  cabecera o el pie, las menores de 300 px, las bandas de más de 4:1, las repetidas por hash y las que aparecen en
  la mitad de los proyectos o más (son del sitio, no del proyecto).

## Límites

- **No ejecuta JavaScript.** Un sitio que pinta sus proyectos desde React sin sitemap ni HTML del servidor sale con
  pocos o ninguno; queda dicho en `descartados` y `fuentes`.
- Presupuesto de tiempo (240 s por defecto, 40 % reservado para fotos) y topes: 80 páginas, 30 proyectos, 12 fotos por
  proyecto, 200 en total, repartidas entre todos (con 25 proyectos, 8 cada uno). Cusezar completo: 25 proyectos y
  200 fotos en ~190 s.
- En la API toda descarga pasa por `scrap_identity._get`, que `api/ssrf.py` reemplaza por su versión segura: solo
  IPs públicas, cada redirección revalidada, tope de tamaño.
- El disco de Render y de Cloud Run es efímero: lo extraído dura hasta el próximo despliegue.

## En la API (`api/proyectos_web.py`)

- `programar(url, origen)` lo llaman `/api/demo/solicitar` y `/api/captacion/demo`. Cola de un hilo, máximo 4 en
  espera, una vez por sitio cada 12 h (1 h si falló).
- `EXTRAER_PROYECTOS_WEB`: `1` lo enciende, `0` lo apaga; sin la variable solo corre en producción (`RENDER` o
  `ENTORNO=produccion`).
- `GET /api/demo/proyectos?d=<token de la demo>` devuelve el estado y el catálogo, sin rutas del servidor.

Pruebas: `python -m unittest tests.test_scrap_proyectos -v` (sin red: el sitio es un diccionario y las fotos se
fabrican con Pillow).
