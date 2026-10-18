-- Captación de Machea: prospectos (inmobiliarias y constructoras), llamadas del agente Camila y citas (demostraciones).
--
-- Quién escribe aquí: SOLO el backend (api/captacion.py) con la clave service_role, que se pone en Render
-- (SUPABASE_SERVICE_KEY) y NUNCA en el navegador. Por eso las tablas quedan cerradas: RLS activado, sin políticas, y sin
-- privilegios para anon/authenticated. A diferencia de leads/solicitudes_demo, NO hay funciones públicas.
--
-- Idempotente: se puede volver a correr. No toca ninguna otra tabla.

create table if not exists public.prospectos (
  id               uuid primary key default gen_random_uuid(),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),

  origen           text not null default 'lista_frio'
                     check (origen in ('lista_frio', 'demo_web', 'referido', 'manual')),
  empresa          text not null check (length(empresa) between 2 and 200),
  tipo_empresa     text check (tipo_empresa in ('inmobiliaria', 'constructora', 'otro')),
  ciudad           text check (length(ciudad) <= 120),
  sitio            text check (length(sitio) <= 300),
  contacto_nombre  text check (length(contacto_nombre) <= 120),
  contacto_cargo   text check (length(contacto_cargo) <= 120),
  telefono         text not null check (telefono ~ '^[0-9]{7,12}$'),
  correo           text check (length(correo) <= 254),

  -- Seguimiento comercial
  estado           text not null default 'nuevo'
                     check (estado in ('nuevo', 'en_cola', 'llamando', 'contactado', 'calificado', 'demo_agendada',
                                       'no_interesado', 'no_contactar', 'sin_respuesta', 'numero_invalido')),
  intentos         integer not null default 0,
  ultimo_intento   timestamptz,
  proximo_intento  timestamptz,

  -- Calificación (la calcula el backend a partir del análisis de la llamada)
  score            text check (score in ('A', 'B', 'C', 'X')),
  puntos           integer check (puntos between 0 and 100),
  calificacion     jsonb not null default '{}'::jsonb,   -- leads_mes, pauta, tiempo_respuesta, crm, decisor, dolor…
  notas            text,
  solicitud_demo_id bigint references public.solicitudes_demo (id) on delete set null,

  unique (telefono)
);

create index if not exists prospectos_estado_idx on public.prospectos (estado, proximo_intento);
create index if not exists prospectos_score_idx on public.prospectos (score, actualizado_en desc);

create table if not exists public.llamadas_captacion (
  id             uuid primary key default gen_random_uuid(),
  creado_en      timestamptz not null default now(),
  prospecto_id   uuid references public.prospectos (id) on delete cascade,
  call_id        text unique,
  motivo_corte   text,
  duracion_ms    integer,
  sin_contacto   boolean not null default false,
  resumen        text,
  analisis       jsonb not null default '{}'::jsonb
);
create index if not exists llamadas_captacion_prospecto_idx on public.llamadas_captacion (prospecto_id, creado_en desc);

create table if not exists public.citas (
  id             uuid primary key default gen_random_uuid(),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  prospecto_id   uuid references public.prospectos (id) on delete cascade,
  tipo           text not null default 'demo' check (tipo in ('demo', 'llamada_seguimiento')),
  inicio         timestamptz,                     -- null si solo hay franja ("el sábado en la mañana")
  texto_acordado text,                            -- lo que dijo la persona, en lenguaje natural
  canal          text not null default 'llamada' check (canal in ('llamada', 'videollamada', 'whatsapp', 'presencial')),
  estado         text not null default 'confirmada'
                   check (estado in ('propuesta', 'confirmada', 'realizada', 'cancelada', 'no_show')),
  asesor         text,                            -- quién del equipo de Machea la atiende
  origen         text not null default 'agente_camila' check (origen in ('agente_camila', 'manual', 'demo_web')),
  notas          text
);
create index if not exists citas_inicio_idx on public.citas (estado, inicio);

-- Reutiliza el disparador de actualizado_en de las tablas de leads (ya existe desde la primera migración).
drop trigger if exists prospectos_actualizado_en on public.prospectos;
create trigger prospectos_actualizado_en before update on public.prospectos
  for each row execute function public.leads_touch_actualizado_en();
drop trigger if exists citas_actualizado_en on public.citas;
create trigger citas_actualizado_en before update on public.citas
  for each row execute function public.leads_touch_actualizado_en();

-- Cerradas al navegador: solo service_role (el backend) entra.
alter table public.prospectos         enable row level security;
alter table public.llamadas_captacion enable row level security;
alter table public.citas              enable row level security;
revoke all on public.prospectos, public.llamadas_captacion, public.citas from anon, authenticated;

comment on table public.prospectos is 'Empresas (inmobiliarias y constructoras) a las que el agente Camila llama para calificarlas y agendarles una demostración.';
comment on table public.citas is 'Demostraciones y llamadas de seguimiento acordadas. Hoy las crea el webhook de Camila; el calendario real vendrá después.';
