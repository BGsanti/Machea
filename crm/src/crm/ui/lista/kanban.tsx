"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { formatoMoneda, nombreVisible, type FilaConNombres } from "../../formato";
import { campoDe, obtenerObjeto } from "../../objetos";
import { actualizarCampo } from "../../servidor/acciones";
import { ValorCampo } from "../valor-campo";

/** Tablero por estado o etapa. Arrastrar una tarjeta a otra columna cambia su valor. */
export function Kanban({ objeto, app, filas, moneda }: { objeto: string; app: string; filas: FilaConNombres[]; moneda: string }) {
  const def = obtenerObjeto(objeto)!;
  const campo = campoDe(def, def.campoKanban!)!;
  const suma = def.campoSumaKanban;
  const [locales, setLocales] = useState<Record<string, string>>({});
  const [sobre, setSobre] = useState<string | null>(null);
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const valorDe = (f: FilaConNombres) => locales[f.id] ?? String(f[campo.nombre] ?? "");
  const secundarios = def.columnas.filter((c) => c !== def.camposNombre[0] && c !== campo.nombre && c !== "propietarioId").slice(0, 3);

  const mover = (id: string, valor: string) => {
    const fila = filas.find((f) => f.id === id);
    if (!fila || valorDe(fila) === valor) return;
    setLocales((l) => ({ ...l, [id]: valor }));
    iniciar(async () => {
      const r = await actualizarCampo(objeto, id, campo.nombre, valor);
      if (!r.ok) {
        avisar(r.mensaje ?? "No se pudo mover la tarjeta.", "error");
        setLocales((l) => {
          const copia = { ...l };
          delete copia[id];
          return copia;
        });
      }
    });
  };

  return (
    <div className="desplazable flex gap-3 overflow-x-auto p-4">
      {campo.opciones?.map((op) => {
        const tarjetas = filas.filter((f) => valorDe(f) === op.valor);
        const total = suma ? tarjetas.reduce((s, f) => s + Number(f[suma] ?? 0), 0) : null;
        return (
          <section
            key={op.valor}
            aria-label={op.etiqueta}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(op.valor);
            }}
            onDragLeave={() => setSobre(null)}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              setArrastrando(null);
              mover(e.dataTransfer.getData("text/plain"), op.valor);
            }}
            className={clsx("flex w-72 shrink-0 flex-col rounded-lg bg-slate-100 transition-[box-shadow,background-color] duration-150", sobre === op.valor && "bg-marca-50 ring-2 ring-marca-500")}
          >
            <header className="border-b-4 border-white px-3 py-2">
              <p className="flex items-center justify-between text-sm font-semibold text-slate-700">
                {op.etiqueta}
                <span className="rounded-full bg-white px-2 text-xs text-slate-500">{tarjetas.length}</span>
              </p>
              {total !== null ? <p className="text-xs text-slate-500">{formatoMoneda(total, moneda)}</p> : null}
            </header>
            <div className="flex min-h-24 flex-col gap-2 p-2">
              {tarjetas.map((f) => (
                <article
                  key={f.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", f.id);
                    setArrastrando(f.id);
                  }}
                  onDragEnd={() => {
                    setArrastrando(null);
                    setSobre(null);
                  }}
                  className={clsx(
                    "animate-aparecer cursor-grab rounded-md border border-slate-200 bg-white p-3 shadow-sm transition-[box-shadow,opacity,transform] duration-150 hover:shadow-md active:cursor-grabbing",
                    arrastrando === f.id && "scale-95 opacity-40",
                  )}
                >
                  <Link href={`/${app}/o/${objeto}/${f.id}`} className="text-sm font-medium text-marca-700 hover:underline">
                    {nombreVisible(def, f)}
                  </Link>
                  <dl className="mt-1 space-y-0.5 text-xs text-slate-600">
                    {secundarios.map((n) => {
                      const c = campoDe(def, n);
                      return c ? (
                        <div key={n} className="flex gap-1 truncate">
                          <dt className="text-slate-400">{c.etiqueta}:</dt>
                          <dd className="truncate">
                            <ValorCampo campo={c} fila={f} app={app} moneda={moneda} />
                          </dd>
                        </div>
                      ) : null;
                    })}
                  </dl>
                  <label className="sr-only" htmlFor={`mover-${f.id}`}>
                    Mover a
                  </label>
                  <select
                    id={`mover-${f.id}`}
                    value={valorDe(f)}
                    onChange={(e) => mover(f.id, e.target.value)}
                    className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-xs text-slate-600"
                  >
                    {campo.opciones?.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
