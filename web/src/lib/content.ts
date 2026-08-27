import {
  Bot,
  CircleSlash,
  House,
  MessageCircleMore,
  Target,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export type DemoMatch = {
  compatibilidad: string;
  proyecto: string;
  localidad: string;
  precioDesdeCop: number;
  zonasEnComun: string[];
  urlFicha: string;
};

export type Demo = {
  id: string;
  route: string;
  title: string;
  signal: string;
  description: string;
  icon: LucideIcon;
  /** Salida real del motor de recomendación (main.py · recomendar()) sobre el catálogo
   * de 96 proyectos scrapeados — no es texto de ejemplo, es un resultado real del modelo. */
  match?: DemoMatch;
};

export const demos: Demo[] = [
  {
    id: "vis",
    route: "Ruta 01",
    title: "Primera Vivienda (VIS)",
    signal: "Ingresos + subsidio + zona",
    description:
      "Manuela perfila ingresos, valida subsidios potenciales y matchea con proyectos VIS en la zona de interés del lead.",
    icon: House,
    match: {
      compatibilidad: "97%",
      proyecto: "Florecer",
      localidad: "Bosa",
      precioDesdeCop: 207580000,
      zonasEnComun: ["Lobby", "Zona BBQ"],
      urlFicha: "https://www.colsubsidio.com/vivienda/proyectos/bogota/florecer",
    },
  },
  {
    id: "inversionista",
    route: "Ruta 02",
    title: "Inversionista",
    signal: "Objetivo + horizonte + ticket",
    description:
      "La llamada se enfoca en rentabilidad, plusvalía y forma de pago para proyectos sobre planos.",
    icon: Target,
    match: {
      compatibilidad: "88%",
      proyecto: "Celeste - Tramonte",
      localidad: "Suba",
      precioDesdeCop: 499060000,
      zonasEnComun: ["Lobby", "Coworking", "Gimnasio"],
      urlFicha: "https://www.constructorabolivar.com/proyectos-vivienda/bogota/celeste-tramonte",
    },
  },
  {
    id: "familia",
    route: "Ruta 03",
    title: "Upgrade Familiar",
    signal: "Momento vital + prioridades",
    description:
      "Perfila familias que buscan más espacio, y ordena prioridades como colegios, zonas verdes y amenidades.",
    icon: UsersRound,
    match: {
      compatibilidad: "92%",
      proyecto: "La Unión I de la Marlene",
      localidad: "Bosa",
      precioDesdeCop: 231700000,
      zonasEnComun: ["Salón social"],
      urlFicha: "https://cusezar.com/proyectos/con-subsidio/la-union-i/?ciudad=bogota",
    },
  },
  {
    id: "descarte",
    route: "Ruta 04",
    title: "Descarte Inteligente",
    signal: "Sin encaje → nutrición",
    description:
      "Si la cuota estimada supera el 30% del ingreso declarado, el motor lo marca sin capacidad de compra hoy y lo envía a nutrición en vez de a un asesor.",
    icon: CircleSlash,
  },
  {
    id: "handoff",
    route: "Ruta 05",
    title: "Handoff a Asesor",
    signal: "Ficha completa + siguiente paso",
    description:
      "El momento clave: el asesor recibe el proyecto exacto, el % de compatibilidad y las zonas comunes en común — no un contacto crudo.",
    icon: MessageCircleMore,
  },
];

export type Step = {
  number: string;
  title: string;
  description: string;
  tag: string;
  icon: LucideIcon;
};

export const steps: Step[] = [
  {
    number: "01",
    title: "Captura interactiva",
    description:
      'Leemos tu web y catálogo actual, y cambiamos el formulario genérico por una experiencia "arma tu vivienda ideal".',
    tag: "Tu web, sin reconstruirla",
    icon: House,
  },
  {
    number: "02",
    title: "Calificación con IA (Manuela)",
    description:
      "Nuestra agente de voz contacta al lead en segundos, mantiene una charla natural y evalúa capacidad de pago real.",
    tag: "Menos de 30 segundos",
    icon: Bot,
  },
  {
    number: "03",
    title: "Match comercial",
    description:
      "Solo si hay match real, el asesor recibe la ficha completa por WhatsApp o CRM para cerrar la conversación.",
    tag: "CRM o WhatsApp que ya usas",
    icon: MessageCircleMore,
  },
];
