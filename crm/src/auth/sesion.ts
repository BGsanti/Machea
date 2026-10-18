import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { migracionesListas } from "@/db/cliente";
import { auth } from "./servidor";

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  await migracionesListas();
  const sesion = await auth().api.getSession({ headers: await headers() });
  if (!sesion) return null;
  const u = sesion.user as typeof sesion.user & { rol?: string | null };
  return { id: u.id, nombre: u.name, email: u.email, rol: u.rol ?? "usuario" };
});

/** Usuario de la sesión; si no hay sesión, redirige al inicio de sesión. */
export async function requerirUsuario(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");
  return usuario;
}

export async function requerirAdmin(): Promise<Usuario> {
  const usuario = await requerirUsuario();
  if (usuario.rol !== "admin") throw new Error("Solo un administrador puede hacer esto.");
  return usuario;
}
