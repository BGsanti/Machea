"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icono } from "@/ui/icono";

const CLAVE = "machea-invitar-oculta";

/** Invitación a sumar al equipo (solo para quien puede invitar y está solo en la empresa). Se puede cerrar y no vuelve. */
export function TarjetaInvitar() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(localStorage.getItem(CLAVE) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);
  if (!visible) return null;
  return (
    <div className="animate-subir relative rounded-xl bg-white/6 p-3">
      <button
        type="button"
        aria-label="Cerrar invitación"
        onClick={() => {
          setVisible(false);
          try {
            localStorage.setItem(CLAVE, "1");
          } catch {
            // sin almacenamiento: vuelve a aparecer en la próxima visita
          }
        }}
        className="absolute top-2 right-2 rounded p-0.5 text-riel-suave hover:bg-white/10 hover:text-white"
      >
        <Icono nombre="X" className="size-3.5" />
      </button>
      <p className="pr-5 text-sm font-semibold text-white">Suma a tu equipo</p>
      <p className="mt-1 text-xs leading-snug text-riel-texto">Cada asesor ve solo sus leads y los nuevos se reparten por turnos.</p>
      <Link href="/equipo" className="mt-2.5 inline-flex h-8 items-center gap-1.5 rounded-full bg-marca-500 px-3.5 text-xs font-semibold text-riel transition-[filter,transform] duration-150 hover:brightness-110 active:translate-y-px">
        Invitar <Icono nombre="ChevronRight" className="size-3.5" />
      </Link>
    </div>
  );
}
