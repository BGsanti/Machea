"use client";

import { useEffect, useState } from "react";
import { Icono } from "@/ui/icono";
import { EVENTO_ABRIR_PALETA } from "../ui/shell/paleta-comandos";

/**
 * La caja grande de «Pregunta o busca» del inicio. No escribe aquí: abre la paleta de comandos (la misma de Cmd/Ctrl + K), que
 * busca leads, contactos y negocios y ejecuta acciones.
 */
export function CajaBusqueda({ pista = "Busca un lead o dime qué quieres hacer…" }: { pista?: string }) {
  const [atajo, setAtajo] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setAtajo("⌘K");
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PALETA))}
      className="group flex h-14 w-full max-w-3xl items-center gap-3 rounded-full border border-slate-200 bg-white px-5 text-left text-base text-slate-400 shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-slate-300 hover:shadow-md focus-visible:border-marca-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/20"
    >
      <Icono nombre="Sparkles" className="size-5 shrink-0 text-marca-600" />
      <span className="min-w-0 flex-1 truncate">{pista}</span>
      <kbd className="hidden shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500 sm:inline">{atajo}</kbd>
    </button>
  );
}
