import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { headers } from "next/headers";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { candidatos, configuracion, enviosFormulario, formularios, inmuebles, proyectos } from "@/db/esquema";
import { esquemaConfig, type ConfigFormulario } from "./tipos";

/** Lo que sirve en común a la parte pública (los envíos) y al constructor (el panel). Sin permisos propios: quien llama los comprueba. */

function secreto(): string {
  return createHash("sha256")
    .update(process.env.FORMULARIOS_SECRETO || process.env.AUTH_SECRET || process.env.DATABASE_URL || "machea-formularios-desarrollo")
    .digest("hex");
}

/** Marca la hora en que se mostró el formulario: sirve para rechazar envíos de un robot (demasiado rápidos) o vencidos. */
export function firmarToken(slug: string): string {
  const ts = String(Date.now());
  return `${ts}.${createHmac("sha256", secreto()).update(`${ts}.${slug}`).digest("hex").slice(0, 32)}`;
}

export function edadDelToken(slug: string, token: string): number | null {
  const [ts, firma] = String(token).split(".");
  if (!ts || !firma || !/^\d{10,16}$/.test(ts)) return null;
  const esperada = createHmac("sha256", secreto()).update(`${ts}.${slug}`).digest("hex").slice(0, 32);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Date.now() - Number(ts);
}

/** La IP de quien envía, solo como huella del día: sirve para limitar abusos sin guardar la dirección. */
export async function huellaDeIp(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "desconocida").split(",")[0]!.trim();
  const dia = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${secreto()}|${ip}|${dia}`).digest("hex").slice(0, 24);
}

export function configDe(valor: unknown): ConfigFormulario | null {
  const r = esquemaConfig.safeParse(valor);
  return r.success ? r.data : null;
}

export interface FormularioPublico {
  id: string;
  empresaId: string;
  nombre: string;
  estado: string;
  config: ConfigFormulario;
  nombreEmpresa: string;
  /** Opciones de las preguntas «proyecto o inmueble»: lo activo del catálogo de la empresa. */
  catalogo: string[];
}

/** El formulario de una dirección pública, de cualquier empresa. Solo lo necesario para mostrarlo y recibirlo. */
export async function formularioPorSlug(slug: string): Promise<FormularioPublico | null> {
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(slug)) return null;
  const db = await bd();
  const [f] = await db.select().from(formularios).where(eq(formularios.slug, slug)).limit(1);
  if (!f) return null;
  const config = configDe(f.config);
  if (!config) return null;
  const [c] = await db.select({ nombre: configuracion.nombreEmpresa }).from(configuracion).where(eq(configuracion.empresaId, f.empresaId));
  const usaCatalogo = config.campos.some((x) => x.tipo === "catalogo");
  let catalogo: string[] = [];
  if (usaCatalogo) {
    const p = await db.select({ n: proyectos.nombre }).from(proyectos).where(and(eq(proyectos.empresaId, f.empresaId), eq(proyectos.activo, true))).limit(80);
    const i = await db
      .select({ n: inmuebles.titulo })
      .from(inmuebles)
      .where(and(eq(inmuebles.empresaId, f.empresaId), eq(inmuebles.estado, "disponible")))
      .limit(80);
    catalogo = [...p.map((x) => x.n), ...i.map((x) => x.n)];
  }
  return { id: f.id, empresaId: f.empresaId, nombre: f.nombre, estado: f.estado, config, nombreEmpresa: c?.nombre ?? "", catalogo };
}

export async function contarEnvios(formularioId: string, desde: Date, ipHash?: string): Promise<number> {
  const db = await bd();
  const [r] = await db
    .select({ n: count() })
    .from(enviosFormulario)
    .where(and(eq(enviosFormulario.formularioId, formularioId), gte(enviosFormulario.creadoEn, desde), ipHash ? eq(enviosFormulario.ipHash, ipHash) : undefined));
  return r?.n ?? 0;
}

/** Una dirección corta y única: «interesados-en-un-proyecto-x7k2». */
export async function slugUnico(nombre: string): Promise<string> {
  const base =
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "formulario";
  const db = await bd();
  for (let intento = 0; intento < 6; intento++) {
    const slug = `${base}-${randomBytes(2).toString("hex")}`;
    const [existe] = await db.select({ id: formularios.id }).from(formularios).where(eq(formularios.slug, slug)).limit(1);
    if (!existe) return slug;
  }
  return `${base}-${randomBytes(4).toString("hex")}`;
}

// --- Lo del panel: siempre de la empresa de quien mira ---

export async function listarFormularios() {
  const db = await bd();
  const empresaId = await empresaActual();
  const filas = await db.select().from(formularios).where(eq(formularios.empresaId, empresaId)).orderBy(desc(formularios.creadoEn));
  const envios = await db
    .select({ id: enviosFormulario.formularioId, n: count() })
    .from(enviosFormulario)
    .where(eq(enviosFormulario.empresaId, empresaId))
    .groupBy(enviosFormulario.formularioId);
  const porId = new Map(envios.map((e) => [e.id, e.n]));
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, slug: f.slug, estado: f.estado, actualizadoEn: f.actualizadoEn, envios: porId.get(f.id) ?? 0 }));
}

export async function obtenerFormulario(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await bd();
  const empresaId = await empresaActual();
  const [f] = await db.select().from(formularios).where(and(eq(formularios.id, id), eq(formularios.empresaId, empresaId))).limit(1);
  if (!f) return null;
  return { id: f.id, nombre: f.nombre, slug: f.slug, estado: f.estado, config: configDe(f.config), actualizadoEn: f.actualizadoEn };
}

export async function ultimosEnvios(formularioId: string, limite = 8) {
  const db = await bd();
  const empresaId = await empresaActual();
  return db
    .select({ id: enviosFormulario.id, creadoEn: enviosFormulario.creadoEn, candidatoId: enviosFormulario.candidatoId, nombre: candidatos.nombre, apellidos: candidatos.apellidos })
    .from(enviosFormulario)
    .leftJoin(candidatos, eq(candidatos.id, enviosFormulario.candidatoId))
    .where(and(eq(enviosFormulario.formularioId, formularioId), eq(enviosFormulario.empresaId, empresaId)))
    .orderBy(desc(enviosFormulario.creadoEn))
    .limit(limite);
}

/** Las opciones de catálogo de la empresa para la vista previa del constructor. */
export async function opcionesDeCatalogo(): Promise<string[]> {
  const db = await bd();
  const empresaId = await empresaActual();
  const p = await db.select({ n: proyectos.nombre }).from(proyectos).where(and(eq(proyectos.empresaId, empresaId), eq(proyectos.activo, true))).limit(80);
  const i = await db.select({ n: inmuebles.titulo }).from(inmuebles).where(and(eq(inmuebles.empresaId, empresaId), eq(inmuebles.estado, "disponible"))).limit(80);
  return [...p.map((x) => x.n), ...i.map((x) => x.n)];
}
