# Manual de marca de Machea — resumen para el formulario

Fuente: "Machea Motion Graphics Package v1.0" (`preview.html`, compartido por Diego el 2026-10-02). Está pensado para **video**; aquí se extrae lo que aplica a la interfaz del formulario y se marca lo que el manual no cubre.

## Paleta

| Rol | Nombre | Hex | Uso según el manual |
|---|---|---|---|
| Acento | Machea Red | `#FC4633` | Acciones, datos, resaltados. **Reservar para lo importante**, sin saturar. |
| Texto y titulares | Machea Navy | `#1F2E42` | Titulares y texto principal. |
| Fondo | White | `#FFFFFF` | Fondos y contraste. |
| Fondo secundario | Light Gray | `#F5F6F8` | Fondos secundarios. |
| Información secundaria | Gray | `#A7ADB5` | Texto de apoyo. |
| Énfasis fuerte | Dark | `#111820` | Énfasis. |
| Línea | (de la vista previa) | `#DCE1E7` | Bordes de tarjetas. |

Tintes de rojo del embudo: `#FF6D5D`, `#FF887C`, `#FFAAA1`, `#FFCBC6`. Fondo suave de icono: `#FFF0ED`.

## Tipografía

**Inter**: ExtraBold para titulares, Bold para datos, Medium para cuerpo, y gris `#A7ADB5` para lo secundario. Un solo cambio de familia, sin cambiar tipografías entre piezas.

## Forma y profundidad (de la vista previa)

- Radio de tarjeta 18 px; elementos internos 14 px; botones y chips en pastilla (999 px).
- Sombra de tarjeta: `0 12px 30px rgba(31,46,66,.08)`.
- Mucho espacio negativo; tarjetas y radios consistentes.

## Iconografía

Familia **lineal, simple y geométrica**. **No** mezclar estilos 3D, emojis ni sets incompatibles. Conceptos previstos: propiedad, comprador, inmobiliaria, matching, ubicación, velocidad, métricas y objetivo.

(Los glifos de la vista previa ⌂ ◯ ▦ ⌖ son marcadores de posición: en el formulario se dibujan como SVG propios.)

## Movimiento (útil para transiciones del formulario)

| Código | Animación | Duración | Uso |
|---|---|---|---|
| M01 | Fade up (opacidad 0→100, y +30→0) | 350-500 ms | Textos, tarjetas, entradas. |
| M02 | Pop (escala 85→105→100) | 400-600 ms | Datos importantes, porcentajes. |
| M03 | Draw (líneas 0→100 %) | 500-700 ms | Conexiones, matching, barra de progreso. |
| M04 | Contador (0→objetivo) | ~1 s | Números y porcentajes (por ejemplo el "% match"). |
| M05 | Micro zoom (100→103→100) | ~500 ms | Énfasis sutil. |

Transiciones: Slide (400-700 ms), Mask (500-800 ms), Scale (300-600 ms). Regla: **una idea visual por momento**, no animar por animar.

## Reglas del manual

- **Sí:** espacio negativo, rojo solo para información importante, radios y tarjetas consistentes, animar para reforzar el mensaje, una idea por momento.
- **No:** saturar de rojo, mezclar estilos de iconos, usar cinco efectos para una frase, cambiar tipografías.

## Lo que el manual NO define (hay que decidir)

- **Estados de interfaz:** error, éxito, foco, deshabilitado, hover, seleccionado. El manual no tiene verde ni amarillo; hay que definir un color de validación/éxito coherente (propuesta: navy con icono de check, y rojo solo para error o acción).
- **Controles de formulario:** campos, selectores, chips, contadores, barra de progreso, lista desplegable.
- **Versiones del logo** sobre fondo claro y oscuro, zona de seguridad y tamaño mínimo.
- **Tono de texto** (copy) de la interfaz.

## Diferencias con lo que hay hoy en producción

| | Hoy en el formulario | Manual |
|---|---|---|
| Rojo | `#FF6259` (coral) | `#FC4633` |
| Navy | `#2D3B4E` | `#1F2E42` |
| Fondo | Beige `#FDF6F0` con degradado rosado y puntos | Blanco y gris claro `#F5F6F8` |
| Acento secundario | Verde esmeralda `#2DD4A7` (CTA, "match", chips) | No existe |
| Tipografía | Poppins (titulares) + Manrope (cuerpo) | Inter |
| Iconos | Emojis y símbolos Unicode | Lineales SVG |
| Logo en pantalla | Ninguno (`logo` y `marcaChica` vacíos) | Marca presente |

La landing (fuera de alcance) usa hoy otra paleta (coral `#FF6259`, Archivo, beige). Al alinear el formulario con el manual, **el formulario y la landing quedarán distintos** hasta que alguien actualice la landing.

## Logo y lockups (revisado el 2026-10-02)

Archivos en `recursos/`:

| Archivo | Qué es | ¿Sirve? |
|---|---|---|
| `LockUpmacheaOscuro.png` | Palabra "machea" en navy oscuro (`#172639`), PNG 2172x724 **con transparencia real**. | **Sí**, para fondos claros. Su navy es algo más oscuro que el del manual (`#1F2E42`). |
| `LockUpMacheaClaro.jpg` | Palabra "machea" en rojo, JPG 2752x1536. | **No tal cual.** El JPG no admite transparencia y trae el **patrón de cuadros de transparencia pintado dentro de la imagen** (falso fondo transparente). Hay que exportarlo de nuevo como PNG o SVG. |
| `derivado_LockUp-machea-rojo-transparente.png` | Palabra roja extraída del JPG por color, PNG 2684x602 transparente. | **Provisional.** Bordes limpios, pero es una derivación de un JPG; reemplazar por la exportación original. |
| `derivado_LockUp-machea-blanco-transparente.png` | La misma máscara en blanco, para fondos oscuros. | **Provisional**, igual que la anterior. |
| `isotipo-machea-FC4633.svg` / `isotipo-machea-blanco.svg` | Isotipo vectorial limpio (del repo), en rojo del manual y en blanco. | Sí. |
| `Machealogo2.png`, `LogoMacheaBlanco.png` | Isotipo con resplandor neón incorporado. | No para la interfaz (sobre blanco se ve como mancha). |

Observaciones:
- **Los lockups son solo la palabra**, sin el isotipo. Para el encabezado del formulario conviene un lockup horizontal con isotipo y palabra; hoy los mockups lo arman con SVG + texto en Inter.
- **Los rojos de los archivos no coinciden con el del manual:** la palabra roja es `#F92C1D` y el isotipo del PNG `#FC2F1F`; el manual dice `#FC4633`. Hay que decidir cuál es el rojo oficial y exportar todo con ese valor.
- **Lo ideal es SVG** (escala sin pérdida y pesa pocos KB). Un PNG de 2.700 px de ancho pesa mucho para una pantalla de registro.
- Exportación recomendada: SVG o PNG con transparencia, en tres colores (rojo, navy y blanco), con y sin isotipo, y con márgenes mínimos recortados.
