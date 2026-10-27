/**
 * Búsqueda de texto sin acentos ni mayúsculas, y búsqueda de teléfonos sin importar cómo se escribieron.
 * Funciones puras (sin base de datos): repositorio.ts arma con ellas las condiciones SQL.
 */

/** Letras con acento (y su par en mayúscula) y sus equivalentes sin acento, para `translate()` de PostgreSQL. */
export const ACENTOS_DE = "áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ";
export const ACENTOS_A = "aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC";

/** Minúsculas y sin acentos: «Gómez» → «gomez». */
export function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Quita lo que PostgreSQL no acepta en un texto (el carácter nulo) y los espacios de los extremos. */
export function limpiarBusqueda(texto: string): string {
  return texto.replace(/\u0000/g, "").trim();
}

/** Patrón de `like` que contiene el texto, sin que `%`, `_` o `\` que escribió la persona funcionen como comodines. */
export function patronContiene(texto: string): string {
  return `%${sinAcentos(limpiarBusqueda(texto)).replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * Si lo escrito parece un teléfono (solo dígitos, espacios, +, paréntesis, puntos y guiones, con 4 dígitos o más),
 * devuelve los dígitos para compararlos con el teléfono guardado sin su formato. Sin el 57 de Colombia si sobra.
 */
export function digitosDeTelefono(texto: string): string | null {
  const t = limpiarBusqueda(texto);
  if (!/^\+?[\d\s().-]+$/.test(t)) return null;
  let digitos = t.replace(/\D/g, "");
  if (digitos.length < 4) return null;
  if (digitos.length > 10 && digitos.startsWith("57")) digitos = digitos.slice(2);
  return digitos;
}
