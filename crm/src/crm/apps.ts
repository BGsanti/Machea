/**
 * `oculta`: no se muestra de entrada (queda en «Agregar más elementos» del lápiz de la navegación).
 * `soloPerfiles`: solo existe para esos tipos de empresa (src/crm/perfiles.ts), por ejemplo Proyectos en constructoras.
 */
export type Pestana =
  | { tipo: "objeto"; id: string; etiqueta?: string; oculta?: boolean; soloPerfiles?: string[] }
  | { tipo: "pagina"; id: string; etiqueta: string; oculta?: boolean; soloPerfiles?: string[] };

export interface App {
  id: string;
  etiqueta: string;
  icono: string;
  pestanas: Pestana[];
}

export const apps: App[] = [
  {
    id: "inicio",
    etiqueta: "Inicio",
    icono: "House",
    pestanas: [
      { tipo: "pagina", id: "inicio", etiqueta: "Inicio" },
      { tipo: "pagina", id: "informacion-general", etiqueta: "Información general" },
    ],
  },
  { id: "contactos", etiqueta: "Contactos", icono: "Users", pestanas: [{ tipo: "objeto", id: "contactos" }] },
  { id: "cuentas", etiqueta: "Cuentas", icono: "Building", pestanas: [{ tipo: "objeto", id: "cuentas" }] },
  {
    id: "ventas",
    etiqueta: "Ventas",
    icono: "ChartNoAxesCombined",
    pestanas: [
      { tipo: "objeto", id: "candidatos" },
      { tipo: "objeto", id: "proyectos", soloPerfiles: ["constructora"] },
      { tipo: "objeto", id: "inmuebles", soloPerfiles: ["inmobiliaria"] },
      { tipo: "objeto", id: "contactos" },
      { tipo: "objeto", id: "cuentas" },
      { tipo: "objeto", id: "oportunidades" },
      { tipo: "objeto", id: "productos", oculta: true },
      { tipo: "objeto", id: "listas-precios", oculta: true },
      { tipo: "pagina", id: "calendario", etiqueta: "Calendario" },
      { tipo: "pagina", id: "analisis", etiqueta: "Análisis" },
      { tipo: "objeto", id: "facturas", oculta: true },
      { tipo: "objeto", id: "videollamadas", oculta: true },
    ],
  },
  {
    id: "servicio",
    etiqueta: "Servicio",
    icono: "LifeBuoy",
    pestanas: [
      { tipo: "objeto", id: "casos" },
      { tipo: "objeto", id: "contactos" },
      { tipo: "objeto", id: "cuentas" },
      { tipo: "pagina", id: "textos-rapidos", etiqueta: "Textos rápidos" },
      { tipo: "objeto", id: "sesiones-mensajeria" },
      { tipo: "pagina", id: "analisis", etiqueta: "Análisis" },
      { tipo: "objeto", id: "articulos", etiqueta: "Knowledge" },
    ],
  },
  {
    id: "marketing",
    etiqueta: "Marketing",
    icono: "Megaphone",
    pestanas: [
      { tipo: "pagina", id: "marketing", etiqueta: "Marketing" },
      { tipo: "objeto", id: "correos-lista" },
    ],
  },
  { id: "comercio", etiqueta: "Comercio", icono: "ShoppingCart", pestanas: [{ tipo: "objeto", id: "establecimientos", etiqueta: "Establecimiento" }] },
  { id: "su-cuenta", etiqueta: "Su cuenta", icono: "CreditCard", pestanas: [{ tipo: "pagina", id: "su-cuenta", etiqueta: "Su cuenta" }] },
  {
    id: "automatizacion",
    etiqueta: "Automatización",
    icono: "Workflow",
    pestanas: [
      { tipo: "pagina", id: "automatizacion", etiqueta: "Inicio" },
      { tipo: "objeto", id: "flujos" },
      { tipo: "pagina", id: "integraciones", etiqueta: "Integraciones" },
      { tipo: "pagina", id: "supervisar", etiqueta: "Supervisar" },
      { tipo: "pagina", id: "centro-accion", etiqueta: "Centro de acción" },
    ],
  },
];

