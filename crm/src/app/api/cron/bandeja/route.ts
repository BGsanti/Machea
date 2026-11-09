import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { MAX_INTENTOS } from "@/crm/servidor/atascados";
import { procesarBandeja } from "@/crm/servidor/ingesta";
import { usuarioSistema } from "@/crm/servidor/reparto";

export const dynamic = "force-dynamic";

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Procesa la bandeja de leads de todas las empresas sin esperar a que alguien abra el CRM. Sin esto, un lead que llega
 * de noche no entra (ni se le asigna asesor, ni cuenta para el reloj de respuesta) hasta que alguien entra.
 *
 * Lo llama un cron externo cada ~5 minutos (cron-job.org, como el de Camila), con la cabecera
 * `Authorization: Bearer <CRON_SECRET>`. CRON_SECRET va en Vercel (proyecto del CRM), 24+ caracteres. Sin ella la ruta
 * no hace nada. No se usa el cron de Vercel: uno cada pocos minutos exige el plan Pro.
 */
export async function POST(req: Request) {
  const clave = process.env.CRON_SECRET;
  const cabeceras = { "Cache-Control": "no-store" };
  if (!clave || clave.length < 24) return Response.json({ ok: false, error: "CRON_SECRET no está configurada" }, { status: 503, headers: cabeceras });
  if (!igual(req.headers.get("authorization") ?? "", `Bearer ${clave}`)) return Response.json({ ok: false }, { status: 401, headers: cabeceras });

  const db = await bd();
  const empresas = await db.execute<{ empresa_id: string }>(sql`
    select distinct empresa_id from crm.bandeja_leads where procesado_en is null and intentos < ${MAX_INTENTOS}`);
  let procesadas = 0;
  let conError = 0;
  for (const { empresa_id } of empresas.rows) {
    try {
      procesadas += await procesarBandeja(await usuarioSistema(empresa_id));
    } catch (e) {
      // Una empresa con problemas (por ejemplo, sin dueño) no detiene a las demás.
      conError++;
      console.error("[crm] cron de la bandeja:", e);
    }
  }
  return Response.json({ ok: true, empresas: empresas.rows.length, procesadas, conError }, { headers: cabeceras });
}
