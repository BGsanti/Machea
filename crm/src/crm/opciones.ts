import type { Opcion } from "./tipos";

const verde = "bg-emerald-100 text-emerald-800";
const rojo = "bg-rose-100 text-rose-800";
const ambar = "bg-amber-100 text-amber-800";
const azul = "bg-sky-100 text-sky-800";
const violeta = "bg-violet-100 text-violet-800";
const gris = "bg-slate-100 text-slate-700";

export const tiposCuenta: Opcion[] = [
  { valor: "analista", etiqueta: "Analista" },
  { valor: "competidor", etiqueta: "Competidor" },
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "integrador", etiqueta: "Integrador" },
  { valor: "inversor", etiqueta: "Inversor" },
  { valor: "socio", etiqueta: "Socio" },
  { valor: "prensa", etiqueta: "Prensa" },
  { valor: "prospecto", etiqueta: "Prospecto" },
  { valor: "revendedor", etiqueta: "Revendedor" },
  { valor: "otro", etiqueta: "Otro" },
];

export const tratamientos: Opcion[] = ["Sr.", "Sra.", "Dr.", "Dra.", "Prof.", "Mx."].map((t) => ({
  valor: t,
  etiqueta: t,
}));

export const estadosCandidato: Opcion[] = [
  { valor: "nuevo", etiqueta: "Nuevo", color: azul },
  { valor: "contactado", etiqueta: "Contactado", color: violeta },
  { valor: "en_seguimiento", etiqueta: "En seguimiento", color: ambar },
  { valor: "calificado", etiqueta: "Calificado", color: verde },
  { valor: "no_calificado", etiqueta: "No calificado", color: rojo },
];

export const valoraciones: Opcion[] = [
  { valor: "caliente", etiqueta: "Caliente", color: rojo },
  { valor: "tibio", etiqueta: "Tibio", color: ambar },
  { valor: "frio", etiqueta: "Frío", color: azul },
];

export const origenesCandidato: Opcion[] = [
  { valor: "publicidad", etiqueta: "Publicidad" },
  { valor: "referencia_empleado", etiqueta: "Referencia de empleado" },
  { valor: "referencia_externa", etiqueta: "Referencia externa" },
  { valor: "socio", etiqueta: "Socio" },
  { valor: "relaciones_publicas", etiqueta: "Relaciones públicas" },
  { valor: "seminario_interno", etiqueta: "Seminario interno" },
  { valor: "seminario_socio", etiqueta: "Seminario de socio" },
  { valor: "feria", etiqueta: "Feria comercial" },
  { valor: "web", etiqueta: "Web" },
  { valor: "boca_a_boca", etiqueta: "Boca a boca" },
  // Leads que llegan de Machea (src/crm/servidor/ingesta.ts).
  { valor: "formulario_marca", etiqueta: "Formulario con su marca (Machea)" },
  { valor: "formulario_empresa", etiqueta: "Formulario de la empresa" },
  { valor: "camila", etiqueta: "Llamada de Camila" },
  { valor: "demo_web", etiqueta: "Pidió una demo en la web" },
  { valor: "proyecto_machea", etiqueta: "Su proyecto en Machea" },
  { valor: "otro", etiqueta: "Otro" },
];

export const sectores: Opcion[] = [
  ["agricultura", "Agricultura"],
  ["textil", "Textil y confección"],
  ["banca", "Banca"],
  ["biotecnologia", "Biotecnología"],
  ["quimica", "Química"],
  ["comunicaciones", "Comunicaciones"],
  ["construccion", "Construcción"],
  ["consultoria", "Consultoría"],
  ["educacion", "Educación"],
  ["electronica", "Electrónica"],
  ["energia", "Energía"],
  ["ingenieria", "Ingeniería"],
  ["entretenimiento", "Entretenimiento"],
  ["medio_ambiente", "Medio ambiente"],
  ["finanzas", "Finanzas"],
  ["alimentos", "Alimentos y bebidas"],
  ["gobierno", "Gobierno"],
  ["salud", "Salud"],
  ["hoteleria", "Hotelería"],
  ["seguros", "Seguros"],
  ["maquinaria", "Maquinaria"],
  ["manufactura", "Manufactura"],
  ["medios", "Medios"],
  ["sin_animo_lucro", "Sin ánimo de lucro"],
  ["recreacion", "Recreación"],
  ["comercio", "Comercio minorista"],
  ["logistica", "Logística"],
  ["tecnologia", "Tecnología"],
  ["telecomunicaciones", "Telecomunicaciones"],
  ["transporte", "Transporte"],
  ["servicios_publicos", "Servicios públicos"],
  ["otro", "Otro"],
].map(([valor, etiqueta]) => ({ valor: valor!, etiqueta: etiqueta! }));

export const etapasOportunidad: Opcion[] = [
  { valor: "calificar", etiqueta: "Calificar", color: azul },
  { valor: "reunion_presentacion", etiqueta: "Reunión y presentación", color: azul },
  { valor: "proponer", etiqueta: "Proponer", color: violeta },
  { valor: "negociar", etiqueta: "Negociar", color: ambar },
  { valor: "cerrada_ganada", etiqueta: "Cerrada ganada", color: verde },
  { valor: "cerrada_perdida", etiqueta: "Cerrada perdida", color: rojo },
];

