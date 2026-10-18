"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requerirUsuario } from "@/auth/sesion";
import { bd } from "@/db/cliente";
import {
  candidatos,
  configuracion,
  contactos,
  destinatariosCorreo,
  entradasListaPrecios,
  eventos,
  lineasFactura,
  listasPrecios,
  miembrosCampana,
  oportunidades,
  productos,
  productosOportunidad,
  tareas,
} from "@/db/esquema";
import { hoyMas } from "../fechas";
import type { EstadoAccion } from "./acciones";
import * as repo from "./repositorio";


function error(e: unknown): EstadoAccion {
  return { ok: false, mensaje: e instanceof Error ? e.message : "Ocurrió un error inesperado." };
}

// ---------------------------------------------------------------------------
// Conversión de candidatos
// ---------------------------------------------------------------------------

export interface ResultadoConversion extends EstadoAccion {
  cuentaId?: string;
  contactoId?: string;
  oportunidadId?: string;
}

export async function convertirCandidato(candidatoId: string, formData: FormData): Promise<ResultadoConversion> {
  const usuario = await requerirUsuario();
  const db = await bd();
  const [c] = await db.select().from(candidatos).where(eq(candidatos.id, candidatoId)).limit(1);
  if (!c) return { ok: false, mensaje: "El candidato ya no existe." };
  if (c.convertido) return { ok: false, mensaje: "Este candidato ya se convirtió." };

  const texto = (n: string) => {
    const v = formData.get(n);
    return typeof v === "string" ? v.trim() : "";
  };
  try {
    const propietarioId = c.propietarioId ?? usuario.id;
    let cuentaId = texto("modoCuenta") === "existente" ? texto("cuentaId") : "";
    if (texto("modoCuenta") === "existente" && !cuentaId) return { ok: false, mensaje: "Elija la cuenta existente." };
    if (!cuentaId) {
      cuentaId = await repo.crear(
        "cuentas",
        {
          nombre: texto("cuentaNombre") || c.compania,
          sitioWeb: c.sitioWeb,
          telefono: c.telefono,
          facturacionPais: c.pais,
          facturacionCalle: c.calle,
          facturacionCiudad: c.ciudad,
          facturacionEstado: c.estadoProvincia,
          facturacionCodigoPostal: c.codigoPostal,
          tipo: "prospecto",
          propietarioId,
        },
        usuario.id,
      );
    }
    const contactoId = await repo.crear(
      "contactos",
      {
        tratamiento: c.tratamiento,
        nombre: c.nombre,
        apellidos: c.apellidos,
        cuentaId,
        cargo: c.cargo,
        telefono: c.telefono,
        email: c.email,
        descripcion: c.descripcion,
        correoPais: c.pais,
        correoCalle: c.calle,
        correoCiudad: c.ciudad,
        correoEstado: c.estadoProvincia,
        correoCodigoPostal: c.codigoPostal,
        propietarioId,
      },
      usuario.id,
    );
    let oportunidadId: string | undefined;
    if (texto("crearOportunidad") === "on") {
      oportunidadId = await repo.crear(
        "oportunidades",
        {
          nombre: texto("oportunidadNombre") || `${c.compania} - Nueva oportunidad`,
          cuentaId,
          fechaCierre: hoyMas(30),
          etapa: "calificar",
          categoriaPrevision: "pipeline",
          origen: c.origen,
          propietarioId,
        },
        usuario.id,
      );
    }
    await repo.actualizar(
      "candidatos",
      candidatoId,
      {
        convertido: true,
        convertidoEn: new Date(),
        estado: "calificado",
        cuentaConvertidaId: cuentaId,
        contactoConvertidoId: contactoId,
        oportunidadConvertidaId: oportunidadId ?? null,
      },
      usuario.id,
    );
    // Las actividades del candidato pasan al nuevo contacto.
    await db.update(tareas).set({ quienObjeto: "contactos", quienId: contactoId }).where(eq(tareas.quienId, candidatoId));
    await db.update(eventos).set({ quienObjeto: "contactos", quienId: contactoId }).where(eq(eventos.quienId, candidatoId));
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Candidato convertido.", cuentaId, contactoId, oportunidadId };
  } catch (e) {
    return error(e);
  }
}

