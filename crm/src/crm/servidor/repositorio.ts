import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { bd, type BaseDatos } from "@/db/cliente";
import { eventos, oportunidades, productosOportunidad, tareas, vistosRecientemente } from "@/db/esquema";
import { fechaLocal, inicioMes, ZONA_HORARIA } from "../fechas";
import { nombreVisible, type FilaConNombres, type NombresBusqueda } from "../formato";
import { obtenerObjeto } from "../objetos";
import { tablas } from "../tablas";
import type { Condicion, DefObjeto, FilaRegistro } from "../tipos";
import { ejecutarFlujos } from "./flujos";
import { aplicarReglas } from "./reglas";

export class ErrorValidacion extends Error {
  constructor(public errores: Record<string, string>) {
    super("Revise los campos marcados.");
  }
}

function def(objeto: string): DefObjeto {
  const d = obtenerObjeto(objeto);
  if (!d) throw new Error(`Objeto desconocido: ${objeto}`);
  return d;
}

function tabla(objeto: string): PgTable {
  const t = tablas[objeto];
  if (!t) throw new Error(`Objeto sin tabla: ${objeto}`);
  return t;
}

function columnas(objeto: string): Record<string, PgColumn> {
  return getTableColumns(tabla(objeto)) as Record<string, PgColumn>;
}

function columna(objeto: string, campo: string): PgColumn {
  const c = columnas(objeto)[campo];
  if (!c) throw new Error(`Campo desconocido: ${objeto}.${campo}`);
  return c;
}

// ---------------------------------------------------------------------------
// Condiciones
// ---------------------------------------------------------------------------

function sqlCondicion(objeto: string, c: Condicion): SQL | undefined {
  const cols = columnas(objeto);
  const col = cols[c.campo];
  if (!col) return undefined;
  const valores = Array.isArray(c.valor) ? c.valor : c.valor !== undefined ? [c.valor] : [];
  const unico = valores[0];
  const esBooleano = col.dataType === "boolean";
  const convertir = (v: string): unknown => (esBooleano ? v === "true" : v);

  switch (c.operador) {
    case "igual":
      return unico === undefined ? undefined : eq(col, convertir(unico));
    case "distinto":
      return unico === undefined ? undefined : or(ne(col, convertir(unico)), isNull(col));
    case "en":
      return valores.length ? inArray(col, valores.map(convertir)) : undefined;
    case "no_en":
      return valores.length ? or(notInArray(col, valores.map(convertir)), isNull(col)) : undefined;
    case "vacio":
      return isNull(col);
    case "no_vacio":
      return isNotNull(col);
    case "verdadero":
      return eq(col, true);
    case "falso":
      return eq(col, false);
    case "contiene":
      return unico ? ilike(sql`${col}::text`, `%${unico}%`) : undefined;
    case "mayor":
      return unico === undefined ? undefined : sql`${col} > ${unico}`;
    case "menor":
      return unico === undefined ? undefined : sql`${col} < ${unico}`;
    case "antes_de_hoy":
      return sql`${comoFecha(col)} < ${fechaLocal()}::date`;
    case "hoy":
      return sql`${comoFecha(col)} = ${fechaLocal()}::date`;
    case "este_mes":
      return sql`date_trunc('month', ${comoFecha(col)}) = ${inicioMes()}::date`;
  }
}

/** Para nombres de varias partes (nombre + apellidos) busca también en el nombre completo. */
function nombreCompletoContiene(objeto: string, texto: string): SQL | undefined {
  const d = def(objeto);
  if (d.camposNombre.length < 2) return undefined;
  const cols = columnas(objeto);
  const partes = d.camposNombre.map((n) => cols[n]).filter((c): c is PgColumn => Boolean(c));
  return ilike(sql`concat_ws(' ', ${sql.join(partes, sql`, `)})`, `%${texto}%`);
}

