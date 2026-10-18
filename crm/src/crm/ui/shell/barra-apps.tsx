"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icono } from "@/ui/icono";
import { apps } from "../../apps";

export function BarraApps() {
  const ruta = usePathname();
  const actual = ruta.split("/")[1] ?? "";
  return (
    <nav aria-label="Aplicaciones" className="desplazable flex w-[88px] shrink-0 flex-col items-stretch overflow-y-auto bg-riel py-2">
      {apps.map((app) => {
        const activa = actual === app.id;
        return (
          <Link
            key={app.id}
            href={`/${app.id}`}
            aria-current={activa ? "page" : undefined}
            className={clsx(
              "group mx-2 my-0.5 flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] font-medium transition-colors",
              activa ? "bg-white/12 text-white ring-1 ring-white/25" : "text-slate-300 hover:bg-riel-claro hover:text-white",
            )}
          >
            <Icono nombre={app.icono} className={clsx("size-6", activa ? "text-marca-100" : "")} />
            <span className="leading-tight">{app.etiqueta}</span>
          </Link>
        );
      })}
    </nav>
  );
}
