import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

// Una base de datos propia (PGlite en una carpeta temporal): la prueba no toca los datos de desarrollo.
const carpeta = mkdtempSync(path.join(tmpdir(), "crm-atascados-"));
process.env.CRM_PGLITE_DIR = carpeta;
process.env.AUTH_MODO = "local";
delete process.env.DATABASE_URL;

type Modulos = {
  bd: typeof import("@/db/cliente").bd;
  esquema: typeof import("@/db/esquema");
  atascados: typeof import("./atascados");
  ingesta: typeof import("./ingesta");
};
let m: Modulos;

const EMPRESA_1 = "11111111-1111-4111-8111-111111111111";
const EMPRESA_2 = "22222222-2222-4222-8222-222222222222";
type U = import("@/db/contexto").Usuario;
const dueno1: U = { id: "u-dueno1", nombre: "dueno1", email: "dueno1@prueba.example", rol: "admin", empresaId: EMPRESA_1 };
const dueno2: U = { id: "u-dueno2", nombre: "dueno2", email: "dueno2@prueba.example", rol: "admin", empresaId: EMPRESA_2 };

before(async () => {
  const [{ bd }, esquema, atascados, ingesta, { inicializarOrganizacion }] = await Promise.all([
    import("@/db/cliente"),
    import("@/db/esquema"),
    import("./atascados"),
    import("./ingesta"),
    import("./inicializar"),
  ]);
  m = { bd, esquema, atascados, ingesta };
  const db = await bd();
  await db.insert(esquema.empresas).values([
    { id: EMPRESA_1, nombre: "Constructora Aurora" },
    { id: EMPRESA_2, nombre: "Inmobiliaria Otra" },
  ]);
  for (const u of [dueno1, dueno2]) {
    await db.insert(esquema.usuarios).values({ id: u.id, empresaId: u.empresaId, name: u.nombre, email: u.email, rol: u.rol, emailVerified: true });
  }
  await inicializarOrganizacion(dueno1.id, EMPRESA_1, "Constructora Aurora");
  await inicializarOrganizacion(dueno2.id, EMPRESA_2, "Inmobiliaria Otra");
});

after(() => rmSync(carpeta, { recursive: true, force: true }));

let contador = 0;
async function poner(empresaId: string, datos: Record<string, unknown>, extra: { intentos?: number; error?: string | null; origen?: string } = {}) {
  const db = await m.bd();
  contador++;
  const [f] = await db
    .insert(m.esquema.bandejaLeads)
    .values({ empresaId, origen: extra.origen ?? "consulta", origenId: `prueba-${contador}`, datos, intentos: extra.intentos ?? 5, error: extra.error ?? null })
    .returning({ id: m.esquema.bandejaLeads.id });
  return f!.id;
}
const persona = (n: string, digitos: string) => ({ nombre: n, apellido: "Prueba", telefono_digitos: digitos, telefono: `+57${digitos}`, correo: `${n.toLowerCase()}@prueba.example` });

async function fila(id: number) {
  const db = await m.bd();
  const { eq } = await import("drizzle-orm");
  const [f] = await db.select().from(m.esquema.bandejaLeads).where(eq(m.esquema.bandejaLeads.id, id));
  return f!;
}
async function candidatosDe(empresaId: string, digitos: string) {
  const db = await m.bd();
  const { and, eq } = await import("drizzle-orm");
  return db
    .select({ id: m.esquema.candidatos.id })
    .from(m.esquema.candidatos)
    .where(and(eq(m.esquema.candidatos.empresaId, empresaId), eq(m.esquema.candidatos.origenExterno, `machea:${digitos}`)));
}

test("sin leads atascados no hay nada que avisar", async () => {
  assert.equal(await m.atascados.contarAtascados(EMPRESA_1), 0);
  assert.deepEqual(await m.atascados.listarAtascados(EMPRESA_1), []);
});

test("solo cuentan los que agotaron sus intentos, y solo de la empresa", async () => {
  await poner(EMPRESA_1, persona("Sinintentos", "3001000001"), { intentos: 2 }); // todavía se reintenta solo
  await poner(EMPRESA_1, { ...persona("Hecho", "3001000002") }, { intentos: 5, error: null }).then(async (id) => {
    const db = await m.bd();
    const { eq } = await import("drizzle-orm");
    await db.update(m.esquema.bandejaLeads).set({ procesadoEn: new Date() }).where(eq(m.esquema.bandejaLeads.id, id)); // ya entró
  });
  assert.equal(await m.atascados.contarAtascados(EMPRESA_1), 0);

  await poner(EMPRESA_1, { nombre: "Laura", apellido: "Gómez" }, { error: "La fila no trae teléfono." });
  await poner(EMPRESA_1, persona("Pedro", "3001000003"), { error: "insert into crm.candidatos ... violates not-null constraint" });
  await poner(EMPRESA_2, persona("Ajeno", "3001000004"), { error: "Connection terminated unexpectedly" });

  assert.equal(await m.atascados.contarAtascados(EMPRESA_1), 2);
  assert.equal(await m.atascados.contarAtascados(EMPRESA_2), 1);

  const lista = await m.atascados.listarAtascados(EMPRESA_1);
  assert.deepEqual(lista.map((l) => l.nombre).sort(), ["Laura Gómez", "Pedro Prueba"]);
  assert.ok(!lista.some((l) => l.nombre.includes("Ajeno")), "una empresa vio un lead de otra");
  const laura = lista.find((l) => l.nombre === "Laura Gómez")!;
  assert.match(laura.motivo, /sin número de teléfono/);
  assert.equal(laura.origen, "Formulario de Machea");
  // El error técnico nunca llega a la pantalla.
  assert.ok(!JSON.stringify(lista).includes("not-null"));
});

