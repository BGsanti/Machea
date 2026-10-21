import { and, eq, sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { conEmpresa, type Usuario } from "@/db/contexto";
import { bandejaLeads, candidatos, eventos, leadsMachea, notificaciones, tareas, usuarios } from "@/db/esquema";
import { desdeHoraLocal, fechaLocal } from "../fechas";
import { partirNombre } from "../formularios/validar";
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

// ---------------------------------------------------------------------------
// Machea como su propia empresa cliente: prospectos de Camila, demos pedidas en la web, llamadas y citas
// ---------------------------------------------------------------------------

const ESTADO_PROSPECTO: Record<string, string> = {
  nuevo: "nuevo",
  en_cola: "nuevo",
  llamando: "nuevo",
  contactado: "contactado",
  calificado: "calificado",
  demo_agendada: "calificado",
  no_interesado: "no_calificado",
  no_contactar: "no_calificado",
  numero_invalido: "no_calificado",
  sin_respuesta: "no_calificado",
};
const VALORACION_SCORE: Record<string, string> = { A: "caliente", B: "tibio", C: "frio", X: "frio" };
const ORIGEN_PROSPECTO: Record<string, string> = { lista_frio: "camila", demo_web: "demo_web", referido: "referencia_externa", manual: "otro" };
const ETIQUETAS_CALIFICACION: Record<string, string> = {
  tipo_empresa_confirmado: "Tipo de empresa",
  leads_mes: "Leads al mes",
  inversion_pauta_mes: "Inversión en pauta al mes",
  tiempo_respuesta: "Tiempo de respuesta a un lead",
  crm_actual: "Qué usa hoy",
  es_decisor: "¿Decide la compra?",
  dolor_principal: "Lo que quiere resolver",
  interes: "Nivel de interés",
  motivo_no_demo: "Por qué no agendó la demo",
  siguiente_paso: "Siguiente paso",
  objecion_principal: "Objeción principal",
};

const aTexto = (v: unknown, max = 300): string | null => texto(v, max);

function telefonoDeDigitos(digitos: string): string {
  return digitos.length === 10 ? `+57 ${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}` : `+57${digitos}`;
}

function respuestasDe(pares: [string, string, unknown][]): { clave: string; etiqueta: string; valor: string }[] {
  return pares.flatMap(([clave, etiqueta, valor]) => {
    const t = Array.isArray(valor) ? valor.join(", ") : typeof valor === "object" && valor !== null ? null : texto(valor, 300);
    return t ? [{ clave, etiqueta, valor: t }] : [];
  });
}

async function avisarAdmins(empresaId: string, titulo: string, cuerpo: string, enlace: string) {
  const db = await bd();
  const admins = await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.rol, "admin")));
  for (const a of admins) await db.insert(notificaciones).values({ usuarioId: a.id, titulo, cuerpo, enlace });
}

/** El lead de una empresa prospecto: lo encuentra por su teléfono (de Camila o de una demo pedida) o lo crea. */
async function asegurarProspecto(empresaId: string, usuario: Usuario, digitos: string, valores: Datos): Promise<{ id: string; nuevo: boolean }> {
  const db = await bd();
  const existente = await candidatoDe(empresaId, digitos);
  if (existente) return { id: existente, nuevo: false };
  let id: string;
  try {
    id = await repo.crear("candidatos", { ...valores, telefono: valores.telefono ?? telefonoDeDigitos(digitos), pais: "Colombia", origenExterno: `machea:${digitos}` }, usuario.id);
  } catch (e) {
    const [ya] = await db.select({ id: candidatos.id }).from(candidatos).where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.origenExterno, `machea:${digitos}`)));
    if (!ya) throw e;
    id = ya.id;
  }
  await db.insert(leadsMachea).values({ empresaId, telefonoDigitos: digitos, candidatoId: id }).onConflictDoNothing();
  return { id: (await candidatoDe(empresaId, digitos)) ?? id, nuevo: true };
}

function digitosDe(d: Datos): string {
  const v = texto(d.telefono_digitos, 20);
  if (!v) throw new Error("La fila no trae teléfono.");
  return v.replace(/\D/g, "").slice(-10);
}

