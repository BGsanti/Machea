"use client";

import Papa from "papaparse";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { claseInput } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { Modal } from "@/ui/modal";
import { obtenerObjeto } from "../../objetos";
import { importarRegistros, type ResultadoImportacion } from "../../servidor/acciones";
import { camposFormulario } from "../../validacion";

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function ImportarCsv({ objeto, alCerrar }: { objeto: string; alCerrar: () => void }) {
  const def = obtenerObjeto(objeto)!;
  const campos = camposFormulario(def).filter((c) => c.tipo !== "polimorfico");
  const [cabeceras, setCabeceras] = useState<string[]>([]);
  const [filas, setFilas] = useState<Record<string, string>[]>([]);
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [pendiente, iniciar] = useTransition();

  const leerArchivo = (archivo: File) => {
    Papa.parse<Record<string, string>>(archivo, {
      header: true,
      skipEmptyLines: true,
      complete: (r) => {
        const cab = r.meta.fields ?? [];
        setCabeceras(cab);
        setFilas(r.data);
        setResultado(null);
        // Asocia automáticamente columnas cuyo nombre coincide con la etiqueta o el nombre del campo.
        const auto: Record<string, string> = {};
        for (const c of campos) {
          const coincide = cab.find((h) => [normalizar(c.etiqueta), normalizar(c.nombre)].includes(normalizar(h)));
          if (coincide) auto[c.nombre] = coincide;
        }
        setMapa(auto);
      },
      error: () => avisar("No se pudo leer el archivo.", "error"),
    });
  };

  const importar = () =>
    iniciar(async () => {
      const convertidas = filas.map((f) => Object.fromEntries(Object.entries(mapa).filter(([, h]) => h).map(([campo, h]) => [campo, f[h] ?? ""])));
      const r = await importarRegistros(objeto, convertidas);
      setResultado(r);
      avisar(r.mensaje ?? "", r.creados > 0 ? "exito" : "error");
    });

  const faltanRequeridos = campos.filter((c) => c.requerido && !mapa[c.nombre]);

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Importar ${def.etiquetaPlural.toLowerCase()}`}
      ancho="lg"
      pie={
        <>
          <Boton onClick={alCerrar}>{resultado ? "Cerrar" : "Cancelar"}</Boton>
          {!resultado ? (
            <Boton variante="primario" icono="Upload" cargando={pendiente} disabled={filas.length === 0 || faltanRequeridos.length > 0} onClick={importar}>
              Importar {filas.length || ""} registro{filas.length === 1 ? "" : "s"}
            </Boton>
          ) : null}
        </>
      }
    >
      {resultado ? (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{resultado.creados}</strong> registros importados.{" "}
            {resultado.fallidos.length ? <span className="text-rose-700">{resultado.fallidos.length} con errores:</span> : null}
          </p>
          {resultado.fallidos.length ? (
            <ul className="max-h-60 overflow-auto rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              {resultado.fallidos.map((f) => (
                <li key={f.fila}>
                  Fila {f.fila}: {f.mensaje}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-6 py-8 text-center hover:border-marca-600 hover:bg-marca-50/40">
            <Icono nombre="Upload" className="size-8 text-slate-400" />
            <span className="mt-2 text-sm font-medium text-slate-700">Elija un archivo CSV</span>
            <span className="text-xs text-slate-500">La primera fila debe tener los nombres de las columnas. Las búsquedas aceptan el nombre del registro.</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])} />
          </label>
          {cabeceras.length ? (
            <>
              <p className="text-sm text-slate-700">
                {filas.length} filas leídas. Asocie cada campo con una columna del archivo:
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {campos.map((c) => (
                  <label key={c.nombre} className="text-xs text-slate-600">
                    {c.requerido ? <span className="text-rose-600">* </span> : null}
                    {c.etiqueta}
                    <select
                      value={mapa[c.nombre] ?? ""}
                      onChange={(e) => setMapa({ ...mapa, [c.nombre]: e.target.value })}
                      className={`${claseInput} mt-1`}
                    >
                      <option value="">(no importar)</option>
                      {cabeceras.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {faltanRequeridos.length ? (
                <p className="text-xs text-rose-700">Faltan campos obligatorios: {faltanRequeridos.map((c) => c.etiqueta).join(", ")}.</p>
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
