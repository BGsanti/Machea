# Formulario Machea — diagnóstico de UI/UX (2 de octubre de 2026)

Carpeta de trabajo del proyecto de mejora del formulario. Este archivo es el punto de partida: qué hay hoy en producción, qué está mal, qué decidimos y qué viene. **Todavía no se ha desarrollado nada.**

Capturas de referencia (producción, 2026-10-02): [capturas-antes/](capturas-antes/). Los nombres de este documento (por ejemplo `compra_d_14_resultados`) corresponden a `capturas-antes/escritorio_compra_d_14_resultados.jpg` (`d` = escritorio, `m` = móvil).

---

## 1. Objetivo

Machea es **B2B**: las constructoras e inmobiliarias evalúan el producto a través del formulario. Tiene que transmitir **confianza y profesionalismo**. El objetivo es **mejorar drásticamente lo que ya existe, no rediseñarlo desde cero**.

## 2. Decisiones tomadas (Diego, 2026-10-02)

| Tema | Decisión |
|---|---|
| Alcance | **Solo el formulario.** La landing no se toca. |
| Arriendo | La lógica y el contenido los lleva **Santiago**. **Nosotros hacemos el diseño** de sus pantallas, y todo tiene que quedar **en producción**. |
| Registro | **Se mantiene al inicio** del flujo. Se mejora su diseño, no su posición. |
| 3D | **Queda igual.** No se modifica el plano 3D. |
| Enfoque | Mejora drástica sobre la base actual. No reescribir el formulario. |
| Cierre de Arriendo | Una pantalla de **"en construcción"** es aceptable por ahora, pero con diseño profesional (sin 🚧). Es el estado provisional hasta que Santiago termine el matching. |
| Cédula | **Se elimina el campo.** No es obligatoria ni se pide. |
| Carné y avatar | Se **mejoran hacia algo profesional y sobrio** (sin carné inclinado ni avatar emoji). |
| Emojis | **Cero emojis en todo el formulario, nunca.** Si hace falta un símbolo, se crea un icono propio (SVG). Ver sección 9. |
| Iconos | También se reemplazan por iconos SVG los símbolos tipográficos (✓ ✦ ↺ ← →). |
| Marca | Existe un **manual de marca** (Motion Graphics Package v1.0) y un logo oficial. El formulario se alinea con ese manual. Resumen en [MARCA.md](MARCA.md). |

## 3. Qué hay en producción

- **URL:** `https://my-project-orcin-chi.vercel.app`. El formulario se abre en `/experiencia/index.html?marca=machea&embed=1`.
- **Producción = rama `main`** de `BGsanti/Machea` (verificado por hash en `data.js`, `main.js`, `templates.js`, `state.js` y `styles.css`).
- **Backend:** Render, `machea.onrender.com`, sigue desplegando desde `version_0.2`. El plan gratis duerme: la primera consulta tarda ~20-25 s.
- **Dónde vive el código del formulario:** `frontend/public/experiencia/` (JS vanilla, sin build, servido tal cual).
  - `css/styles.css` (~5.000 líneas) y `js/tema.js`: estilos y tokens.
  - `js/templates.js` (~1.840 líneas): el HTML de cada pantalla.
  - `js/data.js`: preguntas, opciones y textos.
  - `js/main.js` (~2.030 líneas): lógica e interacciones. `js/state.js`: estado y flujo.
  - `tenants/machea/marca.js`: textos de marca (habeas data, disclaimers).
  - `js/plano3d/` y `vendor/`: el 3D. **No tocar.**

### El recorrido

1. Registro ("Carné de constructor"): nombres, apellidos, cédula, correo, teléfono y consentimiento.
2. `operacion`: Comprar o Arrendar.
3. **Compra (8 pasos en total):** operación → zona (mapa + buscador) → tipo (VIS / No VIS) → ingresos → personas → habitaciones → entorno (multiselección) → edad → resultados (18 proyectos, de 6 en 6) → llamar o WhatsApp → confirmación.
4. **Arriendo (9 pasos en total):** operación → tipo de propiedad → zona → presupuesto → ingresos → personas → mudanza → preferencias (contadores) → estilo de vida → resultado.

