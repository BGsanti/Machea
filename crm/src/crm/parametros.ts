import type { Condicion, DefObjeto, OperadorCondicion } from "./tipos";

export type ParametrosUrl = Record<string, string | string[] | undefined>;

export interface EstadoLista {
  vista: string;
  q: string;
  orden?: string;
  direccion?: "asc" | "desc";
  pagina: number;
  filtros: Condicion[];
  modo: "tabla" | "kanban";
  graficos: boolean;
  filtrosAbiertos: boolean;
}

const operadoresFiltro: OperadorCondicion[] = ["igual", "distinto", "contiene", "mayor", "menor", "vacio", "no_vacio", "verdadero", "falso"];

function uno(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function leerEstadoLista(def: DefObjeto, p: ParametrosUrl): EstadoLista {
  const vista = uno(p.vista);
  let filtros: Condicion[] = [];
  const crudo = uno(p.f);
  if (crudo) {
    try {
      const lista = JSON.parse(crudo) as unknown;
      if (Array.isArray(lista)) {
        filtros = lista
          .filter(
            (c): c is Condicion =>
              typeof c === "object" &&
              c !== null &&
              typeof (c as Condicion).campo === "string" &&
              def.campos.some((campo) => campo.nombre === (c as Condicion).campo) &&
              operadoresFiltro.includes((c as Condicion).operador),
          )
          .slice(0, 10);
      }
    } catch {
      filtros = [];
    }
  }
  const direccion = uno(p.dir);
  return {
    vista: vista && def.vistas.some((v) => v.id === vista) ? vista : def.vistaPorDefecto,
    q: (uno(p.q) ?? "").slice(0, 100),
    orden: uno(p.orden),
    direccion: direccion === "desc" ? "desc" : direccion === "asc" ? "asc" : undefined,
    pagina: Math.max(1, Number(uno(p.pagina)) || 1),
    filtros,
    modo: uno(p.modo) === "kanban" && def.campoKanban ? "kanban" : "tabla",
    graficos: uno(p.graficos) === "1",
    filtrosAbiertos: uno(p.filtros) === "1",
  };
}

/** Construye la URL de la lista cambiando solo algunos parámetros. */
export function urlLista(base: string, estado: EstadoLista, cambios: Partial<Record<string, string | null>>): string {
  const valores: Record<string, string | null> = {
    vista: estado.vista,
    q: estado.q || null,
    orden: estado.orden ?? null,
    dir: estado.direccion ?? null,
    pagina: estado.pagina > 1 ? String(estado.pagina) : null,
    f: estado.filtros.length ? JSON.stringify(estado.filtros) : null,
    modo: estado.modo === "kanban" ? "kanban" : null,
    graficos: estado.graficos ? "1" : null,
    filtros: estado.filtrosAbiertos ? "1" : null,
    ...cambios,
  };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(valores)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}
