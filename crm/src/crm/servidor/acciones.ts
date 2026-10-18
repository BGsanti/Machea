"use server";

import { revalidatePath } from "next/cache";
import { requerirUsuario } from "@/auth/sesion";
import { campoDe, obtenerObjeto } from "../objetos";
import type { DefObjeto } from "../tipos";
import { camposFormulario, convertirValor, validarCampos, validarFormulario } from "../validacion";
import * as repo from "./repositorio";

export interface EstadoAccion {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
  id?: string;
}

function defObjeto(objeto: string): DefObjeto {
  const def = obtenerObjeto(objeto);
  if (!def || objeto === "usuarios") throw new Error("Objeto no válido.");
  return def;
}

function mensajeError(e: unknown): EstadoAccion {
  if (e instanceof repo.ErrorValidacion) return { ok: false, mensaje: e.message, errores: e.errores };
  return { ok: false, mensaje: e instanceof Error ? e.message : "Ocurrió un error inesperado." };
}

export async function guardarRegistro(objeto: string, id: string | null, formData: FormData): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  const def = defObjeto(objeto);
  const resultado = validarFormulario(def, formData);
  if (!resultado.ok) return { ok: false, mensaje: "Revise los campos marcados.", errores: resultado.errores };
  try {
    const registroId = id ?? (await repo.crear(objeto, resultado.datos, usuario.id));
    if (id) await repo.actualizar(objeto, id, resultado.datos, usuario.id);
    revalidatePath("/", "layout");
    return { ok: true, id: registroId, mensaje: `${def.etiqueta} ${id ? "actualizado" : "creado"}.` };
  } catch (e) {
    return mensajeError(e);
  }
}

export async function eliminarRegistros(objeto: string, ids: string[]): Promise<EstadoAccion> {
  await requerirUsuario();
  const def = defObjeto(objeto);
  try {
    const n = await repo.eliminar(objeto, ids);
    revalidatePath("/", "layout");
    return { ok: true, mensaje: n === 1 ? `${def.etiqueta} eliminado.` : `${n} registros eliminados.` };
  } catch (e) {
    const texto = e instanceof Error && /foreign key|violates/i.test(e.message)
      ? "No se puede eliminar: otros registros dependen de este."
      : undefined;
    return texto ? { ok: false, mensaje: texto } : mensajeError(e);
  }
}

export async function cambiarPropietario(objeto: string, ids: string[], propietarioId: string): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  defObjeto(objeto);
  if (!propietarioId) return { ok: false, mensaje: "Elija un usuario." };
  try {
    for (const id of ids) await repo.actualizar(objeto, id, { propietarioId }, usuario.id);
    revalidatePath("/", "layout");
    return { ok: true, mensaje: `Propietario cambiado en ${ids.length} registro${ids.length === 1 ? "" : "s"}.` };
  } catch (e) {
    return mensajeError(e);
  }
}

/** Cambia un solo campo: lo usan la ruta de etapas, el Kanban y la edición rápida. */
export async function actualizarCampo(objeto: string, id: string, campo: string, valor: string): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  const def = defObjeto(objeto);
  const c = campoDe(def, campo);
  if (!c || c.soloLectura) return { ok: false, mensaje: "Ese campo no se puede modificar." };
  const r = convertirValor(c, () => valor, () => valor.split(","));
  if ("error" in r) return { ok: false, mensaje: `${c.etiqueta}: ${r.error}` };
  try {
    await repo.actualizar(objeto, id, r.valor, usuario.id);
    revalidatePath("/", "layout");
    return { ok: true, mensaje: `${c.etiqueta} actualizado.` };
  } catch (e) {
    return mensajeError(e);
  }
}

export async function buscarOpciones(objeto: string, q: string): Promise<repo.OpcionBusqueda[]> {
  await requerirUsuario();
  if (!obtenerObjeto(objeto)) return [];
  return repo.buscarParaCampo(objeto, q.slice(0, 100));
}

export interface ResultadoImportacion extends EstadoAccion {
  creados: number;
  fallidos: { fila: number; mensaje: string }[];
}

/** Importa filas ya asociadas a campos del objeto: [{ campo: valor }]. */
export async function importarRegistros(objeto: string, filas: Record<string, string>[]): Promise<ResultadoImportacion> {
  const usuario = await requerirUsuario();
  const def = defObjeto(objeto);
  const campos = camposFormulario(def).filter((c) => c.tipo !== "polimorfico");
  const fallidos: ResultadoImportacion["fallidos"] = [];
  let creados = 0;
  // En un CSV las búsquedas llegan por nombre ("Acme S.A.") y las listas por etiqueta ("Cliente").
  const esId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cacheBusqueda = new Map<string, string>();
  for (const fila of filas) {
    for (const c of campos) {
      const v = fila[c.nombre]?.trim();
      if (!v) continue;
      if (c.tipo === "lista") {
        const op = c.opciones?.find((o) => o.valor.toLowerCase() === v.toLowerCase() || o.etiqueta.toLowerCase() === v.toLowerCase());
        if (op) fila[c.nombre] = op.valor;
      }
      if (c.tipo === "busqueda" && c.objetoDestino && !esId.test(v)) {
        const clave = `${c.objetoDestino}:${v.toLowerCase()}`;
        if (!cacheBusqueda.has(clave)) {
          const opciones = await repo.buscarParaCampo(c.objetoDestino, v, 5);
          const exacta = opciones.find((o) => o.nombre.toLowerCase() === v.toLowerCase()) ?? opciones[0];
          cacheBusqueda.set(clave, exacta?.id ?? "");
        }
        fila[c.nombre] = cacheBusqueda.get(clave) ?? "";
      }
    }
  }
  for (const [i, fila] of filas.slice(0, 5000).entries()) {
    const r = validarCampos(
      campos,
      (n) => fila[n] ?? "",
      (n) => (fila[n] ?? "").split(/[;,]/).map((v) => v.trim()),
    );
    if (!r.ok) {
      fallidos.push({ fila: i + 2, mensaje: Object.entries(r.errores).map(([c, m]) => `${campoDe(def, c)?.etiqueta ?? c}: ${m}`).join("; ") });
      continue;
    }
    try {
      await repo.crear(objeto, r.datos, usuario.id);
      creados++;
    } catch (e) {
      fallidos.push({ fila: i + 2, mensaje: e instanceof Error ? e.message : "Error" });
    }
  }
  revalidatePath("/", "layout");
  return {
    ok: creados > 0 || fallidos.length === 0,
    creados,
    fallidos: fallidos.slice(0, 50),
    mensaje: `${creados} registros importados${fallidos.length ? `, ${fallidos.length} con errores` : ""}.`,
  };
}
