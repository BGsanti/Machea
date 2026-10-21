"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { FormularioPublico } from "@/crm/formularios/ui/formulario-publico";
import { BIBLIOTECA } from "@/crm/formularios/plantillas";
import { cambiarEstadoFormulario, guardarFormulario } from "@/crm/formularios/servidor";
import { claseInputFormulario } from "@/crm/formularios/ui/estilos";
import { claveDeEtiqueta, ESTADOS_FORMULARIO, ETIQUETAS_TIPO, MAPEOS, pendientesParaPublicar, rutaPublica, type CampoForm, type ConfigFormulario, type EstadoFormulario, type MapeoCampo, type TipoCampoForm } from "@/crm/formularios/tipos";
import { avisar } from "@/ui/avisos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";

interface Envio {
  id: string;
  creadoEn: string;
  candidatoId: string | null;
  nombre: string;
}

type Pestana = "preguntas" | "diseno" | "textos" | "publicar";

const PESTANAS: { id: Pestana; etiqueta: string; icono: string }[] = [
  { id: "preguntas", etiqueta: "Preguntas", icono: "ListChecks" },
  { id: "diseno", etiqueta: "Diseño", icono: "Palette" },
  { id: "textos", etiqueta: "Textos y datos", icono: "Type" },
  { id: "publicar", etiqueta: "Publicar", icono: "Send" },
];

const COLORES = ["#ff6259", "#2d3b4e", "#0f8a6c", "#2f5a86", "#b45309", "#7c3aed", "#be185d", "#111827"];

const NOMBRES_MAPEO: Record<MapeoCampo, string> = {
  nombreCompleto: "Nombre completo",
  nombre: "Nombre",
  apellidos: "Apellidos",
  telefono: "Teléfono",
  email: "Correo",
  compania: "Empresa",
  cargo: "Cargo",
  ciudad: "Ciudad",
  interes: "Interés (proyecto o inmueble)",
};

const TIPOS_PROPIOS: TipoCampoForm[] = ["texto", "parrafo", "lista", "numero", "casilla", "telefono", "correo"];

/** Lo que no se puede quitar: sin nombre y sin teléfono no hay a quién llamar. */
const esFijo = (c: CampoForm) => c.mapea === "telefono" || c.mapea === "nombreCompleto" || c.mapea === "nombre";

