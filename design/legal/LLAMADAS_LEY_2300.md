# Reglas de las llamadas y mensajes con IA (Ley 2300 de 2023)

**Borrador para el equipo y para revisión legal.** No es asesoría legal: lo tiene que revisar un abogado. Pedido de
Juan F a Diego (2026-11-03), LG-4 de `design/crm/REQUERIMIENTOS_SALIDA_AL_MERCADO.md`.

## Qué dice la ley, en corto

La Ley 2300 de 2023 ("Dejen de fregar") nació para la cobranza, pero su **artículo 5** extiende el horario a las
**llamadas y mensajes comerciales o publicitarios** (SMS, WhatsApp, correo y llamadas). Lo que nos toca:

| Regla | Texto de la ley | Artículo |
| --- | --- | --- |
| **Horario** | Lunes a viernes de 7:00 a.m. a 7:00 p.m. y sábados de 8:00 a.m. a 3:00 p.m. **Nunca domingos ni festivos.** | 3, y 5 par. 3 para lo comercial |
| **Frecuencia** | Después de un contacto directo, no contactar por varios canales en la misma semana ni más de una vez el mismo día. | 3 (escrito para cobranza) |
| **Darse de baja** | Quien envía mensajes comerciales debe ofrecer un mecanismo ágil, sencillo y eficiente para dejar de recibirlos en cualquier momento. | 5 par. 2 |
| **Registro de Números Excluidos (RNE)** | Lo administra la CRC; los números inscritos no reciben llamadas ni mensajes comerciales. | 5 |
| **Excepción** | No aplica a contactos para **enviar información solicitada** por la persona. | 8 |
| **Sanciones** | Las impone la Superintendencia de Industria y Comercio (y la Financiera, en lo suyo). | 9 |

[VERIFICAR con el abogado: la sentencia C-278 de 2024 de la Corte Constitucional, que aparece asociada a esta ley.
No la revisamos.]

**Lo que la Ley 2300 no dice, pero igual aplica:** avisar que es una asistente virtual, decir quién llama y por qué,
y avisar que se graba. Eso sale de la Ley 1581 (autorización informada), del Estatuto del Consumidor (no engañar) y de
lo que recomendó Ariel (`design/login/REVISION_LEGAL.md`).

## Cómo aplica a cada agente

| | **Manuela** (la persona la pidió) | **Camila** (llamada en frío a empresas) | **WhatsApp de seguimiento** |
| --- | --- | --- | --- |
| ¿Es "información solicitada" (art. 8)? | **Sí**, si solo habla del proyecto que pidió y no ofrece otros | **No** | Sí para el resumen y la cita; no si es publicidad |
| Horario | Por prudencia, el de la ley (recomendación de Ariel) | El de la ley; hoy usa uno más estricto | El de la ley |
| RNE | No hace falta (la persona pidió la llamada) | **Consultarlo antes de cada campaña** | No hace falta para el seguimiento pedido |
| Autorización | La casilla del formulario | Solo líneas generales o datos públicos de la empresa, nunca celulares personales de directorios | La casilla del formulario |

## Las reglas que proponemos

1. **Horario único para todo:** lunes a viernes de 7:00 a.m. a 7:00 p.m.; sábados de 8:00 a.m. a 3:00 p.m.; nunca
   domingos ni festivos de Colombia. Si alguien pide la llamada fuera de horario, se programa para el siguiente
   momento permitido y se le dice en pantalla ("Te llamamos el lunes a las 7:00 a.m.").
2. **Máximo un intento de llamada por día y por persona**, y **máximo [DECIDIR: 2 o 3] intentos en total** por
   solicitud. Una nueva solicitud de la persona reinicia la cuenta.
