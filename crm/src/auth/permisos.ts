/**
 * Roles y permisos del equipo de una empresa. Es la única fuente de verdad: el servidor lo usa para rechazar y
 * filtrar, y la interfaz para no mostrar lo que la persona no puede hacer (mostrar u ocultar nunca es la defensa:
 * la defensa es el servidor).
 *
 * - admin: el dueño de la cuenta. Todo, incluida la configuración de la empresa.
 * - gerente: ve todo y manda: equipo, reparto, formularios, importar, automatizaciones. No cambia la configuración
 *   de la empresa ni toca al dueño.
 * - asesor: solo ve y edita SUS leads, contactos, tareas y citas. Es quien llama y atiende.
 * - lectura: ve todo, no cambia nada (un socio, un contador, un invitado).
 */

export type Rol = "admin" | "gerente" | "asesor" | "lectura";

export const ROLES: Rol[] = ["admin", "gerente", "asesor", "lectura"];

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Dueño",
  gerente: "Gerente",
  asesor: "Asesor",
  lectura: "Solo lectura",
};

export const DESCRIPCION_ROL: Record<Rol, string> = {
  admin: "Hace todo, incluida la configuración de la empresa.",
  gerente: "Ve todo, reparte leads y maneja el equipo y los formularios.",
  asesor: "Ve y atiende solo los leads que le asignan.",
  lectura: "Ve todo y no cambia nada.",
};

/** Roles que se pueden dar al invitar a alguien (el dueño es siempre la cuenta de Machea). */
export const ROLES_INVITABLES: Rol[] = ["gerente", "asesor", "lectura"];

/** El valor antiguo «usuario» (Better Auth, modo local) cuenta como asesor; cualquier cosa rara, como el rol más bajo. */
export function rolDe(valor: unknown): Rol {
  if (valor === "admin" || valor === "gerente" || valor === "asesor" || valor === "lectura") return valor;
  if (valor === "usuario") return "asesor";
  return "lectura";
}

export type Permiso =
  | "ver_todo" // ver los registros de todo el equipo
  | "escribir" // crear y editar
  | "eliminar"
  | "importar"
  | "repartir" // cambiar de asesor a los leads
  | "equipo" // invitar, cambiar roles, desactivar
  | "formularios"
  | "automatizar" // flujos
  | "informes"
  | "catalogo" // proyectos, inmuebles, listas de precios, textos y demás cosas de toda la empresa
  | "configurar"; // datos de la empresa, tipo, moneda

const PERMISOS: Record<Rol, readonly Permiso[]> = {
  admin: ["ver_todo", "escribir", "eliminar", "importar", "repartir", "equipo", "formularios", "automatizar", "informes", "catalogo", "configurar"],
  gerente: ["ver_todo", "escribir", "eliminar", "importar", "repartir", "equipo", "formularios", "automatizar", "informes", "catalogo"],
  asesor: ["escribir"],
  lectura: ["ver_todo"],
};

export function puede(rol: unknown, permiso: Permiso): boolean {
  return PERMISOS[rolDe(rol)].includes(permiso);
}

/** Si la persona solo ve lo suyo (los registros donde es la propietaria). */
export function soloVeLoSuyo(rol: unknown): boolean {
  return !puede(rol, "ver_todo");
}

/**
 * Objetos con dueño (columna `propietarioId`) que un asesor solo ve y edita si son suyos. El catálogo
 * (proyectos, inmuebles), los textos rápidos, los artículos y lo demás es de toda la empresa.
 */
export const OBJETOS_PERSONALES = [
  "candidatos",
  "contactos",
  "cuentas",
  "oportunidades",
  "tareas",
  "eventos",
  "casos",
  "facturas",
  "videollamadas",
] as const;

/** Objetos de configuración y marketing que un asesor no ve ni por la dirección: flujos, conexiones, campañas… */
export const OBJETOS_DE_GESTION = ["flujos", "conexiones", "campanas", "correos-lista", "establecimientos"] as const;

export function esObjetoDeGestion(objeto: string): boolean {
  return (OBJETOS_DE_GESTION as readonly string[]).includes(objeto);
}

export function esObjetoPersonal(objeto: string): boolean {
  return (OBJETOS_PERSONALES as readonly string[]).includes(objeto);
}

/**
 * Páginas y rutas que cada rol no debería ni ver en la barra. Los enlaces se esconden y, además, cada página
 * vuelve a exigir el permiso en el servidor.
 */
export function enlacePermitido(rol: unknown, id: string): boolean {
  switch (id) {
    case "equipo":
      return puede(rol, "equipo");
    case "formularios":
      return puede(rol, "formularios");
    case "automatizacion":
      return puede(rol, "automatizar");
    case "su-cuenta":
      return puede(rol, "configurar");
    default:
      return true;
  }
}

/** Quién puede cambiar el rol de quién: nadie toca al dueño, y solo el dueño nombra otros gerentes. */
export function puedeCambiarRol(quien: unknown, aQuien: unknown, nuevo: Rol): boolean {
  if (!puede(quien, "equipo")) return false;
  if (rolDe(aQuien) === "admin" || nuevo === "admin") return false;
  if ((rolDe(aQuien) === "gerente" || nuevo === "gerente") && rolDe(quien) !== "admin") return false;
  return true;
}

/** Lo que lanzan el servidor y el repositorio cuando el rol de quien pide no alcanza. */
export class ErrorPermiso extends Error {
  constructor(mensaje = "Su rol no puede hacer esto. Pídaselo a quien administra el equipo.") {
    super(mensaje);
    this.name = "ErrorPermiso";
  }
}