// ---------------------------------------------------------------------------
// Productos de oportunidad y facturas
// ---------------------------------------------------------------------------

/** Precio del producto en la lista de la oportunidad, o en la lista estándar si no tiene. */
export async function precioProducto(productoId: string, oportunidadId?: string): Promise<number | null> {
  await requerirUsuario();
  const db = await bd();
  let listaId: string | null = null;
  if (oportunidadId) {
    const [o] = await db.select({ lista: oportunidades.listaPreciosId }).from(oportunidades).where(eq(oportunidades.id, oportunidadId));
    listaId = o?.lista ?? null;
  }
  if (!listaId) {
    const [estandar] = await db.select({ id: listasPrecios.id }).from(listasPrecios).where(eq(listasPrecios.estandar, true)).limit(1);
    listaId = estandar?.id ?? null;
  }
  if (!listaId) return null;
  const [entrada] = await db
    .select({ precio: entradasListaPrecios.precio })
    .from(entradasListaPrecios)
    .where(and(eq(entradasListaPrecios.productoId, productoId), eq(entradasListaPrecios.listaPreciosId, listaId)))
    .limit(1);
  return entrada?.precio ?? null;
}

export async function generarFactura(oportunidadId: string): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  const db = await bd();
  const [o] = await db.select().from(oportunidades).where(eq(oportunidades.id, oportunidadId)).limit(1);
  if (!o) return { ok: false, mensaje: "La oportunidad ya no existe." };
  const lineas = await db
    .select({
      nombre: productos.nombre,
      cantidad: productosOportunidad.cantidad,
      precio: productosOportunidad.precioUnitario,
      descuento: productosOportunidad.descuento,
      descripcion: productosOportunidad.descripcion,
    })
    .from(productosOportunidad)
    .innerJoin(productos, eq(productos.id, productosOportunidad.productoId))
    .where(eq(productosOportunidad.oportunidadId, oportunidadId))
    .orderBy(asc(productosOportunidad.creadoEn));

  const items = lineas.length
    ? lineas.map((l) => {
        const total = Math.round(l.cantidad * l.precio * (1 - (l.descuento ?? 0) / 100) * 100) / 100;
        return { descripcion: l.descripcion ? `${l.nombre} — ${l.descripcion}` : l.nombre, cantidad: l.cantidad, precioUnitario: l.precio, total };
      })
    : o.importe
      ? [{ descripcion: o.nombre, cantidad: 1, precioUnitario: o.importe, total: o.importe }]
      : [];
  if (items.length === 0) return { ok: false, mensaje: "Agregue productos o un importe a la oportunidad antes de facturar." };

  const [config] = await db.select().from(configuracion).limit(1);
  const tasa = config?.impuestoPorcentaje ?? 19;
  const subtotal = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  const impuestos = Math.round(subtotal * tasa) / 100;
  try {
    const facturaId = await repo.crear(
      "facturas",
      {
        oportunidadId,
        cuentaId: o.cuentaId,
        fechaEmision: hoyMas(0),
        fechaVencimiento: hoyMas(30),
        estado: "borrador",
        subtotal,
        impuestos,
        total: subtotal + impuestos,
        propietarioId: o.propietarioId ?? usuario.id,
      },
      usuario.id,
    );
    await db.insert(lineasFactura).values(items.map((i) => ({ ...i, facturaId })));
    revalidatePath("/", "layout");
    return { ok: true, id: facturaId, mensaje: "Factura generada." };
  } catch (e) {
    return error(e);
  }
}

// ---------------------------------------------------------------------------
// Campañas y correos de lista
// ---------------------------------------------------------------------------

export async function agregarACampana(objeto: string, ids: string[], campanaId: string): Promise<EstadoAccion> {
  await requerirUsuario();
  if (!["contactos", "candidatos"].includes(objeto)) return { ok: false, mensaje: "Solo contactos y candidatos." };
  if (!campanaId) return { ok: false, mensaje: "Elija una campaña." };
  const db = await bd();
  const filas = await db
    .insert(miembrosCampana)
    .values(ids.map((registroId) => ({ campanaId, objeto, registroId })))
    .onConflictDoNothing()
    .returning();
  revalidatePath("/", "layout");
  return { ok: true, mensaje: `${filas.length} miembro${filas.length === 1 ? "" : "s"} agregado${filas.length === 1 ? "" : "s"} a la campaña.` };
}

