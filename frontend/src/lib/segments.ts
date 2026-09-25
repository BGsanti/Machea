import { Building2, Home, Network, type LucideIcon } from "lucide-react";

export type Segmento = {
  id: string;
  eyebrow: string;
  title: string;
  pain: string;
  bullets: string[];
  icon: LucideIcon;
};

// Tres perfiles reales del mercado inmobiliario colombiano que hoy hace pauta
// digital — no son clientes ni casos de éxito (Machea todavía no los tiene:
// es el producto que se muestra en vivo en GO FEST). Cada uno describe un
// dolor real del segmento y cómo Machea lo resuelve, con las mismas
// capacidades ya probadas en el resto del sitio — nada nuevo, solo
// reorganizado por a quién le habla.
export const segmentos: Segmento[] = [
  {
    id: "inmobiliaria",
    eyebrow: "Perfil 1 · Inmobiliaria con pauta activa",
    title: "Vendes uno o pocos proyectos, con pauta activa",
    pain: "Cada peso de pauta cuesta el doble si el lead se enfría esperando a que tu único asesor tenga un espacio libre.",
    bullets: [
      "Manuela responde y califica 24/7 — sin contratar más asesores",
      "Solo los leads con capacidad de compra real llegan a tu bandeja",
      "El formulario se acopla a tu sitio actual, sin reconstruirlo",
    ],
    icon: Home,
  },
  {
    id: "constructora",
    eyebrow: "Perfil 2 · Constructora con catálogo grande",
    title: "Manejas varios proyectos y varias etapas a la vez",
    pain: "Tus asesores reparten leads a mano entre proyectos, y nadie sabe con certeza qué campaña está vendiendo de verdad.",
    bullets: [
      "El motor cruza cada lead contra todo tu catálogo, no un solo proyecto",
      "Reparto automático del lead calificado al proyecto correcto",
      "Se integra al CRM que ya usa tu equipo comercial, proyecto por proyecto",
    ],
    icon: Building2,
  },
  {
    id: "comercializadora",
    eyebrow: "Perfil 3 · Comercializadora multi-marca",
    title: "Revendes proyectos de distintas constructoras",
    pain: "Catálogos de varias marcas repartidos en los WhatsApp personales de cada asesor, sin trazabilidad ni reporte unificado.",
    bullets: [
      "Un solo motor de match, sin importar de qué constructora es el proyecto",
      "Confidencialidad de datos por anonimización entre marcas",
      "La ficha calificada llega completa a tu equipo, no al chat personal de alguien",
    ],
    icon: Network,
  },
];