## 4. Hallazgos

Ordenados por impacto en la confianza de un prospecto B2B. Cada uno tiene su captura de referencia.

### A. Credibilidad (lo más grave)

| # | Hallazgo | Detalle |
|---|---|---|
| A1 | **El resultado de Arriendo es un callejón sin salida** | Tras 9 preguntas aparece un 🚧 "Estamos construyendo el matching de Arriendo" y solo "Empezar de nuevo". Captura: `arriendo_d_12_resultado_arriendo`. |
| A2 | **Copy desactualizado** | La landing dice "Formulario interactivo · 7 de 7", pero el formulario tiene 8 o 9 pasos. Los resultados dicen "La recomendación es una demostración del reto" y el tenant machea dice "Demostración". |
| A3 | **Valores crudos en las etiquetas de Arriendo** | Salen `1-2M`, `1_mes` y `2 hab · 1 baños` tal cual (el chip "1 baños" ni concuerda en singular). Captura: `arriendo_d_12_resultado_arriendo`. |
| A4 | **Datos internos visibles** | La dirección de una tarjeta dice "(Dirección provisional)". El código aún trae textos por defecto de Colsubsidio (afiliación, habeas data, dominio `colsubsidio.com`) que solo se evitan porque el tenant machea los sobrescribe. |
| A5 | **Dos números de "match" distintos** | La barra "Encaje con el catálogo ahora mismo" (45%) durante el quiz y el "% match" de las tarjetas (85%) usan motores distintos: el motor local en el quiz y el modelo en los resultados. Se puede leer como inconsistencia. |

### B. Primera impresión

| # | Hallazgo | Detalle |
|---|---|---|
| B1 | **Registro con tono de juego** | "Tu carné de constructor", carné inclinado, avatar emoji 👷. Pide cédula antes de dar ningún valor. **Decidido:** se quita la cédula y se rediseña el carné y el avatar de forma sobria. Captura: `compra_d_00c_registro_lleno`. |
| B2 | **Botón principal cortado** | Con el formulario lleno y 900 px de alto, "Empezar a construir →" queda recortado por el borde inferior y el texto de ayuda (se ve en `compra_d_00c_registro_lleno`). |
| B3 | **Pantallas iniciales casi vacías** | "¿Qué estás buscando?" y "¿Qué propiedad?" son un bloque pequeño flotando en un fondo con puntos y líneas sueltas, con "← Atrás" separado al fondo. Capturas: `compra_d_01_operacion`, `arriendo_d_02_tipo_propiedad`. |
| B4 | **La validación no dice qué falta** | Con el formulario vacío el botón se ve apagado y, al pulsarlo, no pasa nada: ni mensaje ni campo marcado. Solo un texto de ayuda genérico al pie. Captura: `compra_d_00b_registro_vacio`. |

### C. Interacción

| # | Hallazgo | Detalle |
|---|---|---|
| C1 | **La lista de amenidades tapa "Continuar"** | En el paso de entorno la lista queda abierta tras elegir y cubre el botón. Hay que cerrarla tocando fuera. Es un bug real, reproducido en escritorio y móvil. Capturas: `compra_d_11_entorno_piscina`, `compra_m_11_entorno_piscina`. |
| C2 | **Contadores de Arriendo sin estilo** | Botones − y + diminutos, con estilos en línea. El código lo reconoce: "Sin CSS propio a propósito". Captura: `arriendo_d_08_preferencias`. |
| C3 | **Error JS en consola** | `Cannot read properties of undefined (reading '_leaflet_pos')` al salir del mapa en el flujo de Arriendo. |
| C4 | **Mapa poco curado** | Tiles crudos de OpenStreetMap, con mucho ruido visual (calles, relieve, rótulos de municipios vecinos). En móvil el mapa es una franja pequeña arriba. Capturas: `compra_d_02_zona_mapa`, `compra_m_02_zona_mapa`. |
| C5 | **Estilo de vida con 11 opciones en nube de chips** | Mínimo 3 obligatorio. Pendiente de revisar cómo se lee (captura: `arriendo_d_10_estilo_vida`). |

