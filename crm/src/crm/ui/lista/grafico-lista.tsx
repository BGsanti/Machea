"use client";

import { useState } from "react";
import { Grafico } from "../graficos";

export function GraficoLista({
  etiqueta,
  grupos,
  esMoneda,
  moneda,
}: {
  campo: string;
  etiqueta: string;
  grupos: { etiqueta: string; total: number; suma: number }[];
  esMoneda: boolean;
  moneda: string;
}) {
  const [medida, setMedida] = useState<"total" | "suma">("total");
  const datos = grupos.map((g) => ({ etiqueta: g.etiqueta, valor: medida === "suma" ? g.suma : g.total }));
  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 p-4" aria-label="Gráfico de la lista">
      <p className="text-sm font-semibold text-slate-800">Por {etiqueta.toLowerCase()}</p>
      {esMoneda ? (
        <div className="mt-2 flex gap-1 text-xs">
          <button type="button" onClick={() => setMedida("total")} className={`rounded px-2 py-1 ${medida === "total" ? "bg-marca-700 text-white" : "bg-slate-100"}`}>
            Cantidad
          </button>
          <button type="button" onClick={() => setMedida("suma")} className={`rounded px-2 py-1 ${medida === "suma" ? "bg-marca-700 text-white" : "bg-slate-100"}`}>
            Importe
          </button>
        </div>
      ) : null}
      <div className="mt-3">
        <Grafico datos={datos} tipo="anillo" esMoneda={medida === "suma"} moneda={moneda} alto={200} />
      </div>
    </aside>
  );
}
