"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Boton, clasesBoton } from "@/ui/boton";
import { Icono, IconoObjeto } from "@/ui/icono";
import { formatoMoneda, formatoNumero } from "../formato";
import { obtenerObjeto } from "../objetos";
import type { ResultadoInforme } from "../servidor/consultas";
import { ocultarSugerencia, restaurarSugerencias } from "../servidor/sistema";
import { FormularioRegistro } from "../ui/formulario-registro";
import { Grafico } from "../ui/graficos";

export interface Sugerencia {
  id: string;
  titulo: string;
  texto: string;
  href: string;
  icono: string;
}

export function Bienvenida({ nombre, sugerencias, ocultas }: { nombre: string; sugerencias: Sugerencia[]; ocultas: number }) {
  const [abierta, setAbierta] = useState(true);
  const [, iniciar] = useTransition();
  return (
    <section className="rounded-2xl border border-marca-100 bg-gradient-to-r from-marca-50 to-sky-50 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-slate-800">Le damos la bienvenida, {nombre.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-600">Consulte estas sugerencias para empezar su jornada.</p>
        </div>
        <button type="button" onClick={() => setAbierta(!abierta)} className="rounded-md p-1.5 text-slate-500 hover:bg-white" aria-label={abierta ? "Ocultar sugerencias" : "Mostrar sugerencias"}>
          <Icono nombre={abierta ? "ChevronDown" : "ChevronRight"} />
        </button>
      </div>
      {abierta ? (
        sugerencias.length ? (
          <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {sugerencias.map((s) => (
              <li key={s.id} className="relative rounded-xl bg-white p-5 shadow-sm">
                <button
                  type="button"
                  onClick={() => iniciar(async () => ocultarSugerencia(s.id))}
                  className="absolute top-3 right-3 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Descartar esta sugerencia"
                >
                  <Icono nombre="X" />
                </button>
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Icono nombre={s.icono} />
                </span>
                <Link href={s.href} className="mt-3 block text-base font-medium text-marca-700 hover:underline">
                  {s.titulo}
                </Link>
                <p className="mt-1 text-sm text-slate-600">{s.texto}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-600">
            No quedan sugerencias.{" "}
            {ocultas ? (
              <button type="button" onClick={() => iniciar(async () => restaurarSugerencias())} className="text-marca-700 hover:underline">
                Volver a mostrar todas las tarjetas
              </button>
            ) : null}
          </p>
        )
      ) : null}
    </section>
  );
}

export interface InformeWidget {
  id: string;
  nombre: string;
  tipoGrafico: string;
  resultado: ResultadoInforme;
}

export function TarjetaInformes({ objeto, informes, moneda, app }: { objeto: string; informes: InformeWidget[]; moneda: string; app: string }) {
  const router = useRouter();
  const def = obtenerObjeto(objeto)!;
  const [elegido, setElegido] = useState(informes[0]?.id ?? "");
  const [nuevo, setNuevo] = useState(false);
  const [refrescando, iniciar] = useTransition();
  const informe = informes.find((i) => i.id === elegido);
  const r = informe?.resultado;

  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <IconoObjeto icono={def.icono} color={def.color} tamano="md" />
        <select
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          aria-label={`Seleccionar un informe de ${def.etiquetaPlural.toLowerCase()}`}
        >
          {informes.length === 0 ? <option value="">No hay informes de {def.etiquetaPlural.toLowerCase()}</option> : null}
          {informes.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}
            </option>
          ))}
        </select>
        {def.acciones.nuevo ? (
          <Boton tamano="sm" onClick={() => setNuevo(true)}>
            {def.genero === "f" ? "Nueva" : "Nuevo"}
          </Boton>
        ) : null}
        <button type="button" onClick={() => iniciar(() => router.refresh())} className={clasesBoton("secundario", "sm")} aria-label="Actualizar" title="Actualizar">
          <Icono nombre="RefreshCw" className={refrescando ? "size-4 animate-spin" : "size-4"} />
        </button>
      </header>
      <div className="flex-1 p-4">
        {r && r.registros > 0 ? (
          <>
            <p className="text-xs text-slate-500">{r.etiquetaValor}</p>
            <p className="text-2xl font-semibold text-slate-800">{r.esMoneda ? formatoMoneda(r.total, moneda) : formatoNumero(r.total)}</p>
            <Grafico datos={r.grupos.map((g) => ({ etiqueta: g.etiqueta, valor: g.valor }))} tipo={informe.tipoGrafico === "tabla" ? "barras" : informe.tipoGrafico} esMoneda={r.esMoneda} moneda={moneda} alto={220} />
          </>
        ) : (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <span className="inline-flex size-16 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Icono nombre={def.icono} className="size-7" />
            </span>
            <p className="mt-3 text-sm text-slate-500">Aún no hay datos para este informe.</p>
          </div>
        )}
      </div>
      {informe ? (
        <Link href={`/${app}/p/analisis?informe=${informe.id}`} className="border-t border-slate-100 px-4 py-2 text-center text-sm text-marca-700 hover:bg-slate-50">
          Ver informe: {informe.nombre}
        </Link>
      ) : null}
      {nuevo ? <FormularioRegistro objeto={objeto} abierto alCerrar={() => setNuevo(false)} /> : null}
    </section>
  );
}