### D. Resultados de Compra

| # | Hallazgo | Detalle |
|---|---|---|
| D1 | **Demasiados colores compitiendo** | Precio coral grande, "Llamar" en verde azulado, "WhatsApp" en otro verde, cajas rosadas, badge verde de match, bordes coral. Captura: `compra_d_14_resultados`. |
| D2 | **Párrafo largo en cada tarjeta** | La "razón" es un bloque de 6-8 líneas con jerga ("el otro lado de Usaquén…", "se pasa de lo que da tu rango de ingresos"). |
| D3 | **Llamar y WhatsApp tienen el mismo peso** | Llamar dispara una llamada real de IA al teléfono; WhatsApp es un enlace. Visualmente no se distingue la diferencia. |

### E. Sistema visual

| # | Hallazgo | Detalle |
|---|---|---|
| E1 | **Sin sistema unificado** | Tipografía del formulario: Poppins (titulares) + Manrope (cuerpo), distinta de la Archivo de la landing. Emojis como iconografía (👷 📞 🚧 🔍 ⚠️ 🏅). Estilos en línea mezclados con 5.000 líneas de CSS. |
| E2 | **La documentación del repo no coincide con producción** | `CLAUDE.md` §8.3 del producto dice que Machea usa Sora, `SISTEMA_MACHEA` y CTA coral. En `main` esas piezas no existen: `tema.js` solo aplica la superficie clara, y el CTA usa el `acento` del tenant, que es verde `#2DD4A7`. Por eso "Continuar" y "Empezar a construir" son verdes. **Resuelto por el manual de marca:** el acento es rojo `#FC4633` y no hay verde (ver E6 y [MARCA.md](MARCA.md)). |
| E5 | **Ningún logo en el formulario** | En ninguna pantalla aparece la marca: `logo` y `marcaChica` están vacíos en el tenant. Para un B2B es una pérdida de confianza evidente. |
| E6 | **La paleta y la tipografía no son las del manual** | Hoy: coral `#FF6259`, navy `#2D3B4E`, beige, verde `#2DD4A7`, Poppins + Manrope. Manual: rojo `#FC4633`, navy `#1F2E42`, blanco/gris claro, sin verde, Inter. Tabla completa en [MARCA.md](MARCA.md). |
| E3 | **Tokens repartidos y duplicados** | La paleta viene de `tenants/machea/marca.js` (generado), la superficie clara está fija en `tema.js` y la landing tiene los suyos en `frontend/index.html`. Nada los mantiene sincronizados. |
| E4 | **Fondo decorativo** | Puntos y líneas tipo constelación sobre degradado rosado. Se ve como adorno, no como marca. |

## 5. Lo que funciona bien (conservar)

- Flujo corto y claro, con barra de progreso real.
- Pantalla de ingresos con ayuda en pesos (`≈ $3.5M – $7.0M`).
- Buscador de zona con tres niveles (barrios, lugares, mapa) y chips de lo elegido.
- Tarjetas de resultado con foto, precio y qué coincide con lo pedido ("Tiene lo que buscas ✓").
- El 3D, que es el diferencial. No hay desbordes horizontales en móvil.

## 6. Restricciones

