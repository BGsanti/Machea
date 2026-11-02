import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { esEsquemaIncompleto } from "@/db/esquema-listo";
import { MAX_INTENTOS } from "@/crm/servidor/atascados";

export const dynamic = "force-dynamic";

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Chequeo de salud para un monitor externo (UptimeRobot, Better Stack…).
 * Sin clave: solo `{ ok }` con 200 o 503, sin datos del negocio. Con la clave (cabecera `x-salud-clave` igual a la
 * variable CRM_SALUD_CLAVE): además, si el esquema está al día y cuánto lleva esperando la bandeja de leads.
 */
export async function GET(req: Request) {
  const clave = process.env.CRM_SALUD_CLAVE;
  const detallado = Boolean(clave) && igual(req.headers.get("x-salud-clave") ?? "", clave!);
  const cabeceras = { "Cache-Control": "no-store" };
  try {
    const db = await bd(); // en producción también comprueba que las migraciones estén aplicadas
    if (!detallado) return Response.json({ ok: true }, { headers: cabeceras });
    // «Pendientes» son los que la bandeja aún reintenta; «atascados», los que agotaron sus intentos y ya no se tocan
    // solos (de todas las empresas: es un chequeo del sistema, sin datos de nadie).
    const r = await db.execute<{ pendientes: string; mas_vieja_min: string | null; atascados: string }>(sql`
      select count(*) filter (where intentos < ${MAX_INTENTOS}) as pendientes,
        extract(epoch from (now() - min(creado_en) filter (where intentos < ${MAX_INTENTOS}))) / 60.0 as mas_vieja_min,
        count(*) filter (where intentos >= ${MAX_INTENTOS}) as atascados
      from crm.bandeja_leads where procesado_en is null`);
    const f = r.rows[0]!;
    const masViejaMin = f.mas_vieja_min === null ? null : Math.round(Number(f.mas_vieja_min));
    return Response.json(
      { ok: true, baseDeDatos: "ok", esquema: "al día", bandeja: { pendientes: Number(f.pendientes), masViejaMin, atascados: Number(f.atascados) } },
      { headers: cabeceras },
    );
  } catch (e) {
    console.error("[crm] salud:", e);
    if (!detallado) return Response.json({ ok: false }, { status: 503, headers: cabeceras });
    return Response.json({ ok: false, esquema: esEsquemaIncompleto(e) ? e.message : "error", baseDeDatos: esEsquemaIncompleto(e) ? "ok" : "con problemas" }, { status: 503, headers: cabeceras });
  }
}
