-- Machea como su propia empresa cliente del CRM («el primer cliente somos nosotros»).
--
-- Los prospectos que llama Camila, las demos que se piden en la landing, las llamadas de Camila (con su audio y
-- transcripción) y las citas que deja acordadas pasan a la bandeja del CRM de la empresa de Machea, igual que los
-- leads de las constructoras llegan a las suyas (20261018130000_crm_ingesta.sql).
--
-- REQUIERE, en este orden: 20261018130000_crm_ingesta.sql, 20261021120000_grabaciones_llamadas.sql y las migraciones
-- del CRM (`pnpm db:migrar` en crm/, que ya incluye 0002_perfiles_catalogo_formularios).
--
-- Qué hace:
--   A. Deja que el CRM lea el tipo de su cuenta (constructora o inmobiliaria) para elegir el perfil de cada empresa nueva.
--   B. Funciones y triggers que dejan en crm.bandeja_leads lo de Machea, SOLO para la empresa que tenga la fuente
--      `interna`. Sin esa fuente no sale nada: se puede aplicar sin riesgo.
--   C. crm.rellenar_interna(): pasa a la bandeja lo que ya existía.
--
-- Cómo se enciende (lo hace una persona con acceso a Supabase, una sola vez, DESPUÉS de entrar al CRM con la cuenta
-- de Machea, para que exista su empresa):
--     select id, usuario, correo from acceso.cuentas where correo = '<correo de la cuenta de Machea>';
--     insert into crm.empresa_fuentes (empresa_id, tipo, slug) values ('<id de esa cuenta>', 'interna', 'machea');
--     select crm.rellenar_interna();
-- Después, en Configuración del CRM, el tipo de empresa «Machea (ventas B2B)» queda disponible para esa empresa.
--
-- Los triggers NUNCA rompen el guardado de lo de Machea: si algo falla, avisan y siguen. Idempotente.

-- ---------------------------------------------------------------------------
-- A. Tipo de la cuenta para el CRM
-- ---------------------------------------------------------------------------

grant select (tipo) on acceso.cuentas to crm_app;

-- ---------------------------------------------------------------------------
-- B. A la bandeja de la empresa interna
-- ---------------------------------------------------------------------------

