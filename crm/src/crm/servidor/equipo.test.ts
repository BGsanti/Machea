import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

// Una base de datos propia (PGlite en una carpeta temporal): la prueba no toca los datos de desarrollo.
const carpeta = mkdtempSync(path.join(tmpdir(), "crm-equipo-"));
process.env.CRM_PGLITE_DIR = carpeta;
process.env.AUTH_MODO = "local";
delete process.env.DATABASE_URL;

type Modulos = {
  bd: typeof import("@/db/cliente").bd;
  conEmpresa: typeof import("@/db/contexto").conEmpresa;
  esquema: typeof import("@/db/esquema");
  repo: typeof import("./repositorio");
  reparto: typeof import("./reparto");
  panel: typeof import("./panel");
  inicializar: typeof import("./inicializar");
  ErrorPermiso: typeof import("@/auth/permisos").ErrorPermiso;
};
let m: Modulos;

const uid = (n: string) => `u-${n}`;
const EMPRESA_1 = "11111111-1111-4111-8111-111111111111";
const EMPRESA_2 = "22222222-2222-4222-8222-222222222222";
type U = import("@/db/contexto").Usuario;
const usuario = (n: string, rol: string, empresaId = EMPRESA_1): U => ({ id: uid(n), nombre: n, email: `${n}@prueba.example`, rol, empresaId });

const dueno = usuario("dueno", "admin");
const gerente = usuario("gerente", "gerente");
const ana = usuario("ana", "asesor");
const beto = usuario("beto", "asesor");
const lector = usuario("lector", "lectura");
const otra = usuario("otra", "asesor", EMPRESA_2);

before(async () => {
  const [{ bd }, { conEmpresa }, esquema, repo, reparto, panel, inicializar, permisos] = await Promise.all([
    import("@/db/cliente"),
    import("@/db/contexto"),
    import("@/db/esquema"),
    import("./repositorio"),
    import("./reparto"),
    import("./panel"),
    import("./inicializar"),
    import("@/auth/permisos"),
  ]);
  m = { bd, conEmpresa, esquema, repo, reparto, panel, inicializar, ErrorPermiso: permisos.ErrorPermiso };
  const db = await bd();
  await db.insert(esquema.empresas).values([
    { id: EMPRESA_1, nombre: "Constructora Aurora" },
    { id: EMPRESA_2, nombre: "Inmobiliaria Otra" },
  ]);
  for (const u of [dueno, gerente, ana, beto, lector, otra]) {
    await db.insert(esquema.usuarios).values({
      id: u.id,
      empresaId: u.empresaId,
      name: u.nombre,
      email: u.email,
      rol: u.rol,
      emailVerified: true,
      recibeLeads: u.rol === "asesor",
    });
  }
  await inicializar.inicializarOrganizacion(dueno.id, EMPRESA_1, "Constructora Aurora");
  await inicializar.inicializarOrganizacion(otra.id, EMPRESA_2, "Inmobiliaria Otra");
});

after(() => rmSync(carpeta, { recursive: true, force: true }));

const lead = (apellidos: string, extra: Record<string, unknown> = {}) => ({ apellidos, compania: apellidos, estado: "nuevo", ...extra });
const listar = (u: U) => m.conEmpresa(u.empresaId, () => m.repo.listar("candidatos", { usuarioId: u.id, vista: m.repo.SIN_VISTA, porPagina: 200 }), u);

test("el reparto por turnos alterna entre los asesores que reciben leads y salta a quien no", async () => {
  const { eq } = await import("drizzle-orm");
  const db = await m.bd();
  const turnos: string[] = [];
  for (let i = 0; i < 4; i++) turnos.push((await m.reparto.elegirAsesor(EMPRESA_1))!.usuarioId);
  assert.deepEqual(turnos, [ana.id, beto.id, ana.id, beto.id]);
  // Ana sale del reparto: todo va para Beto.
  await db.update(m.esquema.usuarios).set({ recibeLeads: false }).where(eq(m.esquema.usuarios.id, ana.id));
  assert.equal((await m.reparto.elegirAsesor(EMPRESA_1))!.usuarioId, beto.id);
  assert.equal((await m.reparto.elegirAsesor(EMPRESA_1))!.usuarioId, beto.id);
  await db.update(m.esquema.usuarios).set({ recibeLeads: true }).where(eq(m.esquema.usuarios.id, ana.id));
  // Cada empresa reparte solo entre los suyos, y sin nadie en el reparto el lead queda con el dueño.
  assert.equal((await m.reparto.elegirAsesor(EMPRESA_2))!.usuarioId, otra.id);
  await db.update(m.esquema.usuarios).set({ recibeLeads: false }).where(eq(m.esquema.usuarios.id, otra.id));
  assert.equal(await m.reparto.elegirAsesor(EMPRESA_2), null);
});