/** Pestaña que se añade a Marketing cuando se activan las herramientas de marketing. */
export const pestanaCampanas: Pestana = { tipo: "objeto", id: "campanas" };

export function obtenerApp(id: string): App | undefined {
  return apps.find((a) => a.id === id);
}

const appsPorObjeto: Record<string, string> = {
  cuentas: "cuentas",
  contactos: "contactos",
  candidatos: "ventas",
  proyectos: "ventas",
  inmuebles: "ventas",
  oportunidades: "ventas",
  productos: "ventas",
  "listas-precios": "ventas",
  eventos: "ventas",
  tareas: "ventas",
  facturas: "ventas",
  videollamadas: "ventas",
  casos: "servicio",
  "textos-rapidos": "servicio",
  articulos: "servicio",
  "sesiones-mensajeria": "servicio",
  campanas: "marketing",
  "correos-lista": "marketing",
  establecimientos: "comercio",
  flujos: "automatizacion",
  conexiones: "automatizacion",
};

export function appDeObjeto(objeto: string): string {
  return appsPorObjeto[objeto] ?? "ventas";
}

export function enlaceRegistro(objeto: string, id: string, app?: string): string {
  return `/${app ?? appDeObjeto(objeto)}/o/${objeto}/${id}`;
}

export function enlaceLista(objeto: string, app?: string): string {
  return `/${app ?? appDeObjeto(objeto)}/o/${objeto}`;
}

export function hrefPestana(app: string, pestana: Pestana): string {
  return pestana.tipo === "objeto" ? `/${app}/o/${pestana.id}` : `/${app}/p/${pestana.id}`;
}

/**
 * Navegación de la barra lateral del panel de Machea. No quita nada: cada enlace lleva a una pestaña
 * que ya existe en `apps`, y las apps completas (Ventas, Servicio, Marketing…) siguen en «Más herramientas».
 * `prefijos` decide cuál queda marcado: gana el prefijo más largo que coincida con la ruta. La parte principal
 * de la barra depende del tipo de empresa (src/crm/perfiles.ts).
 */
export interface EnlaceNav {
  id: string;
  etiqueta: string;
  icono: string;
  href: string;
  prefijos: string[];
}

export const navMasHerramientas: EnlaceNav[] = [
  { id: "ventas", etiqueta: "Ventas (todo)", icono: "ChartNoAxesCombined", href: "/ventas", prefijos: ["/ventas"] },
  { id: "servicio", etiqueta: "Servicio", icono: "LifeBuoy", href: "/servicio", prefijos: ["/servicio"] },
  { id: "marketing", etiqueta: "Marketing", icono: "Megaphone", href: "/marketing", prefijos: ["/marketing"] },
  { id: "comercio", etiqueta: "Comercio", icono: "ShoppingCart", href: "/comercio", prefijos: ["/comercio"] },
  { id: "su-cuenta", etiqueta: "Su cuenta", icono: "CreditCard", href: "/su-cuenta", prefijos: ["/su-cuenta"] },
];

/** El enlace de la barra lateral que corresponde a una ruta (el de prefijo más largo), o undefined. */
export function enlaceActivo(ruta: string, principal: EnlaceNav[]): EnlaceNav | undefined {
  let mejor: { enlace: EnlaceNav; largo: number } | undefined;
  for (const enlace of [...principal, ...navMasHerramientas]) {
    for (const prefijo of enlace.prefijos) {
      if ((ruta === prefijo || ruta.startsWith(`${prefijo}/`)) && (!mejor || prefijo.length > mejor.largo)) {
        mejor = { enlace, largo: prefijo.length };
      }
    }
  }
  return mejor?.enlace;
}
