"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirPermiso } from "@/auth/sesion";
import { bd } from "@/db/cliente";
import { formularios } from "@/db/esquema";
import type { EstadoAccion } from "../servidor/acciones";
import { obtenerConfiguracion } from "../servidor/consultas";
import { configDe, obtenerFormulario, slugUnico } from "./datos";
import { plantillaFormulario, type PlantillaId } from "./plantillas";
import { esquemaConfig, pendientesParaPublicar, type EstadoFormulario } from "./tipos";

export interface ResultadoFormulario extends EstadoAccion {
  id?: string;
  /** Lo que falta para poder publicarlo, si no está listo. */
  pendientes?: string[];
}

const mensajeDeError = (e: unknown) => (e instanceof Error ? e.message : "Ocurrió un error inesperado.");

/** Crea un formulario de borrador a partir de una plantilla y devuelve su id para abrir el editor. */
export async function crearFormulario(plantilla: PlantillaId): Promise<ResultadoFormulario> {
  try {
    const usuario = await requerirPermiso("formularios");
    const config = await obtenerConfiguracion();
    const p = plantillaFormulario(plantilla, config.nombreEmpresa);
    const db = await bd();
    const slug = await slugUnico(p.nombre);
    const [fila] = await db
      .insert(formularios)
      .values({ empresaId: usuario.empresaId, nombre: p.nombre, slug, estado: "borrador", config: p.config, propietarioId: usuario.id, creadoPorId: usuario.id })
      .returning({ id: formularios.id });
    revalidatePath("/formularios");
    return { ok: true, id: fila!.id, mensaje: "Formulario creado." };
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e) };
  }
}

/** Guarda el nombre y la configuración. Si ya está activo, también tiene que quedar completo. */
export async function guardarFormulario(id: string, nombre: string, configNueva: unknown): Promise<ResultadoFormulario> {
  try {
    const usuario = await requerirPermiso("formularios");
    const existente = await obtenerFormulario(id);
    if (!existente) return { ok: false, mensaje: "El formulario ya no existe." };
    const nombreLimpio = String(nombre ?? "").trim().slice(0, 120);
    if (!nombreLimpio) return { ok: false, mensaje: "Escriba el nombre del formulario." };
    const r = esquemaConfig.safeParse(configNueva);
    if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Revise los datos del formulario." };
    const pendientes = pendientesParaPublicar(r.data);
    if (existente.estado === "activo" && pendientes.length) return { ok: false, mensaje: pendientes[0], pendientes };
    const db = await bd();
    await db
      .update(formularios)
      .set({ nombre: nombreLimpio, config: r.data, actualizadoEn: new Date() })
      .where(and(eq(formularios.id, id), eq(formularios.empresaId, usuario.empresaId)));
    revalidatePath("/formularios");
    revalidatePath(`/formularios/${id}`);
    return { ok: true, mensaje: "Cambios guardados.", pendientes };
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e) };
  }
}

/** Publica, pausa o vuelve a borrador. Para publicar el formulario tiene que estar completo. */
export async function cambiarEstadoFormulario(id: string, estado: EstadoFormulario): Promise<ResultadoFormulario> {
  try {
    const usuario = await requerirPermiso("formularios");
    if (!["borrador", "activo", "pausado"].includes(estado)) return { ok: false, mensaje: "Estado no válido." };
    const existente = await obtenerFormulario(id);
    if (!existente) return { ok: false, mensaje: "El formulario ya no existe." };
    if (estado === "activo") {
      const config = configDe(existente.config);
      if (!config) return { ok: false, mensaje: "El formulario no es válido. Revise las preguntas." };
      const pendientes = pendientesParaPublicar(config);
      if (pendientes.length) return { ok: false, mensaje: pendientes[0], pendientes };
    }
    const db = await bd();
    await db
      .update(formularios)
      .set({ estado, actualizadoEn: new Date() })
      .where(and(eq(formularios.id, id), eq(formularios.empresaId, usuario.empresaId)));
    revalidatePath("/formularios");
    revalidatePath(`/formularios/${id}`);
    return { ok: true, mensaje: estado === "activo" ? "Formulario publicado." : estado === "pausado" ? "Formulario pausado: ya no recibe respuestas." : "Vuelve a ser un borrador." };
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e) };
  }
}

export async function eliminarFormulario(id: string): Promise<ResultadoFormulario> {
  try {
    const usuario = await requerirPermiso("formularios");
    const db = await bd();
    await db.delete(formularios).where(and(eq(formularios.id, id), eq(formularios.empresaId, usuario.empresaId)));
    revalidatePath("/formularios");
    return { ok: true, mensaje: "Formulario eliminado. Los leads que llegaron por él se quedan en su CRM." };
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e) };
  }
}
