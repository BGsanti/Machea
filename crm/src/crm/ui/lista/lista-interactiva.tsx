"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { EstadoVacio } from "@/ui/basicos";
import { Boton, clasesBoton } from "@/ui/boton";
import { Icono, IconoObjeto } from "@/ui/icono";
import { nombreVisible, type FilaConNombres } from "../../formato";
import { campoDe, obtenerObjeto } from "../../objetos";
import { urlLista, type EstadoLista } from "../../parametros";
import { eliminarRegistros } from "../../servidor/acciones";
import { cambiarEstadoArticulos } from "../../servidor/especiales";
import { FormularioRegistro } from "../formulario-registro";
import { ValorCampo } from "../valor-campo";
import { ModalCambiarPropietario, ModalAgregarCampana, ModalCorreoLista } from "./acciones-masivas";
import { GraficoLista } from "./grafico-lista";
import { ImportarCsv } from "./importar-csv";
import { Kanban } from "./kanban";
import { PanelFiltros } from "./panel-filtros";

type Modal = "nuevo" | "importar" | "propietario" | "campana" | "correo" | { editar: FilaConNombres } | null;

export function ListaInteractiva({
  objeto,
  app,
  estado,
  filas,
  total,
  porPagina,
  ordenActual,
  direccionActual,
  moneda,
  grafico,
  campoGrafico,
  columnas: columnasPropias,
  abrirNuevo = false,
  abrirImportar = false,
  permisos = { eliminar: true, repartir: true, importar: true, escribir: true },
}: {
  objeto: string;
  app: string;
  estado: EstadoLista;
  filas: FilaConNombres[];
  total: number;
  porPagina: number;
  ordenActual: string | null;
  direccionActual: "asc" | "desc";
  moneda: string;
  grafico: { campo: string; etiqueta: string; grupos: { etiqueta: string; total: number; suma: number }[] } | null;
  campoGrafico: string | null;
  /** Columnas distintas de las del objeto (por ejemplo, las de los leads según el tipo de empresa). */
  columnas?: string[];
  abrirNuevo?: boolean;
  abrirImportar?: boolean;
  /** Lo que el rol puede hacer; el servidor lo vuelve a exigir, esto solo evita mostrar botones que fallarían. */
  permisos?: { eliminar: boolean; repartir: boolean; importar: boolean; escribir: boolean };
}) {
  const router = useRouter();
  const def = obtenerObjeto(objeto)!;
  const base = `/${app}/o/${objeto}`;
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [modal, setModal] = useState<Modal>(abrirNuevo ? "nuevo" : abrirImportar ? "importar" : null);
  const [menuVista, setMenuVista] = useState(false);
  const [menuFila, setMenuFila] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const vista = def.vistas.find((v) => v.id === estado.vista);
  const columnas = (columnasPropias ?? def.columnas).map((c) => campoDe(def, c)).filter((c) => c !== undefined);
  const todosMarcados = filas.length > 0 && seleccion.length === filas.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const url = (cambios: Partial<Record<string, string | null>>) => urlLista(base, estado, cambios);
  const nuevoTexto = def.genero === "f" ? "Nueva" : "Nuevo";
  const esFlujo = objeto === "flujos";

  const eliminar = (ids: string[]) => {
    if (!confirm(ids.length === 1 ? "¿Eliminar este registro?" : `¿Eliminar ${ids.length} registros?`)) return;
    iniciar(async () => {
      const r = await eliminarRegistros(objeto, ids);
      avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
      if (r.ok) setSeleccion([]);
    });
  };

  const descripcionOrden = !ordenActual
    ? null
    : ordenActual === def.camposNombre[0] && def.camposNombre.length > 1
      ? "Nombre completo"
      : campoDe(def, ordenActual)?.etiqueta;
  const resumen = [
    `${total} elemento${total === 1 ? "" : "s"}`,
    descripcionOrden ? `Ordenado por ${descripcionOrden}` : vista?.recientes ? "Ordenado por fecha de consulta" : null,
    `Filtrado por ${vista?.etiqueta ?? "todos"}${estado.filtros.length ? ` y ${estado.filtros.length} filtro${estado.filtros.length === 1 ? "" : "s"}` : ""}`,
    estado.q ? `Búsqueda: «${estado.q}»` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="flex flex-col">
      {/* Cabecera */}
      <div className="rounded-t-xl border border-slate-200 bg-white px-5 pt-4 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconoObjeto icono={def.icono} color={def.color} tamano="lg" />
            <div>
              <p className="text-xs text-slate-500">{def.etiquetaPlural}</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuVista(!menuVista)}
                  className="flex items-center gap-1.5 text-xl font-semibold text-slate-800 hover:text-marca-800"
                  aria-haspopup="listbox"
                  aria-expanded={menuVista}
                >
                  {vista?.etiqueta}
                  <Icono nombre="ChevronDown" className="size-4" />
                </button>
                {menuVista ? (
                  <>
                    <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar" onClick={() => setMenuVista(false)} />
                    <ul role="listbox" className="absolute z-40 mt-1 w-72 rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                      <li className="px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Vistas de lista</li>
                      {def.vistas.map((v) => (
                        <li key={v.id} role="option" aria-selected={v.id === estado.vista}>
                          <Link
                            href={urlLista(base, { ...estado, filtros: [], pagina: 1, orden: undefined, direccion: undefined }, { vista: v.id })}
                            onClick={() => setMenuVista(false)}
                            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <Icono nombre="Check" className={v.id === estado.vista ? "size-4 text-marca-700" : "size-4 text-transparent"} />
                            {v.etiqueta}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {seleccion.length > 0 ? (
              <>
                <span className="mr-1 text-sm text-slate-600">{seleccion.length} seleccionado{seleccion.length === 1 ? "" : "s"}</span>
                {def.acciones.enviarCorreo ? (
                  <Boton icono="Mail" onClick={() => setModal("correo")}>
                    Enviar correo electrónico
                  </Boton>
                ) : null}
                {def.acciones.agregarCampana ? (
                  <Boton icono="Megaphone" onClick={() => setModal("campana")}>
                    Agregar a campaña
                  </Boton>
                ) : null}
                {def.acciones.cambiarPropietario && permisos.repartir ? (
                  <Boton icono="UserCog" onClick={() => setModal("propietario")}>
                    Cambiar propietario
                  </Boton>
                ) : null}
                {objeto === "articulos" ? (
                  <>
                    <Boton
                      onClick={() =>
                        iniciar(async () => {
                          const r = await cambiarEstadoArticulos(seleccion, "publicar");
                          avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                          setSeleccion([]);
                        })
                      }
                    >
                      Publicar
                    </Boton>
                    <Boton
                      onClick={() =>
                        iniciar(async () => {
                          const r = await cambiarEstadoArticulos(seleccion, "archivar");
                          avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                          setSeleccion([]);
                        })
                      }
                    >
                      Archivar
                    </Boton>
                  </>
                ) : null}
                {permisos.eliminar ? (
                  <Boton variante="peligro" icono="Trash" cargando={pendiente} onClick={() => eliminar(seleccion)}>
                    Eliminar
                  </Boton>
                ) : null}
              </>
            ) : (
              <>
                {def.acciones.importar && permisos.importar ? (
                  <Boton icono="Upload" onClick={() => setModal("importar")}>
                    Importar
                  </Boton>
                ) : null}
                {objeto === "correos-lista" ? (
                  <Boton variante="primario" icono="Mail" onClick={() => setModal("correo")}>
                    Enviar correo electrónico
                  </Boton>
                ) : null}
                {def.acciones.nuevo && permisos.escribir ? (
                  esFlujo ? (
                    <Link href={`/${app}/p/flujo`} className={clasesBoton("primario")}>
                      <Icono nombre="Plus" /> {nuevoTexto}
                    </Link>
                  ) : (
                    <Boton variante="primario" icono="Plus" onClick={() => setModal("nuevo")}>
                      {nuevoTexto}
                    </Boton>
                  )
                ) : null}
              </>
            )}
          </div>
        </div>

        {/* Barra de herramientas */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">{resumen}</p>
          <div className="flex items-center gap-1.5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = String(new FormData(e.currentTarget).get("q") ?? "");
                router.push(url({ q: q.trim() || null, pagina: null }));
              }}
            >
              <label className="relative block">
                <span className="sr-only">Buscar en esta lista</span>
                <Icono nombre="Search" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  name="q"
                  type="search"
                  defaultValue={estado.q}
                  placeholder="Buscar en esta lista..."
                  className="h-8 w-56 rounded-md border border-slate-300 pr-2 pl-8 text-sm focus:border-marca-600 focus:outline-none focus:ring-2 focus:ring-marca-600/20"
                />
              </label>
            </form>
            {def.campoKanban ? (
              <div className="flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Visualización">
                <Link
                  href={url({ modo: null })}
                  className={clsx("p-1.5", estado.modo === "tabla" ? "bg-marca-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
                  title="Tabla"
                  aria-label="Ver como tabla"
                >
                  <Icono nombre="Table2" />
                </Link>
                <Link
                  href={url({ modo: "kanban", pagina: null })}
                  className={clsx("p-1.5", estado.modo === "kanban" ? "bg-marca-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
                  title="Kanban"
                  aria-label="Ver como Kanban"
                >
                  <Icono nombre="SquareKanban" />
                </Link>
              </div>
            ) : null}
            <button type="button" onClick={() => router.refresh()} className={clasesBoton("secundario", "sm")} title="Actualizar" aria-label="Actualizar">
              <Icono nombre="RefreshCw" />
            </button>
            {campoGrafico ? (
              <Link
                href={url({ graficos: estado.graficos ? null : "1" })}
                className={clasesBoton(estado.graficos ? "primario" : "secundario", "sm")}
                title="Gráficos"
                aria-label="Mostrar gráficos"
              >
                <Icono nombre="ChartPie" />
              </Link>
            ) : null}
            <Link
              href={url({ filtros: estado.filtrosAbiertos ? null : "1" })}
              className={clasesBoton(estado.filtrosAbiertos || estado.filtros.length ? "primario" : "secundario", "sm")}
              title="Filtros"
              aria-label="Mostrar filtros"
            >
              <Icono nombre="Funnel" />
              {estado.filtros.length ? <span>{estado.filtros.length}</span> : null}
            </Link>
          </div>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="flex min-h-[24rem] rounded-b-xl border border-t-0 border-slate-200 bg-white">
        <div className="min-w-0 flex-1">
          {filas.length === 0 ? (
            <EstadoVacio
              titulo={estado.q || estado.filtros.length ? "Sin resultados" : (def.vacio?.titulo ?? "Nada que ver aquí")}
              texto={estado.q || estado.filtros.length ? "Pruebe con otra búsqueda o quite filtros." : (def.vacio?.texto ?? "No hay nada aún en su lista. Pruebe a agregar un nuevo registro.")}
              icono={def.icono}
            >
              {def.acciones.nuevo && permisos.escribir && !estado.q && !estado.filtros.length ? (
                esFlujo ? (
                  <Link href={`/${app}/p/flujo`} className={clasesBoton("primario")}>
                    {def.vacio?.boton ?? nuevoTexto}
                  </Link>
                ) : (
                  <Boton variante="primario" onClick={() => setModal("nuevo")}>
                    {def.vacio?.boton ?? `${nuevoTexto} ${def.etiqueta.toLowerCase()}`}
                  </Boton>
                )
              ) : null}
            </EstadoVacio>
          ) : estado.modo === "kanban" && def.campoKanban ? (
            <Kanban objeto={objeto} app={app} filas={filas} moneda={moneda} />
          ) : (
            <div className="desplazable overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-600">
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={todosMarcados}
                        onChange={() => setSeleccion(todosMarcados ? [] : filas.map((f) => f.id))}
                        aria-label="Seleccionar todo"
                        className="size-4 accent-marca-700"
                      />
                    </th>
                    {columnas.map((c) => {
                      const activa = ordenActual === c.nombre;
                      const siguiente = activa && direccionActual === "asc" ? "desc" : "asc";
                      const etiqueta = c.nombre === def.camposNombre[0] && def.camposNombre.length > 1 ? "Nombre completo" : c.etiqueta;
                      return (
                        <th key={c.nombre} className="px-3 py-2 font-medium" aria-sort={activa ? (direccionActual === "asc" ? "ascending" : "descending") : undefined}>
                          <Link href={url({ orden: c.nombre, dir: siguiente, pagina: null })} className="inline-flex items-center gap-1 hover:text-marca-800">
                            {etiqueta}
                            {activa ? <Icono nombre={direccionActual === "asc" ? "ArrowUp" : "ArrowDown"} className="size-3" /> : null}
                          </Link>
                        </th>
                      );
                    })}
                    <th className="w-12 px-3 py-2">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila, i) => (
                    <tr key={fila.id} className={clsx("border-b border-slate-100 hover:bg-slate-50", seleccion.includes(fila.id) && "bg-marca-50/60")}>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={seleccion.includes(fila.id)}
                            onChange={() => setSeleccion(seleccion.includes(fila.id) ? seleccion.filter((s) => s !== fila.id) : [...seleccion, fila.id])}
                            aria-label={`Seleccionar ${nombreVisible(def, fila)}`}
                            className="size-4 accent-marca-700"
                          />
                          <span className="w-5 text-right text-xs text-slate-400">{(estado.pagina - 1) * porPagina + i + 1}</span>
                        </span>
                      </td>
                      {columnas.map((c, j) => (
                        <td key={c.nombre} className="max-w-xs truncate px-3 py-2 text-slate-700">
                          {j === 0 ? (
                            <Link href={`${base}/${fila.id}`} className="font-medium text-marca-700 hover:underline">
                              {nombreVisible(def, fila)}
                            </Link>
                          ) : (
                            <ValorCampo campo={c} fila={fila} app={app} moneda={moneda} />
                          )}
                        </td>
                      ))}
                      <td className="relative px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setMenuFila(menuFila === fila.id ? null : fila.id)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-200"
                          aria-label="Acciones de la fila"
                        >
                          <Icono nombre="ChevronDown" />
                        </button>
                        {menuFila === fila.id ? (
                          <>
                            <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar" onClick={() => setMenuFila(null)} />
                            <div className="absolute right-3 z-40 mt-1 w-40 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                              {esFlujo ? (
                                <Link href={`/${app}/p/flujo?id=${fila.id}`} className="block px-3 py-1.5 text-sm hover:bg-slate-50">
                                  Modificar
                                </Link>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuFila(null);
                                    setModal({ editar: fila });
                                  }}
                                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                                >
                                  Modificar
                                </button>
                              )}
                              {permisos.eliminar ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuFila(null);
                                    eliminar([fila.id]);
                                  }}
                                  className="block w-full px-3 py-1.5 text-left text-sm text-rose-700 hover:bg-rose-50"
                                >
                                  Eliminar
                                </button>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {paginas > 1 && estado.modo === "tabla" ? (
            <nav className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm" aria-label="Paginación">
              <span className="text-slate-500">
                Página {estado.pagina} de {paginas}
              </span>
              <div className="flex gap-2">
                {estado.pagina > 1 ? (
                  <Link href={url({ pagina: String(estado.pagina - 1) })} className={clasesBoton("secundario", "sm")}>
                    <Icono nombre="ChevronLeft" /> Anterior
                  </Link>
                ) : null}
                {estado.pagina < paginas ? (
                  <Link href={url({ pagina: String(estado.pagina + 1) })} className={clasesBoton("secundario", "sm")}>
                    Siguiente <Icono nombre="ChevronRight" />
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </div>
        {estado.graficos && grafico ? <GraficoLista {...grafico} esMoneda={Boolean(def.campoSumaKanban)} moneda={moneda} /> : null}
        {estado.filtrosAbiertos ? <PanelFiltros objeto={objeto} filtros={estado.filtros} alAplicar={(f) => router.push(url({ f: f.length ? JSON.stringify(f) : null, pagina: null }))} /> : null}
      </div>

      {modal === "nuevo" ? <FormularioRegistro objeto={objeto} app={app} abierto alCerrar={() => setModal(null)} /> : null}
      {modal && typeof modal === "object" ? (
        <FormularioRegistro objeto={objeto} app={app} abierto registro={modal.editar} alCerrar={() => setModal(null)} />
      ) : null}
      {modal === "importar" ? <ImportarCsv objeto={objeto} alCerrar={() => setModal(null)} /> : null}
      {modal === "propietario" ? (
        <ModalCambiarPropietario objeto={objeto} ids={seleccion} alCerrar={() => setModal(null)} alTerminar={() => setSeleccion([])} />
      ) : null}
      {modal === "campana" ? (
        <ModalAgregarCampana objeto={objeto} ids={seleccion} alCerrar={() => setModal(null)} alTerminar={() => setSeleccion([])} />
      ) : null}
      {modal === "correo" ? (
        <ModalCorreoLista
          objeto={objeto === "correos-lista" ? "contactos" : objeto}
          ids={objeto === "correos-lista" ? [] : seleccion}
          alCerrar={() => setModal(null)}
          alTerminar={() => setSeleccion([])}
        />
      ) : null}
    </div>
  );
}