/** Fecha de una columna en la zona del negocio (las marcas de tiempo se convierten). */
function comoFecha(col: PgColumn): SQL {
  return /Timestamp/.test(col.columnType) ? sql`(${col} at time zone ${ZONA_HORARIA})::date` : sql`${col}::date`;
}

export interface OpcionesListado {
  vista?: string;
  q?: string;
  orden?: string;
  direccion?: "asc" | "desc";
  pagina?: number;
  porPagina?: number;
  filtros?: Condicion[];
  usuarioId: string;
  /** Condiciones fijas adicionales, por ejemplo para listas relacionadas. */
  donde?: Condicion[];
}

export interface Listado {
  filas: FilaConNombres[];
  total: number;
  pagina: number;
  porPagina: number;
  orden: string | null;
  direccion: "asc" | "desc";
}

async function idsRecientes(db: BaseDatos, objeto: string, usuarioId: string, limite = 100): Promise<string[]> {
  const filas = await db
    .select({ id: vistosRecientemente.registroId })
    .from(vistosRecientemente)
    .where(and(eq(vistosRecientemente.usuarioId, usuarioId), eq(vistosRecientemente.objeto, objeto)))
    .orderBy(desc(vistosRecientemente.vistoEn))
    .limit(limite);
  return filas.map((f) => f.id);
}

async function condicionesListado(db: BaseDatos, objeto: string, o: OpcionesListado) {
  const d = def(objeto);
  const cols = columnas(objeto);
  const vista =
    o.vista === SIN_VISTA
      ? undefined
      : (d.vistas.find((v) => v.id === o.vista) ?? d.vistas.find((v) => v.id === d.vistaPorDefecto));
  const partes: (SQL | undefined)[] = [];
  let recientes: string[] | null = null;

  for (const c of [...(vista?.condiciones ?? []), ...(o.filtros ?? []), ...(o.donde ?? [])]) partes.push(sqlCondicion(objeto, c));
  if (vista?.soloMios && cols.propietarioId) partes.push(eq(cols.propietarioId, o.usuarioId));
  if (vista?.recientes) {
    recientes = await idsRecientes(db, objeto, o.usuarioId);
    partes.push(recientes.length ? inArray(cols.id!, recientes) : sql`false`);
  }
  const q = o.q?.trim();
  if (q) {
    const buscables = d.busqueda.map((n) => cols[n]).filter((c): c is PgColumn => Boolean(c));
    const numero = Number(q);
    const porNumero = cols.numero && Number.isInteger(numero) ? [eq(cols.numero, numero)] : [];
    partes.push(or(...buscables.map((c) => ilike(c, `%${q}%`)), ...porNumero, nombreCompletoContiene(objeto, q)) ?? sql`false`);
  }
  return { where: and(...partes.filter((p): p is SQL => Boolean(p))), vista, recientes };
}

/** Vista especial que no aplica condiciones: la usan las listas relacionadas. */
export const SIN_VISTA = "__sin_vista";

function ordenDefecto(objeto: string): { campo: string; direccion: "asc" | "desc" } {
  if (["eventos", "sesiones-mensajeria", "videollamadas"].includes(objeto)) return { campo: "inicio", direccion: "desc" };
  const d = def(objeto);
  const primero = d.camposNombre[0] ?? "creadoEn";
  const tipo = d.campos.find((c) => c.nombre === primero)?.tipo;
  if (tipo === "autonumero") return { campo: primero, direccion: "desc" };
  if (tipo === "busqueda") return { campo: "creadoEn", direccion: "desc" };
  return { campo: primero, direccion: "asc" };
}

