import clsx from "clsx";
import type { ReactNode } from "react";
import { Icono } from "./icono";

export function Insignia({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", color ?? "bg-slate-100 text-slate-700")}>
      {children}
    </span>
  );
}

export function Tarjeta({
  titulo,
  icono,
  acciones,
  children,
  className,
  sinRelleno,
}: {
  titulo?: ReactNode;
  icono?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
  sinRelleno?: boolean;
}) {
  return (
    <section className={clsx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {titulo || acciones ? (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {icono}
            <h2 className="truncate text-sm font-semibold text-slate-800">{titulo}</h2>
          </div>
          {acciones ? <div className="flex shrink-0 items-center gap-1">{acciones}</div> : null}
        </header>
      ) : null}
      <div className={sinRelleno ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function EstadoVacio({ titulo, texto, icono = "Lightbulb", children }: { titulo: string; texto?: string; icono?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-4 inline-flex size-20 items-center justify-center rounded-full bg-marca-50 text-marca-600">
        <Icono nombre={icono} className="size-9" />
      </span>
      <h3 className="text-lg font-semibold text-slate-800">{titulo}</h3>
      {texto ? <p className="mt-1 max-w-md text-sm text-slate-500">{texto}</p> : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}

export function Etiqueta({ children, requerido, htmlFor }: { children: ReactNode; requerido?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-slate-600">
      {requerido ? <span className="mr-0.5 text-rose-600">*</span> : null}
      {children}
    </label>
  );
}

export const claseInput =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-600/20 disabled:bg-slate-50";

export function CabeceraPagina({
  icono,
  supertitulo,
  titulo,
  acciones,
  children,
}: {
  icono?: ReactNode;
  supertitulo?: ReactNode;
  titulo: ReactNode;
  acciones?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-t-xl border border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icono}
          <div className="min-w-0">
            {supertitulo ? <p className="text-xs text-slate-500">{supertitulo}</p> : null}
            <h1 className="truncate text-xl font-semibold text-slate-800">{titulo}</h1>
          </div>
        </div>
        {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
      </div>
      {children}
    </div>
  );
}
