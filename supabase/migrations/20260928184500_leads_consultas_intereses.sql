-- Base de datos persistente de leads del formulario de Machea (experiencia/).
--
-- CRITERIO DE SEGURIDAD: "sin login pero sin dejar datos al aire". Las tres
-- tablas quedan CERRADAS -- RLS activado, CERO políticas, y todo privilegio
-- por defecto revocado a `anon`/`authenticated`. El ÚNICO acceso posible
-- desde el navegador es a través de las 4 funciones SECURITY DEFINER de más
-- abajo, que son las únicas con GRANT EXECUTE a `anon`. Una función
-- SECURITY DEFINER corre con los privilegios de quien la creó (el dueño de
-- las tablas), y el dueño de una tabla siempre atraviesa su propio RLS en
-- Postgres -- por eso no hacen falta políticas ni FORCE ROW LEVEL SECURITY:
-- basta con que nadie más tenga privilegios directos sobre las tablas.
--
-- Cédula y teléfono se comparan SIEMPRE por sus dígitos (regexp_replace),
-- nunca tal cual se escriben ("300 123 4567" y "3001234567" son el mismo
-- teléfono). Se normalizan igual al guardarlos, así que la columna ya queda
-- solo con dígitos.

-- ---------------------------------------------------------------------------
-- 1. ESQUEMA
-- ---------------------------------------------------------------------------

