-- Solicitudes de demo ("Agenda una demo" de la landing).
--
-- Quien llena el formulario por pasos de la landing deja aquí sus respuestas
-- (problema, fuente de leads, pauta, volumen, tipo de empresa, CRM, empresa y
-- sitio) y sus datos de contacto. El equipo de Machea las ve en el panel y, MÁS
-- ADELANTE, un agente de voz las llamará (PENDIENTE: ese agente todavía no existe;
-- la columna `estado` ya deja el hueco: 'pendiente' = nadie ha llamado todavía).
--
-- MISMO CRITERIO DE SEGURIDAD que las migraciones de leads: tabla cerrada
-- (RLS sin políticas, privilegios revocados a anon/authenticated) y UNA función
-- SECURITY DEFINER como único acceso desde el navegador. La función solo
-- ESCRIBE: la clave anon no puede leer ni una solicitud, ni siquiera las suyas.
--
-- Esta migración NO toca las tablas de leads (leads / consultas / intereses).
-- Es idempotente: se puede volver a correr.

create table if not exists public.solicitudes_demo (
  id               bigint generated always as identity primary key,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),

  -- contacto (el celular se guarda solo con dígitos, sin +57)
  nombre           text not null check (length(nombre) between 2 and 120),
  telefono         text not null check (telefono ~ '^3[0-9]{9}$'),
  correo           text not null check (correo = lower(correo) and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(correo) <= 254),

  -- empresa
  empresa          text check (length(empresa) <= 200),
  sitio            text check (length(sitio) <= 300),
  tipo_empresa     text check (length(tipo_empresa) <= 200),

  -- respuestas del formulario (texto legible, tal como lo vio la persona)
  problema         text check (length(problema) <= 200),
  fuente_leads     text check (length(fuente_leads) <= 200),
  pauta_mensual    text check (length(pauta_mensual) <= 200),
  leads_mes        integer check (leads_mes between 0 and 1000000),
  crm              text check (length(crm) <= 200),

  -- de dónde llegó (utm_*, referrer, página). Tamaño acotado por la función.
  origen           jsonb not null default '{}'::jsonb,

  -- Seguimiento. 'pendiente' = nadie ha contactado todavía.
  -- PENDIENTE de crear: el agente de voz que llama a quien pide la demo.
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente', 'llamando', 'contactado', 'agendado', 'descartado')),
  intentos_llamada integer not null default 0,
  ultima_llamada_en timestamptz,
  notas            text
);

comment on table public.solicitudes_demo is
  'Solicitudes del formulario "Agenda una demo" de la landing. Una fila por envío. '
  '`estado` arranca en pendiente; el agente de voz que las llama está PENDIENTE de crear.';

create index if not exists solicitudes_demo_estado_creado_idx
  on public.solicitudes_demo (estado, creado_en desc);
create index if not exists solicitudes_demo_telefono_idx
  on public.solicitudes_demo (telefono, creado_en desc);

-- Reutiliza el disparador de las tablas de leads (ya existe desde la primera migración).
drop trigger if exists solicitudes_demo_actualizado_en on public.solicitudes_demo;
create trigger solicitudes_demo_actualizado_en
  before update on public.solicitudes_demo
  for each row
  execute function public.leads_touch_actualizado_en();

-- RLS activado, sin políticas: nadie entra directo a la tabla.
alter table public.solicitudes_demo enable row level security;
revoke all on public.solicitudes_demo from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- solicitar_demo: guarda una solicitud. Devuelve true (no el id: no hay por qué
-- contarle a un anónimo cuántas solicitudes hay).
--   * Celular colombiano: 10 dígitos que empiezan por 3 (se acepta con 57 delante).
--   * Máximo 3 solicitudes por celular al día y 300 por hora en total: el formulario
--     es público, esto evita que alguien lo use para llenar la tabla.
--   * Textos recortados; `origen` se descarta si pasa de 1.000 caracteres.
create or replace function public.solicitar_demo(
  p_nombre        text,
  p_telefono      text,
  p_correo        text,
  p_empresa       text    default null,
  p_sitio         text    default null,
  p_tipo_empresa  text    default null,
  p_problema      text    default null,
  p_fuente_leads  text    default null,
  p_pauta_mensual text    default null,
  p_leads_mes     integer default null,
  p_crm           text    default null,
  p_origen        jsonb   default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nombre   text := left(trim(coalesce(p_nombre, '')), 120);
  v_telefono text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_correo   text := lower(trim(coalesce(p_correo, '')));
  v_origen   jsonb := coalesce(p_origen, '{}'::jsonb);
begin
  if length(v_nombre) < 2 then
    raise exception 'nombre invalido';
  end if;
  if length(v_telefono) = 12 and left(v_telefono, 2) = '57' then
    v_telefono := substr(v_telefono, 3);
  end if;
  if v_telefono !~ '^3[0-9]{9}$' then
    raise exception 'telefono invalido';
  end if;
  if v_correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_correo) > 254 then
    raise exception 'correo invalido';
  end if;
  if jsonb_typeof(v_origen) <> 'object' or length(v_origen::text) > 1000 then
    v_origen := '{}'::jsonb;
  end if;

  if (select count(*) from public.solicitudes_demo
       where telefono = v_telefono and creado_en > now() - interval '1 day') >= 3 then
    raise exception 'demasiadas solicitudes de este celular';
  end if;
  if (select count(*) from public.solicitudes_demo
       where creado_en > now() - interval '1 hour') >= 300 then
    raise exception 'demasiadas solicitudes, intenta mas tarde';
  end if;

  insert into public.solicitudes_demo
    (nombre, telefono, correo, empresa, sitio, tipo_empresa, problema,
     fuente_leads, pauta_mensual, leads_mes, crm, origen)
  values
    (v_nombre, v_telefono, v_correo,
     nullif(left(trim(coalesce(p_empresa, '')), 200), ''),
     nullif(left(trim(coalesce(p_sitio, '')), 300), ''),
     nullif(left(trim(coalesce(p_tipo_empresa, '')), 200), ''),
     nullif(left(trim(coalesce(p_problema, '')), 200), ''),
     nullif(left(trim(coalesce(p_fuente_leads, '')), 200), ''),
     nullif(left(trim(coalesce(p_pauta_mensual, '')), 200), ''),
     case when p_leads_mes between 0 and 1000000 then p_leads_mes end,
     nullif(left(trim(coalesce(p_crm, '')), 200), ''),
     v_origen);

  return true;
end;
$$;

revoke all on function public.solicitar_demo(text, text, text, text, text, text, text, text, text, integer, text, jsonb) from public;
grant execute on function public.solicitar_demo(text, text, text, text, text, text, text, text, text, integer, text, jsonb) to anon;
