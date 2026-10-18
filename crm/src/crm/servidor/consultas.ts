import { and, asc, count, desc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import {
  candidatos,
  configuracion,
  contactos,
  ejecucionesFlujo,
  eventos,
  informes,
  lineasFactura,
  miembrosCampana,
  notificaciones,
  paneles,
  preferenciasUsuario,
  tareas,
  usuarios,
  type FiltroInforme,
} from "@/db/esquema";
import { etiquetaOpcion, formatoFecha } from "../formato";
import { campoDe, obtenerObjeto } from "../objetos";
import { tablas } from "../tablas";
import type { Condicion } from "../tipos";
import { agruparPor, nombresDeIds } from "./repositorio";

export async function obtenerConfiguracion() {
  const db = await bd();
  const [c] = await db.select().from(configuracion).where(eq(configuracion.id, 1));
  if (c) return c;
  const [nueva] = await db.insert(configuracion).values({ id: 1 }).onConflictDoNothing().returning();
  return nueva ?? (await db.select().from(configuracion).where(eq(configuracion.id, 1)))[0]!;
}

export async function obtenerPreferencias(usuarioId: string) {
  const db = await bd();
  const [p] = await db.select().from(preferenciasUsuario).where(eq(preferenciasUsuario.usuarioId, usuarioId));
  return p ?? { usuarioId, sugerenciasOcultas: [], navegacion: {} };
}

export async function notificacionesDe(usuarioId: string, limite = 15) {
  const db = await bd();
  const lista = await db
    .select()
    .from(notificaciones)
    .where(eq(notificaciones.usuarioId, usuarioId))
    .orderBy(desc(notificaciones.creadoEn))
    .limit(limite);
  const [{ sinLeer } = { sinLeer: 0 }] = await db
    .select({ sinLeer: count() })
    .from(notificaciones)
    .where(and(eq(notificaciones.usuarioId, usuarioId), eq(notificaciones.leida, false)));
  return { lista, sinLeer: Number(sinLeer) };
}

export async function listaUsuarios() {
  const db = await bd();
  return db
    .select({ id: usuarios.id, nombre: usuarios.name, email: usuarios.email, rol: usuarios.rol, creadoEn: usuarios.createdAt })
    .from(usuarios)
    .orderBy(asc(usuarios.name));
}

export async function hayUsuarios(): Promise<boolean> {
  const db = await bd();
  const [r] = await db.select({ n: count() }).from(usuarios);
  return Number(r?.n ?? 0) > 0;
}

export async function tareasAbiertas(usuarioId: string, limite = 30) {
  const db = await bd();
  return db
    .select()
    .from(tareas)
    .where(and(eq(tareas.propietarioId, usuarioId), ne(tareas.estado, "completada")))
    .orderBy(sql`${tareas.fechaVencimiento} asc nulls last`, desc(tareas.creadoEn))
    .limit(limite);
}

export async function eventosEntre(inicio: Date, fin: Date, usuarioId: string, soloMios: boolean) {
  const db = await bd();
  return db
    .select()
    .from(eventos)
    .where(
      and(
        lt(eventos.inicio, fin),
        gte(eventos.fin, inicio),
        soloMios ? eq(eventos.propietarioId, usuarioId) : or(eq(eventos.privado, false), eq(eventos.propietarioId, usuarioId)),
      ),
    )
    .orderBy(asc(eventos.inicio));
}

export async function ejecucionesRecientes(limite = 100) {
  const db = await bd();
  return db.select().from(ejecucionesFlujo).orderBy(desc(ejecucionesFlujo.creadoEn)).limit(limite);
}

export async function lineasDe(facturaId: string) {
  const db = await bd();
  return db.select().from(lineasFactura).where(eq(lineasFactura.facturaId, facturaId));
}

export async function miembrosDe(campanaId: string) {
  const db = await bd();
  const miembros = await db
    .select()
    .from(miembrosCampana)
    .where(eq(miembrosCampana.campanaId, campanaId))
    .orderBy(desc(miembrosCampana.agregadoEn));
  const ids = (objeto: string) => miembros.filter((m) => m.objeto === objeto).map((m) => m.registroId);
  const deContactos = ids("contactos").length
    ? await db.select({ id: contactos.id, nombre: contactos.nombre, apellidos: contactos.apellidos, email: contactos.email }).from(contactos).where(inArray(contactos.id, ids("contactos")))
    : [];
  const deCandidatos = ids("candidatos").length
    ? await db.select({ id: candidatos.id, nombre: candidatos.nombre, apellidos: candidatos.apellidos, email: candidatos.email }).from(candidatos).where(inArray(candidatos.id, ids("candidatos")))
    : [];
  const personas = new Map([...deContactos, ...deCandidatos].map((p) => [p.id, p]));
  return miembros.map((m) => {
    const p = personas.get(m.registroId);
    return {
      ...m,
      nombre: p ? [p.nombre, p.apellidos].filter(Boolean).join(" ") : "(registro eliminado)",
      email: p?.email ?? null,
    };
  });
}

/** Número de registros por objeto, para la página Su cuenta. */
export async function contarRegistros(): Promise<{ objeto: string; total: number }[]> {
  const db = await bd();
  const resultado: { objeto: string; total: number }[] = [];
  for (const objeto of ["cuentas", "contactos", "candidatos", "oportunidades", "casos", "productos", "tareas", "eventos", "articulos"]) {
    const t = tablas[objeto];
    if (!t) continue;
    const [r] = await db.select({ n: count() }).from(t);
    resultado.push({ objeto, total: Number(r?.n ?? 0) });
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------

export interface GrupoInforme {
  clave: string;
  etiqueta: string;
  valor: number;
  registros: number;
}

export interface ResultadoInforme {
  grupos: GrupoInforme[];
  total: number;
  registros: number;
  etiquetaValor: string;
  esMoneda: boolean;
}

export interface DefInforme {
  objeto: string;
  agruparPor: string | null;
  agregacion: string;
  campoAgregado: string | null;
  filtros: FiltroInforme[];
}

export async function ejecutarInforme(informe: DefInforme, usuarioId: string): Promise<ResultadoInforme> {
  const def = obtenerObjeto(informe.objeto);
  if (!def) return { grupos: [], total: 0, registros: 0, etiquetaValor: "", esMoneda: false };
  const condiciones: Condicion[] = informe.filtros.map((f) => ({
    campo: f.campo,
    operador: f.operador,
    valor: f.valor === "$usuario" ? usuarioId : f.valor,
  }));
  const campoValor = informe.campoAgregado ? campoDe(def, informe.campoAgregado) : undefined;
  const suma = informe.agregacion !== "conteo" && campoValor ? campoValor.nombre : undefined;
  const agrupar = informe.agruparPor && campoDe(def, informe.agruparPor) ? informe.agruparPor : "__total";

  const crudos = await agruparPor(informe.objeto, agrupar, { usuarioId, vista: "__sin_vista", donde: condiciones }, suma);

  const campoGrupo = agrupar === "__total" ? undefined : campoDe(def, agrupar);
  let nombres = new Map<string, string>();
  if (campoGrupo?.tipo === "busqueda" && campoGrupo.objetoDestino) {
    nombres = await nombresDeIds(campoGrupo.objetoDestino, crudos.map((g) => g.valor).filter((v): v is string => Boolean(v)));
  }
  const etiqueta = (valor: string | null): string => {
    if (valor === null || valor === "") return "(vacío)";
    if (!campoGrupo) return valor;
    if (campoGrupo.tipo === "lista") return etiquetaOpcion(campoGrupo, valor);
    if (campoGrupo.tipo === "busqueda") return nombres.get(valor) ?? "(eliminado)";
    if (campoGrupo.tipo === "casilla") return valor === "true" ? "Sí" : "No";
    if (campoGrupo.tipo === "fecha" || campoGrupo.tipo === "fechaHora") {
      return formatoFecha(`${valor}-01`).replace(/^\d+ (de )?/, "");
    }
    return valor;
  };
  const valorDe = (g: { total: number; suma: number }) =>
    informe.agregacion === "suma" ? g.suma : informe.agregacion === "promedio" ? (g.total ? g.suma / g.total : 0) : g.total;

  const orden = campoGrupo?.opciones?.map((o) => o.valor);
  const lista = crudos
    .map((g) => ({ clave: g.valor ?? "", etiqueta: etiqueta(g.valor), valor: Math.round(valorDe(g) * 100) / 100, registros: g.total }))
    .sort((a, b) => {
      if (orden) return (orden.indexOf(a.clave) + 1 || 999) - (orden.indexOf(b.clave) + 1 || 999);
      if (campoGrupo?.tipo === "fecha" || campoGrupo?.tipo === "fechaHora") return a.clave.localeCompare(b.clave);
      return b.valor - a.valor;
    });
  const registros = lista.reduce((s, g) => s + g.registros, 0);
  const sumaTotal = crudos.reduce((s, g) => s + g.suma, 0);
  return {
    grupos: lista,
    registros,
    total: informe.agregacion === "suma" ? sumaTotal : informe.agregacion === "promedio" ? (registros ? sumaTotal / registros : 0) : registros,
    etiquetaValor:
      informe.agregacion === "conteo" || !campoValor
        ? "Número de registros"
        : `${informe.agregacion === "suma" ? "Suma" : "Promedio"} de ${campoValor.etiqueta}`,
    esMoneda: informe.agregacion !== "conteo" && campoValor?.tipo === "moneda",
  };
}

export async function listaInformes(objeto?: string) {
  const db = await bd();
  return db
    .select()
    .from(informes)
    .where(objeto ? eq(informes.objeto, objeto) : undefined)
    .orderBy(desc(informes.actualizadoEn));
}

export async function obtenerInforme(id: string) {
  const db = await bd();
  const [i] = await db.select().from(informes).where(eq(informes.id, id));
  return i ?? null;
}

export async function listaPaneles() {
  const db = await bd();
  return db.select().from(paneles).orderBy(desc(paneles.actualizadoEn));
}

export async function obtenerPanel(id: string) {
  const db = await bd();
  const [p] = await db.select().from(paneles).where(eq(paneles.id, id));
  return p ?? null;
}
