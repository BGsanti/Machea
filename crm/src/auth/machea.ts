import { and, eq, sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresas, invitaciones, usuarios } from "@/db/esquema";
import { inicializarOrganizacion } from "@/crm/servidor/inicializar";

/**
 * Puente con el login de Machea (backend/api/acceso.py, esquema `acceso`).
 *
 * El backend guarda en `acceso.sesiones` solo el SHA-256 del token de la cookie. El CRM lo lee en la
 * misma base de datos, con un rol que solo puede ver estas columnas (nunca `clave_hash`). Si algún día
 * el CRM y Machea quedan en bases distintas, basta con cambiar esta función por una llamada a
 * `GET /api/sesion`.
 */

export const COOKIE_MACHEA = "machea_sesion";

export interface CuentaMachea {
  id: string;
  usuario: string;
  correo: string;
  estado: string;
  /** null = la cuenta es una empresa (su dueña). Con valor = es una persona del equipo de esa empresa (invitada). */
  empresaId?: string | null;
}

/** URL pública de Machea, para mandar al login. Sin barra al final. */
export function urlMachea(): string {
  return (process.env.MACHEA_URL ?? "https://www.machea.co").replace(/\/+$/, "");
}

// La columna acceso.cuentas.empresa_id llega con la migración de equipo (20261027120000_equipo.sql). Mientras no esté, el
// CRM sigue funcionando como siempre (una cuenta = una empresa): nunca se rompe el inicio de sesión por una migración tarde.
let hayColumnaEmpresa: boolean | null = null;
// Si no estaba, se vuelve a probar cada minuto: aplicar el SQL de equipo no exige reiniciar el CRM.
let volverAProbarEn = 0;

/** Para las pruebas: vuelve a mirar ya si la migración de equipo está aplicada (en producción, cada minuto). */
export function olvidarSondaDeEquipo(): void {
  hayColumnaEmpresa = null;
  volverAProbarEn = 0;
}

const sinColumna = (e: unknown) => {
  const c = e as { code?: string; cause?: { code?: string } } | null;
  return c?.code === "42703" || c?.cause?.code === "42703";
};

export async function buscarSesionMachea(hash: string): Promise<CuentaMachea | null> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const db = await bd();
  type Fila = { id: string; usuario: string; correo: string; estado: string; empresa_id?: string | null };
  if (hayColumnaEmpresa !== false || Date.now() > volverAProbarEn) {
    try {
      const r = await db.execute<Fila>(sql`
        select c.id::text as id, c.usuario, c.correo, c.estado, c.empresa_id::text as empresa_id
        from acceso.sesiones s
        join acceso.cuentas c on c.id = s.cuenta_id
        where s.hash = ${hash} and s.expira > now()
        limit 1
      `);
      hayColumnaEmpresa = true;
      const f = r.rows[0];
      return f ? { id: f.id, usuario: f.usuario, correo: f.correo, estado: f.estado, empresaId: f.empresa_id ?? null } : null;
    } catch (e) {
      if (!sinColumna(e)) throw e;
      hayColumnaEmpresa = false;
      volverAProbarEn = Date.now() + 60_000;
    }
  }
  const r = await db.execute<Fila>(sql`
    select c.id::text as id, c.usuario, c.correo, c.estado
    from acceso.sesiones s
    join acceso.cuentas c on c.id = s.cuenta_id
    where s.hash = ${hash} and s.expira > now()
    limit 1
  `);
  const f = r.rows[0];
  return f ? { id: f.id, usuario: f.usuario, correo: f.correo, estado: f.estado, empresaId: null } : null;
}

/**
 * El tipo con que se aprobó la cuenta (constructora o inmobiliaria). Si el rol del CRM aún no puede leerlo (falta
 * el permiso de la migración de puesta en marcha), se usa el perfil de por defecto: nunca rompe la entrada.
 */
