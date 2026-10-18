"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth/servidor";
import { requerirAdmin, requerirUsuario } from "@/auth/sesion";
import { bd } from "@/db/cliente";
import {
  configuracion,
  flujos,
  informes,
  notificaciones,
  paneles,
  preferenciasUsuario,
  usuarios,
  type AccionFlujo,
  type CondicionFlujo,
  type FiltroInforme,
} from "@/db/esquema";
import { obtenerObjeto } from "../objetos";
import type { EstadoAccion } from "./acciones";
import { obtenerPreferencias } from "./consultas";
import { cargarDatosEjemplo } from "./datos-ejemplo";

function error(e: unknown): EstadoAccion {
  return { ok: false, mensaje: e instanceof Error ? e.message : "Ocurrió un error inesperado." };
}

// ---------------------------------------------------------------------------
// Notificaciones y preferencias
// ---------------------------------------------------------------------------

export async function marcarNotificacionesLeidas(): Promise<void> {
  const usuario = await requerirUsuario();
  const db = await bd();
  await db.update(notificaciones).set({ leida: true }).where(eq(notificaciones.usuarioId, usuario.id));
  revalidatePath("/", "layout");
}

export async function ocultarSugerencia(id: string): Promise<void> {
  const usuario = await requerirUsuario();
  const db = await bd();
  const actuales = await obtenerPreferencias(usuario.id);
  const lista = [...new Set([...actuales.sugerenciasOcultas, id])];
  await db
    .insert(preferenciasUsuario)
    .values({ usuarioId: usuario.id, sugerenciasOcultas: lista })
    .onConflictDoUpdate({ target: preferenciasUsuario.usuarioId, set: { sugerenciasOcultas: lista } });
  revalidatePath("/", "layout");
}

export async function restaurarSugerencias(): Promise<void> {
  const usuario = await requerirUsuario();
  const db = await bd();
  await db.update(preferenciasUsuario).set({ sugerenciasOcultas: [] }).where(eq(preferenciasUsuario.usuarioId, usuario.id));
  revalidatePath("/", "layout");
}

/** Guarda el orden y la visibilidad de las pestañas de una app para el usuario. */
export async function guardarNavegacion(app: string, pestanas: string[]): Promise<EstadoAccion> {
  const usuario = await requerirUsuario();
  const db = await bd();
  const actuales = await obtenerPreferencias(usuario.id);
  const navegacion = { ...actuales.navegacion, [app]: pestanas.slice(0, 30) };
  await db
    .insert(preferenciasUsuario)
    .values({ usuarioId: usuario.id, navegacion })
    .onConflictDoUpdate({ target: preferenciasUsuario.usuarioId, set: { navegacion } });
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Navegación guardada." };
}

// ---------------------------------------------------------------------------
// Configuración y usuarios
// ---------------------------------------------------------------------------

export async function activarMarketing(activar: boolean): Promise<EstadoAccion> {
  await requerirAdmin();
  const db = await bd();
  await db.update(configuracion).set({ marketingActivado: activar, actualizadoEn: new Date() }).where(eq(configuracion.id, 1));
  revalidatePath("/", "layout");
  return { ok: true, mensaje: activar ? "Herramientas de marketing activadas." : "Herramientas de marketing desactivadas." };
}

const esquemaConfig = z.object({
  nombreEmpresa: z.string().trim().min(1, "Escriba el nombre de la empresa.").max(120),
  moneda: z.enum(["COP", "USD", "EUR", "MXN"]),
  pais: z.string().trim().max(80).optional(),
  impuestoPorcentaje: z.coerce.number().min(0).max(100),
});

export async function guardarConfiguracion(formData: FormData): Promise<EstadoAccion> {
  try {
    await requerirAdmin();
    const datos = esquemaConfig.safeParse(Object.fromEntries(formData));
    if (!datos.success) return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Revise los datos." };
    const db = await bd();
    await db.update(configuracion).set({ ...datos.data, actualizadoEn: new Date() }).where(eq(configuracion.id, 1));
    revalidatePath("/", "layout");
    return { ok: true, mensaje: "Configuración guardada." };
  } catch (e) {
    return error(e);
  }
}

