import type { ConsumoDelMes, Fuente } from "@/crm/servidor/consumo";

// Tarjeta «Consumo del mes» (Configuración, solo el dueño de la cuenta). Por ahora solo informa: las bolsas de cada
// plan y el aviso al 80 % llegan cuando se definan los planes.

const NOMBRE_FUENTE: Record<Fuente, string> = {
  formulario: "Por tu formulario",
  proyecto: "Por tus proyectos en Machea",
  captacion: "Llamadas de captación",
  otro: "Otros",
};

const num = (n: number) => new Intl.NumberFormat("es-CO").format(n);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function ConsumoMes({ consumo }: { consumo: ConsumoDelMes }) {
  const { total, porFuente } = consumo;
  const mes = MESES[Number(consumo.desde.slice(5, 7)) - 1];
  const fuentes = (Object.keys(NOMBRE_FUENTE) as Fuente[]).filter((f) => porFuente[f]);
  const cifras = [
    { etiqueta: "Llamadas de la asistente", valor: total.llamadas },
    { etiqueta: "Minutos de llamada", valor: total.minutos },
    { etiqueta: "WhatsApp de seguimiento", valor: total.whatsapp },
    { etiqueta: "Correos registrados", valor: total.correos },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Lo que lleva tu cuenta desde el 1 de {mes}. Cada llamada cuenta por minuto iniciado: una de 1 min 10 s son 2 minutos.
      </p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cifras.map((c) => (
          <div key={c.etiqueta} className="rounded-lg border border-slate-200 px-3 py-2">
            <dt className="text-xs text-slate-500">{c.etiqueta}</dt>
            <dd className="text-xl font-semibold tabular-nums text-slate-800">{num(c.valor)}</dd>
          </div>
        ))}
      </dl>
      {fuentes.length > 1 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-medium">De dónde vino</th>
              <th className="py-1 text-right font-medium">Llamadas</th>
              <th className="py-1 text-right font-medium">Minutos</th>
              <th className="py-1 text-right font-medium">WhatsApp</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {fuentes.map((f) => (
              <tr key={f} className="border-t border-slate-100">
                <td className="py-1.5 text-slate-700">{NOMBRE_FUENTE[f]}</td>
                <td className="py-1.5 text-right">{num(porFuente[f]!.llamadas)}</td>
                <td className="py-1.5 text-right">{num(porFuente[f]!.minutos)}</td>
                <td className="py-1.5 text-right">{num(porFuente[f]!.whatsapp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="text-xs text-slate-500">Los correos todavía no se envían desde el CRM: aquí se cuentan los que quedaron registrados.</p>
    </div>
  );
}
