"use client";

import { Icono } from "@/ui/icono";
import { enlaceLlamada, enlaceWhatsApp } from "../formato";

/** Llamar y escribir por WhatsApp a un toque. Sin teléfono válido no muestra nada. */
export function AccionesContacto({ telefono, nombre, tamano = "sm" }: { telefono: unknown; nombre?: string; tamano?: "sm" | "md" }) {
  const llamar = enlaceLlamada(telefono);
  const whatsapp = enlaceWhatsApp(telefono, nombre ? `Hola ${nombre.split(" ")[0]}, te escribo de parte del equipo de ventas.` : undefined);
  if (!llamar || !whatsapp) return null;
  const caja = tamano === "md" ? "h-9 px-3 text-sm" : "h-8 px-2.5 text-xs";
  const base = `inline-flex items-center gap-1.5 rounded-full border font-medium transition-[color,background-color,border-color,transform] duration-150 active:translate-y-px ${caja}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={llamar} className={`${base} border-slate-200 bg-white text-slate-700 hover:border-marca-500 hover:text-marca-700`} title="Llamar">
        <Icono nombre="PhoneCall" className="size-3.5" /> Llamar
      </a>
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} border-slate-200 bg-white text-slate-700 hover:border-emerald-500 hover:text-emerald-700`}
        title="Escribir por WhatsApp"
      >
        <Icono nombre="MessageCircle" className="size-3.5" /> WhatsApp
      </a>
    </span>
  );
}
