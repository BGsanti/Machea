"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icono } from "@/ui/icono";
import { LogoMachea, LogoMacheaCompleto } from "@/ui/logo-machea";
import { enlaceActivo, navMasHerramientas, navPrincipal, type EnlaceNav } from "../../apps";

/**
 * Barra lateral del panel de Machea. Pantallas anchas: logo, empresa y secciones con nombre.
 * Pantallas angostas: solo los íconos. Las apps completas del CRM quedan en «Más herramientas».
 */
export function BarraApps({ empresa }: { empresa: string }) {
  const ruta = usePathname();
  const activo = enlaceActivo(ruta);
  const enMas = navMasHerramientas.some((e) => e.id === activo?.id);
  const [masAbierto, setMasAbierto] = useState(enMas);
  const inicialEmpresa = (empresa.trim()[0] ?? "M").toUpperCase();

  return (
    <aside className="flex w-16 shrink-0 flex-col bg-riel text-white lg:w-60">
      <Link href="/inicio" aria-label="Machea, ir al inicio" className="flex h-14 shrink-0 items-center justify-center px-3 lg:justify-start lg:px-5">
        <LogoMachea className="size-7 lg:hidden" />
        <LogoMacheaCompleto className="hidden h-7 w-auto lg:block" />
      </Link>

      <div className="mx-3 mb-3 hidden items-center gap-2.5 rounded-xl bg-white/8 p-2.5 lg:flex" title={empresa}>
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-marca-500 text-sm font-bold text-white">{inicialEmpresa}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{empresa}</span>
          <span className="block text-[11px] text-slate-300">Panel de leads</span>
        </span>
      </div>

      <nav aria-label="Secciones" className="desplazable flex-1 overflow-y-auto px-2 pb-3 lg:px-3">
        <ul className="space-y-0.5">
          {navPrincipal.map((e) => (
            <li key={e.id}>
              <Enlace enlace={e} activo={activo?.id === e.id} />
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setMasAbierto(!masAbierto)}
            aria-expanded={masAbierto}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-wide text-slate-300 uppercase hover:bg-white/8 max-lg:hidden"
          >
            Más herramientas
            <Icono nombre={masAbierto ? "ChevronDown" : "ChevronRight"} className="size-4" />
          </button>
          <ul className={clsx("space-y-0.5", !masAbierto && "hidden", "max-lg:block")}>
            {navMasHerramientas.map((e) => (
              <li key={e.id}>
                <Enlace enlace={e} activo={activo?.id === e.id} />
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </aside>
  );
}

function Enlace({ enlace, activo }: { enlace: EnlaceNav; activo: boolean }) {
  return (
    <Link
      href={enlace.href}
      aria-current={activo ? "page" : undefined}
      title={enlace.etiqueta}
      className={clsx(
        "flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:justify-start",
        activo ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icono nombre={enlace.icono} className={clsx("size-5 shrink-0", activo ? "text-marca-500" : "")} />
      <span className="hidden truncate lg:inline">{enlace.etiqueta}</span>
    </Link>
  );
}