const esquemaUsuario = z.object({
  nombre: z.string().trim().min(2, "Escriba el nombre."),
  email: z.email("Escriba un correo válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  rol: z.enum(["admin", "usuario"]),
});

export async function crearUsuario(formData: FormData): Promise<EstadoAccion> {
  try {
    await requerirAdmin();
    const datos = esquemaUsuario.safeParse(Object.fromEntries(formData));
    if (!datos.success) return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Revise los datos." };
    const db = await bd();
    const [existe] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, datos.data.email.toLowerCase()));
    if (existe) return { ok: false, mensaje: "Ya existe un usuario con ese correo." };
    // Se usa el adaptador interno para no iniciar sesión como el usuario nuevo.
    const ctx = await auth().$context;
    const hash = await ctx.password.hash(datos.data.password);
    const nuevo = await ctx.internalAdapter.createUser(
      { name: datos.data.nombre, email: datos.data.email.toLowerCase(), emailVerified: false },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({ userId: nuevo.id, providerId: "credential", accountId: nuevo.id, password: hash });
    await db.update(usuarios).set({ rol: datos.data.rol }).where(eq(usuarios.id, nuevo.id));
    revalidatePath("/", "layout");
    return { ok: true, mensaje: `Usuario ${datos.data.nombre} creado.` };
  } catch (e) {
    return error(e);
  }
}

export async function cargarEjemplos(): Promise<EstadoAccion> {
  try {
    const usuario = await requerirAdmin();
    const n = await cargarDatosEjemplo(usuario.id);
    revalidatePath("/", "layout");
    return { ok: true, mensaje: `Se cargaron ${n} registros de ejemplo.` };
  } catch (e) {
    return error(e);
  }
}

// ---------------------------------------------------------------------------
// Informes y paneles
// ---------------------------------------------------------------------------

const esquemaInforme = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre del informe.").max(120),
  descripcion: z.string().trim().max(500).optional(),
  objeto: z.string().refine((o) => Boolean(obtenerObjeto(o)), "Objeto no válido."),
  agruparPor: z.string().optional(),
  agregacion: z.enum(["conteo", "suma", "promedio"]),
  campoAgregado: z.string().optional(),
  tipoGrafico: z.enum(["barras", "columnas", "linea", "anillo", "tabla"]),
  carpeta: z.string().trim().max(60).optional(),
  filtros: z
    .array(z.object({ campo: z.string(), operador: z.enum(["igual", "distinto", "contiene", "mayor", "menor"]), valor: z.string() }))
    .max(10),
});

export type DatosInforme = z.input<typeof esquemaInforme>;

export async function guardarInforme(id: string | null, datos: DatosInforme): Promise<EstadoAccion> {
  try {
    const usuario = await requerirUsuario();
    const r = esquemaInforme.safeParse(datos);
    if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Revise los datos." };
    const valores = {
      ...r.data,
      agruparPor: r.data.agruparPor || null,
      campoAgregado: r.data.agregacion === "conteo" ? null : r.data.campoAgregado || null,
      filtros: r.data.filtros as FiltroInforme[],
    };
    const db = await bd();
    let informeId = id;
    if (id) {
      await db.update(informes).set({ ...valores, actualizadoEn: new Date() }).where(eq(informes.id, id));
    } else {
      const [nuevo] = await db
        .insert(informes)
        .values({ ...valores, propietarioId: usuario.id, creadoPorId: usuario.id })
        .returning({ id: informes.id });
      informeId = nuevo?.id ?? null;
    }
    revalidatePath("/", "layout");
    return { ok: true, id: informeId ?? undefined, mensaje: "Informe guardado." };
  } catch (e) {
    return error(e);
  }
}

export async function eliminarInforme(id: string): Promise<EstadoAccion> {
  await requerirUsuario();
  const db = await bd();
  await db.delete(informes).where(eq(informes.id, id));
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Informe eliminado." };
}

export async function alternarFavorito(tipo: "informe" | "panel", id: string, favorito: boolean): Promise<void> {
  await requerirUsuario();
  const db = await bd();
  if (tipo === "informe") await db.update(informes).set({ favorito }).where(eq(informes.id, id));
  else await db.update(paneles).set({ favorito }).where(eq(paneles.id, id));
  revalidatePath("/", "layout");
}

