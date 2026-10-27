import { sql } from "drizzle-orm";
import type { BaseDatos } from "./cliente";

/**
 * Comprueba que la base de datos tenga el esquema que este código espera. En producción las migraciones las corre una
 * persona ANTES de subir el código (pnpm db:migrar + select crm.cerrar_tablas();), y el rol del CRM no puede leer la
 * tabla de migraciones de Drizzle: por eso se «sondea» lo más nuevo de cada migración con un select que no trae filas.
 * Si falta algo, el CRM muestra una pantalla de «Actualizando» con los pasos, en vez de un error confuso.
 *
 * AL AGREGAR UNA MIGRACIÓN: sumar aquí una sonda con lo nuevo que trae.
 */
const SONDAS: { migracion: string; consulta: string }[] = [
  { migracion: "0002_perfiles_catalogo_formularios", consulta: "select perfil from crm.configuracion limit 0" },
  { migracion: "0003_equipo_reparto", consulta: "select reparto, sla_minutos from crm.configuracion limit 0" },
  { migracion: "0003_equipo_reparto", consulta: "select activo, recibe_leads from crm.usuarios limit 0" },
  { migracion: "0003_equipo_reparto", consulta: "select asignado_en, primer_contacto_en from crm.candidatos limit 0" },
  { migracion: "0003_equipo_reparto", consulta: "select hash from crm.invitaciones limit 0" },
];

export class EsquemaIncompleto extends Error {
  constructor(
    public migracion: string,
    /** «migrar»: falta correr pnpm db:migrar. «permisos»: falta select crm.cerrar_tablas(). */
    public paso: "migrar" | "permisos",
  ) {
    super(
      paso === "migrar"
        ? `Falta aplicar la migración ${migracion}: correr «pnpm db:migrar» en crm/ y luego «select crm.cerrar_tablas();».`
        : `El rol del CRM no puede leer lo que trae ${migracion}: correr «select crm.cerrar_tablas();» en Supabase.`,
    );
    this.name = "EsquemaIncompleto";
  }
}

export function esEsquemaIncompleto(e: unknown): e is EsquemaIncompleto {
  return e instanceof Error && e.name === "EsquemaIncompleto";
}

const codigoDe = (e: unknown): string | undefined => {
  const c = e as { code?: string; cause?: { code?: string } } | null;
  return c?.code ?? c?.cause?.code;
};

let verificado = false;

/** Lanza `EsquemaIncompleto` si falta algo. Cuando todo está, no vuelve a consultar (hasta que se reinicie la instancia). */
export async function verificarEsquema(db: BaseDatos): Promise<void> {
  if (verificado) return;
  for (const s of SONDAS) {
    try {
      await db.execute(sql.raw(s.consulta));
    } catch (e) {
      const c = codigoDe(e);
      if (c === "42703" || c === "42P01") throw new EsquemaIncompleto(s.migracion, "migrar");
      if (c === "42501") throw new EsquemaIncompleto(s.migracion, "permisos");
      throw e;
    }
  }
  verificado = true;
}
