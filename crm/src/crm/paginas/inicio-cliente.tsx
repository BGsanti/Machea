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

export interface PasoInicial {
  id: string;
  titulo: string;
  texto: string;
  href: string;
  icono: string;
  hecho: boolean;
}

/** «Primeros pasos»: lo mínimo para sacarle provecho al panel, con progreso. Se esconde al terminar. */
export function PrimerosPasos({ pasos, esAdmin, sinLeads, oculto }: { pasos: PasoInicial[]; esAdmin: boolean; sinLeads: boolean; oculto: boolean }) {
  const [, iniciar] = useTransition();
  const hechos = pasos.filter((p) => p.hecho).length;
  const porcentaje = Math.round((hechos / pasos.length) * 100);

  if (oculto) {
    return (
      <button type="button" onClick={() => iniciar(async () => restaurarSugerencias())} className="text-sm text-marca-700 hover:underline">
        Mostrar los primeros pasos ({hechos} de {pasos.length})
      </button>
    );
  }

  return (
    <section className="animate-subir rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Primeros pasos</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {hechos} de {pasos.length} listos. Cada paso le deja el panel más útil.
          </p>
        </div>
        <button
          type="button"
          onClick={() => iniciar(async () => ocultarSugerencia("primeros-pasos"))}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Ocultar los primeros pasos"
          title="Ocultar"
        >
          <Icono nombre="X" />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-marca-500 transition-[width] duration-700 ease-out" style={{ width: `${porcentaje}%` }} />
      </div>
      <ul className={`mt-4 grid gap-3 md:grid-cols-2 ${pasos.length >= 5 ? "xl:grid-cols-5" : "xl:grid-cols-4"}`}>
        {pasos.map((p) => (
          <li key={p.id}>
            <Link
              href={p.href}
              className={`group block h-full rounded-xl border p-4 transition-[border-color,background-color,transform] duration-150 hover:-translate-y-0.5 ${
                p.hecho ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-slate-50 hover:border-marca-500"
              }`}
            >
              <span className={`inline-flex size-8 items-center justify-center rounded-full ${p.hecho ? "bg-emerald-100 text-emerald-700" : "bg-marca-100 text-marca-700"}`}>
                <Icono nombre={p.hecho ? "Check" : p.icono} className="size-4" />
              </span>
              <span className={`mt-3 block text-sm font-semibold ${p.hecho ? "text-emerald-800" : "text-slate-800 group-hover:text-marca-700"}`}>{p.titulo}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{p.texto}</span>
            </Link>
          </li>
        ))}
      </ul>
      {esAdmin && sinLeads ? (
        <p className="mt-4 text-sm text-slate-500">
          ¿Quiere ver el panel con datos?{" "}
          <Link href="/configuracion" className="text-marca-700 hover:underline">
            Cargar datos de ejemplo
          </Link>
          .
        </p>
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
