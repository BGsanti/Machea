# Manuela v2.1 — la agente que agenda

Prompt: [`backend/dapta/prompt-manuela.md`](../backend/dapta/prompt-manuela.md). Fecha: 2026-10-17.

## 1. Diagnóstico (con llamadas reales)

Se revisaron las 29 llamadas del agente "Manuela — Machea" en Dapta (agosto-octubre) y las transcripciones de las que sí
conversaron. Lo que se encontró:

| Problema | Evidencia |
|---|---|
| **El prompt no pide agendar.** Su cierre era "un asesor te contactará pronto" | Solo **1 de 29** llamadas dejó `fecha_de_seguimiento`, y fue porque el lead preguntó "¿en qué fecha puedo agendar?". Nunca propone una hora |
| **Pierde el hilo.** El paso 3 manda "preguntas imaginativas" ("¿cómo te imaginas un domingo en tu apartamento?") | En una llamada de 100 s gastó ~60 s en "domingo", "una cosa que no puede faltar", "qué te emociona", "¿balcón o interior?" (esta última se la inventó). El lead dijo "todavía las preguntas" |
| **Cierra dos veces y sigue hablando** | Dijo "un asesor te contactará" a la mitad y luego siguió preguntando; cerró otra vez al final |
| **Monólogos** al ofrecer la ficha (20 s seguidos) | El lead cuelga a mitad de la oferta |
| **Se confunde con ruido o palabras sueltas** ("resumen.", "su --") | 5 llamadas terminaron por inactividad tras un "¿Sigues ahí?" |
| **"Te agendé"** sin que exista nada que agende | El texto prometía una agenda que no está conectada a ningún calendario |
| **Llamadas de regreso sin atender** | 2 llamadas entrantes al número de Manuela fallaron con `concurrency_limit_reached` |

## 2. Qué cambió en el prompt

1. **Misión única:** salir de cada llamada con día y hora confirmados. Tres finales posibles (cita, franja, cierre sin cita) y
   se prohíbe cerrar con interés sin haber propuesto una hora.
2. **Seis etapas** (apertura → interés → perfil de 2 preguntas → agenda → confirmación → cierre) y la regla "cada turno
   avanza o cierra la etapa; si se desvía, una frase y vuelve a la pregunta pendiente". Se eliminaron las preguntas imaginativas.
3. **Agenda como un experto:** propone **dos horas concretas** (cierre alternativo), concreta franjas, hasta 3 propuestas,
   horario de asesores (L-V 8-18, sáb 9-13, nunca domingos/festivos, mínimo 2 h después de `{{current_time}}`), repite y pide el "sí".
4. **Manejo de objeciones:** "mándame info por WhatsApp", "no tengo tiempo", "lo pienso", precio/cuota, crédito/subsidio,
   otro proyecto, "ya compré", "no me llamen" (se respeta y se registra), silencio, ruido.
5. **Honestidad:** si preguntan, es la asistente virtual de Machea (el asesor sí es persona); no promete invitaciones ni
   calendarios; "quedamos" / "te llama el asesor".
6. Turnos cortos, un solo cierre, sin monólogos; meta de 90-150 s.

El catálogo, las reglas de pronunciación, el modo demostración y el arriendo se conservan.

## 3. Cómo aplicarlo en Dapta (workspace de Machea)

1. Dapta → **Agentes de voz → Manuela — Machea → Instrucciones**: reemplazar todo el texto por el contenido de
   `backend/dapta/prompt-manuela.md` (sin el comentario `<!-- … -->` del inicio).
2. **Variables post-llamada:** dejar las que ya existen y agregar/ajustar estas (copiar descripciones tal cual):

| Variable | Tipo | Descripción para pegar |
|---|---|---|
| `cita_agendada` | boolean | `true` SOLO si la persona aceptó un día y una hora concretos y los confirmó al final. `false` en cualquier otro caso |
| `fecha_de_seguimiento` | string | Día y hora de la cita en lenguaje natural, hora de Colombia, por ejemplo "martes 21 de octubre, 4:00 p. m.". Si solo hay franja, la franja ("sábado en la mañana, sin hora exacta"). Vacío si no hubo cita |
| `fecha_hora_cita` | string | La misma cita en formato AAAA-MM-DD HH:MM (24 horas, hora de Colombia). Vacío si no hay hora exacta |
| `canal_cita` | enum: `llamada_asesor`, `whatsapp`, `ninguno` | Cómo se hará el contacto acordado |
| `motivo_no_agenda` | enum: `no_interesado`, `ya_compro`, `sin_tiempo`, `pidio_info_por_whatsapp`, `pidio_no_ser_contactado`, `numero_equivocado`, `buzon`, `no_se_entendio`, `otro` | Por qué no quedó una cita. Vacío si `cita_agendada` es true |
| `estado_del_lead` | enum: `qualified`, `callback`, `not_qualified` | `qualified` si hay cita confirmada; `callback` si quedó solo una franja o pidió que lo llamen luego; `not_qualified` si no le interesa, ya compró, número equivocado o pidió no ser llamado |
| `temperatura_lead` | enum: `caliente`, `tibio`, `frio` | `caliente` = quiere avanzar y dio una hora; `tibio` = interesado pero sin hora fija; `frio` = no le interesa o evasivo |
| `recomendacion_asesor` | string | Una o dos frases para el asesor: qué le interesa, presupuesto, mejor hora y la objeción si la hubo |

3. **Webhook post-llamada:** comprobar que `dapta_webhook` siga con la URL de Render
   (`…/webhooks/dapta/resultado`). Guardar un agente en la interfaz de Dapta a veces lo borra.
