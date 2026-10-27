import type { Metadata } from "next";
import { puede } from "@/auth/permisos";
import { ejemplosPermitidos } from "@/auth/servidor";
import { requerirUsuario } from "@/auth/sesion";
import { monedas } from "@/crm/opciones";
import { PERFILES } from "@/crm/perfiles";
import { empresaEsInterna, listaUsuarios, obtenerConfiguracion } from "@/crm/servidor/consultas";
import { Tarjeta } from "@/ui/basicos";
import { EnlaceBoton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { DatosEjemplo, FormularioEmpresa } from "./cliente";

export const metadata: Metadata = { title: "Configuración" };

export default async function Configuracion() {
  const usuario = await requerirUsuario();
  const [config, usuarios, interna] = await Promise.all([obtenerConfiguracion(), listaUsuarios(), empresaEsInterna()]);
  const admin = puede(usuario.rol, "configurar");

  return (
    <main className="desplazable min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs text-slate-500">Configuración</p>
          <h1 className="text-xl font-semibold text-slate-800">Empresa</h1>
          {!admin ? <p className="mt-1 text-sm text-slate-500">Solo el dueño de la cuenta puede cambiar esta configuración.</p> : null}
        </div>
        <Tarjeta titulo="Empresa" icono={<Icono nombre="Building" className="size-4 text-slate-500" />}>
          <FormularioEmpresa
            admin={admin}
            valores={{ nombreEmpresa: config.nombreEmpresa, moneda: config.moneda, pais: config.pais ?? "", impuestoPorcentaje: config.impuestoPorcentaje, perfil: config.perfil }}
            monedas={monedas}
            perfiles={Object.values(PERFILES)
              .filter((p) => p.id !== "machea" || interna || config.perfil === "machea")
              .map((p) => ({ valor: p.id, etiqueta: p.etiqueta, descripcion: p.descripcion }))}
          />
        </Tarjeta>
        <Tarjeta titulo="Equipo" icono={<Icono nombre="Users" className="size-4 text-slate-500" />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              {usuarios.length} {usuarios.length === 1 ? "persona" : "personas"} con acceso. Invita asesores, cambia roles y define cómo se reparten los leads.
            </p>
            {puede(usuario.rol, "equipo") ? (
              <EnlaceBoton href="/equipo" variante="primario" icono="UserCog">
                Ir a Equipo
              </EnlaceBoton>
            ) : null}
          </div>
        </Tarjeta>
        {admin && ejemplosPermitidos() ? (
          <Tarjeta titulo="Datos de ejemplo" icono={<Icono nombre="Sparkles" className="size-4 text-amber-500" />}>
            <DatosEjemplo />
          </Tarjeta>
        ) : null}
      </div>
    </main>
  );
}
