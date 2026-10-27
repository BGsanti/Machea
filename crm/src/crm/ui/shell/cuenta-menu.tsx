"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cerrarSesion } from "@/auth/acciones";
import { ETIQUETA_ROL, rolDe } from "@/auth/permisos";
import { Icono } from "@/ui/icono";
import { aplicarTema, temaGuardado, type Tema } from "@/ui/tema";
import { iniciales } from "../../formato";

export const EVENTO_ATAJOS = "machea:atajos";

const TEMAS: { valor: Tema; etiqueta: string; icono: string }[] = [
  { valor: "claro", etiqueta: "Claro", icono: "Sun" },
  { valor: "oscuro", etiqueta: "Oscuro", icono: "Moon" },
  { valor: "sistema", etiqueta: "Sistema", icono: "Monitor" },
];

/** La cuenta de la persona, abajo de la barra lateral: su correo, el tema, los atajos y cerrar sesión. */
export function CuentaMenu({ usuario, urlMachea }: { usuario: { nombre: string; email: string; rol: string }; urlMachea?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [tema, setTema] = useState<Tema>("claro");
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => setTema(temaGuardado()), []);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => !contenedor.current?.contains(e.target as Node) && setAbierto(false);
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const elegirTema = (t: Tema) => {
    setTema(t);
    aplicarTema(t);
  };
  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-riel-texto transition-colors duration-100 hover:bg-white/8";

  return (
    <div ref={contenedor} className="relative border-t border-white/10 pt-3">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label="Cuenta"
        className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors duration-150 hover:bg-white/8"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-xs font-semibold text-white">{iniciales(usuario.nombre)}</span>
        <span className="hidden min-w-0 flex-1 lg:block group-data-[colapsada=true]/barra:hidden">
          <span className="block truncate text-sm font-medium text-white">{usuario.nombre}</span>
          <span className="block truncate text-[11px] text-riel-suave">{usuario.email}</span>
        </span>
        <Icono nombre="ChevronsUpDown" className="hidden size-4 shrink-0 text-riel-suave lg:block group-data-[colapsada=true]/barra:hidden" />
      </button>

      {abierto ? (
        <div role="menu" className="animate-escalar absolute bottom-full left-0 z-50 mb-2 w-64 origin-bottom-left rounded-xl border border-white/10 bg-riel-claro p-1.5 text-white shadow-2xl lg:w-full max-lg:left-2">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold">{usuario.nombre}</p>
            <p className="truncate text-xs text-riel-suave">{usuario.email}</p>
            <p className="mt-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-riel-texto">{ETIQUETA_ROL[rolDe(usuario.rol)]}</p>
          </div>
          <div className="my-1 h-px bg-white/10" />
          <p className="px-2.5 pt-1 pb-1.5 text-[10px] font-semibold tracking-wide text-riel-suave uppercase">Apariencia</p>
          <div role="radiogroup" aria-label="Tema" className="mx-1 mb-1.5 grid grid-cols-3 gap-1 rounded-lg bg-black/25 p-1">
            {TEMAS.map((t) => (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={tema === t.valor}
                onClick={() => elegirTema(t.valor)}
                className={clsx(
                  "flex flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium transition-colors duration-150",
                  tema === t.valor ? "bg-white/15 text-white" : "text-riel-suave hover:text-white",
                )}
              >
                <Icono nombre={t.icono} className="size-4" />
                {t.etiqueta}
              </button>
            ))}
          </div>
          <div className="my-1 h-px bg-white/10" />
          <Link href="/configuracion" role="menuitem" onClick={() => setAbierto(false)} className={item}>
            <Icono nombre="Settings" className="size-4 text-riel-suave" /> Configuración
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAbierto(false);
              window.dispatchEvent(new Event(EVENTO_ATAJOS));
            }}
            className={item}
          >
            <Icono nombre="Keyboard" className="size-4 text-riel-suave" /> Atajos de teclado
          </button>
          {urlMachea ? (
            // Con el login de Machea, la sesión se cierra en su backend; la cookie es de www.machea.co.
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                await fetch(`${urlMachea}/api/sesion`, { method: "DELETE", credentials: "include" }).catch(() => undefined);
                window.location.href = `${urlMachea}/acceso/`;
              }}
              className={item}
            >
              <Icono nombre="LogOut" className="size-4 text-riel-suave" /> Cerrar sesión
            </button>
          ) : (
            <form action={cerrarSesion}>
              <button type="submit" role="menuitem" className={item}>
                <Icono nombre="LogOut" className="size-4 text-riel-suave" /> Cerrar sesión
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
