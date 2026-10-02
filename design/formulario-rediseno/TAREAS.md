# Formulario Machea — desglose de tareas (borrador)

Borrador para pasar al board de coordinación. **Todavía no se creó ninguna tarea en el board**, porque las marcadas Autónoma las tomaría el turno nocturno y empezaría a programar. Cuando Diego lo apruebe, se crean con `create_task` (repo `BGsanti/Machea`, etiquetas `Frontend` y `UI/UX`).

Contexto (todo en esta carpeta, `design/formulario-rediseno/`): [DIAGNOSTICO.md](DIAGNOSTICO.md) (hallazgos y decisiones), [MARCA.md](MARCA.md) (manual de marca), [TEXTOS.md](TEXTOS.md) (textos aprobados), [mockups/registro.html](mockups/registro.html) (variante B elegida).

## Reglas de este proyecto

- **No tocar** `js/plano3d/` ni `vendor/`. Cuidado con `perfil.js` del 3D: depende del orden e ids de las preguntas.
- **Cero emojis.** Antes de cada PR: buscar emojis y pictogramas en `js/`, `css/` e `index.html` del formulario (los comentarios de código no cuentan).
- **Una tarea con dudas de diseño no se etiqueta Autónoma** (convención del equipo): se hace con una persona. Las Autónomas son las mecánicas y se escriben como receta, con "qué debe verse".
- **Nunca probar el flujo completo en producción con datos de prueba:** la confirmación dispara una llamada real de Manuela. Probar en local (backend sin `DAPTA_FLOW_WEBHOOK_URL` = modo mock).
- Archivos compartidos (`templates.js`, `styles.css`, `main.js`, `state.js`, `tema.js`): `lock_file` con `BGsanti/Machea` antes de editar.
- Subir `?v=N` del cache-busting en `index.html` del formulario con cada cambio de JS/CSS.

## Estrategia de ramas (APROBADA por Diego, 2026-10-02)

Todo el trabajo se acumula en una rama y **a producción solo se sube cuando Diego apruebe el conjunto**. Hoy `main` = producción (Vercel); si cada PR fuera directo a `main`, producción quedaría **a medias** (Poppins y verde mezclados con Inter y rojo), justo lo contrario de lo que buscamos.

- Crear una rama de integración `rediseno-formulario` desde `main` y subirla a origin.
- Todas las tareas del proyecto abren PR **hacia esa rama**.
- Al final, un solo PR de `rediseno-formulario` a `main` tras el QA (tarea T12).
- Las tareas Autónomas deben decirlo en su descripción: el runner parte de `main`, así que debe hacer `git switch -c night/<tarea> origin/rediseno-formulario`.
- **Conflicto posible con Santiago:** él trabaja Arriendo en `main` y toca los mismos archivos (`data.js`, `state.js`, `templates.js`). Pedirle que avise antes de mergear a `main` o que integre `main` en `rediseno-formulario` con frecuencia.

## Tareas

Orden: T1 → (T2, T3) → T4 → T5 y el resto en paralelo → T12.

### T1. Fundamentos visuales de marca — persona
Etiquetas: `Frontend`, `UI/UX`. Depende de: rama de integración.
- Fijar los tokens de Machea en `js/tema.js` (rama `esMachea`): rojo `#FC4633`, navy `#1F2E42`, blanco, gris `#F5F6F8`, gris `#A7ADB5`, línea `#DCE1E7`. Quitar el verde `#2DD4A7` (el CTA pasa a rojo; éxito = navy con check; error = rojo).
- Inter como única familia (ya se carga en `index.html`): ExtraBold titulares, Bold datos, Medium cuerpo. Quitar Poppins y Manrope.
- Formas: tarjetas 18 px, interiores 14 px, botones en pastilla; sombra `0 12px 30px rgba(31,46,66,.08)`.
- Fondo blanco/gris claro: quitar el degradado rosado y los puntos y líneas decorativos.
- Quitar estilos en línea que choquen con los tokens (contadores de Arriendo, lista de amenidades).
- Debe verse: todas las pantallas actuales con la paleta nueva, sin rastros de beige, verde ni Poppins; el 3D intacto.

### T2. Set de iconos SVG lineales — persona
Etiquetas: `Frontend`, `UI/UX`. Depende de: T1 (tokens).
Crear un módulo (por ejemplo `js/iconos-ui.js`, al estilo de `js/iconos.js`) con iconos lineales `stroke=currentColor`: teléfono, ubicación, subsidio, búsqueda, alerta, en construcción, edificio, señal/conectando, check, flecha izquierda/derecha, reiniciar, temperatura del lead (tres niveles), calendario, presupuesto, asesor, mapa/brújula, obra. Entregar con una página de muestra.
- Debe verse: familia coherente, mismo trazo y tamaño, legible a 16-24 px.

