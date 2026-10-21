"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { Insignia } from "@/ui/basicos";
import { Icono } from "@/ui/icono";
import { enlaceRegistro } from "../apps";
import { formatoFecha } from "../formato";
import { completarTarea } from "../servidor/especiales";
import { AccionesContacto } from "../ui/acciones-contacto";
import { ResultadoLlamadaBoton } from "../ui/resultado-llamada";

export interface LeadHoy {
  id: string;
  nombre: string;
  detalle: string | null;
  telefono: string | null;
}

export interface TareaHoy {
  id: string;
  asunto: string;
  fechaVencimiento: string | null;
  prioridad: string;
}

/**
 * «Para hacer hoy»: los leads calientes sin llamar (con Llamar, WhatsApp y el resultado a un clic) y las tareas
 * de hoy y vencidas (se tachan al instante). Lo que se resuelve sale de la lista sin esperar al servidor.
 */
export function ListaParaHoy({ calientes, tareas, hoy }: { calientes: LeadHoy[]; tareas: TareaHoy[]; hoy: string }) {
  const [resueltos, setResueltos] = useState<Set<string>>(new Set());
  const [, iniciar] = useTransition();
  const resolver = (clave: string) => setResueltos((s) => new Set(s).add(clave));
  const deshacer = (clave: string) =>
    setResueltos((s) => {
      const copia = new Set(s);
      copia.delete(clave);
      return copia;
    });

  const leads = calientes.filter((l) => !resueltos.has(`l:${l.id}`));
  const pendientes = tareas.filter((t) => !resueltos.has(`t:${t.id}`));

  if (leads.length === 0 && pendientes.length === 0) {
    return (
      <div className="animate-aparecer flex flex-col items-center px-4 py-10 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Icono nombre="CircleCheck" className="size-6" />
        </span>
        <p className="mt-3 text-sm font-medium text-slate-800">Todo al día</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">No tiene tareas para hoy ni leads calientes sin llamar. Cuando entre uno nuevo, aparecerá aquí.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-slate-100">
      {leads.map((l) => (
        <li key={l.id} className="animate-aparecer flex flex-wrap items-center gap-3 px-4 py-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-marca-50 text-marca-700">
            <Icono nombre="Flame" className="size-4" />
          </span>
          <Link href={enlaceRegistro("candidatos", l.id)} className="min-w-0 flex-1 basis-40">
            <span className="block truncate text-sm font-medium text-slate-800 hover:text-marca-700">Contactar a {l.nombre}</span>
            <span className="block truncate text-xs text-slate-500">{[l.detalle, l.telefono].filter(Boolean).join(" · ")}</span>
          </Link>
          <Insignia color="bg-rose-100 text-rose-700">Lead caliente</Insignia>
          <span className="flex items-center gap-1.5">
            <AccionesContacto telefono={l.telefono} nombre={l.nombre} />
            <ResultadoLlamadaBoton objeto="candidatos" id={l.id} etiqueta="Resultado" alRegistrar={() => resolver(`l:${l.id}`)} />
          </span>
        </li>
      ))}
      {pendientes.slice(0, 6).map((t) => {
        const vencida = t.fechaVencimiento !== null && t.fechaVencimiento < hoy;
        return (
          <li key={t.id} className="animate-aparecer flex items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              className="size-4 shrink-0 cursor-pointer accent-marca-700"
              aria-label={`Completar ${t.asunto}`}
              onChange={() => {
                resolver(`t:${t.id}`);
                iniciar(async () => {
                  const r = await completarTarea(t.id, true);
                  if (r.ok) avisar("Tarea completada.");
                  else {
                    deshacer(`t:${t.id}`);
                    avisar(r.mensaje ?? "No se pudo completar la tarea.", "error");
                  }
                });
              }}
            />
            <Link href={enlaceRegistro("tareas", t.id)} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800 hover:text-marca-700">{t.asunto}</span>
              <span className={clsx("block text-xs", vencida ? "font-medium text-rose-600" : "text-slate-500")}>
                {vencida ? "Vencida · " : "Para hoy · "}
                {t.fechaVencimiento ? formatoFecha(t.fechaVencimiento) : ""}
              </span>
            </Link>
            {t.prioridad === "alta" ? <Insignia color="bg-rose-100 text-rose-700">Alta</Insignia> : null}
          </li>
        );
      })}
    </ul>
  );
}
