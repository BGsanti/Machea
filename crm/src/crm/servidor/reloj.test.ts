import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

// Reloj de respuesta y bandeja por cron. Base propia en una carpeta temporal, como atascados-bd.test.ts.
const carpeta = mkdtempSync(path.join(tmpdir(), "crm-reloj-"));
process.env.CRM_PGLITE_DIR = carpeta;
process.env.AUTH_MODO = "local";
delete process.env.DATABASE_URL;

type Modulos = {
  bd: typeof import("@/db/cliente").bd;
  esquema: typeof import("@/db/esquema");
  ingesta: typeof import("./ingesta");
  cron: typeof import("@/app/api/cron/bandeja/route");
};
let m: Modulos;

const EMPRESA_1 = "44444444-4444-4444-8444-444444444444";
const EMPRESA_2 = "55555555-5555-4555-8555-555555555555";
type U = import("@/db/contexto").Usuario;
const dueno1: U = { id: "u-dueno-reloj1", nombre: "dueno1", email: "reloj1@prueba.example", rol: "admin", empresaId: EMPRESA_1 };
const dueno2: U = { id: "u-dueno-reloj2", nombre: "dueno2", email: "reloj2@prueba.example", rol: "admin", empresaId: EMPRESA_2 };

before(async () => {
  const [{ bd }, esquema, ingesta, cron, { inicializarOrganizacion }] = await Promise.all([
    import("@/db/cliente"),
    import("@/db/esquema"),
    import("./ingesta"),
    import("@/app/api/cron/bandeja/route"),
    import("./inicializar"),
  ]);
  m = { bd, esquema, ingesta, cron };
  const db = await bd();
  await db.insert(esquema.empresas).values([
    { id: EMPRESA_1, nombre: "Constructora Reloj" },
    { id: EMPRESA_2, nombre: "Inmobiliaria Reloj" },
  ]);
  for (const u of [dueno1, dueno2]) {
    await db.insert(esquema.usuarios).values({ id: u.id, empresaId: u.empresaId, name: u.nombre, email: u.email, rol: u.rol, emailVerified: true });
  }
  await inicializarOrganizacion(dueno1.id, EMPRESA_1, "Constructora Reloj");
  await inicializarOrganizacion(dueno2.id, EMPRESA_2, "Inmobiliaria Reloj");
});

after(() => rmSync(carpeta, { recursive: true, force: true }));

const haceMin = (min: number) => new Date(Date.now() - min * 60_000);
let n = 0;
async function llega(empresaId: string, origen: string, datos: Record<string, unknown>, creadoEn: Date) {
  const db = await m.bd();
  n++;
  await db.insert(m.esquema.bandejaLeads).values({ empresaId, origen, origenId: `reloj-${n}`, datos, intentos: 0, creadoEn });
}
const persona = (digitos: string) => ({ nombre: "Laura", apellido: "Reloj", telefono_digitos: digitos, telefono: `+57${digitos}` });
async function lead(empresaId: string, digitos: string) {
  const { and, eq } = await import("drizzle-orm");
  const db = await m.bd();
  const c = m.esquema.candidatos;
  const [f] = await db.select().from(c).where(and(eq(c.empresaId, empresaId), eq(c.origenExterno, `machea:${digitos}`)));
  return f!;
}
const cerca = (a: Date | null | undefined, b: Date) => assert.ok(a && Math.abs(new Date(a).getTime() - b.getTime()) < 2000, `${a?.toString()} ≈ ${b.toISOString()}`);

test("el reloj corre desde que el lead llegó, no desde que el CRM lo procesó", async () => {
  const llegada = haceMin(30);
  await llega(EMPRESA_1, "consulta", persona("3001110001"), llegada);
  await m.ingesta.procesarBandeja(dueno1);
  const f = await lead(EMPRESA_1, "3001110001");
  cerca(f.creadoEn, llegada);
  cerca(f.asignadoEn, llegada);
});

test("si Manuela habló con la persona, es el primer contacto; si no contestó, el lead sigue nuevo", async () => {
  await llega(EMPRESA_1, "consulta", persona("3001110002"), haceMin(40));
  await llega(EMPRESA_1, "consulta", persona("3001110003"), haceMin(40));
  const habló = haceMin(35);
  await llega(EMPRESA_1, "resultado", { ...persona("3001110002"), sin_contacto: false, resumen_llamada: "Quiere visitar." }, habló);
  await llega(EMPRESA_1, "resultado", { ...persona("3001110003"), sin_contacto: true }, haceMin(35));
  await m.ingesta.procesarBandeja(dueno1);

  const contestó = await lead(EMPRESA_1, "3001110002");
  assert.equal(contestó.estado, "contactado");
  cerca(contestó.primerContactoEn, habló);
  const noContestó = await lead(EMPRESA_1, "3001110003");
  assert.equal(noContestó.estado, "nuevo");
  assert.equal(noContestó.primerContactoEn, null);
});

test("el cron procesa la bandeja de todas las empresas y exige la clave", async () => {
  process.env.CRON_SECRET = "clave-del-cron-de-pruebas-123456";
  await llega(EMPRESA_1, "consulta", persona("3001110004"), haceMin(5));
  await llega(EMPRESA_2, "consulta", persona("3001110005"), haceMin(5));
  const pedir = (auth?: string) => m.cron.POST(new Request("http://crm.test/api/cron/bandeja", { method: "POST", headers: auth ? { authorization: auth } : {} }));

  assert.equal((await pedir()).status, 401);
  assert.equal((await pedir("Bearer otra-clave-que-no-es-la-buena-000")).status, 401);
  const r = await pedir(`Bearer ${process.env.CRON_SECRET}`);
  assert.equal(r.status, 200);
  const cuerpo = (await r.json()) as { empresas: number; procesadas: number };
  assert.equal(cuerpo.empresas, 2);
  assert.ok(await lead(EMPRESA_1, "3001110004"));
  assert.ok(await lead(EMPRESA_2, "3001110005"));
  delete process.env.CRON_SECRET;
  assert.equal((await pedir("Bearer clave-del-cron-de-pruebas-123456")).status, 503);
});