### T3. Reemplazo de emojis y símbolos por iconos — Autónoma (después de T2)
Etiquetas: `Frontend`, `Autónoma`. Depende de: T2 mergeada en `rediseno-formulario`.
Receta: con la tabla emoji→icono que entregue T2, reemplazar en `templates.js` (~27 líneas), `qualification.js` (✅ 🌱), `data.js` (quitar la lista `GENDERS` con emojis si el registro ya no la usa), `state.js` (chip "Afiliado ✓"), `styles.css` (línea ~2350, `content:'✓'`) y los símbolos ✓ ✦ ↺ ← →. Favicon: SVG real con el isotipo, no un emoji.
- No tocar: textos que viajan al backend, `plano3d/`.
- Debe verse: ninguna pantalla con emojis ni pictogramas Unicode (el chequeo de búsqueda debe dar cero fuera de comentarios).

### T4a. Eliminar el campo cédula — Autónoma (bloqueada por Santiago)
Etiquetas: `Frontend`, `Autónoma`. No depende de T1, **pero depende de hablar con Santiago**: su tarea en curso "Base de datos persistente de leads (Supabase)" (parada desde el 2026-09-28) usa la cédula como llave de las consultas guardadas, y su trabajo (`js/datos.js`, la migración y `docs/base-de-datos-leads.md`) **no está en origin**, solo en su clon local. Hay que acordar que esa base use teléfono y correo como identidad, y que la columna de cédula sea opcional o desaparezca, antes de quitar el campo del front.
Receta: quitar la cédula de `templates.js` (campo, `isValidCedula`, texto de ayuda), `state.js` (`createInitial`, `startQuiz`) y `main.js` (listener y las validaciones hacia las líneas 863 y 1158). La búsqueda de consulta previa por cédula+teléfono (`main.js` ~1149-1180) pasa a usar solo el teléfono o se desactiva, sin errores (hoy está inerte con Supabase vacío). Backend y Dapta no usan la cédula: no tocarlos.
- Debe verse: el registro sin el campo; el botón se habilita con nombres, apellidos, correo, teléfono y consentimiento; el recorrido completo hasta resultados funciona.

### T4b. Registro, variante B (formulario limpio) — persona
Etiquetas: `Frontend`, `UI/UX`. Depende de: T1, T4a.
Implementar el mockup B (`mockups/registro.html`, pestaña B): logo, "Paso 1 de 2", título, dos columnas de campos, consentimiento con check navy, botón rojo en pastilla, validación en vivo con mensaje y icono, texto legal. Sin carné ni avatar. Logo SVG de `recursos/`. Revisar los textos con el tono de marca (el copy del mockup es propuesta).
- Debe verse: igual al mockup en escritorio y móvil; el botón visible sin recortes en 900 px de alto; error al salir de un campo inválido.

### T5. Pantallas de pregunta — persona
Etiquetas: `Frontend`, `UI/UX`. Depende de: T1, T2.
Composición centrada con jerarquía, "Atrás" junto al contenido (no suelto al fondo), barra de progreso consistente en todas, estados de selección/hover/foco accesibles, movimiento M01 (aparecer subiendo) al cambiar de pregunta. Pantallas "¿Qué buscas?" y "¿Qué propiedad?" con presencia, no un bloque flotando.
- No cambiar ids, orden ni valores de las preguntas.

### T6. Arreglar bugs de interacción — Autónoma
Etiquetas: `Frontend`, `Bug`, `Autónoma`. Puede hacerse ya, antes de T1.
Receta:
1. **Lista de amenidades tapa "Continuar"** (pregunta de entorno): al elegir una amenidad la lista queda abierta. Debe cerrarse al elegir fuera del buscador, al pulsar Escape y al pulsar Continuar sin que el botón quede cubierto. Reproducir: Compra → zona → … → entorno → elegir "Piscina".
2. **Error `Cannot read properties of undefined (reading '_leaflet_pos')`** al salir de la pregunta de zona (visto en Arriendo): destruir el mapa de Leaflet (`map.remove()`) y cancelar animaciones pendientes antes de reemplazar el DOM, sin romper el mapa al volver con "Atrás".
- Debe verse: consola sin errores en el recorrido de Compra y de Arriendo; "Continuar" siempre visible y pulsable en la pregunta de entorno.

### T7. Zona y mapa — persona
Etiquetas: `Frontend`, `UI/UX`. Depende de: T1, T6.
Mapa más sobrio (tiles claros y discretos en lugar del OpenStreetMap estándar; revisar términos y atribución del proveedor), colores de selección con el rojo de marca, buscador y chips con los nuevos tokens, y mejor aprovechamiento del móvil (hoy el mapa es una franja pequeña).

