import { z } from "zod";
import { desdeHoraLocal } from "./fechas";
import type { Campo, DefObjeto } from "./tipos";

export type ResultadoValidacion =
  | { ok: true; datos: Record<string, unknown> }
  | { ok: false; errores: Record<string, string> };

const esquemaEmail = z.email();
const esquemaUrl = z.url();
const esquemaFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const esquemaId = z.string().min(1).max(64);

/** Campos que aparecen en el formulario de un objeto, en orden. */
export function camposFormulario(def: DefObjeto): Campo[] {
  const nombres = def.secciones.flatMap((s) => s.campos.flatMap((c) => (typeof c === "string" ? [c] : c.campos)));
  return nombres
    .map((n) => def.campos.find((c) => c.nombre === n))
    .filter((c): c is Campo => Boolean(c && !c.soloLectura && c.tipo !== "autonumero"));
}

type Lector = (nombre: string) => string;
type LectorMultiple = (nombre: string) => string[];

/** Convierte un valor de formulario al tipo del campo. Devuelve el error como texto. */
export function convertirValor(
  campo: Campo,
  leer: Lector,
  leerTodos: LectorMultiple,
): { valor: Record<string, unknown> } | { error: string } {
  const bruto = leer(campo.nombre).trim();
  const vacio = bruto === "";
  const requerido = () => ({ error: "Rellene este campo." });

  switch (campo.tipo) {
    case "casilla": {
      const marcado = ["on", "true", "1", "sí", "si"].includes(bruto.toLowerCase());
      return { valor: { [campo.nombre]: marcado } };
    }
    case "listaMultiple": {
      const permitidos = new Set(campo.opciones?.map((o) => o.valor));
      const valores = leerTodos(campo.nombre).filter((v) => permitidos.has(v));
      if (campo.requerido && valores.length === 0) return requerido();
      return { valor: { [campo.nombre]: valores } };
    }
    case "polimorfico": {
      const objeto = leer(`${campo.nombre}Objeto`).trim();
      const id = leer(`${campo.nombre}Id`).trim();
      if (!id) {
        if (campo.requerido) return requerido();
        return { valor: { [`${campo.nombre}Objeto`]: null, [`${campo.nombre}Id`]: null } };
      }
      if (!campo.objetosPermitidos?.includes(objeto)) return { error: "Tipo de registro no válido." };
      if (!esquemaId.safeParse(id).success) return { error: "Registro no válido." };
      return { valor: { [`${campo.nombre}Objeto`]: objeto, [`${campo.nombre}Id`]: id } };
    }
  }

  if (vacio) {
    if (campo.requerido) return requerido();
    return { valor: { [campo.nombre]: null } };
  }

  switch (campo.tipo) {
    case "email":
      if (!esquemaEmail.safeParse(bruto).success) return { error: "Escriba un correo electrónico válido." };
      return { valor: { [campo.nombre]: bruto.toLowerCase() } };
    case "url": {
      const url = /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
      if (!esquemaUrl.safeParse(url).success) return { error: "Escriba una dirección web válida." };
      return { valor: { [campo.nombre]: url } };
    }
    case "numero":
    case "moneda":
    case "porcentaje": {
      const n = Number(bruto.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) return { error: "Escriba un número." };
      if (campo.tipo === "porcentaje" && (n < 0 || n > 100)) return { error: "Debe estar entre 0 y 100." };
      return { valor: { [campo.nombre]: n } };
    }
    case "fecha":
      if (!esquemaFecha.safeParse(bruto).success) return { error: "Escriba una fecha válida." };
      return { valor: { [campo.nombre]: bruto } };
    case "fechaHora": {
      const fecha = desdeHoraLocal(bruto) ?? new Date(bruto);
      if (Number.isNaN(fecha.getTime())) return { error: "Escriba una fecha y hora válidas." };
      return { valor: { [campo.nombre]: fecha } };
    }
    case "lista":
      if (!campo.opciones?.some((o) => o.valor === bruto)) return { error: "Elija una opción de la lista." };
      return { valor: { [campo.nombre]: bruto } };
    case "busqueda":
      if (!esquemaId.safeParse(bruto).success) return { error: "Registro no válido." };
      return { valor: { [campo.nombre]: bruto } };
    default:
      if (bruto.length > 32000) return { error: "El texto es demasiado largo." };
      return { valor: { [campo.nombre]: bruto } };
  }
}

export function validarFormulario(def: DefObjeto, formData: FormData): ResultadoValidacion {
  const leer: Lector = (n) => {
    const v = formData.get(n);
    return typeof v === "string" ? v : "";
  };
  const leerTodos: LectorMultiple = (n) => formData.getAll(n).filter((v): v is string => typeof v === "string");
  return validarCampos(camposFormulario(def), leer, leerTodos);
}

export function validarCampos(campos: Campo[], leer: Lector, leerTodos: LectorMultiple): ResultadoValidacion {
  const datos: Record<string, unknown> = {};
  const errores: Record<string, string> = {};
  for (const campo of campos) {
    const r = convertirValor(campo, leer, leerTodos);
    if ("error" in r) errores[campo.nombre] = r.error;
    else Object.assign(datos, r.valor);
  }
  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, datos };
}