export async function guardarPanel(id: string | null, nombre: string, descripcion: string, ids: string[]): Promise<EstadoAccion> {
  try {
    const usuario = await requerirUsuario();
    if (!nombre.trim()) return { ok: false, mensaje: "Escriba el nombre del panel." };
    const db = await bd();
    const valores = { nombre: nombre.trim().slice(0, 120), descripcion: descripcion.trim().slice(0, 500), informes: ids.slice(0, 12) };
    let panelId = id;
    if (id) await db.update(paneles).set({ ...valores, actualizadoEn: new Date() }).where(eq(paneles.id, id));
    else {
      const [nuevo] = await db
        .insert(paneles)
        .values({ ...valores, propietarioId: usuario.id, creadoPorId: usuario.id })
        .returning({ id: paneles.id });
      panelId = nuevo?.id ?? null;
    }
    revalidatePath("/", "layout");
    return { ok: true, id: panelId ?? undefined, mensaje: "Panel guardado." };
  } catch (e) {
    return error(e);
  }
}

export async function eliminarPanel(id: string): Promise<EstadoAccion> {
  await requerirUsuario();
  const db = await bd();
  await db.delete(paneles).where(eq(paneles.id, id));
  revalidatePath("/", "layout");
  return { ok: true, mensaje: "Panel eliminado." };
}

// ---------------------------------------------------------------------------
// Flujos
// ---------------------------------------------------------------------------

const esquemaCondicion = z.object({
  campo: z.string().min(1),
  operador: z.enum(["igual", "distinto", "contiene", "mayor", "menor", "vacio", "no_vacio", "cambia"]),
  valor: z.string().optional(),
});

const esquemaAccion = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("crear_tarea"), asunto: z.string().trim().min(1, "Escriba el asunto de la tarea."), diasVencimiento: z.coerce.number().int().min(0).max(365).optional(), prioridad: z.enum(["alta", "normal", "baja"]).optional() }),
  z.object({ tipo: z.literal("actualizar_campo"), campo: z.string().min(1, "Elija el campo a actualizar."), valor: z.string() }),
  z.object({ tipo: z.literal("notificar"), titulo: z.string().trim().min(1, "Escriba el título de la notificación."), mensaje: z.string().optional() }),
  z.object({ tipo: z.literal("llamar_webhook"), conexionId: z.string().min(1, "Elija una conexión.") }),
]);

const esquemaFlujo = z.object({
  nombre: z.string().trim().min(1, "Escriba el nombre del flujo.").max(120),
  descripcion: z.string().trim().max(1000).optional(),
  objeto: z.string().refine((o) => Boolean(obtenerObjeto(o)), "Elija un objeto."),
  disparador: z.enum(["crear", "actualizar", "crear_o_actualizar"]),
  activo: z.boolean(),
  condiciones: z.array(esquemaCondicion).max(10),
  acciones: z.array(esquemaAccion).min(1, "Agregue al menos una acción.").max(10),
});

export type DatosFlujo = z.input<typeof esquemaFlujo>;

export async function guardarFlujo(id: string | null, datos: DatosFlujo): Promise<EstadoAccion> {
  try {
    const usuario = await requerirUsuario();
    const r = esquemaFlujo.safeParse(datos);
    if (!r.success) return { ok: false, mensaje: r.error.issues[0]?.message ?? "Revise el flujo." };
    const db = await bd();
    const valores = {
      ...r.data,
      condiciones: r.data.condiciones as CondicionFlujo[],
      acciones: r.data.acciones as AccionFlujo[],
    };
    let flujoId = id;
    if (id) {
      const [actual] = await db.select({ version: flujos.version }).from(flujos).where(eq(flujos.id, id));
      await db
        .update(flujos)
        .set({ ...valores, version: (actual?.version ?? 1) + 1, actualizadoEn: new Date() })
        .where(and(eq(flujos.id, id)));
    } else {
      const [nuevo] = await db
        .insert(flujos)
        .values({ ...valores, propietarioId: usuario.id, creadoPorId: usuario.id })
        .returning({ id: flujos.id });
      flujoId = nuevo?.id ?? null;
    }
    revalidatePath("/", "layout");
    return { ok: true, id: flujoId ?? undefined, mensaje: "Flujo guardado." };
  } catch (e) {
    return error(e);
  }
}
