import { and, eq, sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { conEmpresa, type Usuario } from "@/db/contexto";
import { bandejaLeads, candidatos, eventos, leadsMachea, tareas } from "@/db/esquema";
import { desdeHoraLocal, fechaLocal } from "../fechas";
import * as repo from "./repositorio";

/**
 * Leads de Machea dentro del CRM de cada empresa (design/crm/PLAN.md, fase 4).
 *
 * Los triggers de la base de Machea (supabase/migrations/*_crm_ingesta.sql) dejan en crm.bandeja_leads lo que
 * le toca a cada empresa: por su formulario con marca o, con autorización, por su proyecto. Aquí se convierte
 * en registros del CRM, siempre con `repo` y dentro de `conEmpresa`: así se aplican las reglas, corren los
 * flujos de la empresa (p. ej. "candidato caliente → tarea") y nada sale de su empresa.
 *
 * - consulta / solicitud → el candidato (uno por persona y empresa, crm.leads_machea).
 * - resultado (la llamada de Manuela) → tarea "llamada" completada, la cita como evento o el seguimiento como
 *   tarea pendiente, y la temperatura como valoración del candidato.
 *
 * Idempotente: cada registro lleva `origenExterno` (único por empresa) y la fila de la bandeja se toma con
 * FOR UPDATE SKIP LOCKED, así que dos pestañas a la vez no duplican nada.
 */

type Datos = Record<string, unknown>;

const LOTE = 20;
const MAX_INTENTOS = 5;

function texto(v: unknown, max = 500): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t ? t.slice(0, max) : null;
}

/** "2026-10-21 16:00" (hora de Bogotá, como la dice Manuela) → Date. */
function fechaCita(v: unknown): Date | null {
  const t = texto(v, 40);
  const m = t?.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return desdeHoraLocal(`${m[1]}T${m[2]!.padStart(2, "0")}:${m[3]}`);
}

const VALORACIONES = new Set(["caliente", "tibio", "frio"]);

function valoracion(v: unknown): string | null {
  const t = texto(v, 20)?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return t && VALORACIONES.has(t) ? t : null;
}

/** Las respuestas del formulario, legibles, para la descripción del candidato. */
function respuestasMarkdown(respuestas: unknown): string {
  if (!respuestas || typeof respuestas !== "object") return "";
  const nombres: Record<string, string> = {
    operacion: "Busca",
    zona: "Zona",
    tipo: "Tipo de vivienda",
    ingresos: "Ingresos del hogar",
    personas: "Personas a cargo",
    habitaciones: "Habitaciones",
    entorno_deseado: "Entorno",
    edad: "Edad",
    presupuesto: "Presupuesto",
    tipo_propiedad: "Tipo de inmueble",
    mudanza: "Mudanza",
  };
  const lineas: string[] = [];
  for (const [clave, etiqueta] of Object.entries(nombres)) {
    const v = (respuestas as Datos)[clave];
    const valor = Array.isArray(v) ? v.join(", ") : texto(v, 120);
    if (valor) lineas.push(`- **${etiqueta}:** ${valor}`);
  }
  return lineas.length ? `**Respuestas del formulario de Machea**\n\n${lineas.join("\n")}` : "";
}

async function candidatoDe(empresaId: string, digitos: string): Promise<string | null> {
  const db = await bd();
  const [fila] = await db
    .select({ id: leadsMachea.candidatoId })
    .from(leadsMachea)
    .where(and(eq(leadsMachea.empresaId, empresaId), eq(leadsMachea.telefonoDigitos, digitos)));
  if (!fila) return null;
  return (await repo.obtener("candidatos", fila.id)) ? fila.id : null;
}

/** El candidato de esta persona en la empresa: lo encuentra o lo crea. */
async function asegurarCandidato(empresaId: string, usuario: Usuario, d: Datos, origenExterno: string): Promise<string> {
  const digitos = texto(d.telefono_digitos, 20);
  if (!digitos) throw new Error("La fila no trae teléfono.");
  const existente = await candidatoDe(empresaId, digitos);
  if (existente) return existente;

  const db = await bd();
  const nombre = texto(d.nombre, 80);
  const apellido = texto(d.apellido, 80);
  const proyecto = texto(d.nombre_proyecto, 160);
  const descripcion = [
    proyecto ? `Pidió hablar con un asesor sobre **${proyecto}**.` : null,
    respuestasMarkdown(d.respuestas),
  ]
    .filter(Boolean)
    .join("\n\n");
  let id: string;
  try {
    id = await repo.crear(
      "candidatos",
      {
        nombre,
        apellidos: apellido || (nombre ? "(sin apellido)" : "Interesado de Machea"),
        // El CRM pide compañía; en vivienda la persona es el cliente.
        compania: [nombre, apellido].filter(Boolean).join(" ") || "Persona natural",
        email: texto(d.correo, 160),
        telefono: texto(d.telefono, 20) ?? `+57${digitos}`,
        ciudad: "Bogotá",
        pais: "Colombia",
        estado: "nuevo",
        origen: d.regla === "marca" ? "formulario_marca" : "proyecto_machea",
        descripcion: descripcion || null,
        origenExterno,
      },
      usuario.id,
    );
  } catch (e) {
    // Otra pestaña lo creó a la vez: se usa ese.
    const [ya] = await db
      .select({ id: candidatos.id })
      .from(candidatos)
      .where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.origenExterno, origenExterno)));
    if (!ya) throw e;
    id = ya.id;
  }
  await db.insert(leadsMachea).values({ empresaId, telefonoDigitos: digitos, candidatoId: id }).onConflictDoNothing();
  return (await candidatoDe(empresaId, digitos)) ?? id;
}

