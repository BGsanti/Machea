import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migrarPg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migrarPglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as esquema from "./esquema";

export type BaseDatos = NodePgDatabase<typeof esquema>;

interface Estado {
  db: BaseDatos;
  migraciones: Promise<void>;
}

const carpetaMigraciones = path.join(process.cwd(), "drizzle");

// PGlite solo admite un proceso por carpeta de datos, y en desarrollo Next recarga
// módulos: se guarda una única instancia en globalThis.
const global = globalThis as unknown as { __reaBd?: Estado };

function crear(): Estado {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    const db = drizzlePg(pool, { schema: esquema, casing: "snake_case" });
    return { db, migraciones: migrarPg(db, { migrationsFolder: carpetaMigraciones }) };
  }
  const carpetaDatos = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(carpetaDatos, { recursive: true });
  const cliente = new PGlite(carpetaDatos);
  const db = drizzlePglite(cliente, { schema: esquema, casing: "snake_case" });
  // Ambos drivers exponen la misma API de consultas de Drizzle para PostgreSQL.
  return {
    db: db as unknown as BaseDatos,
    migraciones: migrarPglite(db, { migrationsFolder: carpetaMigraciones }),
  };
}

function estado(): Estado {
  global.__reaBd ??= crear();
  return global.__reaBd;
}

/** Base de datos lista para consultar: espera a que terminen las migraciones. */
export async function bd(): Promise<BaseDatos> {
  const e = estado();
  await e.migraciones;
  return e.db;
}

/** Instancia sin esperar migraciones; solo para configurar librerías al arrancar. */
export function bdSinEsperar(): BaseDatos {
  return estado().db;
}

export async function migracionesListas(): Promise<void> {
  await estado().migraciones;
}
