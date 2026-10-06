-- Leads por TELÉFONO + CORREO, sin cédula.
--
-- Decisión de Diego (2026-10-06): el registro del formulario ya no pide la
-- cédula (T4a del rediseño), así que la persona se identifica con su
-- teléfono y su correo. Esta migración reemplaza el esquema de
-- 20260928184500_leads_consultas_intereses.sql, que usaba la cédula como
-- llave. No edita esa migración: ya se aplicó y queda como historia.
--
-- MISMO CRITERIO DE SEGURIDAD que la anterior: tablas cerradas (RLS sin
-- políticas, privilegios revocados a anon/authenticated) y cuatro funciones
-- SECURITY DEFINER como único acceso desde el navegador.
--
-- LOS DOS DATOS TIENEN QUE COINCIDIR SIEMPRE. El teléfono es la llave y el
-- correo hace de segundo factor: el correo se fija la primera vez que se
-- crea el lead y nunca se sobreescribe (mismo papel que tenía el teléfono
-- frente a la cédula). Así nadie puede leer ni ensuciar el historial de otra
-- persona sabiendo solo su número.
--
-- Teléfono: se compara por sus dígitos. Correo: sin espacios y en minúscula.
--
-- SOLO CORRE CON LAS TABLAS VACÍAS. La base nunca se encendió en el
-- formulario (js/datos.js no se cargaba y config.js no tenía credenciales),
-- así que no debería haber datos reales. Si los hay, la migración se detiene
-- sin tocar nada y hay que decidir a mano qué hacer con ellos.

do $$
begin
  if exists (select 1 from public.leads)
     or exists (select 1 from public.consultas)
     or exists (select 1 from public.intereses) then
    raise exception 'La base de leads tiene datos: esta migración rehace las tablas y no se corre sobre datos existentes. Revisar a mano antes de aplicarla.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. FUERA EL ESQUEMA POR CÉDULA
-- ---------------------------------------------------------------------------

drop function if exists public.guardar_consulta(text, text, text, text, text, jsonb, jsonb);
drop function if exists public.buscar_resultados(text, text);
drop function if exists public.marcar_interes(text, text, text, bigint);
drop function if exists public.marcar_intencion(text, text, text, text, text);

drop table if exists public.intereses;
drop table if exists public.consultas;
drop table if exists public.leads;

-- ---------------------------------------------------------------------------
-- 2. ESQUEMA
-- ---------------------------------------------------------------------------

