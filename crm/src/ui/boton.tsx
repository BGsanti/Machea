import clsx from "clsx";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icono } from "./icono";

export type Variante = "primario" | "secundario" | "peligro" | "fantasma" | "enlace";

const estilos: Record<Variante, string> = {
  primario: "bg-marca-700 text-white hover:bg-marca-800 border border-marca-700 shadow-sm",
  secundario: "bg-white text-marca-800 border border-slate-300 hover:bg-slate-50 shadow-sm",
  peligro: "bg-rose-600 text-white border border-rose-600 hover:bg-rose-700 shadow-sm",
  fantasma: "text-slate-700 hover:bg-slate-100 border border-transparent",
  enlace: "text-marca-700 hover:underline border border-transparent px-0",
};

export function clasesBoton(variante: Variante = "secundario", tamano: "sm" | "md" = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600",
    tamano === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
    estilos[variante],
    extra,
  );
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  tamano?: "sm" | "md";
  icono?: string;
  cargando?: boolean;
  children?: ReactNode;
}

export function Boton({ variante = "secundario", tamano = "md", icono, cargando, className, children, disabled, type = "button", ...resto }: Props) {
  return (
    <button type={type} className={clasesBoton(variante, tamano, className)} disabled={disabled || cargando} {...resto}>
      {cargando ? <Icono nombre="LoaderCircle" className="size-4 animate-spin" /> : icono ? <Icono nombre={icono} /> : null}
      {children}
    </button>
  );
}

export function EnlaceBoton({
  href,
  variante = "secundario",
  tamano = "md",
  icono,
  className,
  children,
}: {
  href: string;
  variante?: Variante;
  tamano?: "sm" | "md";
  icono?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link href={href} className={clasesBoton(variante, tamano, className)}>
      {icono ? <Icono nombre={icono} /> : null}
      {children}
    </Link>
  );
}
