/**
 * Texto de un error para mostrárselo a la persona. Los mensajes que escribe este código («El registro ya no existe.»)
 * pasan tal cual; los de la base de datos (consulta, tablas, columnas, parámetros) nunca: se registran en el servidor y
 * la persona ve un aviso genérico.
 */
const DE_LA_BASE = /Failed query|violates|out of range|invalid input|syntax error|duplicate key|does not exist|deadlock|ECONN|ETIMEDOUT|connection (terminated|refused)|timeout/i;

export const MENSAJE_GENERICO = "No se pudo guardar. Revise los valores e inténtelo de nuevo.";

export function textoDeError(e: unknown): string {
  const texto = e instanceof Error ? e.message : "";
  if (!texto) return "Ocurrió un error inesperado.";
  if (DE_LA_BASE.test(texto)) {
    console.error("[crm] error de base de datos:", e);
    return MENSAJE_GENERICO;
  }
  return texto;
}
