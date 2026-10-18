import Link from "next/link";
import { notFound } from "next/navigation";
import type { Usuario } from "@/auth/sesion";
import { clasesBoton } from "@/ui/boton";
import { Icono, IconoObjeto } from "@/ui/icono";
import { formatoFecha } from "../formato";
import { obtenerObjeto } from "../objetos";
import { ejecutarInforme, listaInformes, listaPaneles, obtenerConfiguracion, obtenerInforme, obtenerPanel } from "../servidor/consultas";
import { BotonFavorito, BuscadorAnalisis, ConstructorInforme, EditorPanel, VistaInforme, VistaPanel } from "./analisis-cliente";

export const objetosInforme = [
  "candidatos",
  "contactos",
  "cuentas",
  "oportunidades",
  "casos",
  "tareas",
  "eventos",
  "productos",
  "facturas",
  "campanas",
  "articulos",
  "sesiones-mensajeria",
  "videollamadas",
];

type Parametros = Record<string, string | string[] | undefined>;

export async function PaginaAnalisis({ usuario, app, parametros }: { usuario: Usuario; app: string; parametros: Parametros }) {
  const base = `/${app}/p/analisis`;
  const p = (k: string) => (typeof parametros[k] === "string" ? (parametros[k] as string) : undefined);
  const config = await obtenerConfiguracion();

  if (p("informe") === "nuevo" || p("editar")) {
    const actual = p("editar") ? await obtenerInforme(p("editar")!) : null;
    if (p("editar") && !actual) notFound();
    return <ConstructorInforme base={base} objetos={objetosInforme} informe={actual} />;
  }
  if (p("informe")) {
    const informe = await obtenerInforme(p("informe")!);
    if (!informe) notFound();
    const resultado = await ejecutarInforme(informe, usuario.id);
    return <VistaInforme base={base} informe={informe} resultado={resultado} moneda={config.moneda} />;
  }
  if (p("panel") === "nuevo" || p("editarPanel")) {
    const actual = p("editarPanel") ? await obtenerPanel(p("editarPanel")!) : null;
    const informes = await listaInformes();
    return <EditorPanel base={base} panel={actual} informes={informes.map((i) => ({ id: i.id, nombre: i.nombre, objeto: i.objeto }))} />;
  }
  if (p("panel")) {
    const panel = await obtenerPanel(p("panel")!);
    if (!panel) notFound();
    const todos = await listaInformes();
    const elegidos = panel.informes.map((id) => todos.find((i) => i.id === id)).filter((i) => i !== undefined);
    const resultados = await Promise.all(elegidos.map(async (i) => ({ informe: i, resultado: await ejecutarInforme(i, usuario.id) })));
    return <VistaPanel base={base} panel={panel} resultados={resultados} moneda={config.moneda} />;
  }

  const seccion = p("seccion") ?? "inicio";
  const carpeta = p("carpeta");
  const [informes, paneles] = await Promise.all([listaInformes(), listaPaneles()]);
  const elementos = [
    ...informes.map((i) => ({ tipo: "informe" as const, id: i.id, nombre: i.nombre, carpeta: i.carpeta, objeto: i.objeto, favorito: i.favorito, propietarioId: i.propietarioId, actualizadoEn: i.actualizadoEn })),
    ...paneles.map((d) => ({ tipo: "panel" as const, id: d.id, nombre: d.nombre, carpeta: "Paneles", objeto: null, favorito: d.favorito, propietarioId: d.propietarioId, actualizadoEn: d.actualizadoEn })),
  ].sort((a, b) => b.actualizadoEn.getTime() - a.actualizadoEn.getTime());
  const carpetas = [...new Set(informes.map((i) => i.carpeta).filter((c): c is string => Boolean(c)))];
  const visibles = elementos.filter((e) =>
    seccion === "favoritos" ? e.favorito : carpeta ? e.carpeta === carpeta || (carpeta === "Paneles" && e.tipo === "panel") : true,
  );
  const enlace = (e: (typeof elementos)[number]) => (e.tipo === "informe" ? `${base}?informe=${e.id}` : `${base}?panel=${e.id}`);
  const tarjeta = (titulo: string, lista: typeof elementos) => (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
      {lista.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nada por aquí todavía.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {lista.slice(0, 4).map((e) => (
            <li key={e.id} className="flex items-start gap-2">
              <span className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-white ${e.tipo === "panel" ? "bg-indigo-500" : "bg-emerald-600"}`}>
                <Icono nombre={e.tipo === "panel" ? "LayoutGrid" : "ChartPie"} className="size-3.5" />
              </span>
              <div className="min-w-0">
                <Link href={enlace(e)} className="block truncate text-sm text-marca-700 hover:underline">
                  {e.nombre}
                </Link>
                <p className="text-xs text-slate-500">Actualizado el {formatoFecha(e.actualizadoEn)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex gap-4">
      <aside className="w-56 shrink-0 rounded-xl border border-slate-200 bg-white py-3 shadow-sm">
        <p className="px-4 pb-2 text-base font-semibold text-slate-800">Análisis</p>
        {[
          { id: "inicio", etiqueta: "Inicio", icono: "House" },
          { id: "examinar", etiqueta: "Examinar", icono: "LayoutList" },
          { id: "favoritos", etiqueta: "Favoritos", icono: "Star" },
        ].map((s) => (
          <Link
            key={s.id}
            href={`${base}?seccion=${s.id}`}
            className={`flex items-center gap-2 border-l-4 px-4 py-2 text-sm ${seccion === s.id && !carpeta ? "border-marca-600 bg-marca-50 font-semibold text-marca-800" : "border-transparent text-slate-700 hover:bg-slate-50"}`}
          >
            <Icono nombre={s.icono} /> {s.etiqueta}
          </Link>
        ))}
        <p className="mt-4 px-4 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Carpetas</p>
        {[...carpetas, "Paneles"].map((c) => (
          <Link
            key={c}
            href={`${base}?seccion=examinar&carpeta=${encodeURIComponent(c)}`}
            className={`flex items-center gap-2 px-4 py-1.5 text-sm ${carpeta === c ? "font-semibold text-marca-800" : "text-slate-700 hover:bg-slate-50"}`}
          >
            <Icono nombre="Folder" className="size-4 text-slate-400" /> {c}
          </Link>
        ))}
      </aside>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-800">Análisis</h1>
          <div className="ml-auto flex gap-2">
            <Link href={`${base}?informe=nuevo`} className={clasesBoton("primario")}>
              <Icono nombre="Plus" /> Nuevo informe
            </Link>
            <Link href={`${base}?panel=nuevo`} className={clasesBoton("secundario")}>
              <Icono nombre="LayoutGrid" /> Nuevo panel
            </Link>
          </div>
          <BuscadorAnalisis elementos={elementos.map((e) => ({ id: e.id, nombre: e.nombre, href: enlace(e), tipo: e.tipo }))} />
        </div>
        {seccion === "inicio" && !carpeta ? (
          <div className="grid gap-4 lg:grid-cols-3">
            {tarjeta("Actualizados recientemente", elementos)}
            {tarjeta("Favoritos", elementos.filter((e) => e.favorito))}
            {tarjeta("Creados por mí", elementos.filter((e) => e.propietarioId === usuario.id))}
          </div>
        ) : null}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">
            {seccion === "favoritos" ? "Favoritos" : carpeta ? `Carpeta: ${carpeta}` : "Mis análisis"}
          </h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Objeto</th>
                <th className="px-3 py-2">Carpeta</th>
                <th className="px-3 py-2">Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((e) => {
                const d = e.objeto ? obtenerObjeto(e.objeto) : null;
                return (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <BotonFavorito tipo={e.tipo} id={e.id} favorito={e.favorito} />
                    </td>
                    <td className="px-3 py-2">
                      <Link href={enlace(e)} className="font-medium text-marca-700 hover:underline">
                        {e.nombre}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{e.tipo === "informe" ? "Informe" : "Panel"}</td>
                    <td className="px-3 py-2">
                      {d ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-600">
                          <IconoObjeto icono={d.icono} color={d.color} tamano="sm" /> {d.etiquetaPlural}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{e.carpeta}</td>
                    <td className="px-3 py-2 text-slate-500">{formatoFecha(e.actualizadoEn)}</td>
                  </tr>
                );
              })}
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                    No hay elementos en esta sección.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