async function perfilDeLaCuenta(cuentaId: string): Promise<string | undefined> {
  try {
    const db = await bd();
    const r = await db.execute<{ tipo: string | null }>(sql`select tipo from acceso.cuentas where id = ${cuentaId}::uuid`);
    const tipo = r.rows[0]?.tipo;
    return tipo === "constructora" || tipo === "inmobiliaria" ? tipo : undefined;
  } catch {
    return undefined;
  }
}

// Empresas que ya existen en el CRM, para no escribir en cada petición.
const conocidas = new Set<string>();

/** La primera vez que entra una cuenta aprobada se crean su empresa, su usuario y sus datos iniciales. */
export async function asegurarEmpresaMachea(cuenta: CuentaMachea): Promise<void> {
  if (conocidas.has(cuenta.id)) return;
  const db = await bd();
  await db.insert(empresas).values({ id: cuenta.id, nombre: cuenta.usuario }).onConflictDoNothing();
  await db
    .insert(usuarios)
    .values({ id: cuenta.id, empresaId: cuenta.id, name: cuenta.usuario, email: cuenta.correo, emailVerified: true, rol: "admin" })
    .onConflictDoNothing();
  // Siempre, no solo si la empresa es nueva: /admin puede crearla antes (al asignarle sus fuentes de leads), y
  // inicializarOrganizacion no repite lo que ya existe. El perfil sale del tipo con que se aprobó la cuenta.
  await inicializarOrganizacion(cuenta.id, cuenta.id, cuenta.usuario, await perfilDeLaCuenta(cuenta.id));
  conocidas.add(cuenta.id);
}

export interface MiembroMachea {
  id: string;
  name: string;
  rol: string;
  activo: boolean;
}

// Para no escribir `ultimo_acceso` en cada petición.
const ultimoRegistro = new Map<string, number>();

/**
 * La persona del equipo que entró con una cuenta invitada. La primera vez se crea su usuario del CRM con el rol y el
 * nombre de la invitación que aceptó; una cuenta con `empresa_id` pero sin invitación no entra.
 */
export async function asegurarMiembroMachea(cuenta: CuentaMachea): Promise<MiembroMachea | null> {
  if (!cuenta.empresaId) return null;
  const db = await bd();
  let [fila] = await db
    .select({ id: usuarios.id, name: usuarios.name, rol: usuarios.rol, activo: usuarios.activo, empresaId: usuarios.empresaId })
    .from(usuarios)
    .where(eq(usuarios.id, cuenta.id))
    .limit(1);
  if (!fila) {
    const [inv] = await db
      .select()
      .from(invitaciones)
      .where(and(eq(invitaciones.cuentaId, cuenta.id), eq(invitaciones.empresaId, cuenta.empresaId)))
      .limit(1);
    if (!inv) return null;
    await db
      .insert(usuarios)
      .values({ id: cuenta.id, empresaId: cuenta.empresaId, name: inv.nombre, email: cuenta.correo, emailVerified: true, rol: inv.rol, recibeLeads: inv.rol === "asesor" })
      .onConflictDoNothing();
    [fila] = await db
      .select({ id: usuarios.id, name: usuarios.name, rol: usuarios.rol, activo: usuarios.activo, empresaId: usuarios.empresaId })
      .from(usuarios)
      .where(eq(usuarios.id, cuenta.id))
      .limit(1);
  }
  // Un usuario del CRM de otra empresa con ese id no debería existir; si pasara, no entra.
  if (!fila || fila.empresaId !== cuenta.empresaId) return null;
  const ahora = Date.now();
  if (fila.activo && ahora - (ultimoRegistro.get(cuenta.id) ?? 0) > 10 * 60_000) {
    ultimoRegistro.set(cuenta.id, ahora);
    await db.update(usuarios).set({ ultimoAcceso: new Date() }).where(eq(usuarios.id, cuenta.id));
  }
  return { id: fila.id, name: fila.name, rol: fila.rol, activo: fila.activo };
}
