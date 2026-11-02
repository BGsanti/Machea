import { and, asc, count, eq, gte, isNull } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { bandejaLeads } from "@/db/esquema";

/**
 * Leads atascados: los que entraron a la bandeja (crm.bandeja_leads) y fallaron al procesarse MAX_INTENTOS veces.
 * Desde ahí `procesarBandeja` ya no los toma, y sin esto ninguna pantalla los muestra. Solo los ve el dueño de la
 * cuenta (spec docs/specs/2026-11_leads-atascados del repo de coordinación).
 */

/** Veces que la bandeja reintenta sola una fila antes de rendirse. */
export const MAX_INTENTOS = 5;

export interface LeadAtascado {
  id: number;
  nombre: string;
  telefono: string | null;
  origen: string;
  llegoEn: Date;
  motivo: string;
}

/** Un lead está atascado si nunca se procesó y ya agotó sus intentos. */
const atascadoDeLaEmpresa = (empresaId: string) =>
  and(eq(bandejaLeads.empresaId, empresaId), isNull(bandejaLeads.procesadoEn), gte(bandejaLeads.intentos, MAX_INTENTOS));

const ORIGENES: Record<string, string> = {
  consulta: "Formulario de Machea",
  solicitud: "Solicitud de llamada",
  resultado: "Resultado de la llamada de Manuela",
  demo: "Demo pedida",
  prospecto: "Prospecto",
  llamada_captacion: "Llamada de Camila",
  cita: "Cita de Camila",
};

export function etiquetaOrigen(origen: string): string {
  return ORIGENES[origen] ?? "Machea";
}

/**
 * El motivo del fallo en palabras de una persona. El error técnico (`error` de la bandeja) nunca se muestra: puede
 * traer nombres de tablas o fragmentos de datos.
 */
export function motivoEnEspanol(error: string | null): string {
  const e = (error ?? "").toLowerCase();
  if (!e.trim()) return `Se intentó ${MAX_INTENTOS} veces y no terminó de guardarse.`;
  if (/no trae tel[eé]fono/.test(e)) return "El lead llegó sin número de teléfono y el CRM no puede crearlo sin él.";
  if (/origen desconocido/.test(e)) return "Machea envió este lead con un tipo de registro que el CRM no reconoce.";
  if (/timeout|timed out|econn|connection|conexi[oó]n|terminat/.test(e)) return "La base de datos no respondió a tiempo.";
  return "No se pudo guardar por un problema interno.";
}

function texto(v: unknown, max = 120): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
}

/** Nombre y teléfono para reconocer el lead; cada origen los guarda con claves distintas. */
export function contactoDe(datos: Record<string, unknown> | null): { nombre: string; telefono: string | null } {
  const d = datos ?? {};
  const persona = [texto(d.nombre, 80), texto(d.apellido, 80)].filter(Boolean).join(" ");
  const nombre = persona || texto(d.contacto_nombre) || texto(d.empresa, 200) || "Sin nombre";
  return { nombre, telefono: texto(d.telefono, 20) ?? texto(d.telefono_digitos, 20) };
}

export async function contarAtascados(empresaId: string): Promise<number> {
  const db = await bd();
  const [r] = await db.select({ n: count() }).from(bandejaLeads).where(atascadoDeLaEmpresa(empresaId));
  return r?.n ?? 0;
}

/** Los más viejos primero: son los que más llevan perdidos. */
export async function listarAtascados(empresaId: string, limite = 200): Promise<LeadAtascado[]> {
  const db = await bd();
  const filas = await db
    .select({ id: bandejaLeads.id, origen: bandejaLeads.origen, datos: bandejaLeads.datos, creadoEn: bandejaLeads.creadoEn, error: bandejaLeads.error })
    .from(bandejaLeads)
    .where(atascadoDeLaEmpresa(empresaId))
    .orderBy(asc(bandejaLeads.creadoEn), asc(bandejaLeads.id))
    .limit(limite);
  return filas.map((f) => ({
    id: f.id,
    ...contactoDe(f.datos),
    origen: etiquetaOrigen(f.origen),
    llegoEn: f.creadoEn,
    motivo: motivoEnEspanol(f.error),
  }));
}
