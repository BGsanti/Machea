"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cambiarEstadoFormulario, crearFormulario, eliminarFormulario } from "@/crm/formularios/servidor";
import { PLANTILLAS, type PlantillaId } from "@/crm/formularios/plantillas";
import { ESTADOS_FORMULARIO, rutaPublica, type EstadoFormulario } from "@/crm/formularios/tipos";
import { avisar } from "@/ui/avisos";
import { Insignia } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";
import { Modal } from "@/ui/modal";

interface Fila {
  id: string;
  nombre: string;
  slug: string;
  estado: string;
  actualizadoEn: string;
  envios: number;
}

const colorEstado: Record<string, string> = {
  activo: "bg-emerald-100 text-emerald-800",
  pausado: "bg-amber-100 text-amber-800",
  borrador: "bg-slate-100 text-slate-700",
};

export function urlPublica(slug: string): string {
  return `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${rutaPublica(slug)}`;
}

export function ListaFormularios({ formularios, plantillaInicial, perfil }: { formularios: Fila[]; plantillaInicial: string; perfil: string }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState(false);
  const [elegida, setElegida] = useState<PlantillaId>(plantillaInicial as PlantillaId);
  const [pendiente, iniciar] = useTransition();

  const crear = () =>
    iniciar(async () => {
      const r = await crearFormulario(elegida);
      if (r.ok && r.id) router.push(`/formularios/${r.id}`);
      else avisar(r.mensaje ?? "No se pudo crear el formulario.", "error");
    });

  const cambiar = (f: Fila, estado: EstadoFormulario) =>
    iniciar(async () => {
      const r = await cambiarEstadoFormulario(f.id, estado);
      avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
    });

  const orden: PlantillaId[] = [plantillaInicial as PlantillaId, ...(Object.keys(PLANTILLAS) as PlantillaId[]).filter((p) => p !== plantillaInicial)];

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Formularios</h1>
          <p className="mt-0.5 text-sm text-slate-500">Cree el formulario de su empresa, póngalo en su sitio y los leads llegan directo a este panel.</p>
        </div>
        <Boton variante="primario" icono="Plus" onClick={() => setNuevo(true)}>
          Nuevo formulario
        </Boton>
      </header>

      {formularios.length === 0 ? (
        <section className="animate-subir rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-marca-50 text-marca-700">
            <Icono nombre="ClipboardList" className="size-7" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-800">Todavía no tiene formularios</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Arranque con una plantilla pensada para {perfil === "machea" ? "vender Machea" : perfil === "constructora" ? "una constructora" : "una inmobiliaria"}: ya trae las preguntas que usa un asesor, su marca y la autorización de datos.
          </p>
          <Boton className="mt-5" variante="primario" icono="Plus" onClick={() => setNuevo(true)}>
            Crear mi primer formulario
          </Boton>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {formularios.map((f) => (
              <li key={f.id} className="animate-aparecer flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icono nombre="ClipboardList" className="size-4.5" />
                </span>
                <Link href={`/formularios/${f.id}`} className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm font-semibold text-slate-800 hover:text-marca-700">{f.nombre}</span>
                  <span className="block text-xs text-slate-500">
                    {f.envios} {f.envios === 1 ? "respuesta" : "respuestas"} · editado {new Date(f.actualizadoEn).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                  </span>
                </Link>
                <Insignia color={colorEstado[f.estado]}>{ESTADOS_FORMULARIO[f.estado as EstadoFormulario] ?? f.estado}</Insignia>
                <span className="flex items-center gap-1.5">
                  {f.estado === "activo" ? (
                    <Boton
                      tamano="sm"
                      icono="Link2"
                      onClick={async () => {
                        await navigator.clipboard.writeText(urlPublica(f.slug)).catch(() => undefined);
                        avisar("Enlace copiado.");
                      }}
                    >
                      Copiar enlace
                    </Boton>
                  ) : null}
                  {f.estado === "activo" ? (
                    <Boton tamano="sm" icono="Pause" cargando={pendiente} onClick={() => cambiar(f, "pausado")}>
                      Pausar
                    </Boton>
                  ) : (
                    <Boton tamano="sm" icono="Play" cargando={pendiente} onClick={() => cambiar(f, "activo")}>
                      Publicar
                    </Boton>
                  )}
                  <Link href={`/formularios/${f.id}`} className={clsx("inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:border-marca-500 hover:text-marca-700")}>
                    <Icono nombre="Pencil" className="size-3.5" /> Editar
                  </Link>
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Eliminar ${f.nombre}`}
                    title="Eliminar"
                    onClick={() => {
                      if (!confirm(`¿Eliminar «${f.nombre}»? El enlace dejará de funcionar. Los leads que llegaron por él se quedan.`)) return;
                      iniciar(async () => {
                        const r = await eliminarFormulario(f.id);
                        avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
                      });
                    }}
                  >
                    <Icono nombre="Trash2" className="size-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        abierto={nuevo}
        alCerrar={() => setNuevo(false)}
        titulo="¿Con qué plantilla empezamos?"
        ancho="md"
        pie={
          <>
            <Boton onClick={() => setNuevo(false)}>Cancelar</Boton>
            <Boton variante="primario" cargando={pendiente} onClick={crear}>
              Crear formulario
            </Boton>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-600">Después puede cambiar todo: preguntas, colores, textos y la autorización de datos.</p>
        <ul className="space-y-2">
          {orden.map((id) => (
            <li key={id}>
              <label
                className={clsx(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-[border-color,background-color] duration-150",
                  elegida === id ? "border-marca-500 bg-marca-50" : "border-slate-200 hover:border-slate-300",
                )}
              >
                <input type="radio" name="plantilla" checked={elegida === id} onChange={() => setElegida(id)} className="mt-1 size-4 accent-marca-700" />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">
                    {PLANTILLAS[id].etiqueta}
                    {id === plantillaInicial ? <span className="ml-2 rounded-full bg-marca-100 px-2 py-0.5 text-[11px] font-medium text-marca-800">Recomendada</span> : null}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-500">{PLANTILLAS[id].descripcion}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