test("en modo manual nadie recibe leads por turno", async () => {
  const { eq } = await import("drizzle-orm");
  const db = await m.bd();
  await db.update(m.esquema.configuracion).set({ reparto: "manual" }).where(eq(m.esquema.configuracion.empresaId, EMPRESA_1));
  assert.equal(await m.reparto.elegirAsesor(EMPRESA_1), null);
  await db.update(m.esquema.configuracion).set({ reparto: "turnos" }).where(eq(m.esquema.configuracion.empresaId, EMPRESA_1));
});

test("un asesor solo ve, abre y edita lo suyo; el gerente y quien consulta ven todo", async () => {
  const deAna = await m.conEmpresa(EMPRESA_1, () => m.repo.crear("candidatos", lead("De Ana", { propietarioId: ana.id }), dueno.id), dueno);
  const deBeto = await m.conEmpresa(EMPRESA_1, () => m.repo.crear("candidatos", lead("De Beto", { propietarioId: beto.id }), dueno.id), dueno);
  const deOtra = await m.conEmpresa(EMPRESA_2, () => m.repo.crear("candidatos", lead("De otra empresa", { propietarioId: otra.id }), otra.id), otra);

  const vistosAna = (await listar(ana)).filas.map((f) => f.apellidos);
  assert.deepEqual(vistosAna, ["De Ana"]);
  assert.deepEqual((await listar(beto)).filas.map((f) => f.apellidos), ["De Beto"]);
  for (const u of [gerente, dueno, lector]) {
    const todos = (await listar(u)).filas.map((f) => f.apellidos).sort();
    assert.deepEqual(todos, ["De Ana", "De Beto"], `${u.rol} ve a todo el equipo y a nadie de otra empresa`);
  }

  // Abrir la ficha de otro: no existe para Ana.
  assert.equal(await m.conEmpresa(EMPRESA_1, () => m.repo.obtener("candidatos", deBeto), ana), null);
  assert.ok(await m.conEmpresa(EMPRESA_1, () => m.repo.obtener("candidatos", deAna), ana));
  // Editar el de otro falla; el propio no.
  await assert.rejects(() => m.conEmpresa(EMPRESA_1, () => m.repo.actualizar("candidatos", deBeto, { cargo: "Hackeado" }, ana.id), ana), /ya no existe/);
  await m.conEmpresa(EMPRESA_1, () => m.repo.actualizar("candidatos", deAna, { cargo: "Gerente de compras" }, ana.id), ana);
  // Ana no se pasa un lead a otra persona ni se lo quita de encima.
  await assert.rejects(() => m.conEmpresa(EMPRESA_1, () => m.repo.actualizar("candidatos", deAna, { propietarioId: beto.id }, ana.id), ana), /quien reparte/);
  // El gerente sí reasigna.
  await m.conEmpresa(EMPRESA_1, () => m.repo.actualizar("candidatos", deAna, { propietarioId: beto.id }, gerente.id), gerente);
  assert.deepEqual((await listar(ana)).filas.length, 0);
  await m.conEmpresa(EMPRESA_1, () => m.repo.actualizar("candidatos", deAna, { propietarioId: ana.id }, gerente.id), gerente);

  // Otra empresa nunca se ve, ni siendo gerente ni sabiendo el id.
  assert.equal(await m.conEmpresa(EMPRESA_1, () => m.repo.obtener("candidatos", deOtra), gerente), null);
  await assert.rejects(() => m.conEmpresa(EMPRESA_1, () => m.repo.actualizar("candidatos", deOtra, { cargo: "x" }, gerente.id), gerente), /ya no existe/);
});

