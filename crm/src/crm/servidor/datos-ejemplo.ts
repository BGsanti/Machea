import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { and, asc, eq } from "drizzle-orm";
import { bandejaLeads, candidatos, eventos, flujos, tareas, textosRapidos } from "@/db/esquema";
import { desdeHoraLocal, hoyMas } from "../fechas";
import { perfilDe, type PerfilId } from "../perfiles";
import { obtenerConfiguracion } from "./consultas";
import { enElReparto } from "./reparto";
import { crear } from "./repositorio";

const dia = hoyMas;

function hora(desplazamientoDias: number, h: number, m = 0): Date {
  return desdeHoraLocal(`${hoyMas(desplazamientoDias)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)!;
}

type Turno = { s: number; r: "a" | "u"; t: string };

interface Contexto {
  usuarioId: string;
  empresaId: string;
  nuevo: (objeto: string, datos: Record<string, unknown>) => Promise<string>;
  /** Deja en la bandeja lo mismo que dejaría la base de Machea para una llamada: la conversación y, si hay, el audio. */
  conversacion: (origen: "resultado" | "llamada_captacion", idLlamada: string, turnos: Turno[], duracionMs: number, audio?: string) => Promise<void>;
}

/**
 * Carga datos de demostración según el tipo de empresa (perfil): una constructora ve sus proyectos, una
 * inmobiliaria sus inmuebles y Machea (la primera empresa cliente de sí misma) sus prospectos y demos. Se puede
 * ejecutar varias veces: lo que lleva un origen externo no se repite.
 */
export async function cargarDatosEjemplo(usuarioId: string): Promise<number> {
  const db = await bd();
  const empresaId = await empresaActual();
  const config = await obtenerConfiguracion();
  const perfil = perfilDe(config.perfil);
  let total = 0;
  const ctx: Contexto = {
    usuarioId,
    empresaId,
    nuevo: async (objeto, datos) => {
      total++;
      return crear(objeto, datos, usuarioId);
    },
    conversacion: async (origen, idLlamada, turnos, duracionMs, audio) => {
      await db
        .insert(bandejaLeads)
        .values({
          empresaId,
          origen,
          origenId: idLlamada,
          procesadoEn: new Date(),
          datos: {
            duracion_ms: duracionMs,
            transcripcion: turnos,
            // Solo para probar el reproductor en desarrollo (un archivo servido desde su propia máquina).
            ...(audio ? { grabacion_url: audio } : {}),
          },
        })
        .onConflictDoNothing();
    },
  };

  if (perfil.id === "machea") await ejemploMachea(ctx);
  else await ejemploVivienda(ctx, perfil.id);
  await repartirEntreElEquipo(empresaId, usuarioId);

  await db.insert(textosRapidos).values({
    empresaId,
    nombre: "Primer contacto por WhatsApp",
    mensaje: "Hola {{Contacto.Nombre}}, soy del equipo de ventas. Vi que te interesó nuestra oferta, ¿te cuento más?",
    categoria: "saludos",
    canales: ["WhatsApp"],
    propietarioId: usuarioId,
    creadoPorId: usuarioId,
  });
  await db.insert(flujos).values({
    empresaId,
    nombre: "Seguimiento de leads calientes",
    descripcion: "Crea una tarea de llamada y avisa al propietario cuando entra un lead con temperatura Caliente.",
    objeto: "candidatos",
    disparador: "crear_o_actualizar",
    condiciones: [{ campo: "valoracion", operador: "igual", valor: "caliente" }, { campo: "valoracion", operador: "cambia" }],
    acciones: [
      { tipo: "crear_tarea", asunto: "Llamar al lead en menos de 24 horas", diasVencimiento: 1, prioridad: "alta" },
      { tipo: "notificar", titulo: "Nuevo lead caliente", mensaje: "Revise y contacte pronto" },
    ],
    activo: true,
    propietarioId: usuarioId,
    creadoPorId: usuarioId,
  });
  return total;
}

/** Lo que guarda la ingesta cuando un agente llama: la tarea de la llamada (con su origen) y, si hubo, la cita. */
async function llamadaDeAgente(
  ctx: Contexto,
  l: {
    persona: string;
    agente: "Manuela" | "Camila";
    id: string;
    asunto: string;
    temp: "caliente" | "tibio" | "frio";
    resumen: string;
    recomendacion: string;
    objecion: string | null;
    cita: Date | null;
    asuntoCita: string;
    ubicacionCita: string;
    turnos: Turno[];
  },
) {
  const prefijo = l.agente === "Camila" ? "camila" : "llamada";
  const prefijoCita = l.agente === "Camila" ? "cita-camila" : "cita";
  try {
    await ctx.nuevo("tareas", {
      asunto: l.asunto,
      tipo: "llamada",
      estado: "completada",
      fechaVencimiento: dia(0),
      prioridad: l.temp === "caliente" ? "alta" : "normal",
      comentarios: [l.resumen, `Recomendación para el asesor: ${l.recomendacion}`, l.objecion ? `Objeción principal: ${l.objecion}` : null, `Temperatura: ${l.temp}`]
        .filter(Boolean)
        .join("\n\n"),
      quienObjeto: "candidatos",
      quienId: l.persona,
      origenExterno: `${prefijo}:${l.id}`,
    });
    await ctx.conversacion(l.agente === "Camila" ? "llamada_captacion" : "resultado", l.id, l.turnos, 48000, process.env.CRM_DEMO_AUDIO_URL && l.id.endsWith("-0") ? process.env.CRM_DEMO_AUDIO_URL : undefined);
    if (l.cita) {
      await ctx.nuevo("eventos", {
        asunto: l.asuntoCita,
        descripcion: `Agendada por ${l.agente}.`,
        inicio: l.cita,
        fin: new Date(l.cita.getTime() + 3600000),
        ubicacion: l.ubicacionCita,
        quienObjeto: "candidatos",
        quienId: l.persona,
        origenExterno: `${prefijoCita}:${l.id}`,
      });
    }
  } catch {
    // Ya estaban cargadas (origen externo repetido).
  }
}

// ---------------------------------------------------------------------------
// Constructoras e inmobiliarias: compradores, catálogo propio y llamadas de Manuela
// ---------------------------------------------------------------------------

async function ejemploVivienda(ctx: Contexto, tipo: Extract<PerfilId, "constructora" | "inmobiliaria">) {
  const constructora = tipo === "constructora";

  // Catálogo: los proyectos de una constructora o los inmuebles de una inmobiliaria.
  let intereses: string[];
  let precios: number[];
  if (constructora) {
    const base = { activo: true, estrato: 4 };
    const p1 = { nombre: "Torres de Chapinero", ciudad: "Bogotá", barrio: "Chapinero", etapa: "en_construccion", tipoVivienda: "no_vis", fechaEntrega: dia(420), unidadesTotales: 240, unidadesDisponibles: 86, precioDesde: 410000000, precioHasta: 690000000, areaDesde: 48, areaHasta: 92, alcobas: "1, 2 y 3", ...base };
    const p2 = { nombre: "Parque Fontibón", ciudad: "Bogotá", barrio: "Fontibón", etapa: "sobre_planos", tipoVivienda: "vis", aplicaSubsidio: true, fechaEntrega: dia(700), unidadesTotales: 380, unidadesDisponibles: 301, precioDesde: 165000000, precioHasta: 205000000, areaDesde: 42, areaHasta: 58, alcobas: "2 y 3", activo: true, estrato: 3 };
    const p3 = { nombre: "Altos del Poblado", ciudad: "Medellín", barrio: "El Poblado", etapa: "entrega_inmediata", tipoVivienda: "no_vis", fechaEntrega: dia(30), unidadesTotales: 96, unidadesDisponibles: 14, precioDesde: 780000000, precioHasta: 1250000000, areaDesde: 90, areaHasta: 160, alcobas: "2, 3 y 4", activo: true, estrato: 6 };
    for (const p of [p1, p2, p3]) await ctx.nuevo("proyectos", p as Record<string, unknown>);
    intereses = ["Torres de Chapinero", "Altos del Poblado", "Parque Fontibón", "Parque Fontibón", "Torres de Chapinero", "Altos del Poblado", "Torres de Chapinero"];
    precios = [520000000, 980000000, 185000000, 175000000, 610000000, 890000000, 450000000];
  } else {
    const dueno = await ctx.nuevo("contactos", { nombre: "Carlos", apellidos: "Duarte", telefono: "+57 310 555 2001", email: "carlos.duarte@correo.example", cargo: "Propietario" });
    const dueña = await ctx.nuevo("contactos", { nombre: "Marta", apellidos: "Quintero", telefono: "+57 311 555 2002", email: "marta.quintero@correo.example", cargo: "Propietaria" });
    const lista = [
      { titulo: "Apartamento de 3 alcobas en Chapinero", operacion: "venta", tipo: "apartamento", barrio: "Chapinero", ciudad: "Bogotá", precio: 620000000, area: 98, alcobas: 3, banos: 3, parqueaderos: 2, estrato: 5, duenoContactoId: dueno },
      { titulo: "Casa en El Poblado con terraza", operacion: "venta", tipo: "casa", barrio: "El Poblado", ciudad: "Medellín", precio: 1150000000, area: 240, alcobas: 4, banos: 4, parqueaderos: 3, estrato: 6, duenoContactoId: dueña },
      { titulo: "Apartamento amoblado en Usaquén", operacion: "arriendo", tipo: "apartamento", barrio: "Usaquén", ciudad: "Bogotá", precio: 3800000, area: 62, alcobas: 2, banos: 2, parqueaderos: 1, estrato: 5, duenoContactoId: dueno },
      { titulo: "Apartaestudio cerca a la Javeriana", operacion: "arriendo", tipo: "apartaestudio", barrio: "Chapinero", ciudad: "Bogotá", precio: 2100000, area: 34, alcobas: 1, banos: 1, parqueaderos: 0, estrato: 4, duenoContactoId: dueña },
      { titulo: "Apartamento de 2 alcobas en Fontibón", operacion: "venta", tipo: "apartamento", barrio: "Fontibón", ciudad: "Bogotá", precio: 285000000, area: 58, alcobas: 2, banos: 2, parqueaderos: 1, estrato: 3, duenoContactoId: dueno },
      { titulo: "Local comercial en Laureles", operacion: "arriendo", tipo: "local", barrio: "Laureles", ciudad: "Medellín", precio: 6500000, area: 70, alcobas: 0, banos: 1, parqueaderos: 0, estrato: 5, duenoContactoId: dueña, estado: "reservado" },
    ];
    for (const i of lista) await ctx.nuevo("inmuebles", { ...i, codigo: `INM-${1000 + lista.indexOf(i)}` });
    intereses = [lista[0]!.titulo, lista[1]!.titulo, lista[4]!.titulo, lista[2]!.titulo, lista[0]!.titulo, lista[1]!.titulo, lista[3]!.titulo];
    precios = [620000000, 1150000000, 285000000, 3800000, 610000000, 1100000000, 2100000];
  }

  // Compradores, como los que entran por un formulario: la persona es el cliente.
  const compradores = [
    { nombre: "Valentina", apellidos: "Ríos", estado: "nuevo", valoracion: "caliente", origen: "formulario_empresa", ciudad: "Bogotá", email: "valentina.rios@correo.example", telefono: "+57 312 555 1001" },
    { nombre: "Santiago", apellidos: "Herrera", estado: "contactado", valoracion: "tibio", origen: "proyecto_machea", ciudad: "Medellín", email: "santiago.herrera@correo.example", telefono: "+57 315 555 1002" },
    { nombre: "Mariana", apellidos: "López", estado: "en_seguimiento", valoracion: "tibio", origen: "web", ciudad: "Bogotá", email: "mariana.lopez@correo.example", telefono: "+57 300 555 1003" },
    { nombre: "Daniel", apellidos: "Castro", estado: "nuevo", valoracion: "frio", origen: "publicidad", ciudad: "Soacha", email: "daniel.castro@correo.example", telefono: "+57 320 555 1004" },
    { nombre: "Isabella", apellidos: "Moreno", estado: "calificado", valoracion: "caliente", origen: "formulario_empresa", ciudad: "Bogotá", email: "isabella.moreno@correo.example", telefono: "+57 311 555 1005" },
    { nombre: "Tomás", apellidos: "Jiménez", estado: "contactado", valoracion: "caliente", origen: "proyecto_machea", ciudad: "Medellín", email: "tomas.jimenez@correo.example", telefono: "+57 318 555 1006" },
    { nombre: "Sofía", apellidos: "Ramírez", estado: "no_calificado", valoracion: "frio", origen: "web", ciudad: "Bogotá", email: "sofia.ramirez@correo.example", telefono: "+57 301 555 1007" },
  ];
  const ids: string[] = [];
  for (const [i, c] of compradores.entries()) {
    const interes = intereses[i]!;
    ids.push(
      await ctx.nuevo("candidatos", {
        ...c,
        pais: "Colombia",
        interes,
        descripcion: `Pidió hablar con un asesor sobre **${interes}**.`,
        respuestas: [
          { clave: "interes", etiqueta: constructora ? "Proyecto de interés" : "Inmueble de interés", valor: interes },
          { clave: "presupuesto", etiqueta: "Presupuesto", valor: new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(precios[i]!) },
          { clave: "mudanza", etiqueta: "¿Para cuándo lo necesita?", valor: ["Lo antes posible", "En 3 a 6 meses", "En más de un año"][i % 3]! },
        ],
      }),
    );
  }

  // Tres llamadas de Manuela, con la forma que les deja la ingesta (ingesta.ts).
  const agente = (i: number, resumen: string, recomendacion: string, objecion: string | null, cita: Date | null, turnos: Turno[]) =>
    llamadaDeAgente(ctx, {
      persona: ids[i]!,
      agente: "Manuela",
      id: `ejemplo-${i}`,
      asunto: `Llamada de Manuela – ${intereses[i]}`,
      temp: "caliente",
      resumen,
      recomendacion,
      objecion,
      cita,
      asuntoCita: constructora ? `Visita – ${intereses[i]}` : `Visita – ${intereses[i]}`,
      ubicacionCita: constructora ? "Sala de ventas" : "En el inmueble",
      turnos,
    });
  await agente(
    0,
    `Valentina busca un lugar para vivir con su pareja y tiene la cuota inicial lista. Preguntó por el subsidio Mi Casa Ya y por el tiempo de entrega.`,
    "Llámela hoy y ofrezca visitar el sábado. Tenga a mano el valor de la cuota mensual y los requisitos del subsidio.",
    "Quiere confirmar que entregan a tiempo.",
    null,
    [
      { s: 1.5, r: "a", t: `Hola Valentina, te habla Manuela de Machea, por tu solicitud de información sobre ${intereses[0]}.` },
      { s: 8.2, r: "u", t: "Hola, sí, claro." },
      { s: 10.1, r: "a", t: "Perfecto. Te llamo para confirmar tu interés y dejarte una cita con un asesor. ¿Tienes un minuto?" },
      { s: 17.0, r: "u", t: "Sí, dime." },
      { s: 18.4, r: "a", t: "¿Lo buscas para vivir o para invertir?" },
      { s: 22.9, r: "u", t: "Para vivir con mi pareja. Ya tenemos la cuota inicial y queremos saber si aplica el subsidio Mi Casa Ya." },
      { s: 31.3, r: "a", t: "Buenísimo. Eso lo revisa mejor el asesor con tus ingresos. ¿Te sirve una visita el sábado en la mañana?" },
      { s: 39.8, r: "u", t: "Me gustaría, pero primero quiero confirmar que entregan a tiempo." },
      { s: 44.0, r: "a", t: "Claro, el asesor te muestra todo y te resuelve eso. Te escribo por WhatsApp para coordinar la hora." },
    ],
  );
  await agente(
    4,
    "Isabella ya conoce la oferta y quiere visitarla. Confirmó presupuesto y que decide ella sola.",
    "Confirme la visita un día antes y lleve la simulación del crédito.",
    null,
    hora(2, 10, 30),
    [
      { s: 1.4, r: "a", t: `Hola Isabella, te habla Manuela de Machea. ¿Sigues interesada en ${intereses[4]}?` },
      { s: 7.0, r: "u", t: "Sí, ya conozco la oferta y quiero visitarla." },
      { s: 12.2, r: "a", t: "Perfecto. ¿Tienes definido el presupuesto y decides tú sola?" },
      { s: 17.5, r: "u", t: "Sí, el presupuesto está confirmado y la decisión es mía." },
      { s: 22.0, r: "a", t: "Entonces te dejo una visita el jueves a las diez y media. ¿Te funciona?" },
      { s: 28.6, r: "u", t: "Perfecto, ahí estoy." },
    ],
  );
  await agente(
    5,
    "Tomás está comparando dos opciones de la zona y espera una respuesta esta semana.",
    "Envíe hoy la ficha con los precios y proponga una llamada corta mañana para resolver dudas.",
    "El precio frente a otra opción de la zona.",
    null,
    [
      { s: 1.6, r: "a", t: `Hola Tomás, te habla Manuela de Machea, por tu solicitud sobre ${intereses[5]}.` },
      { s: 7.4, r: "u", t: "Hola. Estoy comparando dos opciones de la zona." },
      { s: 11.0, r: "a", t: "Entiendo. ¿Qué te gustaría resolver antes de decidir: precio, ubicación o algo más?" },
      { s: 17.2, r: "u", t: "El precio, la otra está más barata. Necesito tres alcobas con doble parqueadero." },
      { s: 25.0, r: "a", t: "Claro. El asesor te envía la ficha con los precios y te llama mañana para resolver tus dudas." },
    ],
  );

  // Negocios, visitas y tareas de la semana.
  await ctx.nuevo("oportunidades", { nombre: `${intereses[4]} – Isabella Moreno`, etapa: "negociar", fechaCierre: dia(20), importe: precios[4] });
  await ctx.nuevo("oportunidades", { nombre: `${intereses[5]} – Tomás Jiménez`, etapa: "proponer", fechaCierre: dia(35), importe: precios[5] });
  await ctx.nuevo("oportunidades", { nombre: `${intereses[0]} – Valentina Ríos`, etapa: "calificar", fechaCierre: dia(60), importe: precios[0] });

  await ctx.nuevo("eventos", { asunto: constructora ? "Visita a la sala de ventas" : "Visita al inmueble", descripcion: "Primera visita.", inicio: hora(1, 15), fin: hora(1, 16), ubicacion: constructora ? "Sala de ventas" : "En el inmueble", quienObjeto: "candidatos", quienId: ids[2] });
  await ctx.nuevo("eventos", { asunto: "Llamada de seguimiento", inicio: hora(0, 17), fin: hora(0, 17, 30), quienObjeto: "candidatos", quienId: ids[1] });
  await ctx.nuevo("eventos", { asunto: "Enviar la simulación del crédito", inicio: hora(3, 9), fin: hora(3, 9, 30), quienObjeto: "candidatos", quienId: ids[4] });

  await ctx.nuevo("tareas", { asunto: "Llamar para confirmar la visita del sábado", fechaVencimiento: dia(0), prioridad: "alta", quienObjeto: "candidatos", quienId: ids[0] });
  await ctx.nuevo("tareas", { asunto: "Enviar la ficha con los precios", fechaVencimiento: dia(0), prioridad: "normal", quienObjeto: "candidatos", quienId: ids[5] });
  await ctx.nuevo("tareas", { asunto: constructora ? "Actualizar las unidades disponibles" : "Actualizar la disponibilidad del inventario", fechaVencimiento: dia(-1), prioridad: "baja" });
}

// ---------------------------------------------------------------------------
// Machea como su propia empresa cliente: empresas prospecto, llamadas de Camila y demos
// ---------------------------------------------------------------------------

async function ejemploMachea(ctx: Contexto) {
  const prospectos = [
    { nombre: "Laura", apellidos: "Mejía", compania: "Constructora Aurora S.A.S.", cargo: "Gerente comercial", ciudad: "Medellín", valoracion: "caliente", estado: "calificado", origen: "camila", telefono: "+57 604 555 3001", email: "laura.mejia@aurora.example", interes: "Más de 300 leads al mes sin respuesta rápida" },
    { nombre: "Andrés", apellidos: "Pardo", compania: "Inmobiliaria Torres & Asociados", cargo: "Director", ciudad: "Bogotá", valoracion: "caliente", estado: "contactado", origen: "demo_web", telefono: "+57 601 555 3002", email: "andres@torres.example", interes: "Quiere ver una demo con su marca" },
    { nombre: "Paola", apellidos: "Giraldo", compania: "Grupo Hábitat", cargo: "Jefa de ventas", ciudad: "Cali", valoracion: "tibio", estado: "en_seguimiento", origen: "camila", telefono: "+57 602 555 3003", email: "paola@habitat.example", interes: "Ya usa un CRM, quiere comparar" },
    { nombre: "Camilo", apellidos: "Ortiz", compania: "Casas del Valle", cargo: "Gerente", ciudad: "Cali", valoracion: "tibio", estado: "nuevo", origen: "camila", telefono: "+57 602 555 3004", email: "camilo@casasdelvalle.example", interes: "Pidió que lo llamen la próxima semana" },
    { nombre: "Natalia", apellidos: "Rojas", compania: "Urbania Inmuebles", cargo: "Coordinadora de mercadeo", ciudad: "Barranquilla", valoracion: "frio", estado: "contactado", origen: "demo_web", telefono: "+57 605 555 3005", email: "natalia@urbania.example", interes: "Pauta en Meta sin seguimiento de leads" },
    { nombre: "Julián", apellidos: "Vargas", compania: "Constructora Pórtico", cargo: "Gerente general", ciudad: "Bogotá", valoracion: "frio", estado: "no_calificado", origen: "camila", telefono: "+57 601 555 3006", email: "julian@portico.example", interes: "No le interesa por ahora" },
    { nombre: "Daniela", apellidos: "Suárez", compania: "Inmobiliaria Sendero", cargo: "Directora comercial", ciudad: "Bucaramanga", valoracion: "caliente", estado: "nuevo", origen: "demo_web", telefono: "+57 607 555 3007", email: "daniela@sendero.example", interes: "Quiere automatizar el primer contacto" },
  ];
  const ids: string[] = [];
  for (const p of prospectos) {
    ids.push(
      await ctx.nuevo("candidatos", {
        ...p,
        pais: "Colombia",
        descripcion: `**${p.compania}** — ${p.interes}.`,
        respuestas: [
          { clave: "leads_mes", etiqueta: "¿Cuántos leads recibe al mes?", valor: ["Más de 300", "Entre 100 y 300", "Menos de 100"][prospectos.indexOf(p) % 3]! },
          { clave: "pauta", etiqueta: "¿Invierte en pauta?", valor: prospectos.indexOf(p) % 2 === 0 ? "Sí, en Meta y Google" : "No por ahora" },
          { clave: "crm", etiqueta: "¿Qué usa hoy para dar seguimiento?", valor: ["Excel", "Un CRM", "Nada"][prospectos.indexOf(p) % 3]! },
        ],
      }),
    );
  }

  const camila = (i: number, resumen: string, recomendacion: string, objecion: string | null, cita: Date | null, turnos: Turno[]) =>
    llamadaDeAgente(ctx, {
      persona: ids[i]!,
      agente: "Camila",
      id: `ejemplo-${i}`,
      asunto: `Llamada de Camila – ${prospectos[i]!.compania}`,
      temp: prospectos[i]!.valoracion as "caliente" | "tibio" | "frio",
      resumen,
      recomendacion,
      objecion,
      cita,
      asuntoCita: `Demo – ${prospectos[i]!.compania}`,
      ubicacionCita: "Videollamada",
      turnos,
    });
  await camila(
    0,
    "Laura recibe más de 300 leads al mes y su equipo tarda horas en llamarlos. Se comprometió a ver una demo con su gerente de ventas.",
    "Prepare la demo con su marca y muéstrele el tiempo de primera respuesta. Invite también a su gerente de ventas.",
    "Quiere ver que el agente suene natural.",
    hora(2, 11),
    [
      { s: 1.5, r: "a", t: "Hola Laura, te habla Camila de Machea. Te llamo porque vimos que Constructora Aurora tiene varios proyectos en Medellín. ¿Tienes un minuto?" },
      { s: 9.0, r: "u", t: "Sí, dime, estoy entre reuniones." },
      { s: 11.4, r: "a", t: "Seré breve: Machea llama a cada lead de tus proyectos segundos después de que llena el formulario y le deja el resumen a tu asesor. ¿Cuántos leads reciben al mes?" },
      { s: 22.1, r: "u", t: "Más de trescientos, y la verdad nos demoramos en llamarlos." },
      { s: 27.5, r: "a", t: "Justo eso resolvemos. ¿Te muestro cómo funciona en una demo de veinte minutos, esta semana?" },
      { s: 34.0, r: "u", t: "Dale, pero quiero que la vea mi gerente de ventas. ¿El jueves a las once?" },
      { s: 40.2, r: "a", t: "Perfecto, el jueves a las once por videollamada. Te escribo el enlace por WhatsApp." },
    ],
  );
  await camila(
    2,
    "Paola ya usa un CRM y quiere entender en qué se diferencia. No tiene afán.",
    "Envíele una comparación corta y proponga una demo cuando termine su temporada de ferias.",
    "Ya tienen un CRM y no quieren cambiarlo.",
    null,
    [
      { s: 1.6, r: "a", t: "Hola Paola, te habla Camila de Machea. ¿Tienes un minuto?" },
      { s: 6.5, r: "u", t: "Dime." },
      { s: 8.0, r: "a", t: "¿Cómo le dan seguimiento hoy a los leads de Grupo Hábitat?" },
      { s: 13.4, r: "u", t: "Tenemos un CRM, no quisiéramos cambiarlo." },
      { s: 18.0, r: "a", t: "No tendrías que hacerlo: Machea llama y califica al lead y deja el resultado donde ya trabajas. ¿Te envío cómo funciona?" },
      { s: 27.2, r: "u", t: "Sí, envíamelo y lo miro con calma." },
    ],
  );
  await camila(
    5,
    "Julián dijo que por ahora no necesitan automatizar la atención de leads.",
    "No insistir. Volver a contactarlo en tres meses.",
    "No es prioridad ahora.",
    null,
    [
      { s: 1.4, r: "a", t: "Hola Julián, te habla Camila de Machea. ¿Tienes un minuto?" },
      { s: 6.0, r: "u", t: "Ahora no tengo tiempo, y no estamos buscando nada así." },
      { s: 10.0, r: "a", t: "Entiendo, gracias por tu tiempo. Que tengas buen día." },
    ],
  );

  await ctx.nuevo("oportunidades", { nombre: "Constructora Aurora – Plan Crecimiento", etapa: "reunion_presentacion", fechaCierre: dia(30), importe: 1650000 });
  await ctx.nuevo("oportunidades", { nombre: "Inmobiliaria Torres & Asociados – Plan Esencial", etapa: "calificar", fechaCierre: dia(45), importe: 990000 });

  await ctx.nuevo("eventos", { asunto: "Demo – Inmobiliaria Torres & Asociados", descripcion: "Pidió una demo en la web.", inicio: hora(1, 15), fin: hora(1, 16), ubicacion: "Videollamada", quienObjeto: "candidatos", quienId: ids[1] });
  await ctx.nuevo("eventos", { asunto: "Llamada de seguimiento – Grupo Hábitat", inicio: hora(4, 10), fin: hora(4, 10, 30), quienObjeto: "candidatos", quienId: ids[2] });

  await ctx.nuevo("tareas", { asunto: "Llamar a Daniela Suárez (pidió una demo)", fechaVencimiento: dia(0), prioridad: "alta", quienObjeto: "candidatos", quienId: ids[6] });
  await ctx.nuevo("tareas", { asunto: "Enviar la comparación a Paola Giraldo", fechaVencimiento: dia(0), prioridad: "normal", quienObjeto: "candidatos", quienId: ids[2] });
  await ctx.nuevo("tareas", { asunto: "Preparar la demo con la marca de Constructora Aurora", fechaVencimiento: dia(1), prioridad: "alta", quienObjeto: "candidatos", quienId: ids[0] });
  await ctx.nuevo("tareas", { asunto: "Volver a contactar a Constructora Pórtico", fechaVencimiento: dia(-1), prioridad: "baja", quienObjeto: "candidatos", quienId: ids[5] });
}

/**
 * Si la empresa ya tiene asesores en el reparto, los leads de ejemplo se reparten entre ellos con tiempos de respuesta
 * variados (uno recién llegado, otros contactados en minutos, otros esperando horas), para ver el panel del gerente y
 * «Mi día» con vida. Solo toca lo que quedó a nombre del dueño.
 */
async function repartirEntreElEquipo(empresaId: string, duenoId: string): Promise<void> {
  const asesores = await enElReparto(empresaId);
  if (asesores.length === 0) return;
  const db = await bd();
  const propios = await db
    .select({ id: candidatos.id, estado: candidatos.estado })
    .from(candidatos)
    .where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.propietarioId, duenoId), eq(candidatos.convertido, false)))
    .orderBy(asc(candidatos.creadoEn));
  // Horas desde que llegó el lead y minutos que tardó el primer contacto, en el mismo orden de los leads.
  const horasAtras = [0.05, 5, 30, 0.2, 52, 9, 80, 2, 27, 6];
  const minutosHastaContacto = [2, 4, 3, 3, 18, 1, 6, 12, 2, 5];
  for (const [i, c] of propios.entries()) {
    const asesor = asesores[i % asesores.length]!;
    const llego = new Date(Date.now() - horasAtras[i % horasAtras.length]! * 3_600_000);
    const contactado = c.estado !== "nuevo";
    await db
      .update(candidatos)
      .set({
        propietarioId: asesor.id,
        creadoEn: llego,
        asignadoEn: llego,
        primerContactoEn: contactado ? new Date(llego.getTime() + minutosHastaContacto[i % minutosHastaContacto.length]! * 60_000) : null,
      })
      .where(eq(candidatos.id, c.id));
    await db.update(tareas).set({ propietarioId: asesor.id }).where(and(eq(tareas.empresaId, empresaId), eq(tareas.quienId, c.id), eq(tareas.propietarioId, duenoId)));
    await db.update(eventos).set({ propietarioId: asesor.id }).where(and(eq(eventos.empresaId, empresaId), eq(eventos.quienId, c.id), eq(eventos.propietarioId, duenoId)));
  }
}