/** Crea o actualiza un registro de actividad identificado por su origen externo. */
async function guardarActividad(objeto: "tareas" | "eventos", origenExterno: string, valores: Datos, usuario: Usuario) {
  const db = await bd();
  const tabla = objeto === "tareas" ? tareas : eventos;
  const [ya] = await db
    .select({ id: tabla.id })
    .from(tabla)
    .where(and(eq(tabla.empresaId, usuario.empresaId), eq(tabla.origenExterno, origenExterno)));
  if (ya) await repo.actualizar(objeto, ya.id, valores, usuario.id);
  else await repo.crear(objeto, { ...valores, origenExterno }, usuario.id);
}

async function procesarResultado(empresaId: string, usuario: Usuario, d: Datos, callId: string) {
  const candidatoId = await asegurarCandidato(empresaId, usuario, d, `machea:${texto(d.telefono_digitos, 20)}`);
  const candidato = await repo.obtener("candidatos", candidatoId);
  // Si ya se convirtió, las actividades van al contacto.
  const quien =
    candidato?.convertido && typeof candidato.contactoConvertidoId === "string"
      ? { quienObjeto: "contactos", quienId: candidato.contactoConvertidoId }
      : { quienObjeto: "candidatos", quienId: candidatoId };
  const proyecto = texto(d.nombre_proyecto, 160) ?? "su proyecto";

  const temperatura = valoracion(d.temperatura_lead);
  if (temperatura && candidato && candidato.valoracion !== temperatura && !candidato.convertido) {
    await repo.actualizar("candidatos", candidatoId, { valoracion: temperatura }, usuario.id);
  }

  const comentarios = [
    d.sin_contacto === true ? "No se logró hablar con la persona (buzón, ocupado o filtro de llamadas)." : null,
    texto(d.resumen_llamada, 1500),
    texto(d.recomendacion_asesor, 600) ? `Recomendación para el asesor: ${texto(d.recomendacion_asesor, 600)}` : null,
    texto(d.objecion_principal, 300) ? `Objeción principal: ${texto(d.objecion_principal, 300)}` : null,
    temperatura ? `Temperatura: ${temperatura}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  await guardarActividad(
    "tareas",
    `llamada:${callId}`,
    {
      asunto: `Llamada de Manuela – ${proyecto}`.slice(0, 255),
      tipo: "llamada",
      estado: "completada",
      completadaEn: new Date(),
      fechaVencimiento: fechaLocal(),
      prioridad: temperatura === "caliente" ? "alta" : "normal",
      comentarios: comentarios || null,
      ...quien,
    },
    usuario,
  );

  const cita = d.cita_agendada === true ? fechaCita(d.fecha_hora_cita) : null;
  if (cita) {
    await guardarActividad(
      "eventos",
      `cita:${callId}`,
      {
        asunto: `Cita – ${proyecto}`.slice(0, 255),
        descripcion: `Agendada por Manuela.${texto(d.canal_cita, 60) ? ` Canal: ${texto(d.canal_cita, 60)}.` : ""}`,
        inicio: cita,
        fin: new Date(cita.getTime() + 60 * 60 * 1000),
        ubicacion: texto(d.canal_cita, 120),
        ...quien,
      },
      usuario,
    );
  } else if (texto(d.fecha_de_seguimiento, 120)) {
    await guardarActividad(
      "tareas",
      `seguimiento:${callId}`,
      {
        asunto: `Seguimiento – ${proyecto}`.slice(0, 255),
        tipo: "llamada",
        estado: "no_iniciada",
        prioridad: temperatura === "caliente" ? "alta" : "normal",
        comentarios: `Manuela acordó volver a contactar: ${texto(d.fecha_de_seguimiento, 120)}`,
        ...quien,
      },
      usuario,
    );
  }
}

async function procesarFila(empresaId: string, usuario: Usuario, origen: string, origenId: string, d: Datos) {
  if (origen === "resultado") return procesarResultado(empresaId, usuario, d, origenId);
  if (origen === "consulta" || origen === "solicitud") {
    await asegurarCandidato(empresaId, usuario, d, `machea:${texto(d.telefono_digitos, 20)}`);
    return;
  }
  throw new Error(`Origen desconocido: ${origen}`);
}

/**
 * Procesa hasta LOTE filas pendientes de la empresa. Devuelve cuántas quedaron hechas. Nunca lanza: una fila
 * que falla guarda su error y se reintenta hasta MAX_INTENTOS veces.
 */
export async function procesarBandeja(usuario: Usuario, limite = LOTE): Promise<number> {
  const db = await bd();
  const empresaId = usuario.empresaId;
  const tomadas = await db.execute<{ id: number; origen: string; origen_id: string; datos: Datos }>(sql`
    update ${bandejaLeads} set tomado_en = now(), intentos = intentos + 1
    where id in (
      select id from ${bandejaLeads}
      where empresa_id = ${empresaId} and procesado_en is null and intentos < ${MAX_INTENTOS}
        and (tomado_en is null or tomado_en < now() - interval '5 minutes')
      order by id
      limit ${limite}
      for update skip locked
    )
    returning id, origen, origen_id, datos
  `);
  let hechas = 0;
  // En orden: la persona (consulta, solicitud) antes que el resultado de su llamada.
  const filas = [...tomadas.rows].sort((a, b) => a.id - b.id);
  for (const f of filas) {
    try {
      await conEmpresa(empresaId, () => procesarFila(empresaId, usuario, f.origen, f.origen_id, f.datos ?? {}), usuario);
      await db.update(bandejaLeads).set({ procesadoEn: new Date(), error: null }).where(eq(bandejaLeads.id, f.id));
      hechas++;
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await db
        .update(bandejaLeads)
        .set({ error: mensaje.slice(0, 500), tomadoEn: null })
        .where(eq(bandejaLeads.id, f.id));
    }
  }
  return hechas;
}
