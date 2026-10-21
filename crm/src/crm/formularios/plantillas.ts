import type { CampoForm, ConfigFormulario } from "./tipos";

/**
 * Plantillas con las que arranca cada tipo de empresa: las preguntas que de verdad usa un asesor, ya con su marca
 * por defecto. La empresa las edita como quiera; nada es obligatorio salvo el nombre y el teléfono.
 */

export type PlantillaId = "comprador" | "proyecto" | "demo";

export const PLANTILLAS: Record<PlantillaId, { etiqueta: string; descripcion: string }> = {
  comprador: { etiqueta: "Interesado en un inmueble", descripcion: "Compra o arriendo, tipo de inmueble, zona y presupuesto." },
  proyecto: { etiqueta: "Interesado en un proyecto", descripcion: "Proyecto, ingresos del hogar, subsidio y cuota inicial." },
  demo: { etiqueta: "Agenda una demo (empresas)", descripcion: "Tipo de empresa, leads al mes, pauta y qué quiere resolver." },
};

const campo = (c: CampoForm): CampoForm => c;

export const CAMPOS_BASE = {
  nombre: campo({ id: "nombre", tipo: "texto", etiqueta: "Nombre completo", requerido: true, mapea: "nombreCompleto", ayuda: "Nombre y apellido" }),
  telefono: campo({ id: "telefono", tipo: "telefono", etiqueta: "Celular", requerido: true, mapea: "telefono", ayuda: "Para llamarte o escribirte por WhatsApp" }),
  correo: campo({ id: "correo", tipo: "correo", etiqueta: "Correo electrónico", requerido: false, mapea: "email" }),
  ciudad: campo({ id: "ciudad", tipo: "texto", etiqueta: "Ciudad", requerido: false, mapea: "ciudad" }),
  mensaje: campo({ id: "mensaje", tipo: "parrafo", etiqueta: "¿Algo más que quieras contarnos?", requerido: false }),
  empresa: campo({ id: "empresa", tipo: "texto", etiqueta: "Empresa", requerido: true, mapea: "compania" }),
  cargo: campo({ id: "cargo", tipo: "texto", etiqueta: "Cargo", requerido: false, mapea: "cargo" }),
} as const;

/** Preguntas que se pueden agregar con un clic al armar un formulario, además de las de la plantilla. */
export const BIBLIOTECA: { grupo: string; campos: CampoForm[] }[] = [
  {
    grupo: "Datos de contacto",
    campos: [CAMPOS_BASE.correo, CAMPOS_BASE.ciudad, CAMPOS_BASE.mensaje, CAMPOS_BASE.empresa, CAMPOS_BASE.cargo],
  },
  {
    grupo: "Vivienda",
    campos: [
      campo({ id: "operacion", tipo: "lista", etiqueta: "¿Qué buscas?", requerido: false, opciones: ["Comprar", "Arrendar"] }),
      campo({ id: "tipo_inmueble", tipo: "lista", etiqueta: "Tipo de inmueble", requerido: false, opciones: ["Apartamento", "Casa", "Apartaestudio", "Local u oficina", "Lote"] }),
      campo({ id: "zona", tipo: "texto", etiqueta: "Zona o barrio de interés", requerido: false }),
      campo({ id: "presupuesto", tipo: "lista", etiqueta: "Presupuesto", requerido: false, opciones: ["Hasta $200 millones", "$200 a $400 millones", "$400 a $700 millones", "Más de $700 millones"] }),
      campo({ id: "habitaciones", tipo: "lista", etiqueta: "Habitaciones", requerido: false, opciones: ["1", "2", "3", "4 o más"] }),
      campo({ id: "para_cuando", tipo: "lista", etiqueta: "¿Para cuándo lo necesitas?", requerido: false, opciones: ["Lo antes posible", "En 3 a 6 meses", "En más de un año", "Solo estoy mirando"] }),
      campo({ id: "interes", tipo: "catalogo", etiqueta: "¿Cuál te interesa?", requerido: false, mapea: "interes" }),
    ],
  },
  {
    grupo: "Calificación",
    campos: [
      campo({ id: "ingresos", tipo: "lista", etiqueta: "Ingresos del hogar", requerido: false, opciones: ["Menos de 2 salarios mínimos", "De 2 a 4 salarios mínimos", "De 4 a 8 salarios mínimos", "Más de 8 salarios mínimos"] }),
      campo({ id: "cuota_inicial", tipo: "lista", etiqueta: "¿Tienes la cuota inicial?", requerido: false, opciones: ["Sí, completa", "Parcialmente", "Todavía no"] }),
      campo({ id: "subsidio", tipo: "lista", etiqueta: "¿Quieres aplicar a un subsidio?", requerido: false, opciones: ["Sí", "No", "No sé"] }),
      campo({ id: "acepta_whatsapp", tipo: "casilla", etiqueta: "Prefiero que me escriban por WhatsApp", requerido: false }),
    ],
  },
  {
    grupo: "Empresas (ventas B2B)",
    campos: [
      campo({ id: "tipo_empresa", tipo: "lista", etiqueta: "Tipo de empresa", requerido: false, opciones: ["Constructora", "Inmobiliaria", "Otra"] }),
      campo({ id: "leads_mes", tipo: "lista", etiqueta: "¿Cuántos leads reciben al mes?", requerido: false, opciones: ["Menos de 100", "Entre 100 y 300", "Más de 300"] }),
      campo({ id: "pauta", tipo: "lista", etiqueta: "¿Invierten en pauta?", requerido: false, opciones: ["Sí, en Meta y Google", "Solo en portales", "No por ahora"] }),
      campo({ id: "crm_actual", tipo: "lista", etiqueta: "¿Qué usan hoy para dar seguimiento?", requerido: false, opciones: ["Nada", "Excel", "Un CRM"] }),
    ],
  },
];