/** Alguien pidió una demo en la web: es un lead caliente, con lo que contestó. */
async function procesarDemo(empresaId: string, usuario: Usuario, d: Datos) {
  const digitos = digitosDe(d);
  const nombreCompleto = aTexto(d.nombre, 120) ?? "Interesado en una demo";
  const { nombre, apellidos } = partirNombre(nombreCompleto);
  const empresa = aTexto(d.empresa, 200);
  const respuestas = respuestasDe([
    ["tipo_empresa", "Tipo de empresa", d.tipo_empresa],
    ["problema", "Lo que quiere resolver", d.problema],
    ["fuente_leads", "De dónde le llegan los leads", d.fuente_leads],
    ["pauta", "Pauta mensual", d.pauta_mensual],
    ["leads_mes", "Leads al mes", d.leads_mes],
    ["crm", "Qué usa hoy", d.crm],
    ["sitio", "Sitio web", d.sitio],
  ]);
  const { id, nuevo } = await asegurarProspecto(empresaId, usuario, digitos, {
    nombre,
    apellidos,
    compania: empresa ?? nombreCompleto,
    email: aTexto(d.correo, 160),
    sitioWeb: aTexto(d.sitio, 300),
    estado: "nuevo",
    valoracion: "caliente",
    origen: "demo_web",
    interes: aTexto(d.problema, 200),
    descripcion: `Pidió una demo en la web${empresa ? ` para **${empresa}**` : ""}.`,
    respuestas,
  });
  if (!nuevo) {
    // Ya era un lead (por Camila): se marca caliente y se anota que pidió la demo.
    await repo.actualizar("candidatos", id, { valoracion: "caliente", respuestas }, usuario.id);
  }
  await guardarActividad(
    "tareas",
    `demo:${digitos}`,
    { asunto: `Atender la solicitud de demo${empresa ? ` de ${empresa}` : ""}`, tipo: "llamada", estado: "no_iniciada", fechaVencimiento: fechaLocal(), prioridad: "alta", quienObjeto: "candidatos", quienId: id },
    usuario,
  );
  if (nuevo) await avisarAdmins(empresaId, `Demo pedida: ${empresa ?? nombreCompleto}`, "Pidió una demo en la web", `/ventas/o/candidatos/${id}`);
}

/** Una empresa de la lista de Camila (o una demo ya calificada): se crea o se actualiza su lead. */
async function procesarProspecto(empresaId: string, usuario: Usuario, d: Datos) {
  const digitos = digitosDe(d);
  const calificacion = (d.calificacion && typeof d.calificacion === "object" ? d.calificacion : {}) as Datos;
  const contacto = aTexto(d.contacto_nombre, 120);
  const { nombre, apellidos } = contacto ? partirNombre(contacto) : { nombre: null, apellidos: "(sin contacto)" };
  const empresa = aTexto(d.empresa, 200) ?? contacto ?? "Empresa";
  const score = aTexto(d.score, 2);
  const valores = {
    nombre,
    apellidos,
    compania: empresa,
    cargo: aTexto(d.contacto_cargo, 120),
    email: aTexto(d.correo, 160),
    ciudad: aTexto(d.ciudad, 120),
    sitioWeb: aTexto(d.sitio, 300),
    estado: ESTADO_PROSPECTO[String(d.estado ?? "nuevo")] ?? "nuevo",
    valoracion: score ? (VALORACION_SCORE[score] ?? null) : null,
    origen: ORIGEN_PROSPECTO[String(d.origen ?? "lista_frio")] ?? "camila",
    interes: aTexto(calificacion.dolor_principal, 200) ?? aTexto(calificacion.interes, 200),
    descripcion: [aTexto(d.notas, 1500), score ? `Puntaje de Camila: **${score}**${d.puntos !== undefined ? ` (${String(d.puntos)}/100)` : ""}.` : null].filter(Boolean).join("\n\n") || null,
    respuestas: respuestasDe(Object.entries(ETIQUETAS_CALIFICACION).map(([k, etiqueta]) => [k, etiqueta, calificacion[k]] as [string, string, unknown])),
  };
  const { id, nuevo } = await asegurarProspecto(empresaId, usuario, digitos, { ...valores, telefono: telefonoDeDigitos(digitos) });
  if (!nuevo) {
    const actual = await repo.obtener("candidatos", id);
    if (actual && !actual.convertido) {
      // Lo que Camila va aprendiendo se actualiza; lo que la persona ya cambió a mano (estado avanzado) no se pisa hacia atrás.
      const orden = ["nuevo", "contactado", "en_seguimiento", "calificado", "no_calificado"];
      const estadoNuevo = orden.indexOf(valores.estado) > orden.indexOf(String(actual.estado)) ? valores.estado : actual.estado;
      await repo.actualizar(
        "candidatos",
        id,
        {
          estado: estadoNuevo,
          valoracion: valores.valoracion ?? actual.valoracion,
          respuestas: valores.respuestas.length ? valores.respuestas : actual.respuestas,
          interes: valores.interes ?? actual.interes,
          cargo: actual.cargo ?? valores.cargo,
          email: actual.email ?? valores.email,
          ciudad: actual.ciudad ?? valores.ciudad,
        },
        usuario.id,
      );
    }
  }
}