export function EditorFormulario({
  formulario,
  configInicial,
  catalogo,
  envios,
}: {
  formulario: { id: string; nombre: string; slug: string; estado: string };
  configInicial: ConfigFormulario;
  catalogo: string[];
  envios: Envio[];
}) {
  const [nombre, setNombre] = useState(formulario.nombre);
  const [config, setConfig] = useState<ConfigFormulario>(configInicial);
  const [estado, setEstado] = useState(formulario.estado as EstadoFormulario);
  const [guardado, setGuardado] = useState(() => JSON.stringify({ nombre: formulario.nombre, config: configInicial }));
  const [pestana, setPestana] = useState<Pestana>("preguntas");
  const [movil, setMovil] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const actual = useMemo(() => JSON.stringify({ nombre, config }), [nombre, config]);
  const sinGuardar = actual !== guardado;
  const pendientes = pendientesParaPublicar(config);

  useEffect(() => {
    if (!sinGuardar) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [sinGuardar]);

  const guardar = (): Promise<boolean> =>
    new Promise((resolver) =>
      iniciar(async () => {
        const r = await guardarFormulario(formulario.id, nombre, config);
        avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
        if (r.ok) setGuardado(actual);
        resolver(r.ok);
      }),
    );

  const cambiarEstado = (nuevo: EstadoFormulario) =>
    iniciar(async () => {
      if (sinGuardar) {
        const r = await guardarFormulario(formulario.id, nombre, config);
        if (!r.ok) {
          avisar(r.mensaje ?? "No se pudo guardar.", "error");
          return;
        }
        setGuardado(actual);
      }
      const r = await cambiarEstadoFormulario(formulario.id, nuevo);
      avisar(r.mensaje ?? "", r.ok ? "exito" : "error");
      if (r.ok) setEstado(nuevo);
      else if (r.pendientes?.length) setPestana("textos");
    });

  const cambiarCampos = (f: (campos: CampoForm[]) => CampoForm[]) => setConfig((c) => ({ ...c, campos: f(c.campos) }));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Link href="/formularios" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Volver a los formularios" title="Volver">
          <Icono nombre="ChevronLeft" className="size-5" />
        </Link>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={120}
          aria-label="Nombre del formulario"
          className="min-w-0 flex-1 basis-56 rounded-md border border-transparent bg-transparent px-2 py-1 text-lg font-semibold text-slate-800 hover:border-slate-200 focus:border-marca-600 focus:bg-white focus:outline-none"
        />
        <span
          className={clsx(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            estado === "activo" ? "bg-emerald-100 text-emerald-800" : estado === "pausado" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700",
          )}
        >
          {ESTADOS_FORMULARIO[estado]}
        </span>
        {sinGuardar ? <span className="animate-aparecer text-xs text-slate-500">Cambios sin guardar</span> : null}
        <Boton variante={sinGuardar ? "primario" : "secundario"} icono="Check" cargando={pendiente} disabled={!sinGuardar} onClick={() => void guardar()}>
          Guardar
        </Boton>
        {estado === "activo" ? (
          <Boton icono="Pause" cargando={pendiente} onClick={() => cambiarEstado("pausado")}>
            Pausar
          </Boton>
        ) : (
          <Boton variante={sinGuardar ? "secundario" : "primario"} icono="Send" cargando={pendiente} onClick={() => cambiarEstado("activo")}>
            Publicar
          </Boton>
        )}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)]">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3" aria-label="Secciones del formulario">
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPestana(p.id)}
                aria-current={pestana === p.id ? "page" : undefined}
                className={clsx(
                  "flex items-center gap-2 border-b-[3px] px-3 py-3 text-sm whitespace-nowrap transition-colors",
                  pestana === p.id ? "border-marca-600 font-semibold text-marca-800" : "border-transparent text-slate-600 hover:border-slate-300",
                )}
              >
                <Icono nombre={p.icono} className="size-4" />
                {p.etiqueta}
                {p.id === "textos" && pendientes.length > 0 ? <span className="size-2 rounded-full bg-marca-500" title="Falta completar algo" /> : null}
              </button>
            ))}
          </nav>
          <div className="p-5" key={pestana}>
            <div className="animate-subir">
              {pestana === "preguntas" ? <Preguntas config={config} cambiarCampos={cambiarCampos} /> : null}
              {pestana === "diseno" ? <Diseno config={config} setConfig={setConfig} /> : null}
              {pestana === "textos" ? <Textos config={config} setConfig={setConfig} pendientes={pendientes} /> : null}
              {pestana === "publicar" ? <Publicar slug={formulario.slug} estado={estado} pendientes={pendientes} envios={envios} onPublicar={() => cambiarEstado("activo")} cargando={pendiente} /> : null}
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-0">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Así lo ve quien lo llena</p>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
              {[
                { v: false, etiqueta: "Computador", icono: "LayoutGrid" },
                { v: true, etiqueta: "Celular", icono: "PhoneCall" },
              ].map((o) => (
                <button key={o.etiqueta} type="button" onClick={() => setMovil(o.v)} className={clsx("rounded-md px-2.5 py-1 transition-colors", movil === o.v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500")}>
                  {o.etiqueta}
                </button>
              ))}
            </div>
          </div>
          <div className="desplazable max-h-[calc(100vh-14rem)] overflow-y-auto rounded-2xl bg-[#fcfaf8] p-4 ring-1 ring-slate-200">
            <div className={clsx("mx-auto rounded-2xl bg-white p-6 shadow-sm transition-[max-width] duration-300", movil ? "max-w-[360px]" : "max-w-full")}>
              <FormularioPublico config={config} catalogo={catalogo} slug={formulario.slug} token="vista-previa" nombreEmpresa={config.marca.nombre ?? ""} vistaPrevia />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------------

function Preguntas({ config, cambiarCampos }: { config: ConfigFormulario; cambiarCampos: (f: (c: CampoForm[]) => CampoForm[]) => void }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const campos = config.campos;
  const ids = campos.map((c) => c.id);

  const mover = (i: number, d: number) =>
    cambiarCampos((cs) => {
      const copia = [...cs];
      const [x] = copia.splice(i, 1);
      if (x) copia.splice(i + d, 0, x);
      return copia;
    });
  const cambiar = (id: string, cambios: Partial<CampoForm>) => cambiarCampos((cs) => cs.map((c) => (c.id === id ? { ...c, ...cambios } : c)));
  const agregar = (c: CampoForm) => {
    cambiarCampos((cs) => [...cs, c]);
    setAbierta(c.id);
    setAgregando(false);
  };

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Pregunte solo lo que su asesor necesita para llamar. Cada pregunta de más hace que menos personas terminen. El <strong>nombre</strong> y el <strong>teléfono</strong> siempre van.
      </p>
      <ol className="space-y-2">
        {campos.map((c, i) => (
          <li key={c.id} className="animate-aparecer rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="flex flex-col">
                <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-25" aria-label="Subir">
                  <Icono nombre="ArrowUp" className="size-3.5" />
                </button>
                <button type="button" disabled={i === campos.length - 1} onClick={() => mover(i, 1)} className="rounded p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-25" aria-label="Bajar">
                  <Icono nombre="ArrowDown" className="size-3.5" />
                </button>
              </div>
              <button type="button" onClick={() => setAbierta(abierta === c.id ? null : c.id)} className="min-w-0 flex-1 text-left" aria-expanded={abierta === c.id}>
                <span className="block truncate text-sm font-medium text-slate-800">{c.etiqueta || "Pregunta sin texto"}</span>
                <span className="block text-xs text-slate-500">
                  {ETIQUETAS_TIPO[c.tipo]}
                  {c.mapea ? ` · va a «${NOMBRES_MAPEO[c.mapea]}»` : ""}
                </span>
              </button>
              <Interruptor activo={c.requerido} deshabilitado={esFijo(c)} onCambio={(v) => cambiar(c.id, { requerido: v })} etiqueta="Obligatoria" />
              <button type="button" onClick={() => setAbierta(abierta === c.id ? null : c.id)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Editar la pregunta" title="Editar">
                <Icono nombre={abierta === c.id ? "ChevronDown" : "Pencil"} className="size-4" />
              </button>
              {esFijo(c) ? (
                <span className="p-1 text-slate-300" title="Esta pregunta no se puede quitar">
                  <Icono nombre="Lock" className="size-4" />
                </span>
              ) : (
                <button type="button" onClick={() => cambiarCampos((cs) => cs.filter((x) => x.id !== c.id))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Quitar la pregunta" title="Quitar">
                  <Icono nombre="Trash2" className="size-4" />
                </button>
              )}
            </div>
            {abierta === c.id ? (
              <div className="animate-bajar grid gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:grid-cols-2">
                <Campo etiqueta="Texto de la pregunta" className="sm:col-span-2">
                  <input className={claseInputFormulario} value={c.etiqueta} maxLength={120} onChange={(e) => cambiar(c.id, { etiqueta: e.target.value })} />
                </Campo>
                {c.tipo !== "casilla" && c.tipo !== "lista" ? (
                  <Campo etiqueta="Texto de ayuda (opcional)">
                    <input className={claseInputFormulario} value={c.ayuda ?? ""} maxLength={160} onChange={(e) => cambiar(c.id, { ayuda: e.target.value })} />
                  </Campo>
                ) : null}
                {!esFijo(c) && c.tipo !== "casilla" ? (
                  <Campo etiqueta="¿Dónde se guarda la respuesta?">
                    <select className={claseInputFormulario} value={c.mapea ?? ""} onChange={(e) => cambiar(c.id, { mapea: (e.target.value || null) as MapeoCampo | null })}>
                      <option value="">Solo en «Lo que contestó»</option>
                      {MAPEOS.filter((m) => !["nombreCompleto", "nombre", "apellidos", "telefono"].includes(m)).map((m) => (
                        <option key={m} value={m} disabled={campos.some((x) => x.mapea === m && x.id !== c.id)}>
                          {NOMBRES_MAPEO[m]}
                        </option>
                      ))}
                    </select>
                  </Campo>
                ) : null}
                {c.tipo === "lista" ? (
                  <Campo etiqueta="Opciones (una por línea)" className="sm:col-span-2">
                    <textarea
                      className={clsx(claseInputFormulario, "min-h-24")}
                      value={(c.opciones ?? []).join("\n")}
                      onChange={(e) => cambiar(c.id, { opciones: e.target.value.split("\n").slice(0, 30) })}
                      onBlur={(e) => cambiar(c.id, { opciones: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })}
                    />
                    <p className="mt-1 text-xs text-slate-500">Con 4 opciones o menos se muestran como botones; con más, como lista desplegable.</p>
                  </Campo>
                ) : null}
                {c.tipo === "catalogo" ? <p className="text-xs text-slate-500 sm:col-span-2">Muestra los proyectos o inmuebles activos de su catálogo para que la persona elija el que le interesa.</p> : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="mt-4">
        {agregando ? (
          <div className="animate-bajar rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Agregar una pregunta</p>
              <button type="button" onClick={() => setAgregando(false)} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label="Cerrar">
                <Icono nombre="X" className="size-4" />
              </button>
            </div>
            <div className="space-y-3">
              {BIBLIOTECA.map((g) => {
                const disponibles = g.campos.filter((c) => !ids.includes(c.id));
                return disponibles.length ? (
                  <div key={g.grupo}>
                    <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{g.grupo}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {disponibles.map((c) => (
                        <button key={c.id} type="button" onClick={() => agregar({ ...c })} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-marca-500 hover:text-marca-700">
                          + {c.etiqueta}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;
              })}
              <div>
                <p className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Pregunta propia</p>
                <div className="flex flex-wrap gap-1.5">
                  {TIPOS_PROPIOS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        agregar({
                          id: claveDeEtiqueta("Nueva pregunta", ids),
                          tipo: t,
                          etiqueta: "Nueva pregunta",
                          requerido: false,
                          ...(t === "lista" ? { opciones: ["Opción 1", "Opción 2"] } : {}),
                        })
                      }
                      className="rounded-full border border-dashed border-slate-400 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-marca-500 hover:text-marca-700"
                    >
                      + {ETIQUETAS_TIPO[t]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <Boton icono="Plus" onClick={() => setAgregando(true)} disabled={campos.length >= 25}>
            Agregar una pregunta
          </Boton>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Diseño, textos y publicación
// ---------------------------------------------------------------------------

function Diseno({ config, setConfig }: { config: ConfigFormulario; setConfig: (f: (c: ConfigFormulario) => ConfigFormulario) => void }) {
  const marca = (cambios: Partial<ConfigFormulario["marca"]>) => setConfig((c) => ({ ...c, marca: { ...c.marca, ...cambios } }));
  return (
    <div className="space-y-5">
      <Campo etiqueta="Color de su marca">
        <div className="flex flex-wrap items-center gap-2">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => marca({ color: c })}
              aria-label={`Usar el color ${c}`}
              aria-pressed={config.marca.color.toLowerCase() === c}
              className={clsx("size-8 rounded-full ring-offset-2 transition-transform active:scale-90", config.marca.color.toLowerCase() === c ? "ring-2 ring-slate-800" : "hover:scale-110")}
              style={{ background: c }}
            />
          ))}
          <label className="ml-1 flex items-center gap-2 text-xs text-slate-500">
            <input type="color" value={config.marca.color} onChange={(e) => marca({ color: e.target.value })} className="size-8 cursor-pointer rounded border border-slate-300 bg-white p-0.5" aria-label="Elegir otro color" />
            <input className={clsx(claseInputFormulario, "w-28 font-mono")} value={config.marca.color} onChange={(e) => marca({ color: e.target.value })} maxLength={7} aria-label="Código del color" />
          </label>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">Se usa en el botón, las opciones elegidas y los detalles. El texto del botón cambia solo entre blanco y oscuro para que se lea.</p>
      </Campo>
      <Campo etiqueta="Nombre que se muestra arriba">
        <input className={claseInputFormulario} value={config.marca.nombre ?? ""} maxLength={80} onChange={(e) => marca({ nombre: e.target.value })} placeholder="Constructora Aurora" />
      </Campo>
      <Campo etiqueta="Logo (enlace https de la imagen)">
        <input className={claseInputFormulario} value={config.marca.logoUrl ?? ""} maxLength={500} onChange={(e) => marca({ logoUrl: e.target.value })} placeholder="https://su-sitio.com/logo.png" />
        <p className="mt-1.5 text-xs text-slate-500">Pegue el enlace del logo que ya tiene en su sitio. Si lo deja vacío, se muestra el nombre. (Subir el archivo directamente viene después.)</p>
      </Campo>
    </div>
  );
}

function Textos({ config, setConfig, pendientes }: { config: ConfigFormulario; setConfig: (f: (c: ConfigFormulario) => ConfigFormulario) => void; pendientes: string[] }) {
  const textos = (cambios: Partial<ConfigFormulario["textos"]>) => setConfig((c) => ({ ...c, textos: { ...c.textos, ...cambios } }));
  const consent = (cambios: Partial<ConfigFormulario["consentimiento"]>) => setConfig((c) => ({ ...c, consentimiento: { ...c.consentimiento, ...cambios } }));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Título" className="sm:col-span-2">
          <input className={claseInputFormulario} value={config.textos.titulo} maxLength={120} onChange={(e) => textos({ titulo: e.target.value })} />
        </Campo>
        <Campo etiqueta="Texto de apoyo (opcional)" className="sm:col-span-2">
          <textarea className={clsx(claseInputFormulario, "min-h-16")} value={config.textos.subtitulo ?? ""} maxLength={240} onChange={(e) => textos({ subtitulo: e.target.value })} />
        </Campo>
        <Campo etiqueta="Texto del botón">
          <input className={claseInputFormulario} value={config.textos.boton} maxLength={40} onChange={(e) => textos({ boton: e.target.value })} />
        </Campo>
        <Campo etiqueta="Al enviar, llevar a (opcional)">
          <input className={claseInputFormulario} value={config.textos.redireccion ?? ""} maxLength={500} onChange={(e) => textos({ redireccion: e.target.value })} placeholder="https://su-sitio.com/gracias" />
        </Campo>
        <Campo etiqueta="Mensaje al terminar">
          <input className={claseInputFormulario} value={config.textos.exitoTitulo} maxLength={120} onChange={(e) => textos({ exitoTitulo: e.target.value })} />
        </Campo>
        <Campo etiqueta="Detalle del mensaje (opcional)">
          <input className={claseInputFormulario} value={config.textos.exitoMensaje ?? ""} maxLength={400} onChange={(e) => textos({ exitoMensaje: e.target.value })} />
        </Campo>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Autorización de datos personales</p>
            <p className="mt-0.5 text-xs text-slate-500">La persona la acepta con una casilla antes de enviar. Guardamos qué aceptó y cuándo.</p>
          </div>
          <Interruptor activo={config.consentimiento.activo} onCambio={(v) => consent({ activo: v })} etiqueta="Pedir autorización" />
        </div>
        {config.consentimiento.activo ? (
          <>
            <textarea className={clsx(claseInputFormulario, "mt-3 min-h-40 text-[13px] leading-snug")} value={config.consentimiento.texto} maxLength={2000} onChange={(e) => consent({ texto: e.target.value, version: "v-" + Date.now().toString(36) })} aria-label="Texto de la autorización" />
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <Icono nombre="TriangleAlert" className="mt-0.5 size-4 shrink-0" />
              <p>
                Es un texto base, no asesoría legal: <strong>pídale a su abogado que lo revise</strong> (Ley 1581 de 2012). Complete lo que está entre corchetes. Si usa una asistente virtual que llama, aquí se avisa que la llamada puede grabarse: deje ese aviso y dígalo también al comenzar la llamada.
              </p>
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">Sin autorización no podrá publicar el formulario: la ley exige el permiso de la persona para guardar y usar sus datos.</p>
        )}
      </div>

      {pendientes.length ? (
        <ul className="space-y-1 rounded-lg bg-marca-50 p-3 text-sm text-marca-800">
          {pendientes.map((p) => (
            <li key={p} className="flex gap-2">
              <Icono nombre="Info" className="mt-0.5 size-4 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Publicar({ slug, estado, pendientes, envios, onPublicar, cargando }: { slug: string; estado: EstadoFormulario; pendientes: string[]; envios: Envio[]; onPublicar: () => void; cargando: boolean }) {
  const [origen, setOrigen] = useState("");
  useEffect(() => setOrigen(window.location.origin), []);
  const enlace = `${origen}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${rutaPublica(slug)}`;
  const codigo = `<iframe src="${enlace}" title="Formulario" width="100%" height="760" style="border:0;max-width:640px"></iframe>\n<script>\nwindow.addEventListener("message", function (e) {\n  if (e.data && e.data.type === "machea-form-height") {\n    document.querySelectorAll('iframe[src="${enlace}"]').forEach(function (f) { f.style.height = e.data.height + "px"; });\n  }\n});\n</script>`;
  const copiar = async (texto: string, mensaje: string) => {
    await navigator.clipboard.writeText(texto).catch(() => undefined);
    avisar(mensaje);
  };
  return (
    <div className="space-y-5">
      {estado !== "activo" ? (
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Todavía no está publicado</p>
          <p className="mt-0.5 text-sm text-slate-600">Cuando lo publique, el enlace funciona y cada respuesta llega como un lead a este panel.</p>
          {pendientes.length ? <p className="mt-2 text-sm text-marca-800">Antes: {pendientes[0]}</p> : null}
          <Boton className="mt-3" variante="primario" icono="Send" cargando={cargando} onClick={onPublicar}>
            Publicar ahora
          </Boton>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800">
          <Icono nombre="CircleCheck" className="size-4" /> Publicado: recibe respuestas.
        </div>
      )}

      <Campo etiqueta="Enlace para compartir">
        <div className="flex gap-2">
          <input readOnly className={clsx(claseInputFormulario, "font-mono text-xs")} value={enlace} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace del formulario" />
          <Boton icono="Copy" onClick={() => void copiar(enlace, "Enlace copiado.")}>
            Copiar
          </Boton>
          <a href={enlace} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Icono nombre="ExternalLink" className="size-4" /> Abrir
          </a>
        </div>
        <p className="mt-1 text-xs text-slate-500">Úselo en anuncios, WhatsApp, redes sociales o un código QR.</p>
      </Campo>

      <Campo etiqueta="Para ponerlo dentro de su sitio web">
        <textarea readOnly className={clsx(claseInputFormulario, "min-h-36 font-mono text-xs")} value={codigo} onFocus={(e) => e.currentTarget.select()} aria-label="Código para incrustar" />
        <div className="mt-2 flex items-center gap-3">
          <Boton tamano="sm" icono="Code" onClick={() => void copiar(codigo, "Código copiado.")}>
            Copiar código
          </Boton>
          <span className="text-xs text-slate-500">Péguelo donde quiera que aparezca el formulario. Se ajusta solo a la altura.</span>
        </div>
      </Campo>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-800">Últimas respuestas</p>
        {envios.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Todavía no hay respuestas. Cuando lleguen, las verá aquí y como leads.</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {envios.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                {e.candidatoId ? (
                  <Link href={`/ventas/o/candidatos/${e.candidatoId}`} className="truncate font-medium text-marca-700 hover:underline">
                    {e.nombre}
                  </Link>
                ) : (
                  <span className="truncate">{e.nombre}</span>
                )}
                <span className="shrink-0 text-xs text-slate-500">{new Date(e.creadoEn).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Campo({ etiqueta, children, className }: { etiqueta: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{etiqueta}</span>
      {children}
    </div>
  );
}

function Interruptor({ activo, onCambio, etiqueta, deshabilitado = false }: { activo: boolean; onCambio: (v: boolean) => void; etiqueta: string; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      title={deshabilitado ? `${etiqueta}: siempre` : etiqueta}
      disabled={deshabilitado}
      onClick={() => onCambio(!activo)}
      className={clsx("relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60", activo ? "bg-marca-600" : "bg-slate-300")}
    >
      <span className={clsx("absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-150", activo && "translate-x-4")} />
    </button>
  );
}
