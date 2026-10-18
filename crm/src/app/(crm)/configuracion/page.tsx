import type { Metadata } from "next";
import { requerirUsuario } from "@/auth/sesion";
import { formatoFecha } from "@/crm/formato";
import { monedas } from "@/crm/opciones";
import { listaUsuarios, obtenerConfiguracion } from "@/crm/servidor/consultas";
import { Insignia, Tarjeta } from "@/ui/basicos";
import { Icono } from "@/ui/icono";
import { DatosEjemplo, FormularioEmpresa, NuevoUsuario } from "./cliente";

export const metadata: Metadata = { title: "Configuración" };

export default async function Configuracion() {
  const usuario = await requerirUsuario();
  const [config, usuarios] = await Promise.all([obtenerConfiguracion(), listaUsuarios()]);
  const admin = usuario.rol === "admin";

  return (
    <main className="desplazable min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs text-slate-500">Configuración</p>
          <h1 className="text-xl font-semibold text-slate-800">Empresa y usuarios</h1>
          {!admin ? <p className="mt-1 text-sm text-slate-500">Solo un administrador puede cambiar esta configuración.</p> : null}
        </div>
        <Tarjeta titulo="Empresa" icono={<Icono nombre="Building" className="size-4 text-slate-500" />}>
          <FormularioEmpresa
            admin={admin}
            valores={{ nombreEmpresa: config.nombreEmpresa, moneda: config.moneda, pais: config.pais ?? "", impuestoPorcentaje: config.impuestoPorcentaje }}
            monedas={monedas}
          />
        </Tarjeta>
        <Tarjeta titulo={`Usuarios (${usuarios.length})`} icono={<Icono nombre="Users" className="size-4 text-slate-500" />} acciones={admin ? <NuevoUsuario /> : undefined} sinRelleno>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Correo electrónico</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Alta</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {u.nombre} {u.id === usuario.id ? <span className="text-xs text-slate-400">(usted)</span> : null}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{u.email}</td>
                  <td className="px-4 py-2">
                    <Insignia color={u.rol === "admin" ? "bg-marca-100 text-marca-800" : undefined}>{u.rol === "admin" ? "Administrador" : "Usuario"}</Insignia>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{formatoFecha(u.creadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Tarjeta>
        {admin ? (
          <Tarjeta titulo="Datos de ejemplo" icono={<Icono nombre="Sparkles" className="size-4 text-amber-500" />}>
            <DatosEjemplo />
          </Tarjeta>
        ) : null}
      </div>
    </main>
  );
}
