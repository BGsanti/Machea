import type { EsquemaIncompleto } from "@/db/esquema-listo";
import { LogoMacheaCompleto } from "./logo-machea";

/** Lo que ve cualquier persona cuando el código nuevo llegó antes que la migración de la base de datos. */
export function Actualizando({ error }: { error: EsquemaIncompleto }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-riel to-riel-claro px-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center text-white">
          <LogoMacheaCompleto className="h-9 w-auto" />
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-slate-800">Estamos actualizando Machea</h1>
          <p className="mt-2 text-sm text-slate-600">Vuelve a intentar en unos minutos. Tus datos están a salvo y no se perdió nada.</p>
          <details className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">Para quien administra el sistema</summary>
            <p className="mt-2">{error.message}</p>
            <p className="mt-2">Pasos: en <code>crm/</code> correr <code>pnpm db:migrar</code> con la cadena de administrador, y en el SQL Editor de Supabase <code>select crm.cerrar_tablas();</code>. Guía: docs/puesta-en-produccion.md.</p>
          </details>
        </div>
      </div>
    </main>
  );
}
