import Link from "next/link";
import clsx from "clsx";
import type { MedidorRespuesta } from "../../servidor/panel";
import { Anillo, duracionCorta } from "../graficos-panel";

/** La tarjeta de abajo de la barra lateral: cómo va la atención de los leads, siempre a la vista (en vez de «créditos usados»). */
export function TarjetaMedidor({ m }: { m: MedidorRespuesta }) {
  const color = m.pct === null ? "#7d8a9c" : m.pct >= 80 ? "#34d399" : m.pct >= 50 ? "#fbbf24" : "#fb7185";
  return (
    <Link
      href="/inicio"
      className="block rounded-xl bg-white/6 p-3 transition-colors duration-150 hover:bg-white/10"
      title={`Contactar a cada lead nuevo en menos de ${m.slaMinutos} min`}
    >
      <p className="text-[11px] font-semibold tracking-wide text-riel-texto uppercase">{m.alcance === "tu" ? "Tu respuesta" : "Respuesta del equipo"}</p>
      <div className="mt-2 flex items-center gap-3">
        <Anillo pct={m.pct} tamano={48} color={color} pista="text-white/10">
          <span className="text-xs text-white">{m.pct === null ? "—" : `${m.pct}%`}</span>
        </Anillo>
        <div className="min-w-0 text-xs leading-snug">
          <p className={clsx("font-medium", m.pct === null ? "text-riel-texto" : "text-white")}>{m.pct === null ? "Sin leads aún" : "a tiempo"}</p>
          <p className="text-riel-suave">meta: {m.slaMinutos} min{m.medianaMin !== null ? ` · mediana ${duracionCorta(m.medianaMin)}` : ""}</p>
        </div>
      </div>
    </Link>
  );
}
