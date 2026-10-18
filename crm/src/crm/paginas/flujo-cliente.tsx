"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AccionFlujo, CondicionFlujo, flujos } from "@/db/esquema";
import { avisar } from "@/ui/avisos";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { Boton, clasesBoton } from "@/ui/boton";
import { Icono, IconoObjeto } from "@/ui/icono";
import { obtenerObjeto } from "../objetos";
import { disparadoresFlujo } from "../opciones";
import { eliminarRegistros } from "../servidor/acciones";
import { guardarFlujo, type DatosFlujo } from "../servidor/sistema";
import type { Campo } from "../tipos";

type Flujo = typeof flujos.$inferSelect;

const operadores: { valor: CondicionFlujo["operador"]; etiqueta: string; sinValor?: boolean }[] = [
  { valor: "igual", etiqueta: "es igual a" },
  { valor: "distinto", etiqueta: "no es igual a" },
  { valor: "contiene", etiqueta: "contiene" },
  { valor: "mayor", etiqueta: "mayor que" },
  { valor: "menor", etiqueta: "menor que" },
  { valor: "vacio", etiqueta: "está vacío", sinValor: true },
  { valor: "no_vacio", etiqueta: "no está vacío", sinValor: true },
  { valor: "cambia", etiqueta: "cambia de valor", sinValor: true },
];

const tiposAccion: { valor: AccionFlujo["tipo"]; etiqueta: string; icono: string }[] = [
  { valor: "crear_tarea", etiqueta: "Crear tarea", icono: "ListChecks" },
  { valor: "actualizar_campo", etiqueta: "Actualizar campo", icono: "Pencil" },
  { valor: "notificar", etiqueta: "Enviar notificación", icono: "Bell" },
  { valor: "llamar_webhook", etiqueta: "Llamar a un webhook", icono: "Plug" },
];

function accionVacia(tipo: AccionFlujo["tipo"]): AccionFlujo {
  switch (tipo) {
    case "crear_tarea":
      return { tipo, asunto: "", diasVencimiento: 1, prioridad: "normal" };
    case "actualizar_campo":
      return { tipo, campo: "", valor: "" };
    case "notificar":
      return { tipo, titulo: "", mensaje: "" };
    case "llamar_webhook":
      return { tipo, conexionId: "" };
  }
}