export async function listar(objeto: string, o: OpcionesListado): Promise<Listado> {
  const db = await bd();
  const d = def(objeto);
  const t = tabla(objeto);
  const cols = columnas(objeto);
  const { where, vista, recientes } = await condicionesListado(db, objeto, o);

  const porPagina = Math.min(Math.max(o.porPagina ?? 50, 1), 200);
  const pagina = Math.max(o.pagina ?? 1, 1);
  const defecto = vista?.orden ?? ordenDefecto(objeto);
  const ordenCampo = o.orden && cols[o.orden] ? o.orden : recientes ? null : defecto.campo;
  const direccion = o.orden ? (o.direccion ?? "asc") : (vista?.orden?.direccion ?? defecto.direccion);
  const dir = direccion === "desc" ? desc : asc;
  // Si se ordena por el nombre y este tiene varias partes (nombre y apellidos), se ordena por todas.
  const camposOrden =
    ordenCampo && ordenCampo === d.camposNombre[0] && d.camposNombre.length > 1 ? d.camposNombre : ordenCampo ? [ordenCampo] : [];
  const ordenSql = camposOrden.map((c) => cols[c]).filter((c): c is PgColumn => Boolean(c)).map((c) => dir(c));

  const consulta = db.select().from(t).where(where).$dynamic();
  const filas = (await consulta
    .orderBy(...ordenSql, desc(cols.id!))
    .limit(porPagina)
    .offset((pagina - 1) * porPagina)) as FilaRegistro[];
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(t).where(where);

  if (recientes && !ordenCampo) filas.sort((a, b) => recientes.indexOf(a.id) - recientes.indexOf(b.id));
  return {
    filas: await resolverNombres(db, d, filas),
    total: Number(total),
    pagina,
    porPagina,
    orden: ordenCampo,
    direccion,
  };
}

// ---------------------------------------------------------------------------
// Nombres de los registros relacionados
// ---------------------------------------------------------------------------

async function nombresDe(db: BaseDatos, objeto: string, ids: string[], profundidad = 0): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const d = obtenerObjeto(objeto);
  const t = tablas[objeto];
  if (!d || !t || ids.length === 0) return mapa;
  const cols = columnas(objeto);
  const seleccion: Record<string, PgColumn> = { id: cols.id! };
  for (const n of d.camposNombre) if (cols[n]) seleccion[n] = cols[n];
  if (objeto === "casos" && cols.asunto) seleccion.asunto = cols.asunto;
  const filas = (await db.select(seleccion).from(t).where(inArray(cols.id!, ids))) as FilaRegistro[];
  const conNombres = profundidad < 1 ? await resolverNombres(db, d, filas, profundidad + 1) : filas;
  for (const f of conNombres) mapa.set(f.id, nombreVisible(d, f));
  return mapa;
}

export async function nombresDeIds(objeto: string, ids: string[]): Promise<Map<string, string>> {
  return nombresDe(await bd(), objeto, ids);
}

export async function resolverNombres(
  db: BaseDatos,
  d: DefObjeto,
  filas: FilaRegistro[],
  profundidad = 0,
): Promise<FilaConNombres[]> {
  const pedidos = new Map<string, Set<string>>();
  const pedir = (objeto: string | undefined, id: unknown) => {
    if (!objeto || typeof id !== "string" || !id) return;
    if (!pedidos.has(objeto)) pedidos.set(objeto, new Set());
    pedidos.get(objeto)!.add(id);
  };
  const busquedas = d.campos.filter((c) => c.tipo === "busqueda" || c.tipo === "polimorfico");
  for (const fila of filas) {
    for (const c of busquedas) {
      if (c.tipo === "busqueda") pedir(c.objetoDestino, fila[c.nombre]);
      else pedir(fila[`${c.nombre}Objeto`] as string | undefined, fila[`${c.nombre}Id`]);
    }
  }
  const mapas = new Map<string, Map<string, string>>();
  for (const [objeto, ids] of pedidos) mapas.set(objeto, await nombresDe(db, objeto, [...ids], profundidad));

  return filas.map((fila) => {
    const nombres: NombresBusqueda = {};
    for (const c of busquedas) {
      if (c.tipo === "busqueda") {
        const id = fila[c.nombre];
        nombres[c.nombre] = typeof id === "string" ? (mapas.get(c.objetoDestino ?? "")?.get(id) ?? null) : null;
      } else {
        const objeto = fila[`${c.nombre}Objeto`];
        const id = fila[`${c.nombre}Id`];
        nombres[c.nombre] =
          typeof objeto === "string" && typeof id === "string" ? (mapas.get(objeto)?.get(id) ?? null) : null;
      }
    }
    return { ...fila, __nombres: nombres };
  });
}

