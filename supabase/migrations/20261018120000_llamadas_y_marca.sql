-- Lo que el CRM de cada empresa necesita de un lead (design/crm/PLAN.md, fase 2).
--
-- 1. public.consultas guarda de qué formulario viene (marca) y la autorización que aceptó la persona.
--    guardar_consulta() recibe las dos como parámetros OPCIONALES: el formulario de hoy, que no las manda,
--    sigue funcionando igual. Por eso esta migración se aplica ANTES de desplegar el front nuevo.
-- 2. public.solicitudes_llamada: una fila por cada llamada que el backend le pide a Dapta (POST /api/llamar),
--    con el proyecto elegido y su dueño (constructora o inmobiliaria) sacado del catálogo.
-- 3. public.resultados_llamada: lo que Dapta manda al colgar (POST /webhooks/dapta/resultado), una fila por
--    call_id. Antes vivía solo en la memoria del backend y se perdía al reiniciar.
--
-- Las tres quedan cerradas como el resto de la base de leads: RLS encendido y sin privilegios para anon ni
-- authenticated. Solo escribe el backend (service_role, api/llamadas.py) y la función guardar_consulta().

-- ---------------------------------------------------------------------------
-- 1. Marca y autorización en las consultas
-- ---------------------------------------------------------------------------

alter table public.consultas
  add column marca text check (marca is null or marca ~ '^[a-z0-9-]{1,40}$'),
  add column autorizacion jsonb;

comment on column public.consultas.marca is
  'Slug del formulario por el que entró (?marca= del front: machea, amarilo, colsubsidio…).';
comment on column public.consultas.autorizacion is
  'Autorización aceptada: {"version": "...", "texto": "...", "aceptada_en": "..."}. Vacía en las consultas '
  'anteriores a la fase 3 del CRM.';

create index consultas_marca_idx on public.consultas (marca) where marca is not null;

drop function public.guardar_consulta(text, text, text, text, jsonb, jsonb);

create function public.guardar_consulta(
  p_nombre        text,
  p_apellido      text,
  p_correo        text,
  p_telefono      text,
  p_respuestas    jsonb,
  p_resultados    jsonb,
  p_marca         text  default null,
  p_autorizacion  jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_telefono text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_correo   text := lower(trim(coalesce(p_correo, '')));
  v_marca    text := nullif(lower(trim(coalesce(p_marca, ''))), '');
  v_autoriza jsonb := p_autorizacion;
  v_id       bigint;
begin
  if v_telefono = '' or v_correo = '' then
    raise exception 'telefono y correo son obligatorios';
  end if;
  if p_respuestas is null or p_resultados is null
     or coalesce(jsonb_array_length(p_resultados -> 'items'), 0) = 0 then
    raise exception 'no se guarda una consulta sin resultados';
  end if;
  -- Lo que viene del navegador no se cree a ciegas: una marca rara o una autorización enorme se descartan
  -- en vez de tumbar la consulta.
  if v_marca is not null and v_marca !~ '^[a-z0-9-]{1,40}$' then
    v_marca := null;
  end if;
  if v_autoriza is not null and (jsonb_typeof(v_autoriza) <> 'object' or pg_column_size(v_autoriza) > 4000) then
    v_autoriza := null;
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

  insert into public.consultas (telefono, respuestas, resultados, marca, autorizacion)
  values (v_telefono, p_respuestas, p_resultados, v_marca, v_autoriza)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.guardar_consulta(text, text, text, text, jsonb, jsonb, text, jsonb) from public;
grant execute on function public.guardar_consulta(text, text, text, text, jsonb, jsonb, text, jsonb) to anon;

-- ---------------------------------------------------------------------------
-- 2. Solicitudes de llamada
-- ---------------------------------------------------------------------------

create table public.solicitudes_llamada (
  id                    uuid primary key,          -- lo genera el backend: viaja a Dapta como external_lead_id
  telefono              text not null,             -- E.164 (+573001112233)
  telefono_digitos      text,                      -- los 10 dígitos, como en public.leads.telefono
  nombre                text,                      -- como lo escribió en el formulario (por si no hay fila en leads)
  marca                 text check (marca is null or marca ~ '^[a-z0-9-]{1,40}$'),
  tipo_operacion        text not null check (tipo_operacion in ('compra', 'arriendo')),
  tipo_inmueble         text,
  id_proyecto           text,                      -- id_proyecto (Compra) o id_inmueble (Arriendo)
  nombre_proyecto       text,
  dueno_tipo            text check (dueno_tipo is null or dueno_tipo in ('constructora', 'inmobiliaria')),
  dueno_slug            text,
  dueno_nombre          text,
  autoriza_compartir    boolean,                   -- null: el formulario todavía no lo preguntaba
  version_autorizacion  text,
  creado_en             timestamptz not null default now()
);

comment on table public.solicitudes_llamada is
  'Una fila por llamada pedida a Dapta (no las demos con marca). El dueño del proyecto sale del catálogo del '
  'backend por id, nunca de lo que diga el navegador. Ver backend/api/llamadas.py.';

create index solicitudes_llamada_telefono_idx on public.solicitudes_llamada (telefono, creado_en desc);
create index solicitudes_llamada_digitos_idx on public.solicitudes_llamada (telefono_digitos);
create index solicitudes_llamada_dueno_idx on public.solicitudes_llamada (dueno_tipo, dueno_slug);

-- ---------------------------------------------------------------------------
-- 3. Resultados de llamada
-- ---------------------------------------------------------------------------

create table public.resultados_llamada (
  id                      bigint generated always as identity primary key,
  call_id                 text not null unique,
  -- Sin llave foránea a propósito: si guardar la solicitud falló, el resultado igual se guarda.
  solicitud_id            uuid,
  telefono                text not null,
  sin_contacto            boolean,
  call_status             text,
  disconnection_reason    text,
  temperatura_lead        text,
  resumen_llamada         text,
  recomendacion_asesor    text,
  estado_del_lead         text,
  nivel_de_urgencia       text,
  tomador_de_decision     text,
  presupuesto_confirmado  text,
  fecha_de_seguimiento    text,
  objecion_principal      text,
  cita_agendada           boolean,
  fecha_hora_cita         text,                    -- como la dice Manuela ("2026-10-21 16:00"), hora de Bogotá
  canal_cita              text,
  motivo_no_agenda        text,
  recibido_en             timestamptz not null default now(),
  actualizado_en          timestamptz not null default now()
);

comment on table public.resultados_llamada is
  'Resultado de la llamada de Manuela, uno por call_id. Dapta puede mandar varios eventos por llamada: el '
  'backend solo envía las columnas con valor, así un evento sin análisis no borra el anterior. La llamada no '
  'se graba: aquí solo queda lo que resulta de ella.';

create index resultados_llamada_solicitud_idx on public.resultados_llamada (solicitud_id);
create index resultados_llamada_telefono_idx on public.resultados_llamada (telefono);

create function public.resultados_llamada_touch()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger resultados_llamada_actualizado_en
  before update on public.resultados_llamada
  for each row
  execute function public.resultados_llamada_touch();

-- ---------------------------------------------------------------------------
-- Cerradas para la clave pública
-- ---------------------------------------------------------------------------

alter table public.solicitudes_llamada enable row level security;
alter table public.resultados_llamada  enable row level security;
revoke all on public.solicitudes_llamada from anon, authenticated;
revoke all on public.resultados_llamada  from anon, authenticated;
revoke all on function public.resultados_llamada_touch() from public, anon, authenticated;
