import { and, eq, getTableColumns, inArray } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { bd } from "@/db/cliente";
import { conexiones, ejecucionesFlujo, flujos, notificaciones, tareas, type AccionFlujo, type CondicionFlujo } from "@/db/esquema";
import { enlaceRegistro } from "../apps";
import { hoyMas } from "../fechas";
import { nombreVisible } from "../formato";
import { campoDe, obtenerObjeto } from "../objetos";
import { tablas } from "../tablas";
import type { FilaRegistro } from "../tipos";
import { convertirValor } from "../validacion";

type Disparo = "crear" | "actualizar";

const objetosRelacionables = ["cuentas", "oportunidades", "casos", "campanas", "productos"];
const objetosPersona = ["contactos", "candidatos"];

function comoTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function cumpleCondicion(c: CondicionFlujo, fila: FilaRegistro, anterior: FilaRegistro | null): boolean {
  const actual = fila[c.campo];
  const texto = comoTexto(actual);
  const esperado = c.valor ?? "";
  switch (c.operador) {
    case "igual":
      return texto.toLowerCase() === esperado.toLowerCase();
    case "distinto":
      return texto.toLowerCase() !== esperado.toLowerCase();
    case "contiene":
      return texto.toLowerCase().includes(esperado.toLowerCase());
    case "mayor":
      return Number(actual) > Number(esperado);
    case "menor":
      return Number(actual) < Number(esperado);
    case "vacio":
      return texto === "";
    case "no_vacio":
      return texto !== "";
    case "cambia":
      // Al crear, un campo con valor cuenta como cambiado.
      return anterior === null ? texto !== "" : comoTexto(anterior[c.campo]) !== texto;
  }
}

async function ejecutarAccion(
  accion: AccionFlujo,
  objeto: string,
  fila: FilaRegistro,
  usuarioId: string,
): Promise<string> {
  const db = await bd();
  const def = obtenerObjeto(objeto);
  const nombre = def ? nombreVisible(def, fila) : fila.id;
  const responsable = typeof fila.propietarioId === "string" ? fila.propietarioId : usuarioId;

  switch (accion.tipo) {
    case "crear_tarea": {
      await db.insert(tareas).values({
        asunto: accion.asunto || "Tarea automática",
        fechaVencimiento: hoyMas(accion.diasVencimiento ?? 0),
        prioridad: accion.prioridad ?? "normal",
        propietarioId: responsable,
        creadoPorId: usuarioId,
        relacionadoObjeto: objetosRelacionables.includes(objeto) ? objeto : null,
        relacionadoId: objetosRelacionables.includes(objeto) ? fila.id : null,
        quienObjeto: objetosPersona.includes(objeto) ? objeto : null,
        quienId: objetosPersona.includes(objeto) ? fila.id : null,
      });
      return `Tarea «${accion.asunto}» creada`;
    }
    case "actualizar_campo": {
      const campo = def ? campoDe(def, accion.campo) : undefined;
      const tabla = tablas[objeto];
      if (!campo || !tabla) throw new Error(`Campo no válido: ${accion.campo}`);
      const r = convertirValor(campo, () => accion.valor, () => accion.valor.split(","));
      if ("error" in r) throw new Error(`${campo.etiqueta}: ${r.error}`);
      const cols = getTableColumns(tabla) as Record<string, PgColumn>;
      // Se escribe directamente para no volver a disparar flujos en bucle.
      await db
        .update(tabla)
        .set(r.valor as never)
        .where(eq(cols.id!, fila.id));
      return `${campo.etiqueta} = ${accion.valor}`;
    }
    case "notificar": {
      await db.insert(notificaciones).values({
        usuarioId: responsable,
        titulo: accion.titulo || "Notificación de flujo",
        cuerpo: accion.mensaje ? `${accion.mensaje} (${nombre})` : nombre,
        enlace: enlaceRegistro(objeto, fila.id),
      });
      return "Notificación enviada";
    }
    case "llamar_webhook": {
      const [conexion] = await db.select().from(conexiones).where(eq(conexiones.id, accion.conexionId)).limit(1);
      if (!conexion?.url) throw new Error("La conexión no tiene URL.");
      try {
        const respuesta = await fetch(conexion.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ objeto, registro: fila, enviadoEn: new Date().toISOString() }),
          signal: AbortSignal.timeout(8000),
        });
        await db
          .update(conexiones)
          .set({ estado: respuesta.ok ? "activa" : "error", actualizadoEn: new Date() })
          .where(eq(conexiones.id, conexion.id));
        if (!respuesta.ok) throw new Error(`El webhook respondió ${respuesta.status}`);
        return `Webhook ${conexion.nombre}: ${respuesta.status}`;
      } catch (e) {
        await db.update(conexiones).set({ estado: "error" }).where(eq(conexiones.id, conexion.id));
        throw e;
      }
    }
  }
}

/** Ejecuta los flujos activos del objeto. Un fallo en un flujo no impide guardar el registro. */
export async function ejecutarFlujos(
  objeto: string,
  disparo: Disparo,
  fila: FilaRegistro,
  anterior: FilaRegistro | null,
  usuarioId: string,
): Promise<void> {
  const db = await bd();
  const activos = await db
    .select()
    .from(flujos)
    .where(and(eq(flujos.objeto, objeto), eq(flujos.activo, true), inArray(flujos.disparador, [disparo, "crear_o_actualizar"])));

  for (const flujo of activos) {
    if (!flujo.condiciones.every((c) => cumpleCondicion(c, fila, anterior))) continue;
    const inicio = Date.now();
    const pasos: string[] = [];
    try {
      for (const accion of flujo.acciones) pasos.push(await ejecutarAccion(accion, objeto, fila, usuarioId));
      await db.insert(ejecucionesFlujo).values({
        flujoId: flujo.id,
        nombreFlujo: flujo.nombre,
        objeto,
        registroId: fila.id,
        estado: "completada",
        detalle: pasos.join(" · ") || "Sin acciones",
        duracionMs: Date.now() - inicio,
      });
    } catch (e) {
      await db.insert(ejecucionesFlujo).values({
        flujoId: flujo.id,
        nombreFlujo: flujo.nombre,
        objeto,
        registroId: fila.id,
        estado: "error",
        detalle: [...pasos, e instanceof Error ? e.message : "Error desconocido"].join(" · "),
        duracionMs: Date.now() - inicio,
      });
    }
  }
}

/** Catálogo de acciones que pueden usar los flujos (página Centro de acción). */
export const catalogoAcciones = [
  { tipo: "crear_tarea", etiqueta: "Crear tarea", categoria: "Registros", descripcion: "Crea una tarea relacionada con el registro y la asigna a su propietario." },
  { tipo: "actualizar_campo", etiqueta: "Actualizar campo", categoria: "Registros", descripcion: "Cambia el valor de un campo del registro que disparó el flujo." },
  { tipo: "notificar", etiqueta: "Enviar notificación", categoria: "Comunicación", descripcion: "Envía una notificación en la aplicación al propietario del registro." },
  { tipo: "llamar_webhook", etiqueta: "Llamar a un webhook", categoria: "Integraciones", descripcion: "Envía los datos del registro en JSON a la URL de una conexión." },
] as const;
