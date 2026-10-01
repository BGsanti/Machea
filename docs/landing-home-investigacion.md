# Home corporativo (`landing()`) — de dónde salió cada dato

Nueva pantalla de entrada de la app (`app/js/templates.js` → `landing()`),
réplica del banner principal + sección "Nuestros proyectos" de
**colsubsidio.com/vivienda**. Extraído con la misma técnica que
`proyectos-imagenes.md`/`proyectos-amenidades.md`: la página es una SPA
Next.js, pero el HTML servido en la primera respuesta (`curl` con
User-Agent de navegador, sin ejecutar JS) trae embebido el JSON de Drupal
(`__NEXT_DATA__`) con el contenido real y las rutas de las imágenes.

## Lo que se replicó (real, no inventado)

La página real tiene 9 secciones (carrusel, "Nuestros proyectos", eventos,
productos, artículos, guía de compra, servicios, acompañamiento social,
blog). Nuestra app es un flujo de una sola pantalla, así que solo se replicó
lo que tiene sentido como puerta de entrada:

**Banner principal** (`field_banner`, tipo `main_banner_slider`, 3 slides
tipo `main_banner`) — título, descripción, imagen y degradado de fondo
(`field_background_color`) literales de cada slide:

| Slide | Título | Descripción | Imagen real |
|---|---|---|---|
| 1 | Vivienda Colsubsidio | Construye tu futuro y el de tu familia con nuestros proyectos de vivienda VIS o VIP... | `vivienda-proyectos-inmobiliarios-colsubsidio.webp` |
| 2 | Tu historia comienza en la Ciudadela Maiporé | Descubre la variedad de opciones para adquirir tu propio hogar en Soacha... | `banner-lanzamiento-ciudadela-maipore.webp` |
| 3 | Vivienda VIS Colsubsidio: donde nace tu hogar | Habita espacios diseñados para tus sueños en Bogotá y Cundinamarca. | `vivienda-vis-colsubsidio-blog-h.webp` |

Degradado real: `linear-gradient(83deg, #FFFDF4 0%, #FFEC99 100%)`, texto oscuro.
Las 3 imágenes se descargaron de `cms.colsubsidio.com/sites/default/files/...`
a `app/assets/landing/hero-{1,2,3}.webp`.

**"Nuestros proyectos"** (`field_section[0]`, tipo `multiple_cards_module`) —
el título de la sección es real; las tarjetas de proyecto que muestra esa
sección en vivo se cargan por otra llamada cliente-servidor (mismo patrón
JS-only que el listado `/vivienda/proyectos` — ver
`docs/claude-design-projects.md` y la investigación anterior), así que **no**
se pudieron extraer sus tarjetas específicas. En su lugar se muestran 6 de
nuestros 26 proyectos reales que sí tienen foto/plano (mismos datos de
`proyectos-reales-investigacion.md`), que es contenido igual de real aunque
no sea necesariamente la selección exacta que la página muestra hoy.

## Lo que se agregó, no está en la página real

La **tarjeta destacada** "🏗️ Grúa del Futuro — Construye la casa de tus
sueños aquí", primera en la fila de "Nuestros proyectos", con botón
"Empezar ahora →" que lleva a `splash()` (el juego). Es la pieza que
conecta el home corporativo con el resto de la app — no existe en
colsubsidio.com, fue un pedido explícito del usuario.

## Lo que NO se pudo verificar

No hay navegador real disponible para tomar una captura de pantalla
pixel-perfect de la página — el layout, espaciado y proporciones exactas de
`landing()` son una construcción propia usando el copy/colores/imágenes
reales de arriba, no una copia de su CSS. Las otras 8 secciones de la
página real (eventos, blog, guía de compra, etc.) no se replicaron: no
aplican a un flujo de una sola pantalla.
