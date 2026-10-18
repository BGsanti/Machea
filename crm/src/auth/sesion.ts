import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { migracionesListas } from "@/db/cliente";
import { contextoActual, type Usuario } from "@/db/contexto";
import { asegurarEmpresaMachea, buscarSesionMachea, COOKIE_MACHEA, urlMachea, type CuentaMachea } from "./machea";
import { auth, modoAuth } from "./servidor";

export type { Usuario } from "@/db/contexto";

/**
 * Usuario de la petición. Es el único punto de entrada a la sesión: páginas, layouts y server
 * actions pasan por aquí (o por requerirUsuario/requerirAdmin).
 *
 * - AUTH_MODO=machea: la sesión es la del login de Machea (cookie `machea_sesion`), que se busca
 *   por su SHA-256 en `acceso.sesiones`. Solo entran cuentas aprobadas.
 * - AUTH_MODO=local (por defecto): Better Auth, para desarrollo y para usar el CRM por su cuenta.
 */
export const usuarioActual = cache(async (): Promise<Usuario | null> => {
  const fijado = contextoActual()?.usuario;
  if (fijado) return fijado;
  await migracionesListas();
  return modoAuth() === "machea" ? usuarioMachea() : usuarioLocal();
});

/** La cuenta de Machea de la cookie, esté o no aprobada. */
const cuentaDeLaCookie = cache(async (): Promise<CuentaMachea | null> => {
  const token = (await cookies()).get(COOKIE_MACHEA)?.value;
  if (!token) return null;
  return buscarSesionMachea(createHash("sha256").update(token).digest("hex"));
});

async function usuarioMachea(): Promise<Usuario | null> {
  const cuenta = await cuentaDeLaCookie();
  if (!cuenta || cuenta.estado !== "aprobada") return null;
  await asegurarEmpresaMachea(cuenta);
  // Una cuenta = una empresa: su único usuario es administrador de su propio CRM.
  return { id: cuenta.id, nombre: cuenta.usuario, email: cuenta.correo, rol: "admin", empresaId: cuenta.id };
}

async function usuarioLocal(): Promise<Usuario | null> {
  const sesion = await auth().api.getSession({ headers: await headers() });
  if (!sesion) return null;
  const u = sesion.user as typeof sesion.user & { rol?: string | null; empresaId?: string | null };
  if (!u.empresaId) return null;
  return { id: u.id, nombre: u.name, email: u.email, rol: u.rol ?? "usuario", empresaId: u.empresaId };
}

/** Usuario de la sesión; si no hay sesión, redirige al inicio de sesión. */
export async function requerirUsuario(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (usuario) return usuario;
  if (modoAuth() === "machea") {
    // Con sesión pero sin aprobar: /inicio/ le dice "en revisión". Mandarla a /acceso/ sería un bucle, porque
    // /acceso/ devuelve a quien ya tiene sesión a la página de la que venía.
    if (await cuentaDeLaCookie()) redirect(`${urlMachea()}/inicio/`);
    redirect(`${urlMachea()}/acceso/?volver=${encodeURIComponent("/crm/")}`);
  }
  redirect("/login");
}

export async function requerirAdmin(): Promise<Usuario> {
  const usuario = await requerirUsuario();
  if (usuario.rol !== "admin") throw new Error("Solo un administrador puede hacer esto.");
  return usuario;
}
