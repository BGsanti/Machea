import { sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { ZONA_HORARIA, fechaLocal } from "../fechas";

// Consumo del mes de la empresa: llamadas de la asistente, minutos, WhatsApp de seguimiento y correos. Es la base de
// las bolsas de cada plan (cuánto incluye y cuándo se cobra el excedente); por ahora solo se mide, sin límites.
// No lleva "use server": se llama desde las páginas del servidor.

/** De dónde vino lo que se consumió: el formulario con la marca de la empresa, un proyecto suyo en el formulario
 * de Machea (la persona autorizó compartir) o las llamadas de captación (solo la empresa interna de Machea). */
export type Fuente = "formulario" | "proyecto" | "captacion" | "otro";

export interface ConsumoFuente {
  llamadas: number;
  /** Cada llamada cuenta por minuto iniciado: una de 1 min 10 s son 2 minutos. */
  minutos: number;
  whatsapp: number;
}

export interface ConsumoDelMes {
  /** Primer día del mes, AAAA-MM-DD, en la zona del negocio. */
  desde: string;
  total: ConsumoFuente & { correos: number };
  porFuente: Partial<Record<Fuente, ConsumoFuente>>;
}

const FUENTE: Record<string, Fuente> = { marca: "formulario", proyecto: "proyecto", captacion: "captacion" };

export async function consumoDelMes(hoy: Date = new Date()): Promise<ConsumoDelMes> {
  const empresaId = await empresaActual();
  const desde = `${fechaLocal(hoy).slice(0, 8)}01`;
  const inicio = sql`(${desde}::date)::timestamp at time zone ${ZONA_HORARIA}`;
  const db = await bd();
  const llamadas = await db.execute<{ fuente: string | null; llamadas: string; minutos: string; whatsapp: string }>(sql`
    select fuente, count(*) as llamadas, coalesce(sum(ceil(dur / 60000.0)), 0) as minutos,
      count(*) filter (where wa) as whatsapp
    from (
      select case when origen = 'llamada_captacion' then 'captacion' else datos ->> 'regla' end as fuente,
        case when datos ->> 'duracion_ms' ~ '^[0-9]{1,9}$' then (datos ->> 'duracion_ms')::bigint else 0 end as dur,
        datos ->> 'whatsapp_enviado_en' is not null as wa
      from crm.bandeja_leads
      where empresa_id = ${empresaId} and origen in ('resultado', 'llamada_captacion') and creado_en >= ${inicio}
    ) x
    group by fuente`);
  const correos = await db.execute<{ total: string | null }>(sql`
    select coalesce(sum(destinatarios), 0) as total from crm.correos_lista
    where empresa_id = ${empresaId} and creado_en >= ${inicio}`);

  const total = { llamadas: 0, minutos: 0, whatsapp: 0, correos: Number(correos.rows[0]?.total ?? 0) };
  const porFuente: ConsumoDelMes["porFuente"] = {};
  for (const f of llamadas.rows) {
    const fuente = FUENTE[f.fuente ?? ""] ?? "otro";
    const fila = { llamadas: Number(f.llamadas), minutos: Number(f.minutos), whatsapp: Number(f.whatsapp) };
    const previo = porFuente[fuente];
    porFuente[fuente] = previo
      ? { llamadas: previo.llamadas + fila.llamadas, minutos: previo.minutos + fila.minutos, whatsapp: previo.whatsapp + fila.whatsapp }
      : fila;
    total.llamadas += fila.llamadas;
    total.minutos += fila.minutos;
    total.whatsapp += fila.whatsapp;
  }
  return { desde, total, porFuente };
}
