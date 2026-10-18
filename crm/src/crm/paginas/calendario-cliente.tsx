"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Boton, clasesBoton } from "@/ui/boton";
import { Icono, IconoObjeto } from "@/ui/icono";
import { aHoraLocal, desdeHoraLocal, diaSemana, sumarDias, ZONA_HORARIA } from "../fechas";
import { FormularioRegistro } from "../ui/formulario-registro";

export interface EventoCalendario {
  id: string;
  asunto: string;
  inicio: string;
  fin: string;
  todoElDia: boolean;
  ubicacion: string | null;
  privado: boolean;
}

const HORA_INICIO = 7;
const HORA_FIN = 21;
const ALTO_HORA = 48;
const nombresDia = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."];

/** Minutos desde la medianoche de una hora "AAAA-MM-DDTHH:mm". */
const minutos = (local: string) => Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
const hora = (local: string) => local.slice(11, 16);
const formatoTitulo = (fecha: string, opciones: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-CO", { ...opciones, timeZone: "UTC" }).format(new Date(`${fecha}T12:00:00Z`));

export function CalendarioCliente({
  app,
  vista,
  fecha,
  desde,
  dias,
  anterior,
  siguiente,
  hoy,
  todos,
  eventos,
}: {
  app: string;
  vista: "dia" | "semana" | "mes";
  fecha: string;
  desde: string;
  dias: number;
  anterior: string;
  siguiente: string;
  hoy: string;
  todos: boolean;
  eventos: EventoCalendario[];
}) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState<Date | null>(null);
  const base = `/${app}/p/calendario`;
  const url = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams({ vista, fecha, ...(todos ? { todos: "1" } : {}) });
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `${base}?${p.toString()}`;
  };
  const listaDias = Array.from({ length: dias }, (_, i) => sumarDias(desde, i));
  const titulo =
    vista === "mes"
      ? formatoTitulo(fecha, { month: "long", year: "numeric" })
      : vista === "dia"
        ? formatoTitulo(fecha, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
        : `${formatoTitulo(listaDias[0]!, { day: "numeric", month: "short" })} – ${formatoTitulo(listaDias[dias - 1]!, { day: "numeric", month: "short", year: "numeric" })}`;

  // Inicio y fin de cada evento en la zona del negocio.
  const locales = eventos.map((e) => ({ ...e, ini: aHoraLocal(new Date(e.inicio)), fin: aHoraLocal(new Date(e.fin)) }));
  const delDia = (dia: string) =>
    locales.filter((e) => {
      // Un evento que termina justo a medianoche no ocupa el día siguiente.
      const ultimoDia = e.fin.slice(11) === "00:00" && e.fin > e.ini ? sumarDias(e.fin.slice(0, 10), -1) : e.fin.slice(0, 10);
      return e.ini.slice(0, 10) <= dia && dia <= ultimoDia;
    });
  const crearEn = (dia: string, h: number) => setNuevo(desdeHoraLocal(`${dia}T${String(h).padStart(2, "0")}:00`));
  const ahora = new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_HORARIA, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value;

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
        <div className="flex items-center gap-3">
          <IconoObjeto icono="CalendarDays" color="bg-pink-500" tamano="lg" />
          <div>
            <p className="text-xs text-slate-500">Calendario</p>
            <h1 className="text-xl font-semibold text-slate-800 first-letter:uppercase">{titulo}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex">
            <Link href={url({ fecha: anterior })} className={clasesBoton("secundario", "sm", "rounded-r-none")} aria-label="Anterior">
              <Icono nombre="ChevronLeft" />
            </Link>
            <Link href={url({ fecha: siguiente })} className={clasesBoton("secundario", "sm", "-ml-px rounded-l-none")} aria-label="Siguiente">
              <Icono nombre="ChevronRight" />
            </Link>
          </div>
          <Link href={url({ fecha: hoy })} className={clasesBoton("secundario", "sm")}>
            Hoy
          </Link>
          <div className="flex overflow-hidden rounded-md border border-slate-300 text-xs" role="group" aria-label="Vista">
            {(["dia", "semana", "mes"] as const).map((v) => (
              <Link key={v} href={url({ vista: v })} className={clsx("px-3 py-1.5", vista === v ? "bg-marca-700 text-white" : "bg-white hover:bg-slate-50")}>
                {v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}
              </Link>
            ))}
          </div>
          <Link href={url({ todos: todos ? null : "1" })} className={clasesBoton(todos ? "primario" : "secundario", "sm")}>
            <Icono nombre="Users" /> {todos ? "Todos los calendarios" : "Mis eventos"}
          </Link>
          <button type="button" onClick={() => router.refresh()} className={clasesBoton("secundario", "sm")} aria-label="Actualizar">
            <Icono nombre="RefreshCw" />
          </button>
          <Boton variante="primario" tamano="sm" icono="Plus" onClick={() => crearEn(fecha, Math.min(Math.max(Number(aHoraLocal(new Date()).slice(11, 13)) + 1, HORA_INICIO), HORA_FIN - 1))}>
            Nuevo evento
          </Boton>
        </div>
      </header>

      {vista === "mes" ? (
        <div className="grid grid-cols-7">
          {nombresDia.map((n) => (
            <div key={n} className="border-b border-slate-200 px-2 py-1.5 text-center text-xs font-medium text-slate-500 uppercase">
              {n}
            </div>
          ))}
          {listaDias.map((dia) => {
            const otroMes = dia.slice(0, 7) !== fecha.slice(0, 7);
            const delDiaLista = delDia(dia);
            return (
              <div key={dia} onDoubleClick={() => crearEn(dia, 9)} className={clsx("min-h-28 border-r border-b border-slate-100 p-1.5", otroMes && "bg-slate-50")}>
                <Link
                  href={url({ vista: "dia", fecha: dia })}
                  className={clsx(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs",
                    dia === hoy ? "bg-marca-700 font-semibold text-white" : otroMes ? "text-slate-400" : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {Number(dia.slice(8, 10))}
                </Link>
                <ul className="mt-1 space-y-0.5">
                  {delDiaLista.slice(0, 3).map((e) => (
                    <li key={e.id}>
                      <Link href={`/${app}/o/eventos/${e.id}`} className="block truncate rounded bg-pink-100 px-1.5 py-0.5 text-[11px] text-pink-900 hover:bg-pink-200">
                        {e.todoElDia ? "" : `${hora(e.ini)} `}
                        {e.privado ? "Ocupado" : e.asunto}
                      </Link>
                    </li>
                  ))}
                  {delDiaLista.length > 3 ? <li className="px-1 text-[11px] text-slate-500">+{delDiaLista.length - 3} más</li> : null}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="desplazable max-h-[calc(100vh-15rem)] overflow-auto">
          <div className="sticky top-0 z-10 grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns: `56px repeat(${dias}, minmax(0, 1fr))` }}>
            <div className="border-r border-slate-100 p-1 text-[10px] text-slate-400">{ahora}</div>
            {listaDias.map((dia) => (
              <div key={dia} className="border-r border-slate-100 px-2 py-1.5 text-center">
                <p className="text-[11px] text-slate-500 uppercase">{nombresDia[diaSemana(dia)]}</p>
                <p className={clsx("mx-auto inline-flex size-7 items-center justify-center rounded-full text-sm", dia === hoy ? "bg-marca-700 font-semibold text-white" : "text-slate-800")}>
                  {Number(dia.slice(8, 10))}
                </p>
                <ul className="mt-1 space-y-0.5 text-left">
                  {delDia(dia)
                    .filter((e) => e.todoElDia)
                    .map((e) => (
                      <li key={e.id}>
                        <Link href={`/${app}/o/eventos/${e.id}`} className="block truncate rounded bg-pink-500 px-1.5 py-0.5 text-[11px] text-white">
                          {e.privado ? "Ocupado" : e.asunto}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `56px repeat(${dias}, minmax(0, 1fr))` }}>
            <div className="border-r border-slate-100">
              {Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => (
                <div key={i} className="relative border-b border-slate-50 pr-1 text-right text-[10px] text-slate-400" style={{ height: ALTO_HORA }}>
                  {`${HORA_INICIO + i}:00`}
                </div>
              ))}
            </div>
            {listaDias.map((dia) => (
              <div key={dia} className="relative border-r border-slate-100">
                {Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => crearEn(dia, HORA_INICIO + i)}
                    className="block w-full border-b border-slate-50 hover:bg-marca-50/50"
                    style={{ height: ALTO_HORA }}
                    aria-label={`Nuevo evento el ${dia} a las ${HORA_INICIO + i}:00`}
                  />
                ))}
                {delDia(dia)
                  .filter((e) => !e.todoElDia)
                  .map((e) => {
                    // Un evento que empezó otro día arranca al inicio de la cuadrícula.
                    const inicioMin = e.ini.slice(0, 10) === dia ? minutos(e.ini) : 0;
                    const finMin = e.fin.slice(0, 10) === dia ? minutos(e.fin) : 24 * 60;
                    const arriba = Math.max(0, ((inicioMin - HORA_INICIO * 60) / 60) * ALTO_HORA);
                    const alto = Math.max(22, ((finMin - Math.max(inicioMin, HORA_INICIO * 60)) / 60) * ALTO_HORA);
                    return (
                      <Link
                        key={e.id}
                        href={`/${app}/o/eventos/${e.id}`}
                        className="absolute inset-x-1 overflow-hidden rounded-md border-l-4 border-pink-500 bg-pink-50 px-1.5 py-1 text-[11px] text-pink-900 shadow-sm hover:bg-pink-100"
                        style={{ top: arriba, height: Math.min(alto, (HORA_FIN - HORA_INICIO) * ALTO_HORA - arriba) }}
                      >
                        <p className="truncate font-semibold">{e.privado ? "Ocupado" : e.asunto}</p>
                        <p className="truncate">
                          {hora(e.ini)} – {hora(e.fin)}
                          {e.ubicacion && !e.privado ? ` · ${e.ubicacion}` : ""}
                        </p>
                      </Link>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
      {nuevo ? (
        <FormularioRegistro
          objeto="eventos"
          app={app}
          abierto
          irAlRegistro={false}
          valoresIniciales={{ inicio: nuevo, fin: new Date(nuevo.getTime() + 3600000) }}
          alCerrar={() => setNuevo(null)}
        />
      ) : null}
    </div>
  );
}
