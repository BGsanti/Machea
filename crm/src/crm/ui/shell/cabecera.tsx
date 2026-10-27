"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Icono } from "@/ui/icono";
import { enlaceActivo, obtenerApp } from "../../apps";
import { formatoFechaHora } from "../../formato";
import { perfilDe } from "../../perfiles";
import { marcarNotificacionesLeidas } from "../../servidor/sistema";
import { EVENTO_ABRIR_PALETA } from "./paleta-comandos";

interface Notificacion {
  id: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  leida: boolean;
  creadoEn: Date;
}

/** El título de la pantalla en la que se está: el de la barra lateral si es una de sus secciones; si no, el de la app. */
function tituloDe(ruta: string, perfil: string): string {
  const activo = enlaceActivo(ruta, perfilDe(perfil).nav);
  if (activo) return activo.etiqueta;
  const app = ruta.split("/")[1] ?? "";
  if (ruta.startsWith("/buscar")) return "Resultados de búsqueda";
  if (ruta.startsWith("/configuracion")) return "Configuración";
  return obtenerApp(app)?.etiqueta ?? "Machea";
}

/** Barra de arriba: el título, el buscador (la paleta de comandos), la ayuda y los avisos. La cuenta vive abajo de la barra lateral. */
export function Cabecera({ perfil, notificaciones, sinLeer }: { perfil: string; notificaciones: Notificacion[]; sinLeer: number }) {
  const ruta = usePathname();
  const [menu, setMenu] = useState<"notificaciones" | "ayuda" | null>(null);
  const [, iniciar] = useTransition();
  // ⌘K en Mac, Ctrl K en lo demás (se decide en el navegador: el servidor no sabe cuál es).
  const [atajo, setAtajo] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setAtajo("⌘K");
  }, []);
  const alternar = (m: typeof menu) => setMenu((actual) => (actual === m ? null : m));

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4 lg:px-6">
      <h2 className="hidden min-w-0 shrink-0 truncate text-base font-semibold text-slate-800 md:block md:max-w-48">{tituloDe(ruta, perfil)}</h2>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PALETA))}
        aria-label="Buscar o ejecutar un comando"
        className="group relative mr-auto flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-0 text-left text-sm text-slate-400 transition-[border-color,background-color,box-shadow] duration-150 hover:border-slate-300 hover:bg-white focus-visible:border-marca-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/20 sm:w-full sm:max-w-md sm:justify-start sm:px-4"
      >
        <Icono nombre="Search" className="size-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate sm:inline">Buscar leads, contactos o ir a…</span>
        <kbd className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline">{atajo}</kbd>
      </button>

      <div className="flex items-center gap-1">
        <div className="relative">
          <button type="button" onClick={() => alternar("ayuda")} className="rounded-full p-2 text-slate-600 transition-colors duration-150 hover:bg-slate-100" aria-label="Ayuda" title="Ayuda">
            <Icono nombre="CircleQuestionMark" className="size-5" />
          </button>
          {menu === "ayuda" ? (
            <Desplegable alCerrar={() => setMenu(null)} ancho="w-72">
              <div className="p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Ayuda de Machea</p>
                <ul className="mt-2 space-y-1.5">
                  <li>Use la barra lateral para cambiar de sección; las demás herramientas están en «Más herramientas».</li>
                  <li>Busque cualquier lead, contacto o empresa con el buscador (Ctrl o ⌘ + K). Pulse «?» para ver todos los atajos.</li>
                  <li>El tema claro u oscuro se cambia en su cuenta, abajo a la izquierda.</li>
                  <li>Automatice tareas desde Automatización › Flujos.</li>
                </ul>
              </div>
            </Desplegable>
          ) : null}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => alternar("notificaciones")}
            className="relative rounded-full p-2 text-slate-600 transition-colors duration-150 hover:bg-slate-100"
            aria-label={`${sinLeer} notificaciones sin leer`}
            title="Notificaciones"
          >
            <Icono nombre="Bell" className="size-5" />
            {sinLeer > 0 ? (
              <span className="absolute top-1 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                {sinLeer > 9 ? "9+" : sinLeer}
              </span>
            ) : null}
          </button>
          {menu === "notificaciones" ? (
            <Desplegable alCerrar={() => setMenu(null)} ancho="w-96">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">Notificaciones</p>
                {sinLeer > 0 ? (
                  <button type="button" className="text-xs text-marca-700 hover:underline" onClick={() => iniciar(async () => marcarNotificacionesLeidas())}>
                    Marcar todas como leídas
                  </button>
                ) : null}
              </div>
              <ul className="desplazable max-h-96 overflow-y-auto">
                {notificaciones.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-slate-500">No tiene notificaciones.</li>
                ) : (
                  notificaciones.map((n) => (
                    <li key={n.id} className={`border-b border-slate-50 ${n.leida ? "" : "bg-marca-50/60"}`}>
                      <Link href={n.enlace ?? "#"} onClick={() => setMenu(null)} className="block px-4 py-3 hover:bg-slate-50">
                        <p className="text-sm font-medium text-slate-800">{n.titulo}</p>
                        {n.cuerpo ? <p className="text-xs text-slate-600">{n.cuerpo}</p> : null}
                        <p className="mt-1 text-[11px] text-slate-400">{formatoFechaHora(n.creadoEn)}</p>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </Desplegable>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Desplegable({ children, alCerrar, ancho }: { children: React.ReactNode; alCerrar: () => void; ancho: string }) {
  return (
    <>
      <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar menú" onClick={alCerrar} />
      <div className={`animate-bajar absolute right-0 z-40 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ${ancho}`}>{children}</div>
    </>
  );
}
