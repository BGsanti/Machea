import { and, asc, eq, sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import type { Usuario } from "@/db/contexto";
import { configuracion, notificaciones, usuarios } from "@/db/esquema";

/**
 * Reparto de leads nuevos entre los asesores de una empresa.
 *
 * «turnos»: el siguiente asesor activo que reciba leads, en orden, y vuelve a empezar (nadie recibe dos seguidos
 * mientras otros esperan). «manual»: el lead queda con el dueño y el gerente lo asigna. Si nadie está en el
 * reparto (por ejemplo, una empresa que aún no invitó asesores), el lead queda con el dueño.
 */

export interface Asignacion {
  usuarioId: string;
  nombre: string;
}

/** Quién está hoy en el reparto, en el orden de los turnos. */
export async function enElReparto(empresaId: string): Promise<{ id: string; nombre: string }[]> {
  const db = await bd();
  return db
    .select({ id: usuarios.id, nombre: usuarios.name })
    .from(usuarios)
    .where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.activo, true), eq(usuarios.recibeLeads, true)))
    .orderBy(asc(usuarios.createdAt), asc(usuarios.id));
}

/**
 * El asesor que le toca al próximo lead, o null si el lead debe quedar con el dueño. Anota el turno de forma
 * atómica: dos leads que entran a la vez no reciben el mismo turno.
 */
export async function elegirAsesor(empresaId: string): Promise<Asignacion | null> {
  const db = await bd();
  for (let intento = 0; intento < 4; intento++) {
    const [conf] = await db
      .select({ reparto: configuracion.reparto, ultimo: configuracion.repartoUltimoId })
      .from(configuracion)
      .where(eq(configuracion.empresaId, empresaId));
    if (!conf || conf.reparto !== "turnos") return null;
    const rota = await enElReparto(empresaId);
    if (rota.length === 0) return null;
    const posicion = rota.findIndex((u) => u.id === conf.ultimo);
    const elegido = rota[(posicion + 1) % rota.length]!;
    const hecho = await db
      .update(configuracion)
      .set({ repartoUltimoId: elegido.id })
      .where(and(eq(configuracion.empresaId, empresaId), sql`${configuracion.repartoUltimoId} is not distinct from ${conf.ultimo}`))
      .returning({ id: configuracion.empresaId });
    if (hecho.length) return { usuarioId: elegido.id, nombre: elegido.nombre };
  }
  return null;
}

/** El usuario con que corren los procesos del sistema (entrada de leads): el dueño de la empresa. */
const delSistema = new Map<string, Usuario>();

export async function usuarioSistema(empresaId: string): Promise<Usuario> {
  const guardado = delSistema.get(empresaId);
  if (guardado) return guardado;
  const db = await bd();
  const [dueno] = await db
    .select({ id: usuarios.id, nombre: usuarios.name, email: usuarios.email })
    .from(usuarios)
    .where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.rol, "admin")))
    .orderBy(asc(usuarios.createdAt))
    .limit(1);
  if (!dueno) throw new Error("La empresa no tiene un dueño.");
  const u: Usuario = { id: dueno.id, nombre: dueno.nombre, email: dueno.email, rol: "admin", empresaId };
  delSistema.set(empresaId, u);
  return u;
}

/** Avisa a una persona del equipo (campana del panel). Nunca lanza: un aviso fallido no debe perder el lead. */
export async function avisar(usuarioId: string, titulo: string, cuerpo: string | null, enlace: string): Promise<void> {
  try {
    const db = await bd();
    await db.insert(notificaciones).values({ usuarioId, titulo, cuerpo, enlace });
  } catch (e) {
    console.error("[crm] aviso:", e);
  }
}
