import Link from "next/link";
import type { Usuario } from "@/auth/sesion";
import { Icono, IconoObjeto } from "@/ui/icono";
import { etiquetaOpcion, formatoFecha } from "../formato";
import { campoDe, obtenerObjeto } from "../objetos";
import { listar } from "../servidor/repositorio";
import type { Condicion } from "../tipos";
import { BotonesTextosRapidos } from "./textos-rapidos-cliente";

export async function PaginaTextosRapidos({
  usuario,
  app,
  parametros,
}: {
  usuario: Usuario;
  app: string;
  parametros: Record<string, string | string[] | undefined>;
}) {
  const base = `/${app}/p/textos-rapidos`;
  const def = obtenerObjeto("textos-rapidos")!;
  const filtro = typeof parametros.filtro === "string" ? parametros.filtro : "recientes";
  const carpeta = typeof parametros.carpeta === "string" ? parametros.carpeta : undefined;
  const q = typeof parametros.q === "string" ? parametros.q : "";

  const condiciones: Condicion[] = [];
  if (carpeta) condiciones.push({ campo: "carpetaId", operador: "igual", valor: carpeta });
  if (filtro === "favoritos") condiciones.push({ campo: "favorito", operador: "verdadero" });
  const vista = carpeta || filtro === "todos" || filtro === "favoritos" ? "todos" : filtro === "mios" ? "mios" : "recientes";
  const [datos, carpetas] = await Promise.all([
    listar("textos-rapidos", { usuarioId: usuario.id, vista, q, filtros: condiciones, porPagina: 100 }),
    listar("carpetas-texto", { usuarioId: usuario.id, vista: "todos", porPagina: 100 }),
  ]);
  const categoria = campoDe(def, "categoria");
  const titulo = carpeta
    ? (carpetas.filas.find((c) => c.id === carpeta)?.nombre as string | undefined) ?? "Carpeta"
    : { recientes: "Reciente", todos: "Todo el texto rápido", mios: "Creado por mí", favoritos: "Favoritos" }[filtro] ?? "Reciente";

  const enlace = (id: string, etiqueta: string, activo: boolean, href: string) => (
    <Link
      key={id}
      href={href}
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${activo ? "bg-marca-50 font-semibold text-marca-800" : "text-slate-700 hover:bg-slate-50"}`}
    >
      {etiqueta}
    </Link>
  );

  return (
    <div className="flex gap-4">
      <aside className="w-60 shrink-0 space-y-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div>
          <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Textos rápidos</p>
          {enlace("recientes", "Reciente", filtro === "recientes" && !carpeta, base)}
          {enlace("todos", "Todo el texto rápido", filtro === "todos" && !carpeta, `${base}?filtro=todos`)}
        </div>
        <div>
          <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Carpetas</p>
          {enlace("mios", "Creado por mí", filtro === "mios" && !carpeta, `${base}?filtro=mios`)}
          {carpetas.filas.map((c) => enlace(c.id, String(c.nombre), carpeta === c.id, `${base}?carpeta=${c.id}`))}
        </div>
        <div>
          <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Favoritos</p>
          {enlace("favoritos", "Todos los favoritos", filtro === "favoritos", `${base}?filtro=favoritos`)}
        </div>
      </aside>
      <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <IconoObjeto icono={def.icono} color={def.color} tamano="lg" />
          <div>
            <p className="text-xs text-slate-500">Textos rápidos</p>
            <h1 className="text-xl font-semibold text-slate-800">{titulo}</h1>
            <p className="text-xs text-slate-500">{datos.total} elementos</p>
          </div>
          <form className="ml-auto" action={base}>
            {carpeta ? <input type="hidden" name="carpeta" value={carpeta} /> : null}
            {filtro !== "recientes" ? <input type="hidden" name="filtro" value={filtro} /> : null}
            <label className="relative block">
              <span className="sr-only">Buscar texto rápido</span>
              <Icono nombre="Search" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Buscar texto rápido..."
                className="h-9 w-64 rounded-md border border-slate-300 pr-2 pl-8 text-sm focus:border-marca-600 focus:outline-none"
              />
            </label>
          </form>
          <BotonesTextosRapidos app={app} carpeta={carpeta ? { id: carpeta, nombre: titulo } : null} />
        </header>
        {datos.filas.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-medium text-slate-700">{filtro === "recientes" && !q ? "No ha usado textos rápidos recientemente." : "No hay textos rápidos aquí."}</p>
            <p className="mt-1 text-sm text-slate-500">Cree respuestas listas para usar en correos, chat y teléfono.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {datos.filas.map((t) => (
              <li key={t.id} className="px-5 py-3">
                <div className="flex items-center gap-2">
                  <Link href={`/${app}/o/textos-rapidos/${t.id}`} className="font-medium text-marca-700 hover:underline">
                    {String(t.nombre)}
                  </Link>
                  {t.favorito ? <Icono nombre="Star" className="size-3.5 fill-current text-amber-500" /> : null}
                  <span className="ml-auto text-xs text-slate-400">
                    {etiquetaOpcion(categoria, t.categoria)} · {formatoFecha(t.actualizadoEn)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{String(t.mensaje)}</p>
                {Array.isArray(t.canales) && t.canales.length ? <p className="mt-1 text-xs text-slate-400">Canales: {t.canales.join(", ")}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