- **No tocar** `js/plano3d/` ni `vendor/` (el 3D queda igual). Cuidado también con `perfil.js`: el 3D depende del **orden** y los **ids** de las preguntas. No reordenar ni renombrar preguntas sin recorrer el 3D.
- **Arriendo:** diseño nuestro, lógica y contenido de Santiago. Coordinar con él antes de cambiar `QUESTIONS_ARRIENDO`, `state.js` o la pantalla de resultado de Arriendo. Todo debe llegar a producción.
- **No usar producción con datos de prueba hasta el final:** llegar a la pantalla de confirmación dispara una llamada **real** de Manuela (Dapta) al teléfono ingresado. Probar con la API local en modo mock (sin `DAPTA_FLOW_WEBHOOK_URL`).
- **`tenants/machea/marca.js` es un archivo generado** ("GENERADO por plataforma/tools/generar_tenants.py — no editar"), y ese generador **no está en este repo**. Si se edita a mano, la próxima regeneración lo pisa. Antes de tocar paleta, tipografía o textos de marca ahí, preguntar a Santiago/BGsanti dónde vive el generador y cómo se actualiza.
- **Los textos de `data.js` que viajan al backend no se cambian** (por ejemplo las etiquetas exactas de `entorno_deseado`, con sus erratas a propósito). Solo cambian los textos que ve la persona (`label`, `title`, `sub`).
- Cambios en `main` van por rama y PR (hace merge una persona). El repo es público: nada sensible.
- Cache-busting: el HTML del formulario usa `?v=N`; subirlo al cambiar JS/CSS.
- Verificar antes de dar algo por bueno: recorrer el quiz completo y mirar el resultado, no confiar en que el merge salió limpio.

## 7. Preguntas abiertas

Resueltas el 2026-10-02: cierre de Arriendo (pantalla "en construcción" profesional), cédula (se elimina), carné y avatar (versión sobria, sin emojis), símbolos tipográficos (también a SVG), existencia del manual de marca y del logo.

Con el manual, la pregunta del color de acción se contesta sola: el rojo `#FC4633` es el acento y **no existe el verde**. Pendiente de confirmar con Diego.

Decididas el 2026-10-02 (segunda ronda):
- **Paleta y tipografía:** los tokens de Machea se **fijan dentro de `tema.js`** (que sí está en el repo) y no se depende del generador de `marca.js`. Queda anotado para la fase 1; todavía no se hizo.
- **Pantalla "en construcción" de Arriendo:** su texto se acuerda con Santiago.
- **Registro:** a Diego le gusta el carné, pero se decide **viendo mockups**. Hay cuatro propuestas en [mockups/registro.html](mockups/registro.html) (vistas previas en `mockups/vista_A.png` a `vista_D.png`).
- **Landing:** **se queda igual.** La mantiene Santiago y él decide cuándo actualizarla. El formulario y la landing tendrán paletas distintas mientras tanto.
- **Logo:** Diego dejó `recursos/Machealogo2.png`. Es un PNG con un resplandor neón incorporado (sobre blanco se vería como una mancha rosada) y su rojo (`#FC2F1F`) no coincide exactamente con el del manual. Para fondos claros se usa el isotipo vectorial limpio que ya está en el repo, recoloreado a `#FC4633`: `recursos/isotipo-machea-FC4633.svg`. La versión horizontal con la palabra "machea" de los mockups es una **aproximación** (isotipo + texto en Inter ExtraBold), no el lockup oficial.

Decididas el 2026-10-02 (tercera ronda):
- **Registro: variante B, "formulario limpio"** (logo, título, dos columnas, botón rojo, sin carné ni avatar).
- **Logo blanco:** Diego dejó `LogoMacheaBlanco.png` (con el mismo resplandor). Como la variante B va sobre blanco no se necesita; generé `recursos/isotipo-machea-blanco.svg` desde el vector por si hace falta sobre fondos oscuros.
- **Estados de interfaz:** error en rojo con icono, campo válido con borde navy y casilla con check navy. Aprobados.
- **Textos de los mockups:** se pueden usar como base; se ajustan al implementar.

