import { sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresas, usuarios } from "@/db/esquema";
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
}

/** URL pública de Machea, para mandar al login. Sin barra al final. */
export function urlMachea(): string {
  return (process.env.MACHEA_URL ?? "https://www.machea.co").replace(/\/+$/, "");
}

export async function buscarSesionMachea(hash: string): Promise<CuentaMachea | null> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const db = await bd();
  const r = await db.execute<{ id: string; usuario: string; correo: string; estado: string }>(sql`
    select c.id::text as id, c.usuario, c.correo, c.estado
    from acceso.sesiones s
    join acceso.cuentas c on c.id = s.cuenta_id
    where s.hash = ${hash} and s.expira > now()
    limit 1
  `);
  return r.rows[0] ?? null;
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
  // inicializarOrganizacion no repite lo que ya existe.
  await inicializarOrganizacion(cuenta.id, cuenta.id, cuenta.usuario);
  conocidas.add(cuenta.id);
}