4. **Ajustes de voz sugeridos:** sensibilidad a interrupciones de 0,8 a **0,6** (con 0,8 el ruido o un "sí" la cortan a
   mitad de frase y pierde el hilo), recordatorio por silencio a 7 s y hasta 2 recordatorios, reconocimiento de voz en modo
   preciso si está disponible (hubo transcripciones "audio no reconocido").
5. **Llamadas de regreso:** si un lead devuelve la llamada al número de Manuela, hoy falla por límite de concurrencia. Subir el
   límite del plan o asignar un número de entrada con respuesta; si no, ese lead nunca habla con nadie.

## 3a. Llamadas que "cuelgan" a los 3-5 segundos (`voicemail_reached`)

**Síntoma:** contestas y la llamada se corta enseguida; Dapta la registra como `voicemail_reached` con "Call reached voicemail.
Post-call analysis skipped.". **No es el prompt:** en el historial, el mismo número tiene 6 de 13 llamadas así, todas de ~5,2 s,
desde agosto (antes de la v2).

**Causa más probable:** el filtro de llamadas de iOS 26 ("Filtrar llamadas de desconocidos") contesta por ti y pide "di tu nombre
y el motivo". Dapta lo toma por un buzón de voz y, con la acción "Colgar de inmediato", corta la llamada. Muchos leads con iPhone
nuevo están igual: se pierden sin que nadie lo note.

**Qué se hizo (prompt v2.1):** la primera frase de Manuela es UNA oración autosuficiente de 12-18 palabras, sin pregunta (nombre,
empresa y motivo: "Hola Ana, te habla Manuela de Machea, por tu solicitud de información sobre Florecer."), que es lo único que
alcanza a oírse en un filtro. Si una voz automática pide nombre y motivo, repite esa frase y espera sin colgar.

**Qué hacer en Dapta (Configuración → Call Settings → Voicemail Detection):** la acción "Hang up immediately" corta también esos
filtros. Opciones, de más a menos recomendada para esta etapa de pruebas:
1. **Desactivar la detección de buzón** y dejar que el prompt decida (ya manda `end_call` ante un buzón de verdad). Costo: un buzón
   real consume ~1 minuto en vez de 75 créditos.
2. Dejarla activa con **"Leave a message → Static phrase"** con la misma frase de apertura; el filtro del iPhone la transcribe y la
   persona puede decidir devolver la llamada (ojo: hoy las llamadas de regreso fallan por límite de concurrencia, ver 3.5).

**Qué se ve en la web (backend v2.1):** cuando nadie habló con Manuela, el resumen sale en español con la causa y un consejo
("si tienes iPhone, desactiva Filtrar llamadas de desconocidos…"), `sin_contacto = true` y `motivo_no_agenda = buzon`.

**Para probar:** en el iPhone, Ajustes → Teléfono → Filtrar llamadas de desconocidos → "No" (o "Preguntar motivo" para
comprobar la nueva apertura) y llamar de nuevo.

## 3b. Lo que ya se ve en la web

El backend (`/api/llamar/resultado`) y el resumen del formulario ahora pasan `cita_agendada`, `fecha_hora_cita`,
`canal_cita` y `motivo_no_agenda`; el chip "Seguimiento" muestra la cita y aparece "Cita confirmada". Requiere Manual Deploy en
Render. Hasta que Manuela llene esos campos, todo sigue funcionando como antes.

## 4. Pruebas (hacer estas llamadas después de aplicarlo)

Para cada una se revisa la transcripción en Dapta. **Criterio de éxito global:** cita confirmada o cierre limpio en menos
de 150 s, una sola despedida, sin preguntas fuera de las etapas.

1. **Camino feliz:** contesta, "sí, sigo interesado", responde las 2 preguntas, elige una de las dos horas. Debe repetir
   día y hora y pedir el "sí". `cita_agendada = true`, `fecha_de_seguimiento` y `fecha_hora_cita` llenas.
2. **Está ocupado:** "ahora no puedo". Debe ir directo a "¿hoy más tarde o mañana? ¿a qué hora?" y registrar esa hora.
3. **Ninguna hora le sirve:** rechaza las dos. Debe preguntar día y hora abiertos; si dice "en la tarde", concretar "¿tres o cinco?".
4. **"Mándame todo por WhatsApp":** debe reencuadrar una vez; si insiste, cerrar sin cita con el motivo.
5. **Divaga** (cuenta una historia, pregunta por otro proyecto): una frase y vuelve a la agenda.
6. **Pregunta "¿eres un robot?":** responde que es la asistente virtual y que el asesor es una persona.
7. **"No me llamen más":** se disculpa, confirma que no lo volverán a llamar, `motivo_no_agenda = pidio_no_ser_contactado`.
8. **Llamada a las 7 p. m. o un domingo:** propone desde la siguiente mañana hábil; nunca domingo.
9. **Ruido o silencio:** pide repetir una vez; "¿sigues ahí?" una vez; cierra cordialmente.
10. **Buzón de voz:** cuelga sin dejar mensaje (`end_call`).

Cada llamada de prueba de ~1 minuto gasta ~666 créditos de Dapta; usar solo números del equipo.

## 5. Qué medir cada semana (en `/admin/` y en Dapta)

- % de llamadas contestadas que terminan en `cita_agendada = true` (meta inicial: 40 %).
- Duración mediana de las llamadas contestadas (meta: 90-150 s).
- Motivos de `motivo_no_agenda` más frecuentes (para afinar objeciones).
- Llamadas que terminan por inactividad (deben bajar).

## 6. Lo que sigue (cuando haya calendario real)

Hoy la cita es un **acuerdo** (el asesor llama o escribe a esa hora), no un evento en un calendario. Cuando se conecte Google
Calendar o el CRM, Manuela puede consultar disponibilidad real y crear el evento; el prompt ya está preparado (etapas 4 y 5).
