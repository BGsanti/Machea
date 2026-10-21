import { Insignia } from "@/ui/basicos";
import { Icono } from "@/ui/icono";
import { formatoFechaHora } from "../../formato";
import type { LlamadaManuela } from "../../servidor/repositorio";

const temperaturas: Record<string, { etiqueta: string; color: string }> = {
  caliente: { etiqueta: "Caliente", color: "bg-rose-100 text-rose-700" },
  tibio: { etiqueta: "Tibio", color: "bg-amber-100 text-amber-800" },
  frio: { etiqueta: "Frío", color: "bg-sky-100 text-sky-800" },
};

/** Parte lo que guarda la ingesta (bloques separados por una línea en blanco) en resumen, recomendación, objeción y temperatura. */
function leerComentarios(texto: string | null) {
  const salida = { resumen: [] as string[], recomendacion: null as string | null, objecion: null as string | null, temperatura: null as string | null, sinContacto: false };
  for (const bloque of (texto ?? "").split(/\n\n+/).map((b) => b.trim()).filter(Boolean)) {
    if (bloque.startsWith("Recomendación para el asesor:")) salida.recomendacion = bloque.replace("Recomendación para el asesor:", "").trim();
    else if (bloque.startsWith("Objeción principal:")) salida.objecion = bloque.replace("Objeción principal:", "").trim();
    else if (bloque.startsWith("Temperatura:")) salida.temperatura = bloque.replace("Temperatura:", "").trim().toLowerCase();
    else if (bloque.startsWith("No se logró hablar")) salida.sinContacto = true;
    else salida.resumen.push(bloque);
  }
  return salida;
}

/** Lo que Manuela hizo con este lead: qué pasó en la llamada, qué recomienda y la cita si la agendó. */
export function TarjetaLlamadaManuela({ llamada }: { llamada: LlamadaManuela }) {
  const c = leerComentarios(llamada.comentarios);
  const temp = c.temperatura ? temperaturas[c.temperatura] : undefined;
  return (
    <section className="animate-subir overflow-hidden rounded-xl border border-slate-200 border-l-4 border-l-marca-500 bg-white shadow-sm" aria-label="Llamada de Manuela">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-marca-100 text-marca-700">
          <Icono nombre="PhoneCall" className="size-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-slate-800">{llamada.asunto}</h2>
        <span className="text-xs text-slate-500">{formatoFechaHora(llamada.fecha)}</span>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {temp ? <Insignia color={temp.color}>{temp.etiqueta}</Insignia> : null}
          {c.sinContacto ? <Insignia color="bg-slate-100 text-slate-700">No contestó</Insignia> : null}
          {llamada.cita ? <Insignia color="bg-emerald-100 text-emerald-800">Cita agendada</Insignia> : null}
        </span>
      </header>
      <div className="grid gap-4 px-5 py-4 lg:grid-cols-3">
        <div className="space-y-2 text-sm text-slate-700 lg:col-span-2">
          {c.resumen.length ? c.resumen.map((r, i) => <p key={i}>{r}</p>) : <p className="text-slate-500">Sin resumen de la llamada.</p>}
          {c.objecion ? (
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-600">Objeción principal:</span> {c.objecion}
            </p>
          ) : null}
        </div>
        <div className="space-y-3">
          {c.recomendacion ? (
            <div className="rounded-lg bg-marca-50 p-3 text-sm">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-marca-800">
                <Icono nombre="Sparkles" className="size-3.5" /> Qué hacer ahora
              </p>
              <p className="mt-1 text-slate-700">{c.recomendacion}</p>
            </div>
          ) : null}
          {llamada.cita ? (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <Icono nombre="CalendarDays" className="mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block font-medium">{formatoFechaHora(llamada.cita.inicio)}</span>
                {llamada.cita.canal ? <span className="block text-xs">{llamada.cita.canal}</span> : null}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