create table public.leads (
  telefono       text primary key check (telefono ~ '^[0-9]{7,15}$'),
  correo         text not null check (correo = lower(correo) and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre         text not null,
  apellido       text not null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.leads is
  'Una fila por persona (teléfono). El correo se fija en la primera consulta '
  'y ninguna función lo sobreescribe: teléfono y correo tienen que coincidir '
  'para leer o escribir el historial.';

create table public.consultas (
  id          bigint generated always as identity primary key,
  telefono    text not null references public.leads (telefono) on delete cascade,
  respuestas  jsonb not null,
  resultados  jsonb not null,
  creado_en   timestamptz not null default now()
);

comment on table public.consultas is
  'Una fila por vez que el quiz completo calculó resultados nuevos. '
  '`respuestas` = state.answers; `resultados` = state.reco (items, '
  'totalCatalogo, origenCatalogo, aproximado) tal como los pintó la pantalla.';

create index consultas_telefono_creado_en_idx
  on public.consultas (telefono, creado_en desc);

create table public.intereses (
  id                bigint generated always as identity primary key,
  telefono          text not null references public.leads (telefono) on delete cascade,
  consulta_id       bigint references public.consultas (id) on delete set null,
  proyecto          text not null,
  -- true solo cuando fecha_seguimiento trae valor: es la señal de que Dapta
  -- agendó una cita real en la llamada, no solo que se pidió el contacto.
  intencion_compra  boolean not null default false,
  -- Texto y no `date`: el payload post-llamada de Dapta puede no traer una
  -- fecha ISO limpia. Se guarda tal cual llega.
  fecha_seguimiento text,
  temperatura_lead  text,
  creado_en         timestamptz not null default now()
);

comment on table public.intereses is
  'marcar_interes() crea la fila al pedir la llamada (intención aún en '
  'falso); marcar_intencion() la actualiza cuando llega el resumen '
  'post-llamada de Dapta con la fecha de seguimiento y la temperatura.';

create index intereses_telefono_idx on public.intereses (telefono);
create index intereses_proyecto_idx on public.intereses (proyecto);

-- La función del trigger ya existe (migración anterior) y no cambia; solo
-- hay que volver a colgarla de la tabla nueva.
create trigger leads_actualizado_en
  before update on public.leads
  for each row
  execute function public.leads_touch_actualizado_en();

-- ---------------------------------------------------------------------------
-- 3. RLS -- activado, sin políticas. Nadie entra directo a las tablas.
-- ---------------------------------------------------------------------------

alter table public.leads     enable row level security;
alter table public.consultas enable row level security;
alter table public.intereses enable row level security;

revoke all on public.leads     from anon, authenticated;
revoke all on public.consultas from anon, authenticated;
revoke all on public.intereses from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. LAS 4 FUNCIONES -- único acceso posible desde el navegador.
-- ---------------------------------------------------------------------------

-- ¿Este teléfono y este correo son del mismo lead? Interna: no se le da
-- EXECUTE a anon.
create function public.lead_coincide(p_telefono text, p_correo text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.leads
    where telefono = regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')
      and correo = lower(trim(coalesce(p_correo, '')))
  );
$$;

-- guardar_consulta: crea el lead la primera vez y suma una consulta. Si el
-- teléfono ya existe con OTRO correo, no guarda nada: así nadie le agrega
-- consultas al historial de otra persona. Rechaza resultados vacíos o de
-- error (el frontend ya los filtra; la base es la última línea de defensa).
create function public.guardar_consulta(
  p_nombre      text,
  p_apellido    text,
  p_correo      text,
  p_telefono    text,
  p_respuestas  jsonb,
  p_resultados  jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_telefono text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_correo   text := lower(trim(coalesce(p_correo, '')));
  v_id       bigint;
begin
  if v_telefono = '' or v_correo = '' then
    raise exception 'telefono y correo son obligatorios';
  end if;
  if p_respuestas is null or p_resultados is null
     or coalesce(jsonb_array_length(p_resultados -> 'items'), 0) = 0 then
    raise exception 'no se guarda una consulta sin resultados';
  end if;

  insert into public.leads (telefono, correo, nombre, apellido)
  values (v_telefono, v_correo, trim(p_nombre), trim(p_apellido))
  on conflict (telefono) do update
    set nombre   = excluded.nombre,
        apellido = excluded.apellido
    -- correo NO se actualiza: se queda con el de la primera vez.
    where public.leads.correo = excluded.correo;

  if not public.lead_coincide(v_telefono, v_correo) then
    raise exception 'telefono y correo no coinciden con ningun lead';
  end if;

  insert into public.consultas (telefono, respuestas, resultados)
  values (v_telefono, p_respuestas, p_resultados)
  returning id into v_id;

  return v_id;
end;
$$;

-- buscar_resultados: la consulta más reciente si teléfono Y correo
-- coinciden. Si no, cero filas, igual en todos los casos: la respuesta no
-- delata si el teléfono existe.
create function public.buscar_resultados(
  p_telefono text,
  p_correo   text
)
returns table (
  consulta_id bigint,
  respuestas  jsonb,
  resultados  jsonb,
  creado_en   timestamptz
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select c.id, c.respuestas, c.resultados, c.creado_en
  from public.consultas c
  join public.leads l on l.telefono = c.telefono
  where l.telefono = regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')
    and l.correo = lower(trim(coalesce(p_correo, '')))
  order by c.creado_en desc
  limit 1;
$$;

-- marcar_interes: se llama al pedir la llamada de Manuela. Exige el mismo
-- par teléfono + correo; aquí sí falla con error si no coincide (es una
-- escritura, no una consulta que deba disimular si el teléfono existe).
create function public.marcar_interes(
  p_telefono    text,
  p_correo      text,
  p_proyecto    text,
  p_consulta_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_telefono text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_id       bigint;
begin
  if not public.lead_coincide(p_telefono, p_correo) then
    raise exception 'telefono y correo no coinciden con ningun lead';
  end if;

  insert into public.intereses (telefono, consulta_id, proyecto, intencion_compra)
  values (v_telefono, p_consulta_id, p_proyecto, false)
  returning id into v_id;

  return v_id;
end;
$$;

-- marcar_intencion: se llama cuando llega el resumen post-llamada de Dapta.
-- Actualiza la fila más reciente de intereses de ese lead y proyecto (la que
-- dejó marcar_interes); si no existe, la crea. intencion_compra queda en
-- true SOLO si fecha_seguimiento trae un valor no vacío.
create function public.marcar_intencion(
  p_telefono          text,
  p_correo            text,
  p_proyecto          text,
  p_fecha_seguimiento text,
  p_temperatura       text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_telefono  text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_intencion boolean := (p_fecha_seguimiento is not null and trim(p_fecha_seguimiento) <> '');
  v_id        bigint;
begin
  if not public.lead_coincide(p_telefono, p_correo) then
    raise exception 'telefono y correo no coinciden con ningun lead';
  end if;

  update public.intereses
     set fecha_seguimiento = p_fecha_seguimiento,
         temperatura_lead  = p_temperatura,
         intencion_compra  = v_intencion
   where id = (
     select id from public.intereses
      where telefono = v_telefono and proyecto = p_proyecto
      order by creado_en desc
      limit 1
   )
  returning id into v_id;

  if v_id is null then
    insert into public.intereses
      (telefono, proyecto, intencion_compra, fecha_seguimiento, temperatura_lead)
    values
      (v_telefono, p_proyecto, v_intencion, p_fecha_seguimiento, p_temperatura)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.lead_coincide(text, text) from public, anon, authenticated;
revoke all on function public.guardar_consulta(text, text, text, text, jsonb, jsonb) from public;
revoke all on function public.buscar_resultados(text, text) from public;
revoke all on function public.marcar_interes(text, text, text, bigint) from public;
revoke all on function public.marcar_intencion(text, text, text, text, text) from public;

grant execute on function public.guardar_consulta(text, text, text, text, jsonb, jsonb) to anon;
grant execute on function public.buscar_resultados(text, text) to anon;
grant execute on function public.marcar_interes(text, text, text, bigint) to anon;
grant execute on function public.marcar_intencion(text, text, text, text, text) to anon;
