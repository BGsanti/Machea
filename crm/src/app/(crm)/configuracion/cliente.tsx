"use client";

import { useState, useTransition } from "react";
import type { Opcion } from "@/crm/tipos";
import { cargarEjemplos, guardarConfiguracion } from "@/crm/servidor/sistema";
import { avisar } from "@/ui/avisos";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Modal } from "@/ui/modal";

export function FormularioEmpresa({
  admin,
  valores,
  monedas,
  perfiles,
}: {
  admin: boolean;
  valores: { nombreEmpresa: string; moneda: string; pais: string; impuestoPorcentaje: number; perfil: string };
  monedas: Opcion[];
  perfiles: { valor: string; etiqueta: string; descripcion: string }[];
}) {
  const [perfil, setPerfil] = useState(valores.perfil);
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await guardarConfiguracion(datos);
          avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
        });
      }}
    >
      <fieldset disabled={!admin} className="contents">
        <div>
          <Etiqueta htmlFor="nombreEmpresa" requerido>
            Nombre de la empresa
          </Etiqueta>
          <input id="nombreEmpresa" name="nombreEmpresa" defaultValue={valores.nombreEmpresa} className={claseInput} />
        </div>
        <div className="sm:col-span-2">
          <Etiqueta htmlFor="perfil">Tipo de empresa</Etiqueta>
          <select id="perfil" name="perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)} className={claseInput}>
            {perfiles.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.etiqueta}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            {perfiles.find((p) => p.valor === perfil)?.descripcion} Cambia la barra lateral, el catálogo, las columnas de los leads y las plantillas de formulario; sus datos no se tocan.
          </p>
        </div>
        <div>
          <Etiqueta htmlFor="pais">País</Etiqueta>
          <input id="pais" name="pais" defaultValue={valores.pais} className={claseInput} />
        </div>
        <div>
          <Etiqueta htmlFor="moneda">Moneda</Etiqueta>
          <select id="moneda" name="moneda" defaultValue={valores.moneda} className={claseInput}>
            {monedas.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Etiqueta htmlFor="impuestoPorcentaje">Impuesto de las facturas (%)</Etiqueta>
          <input id="impuestoPorcentaje" name="impuestoPorcentaje" type="number" step="0.01" min={0} max={100} defaultValue={valores.impuestoPorcentaje} className={claseInput} />
        </div>
        {admin ? (
          <div className="sm:col-span-2">
            <Boton type="submit" variante="primario" cargando={pendiente}>
              Guardar
            </Boton>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}

export function DatosEjemplo() {
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-sm text-slate-600">
        Carga un catálogo, leads con llamadas de ejemplo (con su conversación), negocios, citas y tareas, según su tipo de empresa. Úselo para explorar el panel o para una demostración; no lo use en una empresa con datos reales.</p>
      <Boton
        icono="Sparkles"
        cargando={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await cargarEjemplos();
            avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
          })
        }
      >
        Cargar datos de ejemplo
      </Boton>
    </div>
  );
}
