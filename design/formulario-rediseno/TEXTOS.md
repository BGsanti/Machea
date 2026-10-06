# Formulario Machea — tabla de textos (propuesta para aprobar)

**Estado: APROBADA por Diego el 2026-10-02 (toda la tabla), con estas precisiones:** el consentimiento no lleva enlace por ahora, el texto legal del registro queda omitido por ahora, y "Hablar con un asesor" se acepta como etiqueta del botón de llamada.

Textos visibles que hay que cambiar o definir. Cada fila dice dónde está hoy, qué dice y qué proponemos. Las filas marcadas "T11" las ejecuta la tarea de copy (mecánica); las demás se implementan dentro de la tarea de diseño que se indica.

Criterios de tono: español de Colombia, tuteo, frases cortas y concretas, sin metáforas de obra ("grúa", "construir tu sueño", "carné de constructor"), sin signos de exclamación de juego, sin "demostración" ni "reto". Cero emojis. Nada que prometa algo que el producto no hace hoy.

## Cosas que no se pueden prometer hasta confirmarlas

| Tema | Por qué |
|---|---|
| "Ya guardamos lo que nos contaste" (cierre de Arriendo) | Hoy es falso: el código indica que Arriendo no llega a Supabase ni a la llamada de Manuela. Santiago debe decir qué pasa con esos datos. |
| "Tus datos se usan solo para contactarte…" (registro) | Es una promesa de privacidad: debe validarla quien lleve lo legal y el tratamiento de datos. Si no se valida, se omite. |
| "Un asesor te contactará" en Arriendo | Mismo caso: depende de que exista ese flujo. |

## 1. Registro (T4b, variante B)

| Elemento | Hoy | Propuesta |
|---|---|---|
| Etiqueta superior | `TU CARNÉ DE CONSTRUCTOR` | `Tus datos` (no "Paso 1 de 2": el quiz ya tiene su propio contador "Pregunta N de M" y dos contadores confunden) |
| Título | `Primero, preséntate` | `Cuéntanos quién eres` |
| Subtítulo | (ninguno) | `Después te hacemos unas preguntas sobre la vivienda que buscas.` |
| Campos | Nombres · Apellidos · Cédula · Correo electrónico · Teléfono (WhatsApp) | Nombres · Apellidos · Correo electrónico · Teléfono (WhatsApp). **Sin cédula.** |
| Placeholders | `Ej: Ana`, `Ej: Ruiz Gómez`, `Ej: 1020304050`, `Ej: ana.ruiz@correo.com`, `Ej: 300 123 4567` | `Ej: Ana`, `Ej: Ruiz`, `ana.ruiz@correo.com`, `300 123 4567` |
| Errores por campo | (ninguno; el botón solo se apaga) | Nombre: `Escribe tu nombre.` · Apellidos: `Escribe tus apellidos.` · Correo: `Revisa el correo: debe verse como nombre@dominio.com` · Teléfono: `Escribe un celular de 10 dígitos.` · Consentimiento: `Necesitamos tu autorización para continuar.` |
| Consentimiento | `Autorizo el tratamiento de mis datos personales para recibir información de vivienda de Colsubsidio (Habeas Data).` (el texto por defecto del código; el tenant machea ya lo sobrescribe sin Colsubsidio) | `Autorizo el tratamiento de mis datos personales para recibir información de vivienda (Habeas Data).` **Sin enlace por ahora.** |
| Botón | `Empezar a construir →` | `Empezar` (+ icono de flecha SVG) |
| Ayuda bajo el botón | `Completa nombres, apellidos, cédula, correo, teléfono y consentimiento para continuar.` | `Completa los campos para continuar.` (pasa a `Todo listo.` al terminar) |
| Texto legal | (ninguno) | **Omitido por ahora.** Si más adelante se define, borrador: `Usamos tus datos solo para contactarte sobre esta búsqueda.` |

## 2. Preguntas (T5)

| Dónde | Hoy | Propuesta |
|---|---|---|
| Subtítulo de ingresos (repite el de "tipo") | `Esto define a qué proyectos y subsidios puedes acceder.` | `Suma los ingresos mensuales de todas las personas que aportan en tu hogar.` |
| Contador | `Pregunta 2 de 8` | Igual (Compra 8, Arriendo 9). |
| Barra de afinidad | `Encaje con el catálogo ahora mismo` | `Afinidad con el catálogo` (aviso: es una estimación del motor local; los "% match" finales vienen del modelo y pueden diferir, ver diagnóstico A5) |
| Botón "Atrás" | `← Atrás` | `Atrás` con icono de flecha SVG |

## 3. Chips de resumen (T11)

Se resuelve con una etiqueta de visualización por opción (campo nuevo en `data.js`, por ejemplo `chip`), **sin tocar el valor `v` que viaja al backend**.