create or replace function crm.ingresar_interna(p_origen text, p_origen_id text, p_datos jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into crm.bandeja_leads (empresa_id, origen, origen_id, datos)
  select f.empresa_id, p_origen, p_origen_id, p_datos
  from crm.empresa_fuentes f
  where f.tipo = 'interna' and f.slug = 'machea'
  on conflict (empresa_id, origen, origen_id) do update
    set datos = excluded.datos, procesado_en = null, tomado_en = null, intentos = 0, error = null
$$;

create or replace function crm.bandeja_demo(r public.solicitudes_demo)
returns void
language sql
security definer
set search_path = ''
as $$
  select crm.ingresar_interna('demo', r.id::text, jsonb_build_object(
    'telefono_digitos', right(r.telefono, 10), 'nombre', r.nombre, 'correo', r.correo, 'empresa', r.empresa,
    'sitio', r.sitio, 'tipo_empresa', r.tipo_empresa, 'problema', r.problema, 'fuente_leads', r.fuente_leads,
    'pauta_mensual', r.pauta_mensual, 'leads_mes', r.leads_mes, 'crm', r.crm))
$$;

create or replace function crm.bandeja_prospecto(r public.prospectos)
returns void
language sql
security definer
set search_path = ''
as $$
  select crm.ingresar_interna('prospecto', r.id::text, jsonb_build_object(
    'telefono_digitos', right(r.telefono, 10), 'empresa', r.empresa, 'tipo_empresa', r.tipo_empresa, 'ciudad', r.ciudad,
    'sitio', r.sitio, 'contacto_nombre', r.contacto_nombre, 'contacto_cargo', r.contacto_cargo, 'correo', r.correo,
    'estado', r.estado, 'score', r.score, 'puntos', r.puntos, 'calificacion', r.calificacion, 'notas', r.notas,
    'origen', r.origen))
$$;

create or replace function crm.bandeja_llamada_captacion(r public.llamadas_captacion)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.prospectos;
begin
  select * into v_p from public.prospectos where id = r.prospecto_id;
  if v_p.id is null then
    return;
  end if;
  perform crm.ingresar_interna('llamada_captacion', coalesce(r.call_id, r.id::text), jsonb_build_object(
    'telefono_digitos', right(v_p.telefono, 10), 'empresa', v_p.empresa, 'resumen', r.resumen, 'analisis', r.analisis,
    'motivo_corte', r.motivo_corte, 'duracion_ms', r.duracion_ms, 'sin_contacto', r.sin_contacto,
    'grabacion_url', r.grabacion_url, 'transcripcion', r.transcripcion));
end;
$$;

create or replace function crm.bandeja_cita(r public.citas)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.prospectos;
begin
  select * into v_p from public.prospectos where id = r.prospecto_id;
  if v_p.id is null then
    return;
  end if;
  perform crm.ingresar_interna('cita', r.id::text, jsonb_build_object(
    'telefono_digitos', right(v_p.telefono, 10), 'empresa', v_p.empresa, 'tipo', r.tipo, 'inicio', r.inicio,
    'texto_acordado', r.texto_acordado, 'canal', r.canal, 'estado', r.estado, 'asesor', r.asesor, 'notas', r.notas));
end;
$$;

create or replace function crm.trg_demo() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform crm.bandeja_demo(new);
  return new;
exception when others then
  raise warning 'crm.trg_demo (%): %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function crm.trg_prospecto() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform crm.bandeja_prospecto(new);
  return new;
exception when others then
  raise warning 'crm.trg_prospecto (%): %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function crm.trg_llamada_captacion() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform crm.bandeja_llamada_captacion(new);
  return new;
exception when others then
  raise warning 'crm.trg_llamada_captacion (%): %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function crm.trg_cita() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform crm.bandeja_cita(new);
  return new;
exception when others then
  raise warning 'crm.trg_cita (%): %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function crm.ingresar_interna(text, text, jsonb) from public, anon, authenticated, crm_app;
revoke all on function crm.bandeja_demo(public.solicitudes_demo) from public, anon, authenticated, crm_app;
revoke all on function crm.bandeja_prospecto(public.prospectos) from public, anon, authenticated, crm_app;
revoke all on function crm.bandeja_llamada_captacion(public.llamadas_captacion) from public, anon, authenticated, crm_app;
revoke all on function crm.bandeja_cita(public.citas) from public, anon, authenticated, crm_app;
revoke all on function crm.trg_demo() from public, anon, authenticated, crm_app;
revoke all on function crm.trg_prospecto() from public, anon, authenticated, crm_app;
revoke all on function crm.trg_llamada_captacion() from public, anon, authenticated, crm_app;
revoke all on function crm.trg_cita() from public, anon, authenticated, crm_app;

drop trigger if exists crm_interna_demo on public.solicitudes_demo;
create trigger crm_interna_demo
  after insert on public.solicitudes_demo
  for each row execute function crm.trg_demo();

drop trigger if exists crm_interna_prospecto on public.prospectos;
create trigger crm_interna_prospecto
  after insert or update on public.prospectos
  for each row execute function crm.trg_prospecto();

drop trigger if exists crm_interna_llamada_captacion on public.llamadas_captacion;
create trigger crm_interna_llamada_captacion
  after insert on public.llamadas_captacion
  for each row execute function crm.trg_llamada_captacion();

drop trigger if exists crm_interna_cita on public.citas;
create trigger crm_interna_cita
  after insert or update on public.citas
  for each row execute function crm.trg_cita();

-- ---------------------------------------------------------------------------
-- C. Lo que ya existía
-- ---------------------------------------------------------------------------

create or replace function crm.rellenar_interna()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  r record;
begin
  -- En este orden: la empresa antes que sus llamadas y citas (la bandeja se procesa por id).
  for r in select * from public.prospectos order by creado_en loop
    perform crm.bandeja_prospecto(r); n := n + 1;
  end loop;
  for r in select * from public.solicitudes_demo order by creado_en loop
    perform crm.bandeja_demo(r); n := n + 1;
  end loop;
  for r in select * from public.llamadas_captacion order by creado_en loop
    perform crm.bandeja_llamada_captacion(r); n := n + 1;
  end loop;
  for r in select * from public.citas order by creado_en loop
    perform crm.bandeja_cita(r); n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function crm.rellenar_interna() from public, anon, authenticated, crm_app;

comment on function crm.rellenar_interna() is
  'Pasa a la bandeja de la empresa interna (fuente interna/machea) lo que ya existía: prospectos, demos, llamadas de Camila y citas. Devuelve cuántas filas revisó.';
