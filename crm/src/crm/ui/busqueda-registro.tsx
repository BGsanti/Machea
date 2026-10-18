"use client";

import { useRef, useState, useTransition } from "react";
import { claseInput } from "@/ui/basicos";
import { Icono } from "@/ui/icono";
import { obtenerObjeto } from "../objetos";
import { buscarOpciones } from "../servidor/acciones";
import type { OpcionBusqueda } from "../servidor/repositorio";

/** Campo de búsqueda de un registro relacionado. Envía el id en un input oculto. */
export function BusquedaRegistro({
  nombre,
  objeto,
  idInicial,
  textoInicial,
  id,
  invalido,
  alSeleccionar,
  placeholder,
  deshabilitado,
}: {
  nombre: string;
  objeto: string;
  idInicial?: string | null;
  textoInicial?: string | null;
  id?: string;
  invalido?: boolean;
  alSeleccionar?: (opcion: OpcionBusqueda | null) => void;
  placeholder?: string;
  deshabilitado?: boolean;
}) {
  const [valor, setValor] = useState(idInicial ?? "");
  const [texto, setTexto] = useState(textoInicial ?? "");
  const [opciones, setOpciones] = useState<OpcionBusqueda[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const [buscando, iniciar] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const def = obtenerObjeto(objeto);

  const buscar = (q: string) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      iniciar(async () => {
        setOpciones(await buscarOpciones(objeto, q));
        setActivo(0);
        setAbierto(true);
      });
    }, 200);
  };

  const elegir = (o: OpcionBusqueda | null) => {
    setValor(o?.id ?? "");
    setTexto(o?.nombre ?? "");
    setAbierto(false);
    alSeleccionar?.(o);
  };

  return (
    <div className="relative">
      <input type="hidden" name={nombre} value={valor} />
      {valor ? (
        <div className={`${claseInput} flex items-center gap-2 ${invalido ? "border-rose-500" : ""}`}>
          {def ? (
            <span className={`inline-flex size-5 items-center justify-center rounded text-white ${def.color}`}>
              <Icono nombre={def.icono} className="size-3" />
            </span>
          ) : null}
          <span className="flex-1 truncate">{texto}</span>
          {!deshabilitado ? (
            <button type="button" onClick={() => elegir(null)} className="text-slate-400 hover:text-slate-700" aria-label="Quitar selección">
              <Icono nombre="X" />
            </button>
          ) : null}
        </div>
      ) : (
        <div className="relative">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={abierto}
            aria-autocomplete="list"
            autoComplete="off"
            disabled={deshabilitado}
            className={`${claseInput} pr-8 ${invalido ? "border-rose-500" : ""}`}
            placeholder={placeholder ?? `Buscar ${def?.etiquetaPlural.toLowerCase() ?? "registros"}...`}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              buscar(e.target.value);
            }}
            onFocus={() => buscar(texto)}
            onBlur={() => setTimeout(() => setAbierto(false), 150)}
            onKeyDown={(e) => {
              if (!abierto) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActivo((a) => Math.min(a + 1, opciones.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActivo((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const o = opciones[activo];
                if (o) elegir(o);
              } else if (e.key === "Escape") setAbierto(false);
            }}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-slate-400">
            <Icono nombre={buscando ? "LoaderCircle" : "Search"} className={buscando ? "size-4 animate-spin" : "size-4"} />
          </span>
        </div>
      )}
      {abierto && !valor ? (
        <ul role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {opciones.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">Sin resultados.</li>
          ) : (
            opciones.map((o, i) => (
              <li
                key={o.id}
                role="option"
                aria-selected={i === activo}
                onMouseDown={(e) => {
                  e.preventDefault();
                  elegir(o);
                }}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === activo ? "bg-marca-50" : "hover:bg-slate-50"}`}
              >
                {def ? (
                  <span className={`inline-flex size-5 items-center justify-center rounded text-white ${def.color}`}>
                    <Icono nombre={def.icono} className="size-3" />
                  </span>
                ) : null}
                <span className="truncate">{o.nombre}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Búsqueda polimórfica: primero el tipo de registro y luego el registro. */
export function BusquedaPolimorfica({
  nombre,
  objetos,
  objetoInicial,
  idInicial,
  textoInicial,
  invalido,
}: {
  nombre: string;
  objetos: string[];
  objetoInicial?: string | null;
  idInicial?: string | null;
  textoInicial?: string | null;
  invalido?: boolean;
}) {
  const [objeto, setObjeto] = useState(objetoInicial && objetos.includes(objetoInicial) ? objetoInicial : (objetos[0] ?? ""));
  const [clave, setClave] = useState(0);
  return (
    <div className="flex gap-2">
      <select
        name={`${nombre}Objeto`}
        value={objeto}
        aria-label="Tipo de registro"
        onChange={(e) => {
          setObjeto(e.target.value);
          setClave((k) => k + 1);
        }}
        className={`${claseInput} w-40 shrink-0`}
      >
        {objetos.map((o) => (
          <option key={o} value={o}>
            {obtenerObjeto(o)?.etiqueta ?? o}
          </option>
        ))}
      </select>
      <div className="flex-1">
        <BusquedaRegistro
          key={`${objeto}-${clave}`}
          nombre={`${nombre}Id`}
          objeto={objeto}
          idInicial={objeto === objetoInicial ? idInicial : null}
          textoInicial={objeto === objetoInicial ? textoInicial : null}
          invalido={invalido}
        />
      </div>
    </div>
  );
}
