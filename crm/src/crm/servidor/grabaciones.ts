import { and, eq } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { bandejaLeads } from "@/db/esquema";

/** Un turno de la conversación: quién habla (a = agente, u = persona), qué dijo y en qué segundo. */
export interface TurnoLlamada {
  r: "a" | "u";
  t: string;
  s?: number;
}

export interface DetalleLlamada {
  /** El identificador que pide la ruta del audio. */
  llamadaId: string;
  duracionMs: number | null;
  /** Dirección del audio en Dapta: no se manda al navegador, solo se usa para decidir qué mostrar. */
  reproducible: boolean;
  /** Enlace a la página de la llamada en Dapta (pide iniciar sesión allá), cuando el audio no es reproducible. */
  enlaceDapta: string | null;
  turnos: TurnoLlamada[];
}

/** Hosts desde los que el CRM acepta servir audio. Con «Public call link» encendido, Dapta usa files.dapta.ai. */
export function hostsDeAudio(): string[] {
  return (process.env.CRM_GRABACIONES_HOSTS ?? "files.dapta.ai")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** ¿Es una dirección de la que se puede servir audio? https, y un host de la lista (http solo en desarrollo local). */
export function urlDeAudioValida(valor: unknown): URL | null {
  if (typeof valor !== "string" || valor.length > 700) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  const local = process.env.NODE_ENV !== "production" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  const host = url.hostname.toLowerCase();
  return hostsDeAudio().includes(host) ? url : null;
}

function turnos(valor: unknown): TurnoLlamada[] {
  if (!Array.isArray(valor)) return [];
  const salida: TurnoLlamada[] = [];
  for (const t of valor.slice(0, 400)) {
    if (!t || typeof t !== "object") continue;
    const { r, t: texto, s } = t as Record<string, unknown>;
    if ((r === "a" || r === "u") && typeof texto === "string" && texto.trim()) {
      salida.push({ r, t: texto.slice(0, 800), ...(typeof s === "number" ? { s } : {}) });
    }
  }
  return salida;
}

/**
 * La conversación y el audio de una llamada de la empresa. Salen de la bandeja de leads (que guarda lo que mandó
 * la base de Machea), siempre filtrados por la empresa de quien mira: nadie ve la llamada de otra empresa.
 */
export async function detalleDeLlamada(llamadaId: string, origenes: string[] = ["resultado", "llamada_captacion"]): Promise<DetalleLlamada | null> {
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(llamadaId)) return null;
  const db = await bd();
  const empresaId = await empresaActual();
  const filas = await db
    .select({ origen: bandejaLeads.origen, datos: bandejaLeads.datos })
    .from(bandejaLeads)
    .where(and(eq(bandejaLeads.empresaId, empresaId), eq(bandejaLeads.origenId, llamadaId)));
  const fila = filas.find((f) => origenes.includes(f.origen));
  if (!fila) return null;
  const d = fila.datos ?? {};
  const url = typeof d.grabacion_url === "string" ? d.grabacion_url : null;
  const duracion = Number(d.duracion_ms);
  return {
    llamadaId,
    duracionMs: Number.isFinite(duracion) && duracion > 0 ? duracion : null,
    reproducible: urlDeAudioValida(url) !== null,
    enlaceDapta: url && !urlDeAudioValida(url) && /^https:\/\/([a-z0-9-]+\.)*dapta\.ai\//i.test(url) ? url : null,
    turnos: turnos(d.transcripcion),
  };
}

/** La dirección real del audio, solo para el servidor (la ruta /api/grabacion/<id> la sirve). */
export async function urlDelAudio(llamadaId: string): Promise<URL | null> {
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(llamadaId)) return null;
  const db = await bd();
  const empresaId = await empresaActual();
  const filas = await db
    .select({ origen: bandejaLeads.origen, datos: bandejaLeads.datos })
    .from(bandejaLeads)
    .where(and(eq(bandejaLeads.empresaId, empresaId), eq(bandejaLeads.origenId, llamadaId)));
  const fila = filas.find((f) => f.origen === "resultado" || f.origen === "llamada_captacion");
  return urlDeAudioValida(fila?.datos?.grabacion_url);
}
