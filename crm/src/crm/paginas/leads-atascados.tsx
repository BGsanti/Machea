import Link from "next/link";
import { redirect } from "next/navigation";
import type { Usuario } from "@/auth/sesion";
import { CabeceraPagina, EstadoVacio, Tarjeta } from "@/ui/basicos";
import { Icono } from "@/ui/icono";
import { formatoFechaHora } from "../formato";
import { contarAtascados, listarAtascados } from "../servidor/atascados";
import { BotonReintentar } from "./leads-atascados-cliente";

/**
 * Aviso arriba del Inicio del dueño: cuántos leads de Machea no pudieron entrar al CRM. Sin atascados no se pinta
 * nada. Lo decide `PaginaInicio` (solo el dueño de la cuenta), pero la cuenta se hace aquí, con la empresa de la sesión.
 */
export async function AvisoLeadsAtascados({ empresaId, app }: { empresaId: string; app: string }) {
  const n = await contarAtascados(empresaId);
  if (n === 0) return null;
  return (
    <div role="alert" className="animate-subir flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      <span className="animate-alerta inline-flex size-2.5 shrink-0 rounded-full bg-rose-600" aria-hidden />
      <p className="min-w-0 flex-1">
        <strong>
          {n} lead{n === 1 ? "" : "s"}
        </strong>{" "}
        de Machea no {n === 1 ? "pudo" : "pudieron"} entrar al CRM. Nadie {n === 1 ? "lo está" : "los está"} atendiendo.
      </p>
      <Link href={`/${app}/p/leads-atascados`} className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700">
        Ver {n === 1 ? "el lead" : "los leads"}
      </Link>
    </div>
  );
}

/** La lista de leads atascados, con su motivo y el botón para reintentar. Solo el dueño de la cuenta. */
export async function PaginaLeadsAtascados({ usuario, app }: { usuario: Usuario; app: string }) {
  if (usuario.rol !== "admin") redirect("/inicio");
  const leads = await listarAtascados(usuario.empresaId);

  return (
    <div className="space-y-4">
      <CabeceraPagina
        icono={<Icono nombre="TriangleAlert" className="size-6 text-rose-600" />}
        supertitulo="Leads de Machea"
        titulo="Leads atascados"
        acciones={
          <Link href={`/${app}/p/inicio`} className="text-sm text-marca-700 hover:underline">
            Volver al inicio
          </Link>
        }
      >
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Estos leads llegaron de Machea pero no lograron entrar a su lista de leads, así que ningún asesor los ve. Toque «Reintentar» en cada uno. Si vuelve a
          fallar, avise al equipo de Machea.
        </p>
      </CabeceraPagina>

      {leads.length === 0 ? (
        <EstadoVacio titulo="No hay leads atascados" texto="Todos los leads que llegaron de Machea ya están en su lista." icono="CircleCheck" />
      ) : (
        <Tarjeta titulo={`${leads.length} lead${leads.length === 1 ? "" : "s"} sin entrar`} sinRelleno>
          <ul className="divide-y divide-slate-100">
            {leads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-medium text-slate-800">{l.nombre}</p>
                  <p className="text-sm text-slate-500">{l.telefono ?? "Sin teléfono"}</p>
                </div>
                <div className="basis-44 text-sm text-slate-600">
                  <p>{l.origen}</p>
                  <p className="text-xs text-slate-500">Llegó {formatoFechaHora(l.llegoEn)}</p>
                </div>
                <p className="min-w-0 flex-[2] basis-64 text-sm text-slate-700">{l.motivo}</p>
                <BotonReintentar id={l.id} />
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
