import type { Metadata } from "next";
import Link from "next/link";
import { requerirUsuario } from "@/auth/sesion";
import { appDeObjeto } from "@/crm/apps";
import { nombreVisible } from "@/crm/formato";
import { obtenerObjeto } from "@/crm/objetos";
import { listar } from "@/crm/servidor/repositorio";
import { IconoObjeto } from "@/ui/icono";

export const metadata: Metadata = { title: "Resultados de búsqueda" };

const buscables = [
  "cuentas",
  "contactos",
  "candidatos",
  "oportunidades",
  "casos",
  "productos",
  "tareas",
  "eventos",
  "campanas",
  "articulos",
  "textos-rapidos",
  "videollamadas",
  "facturas",
];

export default async function Buscar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [parametros, usuario] = await Promise.all([searchParams, requerirUsuario()]);
  const q = typeof parametros.q === "string" ? parametros.q.trim().slice(0, 100) : "";
  const resultados = q
    ? (
        await Promise.all(
          buscables.map(async (objeto) => ({
            objeto,
            datos: await listar(objeto, { usuarioId: usuario.id, vista: "__sin_vista", q, porPagina: 5 }),
          })),
        )
      ).filter((r) => r.datos.total > 0)
    : [];
  const total = resultados.reduce((s, r) => s + r.datos.total, 0);

  return (
    <main className="desplazable min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-xs text-slate-500">Resultados de búsqueda</p>
          <h1 className="text-xl font-semibold text-slate-800">{q ? `«${q}»` : "Escriba algo en el buscador"}</h1>
          {q ? <p className="text-sm text-slate-500">{total} resultado{total === 1 ? "" : "s"}</p> : null}
        </div>
        {q && resultados.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
            No se encontró nada. Pruebe con otra palabra o con parte del nombre.
          </p>
        ) : null}
        {resultados.map(({ objeto, datos }) => {
          const def = obtenerObjeto(objeto)!;
          const app = appDeObjeto(objeto);
          return (
            <section key={objeto} className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                <IconoObjeto icono={def.icono} color={def.color} tamano="sm" />
                <h2 className="text-sm font-semibold text-slate-800">
                  {def.etiquetaPlural} ({datos.total})
                </h2>
                {datos.total > datos.filas.length ? (
                  <Link href={`/${app}/o/${objeto}?vista=${def.vistas.some((v) => v.id === "todos") ? "todos" : def.vistaPorDefecto}&q=${encodeURIComponent(q)}`} className="ml-auto text-xs text-marca-700 hover:underline">
                    Ver los {datos.total}
                  </Link>
                ) : null}
              </header>
              <ul className="divide-y divide-slate-100">
                {datos.filas.map((f) => (
                  <li key={f.id}>
                    <Link href={`/${app}/o/${objeto}/${f.id}`} className="block px-4 py-2.5 text-sm text-marca-700 hover:bg-slate-50">
                      {nombreVisible(def, f)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
