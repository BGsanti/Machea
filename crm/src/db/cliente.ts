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
  migrar: () => Promise<void>;
}

// En producción las migraciones las aplica una persona antes del despliegue (ver
// design/crm/PUESTA_EN_MARCHA.md) y el rol de la app no puede crear tablas: allí va
// CRM_MIGRAR_AL_ARRANCAR=false. En desarrollo se aplican solas al arrancar.
const migrarAlArrancar = process.env.CRM_MIGRAR_AL_ARRANCAR !== "false";

const carpetaMigraciones = path.join(process.cwd(), "drizzle");

// PGlite solo admite un proceso por carpeta de datos, y en desarrollo Next recarga
// módulos: se guarda una única instancia en globalThis.
const global = globalThis as unknown as { __reaBd?: Estado };

function crear(): Estado {
  const url = process.env.DATABASE_URL;
  if (url) {
    // En Vercel cada instancia tiene su pool: pocas conexiones por instancia para no agotar las del pooler de
    // la base (Supabase: usar el de transacciones, puerto 6543; node-postgres no usa sentencias preparadas).
    const pool = new Pool({ connectionString: url, max: Number(process.env.CRM_DB_MAX_CONEXIONES) || 5 });
    const db = drizzlePg(pool, { schema: esquema, casing: "snake_case" });
    const migrar = () => migrarPg(db, { migrationsFolder: carpetaMigraciones });
    return { db, migrar, migraciones: migrarAlArrancar ? migrar() : Promise.resolve() };
  }
  // Falla cerrado: en Vercel no hay disco para PGlite y los datos se perderían.
  if (process.env.VERCEL) throw new Error("En Vercel el CRM exige DATABASE_URL.");
  const carpetaDatos = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(carpetaDatos, { recursive: true });
  const cliente = new PGlite(carpetaDatos);
  const db = drizzlePglite(cliente, { schema: esquema, casing: "snake_case" });
  // Ambos drivers exponen la misma API de consultas de Drizzle para PostgreSQL.
  const migrar = () => migrarPglite(db, { migrationsFolder: carpetaMigraciones });
  return {
    db: db as unknown as BaseDatos,
    migrar,
    migraciones: migrarAlArrancar ? migrar() : Promise.resolve(),
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

/** Aplica las migraciones pendientes aunque CRM_MIGRAR_AL_ARRANCAR=false (lo usa `pnpm db:migrar`). */
export async function aplicarMigraciones(): Promise<void> {
  const e = estado();
  await e.migraciones;
  await e.migrar();
}
