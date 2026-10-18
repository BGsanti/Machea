# Camila: el agente de captación de Machea

Camila es el agente de voz **propio** de Machea. Llama a inmobiliarias y constructoras (prospectos de Machea), entiende si
Machea les sirve, los **califica** (A/B/C) y les **agenda una demostración de 20 minutos** con el equipo. No es Manuela:
Manuela atiende a los leads de compradores de *nuestros clientes* (`docs/agente-manuela-v2.md`).

- Prompt: `backend/dapta/prompt-captacion.md` (se pega en Dapta; la fuente de verdad es Dapta, si se edita allá se actualiza este archivo).
- Código: `backend/api/captacion.py` · pruebas: `backend/tests/test_captacion.py` · tablas: `supabase/migrations/20261017180000_captacion.sql`.
- Importar una lista: `backend/scripts/importar_prospectos.py`.

## 1. Cómo encaja

```
 Landing "Agenda una demo" ──► Supabase (solicitar_demo)         ┐ las dos cosas, en paralelo
                          └─► POST /api/captacion/demo           ┘
 Lista fría (CSV) ─────────► POST /api/captacion/importar  (script)
                                      │  prospectos (estado nuevo / en_cola)
                                      ▼
 cron cada 10 min ─────────► POST /api/captacion/cola ──► llamar_prospecto()
                                                              │ horario · topes · intentos
                                                              ▼
                                            Flow de Dapta  ──►  Camila llama
                                                                     │
 POST /webhooks/dapta/captacion?k=SECRETO  ◄── post-llamada ─────────┘
        │  califica (A/B/C/X) · guarda llamada · crea cita · decide el estado
        ▼
 prospectos · llamadas_captacion · citas   (Supabase, o memoria si no hay clave)
```

**Una llamada cálida** (`origen=demo_web`) es de alguien que pidió la demo hace minutos: Camila ya sabe lo que respondió en el
formulario y va directo a la agenda. **Una llamada fría** (`lista_frio`) abre explicando quién es y por qué llama, en una frase.

## 2. Calificación (la hace el código, no el modelo)

El agente recoge los datos; la puntuación sale de `captacion.puntuar` para que sea comparable y auditable.

| Dato (variable post-llamada) | Puntos |
|---|---|
| `leads_mes` ≥ 300 / ≥ 100 / ≥ 30 / menos | 30 / 20 / 10 / 3 |
| `inversion_pauta_mes` más de 6 M / 2 a 6 M / menos de 2 M / ninguna | 20 / 12 / 5 / 0 |
| `tiempo_respuesta` 24 h o más o mismo día / menos de 1 h o no sabe / menos de 5 min | 15 / 8 / 2 |
| `es_decisor` sí / influye | 15 / 8 |
| `interes` alto / medio | 20 / 10 |
| `demo_agendada` | +15 |

Tope 100. **A ≥ 70**, **B ≥ 40**, **C** el resto, **X** = pidió que no lo llamen (`no_contactar`), sin importar los puntos.
La idea: quien recibe muchos leads, invierte en pauta y los atiende tarde es quien más gana con Machea.

## 3. Estados de un prospecto

`nuevo` → `llamando` → (`demo_agendada` | `calificado` | `no_interesado` | `no_contactar` | `en_cola` | `sin_respuesta`)

- **Sin contacto** (buzón, no contestó, colgó en pocos segundos): vuelve a `en_cola` con `proximo_intento` en la próxima
  ventana permitida; tras **3 intentos** pasa a `sin_respuesta`. Una demo pedida por la web no se agota por intentos.
- **Llamada sin resultado** (el webhook no llegó) más de 45 min: la cola la reprograma sola.
- **Calificado con siguiente paso** (por ejemplo «llámeme el jueves en la tarde»): se crea una cita de tipo
  `llamada_seguimiento`; `confirmada` si hay día y hora exactos, `propuesta` si solo hay una franja.
- **Demo agendada**: cita de tipo `demo`. Si la persona dio solo una franja («el sábado en la mañana») la cita queda con el
  texto acordado y sin hora exacta: no se inventa una hora.

## 4. Seguridad y cumplimiento (leer antes de encender)

- **Horario**: nunca domingos ni festivos de Colombia (Ley Emiliani calculada en código); lunes a viernes 8:00 a 18:00 y
  sábados 9:00 a 12:00. Es más estricto que la Ley 2300 de 2023 a propósito.
- **Topes**: 1 llamada por número y día, `CAPTACION_LLAMADAS_DIA` por día (por defecto 60), máximo 3 intentos por prospecto,
  3 llamadas por tanda de cola. La demo pública usa además los topes de `/api/llamar` (por teléfono, por IP, por día).
