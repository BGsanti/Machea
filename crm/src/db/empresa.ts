import { eq, getTableColumns, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { usuarioActual } from "@/auth/sesion";
import { contextoActual } from "./contexto";

export { conEmpresa } from "./contexto";

/**
 * Empresa de la consulta en curso. Cada lectura y escritura del CRM se limita a ella.
 *
 * Primero se mira la fijada con `conEmpresa`; si no hay, la del usuario de la sesión. Sin ninguna
 * de las dos se lanza un error: nunca se consulta sin empresa.
 */
export async function empresaActual(): Promise<string> {
  const fijada = contextoActual();
  if (fijada) return fijada.empresaId;
  const usuario = await usuarioActual();
  if (usuario) return usuario.empresaId;
  throw new Error("No hay una empresa activa para esta consulta.");
}

/** Condición `empresa_id = <empresa actual>` para una tabla con columna `empresaId`. */
export async function deEmpresa(tabla: PgTable): Promise<SQL> {
  const col = (getTableColumns(tabla) as Record<string, PgColumn>).empresaId;
  if (!col) throw new Error("La tabla no tiene empresaId.");
  return eq(col, await empresaActual());
}
