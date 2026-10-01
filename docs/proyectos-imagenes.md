# Imágenes reales de los 26 proyectos de vivienda Colsubsidio

Investigación para reemplazar el header decorativo (gradiente CSS + emoji) de las
tarjetas de resultado en la app "Grúa del Futuro" por una imagen real por proyecto.
Carpeta destino de las imágenes descargadas:
`C:\Users\santi\Desktop\Hackaton 30x\app\assets\proyectos\`

Método: se priorizó `og:image` / assets de imagen embebidos en el HTML servidor
(no renderizado por JS) de las páginas oficiales de proyecto en
`colsubsidio.com/vivienda/proyectos/...` (CMS Drupal detrás de `cms.colsubsidio.com`),
que en varias páginas expone un bloque de datos con imágenes de planta/fachada por
proyecto (nombres de archivo tipo `Planta_...`, `PLANO-...`, `fachada-...`,
`hero_fachada_...`, `implantacion-...`). Como respaldo se usaron fuentes de terceros
(alcaldía de La Mesa) cuando el proyecto no tenía microsite propio activo en
Colsubsidio. Todas las descargas se verificaron por tamaño (>15 KB) y firma binaria
real (RIFF/WEBP, PNG, JPEG) — ninguna es una página de error HTML guardada con
extensión de imagen.

**20 de 26 proyectos (77%) obtuvieron una imagen real descargada.** De esos 20,
8 son plano/planta/tipología y 12 son fachada/render/foto exterior. 6 proyectos
quedaron "no encontrado" — todos son desarrollos pequeños/obscuros (Villa Fiorita,
Fuentevida, Campo Alegre El Dorado, Abeto, Jardín, Mompós) sin microsite propio
activo en colsubsidio.com (su página cae a la imagen genérica de portada del sitio,
no específica del proyecto) ni fotos públicas fetchables en otras fuentes revisadas.

## Tabla completa

| # | Proyecto | Encontrado | Tipo | Archivo local | URL fuente |
|---|---|---|---|---|---|
| 1 | Agrupación De Vivienda Monguí | Sí | Fachada (og:image) | `agrupacion-de-vivienda-mongui.webp` | https://cms.colsubsidio.com/sites/default/files/2025-05/opengraph-soacha-mongui.webp |
| 2 | Agrupación De Vivienda La Macarena | Sí | Plano (planta general primer piso) | `agrupacion-de-vivienda-la-macarena.webp` | https://cms.colsubsidio.com/sites/default/files/2024-10/Macarena%20Planta%20general%20primer%20piso%20marzo%209%202023.webp |
| 3 | Verde Esperanza El Dorado | Sí | Fachada (hero) | `verde-esperanza-el-dorado.webp` | https://cms.colsubsidio.com/sites/default/files/2025-12/hero-verde-esperanza-colsubsidio.webp |
| 4 | La Arboleda | Sí | Fachada (hero) | `la-arboleda.png` | https://cms.colsubsidio.com/sites/default/files/2025-04/proyecto-vivienda-arboleda-fachada-hero.png |
| 5 | INARI | Sí | Fachada | `inari.webp` | https://cms.colsubsidio.com/sites/default/files/2025-02/fachada-proyecto-inari.webp |
| 6 | Agrupación De Vivienda Pamplona I | Sí | Plano (tipología 3C) | `agrupacion-de-vivienda-pamplona-i.webp` | https://cms.colsubsidio.com/sites/default/files/2025-04/pamplona-tipologia-3c.webp |
| 7 | Los Nogales | Sí | Plano (planta apto 1) | `los-nogales.webp` | https://cms.colsubsidio.com/sites/default/files/2024-10/04._Planta%20Apto%201_LOS%20NOGALES.webp |
| 8 | Agrupación De Vivienda Bosque De Arrayán | Sí | Fachada | `agrupacion-de-vivienda-bosque-de-arrayan.webp` | https://cms.colsubsidio.com/sites/default/files/2025-09/Bosque-de-arrayan-vivienda-colsubsidio.webp |
| 9 | Agrupación De Vivienda Bosque De Turpial | Sí | Plano (implantación/site plan) | `agrupacion-de-vivienda-bosque-de-turpial.webp` | https://cms.colsubsidio.com/sites/default/files/2025-02/implantacion-bosque-turpial.webp |
| 10 | Versalles | Sí | Plano (apto tipo A, obra gris) | `versalles.webp` | https://cms.colsubsidio.com/sites/default/files/2025-02/planos-versalles-gris-apt-tipo-A.webp |
| 11 | Villa Mercedes El Dorado | Sí | Fachada (foto evento entrega, Alcaldía La Mesa) | `villa-mercedes-el-dorado.jpg` | https://www.lamesa-cundinamarca.gov.co/NuestraAlcaldia/SaladePrensa/PublishingImages/mercedes11222.jpg |
| 12 | Agrupación De Vivienda Payandé | Sí | Fachada (banner tipo apto 1) | `agrupacion-de-vivienda-payande.webp` | https://cms.colsubsidio.com/sites/default/files/2024-10/banner-payande-AptoTipo1.webp |
| 13 | Agrupación De Vivienda Reserva De Guayacán | Sí | Fachada (hero banner) | `agrupacion-de-vivienda-reserva-de-guayacan.webp` | https://cms.colsubsidio.com/sites/default/files/2025-11/hero-banner-vivienda-proyectos-reserva-guayacan-colsubsidio.webp |
| 14 | Agrupación De Vivienda Samán | Sí | Plano (implantación/site plan) | `agrupacion-de-vivienda-saman.webp` | https://cms.colsubsidio.com/sites/default/files/2025-02/implantacion-proyecto-vivienda-saman.webp |
| 15 | Proyecto Karakalí | Sí | Fachada | `proyecto-karakali.webp` | https://cms.colsubsidio.com/sites/default/files/2025-05/fachada-proyecto-vivienda-karakali-colsubsidio_1.webp |
| 16 | ARAUCARIA | Sí | Fachada | `araucaria.webp` | https://cms.colsubsidio.com/sites/default/files/2025-11/fachada-proyecto-vivienda-araucaria-colsubsidio.webp |
| 17 | Villa Fiorita | No | No encontrado | — | Página propia en colsubsidio.com existe pero sin og:image específico (cae al genérico del sitio); sin fotos públicas fetchables en otras fuentes revisadas |
| 18 | Agrupación De Vivienda Fuentevida | No | No encontrado | — | Sin microsite propio en colsubsidio.com (404); solo menciones de prensa/alcaldía sin fotos fetchables |
| 19 | Conjunto Residencial Campo Alegre El Dorado | No | No encontrado | — | Página propia en colsubsidio.com existe pero sin og:image específico (cae al genérico del sitio) |
| 20 | Conjunto Residencial Vibo Once | Sí | Plano (planta) | `conjunto-residencial-vibo-once.webp` | https://cms.colsubsidio.com/sites/default/files/2025-12/Planta_vibo_once.webp |
| 21 | Abeto | No | No encontrado | — | Página propia en colsubsidio.com existe pero sin og:image específico; único hallazgo fue una foto de stock genérica ("pareja comprando apartamento"), no una imagen real del proyecto |
| 22 | Reserva Del Nogal | Sí | Fachada | `reserva-del-nogal.webp` | https://cms.colsubsidio.com/sites/default/files/2024-10/FACHADA-RESERVA-DEL-NOGAL-1.webp |
| 23 | Mirador Del Virrey II | Sí | Plano | `mirador-del-virrey-ii.webp` | https://cms.colsubsidio.com/sites/default/files/2024-10/PLANO-MIRADOR-DEL-VIRREY-II.webp |
| 24 | Zarzal | Sí | Fachada (hero) | `zarzal.webp` | https://cms.colsubsidio.com/sites/default/files/2025-12/hero_fachada_proyecto_zarzal_colsubsidio.webp |
| 25 | Agrupación De Vivienda Jardín | No | No encontrado | — | Sin microsite propio activo en colsubsidio.com (404); página en estrenarvivienda.com marcada "ya no disponible", solo tiene logo de proyecto, no foto real |
| 26 | Agrupación Mompós-Ciudadela Colsubsidio Maiporé | No | No encontrado | — | Sin microsite propio en colsubsidio.com (404); sitio dedicado momposmaipore.com es una SPA sin fotos accesibles en HTML estático, solo logo |

## Notas

- Todas las imágenes descargadas fueron verificadas con `xxd`/firma binaria
  (WEBP=`RIFF....WEBP`, PNG=`\x89PNG`, JPEG=`\xff\xd8\xff`) y tamaño > 15 KB —
  ninguna es un placeholder ni una página de error.
- Los 8 proyectos con "Plano" tienen imágenes de planta de apartamento, planta
  urbana/implantación (site plan) o diagrama de tipología — no todas son planta
  arquitectónica de unidad individual, pero todas son diagramas técnicos reales
  del proyecto, no fotos.
- Los 12 proyectos con "Fachada" tienen foto/render exterior real del proyecto
  (hero banner, fachada, o foto de evento de entrega), no genérica.
- Los 6 "no encontrado" son consistentes con la nota del encargo: proyectos
  pequeños/obscuros (varios con 1–24 transacciones en la data de ventas) sin
  presencia pública fuerte. No se inventó ni se usó ninguna imagen genérica de
  Ciudadela Maiporé o de otro proyecto como sustituto para mantener honestidad
  en el reporte.
