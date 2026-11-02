"use server";

import { revalidatePath } from "next/cache";
import { requerirAdmin } from "@/auth/sesion";
import type { EstadoAccion } from "./acciones";
import { reintentarAtascado, type ResultadoReintento } from "./ingesta";

const MENSAJES: Record<ResultadoReintento, EstadoAccion> = {
  hecho: { ok: true, mensaje: "Listo: el lead ya está en el CRM." },
  fallo: { ok: false, mensaje: "Volvió a fallar. Sigue en la lista con el motivo actualizado; si se repite, avise al equipo de Machea." },
  ocupado: { ok: false, mensaje: "Este lead ya se está procesando. Espere unos segundos y recargue." },
  ya_entro: { ok: true, mensaje: "Este lead ya entró al CRM." },
  no_atascado: { ok: false, mensaje: "Este lead ya no está atascado." },
};

/** Reintenta un lead atascado. Solo el dueño de la cuenta; el servidor lo comprueba, no solo la interfaz. */
export async function reintentarLeadAtascado(id: number): Promise<EstadoAccion> {
  const usuario = await requerirAdmin();
  if (!Number.isSafeInteger(id) || id <= 0) return MENSAJES.no_atascado;
  try {
    const resultado = await reintentarAtascado(usuario, id);
    revalidatePath("/", "layout");
    return MENSAJES[resultado];
  } catch (e) {
    console.error("[crm] reintentar lead atascado:", e);
    return { ok: false, mensaje: "No se pudo reintentar. Pruebe de nuevo en un momento." };
  }
}
