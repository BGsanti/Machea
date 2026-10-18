"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { claseInput } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { enlaceRegistro } from "../../apps";
import { fechaLocal } from "../../fechas";
import { formatoFecha } from "../../formato";
import { completarTarea, crearTareaRapida } from "../../servidor/especiales";

interface TareaResumen {
  id: string;
  asunto: string;
  fechaVencimiento: string | null;
  prioridad: string;
}

export function BarraUtilidades({ tareas }: { tareas: TareaResumen[] }) {
  const [abierta, setAbierta] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const hoy = fechaLocal();

  return (
    <footer className="relative z-10 shrink-0 border-t border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        className="flex h-9 items-center gap-2 px-4 text-sm text-slate-700 hover:bg-slate-50"
        aria-expanded={abierta}
      >
        <Icono nombre="ListChecks" />
        Lista de tareas
        {tareas.length > 0 ? <span className="rounded-full bg-slate-200 px-1.5 text-xs">{tareas.length}</span> : null}
      </button>
      {abierta ? (
        <div className="absolute bottom-10 left-4 flex max-h-[28rem] w-96 flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-800">Mis tareas abiertas</p>
            <button type="button" onClick={() => setAbierta(false)} className="text-slate-500 hover:text-slate-800" aria-label="Minimizar">
              <Icono nombre="ChevronDown" />
            </button>
          </div>
          <form
            className="flex gap-2 border-b border-slate-100 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const datos = new FormData(form);
              iniciar(async () => {
                const r = await crearTareaRapida(String(datos.get("asunto") ?? ""), String(datos.get("fecha") ?? ""));
                if (r.ok) form.reset();
                else avisar(r.mensaje ?? "No se pudo crear la tarea.", "error");
              });
            }}
          >
            <input name="asunto" placeholder="Nueva tarea..." className={`${claseInput} flex-1`} aria-label="Asunto de la tarea" />
            <input name="fecha" type="date" defaultValue={hoy} className={`${claseInput} w-36`} aria-label="Fecha de vencimiento" />
            <Boton type="submit" variante="primario" icono="Plus" cargando={pendiente} aria-label="Agregar tarea" />
          </form>
          <ul className="desplazable flex-1 overflow-y-auto">
            {tareas.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-slate-500">No tiene tareas pendientes. ¡Bien hecho!</li>
            ) : (
              tareas.map((t) => {
                const vencida = t.fechaVencimiento !== null && t.fechaVencimiento < hoy;
                return (
                  <li key={t.id} className="flex items-start gap-3 border-b border-slate-50 px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-marca-700"
                      aria-label={`Completar ${t.asunto}`}
                      onChange={(e) => {
                        const marcado = e.target.checked;
                        iniciar(async () => {
                          await completarTarea(t.id, marcado);
                          if (marcado) avisar("Tarea completada.");
                        });
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <Link href={enlaceRegistro("tareas", t.id)} className="block truncate text-sm text-slate-800 hover:text-marca-700 hover:underline">
                        {t.asunto}
                      </Link>
                      {t.fechaVencimiento ? (
                        <p className={`text-xs ${vencida ? "font-medium text-rose-600" : "text-slate-500"}`}>
                          {vencida ? "Vencida · " : ""}
                          {formatoFecha(t.fechaVencimiento)}
                        </p>
                      ) : null}
                    </div>
                    {t.prioridad === "alta" ? <span className="rounded bg-rose-100 px-1.5 text-[11px] text-rose-700">Alta</span> : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </footer>
  );
}
