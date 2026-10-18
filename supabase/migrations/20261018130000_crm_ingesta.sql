-- CRM multiempresa, fase 4: los leads de Machea entran al CRM de cada empresa (design/crm/PLAN.md).
--
-- REQUIERE, en este orden (ver design/crm/PUESTA_EN_MARCHA.md):
--   1. 20261014090000_cuentas_login.sql (esquema acceso, rama login)
--   2. 20261018120000_llamadas_y_marca.sql (consultas.marca, solicitudes_llamada, resultados_llamada)
--   3. las migraciones del CRM: `pnpm db:migrar` en crm/ con un DATABASE_URL de administrador (crea el esquema crm)
--   4. esta.
--
-- Qué hace:
--   A. El rol crm_app, con el que se conecta el CRM (Vercel): solo su esquema y, del login, las columnas que
--      necesita para leer la sesión (nunca clave_hash). Su clave se pone a mano, nunca en el repo.
--   B. Triggers sobre las tablas de leads de Machea que dejan en crm.bandeja_leads lo que le toca a cada empresa:
--        - regla de la marca: la consulta o la llamada entró por el formulario con su marca;
--        - regla del proyecto: la persona pidió la llamada por un proyecto suyo Y autorizó compartir
--          (solicitudes_llamada.autoriza_compartir, la hoja "Antes de llamarte").
--      El resultado de la llamada le llega a las mismas empresas que recibieron la solicitud.
--      A qué empresa corresponde cada marca o dueño lo dice crm.empresa_fuentes, que administra Machea en /admin.
--      Sin filas en empresa_fuentes no sale nada: se puede aplicar sin riesgo.
--   Los triggers NUNCA rompen el guardado de un lead de Machea: si algo falla, avisan y siguen.

-- ---------------------------------------------------------------------------
-- A. Rol de la app del CRM
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'crm_app') then
    create role crm_app login nobypassrls;
  end if;
end;
$$;
-- La clave, a mano y fuera del repo:  alter role crm_app password '<clave>';

revoke all on schema crm from public, anon, authenticated;
revoke all on all tables in schema crm from public, anon, authenticated;
grant usage on schema crm to crm_app;
grant select, insert, update, delete on all tables in schema crm to crm_app;
grant usage, select on all sequences in schema crm to crm_app;

-- RLS en todas las tablas del CRM, con una política que solo deja pasar a crm_app. anon y authenticated ya no
-- tienen privilegios; esto es una segunda barrera. (Separar empresas con RLS es la fase 6.)
create or replace function crm.cerrar_tablas()
returns void
language plpgsql
set search_path = ''
as $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'crm' loop
    execute format('alter table crm.%I enable row level security', t.tablename);
    if not exists (select 1 from pg_policies where schemaname = 'crm' and tablename = t.tablename and policyname = 'crm_app') then
      execute format('create policy crm_app on crm.%I for all to crm_app using (true) with check (true)', t.tablename);
    end if;
    execute format('grant select, insert, update, delete on crm.%I to crm_app', t.tablename);
  end loop;
  grant usage, select on all sequences in schema crm to crm_app;
end;
$$;
comment on function crm.cerrar_tablas() is
  'Cierra todas las tablas del esquema crm (RLS + política para crm_app). Correrla después de cada migración '
  'nueva del CRM:  select crm.cerrar_tablas();';
revoke all on function crm.cerrar_tablas() from public, anon, authenticated, crm_app;
select crm.cerrar_tablas();

-- Del login, solo lo que hace falta para reconocer la sesión (src/auth/machea.ts del CRM).
grant usage on schema acceso to crm_app;
grant select (hash, cuenta_id, expira) on acceso.sesiones to crm_app;
grant select (id, usuario, correo, estado) on acceso.cuentas to crm_app;
create policy crm_app_lee_sesiones on acceso.sesiones for select to crm_app using (true);
create policy crm_app_lee_cuentas on acceso.cuentas for select to crm_app using (true);

-- ---------------------------------------------------------------------------
-- B. Bandeja de leads
-- ---------------------------------------------------------------------------

