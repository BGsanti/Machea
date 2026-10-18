"use client";

import { useState, useTransition } from "react";
import type { Opcion } from "@/crm/tipos";
import { cargarEjemplos, crearUsuario, guardarConfiguracion } from "@/crm/servidor/sistema";
import { avisar } from "@/ui/avisos";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Modal } from "@/ui/modal";

export function FormularioEmpresa({
  admin,
  valores,
  monedas,
}: {
  admin: boolean;
  valores: { nombreEmpresa: string; moneda: string; pais: string; impuestoPorcentaje: number };
  monedas: Opcion[];
}) {
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

export function NuevoUsuario() {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, iniciar] = useTransition();
  return (
    <>
      <Boton tamano="sm" icono="UserPlus" onClick={() => setAbierto(true)}>
        Nuevo usuario
      </Boton>
      <Modal
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        titulo="Nuevo usuario"
        ancho="sm"
        pie={
          <>
            <Boton onClick={() => setAbierto(false)}>Cancelar</Boton>
            <Boton variante="primario" cargando={pendiente} onClick={() => (document.getElementById("form-usuario") as HTMLFormElement | null)?.requestSubmit()}>
              Crear usuario
            </Boton>
          </>
        }
      >
        <form
          id="form-usuario"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const datos = new FormData(e.currentTarget);
            iniciar(async () => {
              const r = await crearUsuario(datos);
              avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
              if (r.ok) setAbierto(false);
            });
          }}
        >
          <div>
            <Etiqueta htmlFor="u-nombre" requerido>
              Nombre
            </Etiqueta>
            <input id="u-nombre" name="nombre" required className={claseInput} />
          </div>
          <div>
            <Etiqueta htmlFor="u-email" requerido>
              Correo electrónico
            </Etiqueta>
            <input id="u-email" name="email" type="email" required className={claseInput} />
          </div>
          <div>
            <Etiqueta htmlFor="u-password" requerido>
              Contraseña inicial
            </Etiqueta>
            <input id="u-password" name="password" type="password" minLength={8} required autoComplete="new-password" className={claseInput} />
            <p className="mt-1 text-xs text-slate-500">Compártala por un canal seguro. Al menos 8 caracteres.</p>
          </div>
          <div>
            <Etiqueta htmlFor="u-rol">Rol</Etiqueta>
            <select id="u-rol" name="rol" defaultValue="usuario" className={claseInput}>
              <option value="usuario">Usuario</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function DatosEjemplo() {
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-sm text-slate-600">
        Carga cuentas, contactos, candidatos, oportunidades con productos, casos, eventos, tareas, artículos, una campaña y un flujo de ejemplo. Úselo para explorar el CRM; si lo pulsa dos veces, los datos se duplican.
      </p>
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
