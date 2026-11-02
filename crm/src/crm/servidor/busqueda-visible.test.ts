import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

// La búsqueda de registros para un campo (buscarParaCampo) junta dos cosas: que no distinga acentos y que cada
// quien solo encuentre lo que puede ver (un asesor, lo suyo). Una base propia en una carpeta temporal.
const carpeta = mkdtempSync(path.join(tmpdir(), "crm-busqueda-"));
process.env.CRM_PGLITE_DIR = carpeta;
process.env.AUTH_MODO = "local";
delete process.env.DATABASE_URL;

type Modulos = {
  conEmpresa: typeof import("@/db/contexto").conEmpresa;
  repo: typeof import("./repositorio");
};
let m: Modulos;

const EMPRESA_1 = "11111111-1111-4111-8111-111111111111";
const EMPRESA_2 = "22222222-2222-4222-8222-222222222222";
type U = import("@/db/contexto").Usuario;
const usuario = (n: string, rol: string, empresaId = EMPRESA_1): U => ({ id: `u-${n}`, nombre: n, email: `${n}@prueba.example`, rol, empresaId });
const dueno = usuario("dueno", "admin");
const gerente = usuario("gerente", "gerente");
const ana = usuario("ana", "asesor");
const beto = usuario("beto", "asesor");
const otra = usuario("otra", "asesor", EMPRESA_2);

before(async () => {
  const [{ bd }, { conEmpresa }, esquema, repo, { inicializarOrganizacion }] = await Promise.all([
    import("@/db/cliente"),
    import("@/db/contexto"),
    import("@/db/esquema"),
    import("./repositorio"),
    import("./inicializar"),
  ]);
  m = { conEmpresa, repo };
  const db = await bd();
  await db.insert(esquema.empresas).values([
    { id: EMPRESA_1, nombre: "Constructora Aurora" },
    { id: EMPRESA_2, nombre: "Inmobiliaria Otra" },
  ]);
  for (const u of [dueno, gerente, ana, beto, otra]) {
    await db.insert(esquema.usuarios).values({ id: u.id, empresaId: u.empresaId, name: u.nombre, email: u.email, rol: u.rol, emailVerified: true });
  }
  await inicializarOrganizacion(dueno.id, EMPRESA_1, "Constructora Aurora");
  await inicializarOrganizacion(otra.id, EMPRESA_2, "Inmobiliaria Otra");
  const crear = (empresaId: string, quien: U, nombre: string, apellidos: string, propietarioId: string) =>
    conEmpresa(empresaId, () => repo.crear("candidatos", { nombre, apellidos, compania: apellidos, estado: "nuevo", propietarioId }, quien.id), quien);
  await crear(EMPRESA_1, dueno, "José", "Peña", ana.id);
  await crear(EMPRESA_1, dueno, "Josefa", "Peña", beto.id);
  await crear(EMPRESA_2, otra, "Josué", "Peña", otra.id);
});

after(() => rmSync(carpeta, { recursive: true, force: true }));

const buscar = (u: U, q: string) => m.conEmpresa(u.empresaId, () => m.repo.buscarParaCampo("candidatos", q), u).then((r) => r.map((o) => o.nombre).sort());

test("la búsqueda no distingue acentos ni mayúsculas", async () => {
  assert.equal((await buscar(gerente, "pena")).length, 2);
  assert.equal((await buscar(gerente, "PEÑA")).length, 2);
  assert.equal((await buscar(gerente, "jose")).length, 2, "«jose» encuentra José y Josefa, no a Josué de otra empresa");
});

test("un número que no cabe en la columna «numero» no rompe la búsqueda, y un teléfono de corrido se encuentra", async () => {
  const listar = (objeto: string, q: string) => m.conEmpresa(EMPRESA_1, () => m.repo.listar(objeto, { usuarioId: dueno.id, q, vista: m.repo.SIN_VISTA }), dueno);
  await m.conEmpresa(
    EMPRESA_1,
    () => m.repo.crear("candidatos", { nombre: "Laura", apellidos: "Corrido", compania: "Corrido", estado: "nuevo", propietarioId: dueno.id, telefono: "+57 300 111 2233" }, dueno.id),
    dueno,
  );
  for (const objeto of ["casos", "facturas"]) {
    for (const q of ["3001112233", "2147483648", "99999999999999999999", "1e30", "2147483647"]) {
      assert.equal((await listar(objeto, q)).total, 0, `${objeto} con «${q}»`);
    }
  }
  assert.equal((await listar("candidatos", "3001112233")).filas[0]?.apellidos, "Corrido");
});

test("un asesor solo encuentra lo suyo; el gerente, todo su equipo; nadie, lo de otra empresa", async () => {
  const deAna = await buscar(ana, "pena");
  assert.equal(deAna.length, 1);
  assert.ok(deAna[0]!.includes("José"));
  assert.equal((await buscar(beto, "pena")).length, 1);
  assert.equal((await buscar(dueno, "pena")).length, 2);
  const deOtra = await buscar(otra, "pena");
  assert.equal(deOtra.length, 1);
  assert.ok(deOtra[0]!.includes("Josué"));
});
