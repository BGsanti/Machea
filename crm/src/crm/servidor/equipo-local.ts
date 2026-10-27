"use server";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { rolDe } from "@/auth/permisos";
import { crearUsuarioLocal, modoAuth } from "@/auth/servidor";
import { bd } from "@/db/cliente";
import { invitaciones, usuarios } from "@/db/esquema";
import { invitacionPorToken } from "./equipo-invitaciones";

const esquema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(128),
});

/**
 * Modo local (desarrollo, Better Auth): la persona invitada elige su contraseña con el enlace. Con el login de Machea
 * esto lo hace el backend (POST /api/cuentas/unirse), no el CRM.
 */
export async function aceptarInvitacionLocal(token: string, password: string): Promise<{ ok: boolean; mensaje?: string }> {
  if (modoAuth() !== "local") return { ok: false, mensaje: "Con el login de Machea, la invitación se acepta en Machea." };
  const datos = esquema.safeParse({ password });
  if (!datos.success) return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Revise la contraseña." };
  const inv = await invitacionPorToken(token);
  if (!inv) return { ok: false, mensaje: "La invitación venció o ya se usó. Pídele una nueva a quien te invitó." };
  const db = await bd();
  const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, inv.correo));
  if (existe) return { ok: false, mensaje: "Ese correo ya tiene acceso." };
  // Se gasta primero: si dos pestañas aceptan a la vez, solo una pasa.
  const gastada = await db
    .update(invitaciones)
    .set({ usadaEn: new Date() })
    .where(and(eq(invitaciones.id, inv.id), isNull(invitaciones.usadaEn)))
    .returning({ id: invitaciones.id });
  if (gastada.length === 0) return { ok: false, mensaje: "La invitación ya se usó." };
  const rol = rolDe(inv.rol);
  const id = await crearUsuarioLocal({ nombre: inv.nombre, email: inv.correo, password: datos.data.password }, rol, inv.empresaId);
  await db.update(usuarios).set({ recibeLeads: rol === "asesor", emailVerified: true }).where(eq(usuarios.id, id));
  await db.update(invitaciones).set({ cuentaId: id }).where(eq(invitaciones.id, inv.id));
  return { ok: true };
}

