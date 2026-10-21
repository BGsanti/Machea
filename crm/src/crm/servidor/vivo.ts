"use server";

import { and, eq, gt, inArray } from "drizzle-orm";
import { requerirUsuario } from "@/auth/sesion";
import { modoAuth } from "@/auth/servidor";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { bandejaLeads, leadsMachea } from "@/db/esquema";
import { procesarBandeja } from "./ingesta";

export interface NovedadLead {
  clave: string;
  tipo: "nuevo" | "caliente";
  nombre: string;
  detalle: string | null;
  candidatoId: string | null;
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Lo que entró de Machea desde `desdeMs`: leads nuevos y llamadas de Manuela con un lead caliente. Lo usa el aviso
 * en vivo del panel: procesa la bandeja (con el login de Machea) y cuenta solo lo procesado después de esa hora.
 * Nunca lanza: si algo falla devuelve una lista vacía y el aviso lo intenta de nuevo.
 */
export async function novedadesDeLeads(desdeMs: number): Promise<{ ahoraMs: number; novedades: NovedadLead[] }> {
  const usuario = await requerirUsuario();
  const ahoraMs = Date.now();
  try {
    if (modoAuth() === "machea") await procesarBandeja(usuario, 10);
    const db = await bd();
    const empresaId = await empresaActual();
    const filas = await db
      .select()
      .from(bandejaLeads)
      .where(and(eq(bandejaLeads.empresaId, empresaId), gt(bandejaLeads.procesadoEn, new Date(desdeMs)), inArray(bandejaLeads.origen, ["consulta", "solicitud", "resultado"])))
      .limit(20);
    const novedades: NovedadLead[] = [];
    for (const f of filas) {
      const d = f.datos ?? {};
      const caliente = f.origen === "resultado" && String(d.temperatura_lead ?? "").toLowerCase() === "caliente";
      if (f.origen === "resultado" && !caliente) continue;
      const digitos = texto(d.telefono_digitos);
      const [enlace] = digitos
        ? await db
            .select({ candidatoId: leadsMachea.candidatoId })
            .from(leadsMachea)
            .where(and(eq(leadsMachea.empresaId, empresaId), eq(leadsMachea.telefonoDigitos, digitos)))
        : [];
      novedades.push({
        clave: `${f.origen}:${f.origenId}`,
        tipo: caliente ? "caliente" : "nuevo",
        nombre: [texto(d.nombre), texto(d.apellido)].filter(Boolean).join(" ") || "Un interesado",
        detalle: texto(d.nombre_proyecto),
        candidatoId: enlace?.candidatoId ?? null,
      });
    }
    return { ahoraMs, novedades };
  } catch (e) {
    console.error("[crm] avisos en vivo:", e);
    return { ahoraMs: desdeMs, novedades: [] };
  }
}
