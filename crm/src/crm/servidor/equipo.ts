"use server";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { urlMachea } from "@/auth/machea";
import { puedeCambiarRol, ROLES_INVITABLES, rolDe, type Rol } from "@/auth/permisos";
import { modoAuth } from "@/auth/servidor";
import { requerirPermiso } from "@/auth/sesion";
import { bd } from "@/db/cliente";
import { candidatos, configuracion, eventos, invitaciones, tareas, usuarios } from "@/db/esquema";
import type { EstadoAccion } from "./acciones";
import { elegirAsesor } from "./reparto";

function error(e: unknown): EstadoAccion {
  return { ok: false, mensaje: e instanceof Error ? e.message : "Ocurrió un error inesperado." };
}

const VIGENCIA_INVITACION_DIAS = 7;

/** La dirección pública del CRM (con /crm en Machea): de ahí sale el enlace que se le manda a quien se invita. */
async function direccionPublica(): Promise<string> {
  const base = process.env.CRM_BASE_PATH ?? "";
  if (modoAuth() === "machea") return `${urlMachea()}${base}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${base}`;
}

const esquemaInvitacion = z.object({
  nombre: z.string().trim().min(2, "Escriba el nombre.").max(80),
  correo: z.email("Escriba un correo válido.").max(254),
  rol: z.enum(ROLES_INVITABLES as [Rol, ...Rol[]]),
});

export interface ResultadoInvitacion extends EstadoAccion {
  /** El enlace de la invitación. Solo se ve ahora: en la base queda únicamente su huella. */
  enlace?: string;
}

/** Crea una invitación y devuelve su enlace (se manda por WhatsApp o correo). Si esa persona ya tenía una pendiente, la reemplaza. */
export async function invitarMiembro(formData: FormData): Promise<ResultadoInvitacion> {
  try {
    const quien = await requerirPermiso("equipo");
    const datos = esquemaInvitacion.safeParse(Object.fromEntries(formData));
    if (!datos.success) return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Revise los datos." };
    if (!puedeCambiarRol(quien.rol, "asesor", datos.data.rol)) return { ok: false, mensaje: "Solo el dueño puede invitar a un gerente." };
    const correo = datos.data.correo.toLowerCase();
    const db = await bd();
    const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, correo));
    if (existe) return { ok: false, mensaje: "Esa persona ya tiene acceso. Si es de otra empresa, debe usar otro correo." };

    await db.delete(invitaciones).where(and(eq(invitaciones.empresaId, quien.empresaId), eq(invitaciones.correo, correo), isNull(invitaciones.usadaEn)));
    const token = randomBytes(24).toString("base64url");
    await db.insert(invitaciones).values({
      empresaId: quien.empresaId,
      hash: createHash("sha256").update(token).digest("hex"),
      nombre: datos.data.nombre,
      correo,
      rol: datos.data.rol,
      invitadaPorId: quien.id,
      expira: new Date(Date.now() + VIGENCIA_INVITACION_DIAS * 24 * 3_600_000),
    });
    revalidatePath("/", "layout");
    return { ok: true, mensaje: `Invitación lista para ${datos.data.nombre}.`, enlace: `${await direccionPublica()}/unirse/${token}` };
  } catch (e) {
    return error(e);
  }
}

export async function revocarInvitacion(id: string): Promise<EstadoAccion> {
  try {
    const quien = await requerirPermiso("equipo");
    const db = await bd();
    await db.delete(invitaciones).where(and(eq(invitaciones.id, id), eq(invitaciones.empresaId, quien.empresaId), isNull(invitaciones.usadaEn)));
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Invitación cancelada." };
  } catch (e) {
    return error(e);
  }
}

/** La persona de la empresa sobre la que se actúa; nunca una de otra empresa. */
async function miembroDe(empresaId: string, id: string) {
  const db = await bd();
  const [m] = await db.select().from(usuarios).where(and(eq(usuarios.id, id), eq(usuarios.empresaId, empresaId)));
  return m ?? null;
}