export async function quitarDeCampana(miembroId: string): Promise<EstadoAccion> {
  await requerirUsuario();
  const db = await bd();
  await db.delete(miembrosCampana).where(eq(miembrosCampana.id, miembroId));
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Miembro quitado." };
}

export async function enviarCorreoLista(
  objeto: string,
  ids: string[],
  asunto: string,
  cuerpo: string,
): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  if (!["contactos", "candidatos"].includes(objeto)) return { ok: false, mensaje: "Solo contactos y candidatos." };
  if (!asunto.trim() || !cuerpo.trim()) return { ok: false, mensaje: "Escriba el asunto y el mensaje." };
  const db = await bd();
  const tabla = objeto === "contactos" ? contactos : candidatos;
  const filas = await db
    .select({ id: tabla.id, email: tabla.email })
    .from(tabla)
    .where(inArray(tabla.id, ids.slice(0, 500)));
  const conCorreo = filas.filter((f) => f.email);
  if (conCorreo.length === 0) return { ok: false, mensaje: "Ninguno de los registros seleccionados tiene correo electrónico." };
  try {
    const correoId = await repo.crear(
      "correos-lista",
      {
        asunto: asunto.trim(),
        cuerpo: cuerpo.trim(),
        objetoDestinatarios: objeto === "contactos" ? "Contactos" : "Candidatos",
        destinatarios: conCorreo.length,
        estado: "registrado",
        enviadoEn: new Date(),
      },
      usuario.id,
    );
    await db.insert(destinatariosCorreo).values(conCorreo.map((f) => ({ correoId, objeto, registroId: f.id, email: f.email })));
    // Queda constancia en la actividad de cada destinatario.
    await db.insert(tareas).values(
      conCorreo.map((f) => ({
        asunto: `Correo: ${asunto.trim()}`,
        tipo: "correo",
        estado: "completada",
        completadaEn: new Date(),
        fechaVencimiento: hoyMas(0),
        comentarios: cuerpo.trim().slice(0, 2000),
        quienObjeto: objeto,
        quienId: f.id,
        propietarioId: usuario.id,
        creadoPorId: usuario.id,
      })),
    );
    revalidatePath("/", "layout");
    const omitidos = filas.length - conCorreo.length;
    return {
      ok: true,
      id: correoId,
      mensaje: `Correo registrado para ${conCorreo.length} destinatario${conCorreo.length === 1 ? "" : "s"}${omitidos ? ` (${omitidos} sin correo)` : ""}.`,
    };
  } catch (e) {
    return error(e);
  }
}

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

export async function cambiarEstadoArticulos(ids: string[], accion: "publicar" | "archivar" | "nueva_version"): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  try {
    for (const id of ids) {
      const actual = await repo.obtener("articulos", id);
      if (!actual) continue;
      const datos =
        accion === "publicar"
          ? { estado: "publicado", publicadoEn: new Date() }
          : accion === "archivar"
            ? { estado: "archivado" }
            : { estado: "borrador", version: Number(actual.version ?? 1) + 1, publicadoEn: null };
      await repo.actualizar("articulos", id, datos, usuario.id);
    }
    revalidatePath("/", "layout");
    const textos = { publicar: "publicado", archivar: "archivado", nueva_version: "en nueva versión de borrador" };
    return { ok: true, mensaje: `${ids.length === 1 ? "Artículo" : `${ids.length} artículos`} ${textos[accion]}.` };
  } catch (e) {
    return error(e);
  }
}

// ---------------------------------------------------------------------------
// Tareas rápidas (barra de utilidades)
// ---------------------------------------------------------------------------

export async function crearTareaRapida(asunto: string, fecha: string): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  if (!asunto.trim()) return { ok: false, mensaje: "Escriba la tarea." };
  try {
    await repo.crear(
      "tareas",
      { asunto: asunto.trim().slice(0, 255), fechaVencimiento: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null },
      usuario.id,
    );
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Tarea creada." };
  } catch (e) {
    return error(e);
  }
}

export async function completarTarea(id: string, completada: boolean): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  try {
    await repo.actualizar("tareas", id, { estado: completada ? "completada" : "no_iniciada" }, usuario.id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return error(e);
  }
}