-- Nombre, apellido y correo de la persona según public.leads (por los 10 dígitos del teléfono).
create or replace function crm.datos_persona(p_digitos text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('nombre', l.nombre, 'apellido', l.apellido, 'correo', l.correo)
  from public.leads l
  where right(l.telefono, 10) = p_digitos
  order by l.actualizado_en desc
  limit 1
$$;

-- Las respuestas de su consulta más reciente.
create or replace function crm.ultimas_respuestas(p_digitos text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.respuestas
  from public.consultas c
  where right(c.telefono, 10) = p_digitos
  order by c.creado_en desc
  limit 1
$$;

-- Consulta guardada desde un formulario con marca → a la empresa de esa marca.
create or replace function crm.ingresar_consulta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_digitos text := right(new.telefono, 10);
begin
  if new.marca is null then
    return new;
  end if;
  insert into crm.bandeja_leads (empresa_id, origen, origen_id, datos)
  select f.empresa_id, 'consulta', new.id::text,
         coalesce(crm.datos_persona(v_digitos), '{}'::jsonb) ||
         jsonb_build_object('telefono_digitos', v_digitos, 'marca', new.marca, 'regla', 'marca',
                            'respuestas', new.respuestas)
  from crm.empresa_fuentes f
  where f.tipo = 'marca' and f.slug = new.marca
  on conflict (empresa_id, origen, origen_id) do nothing;
  return new;
exception when others then
  raise warning 'crm.ingresar_consulta (consulta %): %', new.id, sqlerrm;
  return new;
end;
$$;

-- Llamada pedida → a la empresa de la marca del formulario y, si autorizó compartir, a la dueña del proyecto.
create or replace function crm.ingresar_solicitud()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_persona jsonb := coalesce(crm.datos_persona(new.telefono_digitos), jsonb_build_object('nombre', new.nombre));
  v_respuestas jsonb := crm.ultimas_respuestas(new.telefono_digitos);
begin
  insert into crm.bandeja_leads (empresa_id, origen, origen_id, datos)
  select distinct on (f.empresa_id) f.empresa_id, 'solicitud', new.id::text,
         v_persona ||
         jsonb_build_object('telefono_digitos', new.telefono_digitos, 'telefono', new.telefono, 'marca', new.marca,
                            'regla', f.regla, 'nombre_proyecto', new.nombre_proyecto, 'id_proyecto', new.id_proyecto,
                            'tipo_operacion', new.tipo_operacion, 'respuestas', v_respuestas,
                            'solicitud_id', new.id)
  from (
    select empresa_id, 'marca' as regla, 1 as orden
    from crm.empresa_fuentes
    where tipo = 'marca' and slug = new.marca
    union all
    select empresa_id, 'proyecto', 2
    from crm.empresa_fuentes
    where new.autoriza_compartir is true and new.dueno_tipo is not null
      and tipo = new.dueno_tipo and slug = new.dueno_slug
  ) f
  order by f.empresa_id, f.orden
  on conflict (empresa_id, origen, origen_id) do nothing;
  return new;
exception when others then
  raise warning 'crm.ingresar_solicitud (solicitud %): %', new.id, sqlerrm;
  return new;
end;
$$;

-- Resultado de la llamada → a las mismas empresas que recibieron la solicitud. Si Dapta manda otro evento de la
-- misma llamada, la fila se actualiza y se vuelve a procesar.
create or replace function crm.ingresar_resultado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.solicitud_id is null then
    return new;
  end if;
  insert into crm.bandeja_leads (empresa_id, origen, origen_id, datos)
  select b.empresa_id, 'resultado', new.call_id,
         jsonb_build_object('telefono_digitos', b.datos ->> 'telefono_digitos', 'telefono', b.datos ->> 'telefono',
                            'nombre', b.datos ->> 'nombre', 'apellido', b.datos ->> 'apellido',
                            'correo', b.datos ->> 'correo', 'nombre_proyecto', b.datos ->> 'nombre_proyecto',
                            'regla', b.datos ->> 'regla') ||
         (to_jsonb(new) - 'id' - 'telefono' - 'solicitud_id' - 'call_id' - 'recibido_en' - 'actualizado_en')
  from crm.bandeja_leads b
  where b.origen = 'solicitud' and b.origen_id = new.solicitud_id::text
  on conflict (empresa_id, origen, origen_id) do update
    set datos = excluded.datos, procesado_en = null, tomado_en = null, intentos = 0, error = null;
  return new;
exception when others then
  raise warning 'crm.ingresar_resultado (llamada %): %', new.call_id, sqlerrm;
  return new;
end;
$$;

revoke all on function crm.datos_persona(text) from public, anon, authenticated, crm_app;
revoke all on function crm.ultimas_respuestas(text) from public, anon, authenticated, crm_app;
revoke all on function crm.ingresar_consulta() from public, anon, authenticated, crm_app;
revoke all on function crm.ingresar_solicitud() from public, anon, authenticated, crm_app;
revoke all on function crm.ingresar_resultado() from public, anon, authenticated, crm_app;

create trigger crm_ingresar_consulta
  after insert on public.consultas
  for each row execute function crm.ingresar_consulta();

create trigger crm_ingresar_solicitud
  after insert on public.solicitudes_llamada
  for each row execute function crm.ingresar_solicitud();

create trigger crm_ingresar_resultado
  after insert or update on public.resultados_llamada
  for each row execute function crm.ingresar_resultado();
