"use client";

import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { claseInput } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { activarMarketing } from "../servidor/sistema";
import { FormularioRegistro } from "../ui/formulario-registro";

export function BotonActivarMarketing({ activado }: { activado: boolean }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <Boton
      variante={activado ? "secundario" : "primario"}
      cargando={pendiente}
      onClick={() =>
        iniciar(async () => {
          const r = await activarMarketing(!activado);
          avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
        })
      }
    >
      {activado ? "Desactivar marketing" : "Activar marketing ➔"}
    </Boton>
  );
}

export function BotonNuevaConexion({ app, conector, etiqueta, principal }: { app: string; conector: string; etiqueta: string; principal?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <Boton tamano={principal ? "md" : "sm"} variante={principal ? "primario" : "secundario"} icono={principal ? "Plus" : undefined} onClick={() => setAbierto(true)}>
        {principal ? etiqueta : "Conectar"}
      </Boton>
      {abierto ? (
        <FormularioRegistro
          objeto="conexiones"
          app={app}
          abierto
          irAlRegistro={false}
          valoresIniciales={{ conector, nombre: principal ? "" : etiqueta }}
          alCerrar={() => setAbierto(false)}
        />
      ) : null}
    </>
  );
}

interface AccionCatalogo {
  tipo: string;
  etiqueta: string;
  categoria: string;
  descripcion: string;
}

export function FiltroAcciones({ acciones }: { acciones: AccionCatalogo[] }) {
  const [categoria, setCategoria] = useState("");
  const categorias = [...new Set(acciones.map((a) => a.categoria))];
  const visibles = acciones.filter((a) => !categoria || a.categoria === categoria);
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-3">
        <label htmlFor="tipo-accion" className="text-sm text-slate-600">
          Tipo de acción
        </label>
        <select id="tipo-accion" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${claseInput} w-56`}>
          <option value="">Todos los tipos</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-slate-500">{visibles.length} elementos</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-600">
          <tr>
            <th className="px-5 py-2">Etiqueta</th>
            <th className="px-5 py-2">Tipo</th>
            <th className="px-5 py-2">Descripción</th>
            <th className="px-5 py-2">Nombre</th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((a) => (
            <tr key={a.tipo} className="border-t border-slate-100">
              <td className="px-5 py-2 font-medium text-slate-800">{a.etiqueta}</td>
              <td className="px-5 py-2 text-slate-600">{a.categoria}</td>
              <td className="px-5 py-2 text-slate-600">{a.descripcion}</td>
              <td className="px-5 py-2 font-mono text-xs text-slate-500">{a.tipo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