// ---------------------------------------------------------------------------
// Lectura y escritura
// ---------------------------------------------------------------------------

export async function obtener(objeto: string, id: string): Promise<FilaConNombres | null> {
  const db = await bd();
  const cols = columnas(objeto);
  const [fila] = (await db.select().from(tabla(objeto)).where(eq(cols.id!, id)).limit(1)) as FilaRegistro[];
  if (!fila) return null;
  const [conNombres] = await resolverNombres(db, def(objeto), [fila]);
  return conNombres ?? null;
}

/** Ajusta los números a las columnas enteras y descarta campos que la tabla no tiene. */
function prepararDatos(objeto: string, datos: Record<string, unknown>): Record<string, unknown> {
  const cols = columnas(objeto);
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(datos)) {
    const col = cols[clave];
    if (!col || clave === "id") continue;
    if (typeof valor === "number" && (col.columnType === "PgInteger" || col.columnType === "PgSerial")) salida[clave] = Math.round(valor);
    else salida[clave] = valor;
  }
  return salida;
}

export async function crear(objeto: string, datos: Record<string, unknown>, usuarioId: string): Promise<string> {
  const db = await bd();
  const cols = columnas(objeto);
  const errores = aplicarReglas(objeto, datos, null);
  if (errores) throw new ErrorValidacion(errores);
  const valores = prepararDatos(objeto, datos);
  if (cols.propietarioId && !valores.propietarioId) valores.propietarioId = usuarioId;
  if (cols.creadoPorId) valores.creadoPorId = usuarioId;

  const [nuevo] = (await db
    .insert(tabla(objeto))
    .values(valores as never)
    .returning()) as FilaRegistro[];
  if (!nuevo) throw new Error("No se pudo crear el registro.");
  await despuesDeGuardar(db, objeto, nuevo);
  await ejecutarFlujos(objeto, "crear", nuevo, null, usuarioId);
  return nuevo.id;
}

export async function actualizar(objeto: string, id: string, datos: Record<string, unknown>, usuarioId: string): Promise<void> {
  const db = await bd();
  const cols = columnas(objeto);
  const [anterior] = (await db.select().from(tabla(objeto)).where(eq(cols.id!, id)).limit(1)) as FilaRegistro[];
  if (!anterior) throw new Error("El registro ya no existe.");
  const errores = aplicarReglas(objeto, datos, anterior);
  if (errores) throw new ErrorValidacion(errores);
  const valores = prepararDatos(objeto, datos);
  if (cols.actualizadoEn) valores.actualizadoEn = new Date();

  const [nuevo] = (await db
    .update(tabla(objeto))
    .set(valores as never)
    .where(eq(cols.id!, id))
    .returning()) as FilaRegistro[];
  if (!nuevo) return;
  await despuesDeGuardar(db, objeto, nuevo, anterior);
  await ejecutarFlujos(objeto, "actualizar", nuevo, anterior, usuarioId);
}

export async function eliminar(objeto: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await bd();
  const cols = columnas(objeto);
  const borrados = (await db.delete(tabla(objeto)).where(inArray(cols.id!, ids)).returning()) as FilaRegistro[];
  for (const fila of borrados) await despuesDeGuardar(db, objeto, fila);
  await db
    .delete(vistosRecientemente)
    .where(and(eq(vistosRecientemente.objeto, objeto), inArray(vistosRecientemente.registroId, ids)));
  return borrados.length;
}