- **Habeas Data (Ley 1581)**: la lista fría sale de directorios públicos de empresas; antes de una campaña en frío, tener
  definida la política de tratamiento y la forma de dar de baja. Camila **se identifica como asistente virtual** y avisa que
  la llamada puede quedar registrada; si piden que no los llamen, el resultado marca `no_contactar` y ese número no se vuelve a marcar.
- **El endpoint público** (`/api/captacion/demo`) llama a un teléfono que escribe un desconocido: exige la casilla de
  autorización, solo acepta celulares colombianos, tiene trampa para bots y **está apagado** hasta `CAPTACION_LLAMAR_DEMOS=true`.
- **Datos que entran al prompt** (empresa, nombre, problema) se limpian igual que en la demo con marca.
- **Webhook** protegido con un secreto de 24+ caracteres en la URL; los demás endpoints piden la sesión del panel `/admin`
  o la cabecera `X-Captacion-Key` (`CAPTACION_API_KEY`, 24+ caracteres).
- Los teléfonos salen **enmascarados** en `/api/captacion/prospectos` y en las métricas.

## 5. Ponerla a funcionar (en este orden)

**Estado al 2026-10-18.** Hecho en Dapta (workspace *Machea*, `c61858f2-35db-491a-a2ef-ff4e4b24ffc4`): el agente **«Camila — Machea Captación»**
(`f4c71126-0ff8-4ea6-9c1f-5a0c028cb6d7`, voz *Angie vendedora Colombiana*, gpt-5, detección de buzón apagada, sensibilidad 0,6, 20 variables
post-llamada, webhook puesto) y el flow **«Machea - Captación: disparador de llamadas»** (`htrqM`). Pendiente: Supabase (§5.1) y Render (§5.4).
El código de los nodos del flow está en `backend/dapta/flow-captacion-preparar.js` (valida el teléfono y calcula el calendario de 10 días con
festivos). Camila llama desde el mismo número que Manuela (`+14432930308`, el único del workspace): si un prospecto devuelve la llamada, contesta
Manuela. Lo ideal es comprar un segundo número en Dapta (solo se hace en el panel) y cambiar `from_number` del nodo «Llamar prospecto».

### 5.1 Supabase
1. Aplicar `supabase/migrations/20261015120000_solicitudes_demo.sql` (si no está) y luego `20261017180000_captacion.sql` en el SQL Editor del proyecto `machea-leads`.
2. Copiar la clave **service_role** (Settings → API) **solo a Render** (`SUPABASE_SERVICE_KEY`). Nunca al front, a un chat ni al repo.

### 5.2 Agente en Dapta (workspace de Machea) — HECHO
1. Crear un agente de voz nuevo, «Camila · Machea Captación», voz femenina colombiana (la misma familia de Manuela sirve), idioma español de Colombia.
2. Pegar `backend/dapta/prompt-captacion.md` completo (sin el comentario inicial).
3. **Mensaje inicial vacío** y que el agente hable primero según la Etapa 1 (una sola frase de 12 a 18 palabras, sin pregunta: así pasa el filtro de llamadas de iPhone).
4. Ajustes recomendados: sensibilidad a interrupciones **0,6**; recordatorio por silencio a 7 s, máx. 2; reconocimiento de voz en modo preciso;
   **detección de buzón desactivada** (el prompt ya cuelga ante un buzón real) o con mensaje fijo; duración máxima 8 min.
5. **Variables de entrada** (las llena el flow): `origen`, `nombre`, `empresa`, `tipo_empresa`, `ciudad`, `sitio`, `problema_declarado`,
   `fuente_leads`, `pauta_mensual`, `leads_mes`, `crm_actual`, `current_time`, `prospecto_id`.
6. **Variables post-llamada** (análisis de la llamada), con estos nombres exactos y valores:

| Variable | Valores |
|---|---|
| `tipo_empresa_confirmado` | inmobiliaria · constructora · otro |
| `leads_mes` | número o texto («unos 400») |
| `inversion_pauta_mes` | ninguna · menos_2m · 2_6m · mas_6m · no_sabe |
| `tiempo_respuesta` | menos_5min · menos_1h · mismo_dia · 24h_o_mas · no_sabe |
| `crm_actual` | texto |
| `es_decisor` | si · influye · no · no_sabe |
| `dolor_principal` | texto corto |
| `interes` | alto · medio · bajo |
| `demo_agendada` | true / false |
| `fecha_hora_demo` | AAAA-MM-DD HH:MM (hora de Colombia) solo si quedó día **y** hora |
| `fecha_demo_texto` | lo acordado en palabras («martes 21 de octubre, 4:00 p. m.») |
| `motivo_no_demo` | texto corto; `no_interesado` o `ya_tiene_solucion` cierran el prospecto como `no_interesado` |
| `objecion_principal` | texto corto (queda guardada para aprender qué objeción es la más común) |
| `siguiente_paso` | demo · volver_a_llamar · enviar_info · ninguno (`volver_a_llamar` crea la cita de seguimiento) |
| `fecha_seguimiento` / `fecha_hora_seguimiento` | texto / AAAA-MM-DD HH:MM |
| `nombre_contacto`, `cargo_contacto` | texto |
| `no_contactar` | true / false |
| `resumen_llamada` | 2 o 3 frases en español |