/** Probabilidad y categoría de previsión que se proponen al elegir cada etapa. */
export const valoresPorEtapa: Record<string, { probabilidad: number; categoria: string }> = {
  calificar: { probabilidad: 10, categoria: "pipeline" },
  reunion_presentacion: { probabilidad: 25, categoria: "pipeline" },
  proponer: { probabilidad: 50, categoria: "mejor_caso" },
  negociar: { probabilidad: 75, categoria: "compromiso" },
  cerrada_ganada: { probabilidad: 100, categoria: "cerrada" },
  cerrada_perdida: { probabilidad: 0, categoria: "omitida" },
};

export const etapasCerradas = ["cerrada_ganada", "cerrada_perdida"];

export const categoriasPrevision: Opcion[] = [
  { valor: "omitida", etiqueta: "Omitida" },
  { valor: "pipeline", etiqueta: "Pipeline" },
  { valor: "mejor_caso", etiqueta: "Mejor caso" },
  { valor: "compromiso", etiqueta: "Compromiso" },
  { valor: "cerrada", etiqueta: "Cerrada" },
];

export const estadosCaso: Opcion[] = [
  { valor: "nuevo", etiqueta: "Nuevo", color: azul },
  { valor: "en_curso", etiqueta: "En curso", color: violeta },
  { valor: "esperando_cliente", etiqueta: "Esperando al cliente", color: ambar },
  { valor: "escalado", etiqueta: "Escalado", color: rojo },
  { valor: "cerrado", etiqueta: "Cerrado", color: verde },
];

export const origenesCaso: Opcion[] = [
  { valor: "email", etiqueta: "Correo electrónico" },
  { valor: "telefono", etiqueta: "Teléfono" },
  { valor: "web", etiqueta: "Web" },
];

export const prioridadesCaso: Opcion[] = [
  { valor: "alta", etiqueta: "Alta", color: rojo },
  { valor: "media", etiqueta: "Media", color: ambar },
  { valor: "baja", etiqueta: "Baja", color: gris },
];

export const asuntosEvento = ["Llamada", "Correo electrónico", "Reunión", "Enviar carta o presupuesto", "Otro"];

export const estadosTarea: Opcion[] = [
  { valor: "no_iniciada", etiqueta: "No iniciada", color: gris },
  { valor: "en_curso", etiqueta: "En curso", color: azul },
  { valor: "esperando", etiqueta: "Esperando a otra persona", color: ambar },
  { valor: "aplazada", etiqueta: "Aplazada", color: violeta },
  { valor: "completada", etiqueta: "Completada", color: verde },
];

export const prioridadesTarea: Opcion[] = [
  { valor: "alta", etiqueta: "Alta", color: rojo },
  { valor: "normal", etiqueta: "Normal", color: gris },
  { valor: "baja", etiqueta: "Baja", color: gris },
];

export const tiposTarea: Opcion[] = [
  { valor: "tarea", etiqueta: "Tarea" },
  { valor: "llamada", etiqueta: "Llamada" },
  { valor: "correo", etiqueta: "Correo electrónico" },
];

export const familiasProducto: Opcion[] = [
  { valor: "productos", etiqueta: "Productos" },
  { valor: "servicios", etiqueta: "Servicios" },
  { valor: "software", etiqueta: "Software" },
  { valor: "suscripciones", etiqueta: "Suscripciones" },
  { valor: "otro", etiqueta: "Otro" },
];

export const estadosFactura: Opcion[] = [
  { valor: "borrador", etiqueta: "Borrador", color: gris },
  { valor: "emitida", etiqueta: "Emitida", color: azul },
  { valor: "pagada", etiqueta: "Pagada", color: verde },
  { valor: "vencida", etiqueta: "Vencida", color: ambar },
  { valor: "anulada", etiqueta: "Anulada", color: rojo },
];

export const estadosVideollamada: Opcion[] = [
  { valor: "programada", etiqueta: "Programada", color: azul },
  { valor: "realizada", etiqueta: "Realizada", color: verde },
  { valor: "cancelada", etiqueta: "Cancelada", color: rojo },
];

export const canalesMensajeria: Opcion[] = [
  { valor: "whatsapp", etiqueta: "WhatsApp" },
  { valor: "sms", etiqueta: "SMS" },
  { valor: "chat_web", etiqueta: "Chat web" },
  { valor: "facebook", etiqueta: "Facebook Messenger" },
  { valor: "instagram", etiqueta: "Instagram" },
];

export const estadosSesion: Opcion[] = [
  { valor: "activa", etiqueta: "Activa", color: verde },
  { valor: "en_espera", etiqueta: "En espera", color: ambar },
  { valor: "finalizada", etiqueta: "Finalizada", color: gris },
];

export const estadosArticulo: Opcion[] = [
  { valor: "borrador", etiqueta: "Borrador", color: gris },
  { valor: "publicado", etiqueta: "Publicado", color: verde },
  { valor: "archivado", etiqueta: "Archivado", color: ambar },
];

