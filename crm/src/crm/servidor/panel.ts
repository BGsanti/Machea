import { sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { ZONA_HORARIA } from "../fechas";

// Datos del panel del gerente y de «Mi día» del asesor. No lleva "use server": se llama desde las páginas del servidor.
// Todas las consultas se limitan a la empresa actual.

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export function periodoDe(valor: unknown): Periodo {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 7;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Expresión SQL: cuándo empezó a correr el reloj de respuesta de un lead (cuando se le asignó o, si no, cuando entró). */
const inicioReloj = sql`coalesce(asignado_en, creado_en)`;
const minutosHastaContacto = sql`extract(epoch from (primer_contacto_en - coalesce(asignado_en, creado_en))) / 60.0`;

export interface FilaAsesor {
  id: string;
  nombre: string;
  rol: string;
  asignados: number;
  contactados: number;
  enTiempo: number;
  medianaMin: number | null;
  citas: number;
  atrasados: number;
  tareasVencidas: number;
}

export interface LeadAtrasado {
  id: string;
  nombre: string;
  telefono: string | null;
  interes: string | null;
  asesorId: string | null;
  asesor: string | null;
  minutos: number;
}

export interface ResumenPanel {
  dias: number;
  slaMinutos: number;
  nuevos: number;
  nuevosAntes: number;
  /** De los leads que ya debían estar contactados (lo estén o haya pasado su plazo), el % que se contactó a tiempo. */
  pctEnTiempo: number | null;
  pctEnTiempoAntes: number | null;
  medianaMin: number | null;
  medianaMinAntes: number | null;
  citas: number;
  citasAntes: number;
  calientesAbiertos: number;
  sinAsignar: number;
  pipeline: { total: number; n: number };
  serie: { dia: string; total: number }[];
  porAsesor: FilaAsesor[];
  embudo: { estado: string; total: number }[];
  porFuente: { origen: string | null; total: number; calientes: number; contactados: number }[];
  atrasados: LeadAtrasado[];
  totalAtrasados: number;
}

type FilaPeriodo = { nuevos: string; debidos: string; en_tiempo: string; mediana: string | null };

async function resumenDe(empresaId: string, sla: number, desdeDias: number, hastaDias: number): Promise<{ nuevos: number; pct: number | null; mediana: number | null }> {
  const db = await bd();
  const r = await db.execute<FilaPeriodo>(sql`
    select count(*) as nuevos,
      count(*) filter (where primer_contacto_en is not null or ${inicioReloj} < now() - make_interval(mins => (${sla})::int)) as debidos,
      count(*) filter (where primer_contacto_en is not null and ${minutosHastaContacto} <= ${sla}) as en_tiempo,
      percentile_cont(0.5) within group (order by ${minutosHastaContacto}) filter (where primer_contacto_en is not null) as mediana
    from crm.candidatos
    where empresa_id = ${empresaId}
      and creado_en >= now() - make_interval(days => (${desdeDias})::int)
      and creado_en < now() - make_interval(days => (${hastaDias})::int)`);
  const f = r.rows[0]!;
  const debidos = num(f.debidos);
  return { nuevos: num(f.nuevos), pct: debidos > 0 ? Math.round((num(f.en_tiempo) / debidos) * 100) : null, mediana: numONull(f.mediana) };
}

export async function resumenPanel(dias: Periodo, slaMinutos: number): Promise<ResumenPanel> {
  const db = await bd();
  const empresaId = await empresaActual();
  const [actual, anterior] = await Promise.all([resumenDe(empresaId, slaMinutos, dias, 0), resumenDe(empresaId, slaMinutos, dias * 2, dias)]);

  const citasDe = async (desdeDias: number, hastaDias: number) => {
    const r = await db.execute<{ n: string }>(sql`
      select count(*) as n from crm.eventos
      where empresa_id = ${empresaId} and quien_objeto in ('candidatos', 'contactos')
        and creado_en >= now() - make_interval(days => (${desdeDias})::int) and creado_en < now() - make_interval(days => (${hastaDias})::int)`);
    return num(r.rows[0]?.n);
  };

  const [citas, citasAntes, otros, serie, porAsesor, embudo, porFuente, atrasados, pipeline] = await Promise.all([
    citasDe(dias, 0),
    citasDe(dias * 2, dias),
    db.execute<{ calientes: string; sin_asignar: string; atrasados: string }>(sql`
      select count(*) filter (where not convertido and estado <> 'no_calificado' and valoracion = 'caliente') as calientes,
        count(*) filter (where not convertido and estado <> 'no_calificado' and propietario_id is null) as sin_asignar,
        count(*) filter (where not convertido and estado = 'nuevo' and ${inicioReloj} < now() - make_interval(mins => (${slaMinutos})::int)) as atrasados
      from crm.candidatos where empresa_id = ${empresaId}`),
    db.execute<{ dia: string; total: string }>(sql`
      select to_char(d::date, 'YYYY-MM-DD') as dia, coalesce(c.total, 0) as total
      from generate_series((now() at time zone ${ZONA_HORARIA})::date - (${Math.min(dias, 30) - 1})::int, (now() at time zone ${ZONA_HORARIA})::date, interval '1 day') d
      left join (
        select (creado_en at time zone ${ZONA_HORARIA})::date as dia, count(*) as total
        from crm.candidatos where empresa_id = ${empresaId} group by 1
      ) c on c.dia = d::date
      order by d`),
    db.execute<{
      id: string; nombre: string; rol: string; asignados: string; contactados: string; en_tiempo: string; mediana: string | null;
      citas: string; atrasados: string; tareas_vencidas: string;
    }>(sql`
      select u.id, u.name as nombre, u.rol,
        coalesce(l.asignados, 0) as asignados, coalesce(l.contactados, 0) as contactados, coalesce(l.en_tiempo, 0) as en_tiempo,
        l.mediana, coalesce(e.citas, 0) as citas, coalesce(a.atrasados, 0) as atrasados, coalesce(t.vencidas, 0) as tareas_vencidas
      from crm.usuarios u
      left join (
        select propietario_id,
          count(*) as asignados,
          count(*) filter (where primer_contacto_en is not null) as contactados,
          count(*) filter (where primer_contacto_en is not null and ${minutosHastaContacto} <= ${slaMinutos}) as en_tiempo,
          percentile_cont(0.5) within group (order by ${minutosHastaContacto}) filter (where primer_contacto_en is not null) as mediana
        from crm.candidatos
        where empresa_id = ${empresaId} and creado_en >= now() - make_interval(days => (${dias})::int)
        group by propietario_id
      ) l on l.propietario_id = u.id
      left join (
        select propietario_id, count(*) as citas from crm.eventos
        where empresa_id = ${empresaId} and quien_objeto in ('candidatos', 'contactos') and creado_en >= now() - make_interval(days => (${dias})::int)
        group by propietario_id
      ) e on e.propietario_id = u.id
      left join (
        select propietario_id, count(*) as atrasados from crm.candidatos
        where empresa_id = ${empresaId} and not convertido and estado = 'nuevo' and ${inicioReloj} < now() - make_interval(mins => (${slaMinutos})::int)
        group by propietario_id
      ) a on a.propietario_id = u.id
      left join (
        select propietario_id, count(*) as vencidas from crm.tareas
        where empresa_id = ${empresaId} and estado <> 'completada' and fecha_vencimiento <= current_date
        group by propietario_id
      ) t on t.propietario_id = u.id
      where u.empresa_id = ${empresaId} and u.activo and u.rol <> 'lectura'
        and (u.recibe_leads or l.asignados is not null or a.atrasados is not null)
      order by coalesce(l.asignados, 0) desc, u.name`),
    db.execute<{ estado: string; total: string }>(sql`
      select estado, count(*) as total from crm.candidatos
      where empresa_id = ${empresaId} and not convertido group by estado`),
    db.execute<{ origen: string | null; total: string; calientes: string; contactados: string }>(sql`
      select origen, count(*) as total, count(*) filter (where valoracion = 'caliente') as calientes,
        count(*) filter (where primer_contacto_en is not null or estado <> 'nuevo') as contactados
      from crm.candidatos
      where empresa_id = ${empresaId} and creado_en >= now() - make_interval(days => (${dias})::int)
      group by origen order by count(*) desc limit 8`),
    db.execute<{ id: string; nombre: string | null; apellidos: string; telefono: string | null; interes: string | null; asesor_id: string | null; asesor: string | null; minutos: string }>(sql`
      select c.id, c.nombre, c.apellidos, c.telefono, c.interes, c.propietario_id as asesor_id, u.name as asesor,
        extract(epoch from (now() - coalesce(c.asignado_en, c.creado_en))) / 60.0 as minutos
      from crm.candidatos c left join crm.usuarios u on u.id = c.propietario_id
      where c.empresa_id = ${empresaId} and not c.convertido and c.estado = 'nuevo'
        and coalesce(c.asignado_en, c.creado_en) < now() - make_interval(mins => (${slaMinutos})::int)
      order by coalesce(c.asignado_en, c.creado_en) asc limit 8`),
    db.execute<{ total: string | null; n: string }>(sql`
      select sum(importe) as total, count(*) as n from crm.oportunidades
      where empresa_id = ${empresaId} and etapa not in ('cerrada_ganada', 'cerrada_perdida')`),
  ]);

  const o = otros.rows[0]!;
  return {
    dias,
    slaMinutos,
    nuevos: actual.nuevos,
    nuevosAntes: anterior.nuevos,
    pctEnTiempo: actual.pct,
    pctEnTiempoAntes: anterior.pct,
    medianaMin: actual.mediana,
    medianaMinAntes: anterior.mediana,
    citas,
    citasAntes,
    calientesAbiertos: num(o.calientes),
    sinAsignar: num(o.sin_asignar),
    pipeline: { total: num(pipeline.rows[0]?.total), n: num(pipeline.rows[0]?.n) },
    serie: serie.rows.map((f) => ({ dia: f.dia, total: num(f.total) })),
    porAsesor: porAsesor.rows.map((f) => ({
      id: f.id,
      nombre: f.nombre,
      rol: f.rol,
      asignados: num(f.asignados),
      contactados: num(f.contactados),
      enTiempo: num(f.en_tiempo),
      medianaMin: numONull(f.mediana),
      citas: num(f.citas),
      atrasados: num(f.atrasados),
      tareasVencidas: num(f.tareas_vencidas),
    })),
    embudo: embudo.rows.map((f) => ({ estado: f.estado, total: num(f.total) })),
    porFuente: porFuente.rows.map((f) => ({ origen: f.origen, total: num(f.total), calientes: num(f.calientes), contactados: num(f.contactados) })),
    atrasados: atrasados.rows.map((f) => ({
      id: f.id,
      nombre: [f.nombre, f.apellidos].filter((x) => x && x !== "(sin apellido)").join(" ") || "Sin nombre",
      telefono: f.telefono,
      interes: f.interes,
      asesorId: f.asesor_id,
      asesor: f.asesor,
      minutos: Math.round(num(f.minutos)),
    })),
    totalAtrasados: num(o.atrasados),
  };
}

// ---------------------------------------------------------------------------
// Mi día (asesor)
// ---------------------------------------------------------------------------

export interface LeadPorContactar {
  id: string;
  nombre: string;
  telefono: string | null;
  interes: string | null;
  valoracion: string | null;
  origen: string | null;
  /** Desde cuándo corre su reloj de respuesta (ISO). El navegador lo cuenta en vivo. */
  desde: string;
  minutos: number;
}

export interface CitaDia {
  id: string;
  asunto: string;
  inicio: Date;
  fin: Date;
  ubicacion: string | null;
}

export interface DatosMiDia {
  slaMinutos: number;
  porContactar: LeadPorContactar[];
  totalPorContactar: number;
  citasHoy: CitaDia[];
  proximasCitas: CitaDia[];
  semana: { recibidos: number; contactados: number; citas: number; medianaMin: number | null; enTiempoPct: number | null };
  abiertos: number;
}

/** Todo lo que necesita un asesor para empezar el día. Solo de él: leads, tareas y citas donde es el propietario. */
export async function datosMiDia(usuarioId: string, slaMinutos: number): Promise<DatosMiDia> {
  const db = await bd();
  const empresaId = await empresaActual();
  const [porContactar, total, citas, semana, abiertos] = await Promise.all([
    db.execute<{ id: string; nombre: string | null; apellidos: string; telefono: string | null; interes: string | null; valoracion: string | null; origen: string | null; desde: Date; minutos: string }>(sql`
      select id, nombre, apellidos, telefono, interes, valoracion, origen, coalesce(asignado_en, creado_en) as desde,
        extract(epoch from (now() - coalesce(asignado_en, creado_en))) / 60.0 as minutos
      from crm.candidatos
      where empresa_id = ${empresaId} and propietario_id = ${usuarioId} and not convertido and estado = 'nuevo'
      order by (valoracion = 'caliente') desc, coalesce(asignado_en, creado_en) asc limit 8`),
    db.execute<{ n: string }>(sql`
      select count(*) as n from crm.candidatos
      where empresa_id = ${empresaId} and propietario_id = ${usuarioId} and not convertido and estado = 'nuevo'`),
    db.execute<{ id: string; asunto: string; inicio: Date; fin: Date; ubicacion: string | null; es_hoy: boolean }>(sql`
      select id, asunto, inicio, fin, ubicacion,
        ((inicio at time zone ${ZONA_HORARIA})::date <= (now() at time zone ${ZONA_HORARIA})::date) as es_hoy
      from crm.eventos
      where empresa_id = ${empresaId} and propietario_id = ${usuarioId} and fin >= now() and inicio < now() + interval '7 days'
      order by inicio limit 30`),
    db.execute<{ recibidos: string; contactados: string; en_tiempo: string; debidos: string; mediana: string | null; citas: string }>(sql`
      select count(*) as recibidos,
        count(*) filter (where primer_contacto_en is not null) as contactados,
        count(*) filter (where primer_contacto_en is not null and ${minutosHastaContacto} <= ${slaMinutos}) as en_tiempo,
        count(*) filter (where primer_contacto_en is not null or ${inicioReloj} < now() - make_interval(mins => (${slaMinutos})::int)) as debidos,
        percentile_cont(0.5) within group (order by ${minutosHastaContacto}) filter (where primer_contacto_en is not null) as mediana,
        (select count(*) from crm.eventos e where e.empresa_id = ${empresaId} and e.propietario_id = ${usuarioId}
          and e.quien_objeto in ('candidatos', 'contactos') and e.creado_en >= now() - interval '7 days') as citas
      from crm.candidatos
      where empresa_id = ${empresaId} and propietario_id = ${usuarioId} and creado_en >= now() - interval '7 days'`),
    db.execute<{ n: string }>(sql`
      select count(*) as n from crm.candidatos
      where empresa_id = ${empresaId} and propietario_id = ${usuarioId} and not convertido and estado <> 'no_calificado'`),
  ]);
  const mapa = (f: { id: string; asunto: string; inicio: Date; fin: Date; ubicacion: string | null }): CitaDia => ({ id: f.id, asunto: f.asunto, inicio: new Date(f.inicio), fin: new Date(f.fin), ubicacion: f.ubicacion });
  const s = semana.rows[0]!;
  const debidos = num(s.debidos);
  return {
    slaMinutos,
    porContactar: porContactar.rows.map((f) => ({
      id: f.id,
      nombre: [f.nombre, f.apellidos].filter((x) => x && x !== "(sin apellido)").join(" ") || "Sin nombre",
      telefono: f.telefono,
      interes: f.interes,
      valoracion: f.valoracion,
      origen: f.origen,
      desde: new Date(f.desde).toISOString(),
      minutos: Math.round(num(f.minutos)),
    })),
    totalPorContactar: num(total.rows[0]?.n),
    citasHoy: citas.rows.filter((f) => f.es_hoy).map(mapa),
    proximasCitas: citas.rows.filter((f) => !f.es_hoy).map(mapa),
    semana: {
      recibidos: num(s.recibidos),
      contactados: num(s.contactados),
      citas: num(s.citas),
      medianaMin: numONull(s.mediana),
      enTiempoPct: debidos > 0 ? Math.round((num(s.en_tiempo) / debidos) * 100) : null,
    },
    abiertos: num(abiertos.rows[0]?.n),
  };
}
