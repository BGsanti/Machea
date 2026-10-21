import { z } from "zod";

/**
 * Un formulario de la empresa (constructor de formularios): campos, marca, textos y consentimiento. Se guarda como
 * JSON en crm.formularios.config; todo lo que llega de ahí se vuelve a validar con `esquemaConfig`.
 */

export const TIPOS_CAMPO = ["texto", "telefono", "correo", "numero", "parrafo", "lista", "casilla", "catalogo"] as const;
export type TipoCampoForm = (typeof TIPOS_CAMPO)[number];

/** A qué dato del lead va la respuesta. Lo que no se mapea queda en «Lo que contestó en el formulario». */
export const MAPEOS = ["nombreCompleto", "nombre", "apellidos", "telefono", "email", "compania", "cargo", "ciudad", "interes"] as const;
export type MapeoCampo = (typeof MAPEOS)[number];

export const ETIQUETAS_TIPO: Record<TipoCampoForm, string> = {
  texto: "Texto corto",
  telefono: "Teléfono",
  correo: "Correo",
  numero: "Número",
  parrafo: "Texto largo",
  lista: "Lista de opciones",
  casilla: "Casilla (sí / no)",
  catalogo: "Proyecto o inmueble",
};

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use un color como #ff6259.");
const urlHttps = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || /^https:\/\/[^\s]+$/i.test(u), "Debe empezar por https://");

export const esquemaCampo = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Identificador no válido."),
  tipo: z.enum(TIPOS_CAMPO),
  etiqueta: z.string().trim().min(1, "Cada pregunta necesita un texto.").max(120),
  ayuda: z.string().trim().max(160).optional(),
  requerido: z.boolean(),
  opciones: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  mapea: z.enum(MAPEOS).nullable().optional(),
});

export const esquemaConfig = z
  .object({
    campos: z.array(esquemaCampo).min(1, "Agregue al menos una pregunta.").max(25, "Máximo 25 preguntas."),
    marca: z.object({
      color,
      logoUrl: urlHttps.optional(),
      nombre: z.string().trim().max(80).optional(),
    }),
    textos: z.object({
      titulo: z.string().trim().min(1, "Escriba el título.").max(120),
      subtitulo: z.string().trim().max(240).optional(),
      boton: z.string().trim().min(1, "Escriba el texto del botón.").max(40),
      exitoTitulo: z.string().trim().min(1, "Escriba el mensaje de éxito.").max(120),
      exitoMensaje: z.string().trim().max(400).optional(),
      redireccion: urlHttps.optional(),
    }),
    consentimiento: z.object({
      activo: z.boolean(),
      texto: z.string().trim().max(2000),
      version: z.string().trim().max(20),
    }),
  })
  .superRefine((c, ctx) => {
    const ids = new Set<string>();
    for (const [i, campo] of c.campos.entries()) {
      if (ids.has(campo.id)) ctx.addIssue({ code: "custom", path: ["campos", i, "id"], message: "Hay dos preguntas con el mismo identificador." });
      ids.add(campo.id);
      if (campo.tipo === "lista" && (campo.opciones?.length ?? 0) < 2) {
        ctx.addIssue({ code: "custom", path: ["campos", i, "opciones"], message: `«${campo.etiqueta}» necesita al menos dos opciones.` });
      }
    }
    const telefono = c.campos.find((x) => x.mapea === "telefono");
    if (!telefono) ctx.addIssue({ code: "custom", path: ["campos"], message: "Falta la pregunta del teléfono: sin él no se puede contactar a la persona." });
    else if (!telefono.requerido) ctx.addIssue({ code: "custom", path: ["campos"], message: "El teléfono tiene que ser obligatorio." });
    if (!c.campos.some((x) => x.mapea === "nombreCompleto" || x.mapea === "nombre")) {
      ctx.addIssue({ code: "custom", path: ["campos"], message: "Falta la pregunta del nombre." });
    }
    if (c.consentimiento.activo && c.consentimiento.texto.length < 40) {
      ctx.addIssue({ code: "custom", path: ["consentimiento", "texto"], message: "Escriba el texto de la autorización de datos." });
    }
  });

export type CampoForm = z.infer<typeof esquemaCampo>;
export type ConfigFormulario = z.infer<typeof esquemaConfig>;

export type EstadoFormulario = "borrador" | "activo" | "pausado";
export const ESTADOS_FORMULARIO: Record<EstadoFormulario, string> = { borrador: "Borrador", activo: "Activo", pausado: "Pausado" };

/** Lo que queda sin completar para poder publicar: corchetes de un texto base que nadie llenó. */
export function pendientesParaPublicar(c: ConfigFormulario): string[] {
  const faltas: string[] = [];
  if (c.consentimiento.activo && /\[[^\]]+\]/.test(c.consentimiento.texto)) {
    faltas.push("Complete lo que está entre corchetes en la autorización de datos (por ejemplo, el correo de su empresa).");
  }
  if (!c.consentimiento.activo) faltas.push("Active la autorización de datos: la ley la exige para guardar y usar los datos de una persona.");
  return faltas;
}

/** Un identificador legible a partir de una etiqueta: «¿Para cuándo lo necesita?» → «para_cuando_lo_necesita». */
export function claveDeEtiqueta(etiqueta: string, existentes: string[] = []): string {
  const base =
    etiqueta
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "pregunta";
  let id = /^[a-z]/.test(base) ? base : `p_${base}`;
  for (let n = 2; existentes.includes(id); n++) id = `${id.replace(/_\d+$/, "")}_${n}`;
  return id;
}

/** Dirección pública del formulario (sin el dominio). */
export function rutaPublica(slug: string): string {
  return `/f/${slug}`;
}
