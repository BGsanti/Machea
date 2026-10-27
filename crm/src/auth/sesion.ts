import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { bd, migracionesListas } from "@/db/cliente";
import { contextoActual, type Usuario } from "@/db/contexto";
import { usuarios } from "@/db/esquema";
import { asegurarEmpresaMachea, asegurarMiembroMachea, buscarSesionMachea, COOKIE_MACHEA, urlMachea, type CuentaMachea } from "./machea";
import { ErrorPermiso, puede, rolDe, type Permiso } from "./permisos";
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
  // Una persona invitada al equipo: su empresa es la de quien la invitó y su rol sale de la invitación.
  if (cuenta.empresaId) {
    const miembro = await asegurarMiembroMachea(cuenta);
    if (!miembro?.activo) return null;
    return { id: cuenta.id, nombre: miembro.name, email: cuenta.correo, rol: rolDe(miembro.rol), empresaId: cuenta.empresaId };
  }
  await asegurarEmpresaMachea(cuenta);
  // La cuenta de la empresa es su dueña: administradora de su propio CRM.
  return { id: cuenta.id, nombre: cuenta.usuario, email: cuenta.correo, rol: "admin", empresaId: cuenta.id };
}

/** La cuenta de Machea tiene sesión y está aprobada, pero la persona del equipo fue desactivada. */
export const accesoDesactivado = cache(async (): Promise<boolean> => {
  if (modoAuth() !== "machea") return false;
  const cuenta = await cuentaDeLaCookie();
  return Boolean(cuenta && cuenta.estado === "aprobada" && cuenta.empresaId && !(await usuarioMachea()));
});

// «Última vez que entró» en el modo local: se anota como mucho cada 10 minutos por persona.
const ultimoAcceso = new Map<string, number>();

function marcarAcceso(id: string): void {
  const ahora = Date.now();
  if (ahora - (ultimoAcceso.get(id) ?? 0) < 10 * 60_000) return;
  ultimoAcceso.set(id, ahora);
  void bd().then((db) => db.update(usuarios).set({ ultimoAcceso: new Date() }).where(eq(usuarios.id, id))).catch(() => undefined);
}

async function usuarioLocal(): Promise<Usuario | null> {
  const sesion = await auth().api.getSession({ headers: await headers() });
  if (!sesion) return null;
  // El rol y si está activa se leen de la base en cada petición: un cambio del gerente rige de inmediato.
  const db = await bd();
  const [fila] = await db
    .select({ rol: usuarios.rol, activo: usuarios.activo, empresaId: usuarios.empresaId })
    .from(usuarios)
    .where(eq(usuarios.id, sesion.user.id))
    .limit(1);
  if (!fila?.empresaId || !fila.activo) return null;
  marcarAcceso(sesion.user.id);
  return { id: sesion.user.id, nombre: sesion.user.name, email: sesion.user.email, rol: rolDe(fila.rol), empresaId: fila.empresaId };
}

/** Usuario de la sesión; si no hay sesión, redirige al inicio de sesión. */
export async function requerirUsuario(): Promise<Usuario> {
  const usuario = await usuarioActual();
  if (usuario) return usuario;
  if (modoAuth() === "machea") {
    // Con sesión pero sin aprobar: /inicio/ le dice "en revisión". Mandarla a /acceso/ sería un bucle, porque
    // /acceso/ devuelve a quien ya tiene sesión a la página de la que venía.
    if (await accesoDesactivado()) redirect("/sin-acceso");
    if (await cuentaDeLaCookie()) redirect(`${urlMachea()}/inicio/`);
    redirect(`${urlMachea()}/acceso/?volver=${encodeURIComponent("/crm/")}`);
  }
  redirect("/login");
}

export async function requerirAdmin(): Promise<Usuario> {
  const usuario = await requerirUsuario();
  if (usuario.rol !== "admin") throw new Error("Solo el dueño de la cuenta puede hacer esto.");
  return usuario;
}

/** Usuario de la sesión con el permiso pedido (src/auth/permisos.ts); si no, lanza un error que la acción devuelve como mensaje. */
export async function requerirPermiso(permiso: Permiso): Promise<Usuario> {
  const usuario = await requerirUsuario();
  if (!puede(usuario.rol, permiso)) throw new ErrorPermiso();
  return usuario;
}


/** Para páginas: si la persona no tiene el permiso, vuelve al inicio en vez de mostrar un error. */
export async function requerirPagina(permiso: Permiso): Promise<Usuario> {
  const usuario = await requerirUsuario();
  if (!puede(usuario.rol, permiso)) redirect("/inicio");
  return usuario;
}