function ValorSegunCampo({ campo, valor, alCambiar }: { campo: Campo | undefined; valor: string; alCambiar: (v: string) => void }) {
  if (campo?.tipo === "lista")
    return (
      <select value={valor} onChange={(e) => alCambiar(e.target.value)} className={claseInput} aria-label="Valor">
        <option value="">Elija...</option>
        {campo.opciones?.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    );
  if (campo?.tipo === "casilla")
    return (
      <select value={valor} onChange={(e) => alCambiar(e.target.value)} className={claseInput} aria-label="Valor">
        <option value="">Elija...</option>
        <option value="true">Verdadero</option>
        <option value="false">Falso</option>
      </select>
    );
  return <input value={valor} onChange={(e) => alCambiar(e.target.value)} className={claseInput} aria-label="Valor" placeholder="Valor" />;
}

export function EditorFlujo({
  app,
  flujo,
  conexiones,
  objetos,
}: {
  app: string;
  flujo: Flujo | null;
  conexiones: { id: string; nombre: string; url: string | null }[];
  objetos: string[];
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(flujo?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(flujo?.descripcion ?? "");
  const [objeto, setObjeto] = useState(flujo?.objeto ?? "candidatos");
  const [disparador, setDisparador] = useState<DatosFlujo["disparador"]>((flujo?.disparador as DatosFlujo["disparador"]) ?? "crear");
  const [activo, setActivo] = useState(flujo?.activo ?? true);
  const [condiciones, setCondiciones] = useState<CondicionFlujo[]>(flujo?.condiciones ?? []);
  const [acciones, setAcciones] = useState<AccionFlujo[]>(flujo?.acciones ?? [accionVacia("crear_tarea")]);
  const [pendiente, iniciar] = useTransition();
  const def = obtenerObjeto(objeto)!;
  const campos = def.campos.filter((c) => !["polimorfico", "listaMultiple", "markdown"].includes(c.tipo));
  const editables = campos.filter((c) => !c.soloLectura && c.tipo !== "autonumero" && c.tipo !== "busqueda");

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarFlujo(flujo?.id ?? null, { nombre, descripcion, objeto, disparador, activo, condiciones, acciones });
      avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
      if (r.ok && r.id && !flujo) router.replace(`/${app}/p/flujo?id=${r.id}`);
      else if (r.ok) router.refresh();
    });

  const cambiarAccion = (i: number, a: AccionFlujo) => setAcciones(acciones.map((x, j) => (j === i ? a : x)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <IconoObjeto icono="Workflow" color="bg-indigo-600" tamano="lg" />
          <div>
            <Link href={`/${app}/o/flujos`} className="text-xs text-marca-700 hover:underline">
              ← Flujos
            </Link>
            <h1 className="text-xl font-semibold text-slate-800">{flujo ? flujo.nombre : "Nuevo flujo"}</h1>
            {flujo ? <p className="text-xs text-slate-500">Versión {flujo.version}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="size-4 accent-marca-700" /> Activo
          </label>
          <Link href={`/${app}/p/supervisar`} className={clasesBoton("secundario")}>
            <Icono nombre="Eye" /> Ejecuciones
          </Link>
          {flujo ? (
            <Boton
              variante="fantasma"
              icono="Trash"
              aria-label="Eliminar flujo"
              onClick={() => {
                if (!confirm("¿Eliminar este flujo?")) return;
                iniciar(async () => {
                  await eliminarRegistros("flujos", [flujo.id]);
                  router.push(`/${app}/o/flujos`);
                });
              }}
            />
          ) : null}
          <Boton variante="primario" cargando={pendiente} onClick={guardar}>
            Guardar
          </Boton>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-3">
        {/* Inicio */}
        <section className="rounded-xl border-2 border-indigo-200 bg-white p-5 shadow-sm">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-700">
            <Icono nombre="Sparkles" /> Inicio
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Etiqueta htmlFor="flujo-nombre" requerido>
                Nombre del flujo
              </Etiqueta>
              <input id="flujo-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className={claseInput} />
            </div>
            <div className="sm:col-span-2">
              <Etiqueta htmlFor="flujo-desc">Descripción</Etiqueta>
              <input id="flujo-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={claseInput} />
            </div>
            <div>
              <Etiqueta htmlFor="flujo-objeto" requerido>
                Objeto
              </Etiqueta>
              <select
                id="flujo-objeto"
                value={objeto}
                onChange={(e) => {
                  setObjeto(e.target.value);
                  setCondiciones([]);
                  setAcciones(acciones.map((a) => (a.tipo === "actualizar_campo" ? { ...a, campo: "", valor: "" } : a)));
                }}
                className={claseInput}
              >
                {objetos.map((o) => (
                  <option key={o} value={o}>
                    {obtenerObjeto(o)?.etiquetaPlural}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Etiqueta htmlFor="flujo-disparador" requerido>
                Se ejecuta
              </Etiqueta>
              <select id="flujo-disparador" value={disparador} onChange={(e) => setDisparador(e.target.value as DatosFlujo["disparador"])} className={claseInput}>
                {disparadoresFlujo.map((d) => (
                  <option key={d.valor} value={d.valor}>
                    {d.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <Conector />

        {/* Condiciones */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700">
              <Icono nombre="Funnel" /> Condiciones {condiciones.length ? "(se deben cumplir todas)" : "(opcional: sin condiciones se ejecuta siempre)"}
            </p>
            <Boton tamano="sm" icono="Plus" onClick={() => setCondiciones([...condiciones, { campo: campos[0]?.nombre ?? "", operador: "igual", valor: "" }])}>
              Agregar condición
            </Boton>
          </div>
          <div className="space-y-2">
            {condiciones.map((c, i) => {
              const op = operadores.find((o) => o.valor === c.operador);
              const cambiar = (parte: Partial<CondicionFlujo>) => setCondiciones(condiciones.map((x, j) => (j === i ? { ...x, ...parte } : x)));
              return (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <select value={c.campo} onChange={(e) => cambiar({ campo: e.target.value, valor: "" })} className={claseInput} aria-label="Campo">
                    {campos.map((f) => (
                      <option key={f.nombre} value={f.nombre}>
                        {f.etiqueta}
                      </option>
                    ))}
                  </select>
                  <select value={c.operador} onChange={(e) => cambiar({ operador: e.target.value as CondicionFlujo["operador"] })} className={claseInput} aria-label="Operador">
                    {operadores.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                  {op?.sinValor ? <span /> : <ValorSegunCampo campo={def.campos.find((f) => f.nombre === c.campo)} valor={c.valor ?? ""} alCambiar={(v) => cambiar({ valor: v })} />}
                  <Boton variante="fantasma" icono="X" aria-label="Quitar condición" onClick={() => setCondiciones(condiciones.filter((_, j) => j !== i))} />
                </div>
              );
            })}
          </div>
        </section>

        <Conector />

        {/* Acciones */}
        {acciones.map((a, i) => (
          <div key={i}>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <select
                  value={a.tipo}
                  onChange={(e) => cambiarAccion(i, accionVacia(e.target.value as AccionFlujo["tipo"]))}
                  className={`${claseInput} w-64 font-semibold`}
                  aria-label="Tipo de acción"
                >
                  {tiposAccion.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.etiqueta}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">Acción {i + 1}</span>
                <Boton variante="fantasma" icono="Trash" className="ml-auto" aria-label="Quitar acción" onClick={() => setAcciones(acciones.filter((_, j) => j !== i))} />
              </div>
              {a.tipo === "crear_tarea" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <Etiqueta requerido>Asunto de la tarea</Etiqueta>
                    <input value={a.asunto} onChange={(e) => cambiarAccion(i, { ...a, asunto: e.target.value })} className={claseInput} />
                  </div>
                  <div>
                    <Etiqueta>Vence en (días)</Etiqueta>
                    <input type="number" min={0} value={a.diasVencimiento ?? 0} onChange={(e) => cambiarAccion(i, { ...a, diasVencimiento: Number(e.target.value) })} className={claseInput} />
                  </div>
                  <div>
                    <Etiqueta>Prioridad</Etiqueta>
                    <select value={a.prioridad ?? "normal"} onChange={(e) => cambiarAccion(i, { ...a, prioridad: e.target.value as "alta" | "normal" | "baja" })} className={claseInput}>
                      <option value="alta">Alta</option>
                      <option value="normal">Normal</option>
                      <option value="baja">Baja</option>
                    </select>
                  </div>
                  <p className="self-end text-xs text-slate-500">Se asigna al propietario del registro.</p>
                </div>
              ) : a.tipo === "actualizar_campo" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Etiqueta requerido>Campo</Etiqueta>
                    <select value={a.campo} onChange={(e) => cambiarAccion(i, { ...a, campo: e.target.value, valor: "" })} className={claseInput}>
                      <option value="">Elija un campo...</option>
                      {editables.map((f) => (
                        <option key={f.nombre} value={f.nombre}>
                          {f.etiqueta}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Etiqueta>Nuevo valor</Etiqueta>
                    <ValorSegunCampo campo={def.campos.find((f) => f.nombre === a.campo)} valor={a.valor} alCambiar={(v) => cambiarAccion(i, { ...a, valor: v })} />
                  </div>
                </div>
              ) : a.tipo === "notificar" ? (
                <div className="grid gap-3">
                  <div>
                    <Etiqueta requerido>Título</Etiqueta>
                    <input value={a.titulo} onChange={(e) => cambiarAccion(i, { ...a, titulo: e.target.value })} className={claseInput} />
                  </div>
                  <div>
                    <Etiqueta>Mensaje</Etiqueta>
                    <input value={a.mensaje ?? ""} onChange={(e) => cambiarAccion(i, { ...a, mensaje: e.target.value })} className={claseInput} />
                  </div>
                  <p className="text-xs text-slate-500">La recibe el propietario del registro en la campana de notificaciones.</p>
                </div>
              ) : (
                <div>
                  <Etiqueta requerido>Conexión</Etiqueta>
                  {conexiones.length ? (
                    <select value={a.conexionId} onChange={(e) => cambiarAccion(i, { ...a, conexionId: e.target.value })} className={claseInput}>
                      <option value="">Elija una conexión...</option>
                      {conexiones.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} {c.url ? `(${c.url})` : "(sin URL)"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-slate-600">
                      No hay conexiones.{" "}
                      <Link href={`/${app}/p/integraciones`} className="text-marca-700 hover:underline">
                        Cree una en Integraciones
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}
            </section>
            <Conector />
          </div>
        ))}
        <div className="flex justify-center">
          <Boton icono="Plus" onClick={() => setAcciones([...acciones, accionVacia("crear_tarea")])}>
            Agregar acción
          </Boton>
        </div>
        <div className="flex justify-center pt-2">
          <span className="rounded-full bg-slate-200 px-4 py-1 text-xs font-medium text-slate-600">Fin</span>
        </div>
      </div>
    </div>
  );
}

function Conector() {
  return (
    <div className="flex justify-center" aria-hidden>
      <span className="h-6 w-0.5 bg-slate-300" />
    </div>
  );
}
