"use client";

import clsx from "clsx";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { Icono } from "@/ui/icono";
import { registrarResultadoLlamada, type ResultadoLlamada } from "../servidor/especiales";

const opciones: { valor: ResultadoLlamada; etiqueta: string; ayuda: string; icono: string; color: string }[] = [
  { valor: "contesto_interesado", etiqueta: "Contestó, le interesa", ayuda: "Pasa a «En seguimiento»", icono: "CircleCheck", color: "text-emerald-600" },
  { valor: "no_contesto", etiqueta: "No contestó", ayuda: "Queda «Volver a llamar» mañana", icono: "PhoneOff", color: "text-amber-600" },
  { valor: "contesto_no_interesado", etiqueta: "Contestó, no le interesa", ayuda: "Pasa a «No calificado»", icono: "CircleX", color: "text-rose-600" },
  { valor: "numero_equivocado", etiqueta: "Número equivocado", ayuda: "Pasa a «No calificado»", icono: "TriangleAlert", color: "text-slate-500" },
];

/** «¿Cómo te fue?»: un clic en el resultado deja la llamada registrada, el estado al día y el seguimiento listo. */
export function ResultadoLlamadaBoton({ objeto, id, etiqueta = "Registrar resultado", alRegistrar }: { objeto: string; id: string; etiqueta?: string; alRegistrar?: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState("");
  const [pendiente, iniciar] = useTransition();

  const elegir = (resultado: ResultadoLlamada) =>
    iniciar(async () => {
      const r = await registrarResultadoLlamada(objeto, id, resultado, nota);
      avisar(r.mensaje ?? (r.ok ? "Llamada registrada." : "No se pudo registrar."), r.ok ? "exito" : "error");
      if (r.ok) {
        setAbierto(false);
        setNota("");
        alRegistrar?.();
      }
    });

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-[color,background-color,border-color,transform] duration-150 hover:border-marca-500 hover:text-marca-700 active:translate-y-px"
      >
        <Icono nombre="ListChecks" className="size-3.5" /> {etiqueta}
      </button>
      {abierto ? (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar" onClick={() => setAbierto(false)} />
          <div className="animate-bajar absolute right-0 z-40 mt-1.5 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-xl">
            <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">¿Cómo te fue con la llamada?</p>
            <ul className={clsx("p-1", pendiente && "pointer-events-none opacity-60")}>
              {opciones.map((o) => (
                <li key={o.valor}>
                  <button type="button" onClick={() => elegir(o.valor)} className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-slate-50">
                    <Icono nombre={o.icono} className={clsx("size-5 shrink-0", o.color)} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{o.etiqueta}</span>
                      <span className="block text-xs text-slate-500">{o.ayuda}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-slate-100 p-2">
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Nota (opcional)"
                maxLength={500}
                className="h-8 w-full rounded-md border border-slate-300 bg-slate-50 px-2 text-xs focus:border-marca-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-marca-600/20"
                aria-label="Nota de la llamada"
              />
            </div>
          </div>
        </>
      ) : null}
    </span>
  );
}
