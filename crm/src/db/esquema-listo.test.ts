import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

// Como en producción: las migraciones NO se aplican solas. Base de datos propia y vacía (PGlite).
const carpeta = mkdtempSync(path.join(tmpdir(), "crm-esquema-"));
process.env.CRM_PGLITE_DIR = carpeta;
process.env.CRM_MIGRAR_AL_ARRANCAR = "false";
delete process.env.DATABASE_URL;

after(() => rmSync(carpeta, { recursive: true, force: true }));

test("sin migrar, la base se reconoce incompleta; tras migrar, queda lista", async () => {
  // Con PGlite no hay verificación (solo se verifica con DATABASE_URL), así que se prueba la función directamente.
  const { bdSinEsperar, aplicarMigraciones } = await import("./cliente");
  const { verificarEsquema, esEsquemaIncompleto } = await import("./esquema-listo");
  const db = bdSinEsperar();
  await assert.rejects(
    () => verificarEsquema(db),
    (e) => esEsquemaIncompleto(e) && e.paso === "migrar" && /pnpm db:migrar/.test(e.message),
  );
  await aplicarMigraciones();
  await verificarEsquema(db); // no lanza
});

test("al compilar (next build) no consulta la base de datos", async () => {
  const { verificarEsquema } = await import("./esquema-listo");
  const sinBase = { execute: () => Promise.reject(new Error("no debe consultar la base al compilar")) } as never;
  const antes = process.env.NEXT_PHASE;
  process.env.NEXT_PHASE = "phase-production-build";
  try {
    // Aunque la base no esté (o no tenga el esquema), el build no se cae.
    await verificarEsquema(sinBase);
  } finally {
    if (antes === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = antes;
  }
});
