-- Equipo: varias personas por empresa (asesores, gerentes, solo lectura) dentro de la misma cuenta de Machea.
--
-- Hasta hoy una cuenta del login era una empresa y su único usuario. Ahora el dueño de la cuenta invita personas
-- desde el CRM (Equipo): la persona crea su acceso con un enlace y queda como una cuenta MÁS de `acceso.cuentas`,
-- aprobada y del mismo tipo que su empresa, marcada con `empresa_id` = la cuenta dueña. El rol (gerente, asesor,
-- lectura) lo guarda el CRM (crm.usuarios); el login solo sabe de qué empresa es cada persona.
--
-- REQUIERE: 20261014090000_cuentas_login.sql y 20261021130000_crm_interna.sql (el rol crm_app).
-- Y, para que el enlace de invitación funcione, las migraciones del CRM (`pnpm db:migrar`, 0003_equipo_reparto crea
-- crm.invitaciones). Orden para encenderlo: este SQL, luego `pnpm db:migrar`, luego `select crm.cerrar_tablas();`.
-- Sin la columna, el login y el CRM siguen como siempre (el CRM y la API lo detectan y no se rompen).
--
-- Idempotente: se puede correr dos veces.

alter table acceso.cuentas
  add column if not exists empresa_id uuid references acceso.cuentas (id) on delete cascade;

comment on column acceso.cuentas.empresa_id is
  'null = la cuenta ES una empresa (su dueña). Con valor = es una persona del equipo de esa empresa, invitada desde el CRM.';

-- Una persona de equipo no puede ser de sí misma ni de otra persona de equipo (no hay cadenas): lo exige la API
-- al aceptar la invitación; aquí se impide lo primero.
alter table acceso.cuentas drop constraint if exists cuentas_empresa_distinta;
alter table acceso.cuentas add constraint cuentas_empresa_distinta check (empresa_id is null or empresa_id <> id);

create index if not exists cuentas_empresa_idx on acceso.cuentas (empresa_id) where empresa_id is not null;

-- El CRM lee de qué empresa es la cuenta de la cookie (nunca clave_hash).
grant select (empresa_id) on acceso.cuentas to crm_app;