create table public.leads (
  cedula        text primary key check (cedula ~ '^[0-9]{5,15}$'),
  nombre        text not null,
  apellido      text not null,
  correo        text not null,
  telefono      text not null check (telefono ~ '^[0-9]{7,15}$'),
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.leads is
  'Una fila por persona (cédula). El teléfono se fija en la primera consulta '
  'y guardar_consulta() NUNCA lo sobreescribe: evita que alguien reclame una '
  'cédula ajena con su propio número en una visita posterior.';

create table public.consultas (
  id          bigint generated always as identity primary key,
  cedula      text not null references public.leads (cedula) on delete cascade,
  respuestas  jsonb not null,
  resultados  jsonb not null,
  creado_en   timestamptz not null default now()
);

comment on table public.consultas is
  'Una fila por vez que el quiz completo calculó resultados nuevos. '
  '`respuestas` = state.answers; `resultados` = state.reco (items, '
  'totalCatalogo, origenCatalogo, aproximado) tal como los pintó la pantalla.';

create index consultas_cedula_creado_en_idx
  on public.consultas (cedula, creado_en desc);

create table public.intereses (
  id                bigint generated always as identity primary key,
  cedula            text not null references public.leads (cedula) on delete cascade,
  consulta_id       bigint references public.consultas (id) on delete set null,
  proyecto          text not null,
  -- true solo cuando fecha_seguimiento trae valor: es la señal de que Dapta
  -- agendó una cita real en la llamada, no solo que se pidió el contacto.
  intencion_compra  boolean not null default false,
  -- Texto y no `date`: el payload post-llamada de Dapta no está documentado
  -- en público (ver backend/api/app.py) y puede no traer una fecha ISO
  -- limpia. Se guarda tal cual llega; lo único que importa para
  -- `intencion_compra` es si el campo viene vacío o no.
  fecha_seguimiento text,
  temperatura_lead  text,
  creado_en         timestamptz not null default now()
);

comment on table public.intereses is
  'marcar_interes() crea la fila al pedir la llamada (intención aún en '
  'falso); marcar_intencion() la actualiza cuando llega el resumen '
  'post-llamada de Dapta con la fecha de seguimiento y la temperatura.';

create index intereses_cedula_idx on public.intereses (cedula);
create index intereses_proyecto_idx on public.intereses (proyecto);

-- `actualizado_en` de leads se mantiene solo, mismo patrón que el resto de
-- proyectos del equipo (ver Multi-Agents_System/supabase).
create function public.leads_touch_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger leads_actualizado_en
  before update on public.leads
  for each row
  execute function public.leads_touch_actualizado_en();

-- ---------------------------------------------------------------------------
-- 2. RLS -- activado, sin políticas. Nadie entra directo a las tablas.
-- ---------------------------------------------------------------------------

alter table public.leads     enable row level security;
alter table public.consultas enable row level security;
alter table public.intereses enable row level security;

revoke all on public.leads     from anon, authenticated;
revoke all on public.consultas from anon, authenticated;
revoke all on public.intereses from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. LAS 4 FUNCIONES -- único acceso posible desde el navegador.
-- ---------------------------------------------------------------------------

-- guardar_consulta: upsert del lead (SIN tocar el teléfono si ya existía) +
-- una fila nueva en consultas. Rechaza resultados vacíos o de error -- el
-- frontend ya filtra esto antes de llamar, pero la base es la última línea
-- de defensa (mismo criterio que "la base rechaza un done sin acta" en
-- Multi-Agents_System).
create function public.guardar_consulta(
  p_cedula      text,
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
  v_cedula   text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  v_telefono text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_id       bigint;
begin
  if v_cedula = '' or v_telefono = '' then
    raise exception 'cedula y telefono son obligatorios';
  end if;
  if p_respuestas is null or p_resultados is null
     or coalesce(jsonb_array_length(p_resultados -> 'items'), 0) = 0 then
    raise exception 'no se guarda una consulta sin resultados';
  end if;

  insert into public.leads (cedula, nombre, apellido, correo, telefono)
  values (v_cedula, trim(p_nombre), trim(p_apellido), trim(p_correo), v_telefono)
  on conflict (cedula) do update
    set nombre   = excluded.nombre,
        apellido = excluded.apellido,
        correo   = excluded.correo;
        -- telefono NO se lista aquí a propósito: se queda con el de la
        -- primera vez que se creó este lead.

  insert into public.consultas (cedula, respuestas, resultados)
  values (v_cedula, p_respuestas, p_resultados)
  returning id into v_id;

  return v_id;
end;
$$;

-- buscar_resultados: exige cédula Y teléfono a la vez. Si no coinciden (la
-- cédula no existe, o existe con otro teléfono) devuelve cero filas en los
-- dos casos por igual -- la respuesta nunca delata si la cédula existe.
create function public.buscar_resultados(
  p_cedula   text,
  p_telefono text
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
  join public.leads l on l.cedula = c.cedula
  where l.cedula = regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g')
    and l.telefono = regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')
  order by c.creado_en desc
  limit 1;
$$;

-- marcar_interes: se llama al pedir la llamada de Manuela. Exige el mismo
-- match cédula+teléfono que buscar_resultados -- aquí SÍ se rechaza con
-- error si no coincide (es una escritura, no una consulta que deba
-- disimular si la cédula existe).
create function public.marcar_interes(
  p_cedula      text,
  p_telefono    text,
  p_proyecto    text,
  p_consulta_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cedula   text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  v_telefono text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_id       bigint;
begin
  if not exists (
    select 1 from public.leads
    where cedula = v_cedula and telefono = v_telefono
  ) then
    raise exception 'cedula y telefono no coinciden con ningun lead';
  end if;

  insert into public.intereses (cedula, consulta_id, proyecto, intencion_compra)
  values (v_cedula, p_consulta_id, p_proyecto, false)
  returning id into v_id;

  return v_id;
end;
$$;

-- marcar_intencion: se llama cuando llega el resumen post-llamada de Dapta.
-- Actualiza la fila más reciente de intereses para ese lead+proyecto (la
-- que dejó marcar_interes); si por algo no existe, la crea. intencion_compra
-- queda en true SOLO si fecha_seguimiento trae un valor no vacío.
create function public.marcar_intencion(
  p_cedula            text,
  p_telefono          text,
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
  v_cedula    text := regexp_replace(coalesce(p_cedula, ''), '\D', '', 'g');
  v_telefono  text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_intencion boolean := (p_fecha_seguimiento is not null and trim(p_fecha_seguimiento) <> '');
  v_id        bigint;
begin
  if not exists (
    select 1 from public.leads
    where cedula = v_cedula and telefono = v_telefono
  ) then
    raise exception 'cedula y telefono no coinciden con ningun lead';
  end if;

  update public.intereses
     set fecha_seguimiento = p_fecha_seguimiento,
         temperatura_lead  = p_temperatura,
         intencion_compra  = v_intencion
   where id = (
     select id from public.intereses
      where cedula = v_cedula and proyecto = p_proyecto
      order by creado_en desc
      limit 1
   )
  returning id into v_id;

  if v_id is null then
    insert into public.intereses
      (cedula, proyecto, intencion_compra, fecha_seguimiento, temperatura_lead)
    values
      (v_cedula, p_proyecto, v_intencion, p_fecha_seguimiento, p_temperatura)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.guardar_consulta(text, text, text, text, text, jsonb, jsonb) from public;
revoke all on function public.buscar_resultados(text, text) from public;
revoke all on function public.marcar_interes(text, text, text, bigint) from public;
revoke all on function public.marcar_intencion(text, text, text, text, text) from public;

grant execute on function public.guardar_consulta(text, text, text, text, text, jsonb, jsonb) to anon;
grant execute on function public.buscar_resultados(text, text) to anon;
grant execute on function public.marcar_interes(text, text, text, bigint) to anon;
grant execute on function public.marcar_intencion(text, text, text, text, text) to anon;
