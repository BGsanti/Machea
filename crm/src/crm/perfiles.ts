import type { EnlaceNav } from "./apps";

/**
 * Qué cambia según el tipo de empresa. El CRM es el mismo para todas; cada perfil decide qué ve en la barra
 * lateral, qué catálogo tiene, qué columnas muestran sus leads, cómo se saluda el inicio y con qué plantillas de
 * formulario empieza.
 *
 * - inmobiliaria: vende y arrienda inmuebles de terceros. Catálogo: inmuebles (venta o arriendo, con su dueño).
 * - constructora: vende unidades de sus propios proyectos. Catálogo: proyectos (etapa, entrega, precios, subsidio).
 * - machea: Machea vendiéndole a inmobiliarias y constructoras. Sus leads son empresas, no compradores: la primera
 *   «empresa cliente» del producto somos nosotros.
 *
 * Los perfiles no cambian la base de datos: todas las empresas tienen las mismas tablas.
 */

export type PerfilId = "inmobiliaria" | "constructora" | "machea";

export interface EnlaceRapido {
  etiqueta: string;
  href: string;
  icono: string;
  primario?: boolean;
}

export interface Perfil {
  id: PerfilId;
  etiqueta: string;
  descripcion: string;
  /** El catálogo propio de este tipo de empresa, o null si no tiene. */
  catalogo: { objeto: "proyectos" | "inmuebles"; etiqueta: string; etiquetaPlural: string; icono: string } | null;
  /** Barra lateral, sin «Más herramientas». */
  nav: EnlaceNav[];
  leads: {
    columnas: string[];
    resaltados: string[];
    /** Cómo se llama a quien aparece en esta lista, en singular y plural. */
    singular: string;
    plural: string;
  };
  inicio: {
    /** Frase de apoyo bajo el saludo. */
    resumen: string;
    acciones: EnlaceRapido[];
    etiquetaNegocios: string;
  };
  /** Qué suele querer saber una persona de este tipo de empresa al llegar. */
  formulario: { plantillaInicial: string };
}

const inicio: EnlaceNav = { id: "inicio", etiqueta: "Inicio", icono: "House", href: "/inicio", prefijos: ["/inicio"] };
const leads = (etiqueta = "Leads"): EnlaceNav => ({ id: "leads", etiqueta, icono: "UserPlus", href: "/ventas/o/candidatos", prefijos: ["/ventas/o/candidatos"] });
const contactos: EnlaceNav = { id: "contactos", etiqueta: "Contactos", icono: "Users", href: "/contactos", prefijos: ["/contactos", "/ventas/o/contactos"] };
const empresas: EnlaceNav = { id: "empresas", etiqueta: "Empresas", icono: "Building", href: "/cuentas", prefijos: ["/cuentas", "/ventas/o/cuentas"] };
const negocios: EnlaceNav = { id: "negocios", etiqueta: "Negocios", icono: "Crown", href: "/ventas/o/oportunidades", prefijos: ["/ventas/o/oportunidades"] };
const citas = (etiqueta = "Citas"): EnlaceNav => ({
  id: "citas",
  etiqueta,
  icono: "CalendarDays",
  href: "/ventas/p/calendario",
  prefijos: ["/ventas/p/calendario", "/ventas/o/eventos"],
});
const formularios: EnlaceNav = { id: "formularios", etiqueta: "Formularios", icono: "ClipboardList", href: "/formularios", prefijos: ["/formularios"] };
const equipo: EnlaceNav = { id: "equipo", etiqueta: "Equipo", icono: "UserCog", href: "/equipo", prefijos: ["/equipo"] };
const analisis: EnlaceNav = { id: "analisis", etiqueta: "Análisis", icono: "ChartPie", href: "/ventas/p/analisis", prefijos: ["/ventas/p/analisis"] };
const automatizacion: EnlaceNav = { id: "automatizacion", etiqueta: "Automatización", icono: "Workflow", href: "/automatizacion", prefijos: ["/automatizacion"] };

const columnasCompradores = ["nombre", "telefono", "interes", "valoracion", "estado", "origen", "creadoEn", "propietarioId"];
const resaltadosCompradores = ["telefono", "email", "interes", "valoracion", "origen"];

