import { Icono } from "@/ui/icono";

export interface RespuestaFormulario {
  clave: string;
  etiqueta: string;
  valor: string;
}

/** Lo que la persona contestó en el formulario, con las preguntas tal como las vio. */
export function RespuestasFormulario({ respuestas }: { respuestas: RespuestaFormulario[] }) {
  if (respuestas.length === 0) return null;
  return (
    <section className="animate-subir rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Respuestas del formulario">
      <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Icono nombre="ClipboardList" className="size-3.5" />
        </span>
        <h2 className="text-sm font-semibold text-slate-800">Lo que contestó en el formulario</h2>
      </header>
      <dl className="grid gap-x-8 px-5 py-2 sm:grid-cols-2">
        {respuestas.map((r) => (
          <div key={r.clave} className="border-b border-slate-100 py-2">
            <dt className="text-xs text-slate-500">{r.etiqueta}</dt>
            <dd className="mt-0.5 text-sm whitespace-pre-line text-slate-800">{r.valor || <span className="text-slate-400">—</span>}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
