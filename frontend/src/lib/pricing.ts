/**
 * ==========================================
 * PRECIOS — fácil de editar
 * Mismo principio que offerConfig.ts: nada de cifras inventadas. El único
 * precio fijo que se muestra ($0 del Piloto) es el que YA existe como oferta
 * real en offerConfig.ts (auditoría gratis + piloto sin fricción). Los otros
 * dos planes se cotizan con el equipo — igual que ya responde la FAQ
 * ("el costo se confirma según el volumen de leads de tu operación").
 * ==========================================
 */
export type PlanFeature = { text: string; incluido: boolean };

export type Plan = {
  id: string;
  nombre: string;
  tagline: string;
  precio: string;
  precioNota: string;
  destacado: boolean;
  features: PlanFeature[];
  ctaText: string;
};

export const planes: Plan[] = [
  {
    id: "piloto",
    nombre: "Piloto",
    tagline: "Para probar Machea con tus propios leads, sin riesgo.",
    precio: "$0",
    precioNota: "auditoría + piloto, cupos limitados",
    destacado: false,
    features: [
      { text: "Auditoría gratuita de tu proceso actual", incluido: true },
      { text: "Motor de recomendación sobre tu catálogo", incluido: true },
      { text: "Manuela calificando tus primeros leads por voz", incluido: true },
      { text: "Un proyecto activo", incluido: true },
      { text: "Integración a tu CRM o WhatsApp actual", incluido: true },
      { text: "Multi-proyecto y reportes de atribución", incluido: false },
    ],
    ctaText: "Solicitar auditoría gratis",
  },
  {
    id: "crecimiento",
    nombre: "Crecimiento",
    tagline: "Para inmobiliarias y constructoras con pauta activa en varios proyectos.",
    precio: "Cotización",
    precioNota: "según volumen de leads de tu operación",
    destacado: true,
    features: [
      { text: "Todo lo de Piloto", incluido: true },
      { text: "Leads ilimitados", incluido: true },
      { text: "Multi-proyecto con reparto automático", incluido: true },
      { text: "Reportes de atribución por campaña", incluido: true },
      { text: "Integración a tu CRM actual, sin migrar", incluido: true },
      { text: "Soporte prioritario", incluido: true },
    ],
    ctaText: "Hablar con el equipo",
  },
  {
    id: "empresarial",
    nombre: "Empresarial",
    tagline: "Para constructoras grandes y comercializadoras multi-marca.",
    precio: "Cotización",
    precioNota: "operación a la medida",
    destacado: false,
    features: [
      { text: "Todo lo de Crecimiento", incluido: true },
      { text: "Multi-marca con confidencialidad por anonimización", incluido: true },
      { text: "Integraciones a la medida (API, CRM propio)", incluido: true },
      { text: "Gerente de cuenta dedicado", incluido: true },
      { text: "SLA de calificación acordado", incluido: true },
      { text: "Onboarding acompañado por el equipo Machea", incluido: true },
    ],
    ctaText: "Hablar con el equipo",
  },
];