### T8. Contadores y estilo de vida de Arriendo — persona, coordinar con Santiago
Etiquetas: `Frontend`, `UI/UX`. Depende de: T1, T2.
Contadores de habitaciones, baños, parqueaderos y estrato con controles de buen tamaño táctil; estilo de vida (11 opciones, mínimo 3) como chips ordenados con contador "elegiste 2 de 3". Diseño nuestro; no cambiar la lógica (`answerPreferencias`, `answerEstiloVida`) ni `QUESTIONS_ARRIENDO` sin hablar con Santiago.

### T9. Resultados de Compra — persona
Etiquetas: `Frontend`, `UI/UX`. Depende de: T1, T2.
Simplificar color (rojo solo para precio/acción principal, sin dos verdes ni cajas rosadas), acortar la "razón" y darle formato de lista breve, diferenciar "Llamar" (acción principal) de "WhatsApp" (secundaria), tarjetas con la forma del manual, "% match" con el contador del manual (M04). No cambiar el modelo ni el orden de resultados.

### T10. Confirmación y cierre de Arriendo — persona
Etiquetas: `Frontend`, `UI/UX`. Depende de: T1, T2; texto de Arriendo con Santiago.
Diseño profesional de la pantalla de confirmación, el resumen post-llamada y la pantalla "en construcción" de Arriendo (sin 🚧; mensaje claro de que el matching de arriendo está en preparación y qué pasa con lo que ya contestó). No ejecutar la llamada real en pruebas.

### T11. Copy y datos visibles — Autónoma tras definir los textos
Etiquetas: `Frontend`, `Autónoma`. Depende de: T4a y que Diego apruebe la tabla de [TEXTOS.md](TEXTOS.md) (secciones 3 y 4, filas marcadas T11; las demás secciones van dentro de T4b, T5, T9 y T10).
Receta (la tabla de textos se anexa a la tarea): mostrar etiquetas legibles en los chips ("Presupuesto: $1.000.000 a $2.000.000" en vez de `1-2M`; "En 1 mes" en vez de `1_mes`; concordancia "1 baño"), sin "(Dirección provisional)" en la dirección de las tarjetas, sin textos por defecto de Colsubsidio (afiliación, habeas data, dominio `colsubsidio.com`), sin "demostración del reto" en los disclaimers. No cambiar los valores que viajan al backend.

### T12. QA y despliegue — persona
Etiquetas: `Frontend`, `Infra / DevOps`. Depende de: todo lo anterior.
Recorrido completo de Compra y Arriendo en escritorio y móvil (en local, modo mock), comparación antes/después con las capturas de `capturas/`, chequeo de cero emojis, consola limpia, 3D intacto (`perfil.js` por id de pregunta), cache-busting subido; PR de `rediseno-formulario` a `main`; Diego hace merge; verificar en producción (solo hasta resultados, sin disparar la llamada real).

## Qué es Autónoma y qué no

| Tarea | Autónoma | Por qué |
|---|---|---|
| T4a Quitar cédula | Sí | Mecánica, con lista exacta de lugares |
| T6 Bugs | Sí | Reproducción y criterio claros |
| T3 Reemplazo de emojis | Sí, después de T2 | Mecánica con tabla de mapeo |
| T11 Copy | Sí, después de tener la tabla | Mecánica con textos aprobados |
| T1, T2, T4b, T5, T7, T8, T9, T10, T12 | No | Requieren criterio de diseño y revisión visual |

## Pendientes antes de crear las tareas

1. ~~Aprobar la estrategia de ramas~~ — aprobada.
2. **Avisar a Santiago** (lo hace Diego) del proyecto y del posible choque en `data.js`, `state.js` y `templates.js`; acordar con él el texto de "en construcción" de Arriendo y qué pasa con los datos de Arriendo ([TEXTOS.md](TEXTOS.md), sección 7). Hallazgos para él: (a) la lógica de calificación (`qualification.js`) aplica reglas de Colsubsidio a Machea; (b) **quitar la cédula choca con su base de leads en Supabase** (su tarea sigue `in_progress` y parada desde el 2026-09-28, y su código no está en origin): hay que acordar teléfono y correo como identidad antes de T4a.
3. ~~Aprobar la tabla de textos~~ ([TEXTOS.md](TEXTOS.md)): aprobada el 2026-10-02.
4. **Lockup oficial:** Diego entregó la palabra "machea" (navy con transparencia real; el claro/rojo en JPG trae un falso fondo de cuadros y hay un derivado provisional). Falta re-exportarlo en SVG o PNG transparente, decidir el rojo oficial y, si se quiere, un lockup con isotipo. Ver [MARCA.md](MARCA.md). T4b y T3 (favicon) lo necesitan al implementar.
