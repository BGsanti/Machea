import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { invitaciones, usuarios } from "@/db/esquema";
import { obtenerConfiguracion } from "./consultas";

// Consultas del equipo. Aquí no va "use server": estas funciones no se pueden llamar desde el navegador.

export interface MiembroEquipo {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  recibeLeads: boolean;
  telefono: string | null;
  ultimoAcceso: Date | null;
  creadoEn: Date;
  /** Leads que tiene a su cargo y siguen abiertos. */
  abiertos: number;
  /** De esos, los que nadie ha contactado todavía. */
  sinContactar: number;
  /** De esos, los que pasaron el tiempo de respuesta de la empresa sin que nadie los contacte. */
  atrasados: number;
  /** Tareas pendientes que vencen hoy o ya vencieron. */
  tareasVencidas: number;
}

/** El equipo de la empresa con la carga de cada persona. */
export async function equipoConCarga(): Promise<MiembroEquipo[]> {
  const db = await bd();
  const empresaId = await empresaActual();
  const sla = (await obtenerConfiguracion()).slaMinutos;
  const gente = await db
    .select()
    .from(usuarios)
    .where(eq(usuarios.empresaId, empresaId))
    .orderBy(asc(usuarios.name));
  const leads = await db.execute<{ propietario: string | null; abiertos: string; sin_contactar: string; atrasados: string }>(sql`
    select propietario_id as propietario,
      count(*) filter (where not convertido and estado <> 'no_calificado') as abiertos,
      count(*) filter (where not convertido and estado = 'nuevo') as sin_contactar,
      count(*) filter (where not convertido and estado = 'nuevo'
        and coalesce(asignado_en, creado_en) < now() - make_interval(mins => (${sla})::int)) as atrasados
    from crm.candidatos
    where empresa_id = ${empresaId}
    group by propietario_id`);
  const tareas = await db.execute<{ propietario: string | null; vencidas: string }>(sql`
    select propietario_id as propietario, count(*) as vencidas
    from crm.tareas
    where empresa_id = ${empresaId} and estado <> 'completada' and fecha_vencimiento <= current_date
    group by propietario_id`);
  const porLead = new Map(leads.rows.map((r) => [r.propietario, r]));
  const porTarea = new Map(tareas.rows.map((r) => [r.propietario, Number(r.vencidas)]));
  return gente.map((u) => {
    const l = porLead.get(u.id);
    return {
      id: u.id,
      nombre: u.name,
      email: u.email,
      rol: u.rol,
      activo: u.activo,
      recibeLeads: u.recibeLeads,
      telefono: u.telefono,
      ultimoAcceso: u.ultimoAcceso,
      creadoEn: u.createdAt,
      abiertos: Number(l?.abiertos ?? 0),
      sinContactar: Number(l?.sin_contactar ?? 0),
      atrasados: Number(l?.atrasados ?? 0),
      tareasVencidas: porTarea.get(u.id) ?? 0,
    };
  });
}

export interface InvitacionPendiente {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  expira: Date;
  creadaEn: Date;
}

/** Invitaciones que nadie ha aceptado y siguen vigentes. */
export async function invitacionesPendientes(): Promise<InvitacionPendiente[]> {
  const db = await bd();
  return db
    .select({ id: invitaciones.id, nombre: invitaciones.nombre, correo: invitaciones.correo, rol: invitaciones.rol, expira: invitaciones.expira, creadaEn: invitaciones.creadaEn })
    .from(invitaciones)
    .where(and(eq(invitaciones.empresaId, await empresaActual()), isNull(invitaciones.usadaEn), gt(invitaciones.expira, new Date())))
    .orderBy(desc(invitaciones.creadaEn));
}

/** Los asesores y demás personas activas a quienes se puede asignar un lead (para los menús de «Asignar a»). */
export async function personasAsignables(): Promise<{ id: string; nombre: string; rol: string }[]> {
  const db = await bd();
  return db
    .select({ id: usuarios.id, nombre: usuarios.name, rol: usuarios.rol })
    .from(usuarios)
    .where(and(eq(usuarios.empresaId, await empresaActual()), eq(usuarios.activo, true)))
    .orderBy(asc(usuarios.name));
}