async function despuesDeGuardar(db: BaseDatos, objeto: string, fila: FilaRegistro, anterior?: FilaRegistro) {
  if (objeto === "productos-oportunidad") {
    const ids = new Set([fila.oportunidadId, anterior?.oportunidadId].filter((v): v is string => typeof v === "string"));
    for (const id of ids) await recalcularImporte(db, id);
  }
}

/** El importe de una oportunidad con productos es la suma de sus líneas. */
export async function recalcularImporte(db: BaseDatos, oportunidadId: string): Promise<void> {
  const [r] = await db
    .select({
      lineas: count(),
      total: sql<string>`coalesce(sum(${productosOportunidad.cantidad} * ${productosOportunidad.precioUnitario} * (1 - coalesce(${productosOportunidad.descuento}, 0) / 100)), 0)`,
    })
    .from(productosOportunidad)
    .where(eq(productosOportunidad.oportunidadId, oportunidadId));
  if (!r || Number(r.lineas) === 0) return;
  await db
    .update(oportunidades)
    .set({ importe: Math.round(Number(r.total) * 100) / 100, actualizadoEn: new Date() })
    .where(eq(oportunidades.id, oportunidadId));
}

// ---------------------------------------------------------------------------
// Búsquedas, recientes y agregados
// ---------------------------------------------------------------------------

export interface OpcionBusqueda {
  id: string;
  nombre: string;
  objeto: string;
}

export async function buscarParaCampo(objeto: string, q: string, limite = 8): Promise<OpcionBusqueda[]> {
  const db = await bd();
  const d = def(objeto);
  const cols = columnas(objeto);
  const texto = q.trim();
  const buscables = [...new Set([...d.camposNombre, ...d.busqueda])]
    .map((n) => cols[n])
    .filter((c): c is PgColumn => Boolean(c) && c!.dataType === "string");
  const where = texto ? or(...buscables.map((c) => ilike(c, `%${texto}%`)), nombreCompletoContiene(objeto, texto)) : undefined;
  const orden = cols.actualizadoEn ? desc(cols.actualizadoEn) : asc(cols.id!);
  const filas = (await db.select().from(tabla(objeto)).where(where).orderBy(orden).limit(limite)) as FilaRegistro[];
  const conNombres = await resolverNombres(db, d, filas);
  return conNombres.map((f) => ({ id: f.id, nombre: nombreVisible(d, f), objeto }));
}

export async function registrarVisto(usuarioId: string, objeto: string, registroId: string): Promise<void> {
  const db = await bd();
  await db
    .insert(vistosRecientemente)
    .values({ usuarioId, objeto, registroId })
    .onConflictDoUpdate({
      target: [vistosRecientemente.usuarioId, vistosRecientemente.objeto, vistosRecientemente.registroId],
      set: { vistoEn: new Date() },
    });
}

export async function recientes(usuarioId: string, limite = 10, objeto?: string): Promise<OpcionBusqueda[]> {
  const db = await bd();
  const filas = await db
    .select()
    .from(vistosRecientemente)
    .where(
      and(eq(vistosRecientemente.usuarioId, usuarioId), objeto ? eq(vistosRecientemente.objeto, objeto) : undefined),
    )
    .orderBy(desc(vistosRecientemente.vistoEn))
    .limit(limite * 2);
  const porObjeto = new Map<string, string[]>();
  for (const f of filas) porObjeto.set(f.objeto, [...(porObjeto.get(f.objeto) ?? []), f.registroId]);
  const nombres = new Map<string, string>();
  for (const [obj, ids] of porObjeto) {
    for (const [id, nombre] of await nombresDe(db, obj, ids)) nombres.set(`${obj}:${id}`, nombre);
  }
  return filas
    .filter((f) => nombres.has(`${f.objeto}:${f.registroId}`))
    .slice(0, limite)
    .map((f) => ({ id: f.registroId, objeto: f.objeto, nombre: nombres.get(`${f.objeto}:${f.registroId}`)! }));
}

