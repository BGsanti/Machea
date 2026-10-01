# Investigación: los 26 proyectos reales de `hackathon_VIVIENDAv2.xlsx`

> **DESACTUALIZADO como fuente del catálogo de la app (jul 2026).** La app ya
> NO usa las estimaciones de área/habitaciones de este documento: el catálogo
> lo genera `app/tools/scrape_proyectos.py` en `app/js/proyectos.js`, con 66
> proyectos y **datos oficiales** de área, habitaciones, baños y precio tomados
> de la ficha de cada proyecto en colsubsidio.com.
>
> Este documento sigue siendo la fuente del campo `transacciones` (demanda real
> del Excel), que se cruza con **19 de los 66** proyectos vigentes. Los otros 6
> del Excel (Villa Mercedes El Dorado, Villa Fiorita, Fuentevida, Campo Alegre
> El Dorado, Abeto, Mompós) ya no tienen ficha activa: dejaron de comercializarse.
> "Agrupación De Vivienda Jardín" tampoco se cruza a propósito — el parecido con
> "Ciudad Jardín" (Bogotá) es coincidencia, son proyectos distintos.

Origen: `C:\Users\santi\Downloads\hackathon_VIVIENDAv2.xlsx` — 4.142 transacciones
reales ("opciones de compra") entre 2024-01-05 y 2026-07-16, agrupadas en 26
proyectos únicos por `NOMBRE_PROYECTO`. El archivo trae precio real
(`VLR_VIVIENDA`, **dividir entre 10.000** para obtener el valor real en COP —
confirmado: el 100% de los 4.142 valores termina en `0000`) pero NO trae
ciudad/zona/m²/habitaciones/VIS — eso se investigó por separado vía web y se
documenta abajo.

**Nivel de confianza:** alto para ciudad/municipio y clasificación VIS en la
mayoría (páginas oficiales de Colsubsidio, ciencuadras, sitios de alcaldías).
Área en m² y número de habitaciones quedaron "no encontrado" en la mayoría —
Colsubsidio rara vez publica ficha técnica completa por proyecto; los pocos
m² que sí aparecen vienen de listados de unidades individuales de terceros,
no de un rango oficial. Tratar todo esto como dato de **demo ilustrativa**,
no como catálogo verificado para producción.

## Tabla completa

