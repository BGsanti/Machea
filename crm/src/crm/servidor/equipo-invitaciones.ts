import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresas, invitaciones } from "@/db/esquema";

// La invitación que abre quien recibe el enlace (todavía sin sesión). No lleva "use server": no se llama desde el navegador.

export interface InvitacionAbierta {
  id: string;
  empresaId: string;
  empresa: string;
  nombre: string;
  correo: string;
  rol: string;
}

export function huellaDeInvitacion(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** La invitación vigente de ese enlace, o null si no existe, venció o ya se usó. */
export async function invitacionPorToken(token: string): Promise<InvitacionAbierta | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const db = await bd();
  const [fila] = await db
    .select({
      id: invitaciones.id,
      empresaId: invitaciones.empresaId,
      empresa: empresas.nombre,
      nombre: invitaciones.nombre,
      correo: invitaciones.correo,
      rol: invitaciones.rol,
    })
    .from(invitaciones)
    .innerJoin(empresas, eq(empresas.id, invitaciones.empresaId))
    .where(and(eq(invitaciones.hash, huellaDeInvitacion(token)), isNull(invitaciones.usadaEn), gt(invitaciones.expira, new Date())))
    .limit(1);
  return fila ?? null;
}
