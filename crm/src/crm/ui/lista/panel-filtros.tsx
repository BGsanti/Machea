"use client";

import { useState } from "react";
import { claseInput } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { campoDe, obtenerObjeto } from "../../objetos";
import type { Condicion, OperadorCondicion } from "../../tipos";

const etiquetasOperador: Partial<Record<OperadorCondicion, string>> = {
  igual: "es igual a",
  distinto: "no es igual a",
  contiene: "contiene",
  mayor: "mayor que",
  menor: "menor que",
  vacio: "está vacío",
  no_vacio: "no está vacío",
  verdadero: "es verdadero",
  falso: "es falso",
};

const sinValor: OperadorCondicion[] = ["vacio", "no_vacio", "verdadero", "falso"];

export function PanelFiltros({ objeto, filtros, alAplicar }: { objeto: string; filtros: Condicion[]; alAplicar: (f: Condicion[]) => void }) {
  const def = obtenerObjeto(objeto)!;
  const [lista, setLista] = useState<Condicion[]>(filtros);
  const filtrables = def.campos.filter((c) => !["polimorfico", "listaMultiple", "markdown"].includes(c.tipo));
  const [campo, setCampo] = useState(filtrables[0]?.nombre ?? "");
  const [operador, setOperador] = useState<OperadorCondicion>("igual");
  const [valor, setValor] = useState("");
  const actual = campoDe(def, campo);
  const operadores: OperadorCondicion[] =
    actual?.tipo === "casilla"
      ? ["verdadero", "falso"]
      : ["numero", "moneda", "porcentaje", "fecha", "fechaHora"].includes(actual?.tipo ?? "")
        ? ["igual", "distinto", "mayor", "menor", "vacio", "no_vacio"]
        : actual?.tipo === "lista" || actual?.tipo === "busqueda"
          ? ["igual", "distinto", "vacio", "no_vacio"]
          : ["contiene", "igual", "distinto", "vacio", "no_vacio"];

  const describir = (c: Condicion) => {
    const def2 = campoDe(def, c.campo);
    const v = typeof c.valor === "string" ? (def2?.opciones?.find((o) => o.valor === c.valor)?.etiqueta ?? c.valor) : "";
    return `${def2?.etiqueta ?? c.campo} ${etiquetasOperador[c.operador] ?? c.operador}${v ? ` «${v}»` : ""}`;
  };

  return (
    <aside className="w-80 shrink-0 border-l border-slate-200 p-4" aria-label="Filtros">
      <p className="text-sm font-semibold text-slate-800">Filtros</p>
      <ul className="mt-3 space-y-2">
        {lista.length === 0 ? <li className="text-xs text-slate-500">Sin filtros adicionales.</li> : null}
        {lista.map((c, i) => (
          <li key={`${c.campo}-${i}`} className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs">
            <span className="flex-1">{describir(c)}</span>
            <button type="button" onClick={() => setLista(lista.filter((_, j) => j !== i))} aria-label="Quitar filtro" className="text-slate-400 hover:text-rose-600">
              <Icono nombre="X" className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3">
        <select
          value={campo}
          onChange={(e) => {
            setCampo(e.target.value);
            setValor("");
            const nuevo = campoDe(def, e.target.value);
            setOperador(nuevo?.tipo === "casilla" ? "verdadero" : nuevo?.tipo === "texto" ? "contiene" : "igual");
          }}
          className={claseInput}
          aria-label="Campo"
        >
          {filtrables.map((c) => (
            <option key={c.nombre} value={c.nombre}>
              {c.etiqueta}
            </option>
          ))}
        </select>
        <select value={operador} onChange={(e) => setOperador(e.target.value as OperadorCondicion)} className={claseInput} aria-label="Operador">
          {operadores.map((o) => (
            <option key={o} value={o}>
              {etiquetasOperador[o]}
            </option>
          ))}
        </select>
        {sinValor.includes(operador) ? null : actual?.tipo === "lista" ? (
          <select value={valor} onChange={(e) => setValor(e.target.value)} className={claseInput} aria-label="Valor">
            <option value="">Elija un valor</option>
            {actual.opciones?.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            type={actual?.tipo === "fecha" ? "date" : ["numero", "moneda", "porcentaje"].includes(actual?.tipo ?? "") ? "number" : "text"}
            className={claseInput}
            aria-label="Valor"
            placeholder="Valor"
          />
        )}
        <Boton
          tamano="sm"
          icono="Plus"
          disabled={!sinValor.includes(operador) && !valor}
          onClick={() => {
            setLista([...lista, { campo, operador, valor: sinValor.includes(operador) ? undefined : valor }]);
            setValor("");
          }}
        >
          Agregar filtro
        </Boton>
      </div>
      <div className="mt-4 flex gap-2">
        <Boton variante="primario" onClick={() => alAplicar(lista)}>
          Aplicar
        </Boton>
        {lista.length ? (
          <Boton
            onClick={() => {
              setLista([]);
              alAplicar([]);
            }}
          >
            Quitar todos
          </Boton>
        ) : null}
      </div>
    </aside>
  );
}
