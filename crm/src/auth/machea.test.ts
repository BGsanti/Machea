import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

// Login de Machea (esquema `acceso`) con una base real (PGlite): el SQL de equipo y el puente cuenta → empresa → rol.
const carpeta = mkdtempSync(path.join(tmpdir(), "crm-machea-"));
process.env.CRM_PGLITE_DIR = carpeta;
process.env.AUTH_MODO = "machea";
delete process.env.DATABASE_URL;

const SQL_LOGIN = readFileSync(path.join(process.cwd(), "..", "supabase", "migrations", "20261014090000_cuentas_login.sql"), "utf8");
const SQL_EQUIPO = readFileSync(path.join(process.cwd(), "..", "supabase", "migrations", "20261027120000_equipo.sql"), "utf8");

type Mod = {
  bd: typeof import("@/db/cliente").bd;
  bdSinEsperar: typeof import("@/db/cliente").bdSinEsperar;
  machea: typeof import("./machea");
  esquema: typeof import("@/db/esquema");
};
let m: Mod;
let exec: (sql: string) => Promise<unknown>;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

before(async () => {
  const [cliente, machea, esquema] = await Promise.all([import("@/db/cliente"), import("./machea"), import("@/db/esquema")]);
  m = { bd: cliente.bd, bdSinEsperar: cliente.bdSinEsperar, machea, esquema };
  await cliente.bd(); // migra el esquema del CRM
  const cliente_ = (cliente.bdSinEsperar() as unknown as { $client: { exec: (s: string) => Promise<unknown> } }).$client;
  exec = (s) => cliente_.exec(s);
  // Los roles que en Supabase ya existen.
  await exec(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'crm_app') then create role crm_app; end if;
  end $$;`);
  await exec(SQL_LOGIN);
});

after(() => rmSync(carpeta, { recursive: true, force: true }));

async function cuenta(usuario: string, extra = ""): Promise<{ id: string; token: string }> {
  const db = await m.bd();
  const token = randomBytes(24).toString("base64url");
  const { sql } = await import("drizzle-orm");
  const r = await db.execute<{ id: string }>(
    sql.raw(`insert into acceso.cuentas (usuario, correo, clave_hash, estado, tipo ${extra ? ", empresa_id" : ""})
      values ('${usuario}', '${usuario}@prueba.example', 'x', 'aprobada', 'constructora' ${extra ? `, '${extra}'` : ""}) returning id::text as id`),
  );
  const id = r.rows[0]!.id;
  await db.execute(sql.raw(`insert into acceso.sesiones (hash, cuenta_id, expira) values ('${sha(token)}', '${id}', now() + interval '1 hour')`));
  return { id, token };
}

test("antes de la migración de equipo el login funciona como siempre (una cuenta = una empresa)", async () => {
  const dueno = await cuenta("duena-sin-equipo");
  const c = await m.machea.buscarSesionMachea(sha(dueno.token));
  assert.equal(c?.usuario, "duena-sin-equipo");
  assert.equal(c?.empresaId ?? null, null);
});

test("el SQL de equipo se aplica dos veces sin romperse (es idempotente)", async () => {
  await exec(SQL_EQUIPO);
  await exec(SQL_EQUIPO);
});

test("una cuenta de equipo sabe de qué empresa es y entra con el rol de su invitación", async () => {
  const { eq, sql } = await import("drizzle-orm");
  const db = await m.bd();
  m.machea.olvidarSondaDeEquipo(); // en producción se vuelve a probar cada minuto
  const dueno = await cuenta("aurora");
  const duena = await m.machea.buscarSesionMachea(sha(dueno.token));
  assert.ok(duena);
  await m.machea.asegurarEmpresaMachea(duena);
  const invitada = await cuenta("laura", dueno.id);
  // La invitación que aceptó (la deja la API: usada_en y cuenta_id).
  await db.insert(m.esquema.invitaciones).values({
    empresaId: dueno.id,
    hash: sha("token-de-invitacion-laura"),
    nombre: "Laura Gómez",
    correo: "laura@prueba.example",
    rol: "asesor",
    expira: new Date(Date.now() + 86_400_000),
    usadaEn: new Date(),
    cuentaId: invitada.id,
  });

  const cLaura = await m.machea.buscarSesionMachea(sha(invitada.token));
  assert.equal(cLaura?.empresaId, dueno.id, "la cuenta apunta a la empresa de quien la invitó");
  const miembro = await m.machea.asegurarMiembroMachea(cLaura!);
  assert.ok(miembro);
  assert.equal(miembro.rol, "asesor");
  assert.equal(miembro.name, "Laura Gómez");
  assert.equal(miembro.activo, true);
  const [fila] = await db.select().from(m.esquema.usuarios).where(eq(m.esquema.usuarios.id, invitada.id));
  assert.equal(fila?.empresaId, dueno.id);
  assert.equal(fila?.recibeLeads, true, "un asesor entra al reparto por defecto");

  // Desactivada: sigue teniendo cuenta en Machea, pero el CRM no la deja entrar.
  await db.update(m.esquema.usuarios).set({ activo: false }).where(eq(m.esquema.usuarios.id, invitada.id));
  const desactivada = await m.machea.asegurarMiembroMachea(cLaura!);
  assert.equal(desactivada?.activo, false);
  void sql;
});

test("una cuenta con empresa pero sin invitación no entra", async () => {
  m.machea.olvidarSondaDeEquipo();
  const dueno = await cuenta("otra-empresa");
  const intrusa = await cuenta("intrusa", dueno.id);
  const c = await m.machea.buscarSesionMachea(sha(intrusa.token));
  assert.equal(await m.machea.asegurarMiembroMachea(c!), null);
});

test("el SQL impide que una cuenta sea de equipo de sí misma", async () => {
  const { sql } = await import("drizzle-orm");
  const db = await m.bd();
  const dueno = await cuenta("autocuenta");
  await assert.rejects(() => db.execute(sql.raw(`update acceso.cuentas set empresa_id = id where id = '${dueno.id}'`)));
});