### 5.3 Flow en Dapta — HECHO
Crear el flow **«Machea - Captación: disparador de llamadas»**: disparador por webhook que recibe exactamente las variables de
entrada de arriba más `telefono` (E.164, p. ej. `+573001234567`) y `external_lead_id`; un nodo de llamada saliente con el agente
Camila que pasa todas esas variables como `dynamic_variables`; y el **webhook post-llamada** apuntando a:

```
https://machea-api.onrender.com/webhooks/dapta/captacion?k=<CAPTACION_WEBHOOK_SECRET>
```

Guardar un agente en la interfaz de Dapta a veces borra el webhook: comprobarlo después de cada edición. Copiar la URL del
flow y la clave de API del workspace de Machea.

### 5.4 Render (variables de entorno, luego Manual Deploy)
| Variable | Qué es |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | dónde se guarda todo (sin ellas queda en memoria y **se pierde al reiniciar**) |
| `DAPTA_CAPTACION_FLOW_URL`, `DAPTA_API_KEY` | el flow de Camila y la clave del workspace |
| `CAPTACION_WEBHOOK_SECRET` | 24+ caracteres al azar; el mismo `k=` del webhook |
| `CAPTACION_API_KEY` | 24+ caracteres al azar, para el importador y el cron |
| `CAPTACION_LLAMAR_DEMOS` | `true` cuando Camila deba llamar sola a quien pide la demo en la landing |
| `CAPTACION_LLAMADAS_DIA` | tope diario de llamadas de captación (por defecto 60) |

### 5.5 Primera llamada de prueba
1. Con `CAPTACION_LLAMAR_DEMOS` aún apagado, importar **un** prospecto con un número propio y llamarlo a mano:
   `POST /api/captacion/llamar` con `{"telefono": "3001234567"}` y la cabecera `X-Captacion-Key`.
2. Contestar y recorrer los diez casos del plan de pruebas (§7). Revisar `/api/captacion/prospectos`, `/citas` y `/resumen`.
3. Cuando el resultado y la cita salgan bien, encender `CAPTACION_LLAMAR_DEMOS=true`.

## 6. Operación

- **Cargar la lista**: `CAPTACION_API_KEY=… python backend/scripts/importar_prospectos.py ~/Desktop/MACHEA/SCRAPING/empresas_objetivo.csv`
  (con `--solo-validar` cuenta cuántos teléfonos sirven sin enviar nada; de las 100 empresas actuales sirven 95). Importar **no llama a nadie**.
- **Cola**: un cron cada 10 minutos que haga `POST /api/captacion/cola?maximo=3` con la cabecera `X-Captacion-Key`
  (cron-job.org o un Cron Job de Render). Fuera de horario no hace nada. Va despacio a propósito: Dapta limita las llamadas simultáneas y las
  devueltas por un prospecto (entrantes) compiten con ellas.
- **Ver cómo va**: `GET /api/captacion/resumen` (por estado, por calificación, llamadas, citas), `/prospectos?estado=demo_agendada`, `/citas`.
- Mientras no exista el panel de citas (siguiente fase), las citas se leen de `/api/captacion/citas` o de la tabla `citas` en Supabase.

## 7. Plan de pruebas con llamadas reales (a un número propio)

1. Contesta y dice el nombre bien (empresa y persona) en una sola frase de apertura. 2. Cálida: sabe lo que llenaste en el formulario y no lo
vuelve a preguntar. 3. Fría: se presenta y dice por qué llama sin que se sienta spam. 4. Pregunta como máximo cuatro cosas, una por turno.
5. Ofrece **dos** horas concretas y repite la elegida para confirmar. 6. «Mándame información»: ofrece la demo corta antes de rendirse.
7. «Ahora no puedo»: pregunta cuándo volver a llamar y lo deja como seguimiento. 8. «No me llamen más»: se disculpa, cuelga y marca `no_contactar`.
9. Preguntan si es un robot: lo reconoce con naturalidad. 10. Buzón de voz: cuelga sin dejar mensaje y el sistema la reprograma.

## 8. Lo que sigue (no está hecho)

- Panel de citas y de prospectos en `/admin` (hoy solo hay API) y aviso al asesor cuando se agenda una demo.
- Evento real en Google Calendar / CRM, con Camila consultando disponibilidad y recordatorio la víspera.
- Reintento por WhatsApp a quienes no contestan (el seguimiento por WhatsApp sigue apagado en el backend).
- Aprender de las llamadas: mejores horas por tipo de empresa y qué apertura logra más demos.