**Compra**

| Hoy | Propuesta |
|---|---|
| `No VIS` / `VIS` | `Vivienda No VIS` / `Vivienda VIS` |
| `4–8 SMMLV` | `Ingresos 4 a 8 SMMLV` (las etiquetas largas de `data.js` ya dicen "4 a 8 SMMLV") |
| `2 hab` | `2 habitaciones` (`1 habitación` en singular) |
| `Usaquén` (más de 3 zonas: `+2 zonas`) | Igual |
| `Afiliado ✓` | Se elimina: Machea no pregunta afiliación |

**Arriendo**

| Campo | Valor interno (`v`) | Chip propuesto |
|---|---|---|
| Propiedad | `Vivienda` / `Oficinas` / `Bodegas` | `Vivienda` / `Oficina` / `Bodega` |
| Presupuesto | `<1M` | `Hasta $1.000.000` |
| | `1-2M` | `$1.000.000 a $2.000.000` |
| | `2-3.5M` | `$2.000.000 a $3.500.000` |
| | `>3.5M` | `Más de $3.500.000` |
| Mudanza | `inmediato` | `Mudanza inmediata` |
| | `1_mes` | `Mudanza en 1 mes` |
| | `2_3_meses` | `Mudanza en 2 a 3 meses` |
| | `+3_meses` | `Mudanza en más de 3 meses` |
| Preferencias | `2 hab · 1 baños` | `2 habitaciones · 1 baño` (y, si aplica, `1 parqueadero` y `Estrato 3`) |
| Ingresos | `2–4 SMMLV` | `Ingresos 2 a 4 SMMLV` |

## 4. Resultados de Compra (T9 y T11)

| Elemento | Hoy | Propuesta |
|---|---|---|
| Etiqueta superior | `TUS PROYECTOS RECOMENDADOS ✦` | `Tus proyectos recomendados` |
| Título | `Esto es lo que encaja contigo, Ana` (sin nombre: `…contigo, constructor`) | `Esto es lo que encaja contigo, Ana` y, sin nombre, solo `Esto es lo que encaja contigo` (T11: eliminar el respaldo `constructor`, que aparece en tres pantallas) |
| Subtítulo | `Ordenados por afinidad con tu perfil. Llama o escribe desde el que más te interese. 18 proyectos, de 1 a 6.` | `18 proyectos ordenados por afinidad con tu perfil. Mostrando del 1 al 6.` |
| Dirección | `Lagos de Torca, Bogotá. Cra. 67 #201 - 58 (Dirección provisional)` | Mostrar la dirección sin el paréntesis y añadir una etiqueta discreta `Dirección por confirmar` (T11: regla de visualización; el dato real se corrige en el catálogo del backend, hay 8 direcciones afectadas, las que vi son de Bosa). Es honesto y se ve ordenado. |
| Ficha | `Ver ficha oficial en machea.co ↗` (el dominio es el de Machea, pero el enlace va a la constructora) | `Ver ficha oficial del proyecto` + icono de enlace externo (T11) |
| Sin planos | `…no está en el catálogo que bajamos de machea.co.` | `Aún no tenemos los planos de este proyecto.` (T11) |
| Razón del match | Párrafo de 6 a 8 líneas: `Es el que mejor encaja contigo: te da 3 habitaciones en 58 m²… Lo único: queda en Fontibón, al otro lado de Usaquén y arranca en $563 millones…` | Encabezado corto por puesto (`Mejor opción`, `Segunda opción`, `Tercera opción`, luego sin encabezado) y **máximo 3 viñetas** con etiqueta: `Zona: Fontibón, vecina de Usaquén` · `Tamaño: 3 habitaciones, 58 m²` · `Entorno: tiene piscina` · y, aparte, `A considerar: arranca en $563 millones, por encima de tu rango de ingresos`. (T9: cambia la estructura de `razonDeMatch`, no solo el texto.) |
| Acciones | `Llamar` · `WhatsApp` | `Hablar con un asesor` (principal: dispara la llamada) y `Escribir por WhatsApp` (secundaria). Confirmar con Diego que "Hablar con un asesor" describe bien la llamada de Manuela. |
| Subsidio | `🏅 Apto para subsidio · hasta $…` | `Apto para subsidio` + `hasta $…` (icono SVG) |
| Pie legal (código) | `Datos de área, habitaciones, baños y precio tomados de las fichas oficiales de cada proyecto en machea.co. La recomendación es una demostración del reto.` | `Datos de área, habitaciones, baños y precio tomados de las fichas publicadas por cada constructora. Precios y disponibilidad pueden cambiar: confírmalos con el asesor.` (T11) |
| Pie legal (tenant machea) | `Datos tomados de las fichas publicadas por cada constructora. Demostración.` | El mismo texto de arriba. **Ojo:** viene de `marca.js` (generado). Para no depender del generador, que el código use este texto como valor fijo de Machea. |

