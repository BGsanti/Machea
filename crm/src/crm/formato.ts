import { aHoraLocal, ZONA_HORARIA } from "./fechas";
import type { Campo, DefObjeto, FilaRegistro } from "./tipos";

/** Dinero abreviado para tarjetas angostas: «$ 2.330 M» (millones). Por debajo del millón, el formato completo. */
export function formatoMonedaCorto(valor: number, moneda: string): string {
  if (Math.abs(valor) >= 1_000_000) return `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(valor / 1_000_000)} M`;
  return formatoMoneda(valor, moneda);
}

/** Nombres resueltos de los campos de búsqueda: { campo: nombreVisible }. */
export type NombresBusqueda = Record<string, string | null>;

export type FilaConNombres = FilaRegistro & { __nombres?: NombresBusqueda };

export function formatoAutonumero(campo: Campo | undefined, valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const numero = String(valor).padStart(5, "0");
  return (campo?.formato ?? "{0}").replace("{0}", numero);
}

export function etiquetaOpcion(campo: Campo | undefined, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const opcion = campo?.opciones?.find((o) => o.valor === valor);
  return opcion?.etiqueta ?? String(valor);
}

export function nombreVisible(def: DefObjeto, fila: FilaConNombres): string {
  const partes = def.camposNombre.map((nombre) => {
    const campo = def.campos.find((c) => c.nombre === nombre);
    const valor = fila[nombre];
    if (!campo) return valor ? String(valor) : "";
    if (campo.tipo === "autonumero") return formatoAutonumero(campo, valor);
    if (campo.tipo === "lista") return etiquetaOpcion(campo, valor);
    if (campo.tipo === "busqueda") return fila.__nombres?.[nombre] ?? "";
    return valor ? String(valor) : "";
  });
  const texto = partes.filter(Boolean).join(" ").trim();
  if (def.api === "casos" && fila.asunto) return `${texto} · ${String(fila.asunto)}`;
  return texto || "(sin nombre)";
}

export function formatoMoneda(valor: unknown, moneda = "COP"): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = Number(valor);
  if (Number.isNaN(n)) return "";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: moneda,
    maximumFractionDigits: moneda === "COP" ? 0 : 2,
  }).format(n);
}

export function formatoNumero(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  return new Intl.NumberFormat("es-CO").format(Number(valor));
}

export function formatoFecha(valor: unknown): string {
  if (!valor) return "";
  const soloFecha = typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
  const fecha = soloFecha ? new Date(`${valor}T12:00:00Z`) : valor instanceof Date ? valor : new Date(String(valor));
  if (Number.isNaN(fecha.getTime())) return "";
  // Una fecha sin hora no tiene zona: se formatea en UTC para no cambiar de día.
  return new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: soloFecha ? "UTC" : ZONA_HORARIA }).format(fecha);
}

export function formatoFechaHora(valor: unknown): string {
  if (!valor) return "";
  const fecha = valor instanceof Date ? valor : new Date(String(valor));
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ZONA_HORARIA,
  }).format(fecha);
}

/** Texto plano de un valor, para listas, exportación y búsquedas. */
export function textoValor(campo: Campo, fila: FilaConNombres, moneda = "COP"): string {
  const valor = fila[campo.nombre];
  switch (campo.tipo) {
    case "busqueda":
      return fila.__nombres?.[campo.nombre] ?? "";
    case "polimorfico":
      return fila.__nombres?.[campo.nombre] ?? "";
    case "lista":
      return etiquetaOpcion(campo, valor);
    case "listaMultiple":
      return Array.isArray(valor) ? valor.join(", ") : "";
    case "casilla":
      return valor ? "Sí" : "No";
    case "moneda":
      return formatoMoneda(valor, moneda);
    case "porcentaje":
      return valor === null || valor === undefined ? "" : `${formatoNumero(valor)} %`;
    case "numero":
      return formatoNumero(valor);
    case "fecha":
      return formatoFecha(valor);
    case "fechaHora":
      return formatoFechaHora(valor);
    case "autonumero":
      return formatoAutonumero(campo, valor);
    default:
      return valor === null || valor === undefined ? "" : String(valor);
  }
}

export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Valor para un <input>: fechas en el formato que esperan date y datetime-local. */
export function valorInput(campo: Campo, valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (campo.tipo === "fechaHora") {
    const fecha = valor instanceof Date ? valor : new Date(String(valor));
    return Number.isNaN(fecha.getTime()) ? "" : aHoraLocal(fecha);
  }
  if (campo.tipo === "fecha") return String(valor).slice(0, 10);
  return String(valor);
}

/** Solo los dígitos de un teléfono, con el indicativo de Colombia (57) si es un número local de 10 dígitos. */
export function digitosTelefono(telefono: unknown): string | null {
  const d = String(telefono ?? "").replace(/\D/g, "");
  if (d.length === 10) return `57${d}`;
  if (d.length === 12 && d.startsWith("57")) return d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

/** tel: para marcar desde el computador (softphone) o el celular. */
export function enlaceLlamada(telefono: unknown): string | null {
  const d = digitosTelefono(telefono);
  return d ? `tel:+${d}` : null;
}

/** Chat de WhatsApp con la persona (abre WhatsApp Web o la aplicación), con un saludo opcional. */
export function enlaceWhatsApp(telefono: unknown, mensaje?: string): string | null {
  const d = digitosTelefono(telefono);
  return d ? `https://wa.me/${d}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}` : null;
}
