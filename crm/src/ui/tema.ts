// Tema del CRM (claro, oscuro o el del sistema). Se guarda en el navegador de cada persona.
// El script de abajo corre en <head> ANTES de pintar, para que no haya un destello de claro al abrir en oscuro.

export type Tema = "claro" | "oscuro" | "sistema";

export const CLAVE_TEMA = "machea-tema";
export const EVENTO_TEMA = "machea:tema";

export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CLAVE_TEMA}")||"claro";if(t==="sistema")t=matchMedia("(prefers-color-scheme: dark)").matches?"oscuro":"claro";document.documentElement.setAttribute("data-tema",t==="oscuro"?"oscuro":"claro")}catch(e){}`;

export function temaGuardado(): Tema {
  try {
    const t = localStorage.getItem(CLAVE_TEMA);
    return t === "oscuro" || t === "sistema" ? t : "claro";
  } catch {
    return "claro";
  }
}

/** El tema que se está viendo ahora (el «sistema» ya resuelto a claro u oscuro). */
export function temaVisible(): "claro" | "oscuro" {
  return document.documentElement.getAttribute("data-tema") === "oscuro" ? "oscuro" : "claro";
}

export function aplicarTema(tema: Tema): void {
  try {
    localStorage.setItem(CLAVE_TEMA, tema);
  } catch {
    // Sin almacenamiento (ventana privada): el cambio vale solo para esta visita.
  }
  const real = tema === "sistema" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "oscuro" : "claro") : tema;
  document.documentElement.setAttribute("data-tema", real);
  window.dispatchEvent(new Event(EVENTO_TEMA));
}
