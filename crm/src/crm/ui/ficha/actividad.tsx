"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { fechaLocal } from "../../fechas";
import { formatoFecha, formatoFechaHora, type FilaConNombres } from "../../formato";
import { completarTarea } from "../../servidor/especiales";
import type { Actividad } from "../../servidor/repositorio";
import { FormularioRegistro } from "../formulario-registro";

const iconos: Record<string, { icono: string; color: string }> = {
  tarea: { icono: "ListChecks", color: "bg-lime-600" },
  llamada: { icono: "PhoneCall", color: "bg-teal-600" },
  correo: { icono: "Mail", color: "bg-slate-500" },
  evento: { icono: "CalendarDays", color: "bg-pink-500" },
};

export function PanelActividad({
  app,
  prefijo,
  pendientes,
  pasadas,
}: {
  app: string;
  prefijo: Partial<FilaConNombres>;
  pendientes: Actividad[];
  pasadas: Actividad[];
}) {
  const [nuevo, setNuevo] = useState<"tarea" | "evento" | "llamada" | null>(null);
  const [, iniciar] = useTransition();
  const ahora = new Date();
  const inicio = new Date(Math.ceil(ahora.getTime() / 1800000) * 1800000);

  const elemento = (a: Actividad, pendiente: boolean) => {
    const estilo = iconos[a.tipo] ?? iconos.tarea!;
    const vencida = pendiente && a.objeto === "tareas" && typeof a.fecha === "string" && a.fecha < fechaLocal();
    return (
      <li key={`${a.objeto}-${a.id}`} className="flex gap-3 py-2.5">
        <span className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-white ${estilo.color}`}>
          <Icono nombre={estilo.icono} className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {a.objeto === "tareas" ? (
              <input
                type="checkbox"
                defaultChecked={a.estado === "completada"}
                className="mt-1 size-4 accent-marca-700"
                aria-label={`Marcar ${a.asunto} como completada`}
                onChange={(e) => {
                  const marcado = e.target.checked;
                  iniciar(async () => {
                    await completarTarea(a.id, marcado);
                    avisar(marcado ? "Tarea completada." : "Tarea reabierta.");
                  });
                }}
              />
            ) : null}
            <Link href={`/${app}/o/${a.objeto}/${a.id}`} className="font-medium text-marca-700 hover:underline">
              {a.asunto}
            </Link>
            <span className={`ml-auto shrink-0 text-xs ${vencida ? "font-medium text-rose-600" : "text-slate-500"}`}>
              {a.objeto === "eventos" ? formatoFechaHora(a.fecha) : a.fecha ? formatoFecha(a.fecha) : "Sin fecha"}
            </span>
          </div>
          {a.descripcion ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{a.descripcion}</p> : null}
        </div>
      </li>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Boton tamano="sm" icono="ListChecks" onClick={() => setNuevo("tarea")}>
          Nueva tarea
        </Boton>
        <Boton tamano="sm" icono="CalendarPlus" onClick={() => setNuevo("evento")}>
          Nuevo evento
        </Boton>
        <Boton tamano="sm" icono="PhoneCall" onClick={() => setNuevo("llamada")}>
          Registrar una llamada
        </Boton>
      </div>
      <h3 className="mt-5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Próximas y vencidas</h3>
      {pendientes.length ? (
        <ul className="divide-y divide-slate-100">{pendientes.map((a) => elemento(a, true))}</ul>
      ) : (
        <p className="py-3 text-sm text-slate-500">No hay actividades pendientes. Para empezar, programe una tarea o un evento.</p>
      )}
      <h3 className="mt-5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Actividad pasada</h3>
      {pasadas.length ? (
        <ul className="divide-y divide-slate-100">{pasadas.map((a) => elemento(a, false))}</ul>
      ) : (
        <p className="py-3 text-sm text-slate-500">Todavía no hay actividad registrada.</p>
      )}

      {nuevo === "tarea" ? (
        <FormularioRegistro objeto="tareas" app={app} abierto irAlRegistro={false} valoresIniciales={prefijo} alCerrar={() => setNuevo(null)} />
      ) : null}
      {nuevo === "llamada" ? (
        <FormularioRegistro
          objeto="tareas"
          app={app}
          abierto
          irAlRegistro={false}
          valoresIniciales={{ ...prefijo, asunto: "Llamada", tipo: "llamada", estado: "completada", fechaVencimiento: fechaLocal() }}
          alCerrar={() => setNuevo(null)}
        />
      ) : null}
      {nuevo === "evento" ? (
        <FormularioRegistro
          objeto="eventos"
          app={app}
          abierto
          irAlRegistro={false}
          valoresIniciales={{ ...prefijo, inicio, fin: new Date(inicio.getTime() + 3600000) }}
          alCerrar={() => setNuevo(null)}
        />
      ) : null}
    </div>
  );
}

export function NuevoRelacionado({
  objeto,
  app,
  campo,
  id,
  nombre,
}: {
  objeto: string;
  app: string;
  campo: string;
  id: string;
  nombre: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton tamano="sm" onClick={() => setAbierto(true)}>
        Nuevo
      </Boton>
      {abierto ? (
        <FormularioRegistro
          objeto={objeto}
          app={app}
          abierto
          irAlRegistro={false}
          valoresIniciales={{ [campo]: id, __nombres: { [campo]: nombre } }}
          alCerrar={() => setAbierto(false)}
        />
      ) : null}
    </>
  );
}
