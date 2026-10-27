/**
 * Aplica TODAS las migraciones SQL de Supabase (supabase/migrations/*.sql) en orden sobre una base real (PGlite) con el
 * esquema del CRM ya migrado, como en producción. Sirve para encontrar errores de SQL antes de correrlas en Supabase.
 * Uso:  pnpm exec tsx scripts/prueba-sql-supabase.ts
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const carpeta = mkdtempSync(path.join(tmpdir(), "crm-sql-"));
process.env.CRM_PGLITE_DIR = carpeta;
delete process.env.DATABASE_URL;

const { bd, bdSinEsperar } = await import("../src/db/cliente");
await bd(); // esquema del CRM (drizzle)
const cliente = (bdSinEsperar() as unknown as { $client: { exec: (s: string) => Promise<unknown>; query: (s: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> } }).$client;

// Lo que en Supabase ya existe.
await cliente.exec(`do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'postgres') then create role postgres superuser; end if;
end $$;`);

const dir = path.join(process.cwd(), "..", "supabase", "migrations");
let fallos = 0;
for (const archivo of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await cliente.exec(readFileSync(path.join(dir, archivo), "utf8"));
    console.log(`✓ ${archivo}`);
  } catch (e) {
    fallos++;
    console.error(`✗ ${archivo}: ${e instanceof Error ? e.message : e}`);
  }
}

if (fallos === 0) {
  // La empresa interna de Machea: el SQL de «el primer cliente somos nosotros» deja en la bandeja lo que le corresponde.
  const empresa = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await cliente.exec(`
    insert into acceso.cuentas (id, usuario, correo, clave_hash, estado, tipo) values ('${empresa}', 'machea', 'machea@prueba.example', 'x', 'aprobada', 'inmobiliaria');
    insert into crm.empresas (id, nombre) values ('${empresa}', 'Machea');
    insert into crm.empresa_fuentes (empresa_id, tipo, slug) values ('${empresa}', 'interna', 'machea');`);
  await cliente.exec(`insert into public.solicitudes_demo (nombre, correo, telefono, empresa, tipo_empresa, problema) values ('Ana Prueba', 'ana@prueba.example', '3105550199', 'Inmobiliaria Prueba', 'inmobiliaria', 'Responder rápido');`).catch((e) => {
    fallos++;
    console.error("✗ insertar una demo:", e instanceof Error ? e.message : e);
  });
  const r = await cliente.query(`select origen, origen_id, datos->>'empresa' as empresa from crm.bandeja_leads where empresa_id = '${empresa}'`);
  console.log("bandeja de la empresa interna tras pedir una demo:", JSON.stringify(r.rows));
  if (!r.rows.some((f) => f.origen === "demo")) {
    fallos++;
    console.error("✗ la demo pedida no llegó a la bandeja de Machea");
  }
  const n = await cliente.query(`select crm.rellenar_interna() as n`);
  console.log("rellenar_interna() revisó filas:", JSON.stringify(n.rows));
}

rmSync(carpeta, { recursive: true, force: true });
console.log(fallos === 0 ? "\nTodas las migraciones aplican sin errores." : `\n${fallos} con errores.`);
process.exit(fallos === 0 ? 0 : 1);
