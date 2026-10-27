"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { cerrarSesion } from "@/auth/acciones";
import { Icono } from "@/ui/icono";
import { formatoFechaHora, iniciales } from "../../formato";
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

export function Cabecera({
  usuario,
  notificaciones,
  sinLeer,
  urlMachea,
}: {
  usuario: { nombre: string; email: string; rol: string };
  notificaciones: Notificacion[];
  sinLeer: number;
  /** Con el login de Machea: su URL, para cerrar la sesión allá. */
  urlMachea?: string;
}) {
  const [menu, setMenu] = useState<"notificaciones" | "perfil" | "ayuda" | null>(null);
  const [, iniciar] = useTransition();
  // ⌘K en Mac, Ctrl K en lo demás (se decide en el navegador: el servidor no sabe cuál es).
  const [atajo, setAtajo] = useState("Ctrl K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setAtajo("⌘K");
  }, []);
  const alternar = (m: typeof menu) => setMenu((actual) => (actual === m ? null : m));

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_PALETA))}
        aria-label="Buscar o ejecutar un comando"
        className="group relative mr-auto flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-md border sm:w-full sm:max-w-xl sm:justify-start border-slate-300 bg-slate-50 px-0 text-left text-sm text-slate-400 transition-[border-color,background-color,box-shadow] sm:px-3 duration-150 hover:border-slate-400 hover:bg-white focus-visible:border-marca-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-600/20"
      >
        <Icono nombre="Search" className="size-4 shrink-0" />
        <span className="hidden min-w-0 flex-1 truncate sm:inline">Buscar leads, contactos o ir a…</span>
        <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 sm:inline">{atajo}</kbd>
      </button>

      <div className="flex items-center gap-1">
        <div className="relative">
          <button type="button" onClick={() => alternar("ayuda")} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Ayuda" title="Ayuda">
            <Icono nombre="CircleQuestionMark" className="size-5" />
          </button>
          {menu === "ayuda" ? (
            <Desplegable alCerrar={() => setMenu(null)} ancho="w-72">
              <div className="p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Ayuda de Machea</p>
                <ul className="mt-2 space-y-1.5">
                  <li>Use la barra lateral para cambiar de sección; las demás herramientas están en «Más herramientas».</li>
                  <li>Las pestañas de cada sección se pueden ordenar con el lápiz de la derecha.</li>
                  <li>Busque cualquier lead, contacto o empresa con el buscador superior (Ctrl o ⌘ + K). Pulse «?» para ver todos los atajos.</li>
                  <li>Automatice tareas desde Automatización › Flujos.</li>
                </ul>
              </div>
            </Desplegable>
          ) : null}
        </div>
        <Link href="/configuracion" className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Configuración" title="Configuración">
          <Icono nombre="Settings" className="size-5" />
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => alternar("notificaciones")}
            className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100"
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
                  <button
                    type="button"
                    className="text-xs text-marca-700 hover:underline"
                    onClick={() => iniciar(async () => marcarNotificacionesLeidas())}
                  >
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
        <div className="relative">
          <button
            type="button"
            onClick={() => alternar("perfil")}
            className="ml-1 inline-flex size-9 items-center justify-center rounded-full bg-riel-claro text-sm font-semibold text-white hover:ring-2 hover:ring-marca-500/40"
            aria-label="Ver perfil"
          >
            {iniciales(usuario.nombre)}
          </button>
          {menu === "perfil" ? (
            <Desplegable alCerrar={() => setMenu(null)} ancho="w-64">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{usuario.nombre}</p>
                <p className="truncate text-xs text-slate-500">{usuario.email}</p>
                <p className="mt-1 text-[11px] text-slate-400">{usuario.rol === "admin" ? "Administrador" : "Usuario"}</p>
              </div>
              <Link href="/configuracion" onClick={() => setMenu(null)} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <Icono nombre="UserCog" /> Configuración
              </Link>
              {urlMachea ? (
                // Con el login de Machea, la sesión se cierra en su backend; la cookie es de www.machea.co.
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`${urlMachea}/api/sesion`, { method: "DELETE", credentials: "include" }).catch(() => undefined);
                    window.location.href = `${urlMachea}/acceso/`;
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Icono nombre="LogOut" /> Cerrar sesión
                </button>
              ) : (
                <form action={cerrarSesion}>
                  <button type="submit" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                    <Icono nombre="LogOut" /> Cerrar sesión
                  </button>
                </form>
              )}
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
      <div className={`animate-bajar absolute right-0 z-40 mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl ${ancho}`}>{children}</div>
    </>
  );
}
