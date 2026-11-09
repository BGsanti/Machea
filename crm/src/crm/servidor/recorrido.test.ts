import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

// Errores del recorrido de prueba de Santiago (2026-11-02). Base propia en una carpeta temporal, como equipo.test.ts.
const carpeta = mkdtempSync(path.join(tmpdir(), "crm-recorrido-"));
process.env.CRM_PGLITE_DIR = carpeta;
process.env.AUTH_MODO = "local";
delete process.env.DATABASE_URL;

type Modulos = {
  bd: typeof import("@/db/cliente").bd;
  conEmpresa: typeof import("@/db/contexto").conEmpresa;
  esquema: typeof import("@/db/esquema");
  repo: typeof import("./repositorio");
  equipo: typeof import("./equipo-consultas");
  especiales: typeof import("./especiales");
  fechas: typeof import("../fechas");
  formato: typeof import("../formato");
};
let m: Modulos;

const EMPRESA = "33333333-3333-4333-8333-333333333333";
type U = import("@/db/contexto").Usuario;
const dueno: U = { id: "u-dueno-r", nombre: "dueno", email: "dueno-r@prueba.example", rol: "admin", empresaId: EMPRESA };
const ana: U = { id: "u-ana-r", nombre: "ana", email: "ana-r@prueba.example", rol: "asesor", empresaId: EMPRESA };

before(async () => {
  const [{ bd }, { conEmpresa }, esquema, repo, equipo, especiales, fechas, formato, inicializar] = await Promise.all([
    import("@/db/cliente"),
    import("@/db/contexto"),
    import("@/db/esquema"),
    import("./repositorio"),
    import("./equipo-consultas"),
    import("./especiales"),
    import("../fechas"),
    import("../formato"),
    import("./inicializar"),
  ]);
  m = { bd, conEmpresa, esquema, repo, equipo, especiales, fechas, formato };
  const db = await bd();
  await db.insert(esquema.empresas).values({ id: EMPRESA, nombre: "Inmobiliaria Recorrido" });
  for (const u of [dueno, ana]) {
    await db.insert(esquema.usuarios).values({ id: u.id, empresaId: EMPRESA, name: u.nombre, email: u.email, rol: u.rol, emailVerified: true, recibeLeads: u.rol === "asesor" });
  }
  await inicializar.inicializarOrganizacion(dueno.id, EMPRESA, "Inmobiliaria Recorrido");
});

after(() => rmSync(carpeta, { recursive: true, force: true }));

test("la fecha y hora se escribe igual en el servidor y en el navegador (sin espacios especiales)", () => {
  const texto = m.formato.formatoFechaHora(new Date("2026-11-09T21:05:00Z"));
  assert.ok(texto.length > 0);
  assert.doesNotMatch(texto, /[\u00a0\u202f]/);
});

test("una tarea que vence hoy no cuenta como vencida; una de ayer sí", async () => {
  const crearTarea = (fechaVencimiento: string) =>
    m.conEmpresa(EMPRESA, () => m.repo.crear("tareas", { asunto: `Vence ${fechaVencimiento}`, tipo: "tarea", fechaVencimiento, propietarioId: ana.id }, dueno.id), dueno);
  const vencidasDeAna = async () =>
    (await m.conEmpresa(EMPRESA, () => m.equipo.equipoConCarga(), dueno)).find((p) => p.id === ana.id)!.tareasVencidas;

  await crearTarea(m.fechas.fechaLocal());
  assert.equal(await vencidasDeAna(), 0);
  await crearTarea(m.fechas.hoyMas(-1));
  assert.equal(await vencidasDeAna(), 1);
});

test("registrar el resultado de una llamada cierra las tareas de llamada abiertas de esa persona", async () => {
  const { and, eq } = await import("drizzle-orm");
  const lead = await m.conEmpresa(EMPRESA, () => m.repo.crear("candidatos", { apellidos: "Prueba", estado: "nuevo", propietarioId: ana.id }, dueno.id), dueno);
  const quien = { quienObjeto: "candidatos", quienId: lead };
  await m.conEmpresa(EMPRESA, () => m.repo.crear("tareas", { asunto: "Contactar a Prueba (Formulario)", tipo: "llamada", fechaVencimiento: m.fechas.fechaLocal(), ...quien, propietarioId: ana.id }, dueno.id), dueno);
  const otra = await m.conEmpresa(EMPRESA, () => m.repo.crear("tareas", { asunto: "Enviar brochure", tipo: "tarea", fechaVencimiento: m.fechas.fechaLocal(), ...quien, propietarioId: ana.id }, dueno.id), dueno);

  // revalidatePath no existe fuera de Next: la acción puede responder con error después de guardar; lo que importa es la base.
  await m.conEmpresa(EMPRESA, () => m.especiales.registrarResultadoLlamada("candidatos", lead, "contesto_interesado"), ana).catch(() => undefined);

  const db = await m.bd();
  const t = m.esquema.tareas;
  const filas = await db.select({ asunto: t.asunto, estado: t.estado, tipo: t.tipo }).from(t).where(and(eq(t.empresaId, EMPRESA), eq(t.quienId, lead)));
  const llamadasAbiertas = filas.filter((f) => f.tipo === "llamada" && f.estado !== "completada");
  assert.deepEqual(llamadasAbiertas, [], "no queda ninguna llamada pendiente con esa persona");
  assert.equal(filas.find((f) => f.asunto === "Contactar a Prueba (Formulario)")?.estado, "completada");
  assert.notEqual(filas.find((f) => f.asunto === "Enviar brochure")?.estado, "completada", "las tareas que no son llamadas siguen abiertas");
  assert.ok(otra);
});
