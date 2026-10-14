-- Cuentas del login de Machea (rama `login`; contrato en design/login/CONTRATO_AUTH.md).
--
-- DECISIÓN (Diego, 2026-10-13): el login lo maneja NUESTRO backend (FastAPI, backend/api/acceso.py)
-- y las cuentas viven en Postgres. Hoy es la base de Supabase `machea-leads` usada como un Postgres
-- normal: NO se usa Supabase Auth. Machea va a migrar de nube, y así migrar es mover estas tablas.
--
-- SEGURIDAD
--   * Esquema propio `acceso`: la API pública de Supabase (PostgREST) solo expone `public`, así que
--     estas tablas no son alcanzables con la clave anon aunque alguien la tenga (y la tiene: va en el
--     navegador del formulario).
--   * Además, RLS activado sin políticas y todo privilegio revocado a anon/authenticated (defensa en
--     profundidad, mismo criterio que las tablas de leads).
--   * El ÚNICO que entra es el backend, por conexión directa de Postgres con `DATABASE_URL`, que vive
--     solo en las variables de entorno de Render.
--   * No se guarda nada en claro que sirva para entrar: la contraseña va con scrypt (sal propia por
--     cuenta) y de los enlaces y las sesiones solo se guarda el SHA-256 del token.
--
-- Una cuenta = una empresa (constructora o inmobiliaria). Ciclo de vida:
--   sin_confirmar -> pendiente (confirmó el correo) -> aprobada | rechazada (lo decide Machea en /admin)
--
-- Las tablas de leads (public.leads, consultas, intereses) NO se tocan.

create schema if not exists acceso;

revoke all on schema acceso from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. CUENTAS
-- ---------------------------------------------------------------------------

create table acceso.cuentas (
  id             uuid primary key default gen_random_uuid(),
  usuario        text not null unique
                   check (char_length(usuario) between 3 and 30 and usuario ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'),
  correo         text not null unique
                   check (correo = lower(correo) and char_length(correo) <= 254 and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  -- null = la cuenta solo entra con Google (todavía apagado, D19).
  clave_hash     text,
  google_sub     text unique,
  estado         text not null default 'sin_confirmar'
                   check (estado in ('sin_confirmar', 'pendiente', 'aprobada', 'rechazada')),
  -- Lo marca Machea al aprobar; el registro no lo pregunta (registro mínimo, D12).
  tipo           text check (tipo in ('constructora', 'inmobiliaria')),
  creada_en      timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  confirmada_en  timestamptz,
  decidida_en    timestamptz,
  constraint cuentas_aprobada_con_tipo check (estado <> 'aprobada' or tipo is not null),
  constraint cuentas_tiene_metodo check (clave_hash is not null or google_sub is not null)
);

comment on table acceso.cuentas is
  'Una fila por empresa con cuenta en el login. La contraseña va con scrypt en clave_hash; '
  'el backend nunca la devuelve. Ver design/login/CONTRATO_AUTH.md.';

create index cuentas_estado_creada_idx on acceso.cuentas (estado, creada_en desc);

create function acceso.tocar_actualizada_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizada_en := now();
  return new;
end;
$$;

create trigger cuentas_actualizada_en
  before update on acceso.cuentas
  for each row
  execute function acceso.tocar_actualizada_en();

-- ---------------------------------------------------------------------------
-- 2. ENLACES DE UN SOLO USO (confirmar el correo, recuperar la clave)
-- ---------------------------------------------------------------------------

create table acceso.enlaces (
  hash       text primary key check (hash ~ '^[0-9a-f]{64}$'),   -- SHA-256 del token; el token no se guarda
  tipo       text not null check (tipo in ('confirmar', 'recuperar')),
  cuenta_id  uuid not null references acceso.cuentas (id) on delete cascade,
  expira     timestamptz not null,
  creado_en  timestamptz not null default now()
);

create index enlaces_cuenta_tipo_idx on acceso.enlaces (cuenta_id, tipo);

-- ---------------------------------------------------------------------------
-- 3. SESIONES
-- ---------------------------------------------------------------------------

create table acceso.sesiones (
  hash       text primary key check (hash ~ '^[0-9a-f]{64}$'),   -- SHA-256 del valor de la cookie
  cuenta_id  uuid not null references acceso.cuentas (id) on delete cascade,
  recordar   boolean not null default false,
  expira     timestamptz not null,
  creada_en  timestamptz not null default now()
);

create index sesiones_cuenta_idx on acceso.sesiones (cuenta_id);
create index sesiones_expira_idx on acceso.sesiones (expira);

-- ---------------------------------------------------------------------------
-- 4. INTENTOS FALLIDOS (tope de 5 por correo en 15 minutos)
-- ---------------------------------------------------------------------------
-- En la base y no en memoria: sobrevive a un redespliegue y sirve si hay más de una instancia.

create table acceso.intentos (
  id     bigint generated always as identity primary key,
  correo text not null,
  en     timestamptz not null default now()
);

create index intentos_correo_en_idx on acceso.intentos (correo, en desc);

-- ---------------------------------------------------------------------------
-- 5. CERRADO PARA TODOS MENOS EL BACKEND
-- ---------------------------------------------------------------------------

alter table acceso.cuentas  enable row level security;
alter table acceso.enlaces  enable row level security;
alter table acceso.sesiones enable row level security;
alter table acceso.intentos enable row level security;

revoke all on all tables    in schema acceso from public, anon, authenticated;
revoke all on all sequences in schema acceso from public, anon, authenticated;
revoke all on all functions in schema acceso from public, anon, authenticated;