test("la bandeja automática no vuelve a tocar un atascado", async () => {
  const antes = await m.atascados.contarAtascados(EMPRESA_1);
  // Hecha: solo la que iba con 2 intentos (se reintenta sola). Los atascados no se tocan.
  assert.equal(await m.ingesta.procesarBandeja(dueno1), 1);
  assert.equal(await m.ingesta.procesarBandeja(dueno1), 0);
  assert.equal(await m.atascados.contarAtascados(EMPRESA_1), antes);
  assert.ok((await m.atascados.listarAtascados(EMPRESA_1)).every((l) => l.motivo));
});

test("Reintentar: si ahora funciona, entra una sola vez y sale de la lista", async () => {
  const id = await poner(EMPRESA_1, persona("Camilo", "3001000010"), { error: "Connection terminated unexpectedly" });
  const antes = await m.atascados.contarAtascados(EMPRESA_1);
  assert.equal(await m.ingesta.reintentarAtascado(dueno1, id), "hecho");
  assert.equal((await candidatosDe(EMPRESA_1, "3001000010")).length, 1);
  const f = await fila(id);
  assert.ok(f.procesadoEn && f.error === null, "la fila no quedó procesada");
  assert.equal(f.intentos, 5, "reintentar no debe cambiar el número de intentos");
  assert.equal(await m.atascados.contarAtascados(EMPRESA_1), antes - 1);
  // Un segundo toque no lo duplica.
  assert.equal(await m.ingesta.reintentarAtascado(dueno1, id), "ya_entro");
  assert.equal((await candidatosDe(EMPRESA_1, "3001000010")).length, 1);
});

test("Reintentar: si vuelve a fallar, sigue en la lista con el motivo actualizado", async () => {
  const id = await poner(EMPRESA_1, { nombre: "Sinfono", apellido: "Prueba" }, { error: "Connection terminated unexpectedly" });
  assert.equal(await m.ingesta.reintentarAtascado(dueno1, id), "fallo");
  const f = await fila(id);
  assert.equal(f.procesadoEn, null);
  assert.equal(f.tomadoEn, null, "la fila quedó tomada: no se podría reintentar otra vez");
  assert.equal(f.error, "La fila no trae teléfono.");
  const l = (await m.atascados.listarAtascados(EMPRESA_1)).find((x) => x.id === id)!;
  assert.match(l.motivo, /sin número de teléfono/, "el motivo no se actualizó");
  // Y se puede volver a intentar.
  assert.equal(await m.ingesta.reintentarAtascado(dueno1, id), "fallo");
});

test("Reintentar a la vez (doble clic o dos dueños): se procesa una sola vez", async () => {
  const id = await poner(EMPRESA_1, persona("Doble", "3001000020"));
  const r = await Promise.all([m.ingesta.reintentarAtascado(dueno1, id), m.ingesta.reintentarAtascado(dueno1, id), m.ingesta.reintentarAtascado(dueno1, id)]);
  assert.equal(r.filter((x) => x === "hecho").length, 1, `resultados: ${r}`);
  assert.ok(r.every((x) => x === "hecho" || x === "ocupado" || x === "ya_entro"), `resultados: ${r}`);
  assert.equal((await candidatosDe(EMPRESA_1, "3001000020")).length, 1);
});

test("otra empresa no puede reintentar un lead ajeno, ni uno que no está atascado", async () => {
  const ajeno = await poner(EMPRESA_1, persona("Protegido", "3001000030"));
  assert.equal(await m.ingesta.reintentarAtascado(dueno2, ajeno), "no_atascado");
  const f = await fila(ajeno);
  assert.equal(f.procesadoEn, null);
  assert.equal(f.tomadoEn, null);
  assert.equal((await candidatosDe(EMPRESA_1, "3001000030")).length, 0);
  assert.equal((await candidatosDe(EMPRESA_2, "3001000030")).length, 0);

  const enCurso = await poner(EMPRESA_1, persona("Encurso", "3001000031"), { intentos: 3 });
  assert.equal(await m.ingesta.reintentarAtascado(dueno1, enCurso), "no_atascado");
  assert.equal((await fila(enCurso)).procesadoEn, null);
  assert.equal(await m.ingesta.reintentarAtascado(dueno1, 987654), "no_atascado");
});

test("si el lead vuelve a llegar, el trigger reinicia la fila y sale de la lista", async () => {
  const id = await poner(EMPRESA_1, persona("Vuelve", "3001000040"), { error: "Connection terminated unexpectedly" });
  assert.ok((await m.atascados.listarAtascados(EMPRESA_1)).some((l) => l.id === id));
  // Lo mismo que hace el trigger de supabase/migrations/20261018130000_crm_ingesta.sql al reinsertar.
  const db = await m.bd();
  const { eq } = await import("drizzle-orm");
  await db.update(m.esquema.bandejaLeads).set({ procesadoEn: null, tomadoEn: null, intentos: 0, error: null }).where(eq(m.esquema.bandejaLeads.id, id));
  assert.ok(!(await m.atascados.listarAtascados(EMPRESA_1)).some((l) => l.id === id));
  assert.ok((await m.ingesta.procesarBandeja(dueno1)) >= 1);
  assert.equal((await candidatosDe(EMPRESA_1, "3001000040")).length, 1);
});