Decididas el 2026-10-02 (cuarta ronda):
- **Estrategia de ramas aprobada:** rama de integración `rediseno-formulario`; todo se acumula ahí y solo se sube a producción cuando Diego apruebe el conjunto.
- **Santiago:** Diego se lo comenta.
- **Lockup horizontal oficial:** lo hace Diego y lo pondrá en `recursos/`. Mientras tanto se usa isotipo + texto en Inter ExtraBold.
- **Tabla de textos:** redactada en [TEXTOS.md](TEXTOS.md), pendiente de aprobación.

Siguen abiertas:
1. ~~Aprobar [TEXTOS.md](TEXTOS.md)~~: aprobado el 2026-10-02.
2. **Respuesta de Santiago** sobre los datos de Arriendo, el texto de "en construcción" y la lógica de calificación con reglas de Colsubsidio.
3. **Re-exportar el lockup claro** (el JPG trae un falso fondo de cuadros; ver [MARCA.md](MARCA.md)), decidir el rojo oficial (`#FC4633` del manual frente a los `#F92C1D`/`#FC2F1F` de los archivos) y, si se quiere, un lockup horizontal con isotipo. Mientras tanto hay derivados provisionales en `recursos/`.

Hallazgo nuevo (2026-10-02): `qualification.js` aplica la lógica del cupo 90/10 de Colsubsidio a todos los tenants; en Machea muestra la nota "No afiliado — cupo 10% / posible afiliación" y suma puntaje por ello. Y el cierre actual de Arriendo dice "Ya guardamos lo que nos contaste" aunque el código reconoce que esos datos no llegan a Supabase ni a la llamada.

## 8. Propuesta de fases (borrador, sin desarrollar)

Pensada para dividirse en tareas del board; las chicas y claras, con la etiqueta **Autónoma** para el turno nocturno.

1. **Fundamentos visuales según el manual de marca:** tokens de color (rojo `#FC4633`, navy `#1F2E42`, blancos y grises), **Inter** (ya se carga en el `index.html` del formulario) con ExtraBold/Bold/Medium, radios 18/14/pastilla, sombra y borde de tarjeta, y fondo blanco sin degradado rosado ni puntos decorativos. Quitar el verde. Quitar los estilos en línea. Crear el **set de iconos SVG lineales** que sustituye a todos los emojis y símbolos (ver sección 9) y la regla de cero emojis. Incorporar el **logo** en el encabezado del formulario y como favicon. Movimiento base según el manual (M01 a M05) para entradas, selección y barra de progreso.
2. **Registro:** rediseño sobrio (sin cédula, sin carné inclinado ni avatar emoji), validación visible por campo, botón visible sin recortes, texto legal claro. Ver el impacto de quitar la cédula en la sección 10.
3. **Pantallas de pregunta:** composición centrada con jerarquía, "Atrás" junto al contenido, estados de selección, hover y foco accesibles, barra de progreso consistente. Incluye el contador de Arriendo y el estilo de vida.
4. **Zona y entorno:** arreglar C1 (la lista que tapa "Continuar"), el error de Leaflet (C3), pulir el mapa (C4) y el móvil.
5. **Resultados:** simplificar color y jerarquía de las tarjetas, acortar "razón", diferenciar Llamar de WhatsApp, quitar textos de demostración y datos provisionales.
6. **Pantalla de confirmación y cierre de Arriendo:** diseño profesional de ambos cierres. Arriendo: pantalla "en construcción" sobria (decidido); acordar el texto con Santiago.
7. **Copy y datos:** actualizar "7 de 7" donde corresponda (en la landing solo se avisa, no se toca), formatear valores crudos en los chips, limpiar textos por defecto de Colsubsidio.
8. **QA y despliegue:** recorrido completo de ambas ramas en escritorio y móvil, comparación antes/después, PR y verificación en producción.

Orden sugerido: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Las fases 3 a 6 se pueden paralelizar una vez hecha la 1.