export interface Grupo {
  valor: string | null;
  total: number;
  suma: number;
}

/** Agrupa por un campo; con campo "__total" devuelve un único grupo. */
export async function agruparPor(
  objeto: string,
  campo: string,
  o: OpcionesListado,
  campoSuma?: string,
): Promise<Grupo[]> {
  const db = await bd();
  const total = campo === "__total";
  const col = total ? undefined : columna(objeto, campo);
  const suma = campoSuma ? columna(objeto, campoSuma) : undefined;
  const { where } = await condicionesListado(db, objeto, o);
  // Las fechas se agrupan por mes (AAAA-MM).
  const clave = !col
    ? sql<string | null>`'Total'`
    : /Date|Timestamp/.test(col.columnType)
      ? sql<string | null>`to_char(date_trunc('month', ${comoFecha(col)}), 'YYYY-MM')`
      : sql<string | null>`${col}::text`;
  const consulta = db
    .select({
      valor: clave,
      total: count(),
      suma: suma ? sql<string>`coalesce(sum(${suma}), 0)` : sql<string>`0`,
    })
    .from(tabla(objeto))
    .where(where)
    .$dynamic();
  const filas = total ? await consulta : await consulta.groupBy(clave);
  return filas.map((f) => ({ valor: f.valor, total: Number(f.total), suma: Number(f.suma) }));
}

export async function relacionados(
  objeto: string,
  campo: string,
  id: string,
  usuarioId: string,
  limite = 6,
): Promise<Listado> {
  return listar(objeto, {
    usuarioId,
    vista: SIN_VISTA,
    donde: [{ campo, operador: "igual", valor: id }],
    porPagina: limite,
    orden: columnas(objeto).actualizadoEn ? "actualizadoEn" : undefined,
    direccion: "desc",
  });
}

export interface Actividad {
  id: string;
  objeto: "tareas" | "eventos";
  asunto: string;
  fecha: Date | string | null;
  estado: string | null;
  tipo: string;
  descripcion: string | null;
}

export async function actividadesDe(registroId: string): Promise<{ pendientes: Actividad[]; pasadas: Actividad[] }> {
  const db = await bd();
  const deTareas = await db
    .select()
    .from(tareas)
    .where(or(eq(tareas.relacionadoId, registroId), eq(tareas.quienId, registroId)))
    .orderBy(desc(tareas.creadoEn))
    .limit(100);
  const deEventos = await db
    .select()
    .from(eventos)
    .where(or(eq(eventos.relacionadoId, registroId), eq(eventos.quienId, registroId)))
    .orderBy(desc(eventos.inicio))
    .limit(100);
  const ahora = new Date();
  const todas: (Actividad & { pendiente: boolean })[] = [
    ...deTareas.map((t) => ({
      id: t.id,
      objeto: "tareas" as const,
      asunto: t.asunto,
      fecha: t.fechaVencimiento,
      estado: t.estado,
      tipo: t.tipo,
      descripcion: t.comentarios,
      pendiente: t.estado !== "completada",
    })),
    ...deEventos.map((e) => ({
      id: e.id,
      objeto: "eventos" as const,
      asunto: e.asunto,
      fecha: e.inicio,
      estado: null,
      tipo: "evento",
      descripcion: e.descripcion,
      pendiente: e.fin >= ahora,
    })),
  ];
  const fechaNum = (a: Actividad) => (a.fecha ? new Date(a.fecha).getTime() : 0);
  return {
    pendientes: todas.filter((a) => a.pendiente).sort((a, b) => fechaNum(a) - fechaNum(b)),
    pasadas: todas.filter((a) => !a.pendiente).sort((a, b) => fechaNum(b) - fechaNum(a)),
  };
}
