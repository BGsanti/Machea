-- Consumo de cada empresa: cuándo salió el WhatsApp de seguimiento de una llamada de Manuela (api/seguimiento.py).
--
-- El backend marca estas columnas después de enviar el mensaje (llamadas.marcar_whatsapp). Como el trigger
-- crm.ingresar_resultado copia la fila entera a la bandeja de cada empresa, el CRM las ve sin más cambios y cuenta los
-- mensajes del mes (crm/src/crm/servidor/consumo.ts). La duración de la llamada (duracion_ms) ya existe desde
-- 20261021120000_grabaciones_llamadas.sql; desde 2026-11-09 el backend la guarda siempre, no solo con las grabaciones.
--
-- Orden: se puede aplicar antes o después de desplegar el backend. Sin ella, el backend avisa en el registro y no
-- cuenta los WhatsApp; nada más cambia. Idempotente: se puede volver a correr.

alter table public.resultados_llamada
  add column if not exists whatsapp_enviado_en timestamptz,
  add column if not exists whatsapp_caso text check (whatsapp_caso is null or whatsapp_caso in ('no_contesto', 'colgo', 'completa'));

comment on column public.resultados_llamada.whatsapp_enviado_en is
  'Cuándo salió el WhatsApp de seguimiento de esta llamada. Cuenta para el consumo de la empresa en el CRM.';
