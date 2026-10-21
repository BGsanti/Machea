-- Audio y transcripción de las llamadas de Manuela y de Camila.
--
-- Antes solo se guardaba el análisis (resumen, temperatura, cita). Ahora cada llamada deja también:
--   grabacion_url   el enlace al audio que manda Dapta (solo si es una dirección https de dapta.ai;
--                   reproducible cuando el agente tiene encendido «Public call link»)
--   transcripcion   la conversación como [{"r": "a"|"u", "t": texto, "s": segundo}] (a = agente, u = persona)
--   duracion_ms     cuánto duró (llamadas_captacion ya la tenía)
--
-- Orden: se puede aplicar antes o después de desplegar el backend. Si el código llega primero, guarda la llamada
-- sin estas columnas y lo avisa en el registro; si llega después, todo viaja completo.
--
-- Al CRM le llega solo: el trigger crm.ingresar_resultado copia la fila entera (to_jsonb(new)) a la bandeja, así
-- que las columnas nuevas viajan sin tocarlo. Idempotente: se puede volver a correr.

alter table public.resultados_llamada
  add column if not exists grabacion_url text check (grabacion_url is null or length(grabacion_url) <= 600),
  add column if not exists transcripcion jsonb,
  add column if not exists duracion_ms   integer;

alter table public.llamadas_captacion
  add column if not exists grabacion_url text check (grabacion_url is null or length(grabacion_url) <= 600),
  add column if not exists transcripcion jsonb;

comment on column public.resultados_llamada.grabacion_url is
  'Enlace al audio de la llamada (Dapta). Solo https de dapta.ai; reproducible si el agente tiene «Public call link».';
comment on column public.resultados_llamada.transcripcion is
  'Conversación: [{"r": "a"|"u", "t": "texto", "s": segundos}]. Contiene datos personales: nunca se expone al navegador de quien pidió la llamada.';
