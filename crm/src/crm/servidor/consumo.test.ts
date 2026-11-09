import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

// Consumo del mes. Base propia en una carpeta temporal, como atascados-bd.test.ts.
const carpeta = mkdtempSync(path.join(tmpdir(), "crm-consumo-"));
process.env.CRM_PGLITE_DIR = carpeta;
process.env.AUTH_MODO = "local";
delete process.env.DATABASE_URL;

type Modulos = {
  bd: typeof import("@/db/cliente").bd;
  conEmpresa: typeof import("@/db/contexto").conEmpresa;
  esquema: typeof import("@/db/esquema");
  consumo: typeof import("./consumo");
};
let m: Modulos;

const EMPRESA = "66666666-6666-4666-8666-666666666666";
const OTRA = "77777777-7777-4777-8777-777777777777";
type U = import("@/db/contexto").Usuario;
const dueno: U = { id: "u-dueno-consumo", nombre: "dueno", email: "consumo@prueba.example", rol: "admin", empresaId: EMPRESA };

before(async () => {
  const [{ bd }, { conEmpresa }, esquema, consumo] = await Promise.all([
    import("@/db/cliente"),
    import("@/db/contexto"),
    import("@/db/esquema"),
    import("./consumo"),
  ]);
  m = { bd, conEmpresa, esquema, consumo };
  const db = await bd();
  await db.insert(esquema.empresas).values([{ id: EMPRESA, nombre: "Constructora Consumo" }, { id: OTRA, nombre: "Otra" }]);
  await db.insert(esquema.usuarios).values({ id: dueno.id, empresaId: EMPRESA, name: dueno.nombre, email: dueno.email, rol: "admin", emailVerified: true });
});

after(() => rmSync(carpeta, { recursive: true, force: true }));

const HOY = new Date("2026-11-20T15:00:00Z");
let n = 0;
async function resultado(empresaId: string, datos: Record<string, unknown>, creadoEn: Date, origen = "resultado") {
  const db = await m.bd();
  n++;
  await db.insert(m.esquema.bandejaLeads).values({ empresaId, origen, origenId: `consumo-${n}`, datos, procesadoEn: creadoEn, creadoEn });
}

test("cuenta llamadas, minutos por minuto iniciado y WhatsApp del mes, por fuente", async () => {
  const noviembre = new Date("2026-11-10T15:00:00Z");
  await resultado(EMPRESA, { regla: "marca", duracion_ms: 70_000, whatsapp_enviado_en: "2026-11-10T15:05:00Z" }, noviembre); // 2 min
  await resultado(EMPRESA, { regla: "marca", duracion_ms: 30_000 }, noviembre); // 1 min
  await resultado(EMPRESA, { regla: "proyecto", duracion_ms: 125_000 }, noviembre); // 3 min
  await resultado(EMPRESA, { regla: "marca", sin_contacto: true }, noviembre); // sin duración: 0 min, pero cuenta como llamada
  await resultado(EMPRESA, { regla: "marca", duracion_ms: 600_000 }, new Date("2026-10-31T23:00:00Z")); // octubre en Bogotá: no cuenta
  await resultado(OTRA, { regla: "marca", duracion_ms: 600_000 }, noviembre); // otra empresa: no cuenta

  const c = await m.conEmpresa(EMPRESA, () => m.consumo.consumoDelMes(HOY), dueno);
  assert.equal(c.desde, "2026-11-01");
  assert.deepEqual(c.porFuente.formulario, { llamadas: 3, minutos: 3, whatsapp: 1 });
  assert.deepEqual(c.porFuente.proyecto, { llamadas: 1, minutos: 3, whatsapp: 0 });
  assert.deepEqual(c.total, { llamadas: 4, minutos: 6, whatsapp: 1, correos: 0 });
});

test("el 1 de noviembre a las 12:30 a. m. de Bogotá ya es noviembre, aunque en UTC sea 1 de noviembre a las 5:30", async () => {
  await resultado(EMPRESA, { regla: "proyecto", duracion_ms: 10_000 }, new Date("2026-11-01T05:30:00Z"));
  const c = await m.conEmpresa(EMPRESA, () => m.consumo.consumoDelMes(HOY), dueno);
  assert.equal(c.porFuente.proyecto?.llamadas, 2);
});