## 5. Estados de carga y error (T9/T10)

| Dónde | Hoy | Propuesta |
|---|---|---|
| Cargando | `Buscando proyectos para ti…` · `El servidor puede tardar unos segundos en despertar la primera vez.` | `Buscando proyectos para ti…` · `Estamos preparando tus resultados. La primera consulta puede tardar unos segundos.` |
| Error | `No pudimos traer tus recomendaciones` · botón `Reintentar` | Igual (ya es claro y accionable) · botón secundario `Ver recomendaciones aproximadas` |
| Aviso aproximado | `Estos proyectos salen de nuestro catálogo local, no del modelo de recomendación. Son reales, pero el orden es aproximado.` | `Mostramos una selección aproximada porque el servicio de recomendación no respondió. Los proyectos son reales; el orden puede variar.` |
| Sin resultados | `Sin resultados para Usme` · `Prueba con otra zona o ajusta el presupuesto.` | Igual |

## 6. Confirmación y llamada (T10)

| Dónde | Hoy | Propuesta |
|---|---|---|
| Estado de conexión | `📡 Conectando con Manuela… Puede tardar unos segundos si el servidor estaba dormido.` | `Conectando con Manuela, nuestra asistente. Puede tardar unos segundos.` |
| Calificación lista | `¡Listo para hablar con un asesor!` · `Tu perfil y tu financiación están listos. Un asesor te contacta muy pronto.` | `Tu perfil está listo para un asesor` · `Con lo que nos contaste, un asesor ya puede ayudarte.` (evitar el "muy pronto" si no hay compromiso de tiempo) |
| Calificación en proceso | `Vamos construyendo tu camino` | `Seguimos afinando tu búsqueda` |
| Esperando resumen | `🎙️ Manuela está en la llamada — el resumen aparece aquí apenas cuelgue.` | `Manuela está en la llamada. El resumen aparecerá aquí cuando termine.` (sin emoji) |
| Temperatura del lead | `🔥 Caliente` · `🌤️ Tibio` · `❄️ Frío` | `Caliente` · `Tibio` · `Frío` con iconos SVG de tres niveles |
| Nota de calificación | `Afiliado Colsubsidio` / `No afiliado — cupo 10% / posible afiliación` | **Por código, la segunda aparece hoy en Machea** (`qualification.js` líneas 26-29: el `else` corre cuando `afiliado` es nulo, y Machea no pregunta afiliación). Es lógica de Colsubsidio filtrada. Propuesta: no mostrar ninguna nota de afiliación cuando el negocio no es una caja de compensación (misma condición que `pideAfiliacion()`). Revisar también si el puntaje de ese bloque (+6 / +22) debe aplicarse a Machea: es lógica de calificación, no solo texto, y la decide Santiago o BGsanti. No verificado en pantalla porque llegar a la confirmación dispara la llamada real. |

## 7. Cierre de Arriendo "en construcción" (T10, a acordar con Santiago)

| Elemento | Hoy | Propuesta |
|---|---|---|
| Etiqueta | `ARRIENDO ✦` | `Arriendo` |
| Título | `Estamos construyendo el matching de Arriendo` (con 🚧) | `Las recomendaciones de arriendo están en preparación` |
| Cuerpo | `Ya guardamos lo que nos contaste. Muy pronto vamos a poder recomendarte arriendos reales con este mismo perfil.` | `Todavía no podemos recomendarte arriendos con este perfil. Estamos trabajando en ello.` **Sin** "ya guardamos" ni "te contactaremos" hasta que Santiago confirme qué ocurre con esos datos. |
| Resumen | Chips de lo contestado | Chips con las etiquetas legibles de la sección 3 |
| Acciones | `↺ Empezar de nuevo` | Botón principal `Buscar para comprar` (reinicia en Compra) y secundario `Volver al inicio` |

## 8. Textos que desaparecen con el rediseño

`Tu carné de constructor`, `CARNÉ DE CONSTRUCTOR`, `Tu nombre` / `Tu teléfono` del carné, avatar, `Empezar a construir`, `¡Construir mi casa!`, `Responde jugando…` (la pantalla de bienvenida ya no existe; si se reactiva, revisar el tono), `Encuentra tu próximo hogar` y el resto de textos de `splash` en el tenant.

## 9. Pendientes

1. Santiago: qué pasa con los datos de Arriendo y qué se puede decir en su pantalla de cierre (sección 7), y la lógica de calificación con reglas de Colsubsidio (sección 6).
2. Más adelante: enlace a la política de datos y textos legales, cuando estén definidos; se añaden al registro y al pie de resultados.