test("lo que crea un asesor es suyo aunque pida dejárselo a otro", async () => {
  const id = await m.conEmpresa(EMPRESA_1, () => m.repo.crear("candidatos", lead("Creado por Ana", { propietarioId: beto.id }), ana.id), ana);
  const fila = await m.conEmpresa(EMPRESA_1, () => m.repo.obtener("candidatos", id), gerente);
  assert.equal(fila?.propietarioId, ana.id);
  assert.ok(fila?.asignadoEn, "queda anotado cuándo se asignó");
});

test("permisos de escritura: eliminar, catálogo y solo lectura", async () => {
  const id = await m.conEmpresa(EMPRESA_1, () => m.repo.crear("candidatos", lead("Para borrar", { propietarioId: ana.id }), dueno.id), dueno);
  await assert.rejects(() => m.conEmpresa(EMPRESA_1, () => m.repo.eliminar("candidatos", [id]), ana), m.ErrorPermiso);
  await assert.rejects(() => m.conEmpresa(EMPRESA_1, () => m.repo.crear("candidatos", lead("X"), lector.id), lector), m.ErrorPermiso);
  await assert.rejects(() => m.conEmpresa(EMPRESA_1, () => m.repo.actualizar("candidatos", id, { cargo: "x" }, lector.id), lector), m.ErrorPermiso);
  // El catálogo (proyectos) lo maneja el gerente, no el asesor.
  await assert.rejects(() => m.conEmpresa(EMPRESA_1, () => m.repo.crear("proyectos", { nombre: "Torres del Sol" }, ana.id), ana), m.ErrorPermiso);
  assert.equal(await m.conEmpresa(EMPRESA_1, () => m.repo.eliminar("candidatos", [id]), gerente), 1);
});

test("lo de gestión (flujos, conexiones) no se ve siendo asesor", async () => {
  const lista = await m.conEmpresa(EMPRESA_1, () => m.repo.listar("flujos", { usuarioId: ana.id, vista: m.repo.SIN_VISTA }), ana);
  assert.equal(lista.total, 0);
});

test("el primer contacto queda anotado al sacar el lead del estado «nuevo»", async () => {
  const id = await m.conEmpresa(EMPRESA_1, () => m.repo.crear("candidatos", lead("Primer contacto", { propietarioId: beto.id }), dueno.id), dueno);
  const antes = await m.conEmpresa(EMPRESA_1, () => m.repo.obtener("candidatos", id), gerente);
  assert.equal(antes?.primerContactoEn, null);
  await m.conEmpresa(EMPRESA_1, () => m.repo.actualizar("candidatos", id, { estado: "contactado" }, beto.id), beto);
  const despues = await m.conEmpresa(EMPRESA_1, () => m.repo.obtener("candidatos", id), gerente);
  assert.ok(despues?.primerContactoEn instanceof Date);
});

test("el panel del gerente y «Mi día» salen con los números de cada quien", async () => {
  // Un lead sin contactar desde hace una hora para Ana: está atrasado.
  const { eq } = await import("drizzle-orm");
  const db = await m.bd();
  const id = await m.conEmpresa(EMPRESA_1, () => m.repo.crear("candidatos", lead("Atrasado", { propietarioId: ana.id }), dueno.id), dueno);
  await db.update(m.esquema.candidatos).set({ asignadoEn: new Date(Date.now() - 3_600_000), creadoEn: new Date(Date.now() - 3_600_000) }).where(eq(m.esquema.candidatos.id, id));

  const r = await m.conEmpresa(EMPRESA_1, () => m.panel.resumenPanel(7, 5), gerente);
  assert.ok(r.nuevos >= 4);
  assert.ok(r.totalAtrasados >= 1);
  assert.ok(r.atrasados.some((l) => l.nombre.includes("Atrasado") && l.minutos >= 59));
  const filaAna = r.porAsesor.find((a) => a.id === ana.id);
  assert.ok(filaAna && filaAna.asignados >= 2 && filaAna.atrasados >= 1);
  assert.ok(r.porAsesor.some((a) => a.id === beto.id));
  assert.equal(r.serie.length, 7);
  // El panel no cuenta lo de otra empresa.
  assert.ok(!r.atrasados.some((l) => l.nombre.includes("otra empresa")));

  const dia = await m.conEmpresa(EMPRESA_1, () => m.panel.datosMiDia(ana.id, 5), ana);
  assert.ok(dia.porContactar.some((l) => l.nombre.includes("Atrasado")));
  assert.ok(dia.porContactar.every((l) => !l.nombre.includes("De Beto")), "Mi día no trae leads de otros");
});
