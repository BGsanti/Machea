"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cerrarSesion } from "@/auth/acciones";
import { Icono } from "@/ui/icono";
import { formatoFechaHora, iniciales } from "../../formato";
import { marcarNotificacionesLeidas } from "../../servidor/sistema";

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
  empresa,
  notificaciones,
  sinLeer,
}: {
  usuario: { nombre: string; email: string; rol: string };
  empresa: string;
  notificaciones: Notificacion[];
  sinLeer: number;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState<"notificaciones" | "perfil" | "ayuda" | null>(null);
  const [, iniciar] = useTransition();
  const alternar = (m: typeof menu) => setMenu((actual) => (actual === m ? null : m));

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-4">
      <Link href="/inicio" className="flex items-center gap-2" aria-label="Ir al inicio">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-marca-700 text-sm font-bold text-white">R</span>
        <span className="hidden text-sm font-semibold text-slate-800 md:block">
          REA CRM <span className="font-normal text-slate-400">· {empresa}</span>
        </span>
      </Link>

      <form
        role="search"
        className="mx-auto w-full max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          if (typeof q === "string" && q.trim()) router.push(`/buscar?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label className="relative block">
          <span className="sr-only">Buscar en el CRM</span>
          <Icono nombre="Search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            type="search"
            placeholder="Buscar..."
            className="h-9 w-full rounded-md border border-slate-300 bg-slate-50 pr-3 pl-9 text-sm focus:border-marca-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-marca-600/20"
          />
        </label>
      </form>

      <div className="flex items-center gap-1">
        <div className="relative">
          <button type="button" onClick={() => alternar("ayuda")} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Ayuda" title="Ayuda">
            <Icono nombre="CircleQuestionMark" className="size-5" />
          </button>
          {menu === "ayuda" ? (
            <Desplegable alCerrar={() => setMenu(null)} ancho="w-72">
              <div className="p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">Ayuda de REA CRM</p>
                <ul className="mt-2 space-y-1.5">
                  <li>Use la barra lateral para cambiar de app.</li>
                  <li>Las pestañas de cada app se pueden ordenar con el lápiz de la derecha.</li>
                  <li>Busque cualquier registro con el buscador superior.</li>
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
            className="ml-1 inline-flex size-9 items-center justify-center rounded-full bg-marca-100 text-sm font-semibold text-marca-800 hover:ring-2 hover:ring-marca-600/30"
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
              <form action={cerrarSesion}>
                <button type="submit" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50">
                  <Icono nombre="LogOut" /> Cerrar sesión
                </button>
              </form>
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
      <div className={`absolute right-0 z-40 mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl ${ancho}`}>{children}</div>
    </>
  );
}
