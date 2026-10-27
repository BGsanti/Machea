"use client";

import clsx from "clsx";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { enlacePermitido } from "@/auth/permisos";
import { Icono } from "@/ui/icono";
import { LogoMachea, LogoMacheaCompleto } from "@/ui/logo-machea";
import { enlaceActivo, navMasHerramientas, type EnlaceNav } from "../../apps";
import { perfilDe } from "../../perfiles";

const CLAVE_BARRA = "machea-barra";

/**
 * Barra lateral del panel de Machea. Pantallas anchas: logo, empresa y secciones con nombre; abajo, lo que acompaña todo el
 * día (cómo va la respuesta, invitar al equipo) y la cuenta. Se puede plegar a solo íconos con el botón de arriba; en
 * pantallas angostas está siempre plegada. Las apps completas del CRM quedan en «Más herramientas».
 */
export function BarraApps({ empresa, perfil, rol, pie, cuenta }: { empresa: string; perfil: string; rol: string; pie?: ReactNode; cuenta: ReactNode }) {
  const ruta = usePathname();
  const def = perfilDe(perfil);
  const principal = def.nav.filter((e) => enlacePermitido(rol, e.id));
  const activo = enlaceActivo(ruta, principal);
  const mas = navMasHerramientas.filter((e) => enlacePermitido(rol, e.id));
  const enMas = mas.some((e) => e.id === activo?.id);
  const [masAbierto, setMasAbierto] = useState(enMas);
  const [colapsada, setColapsada] = useState(false);
  const inicialEmpresa = (empresa.trim()[0] ?? "M").toUpperCase();

  useEffect(() => {
    try {
      setColapsada(localStorage.getItem(CLAVE_BARRA) === "1");
    } catch {
      // sin almacenamiento: queda desplegada
    }
  }, []);
  const plegar = (valor: boolean) => {
    setColapsada(valor);
    try {
      localStorage.setItem(CLAVE_BARRA, valor ? "1" : "0");
    } catch {
      // idem
    }
  };

  return (
    <aside
      data-colapsada={colapsada}
      className={clsx("group/barra flex shrink-0 flex-col bg-riel text-white transition-[width] duration-200", colapsada ? "w-16" : "w-16 lg:w-64")}
    >
      <div className="flex h-14 shrink-0 items-center justify-center gap-1 px-3 lg:justify-between lg:px-4 group-data-[colapsada=true]/barra:justify-center group-data-[colapsada=true]/barra:px-3">
        <Link href="/inicio" aria-label="Machea, ir al inicio" className="flex items-center">
          <LogoMachea className="size-7 lg:hidden group-data-[colapsada=true]/barra:block" />
          <LogoMacheaCompleto className="hidden h-7 w-auto lg:block group-data-[colapsada=true]/barra:hidden" />
        </Link>
        <button
          type="button"
          onClick={() => plegar(true)}
          aria-label="Plegar la barra lateral"
          title="Plegar"
          className="hidden size-8 items-center justify-center rounded-full bg-white/8 text-riel-texto transition-colors duration-150 hover:bg-white/15 hover:text-white lg:inline-flex group-data-[colapsada=true]/barra:hidden"
        >
          <Icono nombre="ChevronsLeft" className="size-4" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => plegar(false)}
        aria-label="Desplegar la barra lateral"
        title="Desplegar"
        className="mx-auto mb-2 hidden size-8 items-center justify-center rounded-full bg-white/8 text-riel-texto transition-colors duration-150 hover:bg-white/15 hover:text-white group-data-[colapsada=true]/barra:inline-flex"
      >
        <Icono nombre="ChevronsRight" className="size-4" />
      </button>

      <div className="mx-3 mb-3 hidden items-center gap-2.5 rounded-xl bg-white/8 p-2.5 lg:flex group-data-[colapsada=true]/barra:hidden" title={empresa}>
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-marca-500 text-sm font-bold text-white">{inicialEmpresa}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{empresa}</span>
          <span className="block truncate text-[11px] text-riel-texto">{def.etiqueta}</span>
        </span>
      </div>

      <nav aria-label="Secciones" className="desplazable min-h-0 flex-1 overflow-y-auto px-2 pb-3 lg:px-3 group-data-[colapsada=true]/barra:px-2">
        <ul className="space-y-0.5">
          {principal.map((e) => (
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
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-wide text-riel-texto uppercase hover:bg-white/8 max-lg:hidden group-data-[colapsada=true]/barra:hidden"
          >
            Más herramientas
            <Icono nombre={masAbierto ? "ChevronDown" : "ChevronRight"} className="size-4" />
          </button>
          <ul className={clsx("space-y-0.5", !masAbierto && "hidden", "max-lg:block group-data-[colapsada=true]/barra:block")}>
            {mas.map((e) => (
              <li key={e.id}>
                <Enlace enlace={e} activo={activo?.id === e.id} />
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="shrink-0 space-y-2 px-2 pb-3 lg:px-3 group-data-[colapsada=true]/barra:px-2">
        {pie ? <div className="hidden space-y-2 lg:block group-data-[colapsada=true]/barra:hidden">{pie}</div> : null}
        {cuenta}
      </div>
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
        "relative flex items-center justify-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.98] lg:justify-start group-data-[colapsada=true]/barra:justify-center",
        activo ? "bg-white/12 text-white" : "text-riel-texto hover:bg-white/8 hover:text-white",
      )}
    >
      {activo ? <span aria-hidden className="animate-aparecer absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-marca-500" /> : null}
      <Icono nombre={enlace.icono} className={clsx("size-5 shrink-0 transition-colors duration-150", activo ? "text-marca-500" : "")} />
      <span className="hidden truncate lg:inline group-data-[colapsada=true]/barra:hidden">{enlace.etiqueta}</span>
      <Cargando />
    </Link>
  );
}

/** Punto que late en el enlace al que se acaba de hacer clic, hasta que carga la página. */
function Cargando() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden className="animate-pulso-suave ml-auto hidden size-2 rounded-full bg-marca-500 lg:block group-data-[colapsada=true]/barra:hidden" /> : null;
}
