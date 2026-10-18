"use client";

import { useState } from "react";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { valorInput, type FilaConNombres } from "../formato";
import type { OpcionBusqueda } from "../servidor/repositorio";
import type { Campo } from "../tipos";
import { BusquedaPolimorfica, BusquedaRegistro } from "./busqueda-registro";

export function CampoFormulario({
  campo,
  fila,
  error,
  alCambiar,
  alSeleccionar,
  sinEtiqueta,
}: {
  campo: Campo;
  fila: Partial<FilaConNombres>;
  error?: string;
  alCambiar?: (valor: string) => void;
  alSeleccionar?: (opcion: OpcionBusqueda | null) => void;
  sinEtiqueta?: boolean;
}) {
  const id = `campo-${campo.nombre}`;
  const valor = fila[campo.nombre];
  const invalido = Boolean(error);
  const clase = `${claseInput} ${invalido ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500/20" : ""}`;
  const comun = { id, name: campo.nombre, "aria-invalid": invalido || undefined, "aria-describedby": error ? `${id}-error` : undefined };

  let control: React.ReactNode;
  switch (campo.tipo) {
    case "areaTexto":
    case "markdown":
      control = (
        <textarea
          {...comun}
          rows={campo.tipo === "markdown" ? 12 : 3}
          defaultValue={valorInput(campo, valor)}
          className={`${clase} ${campo.tipo === "markdown" ? "font-mono text-xs" : ""}`}
          onChange={(e) => alCambiar?.(e.target.value)}
        />
      );
      break;
    case "casilla":
      control = (
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            {...comun}
            type="checkbox"
            defaultChecked={valor === undefined ? campo.porDefecto === true : Boolean(valor)}
            className="size-4 rounded border-slate-300 accent-marca-700"
          />
          {sinEtiqueta ? campo.etiqueta : null}
        </label>
      );
      break;
    case "lista":
      control = (
        <select
          {...comun}
          defaultValue={valor === undefined || valor === null ? String(campo.porDefecto ?? "") : String(valor)}
          className={clase}
          onChange={(e) => alCambiar?.(e.target.value)}
        >
          <option value="">--Ninguno--</option>
          {campo.opciones?.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      );
      break;
    case "listaMultiple":
      control = <ListaDoble campo={campo} seleccion={Array.isArray(valor) ? (valor as string[]) : []} />;
      break;
    case "busqueda":
      control = (
        <BusquedaRegistro
          id={id}
          nombre={campo.nombre}
          objeto={campo.objetoDestino ?? ""}
          idInicial={typeof valor === "string" ? valor : null}
          textoInicial={fila.__nombres?.[campo.nombre] ?? null}
          invalido={invalido}
          alSeleccionar={alSeleccionar}
        />
      );
      break;
    case "polimorfico":
      control = (
        <BusquedaPolimorfica
          nombre={campo.nombre}
          objetos={campo.objetosPermitidos ?? []}
          objetoInicial={fila[`${campo.nombre}Objeto`] as string | undefined}
          idInicial={fila[`${campo.nombre}Id`] as string | undefined}
          textoInicial={fila.__nombres?.[campo.nombre] ?? null}
          invalido={invalido}
        />
      );
      break;
    default: {
      const tipos: Record<string, string> = {
        email: "email",
        telefono: "tel",
        url: "url",
        numero: "number",
        moneda: "number",
        porcentaje: "number",
        fecha: "date",
        fechaHora: "datetime-local",
      };
      const lista = campo.sugerencias ? `${id}-sugerencias` : undefined;
      control = (
        <>
          <input
            {...comun}
            type={tipos[campo.tipo] ?? "text"}
            step={campo.tipo === "moneda" ? "0.01" : campo.tipo === "numero" ? "any" : undefined}
            min={campo.tipo === "porcentaje" ? 0 : undefined}
            max={campo.tipo === "porcentaje" ? 100 : undefined}
            list={lista}
            defaultValue={valor === undefined || valor === null ? String(campo.porDefecto ?? "") : valorInput(campo, valor)}
            className={clase}
            onChange={(e) => alCambiar?.(e.target.value)}
          />
          {lista ? (
            <datalist id={lista}>
              {campo.sugerencias?.map((s) => <option key={s} value={s} />)}
            </datalist>
          ) : null}
        </>
      );
    }
  }

  return (
    <div>
      {sinEtiqueta && campo.tipo === "casilla" ? null : (
        <Etiqueta htmlFor={id} requerido={campo.requerido}>
          {campo.etiqueta}
        </Etiqueta>
      )}
      {control}
      {campo.ayuda && !error ? <p className="mt-1 text-xs text-slate-500">{campo.ayuda}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Selector de dos listas (Disponible / Seleccionado) para campos de selección múltiple. */
function ListaDoble({ campo, seleccion: inicial }: { campo: Campo; seleccion: string[] }) {
  const [seleccion, setSeleccion] = useState<string[]>(inicial);
  const disponibles = (campo.opciones ?? []).filter((o) => !seleccion.includes(o.valor));
  const etiqueta = (v: string) => campo.opciones?.find((o) => o.valor === v)?.etiqueta ?? v;
  return (
    <div className="grid grid-cols-2 gap-3">
      {seleccion.map((v) => (
        <input key={v} type="hidden" name={campo.nombre} value={v} />
      ))}
      <div>
        <p className="mb-1 text-xs text-slate-500">Disponible</p>
        <ul className="h-28 overflow-auto rounded-md border border-slate-300 bg-white text-sm">
          {disponibles.map((o) => (
            <li key={o.valor}>
              <button type="button" onClick={() => setSeleccion([...seleccion, o.valor])} className="w-full px-2 py-1 text-left hover:bg-marca-50">
                {o.etiqueta}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1 text-xs text-slate-500">Seleccionado</p>
        <ul className="h-28 overflow-auto rounded-md border border-slate-300 bg-white text-sm">
          {seleccion.map((v) => (
            <li key={v}>
              <button type="button" onClick={() => setSeleccion(seleccion.filter((s) => s !== v))} className="w-full px-2 py-1 text-left hover:bg-rose-50">
                {etiqueta(v)} <span className="text-xs text-slate-400">(quitar)</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
