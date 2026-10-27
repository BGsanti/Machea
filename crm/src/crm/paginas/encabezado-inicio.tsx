import Link from "next/link";
import clsx from "clsx";
import { Icono } from "@/ui/icono";
import { CajaBusqueda } from "./caja-busqueda";

export interface AccesoRapido {
  etiqueta: string;
  href: string;
  icono: string;
  primario?: boolean;
}

/** La cabecera del inicio, para todos los roles: saludo grande, la caja de «pregunta o busca» y los accesos rápidos como chips. */
export function EncabezadoInicio({ saludo, nombre, resumen, accesos }: { saludo: string; nombre: string; resumen: string; accesos: AccesoRapido[] }) {
  return (
    <header className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-800 sm:text-4xl">
          {saludo}, {nombre}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{resumen}</p>
      </div>
      <CajaBusqueda />
      <div className="flex flex-wrap gap-2">
        {accesos.map((a) => (
          <Link
            key={a.href + a.etiqueta}
            href={a.href}
            className={clsx(
              "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[color,background-color,border-color,transform] duration-150 active:translate-y-px",
              a.primario
                ? "border-marca-700 bg-marca-700 text-white hover:bg-marca-800"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            )}
          >
            <Icono nombre={a.icono} className="size-4" />
            {a.etiqueta}
          </Link>
        ))}
      </div>
    </header>
  );
}
