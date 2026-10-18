"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { Modal } from "@/ui/modal";
import { obtenerObjeto } from "../../objetos";
import { guardarNavegacion } from "../../servidor/sistema";

export interface PestanaVisible {
  clave: string;
  etiqueta: string;
  href: string;
  objeto?: string;
  recientes: { id: string; nombre: string }[];
}

export function CabeceraApp({
  app,
  etiqueta,
  pestanas,
  disponibles,
}: {
  app: string;
  etiqueta: string;
  pestanas: PestanaVisible[];
  disponibles: { clave: string; etiqueta: string }[];
}) {
  const ruta = usePathname();
  const [menu, setMenu] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);

  // Un objeto sin pestaña propia en esta app se muestra como pestaña temporal.
  const objetoActual = ruta.match(new RegExp(`^/${app}/o/([^/]+)`))?.[1];
  const temporal =
    objetoActual && !pestanas.some((p) => p.objeto === objetoActual)
      ? { clave: `o:${objetoActual}`, etiqueta: obtenerObjeto(objetoActual)?.etiquetaPlural ?? objetoActual, href: `/${app}/o/${objetoActual}` }
      : null;
  const activa = (href: string) => ruta === href || ruta.startsWith(`${href}/`);

  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-5">
      <div className="flex h-12 items-center gap-6">
        <p className="shrink-0 text-lg font-light text-slate-800">{etiqueta}</p>
        <nav aria-label={`Navegación de ${etiqueta}`} className="flex h-full min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
          {pestanas.map((p) => (
            <div key={p.clave} className="relative flex items-stretch">
              <Link
                href={p.href}
                aria-current={activa(p.href) ? "page" : undefined}
                className={clsx(
                  "flex items-center border-b-[3px] px-3 text-sm whitespace-nowrap",
                  activa(p.href) ? "border-marca-600 font-semibold text-marca-800" : "border-transparent text-slate-700 hover:border-slate-300",
                )}
              >
                {p.etiqueta}
              </Link>
              {p.objeto ? (
                <button
                  type="button"
                  onClick={() => setMenu(menu === p.clave ? null : p.clave)}
                  className="flex items-center px-0.5 text-slate-400 hover:text-slate-700"
                  aria-label={`Recientes de ${p.etiqueta}`}
                >
                  <Icono nombre="ChevronDown" className="size-3.5" />
                </button>
              ) : null}
              {menu === p.clave ? (
                <>
                  <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Cerrar" onClick={() => setMenu(null)} />
                  <div className="absolute top-full left-0 z-40 mt-1 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                    <Link href={p.href} onClick={() => setMenu(null)} className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-sm text-marca-700 hover:bg-slate-50">
                      <Icono nombre="LayoutList" /> Ver lista de {p.etiqueta.toLowerCase()}
                    </Link>
                    <p className="px-4 pt-2.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Elementos recientes</p>
                    {p.recientes.length === 0 ? (
                      <p className="px-4 pb-3 text-sm text-slate-500">Aún no ha visto ninguno.</p>
                    ) : (
                      <ul className="pb-1">
                        {p.recientes.map((r) => (
                          <li key={r.id}>
                            <Link href={`${p.href}/${r.id}`} onClick={() => setMenu(null)} className="block truncate px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                              {r.nombre}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ))}
          {temporal ? (
            <Link
              href={temporal.href}
              className="flex items-center border-b-[3px] border-marca-600 px-3 text-sm font-semibold whitespace-nowrap text-marca-800 italic"
            >
              * {temporal.etiqueta}
            </Link>
          ) : null}
        </nav>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-marca-700"
          aria-label="Modificar elementos de navegación"
          title="Modificar elementos de navegación"
        >
          <Icono nombre="Pencil" />
        </button>
      </div>
      {editando ? (
        <EditorNavegacion
          app={app}
          etiqueta={etiqueta}
          actuales={pestanas.map((p) => p.clave)}
          disponibles={disponibles}
          alCerrar={() => setEditando(false)}
        />
      ) : null}
    </div>
  );
}

function EditorNavegacion({
  app,
  etiqueta,
  actuales,
  disponibles,
  alCerrar,
}: {
  app: string;
  etiqueta: string;
  actuales: string[];
  disponibles: { clave: string; etiqueta: string }[];
  alCerrar: () => void;
}) {
  const [orden, setOrden] = useState<string[]>(actuales);
  const [guardando, iniciar] = useTransition();
  const nombre = (clave: string) => disponibles.find((d) => d.clave === clave)?.etiqueta ?? clave;
  const ocultas = disponibles.filter((d) => !orden.includes(d.clave));
  const mover = (i: number, delta: number) => {
    const copia = [...orden];
    const [x] = copia.splice(i, 1);
    if (x) copia.splice(i + delta, 0, x);
    setOrden(copia);
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Modificar la navegación de ${etiqueta}`}
      ancho="sm"
      pie={
        <>
          <Boton onClick={alCerrar}>Cancelar</Boton>
          <Boton
            variante="primario"
            cargando={guardando}
            disabled={orden.length === 0}
            onClick={() =>
              iniciar(async () => {
                const r = await guardarNavegacion(app, orden);
                avisar(r.mensaje ?? "Guardado.");
                alCerrar();
              })
            }
          >
            Guardar
          </Boton>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600">Ordene las pestañas o quite las que no usa. Este cambio solo le afecta a usted.</p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {orden.map((clave, i) => (
          <li key={clave} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="flex-1">{nombre(clave)}</span>
            <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Subir">
              <Icono nombre="ArrowUp" />
            </button>
            <button type="button" disabled={i === orden.length - 1} onClick={() => mover(i, 1)} className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" aria-label="Bajar">
              <Icono nombre="ArrowDown" />
            </button>
            <button type="button" onClick={() => setOrden(orden.filter((c) => c !== clave))} className="rounded p-1 text-rose-600 hover:bg-rose-50" aria-label="Quitar">
              <Icono nombre="X" />
            </button>
          </li>
        ))}
      </ul>
      {ocultas.length > 0 ? (
        <>
          <p className="mt-4 mb-2 text-xs font-semibold text-slate-500 uppercase">Agregar más elementos</p>
          <div className="flex flex-wrap gap-2">
            {ocultas.map((d) => (
              <Boton key={d.clave} tamano="sm" icono="Plus" onClick={() => setOrden([...orden, d.clave])}>
                {d.etiqueta}
              </Boton>
            ))}
          </div>
        </>
      ) : null}
    </Modal>
  );
}