| # | Proyecto | Precio real (avg) | # transacciones | Ciudad/Municipio | Zona/Barrio | Tipología | Área m² | Habitaciones | VIS/No VIS | Confianza |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Agrupación De Vivienda Monguí | $180.6M | 622 | Soacha | Ciudadela Maiporé | Apartamentos | ~31–63 | 1–2 | VIS | web |
| 2 | Agrupación De Vivienda La Macarena | $150.5M | 374 | Soacha | Ciudadela Maiporé | Apartamentos (coliving) | 31.33–34.42 | 1 (+estudio) | VIS | web |
| 3 | Verde Esperanza El Dorado | $168.8M | 374 | **Ubaté** (Cundinamarca) | — | Apartamentos | 49.53 | 3 | VIP | web |
| 4 | La Arboleda | $197.4M | 353 | Bogotá | San Cristóbal Sur | Apartamentos | no encontrado | 2–3 | VIS | web |
| 5 | INARI | $268.7M | 304 | Chía | — | Apartamentos | 41.60–44.73 | no encontrado | VIS (web dice VIS pese al precio) | web |
| 6 | Agrupación De Vivienda Pamplona I | $217.9M | 234 | Soacha | Ciudadela Maiporé | Apartamentos | hasta 63.49 | variable | VIS | web |
| 7 | Los Nogales | $603.6M | 200 | Bogotá | Ciudadela Colsubsidio Calle 80 (Engativá) | Apartamentos | no encontrado | 3 | **No VIS** | web, precio lo confirma |
| 8 | Agrupación De Vivienda Bosque De Arrayán | $199.7M | 200 | Tocancipá | — | Apartamentos | 45–60 | no encontrado | VIS | web |
| 9 | Agrupación De Vivienda Bosque De Turpial | $235.6M | 179 | Tocancipá | — | Apartamentos | ~58 | 3 | VIS | web |
| 10 | Versalles | $210.6M | 174 | Soacha | Ciudadela Maiporé | Apartamentos | desde 31 | no encontrado | VIS | web |
| 11 | Villa Mercedes El Dorado | $171.5M | 164 | **La Mesa** (Cundinamarca) | — | Apartamentos | ~48 | no encontrado | VIP | web |
| 12 | Agrupación De Vivienda Payandé | $177.4M | 137 | Ricaurte | — | Apartamentos | no encontrado | no encontrado | VIS | web |
| 13 | Agrupación De Vivienda Reserva De Guayacán | $228.6M | 135 | Girardot | — | Apartamentos | 46.98–52.98 | 2 | VIS | web |
| 14 | Agrupación De Vivienda Samán | $254.2M | 130 | Ricaurte | — | Apartamentos | 44.19–52.53 | 3 | VIS (precio alto para la zona) | web |
| 15 | Proyecto Karakalí | $240.7M | 112 | Bogotá | Chapinero/Barrios Unidos (Norte) | Apartaestudios (coliving) | no encontrado | 1 (estudio) | VIS (web) | web |
| 16 | ARAUCARIA | $649.9M | 111 | Bogotá | Ciudadela Colsubsidio Calle 80 (Engativá) | Apartamentos | no encontrado | no encontrado | **No VIS** | web, precio lo confirma |
| 17 | Villa Fiorita | $207.7M | 111 | Bogotá | Engativá | Apartamentos | no encontrado | 1–3 | VIS | web |
| 18 | Agrupación De Vivienda Fuentevida | $121.6M | 92 | Tocancipá | — | Apartamentos | no encontrado | no encontrado | VIP | web |
| 19 | Conjunto Residencial Campo Alegre El Dorado | $114.2M | 58 | Ricaurte | — | Apartamentos | 49.33 | no encontrado | VIP | web |
| 20 | Conjunto Residencial Vibo Once | $282.8M | 31 | Bogotá | Centro (Los Mártires) | Apartamentos | no encontrado | no encontrado | VIS (web dice VIS pese al precio) | web |
| 21 | Abeto | $371.8M | 14 | Bogotá | Ciudadela Colsubsidio Calle 80 (Engativá) | Apartamentos (coliving) | no encontrado | no encontrado | **No VIS** | web, precio lo confirma |
| 22 | Reserva Del Nogal | $167.8M | 12 | Bogotá | San Cristóbal Sur | Apartamentos | no encontrado | no encontrado | VIS | web (confianza media) |
| 23 | Mirador Del Virrey II | $170.2M | 11 | Bogotá | San Cristóbal | Apartamentos | no encontrado | 2 (+estudio) | VIS/VIP | web |
| 24 | Zarzal | $225.4M | 8 | Soacha | Ciudadela Maiporé | Apartamentos | desde 42 | no encontrado | VIS (precio algo alto) | web |
| 25 | Agrupación De Vivienda Jardín | $153.4M | 1 | Soacha | Ciudadela Maiporé | Apartamentos/apartaestudios | ~46.84 | no encontrado | VIS (inferido: Maiporé=VIS) | web |
| 26 | Agrupación Mompós-Ciudadela Colsubsidio Maiporé | $150.0M | 1 | Soacha | Ciudadela Maiporé (fase 1) | Apartamentos | no encontrado | no encontrado | VIS | web |

## Hallazgos importantes

- **La hipótesis "El Dorado = un solo megaproyecto" fue FALSA.** "Verde
  Esperanza El Dorado" está en Ubaté, "Villa Mercedes El Dorado" en La Mesa,
  y "Campo Alegre El Dorado" en Ricaurte — el sufijo "El Dorado" es
  coincidencia de nomenclatura local en distintos municipios de Cundinamarca,
  no una sola ciudadela compartida.
- **"Mompós"** se confirmó como la primera etapa de la Ciudadela Colsubsidio
  Maiporé en Soacha (junto con Barichara y Ambalema).
- **7 proyectos etiquetados como VIS en la web tienen precio promedio por
  encima del umbral aproximado de VIS (~$200M COP)** — INARI, Samán,
  Karakalí, Vibo Once, Zarzal, Pamplona, Bosque de Turpial. Puede ser mezcla
  de tipologías dentro del mismo proyecto, VIS-especial con tope más alto en
  ciertas zonas, o simplemente ruido en los datos — vale la pena
  preguntárselo a la mentora del reto en vez de asumir.
- Área (m²) y habitaciones quedaron sin dato oficial en la mayoría de los 26
  — cualquier valor que se use en la app para esos campos sería una
  aproximación/relleno, no un dato verificado.