export const PERFILES: Record<PerfilId, Perfil> = {
  inmobiliaria: {
    id: "inmobiliaria",
    etiqueta: "Inmobiliaria",
    descripcion: "Vende y arrienda inmuebles de sus propietarios.",
    catalogo: { objeto: "inmuebles", etiqueta: "Inmueble", etiquetaPlural: "Inmuebles", icono: "Building2" },
    nav: [
      inicio,
      leads(),
      { id: "inmuebles", etiqueta: "Inmuebles", icono: "Building2", href: "/ventas/o/inmuebles", prefijos: ["/ventas/o/inmuebles"] },
      contactos,
      citas(),
      negocios,
      formularios,
      equipo,
      analisis,
      automatizacion,
    ],
    leads: { columnas: columnasCompradores, resaltados: resaltadosCompradores, singular: "Lead", plural: "Leads" },
    inicio: {
      resumen: "Los interesados que llegaron, las visitas de la semana y lo que hay que llamar hoy.",
      acciones: [
        { etiqueta: "Nuevo lead", href: "/ventas/o/candidatos?nuevo=1", icono: "UserPlus", primario: true },
        { etiqueta: "Nuevo inmueble", href: "/ventas/o/inmuebles?nuevo=1", icono: "Building2" },
        { etiqueta: "Formularios", href: "/formularios", icono: "ClipboardList" },
        { etiqueta: "Ver citas", href: "/ventas/p/calendario", icono: "CalendarDays" },
      ],
      etiquetaNegocios: "Negocios abiertos",
    },
    formulario: { plantillaInicial: "comprador" },
  },
  constructora: {
    id: "constructora",
    etiqueta: "Constructora",
    descripcion: "Vende las unidades de sus propios proyectos.",
    catalogo: { objeto: "proyectos", etiqueta: "Proyecto", etiquetaPlural: "Proyectos", icono: "HardHat" },
    nav: [
      inicio,
      leads(),
      { id: "proyectos", etiqueta: "Proyectos", icono: "HardHat", href: "/ventas/o/proyectos", prefijos: ["/ventas/o/proyectos"] },
      contactos,
      citas("Visitas"),
      negocios,
      formularios,
      equipo,
      analisis,
      automatizacion,
    ],
    leads: { columnas: columnasCompradores, resaltados: resaltadosCompradores, singular: "Lead", plural: "Leads" },
    inicio: {
      resumen: "Los interesados por cada proyecto, las visitas a la sala de ventas y lo que hay que llamar hoy.",
      acciones: [
        { etiqueta: "Nuevo lead", href: "/ventas/o/candidatos?nuevo=1", icono: "UserPlus", primario: true },
        { etiqueta: "Nuevo proyecto", href: "/ventas/o/proyectos?nuevo=1", icono: "HardHat" },
        { etiqueta: "Formularios", href: "/formularios", icono: "ClipboardList" },
        { etiqueta: "Ver visitas", href: "/ventas/p/calendario", icono: "CalendarDays" },
      ],
      etiquetaNegocios: "Ventas en curso",
    },
    formulario: { plantillaInicial: "proyecto" },
  },
  machea: {
    id: "machea",
    etiqueta: "Machea (ventas B2B)",
    descripcion: "Machea vendiéndole a inmobiliarias y constructoras: sus leads son empresas.",
    catalogo: null,
    nav: [inicio, leads(), empresas, contactos, citas("Demos"), negocios, formularios, equipo, analisis, automatizacion],
    leads: {
      columnas: ["nombre", "compania", "cargo", "telefono", "valoracion", "estado", "origen", "creadoEn"],
      resaltados: ["compania", "cargo", "telefono", "email", "valoracion"],
      singular: "Lead",
      plural: "Leads",
    },
    inicio: {
      resumen: "Las empresas que Camila llamó, las demos que pidieron en la web y lo que hay que atender hoy.",
      acciones: [
        { etiqueta: "Nuevo lead", href: "/ventas/o/candidatos?nuevo=1", icono: "UserPlus", primario: true },
        { etiqueta: "Importar empresas", href: "/ventas/o/candidatos?importar=1", icono: "Upload" },
        { etiqueta: "Formularios", href: "/formularios", icono: "ClipboardList" },
        { etiqueta: "Ver demos", href: "/ventas/p/calendario", icono: "CalendarDays" },
      ],
      etiquetaNegocios: "Negocios abiertos",
    },
    formulario: { plantillaInicial: "demo" },
  },
};

export const PERFIL_POR_DEFECTO: PerfilId = "inmobiliaria";

export function esPerfil(valor: unknown): valor is PerfilId {
  return typeof valor === "string" && valor in PERFILES;
}

/** El perfil de un valor guardado; si no se reconoce, el de por defecto. */
export function perfilDe(valor: unknown): Perfil {
  return PERFILES[esPerfil(valor) ? valor : PERFIL_POR_DEFECTO];
}
