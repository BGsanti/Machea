"use server";

import { and, eq, gt, inArray } from "drizzle-orm";
import { requerirUsuario } from "@/auth/sesion";
import { modoAuth } from "@/auth/servidor";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { bandejaLeads, candidatos, enviosFormulario, formularios, leadsMachea } from "@/db/esquema";
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
      .where(and(eq(bandejaLeads.empresaId, empresaId), gt(bandejaLeads.procesadoEn, new Date(desdeMs)), inArray(bandejaLeads.origen, ["consulta", "solicitud", "resultado", "demo"])))
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
        detalle: texto(d.nombre_proyecto) ?? texto(d.empresa),
        candidatoId: enlace?.candidatoId ?? null,
      });
    }
    // Lo que se llenó en los formularios de la empresa (constructor de formularios).
    const envios = await db
      .select({ id: enviosFormulario.id, candidatoId: enviosFormulario.candidatoId, formulario: formularios.nombre, nombre: candidatos.nombre, apellidos: candidatos.apellidos, interes: candidatos.interes })
      .from(enviosFormulario)
      .innerJoin(formularios, eq(formularios.id, enviosFormulario.formularioId))
      .leftJoin(candidatos, eq(candidatos.id, enviosFormulario.candidatoId))
      .where(and(eq(enviosFormulario.empresaId, empresaId), gt(enviosFormulario.creadoEn, new Date(desdeMs))))
      .limit(10);
    for (const e of envios) {
      novedades.push({
        clave: `envio:${e.id}`,
        tipo: "nuevo",
        nombre: [e.nombre, e.apellidos].filter((x) => x && x !== "(sin apellido)").join(" ") || "Un interesado",
        detalle: e.interes ?? e.formulario,
        candidatoId: e.candidatoId,
      });
    }
    return { ahoraMs, novedades };
  } catch (e) {
    console.error("[crm] avisos en vivo:", e);
    return { ahoraMs: desdeMs, novedades: [] };
  }
}
