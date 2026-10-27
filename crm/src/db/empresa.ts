import { eq, getTableColumns, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { ErrorPermiso, esObjetoPersonal, puede, soloVeLoSuyo, type Permiso } from "@/auth/permisos";
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

/**
 * Si quien consulta es un asesor, su id: solo ve y edita los registros donde es el propietario. Con otro rol (o dentro
 * de un proceso del sistema, como la entrada de leads, que corre con `conEmpresa` sin una persona) es null: ve todo.
 */
export async function soloDe(): Promise<string | null> {
  const fijada = contextoActual();
  const usuario = fijada ? fijada.usuario : await usuarioActual();
  return usuario && soloVeLoSuyo(usuario.rol) ? usuario.id : null;
}

/** Condición `propietario_id = <asesor>` para un objeto personal cuando quien consulta es un asesor; si no, undefined. */
export async function deLoSuyo(objeto: string, tabla: PgTable): Promise<SQL | undefined> {
  if (!esObjetoPersonal(objeto)) return undefined;
  const col = (getTableColumns(tabla) as Record<string, PgColumn>).propietarioId;
  if (!col) return undefined;
  const id = await soloDe();
  return id ? eq(col, id) : undefined;
}

/**
 * Lanza si quien actúa no tiene el permiso. Dentro de un proceso del sistema (entrada de leads, scripts: `conEmpresa`
 * sin una persona) no hay a quién exigírselo y pasa.
 */
export async function exigirPermiso(permiso: Permiso): Promise<void> {
  const fijada = contextoActual();
  const usuario = fijada ? fijada.usuario : await usuarioActual();
  if (!usuario) {
    if (fijada) return;
    throw new Error("No hay una sesión activa.");
  }
  if (!puede(usuario.rol, permiso)) throw new ErrorPermiso();
}