## 9. Política: cero emojis

Decisión de Diego: **nunca emojis en el formulario**. Si se necesita un símbolo, se dibuja un icono SVG propio.

Inventario hoy en `main` (solo el formulario; el 3D, los tenants y la landing no tienen o no se tocan):

| Dónde | Qué |
|---|---|
| `js/templates.js` (27 líneas) | Avatar 👷, 📞 (contacto y llamada), 📍 (ubicación de tarjetas y confirmación), 🏅 (apto para subsidio), 🔍 (sin resultados), ⚠️ (error), 🚧 (Arriendo), 🏢 (foto de respaldo), 📡 (conectando), y otros en el resumen post-llamada (temperatura del lead: 🔥 🌤 ❄, además de 🎙 💰 🙋 📅 🧭 🏗). |
| `js/data.js` (4) | Lista `GENDERS` con `emoji` (👷 y variantes ♀ ♂). El avatar desaparece con el rediseño del registro. |
| `js/qualification.js` | Iconos del estado del lead: ✅ (listo) y 🌱 (explorando). Se muestran en la pantalla de resultados y confirmación. |
| `js/state.js` | Chip "Afiliado ✓". |
| `css/styles.css` (2350) | `content: '✓'` en un pseudo-elemento. |
| `index.html` del formulario | **El favicon es un emoji** (un `<text>` dentro de un SVG en línea). Hay que reemplazarlo por un SVG real de marca. |
| Símbolos tipográficos | ✓ (10 usos), ✦ (eyebrows de resultados), ↺ (reiniciar), ← → (navegación). Ver pregunta abierta 6. |

Forma de trabajar el reemplazo:
- Un único módulo de iconos SVG (hoy existe `js/iconos.js` para amenidades; se puede ampliar o crear uno hermano para la interfaz), con `stroke=currentColor` para que hereden color.
- Los comentarios de código con emoji (`data.js:142`, etc.) no cuentan: no los ve nadie.
- Añadir un chequeo simple antes de cada PR (un `grep` por rangos Unicode de emoji sobre `js/`, `css/` e `index.html`, sin contar comentarios) para que no vuelvan a colarse.

## 10. Impacto de quitar la cédula

Revisado en `main` (front y backend):

- **Backend y llamada de Manuela:** no usan la cédula. `backend/api`, `backend/dapta` y `CONTRATO_FRONT.md` no la mencionan. No hay riesgo para el modelo ni para `/api/llamar`.
- **Frontend:** se valida en tres sitios que hay que limpiar a la vez: `templates.js` (`isValidCedula`, la plantilla y el texto de ayuda), `state.js` (`createInitial` y `startQuiz`) y `main.js` (el listener del input y dos validaciones, ~líneas 863 y 1158).
- **Función de "recuperar consulta anterior"** (`main.js` ~1149-1180): busca una consulta previa por **cédula + teléfono** (`datos.buscarResultados`). Hoy está inerte porque `SUPABASE_URL` está vacío en `config.js`, y el módulo `js/datos.js` que cita no está en `main`. Al quitar la cédula hay que desactivar o reescribir esa función (por ejemplo, solo por teléfono), y confirmarlo con Santiago, que mantiene la integración con Supabase.
- **Tarea de Santiago en el board (hallazgo del 2026-10-02):** "Base de datos persistente de leads (Supabase): cédula, consultas guardadas e intención de compra", `in_progress` y parada desde el 2026-09-28. Su diseño usa la cédula como llave y su código (`js/datos.js`, migración y documentación) **no está en origin**. Quitar la cédula exige acordar con él una identidad alternativa (teléfono y correo) antes de ejecutar T4a.
- **Migración de Supabase:** el comentario de `state.js` dice que la tabla `leads` tiene un check de la cédula (5 a 15 dígitos). Si esa migración se llega a aplicar, la columna tendría que ser opcional. Hoy no afecta porque Supabase no está configurado.
