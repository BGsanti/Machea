"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { Icono } from "./icono";

export function Modal({
  abierto,
  alCerrar,
  titulo,
  children,
  pie,
  ancho = "md",
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: "sm" | "md" | "lg" | "xl";
}) {
  if (!abierto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") alCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof titulo === "string" ? titulo : undefined}
        className={clsx(
          "relative flex max-h-[calc(100vh-5rem)] w-full flex-col rounded-xl bg-white shadow-2xl",
          { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" }[ancho],
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">{titulo}</h2>
          <button type="button" onClick={alCerrar} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <Icono nombre="X" className="size-5" />
          </button>
        </div>
        <div className="desplazable flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {pie ? <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">{pie}</div> : null}
      </div>
    </div>
  );
}
