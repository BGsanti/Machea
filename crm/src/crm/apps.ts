export type Pestana =
  | { tipo: "objeto"; id: string; etiqueta?: string }
  | { tipo: "pagina"; id: string; etiqueta: string };

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
      { tipo: "objeto", id: "contactos" },
      { tipo: "objeto", id: "cuentas" },
      { tipo: "objeto", id: "oportunidades" },
      { tipo: "objeto", id: "productos" },
      { tipo: "objeto", id: "listas-precios" },
      { tipo: "pagina", id: "calendario", etiqueta: "Calendario" },
      { tipo: "pagina", id: "analisis", etiqueta: "Análisis" },
      { tipo: "objeto", id: "facturas" },
      { tipo: "objeto", id: "videollamadas" },
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