export const tiposCampana: Opcion[] = [
  { valor: "correo", etiqueta: "Correo electrónico" },
  { valor: "evento", etiqueta: "Evento" },
  { valor: "webinar", etiqueta: "Webinar" },
  { valor: "publicidad", etiqueta: "Publicidad" },
  { valor: "redes_sociales", etiqueta: "Redes sociales" },
  { valor: "otro", etiqueta: "Otro" },
];

export const estadosCampana: Opcion[] = [
  { valor: "planificada", etiqueta: "Planificada", color: gris },
  { valor: "en_curso", etiqueta: "En curso", color: azul },
  { valor: "completada", etiqueta: "Completada", color: verde },
  { valor: "cancelada", etiqueta: "Cancelada", color: rojo },
];

export const estadosCorreoLista: Opcion[] = [
  { valor: "registrado", etiqueta: "Registrado", color: azul },
  { valor: "enviado", etiqueta: "Enviado", color: verde },
];

export const estadosEstablecimiento: Opcion[] = [
  { valor: "borrador", etiqueta: "Borrador", color: gris },
  { valor: "activo", etiqueta: "Activo", color: verde },
  { valor: "inactivo", etiqueta: "Inactivo", color: rojo },
];

export const monedas: Opcion[] = [
  { valor: "COP", etiqueta: "Peso colombiano (COP)" },
  { valor: "USD", etiqueta: "Dólar estadounidense (USD)" },
  { valor: "EUR", etiqueta: "Euro (EUR)" },
  { valor: "MXN", etiqueta: "Peso mexicano (MXN)" },
];

export const disparadoresFlujo: Opcion[] = [
  { valor: "crear", etiqueta: "Cuando se crea un registro" },
  { valor: "actualizar", etiqueta: "Cuando se actualiza un registro" },
  { valor: "crear_o_actualizar", etiqueta: "Cuando se crea o actualiza un registro" },
];

export const conectores: Opcion[] = [
  { valor: "webhook", etiqueta: "Webhook (HTTP)" },
  { valor: "hubspot", etiqueta: "HubSpot" },
  { valor: "quickbooks", etiqueta: "QuickBooks Online" },
  { valor: "jira", etiqueta: "Jira" },
  { valor: "asana", etiqueta: "Asana" },
  { valor: "zendesk", etiqueta: "Zendesk" },
  { valor: "google_sheets", etiqueta: "Google Sheets" },
  { valor: "netsuite", etiqueta: "NetSuite" },
  { valor: "marketo", etiqueta: "Adobe Marketo Engage" },
  { valor: "openai", etiqueta: "OpenAI" },
];

export const estadosConexion: Opcion[] = [
  { valor: "sin_configurar", etiqueta: "Sin configurar", color: gris },
  { valor: "activa", etiqueta: "Activa", color: verde },
  { valor: "error", etiqueta: "Con error", color: rojo },
];

export const canalesTexto = ["Correo electrónico", "Teléfono", "Chat", "WhatsApp", "Portal"];

export const categoriasTexto: Opcion[] = [
  { valor: "saludos", etiqueta: "Saludos" },
  { valor: "respuestas", etiqueta: "Respuestas" },
  { valor: "despedidas", etiqueta: "Despedidas" },
  { valor: "preguntas_frecuentes", etiqueta: "Preguntas frecuentes" },
];

// Catálogo de constructoras (proyectos) y de inmobiliarias (inmuebles).

export const etapasProyecto: Opcion[] = [
  { valor: "sobre_planos", etiqueta: "Sobre planos", color: violeta },
  { valor: "en_construccion", etiqueta: "En construcción", color: ambar },
  { valor: "entrega_inmediata", etiqueta: "Entrega inmediata", color: verde },
  { valor: "agotado", etiqueta: "Agotado", color: gris },
];

export const tiposVivienda: Opcion[] = [
  { valor: "vip", etiqueta: "VIP" },
  { valor: "vis", etiqueta: "VIS" },
  { valor: "no_vis", etiqueta: "No VIS" },
];

export const operacionesInmueble: Opcion[] = [
  { valor: "venta", etiqueta: "Venta", color: azul },
  { valor: "arriendo", etiqueta: "Arriendo", color: violeta },
];

export const tiposInmueble: Opcion[] = [
  { valor: "apartamento", etiqueta: "Apartamento" },
  { valor: "casa", etiqueta: "Casa" },
  { valor: "apartaestudio", etiqueta: "Apartaestudio" },
  { valor: "local", etiqueta: "Local" },
  { valor: "oficina", etiqueta: "Oficina" },
  { valor: "bodega", etiqueta: "Bodega" },
  { valor: "lote", etiqueta: "Lote" },
];

export const estadosInmueble: Opcion[] = [
  { valor: "disponible", etiqueta: "Disponible", color: verde },
  { valor: "reservado", etiqueta: "Reservado", color: ambar },
  { valor: "vendido", etiqueta: "Vendido", color: gris },
  { valor: "arrendado", etiqueta: "Arrendado", color: gris },
  { valor: "retirado", etiqueta: "Retirado", color: rojo },
];
