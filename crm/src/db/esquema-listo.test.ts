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
