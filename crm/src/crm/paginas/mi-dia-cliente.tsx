"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icono } from "@/ui/icono";
import { enlaceRegistro } from "../apps";
import { AccionesContacto } from "../ui/acciones-contacto";
import { duracionCorta } from "../ui/graficos-panel";
import { ResultadoLlamadaBoton } from "../ui/resultado-llamada";
import type { LeadPorContactar } from "../servidor/panel";

/** Minutos transcurridos desde `desde`, que se actualizan cada 20 s sin pedir nada al servidor. */
function useMinutos(desde: string, inicial: number): number {
  const [min, setMin] = useState(inicial);
  useEffect(() => {
    const t = new Date(desde).getTime();
    const actualizar = () => setMin(Math.max(0, (Date.now() - t) / 60_000));
    actualizar();
    const id = setInterval(actualizar, 20_000);
    return () => clearInterval(id);
  }, [desde]);
  return min;
}

function Reloj({ desde, minutosIniciales, sla }: { desde: string; minutosIniciales: number; sla: number }) {
  const min = useMinutos(desde, minutosIniciales);
  const estado = min >= sla ? "atrasado" : min >= sla * 0.6 ? "cerca" : "bien";
  return (
    <span
      title={`Tiempo para contactar: ${sla} min`}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors duration-300",
        estado === "atrasado" && "bg-rose-100 text-rose-700",
        estado === "cerca" && "bg-amber-100 text-amber-800",
        estado === "bien" && "bg-emerald-100 text-emerald-700",
      )}
    >
      {estado === "atrasado" ? <span className="animate-alerta inline-block size-1.5 rounded-full bg-rose-600" aria-hidden /> : <Icono nombre="Timer" className="size-3" />}
      {duracionCorta(min)}
    </span>
  );
}

/** «Contacta primero»: los leads nuevos del asesor, con el reloj de respuesta y Llamar, WhatsApp y el resultado a un clic. */
export function ListaPorContactar({ leads, total, sla }: { leads: LeadPorContactar[]; total: number; sla: number }) {
  const [hechos, setHechos] = useState<Set<string>>(new Set());
  const pendientes = leads.filter((l) => !hechos.has(l.id));

  if (pendientes.length === 0) {
    return (
      <div className="animate-aparecer flex flex-col items-center px-4 py-10 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Icono nombre="CircleCheck" className="size-6" />
        </span>
        <p className="mt-3 text-sm font-medium text-slate-800">No tienes leads por contactar</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">Cuando te llegue uno nuevo, aparece aquí con su reloj. Contáctalo en menos de {sla} min.</p>
      </div>
    );
  }
  return (
    <>
      <ul className="divide-y divide-slate-100">
        {pendientes.map((l, i) => (
          <li key={l.id} style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }} className="animate-subir flex flex-wrap items-center gap-3 px-4 py-3.5">
            <span className={clsx("inline-flex size-9 shrink-0 items-center justify-center rounded-full", l.valoracion === "caliente" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500")}>
              <Icono nombre={l.valoracion === "caliente" ? "Flame" : "UserRound"} className="size-4.5" />
            </span>
            <Link href={enlaceRegistro("candidatos", l.id)} className="min-w-0 flex-1 basis-44">
              <span className="block truncate text-sm font-semibold text-slate-800 hover:text-marca-700">{l.nombre}</span>
              <span className="block truncate text-xs text-slate-500">{[l.interes, l.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}</span>
            </Link>
            <Reloj desde={l.desde} minutosIniciales={l.minutos} sla={sla} />
            <span className="flex items-center gap-1.5">
              <AccionesContacto telefono={l.telefono} nombre={l.nombre} />
              <ResultadoLlamadaBoton objeto="candidatos" id={l.id} etiqueta="Resultado" alRegistrar={() => setHechos((s) => new Set(s).add(l.id))} />
            </span>
          </li>
        ))}
      </ul>
      {total > leads.length ? (
        <Link href="/ventas/o/candidatos?vista=sin_contactar" className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-marca-700 hover:bg-slate-50">
          Ver los {total} por contactar
        </Link>
      ) : null}
    </>
  );
}