export async function cambiarRol(usuarioId: string, rol: string): Promise<EstadoAccion> {
  try {
    const quien = await requerirPermiso("equipo");
    const nuevo = rolDe(rol);
    if (!ROLES_INVITABLES.includes(nuevo)) return { ok: false, mensaje: "Rol no válido." };
    if (usuarioId === quien.id) return { ok: false, mensaje: "No puede cambiar su propio rol." };
    const m = await miembroDe(quien.empresaId, usuarioId);
    if (!m) return { ok: false, mensaje: "Esa persona ya no está en el equipo." };
    if (!puedeCambiarRol(quien.rol, m.rol, nuevo)) return { ok: false, mensaje: "No tiene permiso para cambiar ese rol." };
    const db = await bd();
    await db
      .update(usuarios)
      // Un gerente o alguien de solo lectura deja de recibir leads; un asesor, por defecto, sí.
      .set({ rol: nuevo, recibeLeads: nuevo === "asesor" ? m.recibeLeads || m.rol !== "asesor" : false, updatedAt: new Date() })
      .where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, quien.empresaId)));
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Rol actualizado." };
  } catch (e) {
    return error(e);
  }
}

export async function alternarRecibeLeads(usuarioId: string, recibe: boolean): Promise<EstadoAccion> {
  try {
    const quien = await requerirPermiso("repartir");
    const m = await miembroDe(quien.empresaId, usuarioId);
    if (!m) return { ok: false, mensaje: "Esa persona ya no está en el equipo." };
    if (recibe && (!m.activo || rolDe(m.rol) === "lectura")) return { ok: false, mensaje: "Esa persona no puede recibir leads." };
    const db = await bd();
    await db.update(usuarios).set({ recibeLeads: recibe, updatedAt: new Date() }).where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, quien.empresaId)));
    revalidatePath("/", "layout");
    return { ok: true, mensaje: recibe ? `${m.name} entra al reparto de leads.` : `${m.name} sale del reparto de leads.` };
  } catch (e) {
    return error(e);
  }
}

export async function guardarTelefonoMiembro(usuarioId: string, telefono: string): Promise<EstadoAccion> {
  try {
    const quien = await requerirPermiso("equipo");
    const limpio = telefono.replace(/[^\d+]/g, "").slice(0, 16);
    const db = await bd();
    await db.update(usuarios).set({ telefono: limpio || null, updatedAt: new Date() }).where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, quien.empresaId)));
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Teléfono guardado." };
  } catch (e) {
    return error(e);
  }
}

/**
 * Pasa los leads abiertos de una persona (y sus tareas y citas pendientes) a otra, o los reparte por turnos entre los
 * asesores que reciben leads. Devuelve cuántos leads movió.
 */
async function pasarLeads(empresaId: string, deId: string, destino: string): Promise<number> {
  const db = await bd();
  const abiertos = await db
    .select({ id: candidatos.id })
    .from(candidatos)
    .where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.propietarioId, deId), eq(candidatos.convertido, false), ne(candidatos.estado, "no_calificado")));
  let movidos = 0;
  const ahora = new Date();
  for (const lead of abiertos) {
    const nuevoDueno = destino === "turnos" ? (await elegirAsesor(empresaId))?.usuarioId : destino;
    if (!nuevoDueno) continue;
    await db.update(candidatos).set({ propietarioId: nuevoDueno, asignadoEn: ahora, actualizadoEn: ahora }).where(and(eq(candidatos.id, lead.id), eq(candidatos.empresaId, empresaId)));
    await db
      .update(tareas)
      .set({ propietarioId: nuevoDueno })
      .where(and(eq(tareas.empresaId, empresaId), eq(tareas.quienId, lead.id), eq(tareas.propietarioId, deId), ne(tareas.estado, "completada")));
    await db
      .update(eventos)
      .set({ propietarioId: nuevoDueno })
      .where(and(eq(eventos.empresaId, empresaId), eq(eventos.quienId, lead.id), eq(eventos.propietarioId, deId), sql`${eventos.fin} > now()`));
    movidos++;
  }
  return movidos;
}

