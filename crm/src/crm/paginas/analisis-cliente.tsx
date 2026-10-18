"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { informes, paneles } from "@/db/esquema";
import { avisar } from "@/ui/avisos";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { Boton, clasesBoton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { formatoMoneda, formatoNumero } from "../formato";
import { obtenerObjeto } from "../objetos";
import type { ResultadoInforme } from "../servidor/consultas";
import { alternarFavorito, eliminarInforme, eliminarPanel, guardarInforme, guardarPanel, type DatosInforme } from "../servidor/sistema";
import { Grafico } from "../ui/graficos";

type Informe = typeof informes.$inferSelect;
type Panel = typeof paneles.$inferSelect;

const tiposGrafico = [
  { valor: "barras", etiqueta: "Barras horizontales" },
  { valor: "columnas", etiqueta: "Columnas" },
  { valor: "linea", etiqueta: "Línea" },
  { valor: "anillo", etiqueta: "Anillo" },
  { valor: "tabla", etiqueta: "Solo tabla" },
];

export function BotonFavorito({ tipo, id, favorito }: { tipo: "informe" | "panel"; id: string; favorito: boolean }) {
  const [, iniciar] = useTransition();
  return (
    <button
      type="button"
      onClick={() => iniciar(async () => alternarFavorito(tipo, id, !favorito))}
      aria-label={favorito ? "Quitar de favoritos" : "Agregar a favoritos"}
      className={favorito ? "text-amber-500" : "text-slate-300 hover:text-amber-500"}
    >
      <Icono nombre="Star" className={favorito ? "size-4 fill-current" : "size-4"} />
    </button>
  );
}

export function BuscadorAnalisis({ elementos }: { elementos: { id: string; nombre: string; href: string; tipo: string }[] }) {
  const [q, setQ] = useState("");
  const resultados = q.trim() ? elementos.filter((e) => e.nombre.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  return (
    <div className="relative w-full">
      <Icono nombre="Search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busque informes y paneles..."
        className={`${claseInput} pl-9`}
        aria-label="Buscar informes y paneles"
      />
      {resultados.length ? (
        <ul className="absolute z-20 mt-1 w-full rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          {resultados.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                <Icono nombre={r.tipo === "panel" ? "LayoutGrid" : "ChartPie"} className="size-4 text-slate-400" /> {r.nombre}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ResumenInforme({ resultado, tipo, moneda }: { resultado: ResultadoInforme; tipo: string; moneda: string }) {
  const valor = (n: number) => (resultado.esMoneda ? formatoMoneda(n, moneda) : formatoNumero(n));
  // En un informe de conteo, el valor y el número de registros son lo mismo.
  const soloConteo = resultado.etiquetaValor === "Número de registros";
  return (
    <div className="space-y-4">
      <div className="flex gap-8">
        <div>
          <p className="text-xs text-slate-500">{resultado.etiquetaValor}</p>
          <p className="text-2xl font-semibold text-slate-800">{valor(resultado.total)}</p>
        </div>
        {soloConteo ? null : (
          <div>
            <p className="text-xs text-slate-500">Registros</p>
            <p className="text-2xl font-semibold text-slate-800">{formatoNumero(resultado.registros)}</p>
          </div>
        )}
      </div>
      {tipo !== "tabla" ? <Grafico datos={resultado.grupos.map((g) => ({ etiqueta: g.etiqueta, valor: g.valor }))} tipo={tipo} esMoneda={resultado.esMoneda} moneda={moneda} /> : null}
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-600">
          <tr>
            <th className="px-3 py-2">Grupo</th>
            {soloConteo ? null : <th className="px-3 py-2 text-right">Registros</th>}
            <th className="px-3 py-2 text-right">{resultado.etiquetaValor}</th>
          </tr>
        </thead>
        <tbody>
          {resultado.grupos.map((g) => (
            <tr key={g.clave} className="border-t border-slate-100">
              <td className="px-3 py-1.5">{g.etiqueta}</td>
              {soloConteo ? null : <td className="px-3 py-1.5 text-right">{formatoNumero(g.registros)}</td>}
              <td className="px-3 py-1.5 text-right">{valor(g.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VistaInforme({ base, informe, resultado, moneda }: { base: string; informe: Informe; resultado: ResultadoInforme; moneda: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const def = obtenerObjeto(informe.objeto);

  const exportar = () => {
    const filas = [["Grupo", "Registros", resultado.etiquetaValor], ...resultado.grupos.map((g) => [g.etiqueta, String(g.registros), String(g.valor)])];
    const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    enlace.download = `${informe.nombre}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <Link href={base} className="text-xs text-marca-700 hover:underline">
            ← Análisis
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
            {informe.nombre} <BotonFavorito tipo="informe" id={informe.id} favorito={informe.favorito} />
          </h1>
          <p className="text-xs text-slate-500">
            Informe de {def?.etiquetaPlural.toLowerCase()} {informe.descripcion ? `· ${informe.descripcion}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Boton icono="Download" onClick={exportar}>
            Exportar
          </Boton>
          <Link href={`${base}?editar=${informe.id}`} className={clasesBoton("secundario")}>
            <Icono nombre="Pencil" /> Modificar
          </Link>
          <Boton
            variante="fantasma"
            icono="Trash"
            cargando={pendiente}
            aria-label="Eliminar informe"
            onClick={() => {
              if (!confirm("¿Eliminar este informe?")) return;
              iniciar(async () => {
                const r = await eliminarInforme(informe.id);
                avisar(r.mensaje ?? "");
                router.push(base);
              });
            }}
          />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <ResumenInforme resultado={resultado} tipo={informe.tipoGrafico} moneda={moneda} />
      </div>
    </div>
  );
}

export function ConstructorInforme({ base, objetos, informe }: { base: string; objetos: string[]; informe: Informe | null }) {
  const router = useRouter();
  const [objeto, setObjeto] = useState(informe?.objeto ?? "oportunidades");
  const [agregacion, setAgregacion] = useState<DatosInforme["agregacion"]>((informe?.agregacion as DatosInforme["agregacion"]) ?? "conteo");
  const [filtros, setFiltros] = useState<DatosInforme["filtros"]>(informe?.filtros.filter((f) => f.valor !== "$usuario") ?? []);
  const [soloMios, setSoloMios] = useState(Boolean(informe?.filtros.some((f) => f.valor === "$usuario")));
  const [pendiente, iniciar] = useTransition();
  const def = obtenerObjeto(objeto)!;
  const agrupables = def.campos.filter((c) => ["lista", "busqueda", "casilla", "fecha", "fechaHora"].includes(c.tipo));
  const numericos = def.campos.filter((c) => ["numero", "moneda", "porcentaje"].includes(c.tipo));
  const filtrables = def.campos.filter((c) => !["polimorfico", "listaMultiple", "markdown", "areaTexto"].includes(c.tipo));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const datos: DatosInforme = {
          nombre: String(f.get("nombre") ?? ""),
          descripcion: String(f.get("descripcion") ?? ""),
          objeto,
          agruparPor: String(f.get("agruparPor") ?? ""),
          agregacion,
          campoAgregado: String(f.get("campoAgregado") ?? ""),
          tipoGrafico: String(f.get("tipoGrafico") ?? "barras") as DatosInforme["tipoGrafico"],
          carpeta: String(f.get("carpeta") ?? ""),
          filtros: [...filtros.filter((x) => x.campo && x.valor !== ""), ...(soloMios ? [{ campo: "propietarioId", operador: "igual" as const, valor: "$usuario" }] : [])],
        };
        iniciar(async () => {
          const r = await guardarInforme(informe?.id ?? null, datos);
          avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
          if (r.ok && r.id) router.push(`${base}?informe=${r.id}`);
        });
      }}
    >
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <Link href={informe ? `${base}?informe=${informe.id}` : base} className="text-xs text-marca-700 hover:underline">
            ← Volver
          </Link>
          <h1 className="text-xl font-semibold text-slate-800">{informe ? "Modificar informe" : "Nuevo informe"}</h1>
        </div>
        <Boton type="submit" variante="primario" cargando={pendiente}>
          Guardar y ejecutar
        </Boton>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Información</h2>
          <div>
            <Etiqueta htmlFor="nombre" requerido>
              Nombre del informe
            </Etiqueta>
            <input id="nombre" name="nombre" required defaultValue={informe?.nombre} className={claseInput} />
          </div>
          <div>
            <Etiqueta htmlFor="descripcion">Descripción</Etiqueta>
            <input id="descripcion" name="descripcion" defaultValue={informe?.descripcion ?? ""} className={claseInput} />
          </div>
          <div>
            <Etiqueta htmlFor="carpeta">Carpeta</Etiqueta>
            <input id="carpeta" name="carpeta" defaultValue={informe?.carpeta ?? ""} placeholder="Ventas, Servicio..." className={claseInput} />
          </div>
          <div>
            <Etiqueta htmlFor="objeto" requerido>
              Tipo de informe
            </Etiqueta>
            <select
              id="objeto"
              value={objeto}
              onChange={(e) => {
                setObjeto(e.target.value);
                setFiltros([]);
              }}
              className={claseInput}
            >
              {objetos.map((o) => (
                <option key={o} value={o}>
                  {obtenerObjeto(o)?.etiquetaPlural}
                </option>
              ))}
            </select>
          </div>
        </section>
        <section key={objeto} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Agrupación y gráfico</h2>
          <div>
            <Etiqueta htmlFor="agruparPor">Agrupar por</Etiqueta>
            <select id="agruparPor" name="agruparPor" defaultValue={informe?.objeto === objeto ? (informe.agruparPor ?? "") : ""} className={claseInput}>
              <option value="">(sin agrupar: total)</option>
              {agrupables.map((c) => (
                <option key={c.nombre} value={c.nombre}>
                  {c.etiqueta}
                  {c.tipo === "fecha" || c.tipo === "fechaHora" ? " (por mes)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Etiqueta htmlFor="agregacion">Medida</Etiqueta>
              <select id="agregacion" value={agregacion} onChange={(e) => setAgregacion(e.target.value as DatosInforme["agregacion"])} className={claseInput}>
                <option value="conteo">Número de registros</option>
                {numericos.length ? <option value="suma">Suma de...</option> : null}
                {numericos.length ? <option value="promedio">Promedio de...</option> : null}
              </select>
            </div>
            {agregacion !== "conteo" ? (
              <div>
                <Etiqueta htmlFor="campoAgregado">Campo</Etiqueta>
                <select id="campoAgregado" name="campoAgregado" defaultValue={informe?.campoAgregado ?? numericos[0]?.nombre} className={claseInput}>
                  {numericos.map((c) => (
                    <option key={c.nombre} value={c.nombre}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <div>
            <Etiqueta htmlFor="tipoGrafico">Tipo de gráfico</Etiqueta>
            <select id="tipoGrafico" name="tipoGrafico" defaultValue={informe?.tipoGrafico ?? "barras"} className={claseInput}>
              {tiposGrafico.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </section>
      </div>
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Filtros</h2>
          <Boton tamano="sm" icono="Plus" onClick={() => setFiltros([...filtros, { campo: filtrables[0]?.nombre ?? "", operador: "igual", valor: "" }])}>
            Agregar filtro
          </Boton>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={soloMios} onChange={(e) => setSoloMios(e.target.checked)} className="accent-marca-700" /> Solo los registros de los que soy propietario
        </label>
        {filtros.map((f, i) => {
          const campo = def.campos.find((c) => c.nombre === f.campo);
          const cambiar = (parte: Partial<(typeof filtros)[number]>) => setFiltros(filtros.map((x, j) => (j === i ? { ...x, ...parte } : x)));
          return (
            <div key={i} className="flex flex-wrap gap-2">
              <select value={f.campo} onChange={(e) => cambiar({ campo: e.target.value, valor: "" })} className={`${claseInput} w-56`} aria-label="Campo">
                {filtrables.map((c) => (
                  <option key={c.nombre} value={c.nombre}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
              <select value={f.operador} onChange={(e) => cambiar({ operador: e.target.value as typeof f.operador })} className={`${claseInput} w-40`} aria-label="Operador">
                <option value="igual">es igual a</option>
                <option value="distinto">no es igual a</option>
                <option value="contiene">contiene</option>
                <option value="mayor">mayor que</option>
                <option value="menor">menor que</option>
              </select>
              {campo?.tipo === "lista" ? (
                <select value={f.valor} onChange={(e) => cambiar({ valor: e.target.value })} className={`${claseInput} w-56`} aria-label="Valor">
                  <option value="">Elija...</option>
                  {campo.opciones?.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              ) : campo?.tipo === "casilla" ? (
                <select value={f.valor} onChange={(e) => cambiar({ valor: e.target.value })} className={`${claseInput} w-56`} aria-label="Valor">
                  <option value="">Elija...</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input
                  value={f.valor}
                  onChange={(e) => cambiar({ valor: e.target.value })}
                  type={campo?.tipo === "fecha" ? "date" : "text"}
                  className={`${claseInput} w-56`}
                  aria-label="Valor"
                />
              )}
              <Boton variante="fantasma" icono="X" aria-label="Quitar filtro" onClick={() => setFiltros(filtros.filter((_, j) => j !== i))} />
            </div>
          );
        })}
      </section>
    </form>
  );
}

export function VistaPanel({
  base,
  panel,
  resultados,
  moneda,
}: {
  base: string;
  panel: Panel;
  resultados: { informe: Informe; resultado: ResultadoInforme }[];
  moneda: string;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <Link href={base} className="text-xs text-marca-700 hover:underline">
            ← Análisis
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-800">
            {panel.nombre} <BotonFavorito tipo="panel" id={panel.id} favorito={panel.favorito} />
          </h1>
          {panel.descripcion ? <p className="text-xs text-slate-500">{panel.descripcion}</p> : null}
        </div>
        <div className="flex gap-2">
          <Boton icono="RefreshCw" onClick={() => router.refresh()}>
            Actualizar
          </Boton>
          <Link href={`${base}?editarPanel=${panel.id}`} className={clasesBoton("secundario")}>
            <Icono nombre="Pencil" /> Modificar
          </Link>
          <Boton
            variante="fantasma"
            icono="Trash"
            aria-label="Eliminar panel"
            onClick={() => {
              if (!confirm("¿Eliminar este panel?")) return;
              iniciar(async () => {
                await eliminarPanel(panel.id);
                router.push(base);
              });
            }}
          />
        </div>
      </div>
      {resultados.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Este panel no tiene informes. Modifíquelo para agregarlos.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {resultados.map(({ informe, resultado }) => (
            <section key={informe.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Link href={`${base}?informe=${informe.id}`} className="text-sm font-semibold text-marca-700 hover:underline">
                {informe.nombre}
              </Link>
              <div className="mt-3">
                <p className="text-xs text-slate-500">{resultado.etiquetaValor}</p>
                <p className="text-xl font-semibold text-slate-800">{resultado.esMoneda ? formatoMoneda(resultado.total, moneda) : formatoNumero(resultado.total)}</p>
                <Grafico
                  datos={resultado.grupos.map((g) => ({ etiqueta: g.etiqueta, valor: g.valor }))}
                  tipo={informe.tipoGrafico === "tabla" ? "barras" : informe.tipoGrafico}
                  esMoneda={resultado.esMoneda}
                  moneda={moneda}
                  alto={220}
                />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function EditorPanel({ base, panel, informes: disponibles }: { base: string; panel: Panel | null; informes: { id: string; nombre: string; objeto: string }[] }) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState<string[]>(panel?.informes ?? []);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await guardarPanel(panel?.id ?? null, String(f.get("nombre") ?? ""), String(f.get("descripcion") ?? ""), elegidos);
          avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
          if (r.ok && r.id) router.push(`${base}?panel=${r.id}`);
        });
      }}
    >
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <Link href={panel ? `${base}?panel=${panel.id}` : base} className="text-xs text-marca-700 hover:underline">
            ← Volver
          </Link>
          <h1 className="text-xl font-semibold text-slate-800">{panel ? "Modificar panel" : "Nuevo panel"}</h1>
        </div>
        <Boton type="submit" variante="primario" cargando={pendiente}>
          Guardar
        </Boton>
      </div>
      <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <div>
          <Etiqueta htmlFor="nombre-panel" requerido>
            Nombre
          </Etiqueta>
          <input id="nombre-panel" name="nombre" required defaultValue={panel?.nombre} className={claseInput} />
        </div>
        <div>
          <Etiqueta htmlFor="descripcion-panel">Descripción</Etiqueta>
          <input id="descripcion-panel" name="descripcion" defaultValue={panel?.descripcion ?? ""} className={claseInput} />
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Informes del panel ({elegidos.length})</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {disponibles.map((i) => (
            <li key={i.id}>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={elegidos.includes(i.id)}
                  onChange={(e) => setElegidos(e.target.checked ? [...elegidos, i.id] : elegidos.filter((x) => x !== i.id))}
                  className="accent-marca-700"
                />
                {i.nombre}
                <span className="ml-auto text-xs text-slate-400">{obtenerObjeto(i.objeto)?.etiquetaPlural}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
    </form>
  );
}
