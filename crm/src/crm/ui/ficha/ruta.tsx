"use client";

import clsx from "clsx";
import { useOptimistic, useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import type { Opcion } from "../../tipos";
import { actualizarCampo } from "../../servidor/acciones";

/** Ruta de etapas: muestra el avance y permite marcar la etapa actual. */
export function Ruta({
  objeto,
  id,
  campo,
  etiquetaCampo,
  opciones,
  actual: actualServidor,
  finalesNegativos = [],
  finales = [],
}: {
  objeto: string;
  id: string;
  campo: string;
  etiquetaCampo: string;
  opciones: Opcion[];
  actual: string | null;
  finalesNegativos?: string[];
  /** Valores tras los que no se ofrece pasar a la siguiente etapa. */
  finales?: string[];
}) {
  const [elegida, setElegida] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  // La etapa se ve cambiada al instante; si el servidor falla, vuelve sola a la anterior.
  const [actual, setActual] = useOptimistic(actualServidor);
  const indiceActual = opciones.findIndex((o) => o.valor === actual);
  const seleccion = elegida ?? actual;
  const siguiente = finales.includes(actual ?? "") ? undefined : opciones[indiceActual + 1];

  const guardar = (valor: string, deshacible = true) => {
    const anterior = actual;
    iniciar(async () => {
      setActual(valor);
      setElegida(null);
      const r = await actualizarCampo(objeto, id, campo, valor);
      const etiqueta = opciones.find((o) => o.valor === valor)?.etiqueta;
      if (!r.ok) {
        avisar(r.mensaje ?? "Error", "error");
        return;
      }
      setElegida(null);
      // Un clic equivocado en la ruta se corrige con «Deshacer» sin buscar el valor anterior.
      avisar(`${etiquetaCampo}: ${etiqueta}`, "exito", deshacible && anterior ? { accion: { texto: "Deshacer", alClic: () => guardar(anterior, false) }, duracion: 6000 } : undefined);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-3">
      <ol className="flex min-w-0 flex-1 overflow-x-auto" aria-label={`Ruta de ${etiquetaCampo.toLowerCase()}`}>
        {opciones.map((o, i) => {
          const completada = indiceActual >= 0 && i < indiceActual;
          const esActual = o.valor === actual;
          const negativa = esActual && finalesNegativos.includes(o.valor);
          return (
            <li key={o.valor} className="min-w-28 flex-1">
              <button
                type="button"
                onClick={() => setElegida(o.valor === actual ? null : o.valor)}
                aria-current={esActual ? "step" : undefined}
                className={clsx(
                  "relative flex h-9 w-full items-center justify-center gap-1 px-4 text-xs font-medium whitespace-nowrap transition-colors [clip-path:polygon(0_0,calc(100%-12px)_0,100%_50%,calc(100%-12px)_100%,0_100%,12px_50%)]",
                  i === 0 && "rounded-l-full [clip-path:polygon(0_0,calc(100%-12px)_0,100%_50%,calc(100%-12px)_100%,0_100%)]",
                  negativa
                    ? "bg-rose-600 text-white"
                    : esActual
                      ? "bg-marca-700 text-white"
                      : completada
                        ? "bg-marca-100 text-marca-800 hover:bg-marca-200"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  elegida === o.valor && "ring-2 ring-marca-600 ring-inset",
                )}
              >
                {completada ? <Icono nombre="Check" className="size-3.5" /> : null}
                {o.etiqueta}
              </button>
            </li>
          );
        })}
      </ol>
      {elegida && elegida !== actual ? (
        <Boton variante="primario" tamano="sm" cargando={pendiente} onClick={() => guardar(elegida)}>
          Marcar como {etiquetaCampo.toLowerCase()} actual
        </Boton>
      ) : siguiente ? (
        <Boton variante="primario" tamano="sm" icono="Check" cargando={pendiente} onClick={() => guardar(siguiente.valor)}>
          Marcar {etiquetaCampo.toLowerCase()} como completado
        </Boton>
      ) : null}
      {seleccion && seleccion === actual && !siguiente ? <span className="text-xs text-slate-500">Etapa final</span> : null}
    </div>
  );
}