/**
 * Desactiva o reactiva a una persona del equipo. Al desactivar a alguien con leads abiertos hay que decir a quién pasan
 * (un usuario o «turnos»); sus registros se conservan, solo deja de poder entrar y de recibir leads.
 */
export async function alternarActivo(usuarioId: string, activo: boolean, destino?: string): Promise<EstadoAccion> {
  try {
    const quien = await requerirPermiso("equipo");
    if (usuarioId === quien.id) return { ok: false, mensaje: "No puede desactivarse a sí mismo." };
    const m = await miembroDe(quien.empresaId, usuarioId);
    if (!m) return { ok: false, mensaje: "Esa persona ya no está en el equipo." };
    if (rolDe(m.rol) === "admin") return { ok: false, mensaje: "El dueño de la cuenta no se puede desactivar." };
    if (rolDe(m.rol) === "gerente" && rolDe(quien.rol) !== "admin") return { ok: false, mensaje: "Solo el dueño puede desactivar a un gerente." };
    const db = await bd();
    if (!activo && destino && destino !== "turnos") {
      const d = await miembroDe(quien.empresaId, destino);
      if (!d?.activo || d.id === usuarioId) return { ok: false, mensaje: "Elija a quién pasan sus leads." };
    }
    await db
      .update(usuarios)
      .set({ activo, recibeLeads: activo ? m.recibeLeads : false, updatedAt: new Date() })
      .where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, quien.empresaId)));
    let movidos = 0;
    if (!activo && destino) movidos = await pasarLeads(quien.empresaId, usuarioId, destino);
    revalidatePath("/", "layout");
    return {
      ok: true,
      mensaje: activo ? `${m.name} puede entrar de nuevo.` : `${m.name} ya no puede entrar.${movidos ? ` ${movidos} lead${movidos === 1 ? "" : "s"} pasaron a otra persona.` : ""}`,
    };
  } catch (e) {
    return error(e);
  }
}

/** Pasa todos los leads abiertos de una persona a otra o por turnos (sin desactivarla): vacaciones, incapacidad, cambio de zona. */
export async function reasignarLeadsDe(deId: string, destino: string): Promise<EstadoAccion> {
  try {
    const quien = await requerirPermiso("repartir");
    if (!(await miembroDe(quien.empresaId, deId))) return { ok: false, mensaje: "Esa persona ya no está en el equipo." };
    if (destino !== "turnos") {
      const d = await miembroDe(quien.empresaId, destino);
      if (!d?.activo || d.id === deId) return { ok: false, mensaje: "Elija a quién pasan sus leads." };
    }
    const n = await pasarLeads(quien.empresaId, deId, destino);
    revalidatePath("/", "layout");
    return { ok: true, mensaje: n ? `${n} lead${n === 1 ? "" : "s"} reasignado${n === 1 ? "" : "s"}.` : "No había leads abiertos para pasar." };
  } catch (e) {
    return error(e);
  }
}

const esquemaReparto = z.object({
  reparto: z.enum(["turnos", "manual"]),
  slaMinutos: z.coerce.number().int().min(1, "El tiempo de respuesta es de al menos 1 minuto.").max(1440),
});

export async function guardarReparto(formData: FormData): Promise<EstadoAccion> {
  try {
    const quien = await requerirPermiso("repartir");
    const datos = esquemaReparto.safeParse(Object.fromEntries(formData));
    if (!datos.success) return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Revise los datos." };
    const db = await bd();
    await db.update(configuracion).set({ ...datos.data, actualizadoEn: new Date() }).where(eq(configuracion.empresaId, quien.empresaId));
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Reparto guardado." };
  } catch (e) {
    return error(e);
  }
}