/** La llamada de Camila: queda como tarea completada con su resumen; la conversación y el audio quedan en la bandeja. */
async function procesarLlamadaCamila(empresaId: string, usuario: Usuario, d: Datos, callId: string) {
  const digitos = digitosDe(d);
  const analisis = (d.analisis && typeof d.analisis === "object" ? d.analisis : {}) as Datos;
  const empresa = aTexto(d.empresa, 200) ?? "la empresa";
  const { id } = await asegurarProspecto(empresaId, usuario, digitos, {
    nombre: null,
    apellidos: "(sin contacto)",
    compania: empresa,
    estado: "nuevo",
    origen: "camila",
    descripcion: "Lo llamó Camila.",
  });
  const persona = await repo.obtener("candidatos", id);
  const temperatura = typeof persona?.valoracion === "string" ? persona.valoracion : null;
  const comentarios = [
    d.sin_contacto === true ? "No se logró hablar con la persona (buzón, ocupado o filtro de llamadas)." : null,
    aTexto(d.resumen, 1500),
    aTexto(analisis.siguiente_paso, 400) ? `Siguiente paso: ${aTexto(analisis.siguiente_paso, 400)}` : null,
    aTexto(analisis.dolor_principal, 300) ? `Lo que quiere resolver: ${aTexto(analisis.dolor_principal, 300)}` : null,
    aTexto(analisis.objecion_principal, 300) ? `Objeción principal: ${aTexto(analisis.objecion_principal, 300)}` : null,
    temperatura ? `Temperatura: ${temperatura}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  await guardarActividad(
    "tareas",
    `camila:${callId}`,
    {
      asunto: `Llamada de Camila – ${empresa}`.slice(0, 255),
      tipo: "llamada",
      estado: "completada",
      completadaEn: new Date(),
      fechaVencimiento: fechaLocal(),
      prioridad: temperatura === "caliente" ? "alta" : "normal",
      comentarios: comentarios || null,
      quienObjeto: "candidatos",
      quienId: id,
    },
    usuario,
  );
}

/** La demo o la llamada de seguimiento que Camila dejó acordada: va al calendario. Sin hora exacta, queda una tarea. */
async function procesarCitaCamila(empresaId: string, usuario: Usuario, d: Datos, citaId: string) {
  const digitos = digitosDe(d);
  const empresa = aTexto(d.empresa, 200) ?? "la empresa";
  const { id } = await asegurarProspecto(empresaId, usuario, digitos, { nombre: null, apellidos: "(sin contacto)", compania: empresa, estado: "calificado", origen: "camila", descripcion: "Lo llamó Camila." });
  const esDemo = String(d.tipo ?? "demo") === "demo";
  const asunto = `${esDemo ? "Demo" : "Seguimiento"} – ${empresa}`.slice(0, 255);
  const inicio = d.inicio ? new Date(String(d.inicio)) : null;
  const canales: Record<string, string> = { llamada: "Llamada", videollamada: "Videollamada", whatsapp: "WhatsApp", presencial: "Presencial" };
  const detalle = [aTexto(d.texto_acordado, 200) ? `Acordado: ${aTexto(d.texto_acordado, 200)}.` : null, aTexto(d.asesor, 80) ? `Atiende: ${aTexto(d.asesor, 80)}.` : null, aTexto(d.notas, 500)].filter(Boolean).join(" ");
  const cancelada = ["cancelada", "no_show"].includes(String(d.estado ?? ""));
  if (inicio && !Number.isNaN(inicio.getTime())) {
    await guardarActividad(
      "eventos",
      `cita-camila:${citaId}`,
      {
        asunto: cancelada ? `Cancelada – ${asunto}` : asunto,
        descripcion: detalle || null,
        inicio,
        fin: new Date(inicio.getTime() + 60 * 60 * 1000),
        ubicacion: canales[String(d.canal ?? "")] ?? null,
        quienObjeto: "candidatos",
        quienId: id,
      },
      usuario,
    );
  } else if (!cancelada) {
    await guardarActividad(
      "tareas",
      `cita-camila:${citaId}`,
      { asunto: `Coordinar ${esDemo ? "la demo" : "el seguimiento"} – ${empresa}`, tipo: "llamada", estado: "no_iniciada", fechaVencimiento: fechaLocal(), prioridad: "alta", comentarios: detalle || null, quienObjeto: "candidatos", quienId: id },
      usuario,
    );
  }
}

async function procesarFila(empresaId: string, usuario: Usuario, origen: string, origenId: string, d: Datos) {
  if (origen === "resultado") return procesarResultado(empresaId, usuario, d, origenId);
  // Lo que sale de la base de Machea para su propia empresa (la fuente `interna`): demos pedidas, prospectos y llamadas de Camila.
  if (origen === "demo") return procesarDemo(empresaId, usuario, d);
  if (origen === "prospecto") return procesarProspecto(empresaId, usuario, d);
  if (origen === "llamada_captacion") return procesarLlamadaCamila(empresaId, usuario, d, origenId);
  if (origen === "cita") return procesarCitaCamila(empresaId, usuario, d, origenId);
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
