-- Lista de exclusión y contactos programados (design/legal/LLAMADAS_LEY_2300.md).
--
-- 1. public.contactos_excluidos: los números que pidieron no volver a ser contactados ("no me llamen más" a Manuela o
--    a Camila). /privacidad/ la promete y la Ley 2300 de 2023 (art. 5, par. 2) la exige. Solo se guardan los últimos
--    10 dígitos del número. La consultan Camila, el seguimiento por WhatsApp y la cola de abajo (api/exclusiones.py).
-- 2. public.contactos_programados: llamadas de Manuela y mensajes de WhatsApp que se pidieron fuera del horario de la
--    Ley 2300 y se hacen cuando abre (api/programados.py). Al hacerse o cancelarse, el backend borra el payload.
--
-- Orden: se puede aplicar antes o después de desplegar el backend. Sin estas tablas el backend no bloquea a nadie y
-- no puede programar: una llamada fuera de horario responde 503 "intenta de nuevo" (lo deja en el registro de Render).
-- Idempotente: se puede volver a correr.
--
-- Cerradas como el resto de la base de leads: RLS encendido y sin privilegios para anon ni authenticated. Solo escribe
-- el backend (service_role).

-- ---------------------------------------------------------------------------
-- 1. Lista de exclusión
-- ---------------------------------------------------------------------------

create table if not exists public.contactos_excluidos (
  telefono_digitos text primary key check (telefono_digitos ~ '^[0-9]{10}$'),
  origen           text not null check (origen in ('manuela', 'camila', 'whatsapp', 'correo', 'manual')),
  motivo           text check (motivo is null or length(motivo) <= 120),
  creado_en        timestamptz not null default now()
);

comment on table public.contactos_excluidos is
  'Números que pidieron no ser contactados (Ley 2300, art. 5 par. 2). Si la persona vuelve a pedir la llamada en el '
  'formulario, POST /api/llamar la saca de la lista.';

-- ---------------------------------------------------------------------------
-- 2. Contactos programados fuera de horario
-- ---------------------------------------------------------------------------

create table if not exists public.contactos_programados (
  id                uuid primary key,
  tipo              text not null check (tipo in ('llamada', 'whatsapp')),
  telefono_digitos  text check (telefono_digitos is null or telefono_digitos ~ '^[0-9]{10}$'),
  payload           jsonb,
  programado_para   timestamptz not null,
  estado            text not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'cancelado', 'error')),
  intentos          integer not null default 0,
  creado_en         timestamptz not null default now(),
  hecho_en          timestamptz
);

comment on table public.contactos_programados is
  'Llamadas y WhatsApp pedidos fuera del horario de la Ley 2300; los dispara POST /api/captacion/cola (cron). '
  'payload se borra al hacerse o cancelarse.';

create index if not exists contactos_programados_pendientes_idx
  on public.contactos_programados (programado_para) where estado = 'pendiente';

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------

alter table public.contactos_excluidos   enable row level security;
alter table public.contactos_programados enable row level security;
revoke all on public.contactos_excluidos   from anon, authenticated;
revoke all on public.contactos_programados from anon, authenticated;