const bibliotecaPorId = new Map(BIBLIOTECA.flatMap((g) => g.campos).map((c) => [c.id, c]));
const de = (...ids: string[]): CampoForm[] => ids.map((id) => bibliotecaPorId.get(id)!).filter(Boolean);

/**
 * Texto base de la autorización de datos (Ley 1581 de 2012). Es un borrador: lo que está entre corchetes lo completa
 * la empresa y debe revisarlo su abogado. Dice que una asistente virtual puede llamar y que la conversación puede
 * grabarse y transcribirse, porque es lo que hace el agente de voz.
 */
export function textoAutorizacion(empresa: string): string {
  const nombre = empresa.trim() || "[nombre de la empresa]";
  return (
    `Autorizo a ${nombre} a tratar mis datos personales (nombre, teléfono, correo y mis respuestas) para contactarme por llamada, ` +
    `WhatsApp o correo, informarme sobre su oferta y hacer seguimiento a mi solicitud. Una asistente virtual puede llamarme; ` +
    `la llamada puede ser grabada y transcrita para resumirla a un asesor. ${nombre} es la responsable del tratamiento y Machea ` +
    `actúa como su encargado, sin usar mis datos para fines propios. Puedo consultar, actualizar, rectificar o suprimir mis datos y ` +
    `revocar esta autorización escribiendo a [correo de la empresa]. Política de tratamiento: [enlace a la política de la empresa].`
  );
}

export function plantillaFormulario(id: PlantillaId, empresa: string): { nombre: string; config: ConfigFormulario } {
  const base = { marca: { color: "#ff6259", logoUrl: "", nombre: empresa.trim() }, consentimiento: { activo: true, texto: textoAutorizacion(empresa), version: "borrador-1" } };
  switch (id) {
    case "proyecto":
      return {
        nombre: "Interesados en un proyecto",
        config: {
          ...base,
          campos: [CAMPOS_BASE.nombre, CAMPOS_BASE.telefono, CAMPOS_BASE.correo, ...de("interes", "ingresos", "cuota_inicial", "subsidio", "para_cuando"), CAMPOS_BASE.mensaje].map((c) =>
            c.id === "interes" ? { ...c, etiqueta: "¿Qué proyecto te interesa?", requerido: true } : c,
          ),
          textos: { titulo: "Conoce nuestros proyectos", subtitulo: "Déjanos tus datos y un asesor te contacta para contarte todo y agendar una visita.", boton: "Quiero que me contacten", exitoTitulo: "¡Listo! Recibimos tus datos", exitoMensaje: "Un asesor te contactará muy pronto." },
        },
      };
    case "demo":
      return {
        nombre: "Agenda una demo",
        config: {
          ...base,
          campos: [CAMPOS_BASE.nombre, CAMPOS_BASE.cargo, CAMPOS_BASE.empresa, CAMPOS_BASE.telefono, { ...CAMPOS_BASE.correo, requerido: true }, ...de("tipo_empresa", "leads_mes", "pauta", "crm_actual"), { ...CAMPOS_BASE.mensaje, etiqueta: "¿Qué te gustaría resolver?" }],
          textos: { titulo: "Agenda una demo", subtitulo: "Te mostramos cómo atender cada lead en minutos, con tu marca.", boton: "Agendar mi demo", exitoTitulo: "¡Gracias! Recibimos tu solicitud", exitoMensaje: "Te contactaremos para coordinar la demo." },
        },
      };
    default:
      return {
        nombre: "Interesados en un inmueble",
        config: {
          ...base,
          campos: [CAMPOS_BASE.nombre, CAMPOS_BASE.telefono, CAMPOS_BASE.correo, ...de("operacion", "tipo_inmueble", "zona", "presupuesto", "interes"), CAMPOS_BASE.mensaje].map((c) =>
            c.id === "operacion" ? { ...c, requerido: true } : c,
          ),
          textos: { titulo: "Cuéntanos qué buscas", subtitulo: "Un asesor te contacta con opciones que se ajusten a lo que necesitas.", boton: "Quiero que me contacten", exitoTitulo: "¡Listo! Recibimos tus datos", exitoMensaje: "Un asesor te contactará muy pronto." },
        },
      };
  }
}