3. **Al comenzar, siempre:** quién llama ("Manuela, la asistente virtual de Machea"), por qué ("por tu solicitud
   sobre…") y que **la llamada se graba y se transcribe** (PR #43). Nunca fingir ser una persona.
4. **"No me llame más" de verdad:** la asistente se despide, el número entra a una **lista de exclusión** y desde ese
   momento ningún sistema lo vuelve a llamar ni a escribir (Manuela, Camila ni WhatsApp), aunque la persona vuelva a
   llenar un formulario, salvo que lo pida otra vez de forma expresa. Lo mismo si responde "no más" por WhatsApp o
   lo pide por correo.
5. **Solo de lo que pidió:** Manuela habla del proyecto que la persona eligió y de alternativas del mismo catálogo
   solo si la persona dice que no le sirve. No hace publicidad de otros productos.
6. **Camila:** consulta del RNE antes de cada campaña, guardar de dónde salió cada contacto, nunca celulares
   personales de directorios, y pedir permiso para grabar al comenzar.
7. **Guardar la prueba:** hora de cada intento, resultado, si aceptó la grabación y si pidió no ser contactado.

## Qué hay hoy y qué falta construir

| Regla | Hoy (`main`, 2026-11-09) | Falta |
| --- | --- | --- |
| Horario de Manuela | Fuera de horario, `/api/llamar` programa la llamada y la pantalla dice cuándo llama (`api/horario.py`, `api/programados.py`) | Que el cron de `/api/captacion/cola` esté activo |
| Horario de Camila | `backend/api/captacion.py`: L–V 8–18 y sábados 9–12, sin festivos (más estricto que la ley) | Nada |
| Horario del WhatsApp de seguimiento | Fuera de horario se programa para cuando abra (`seguimiento.despachar`) | Igual: el cron |
| Intentos | Hasta 1 llamada por número por hora (`limites.py`); el WhatsApp, hasta 2 al día; Camila, 3 intentos | [DECIDIR] tope por día y por solicitud |
| Aviso de asistente virtual | Manuela y Camila lo dicen | Nada |
| Aviso de grabación | Corregido en PR #43 (Manuela v2.2), falta cargarlo en Dapta | Cargar en Dapta |
| "No me llame más" en Manuela | El número entra a la **lista de exclusión** (`api/exclusiones.py`) y no se le manda el WhatsApp de esa llamada | Aplicar la migración `20261109120000_exclusiones_y_programados.sql` |
| "No me llame más" en Camila | Estado `no_contactar` y además entra a la lista | Igual: la migración |
| Quién consulta la lista | Camila antes de marcar, el WhatsApp de seguimiento y la cola de programados | Nada |
| Si vuelve a pedir la llamada | `/api/llamar` la saca de la lista y la llama: es una solicitud nueva y expresa (decisión de Diego, 2026-11-09) | Confirmarlo con el abogado |
| RNE | No se consulta | Consulta antes de cada campaña de Camila |

> **Sin la migración aplicada en Supabase, la lista no guarda nada** (el backend lo avisa en el registro de Render y no
> bloquea a nadie), y una llamada pedida fuera de horario responde "intenta de nuevo en unos minutos".

## Preguntas para el abogado

1. ¿La llamada que la persona pidió en el formulario entra en la excepción de "información solicitada" (art. 8)
   aunque Manuela proponga una cita con un asesor?
2. Si alguien pide la llamada un domingo, ¿podemos llamarla en ese momento porque lo pidió, o hay que esperar al
   lunes? (El parágrafo del art. 3 exige que la autorización para otro horario sea un documento aparte.)
3. ¿Los contactos de empresas que llama Camila son "consumidores" para esta ley?
4. ¿Qué dice la sentencia C-278 de 2024 sobre esta ley?

## Fuentes

- [Ley 2300 de 2023, en el normograma de la DIAN](https://normograma.dian.gov.co/dian/compilacion/docs/ley_2300_2023.htm)
- `design/login/REVISION_LEGAL.md` (respuestas de Ariel, mensaje 3) y `design/login/TEXTOS_AUTORIZACION_V2.md`, parte F
