"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { enviarFormulario } from "../enviar";
import type { CampoForm, ConfigFormulario } from "../tipos";

/** Blanco o casi negro: el que tenga más contraste sobre el color de la marca (WCAG). */
function textoSobre(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luz = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  const contrasteBlanco = 1.05 / (luz + 0.05);
  const contrasteOscuro = (luz + 0.05) / 0.072;
  return contrasteBlanco >= contrasteOscuro ? "#ffffff" : "#1f2a38";
}

const entrada =
  "block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-slate-800 transition-[border-color,box-shadow] duration-150 placeholder:text-slate-400 focus:border-[var(--marca)] focus:outline-none focus:ring-4 focus:ring-[color:var(--marca)]/15 aria-[invalid=true]:border-rose-500";

/**
 * El formulario tal como lo ve quien lo llena. Lo usan la página pública (/f/<slug>) y la vista previa del
 * constructor (con `vistaPrevia`, que no envía nada). Los colores salen de la marca de la empresa.
 */
export function FormularioPublico({
  config,
  catalogo,
  slug,
  token,
  nombreEmpresa,
  vistaPrevia = false,
}: {
  config: ConfigFormulario;
  catalogo: string[];
  slug: string;
  token: string;
  nombreEmpresa: string;
  vistaPrevia?: boolean;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [autoriza, setAutoriza] = useState(false);
  const [trampa, setTrampa] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const contenedor = useRef<HTMLDivElement>(null);

  const marca = config.marca.color;
  const estilo = { "--marca": marca, "--marca-texto": textoSobre(marca) } as CSSProperties;
  const nombre = config.marca.nombre || nombreEmpresa;

  // En una página incrustada (iframe), le avisa a la página de la empresa cuánto mide para que no aparezcan barras de desplazamiento.
  useEffect(() => {
    if (vistaPrevia || typeof window === "undefined" || window.parent === window) return;
    const el = contenedor.current;
    if (!el) return;
    const avisarAltura = () => window.parent.postMessage({ type: "machea-form-height", height: Math.ceil(el.getBoundingClientRect().height) + 32 }, "*");
    const obs = new ResizeObserver(avisarAltura);
    obs.observe(el);
    avisarAltura();
    return () => obs.disconnect();
  }, [vistaPrevia]);

  const cambiar = (id: string, v: string) => {
    setValores((x) => ({ ...x, [id]: v }));
    if (errores[id]) setErrores((e) => ({ ...e, [id]: "" }));
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (vistaPrevia || pendiente) return;
    setAviso(null);
    iniciar(async () => {
      const r = await enviarFormulario(slug, token, valores, autoriza, trampa);
      if (r.ok) {
        setEnviado(true);
        const destino = config.textos.redireccion;
        if (destino) {
          setTimeout(() => {
            try {
              (window.top ?? window).location.assign(destino);
            } catch {
              window.location.assign(destino);
            }
          }, 1400);
        }
        return;
      }
      setErrores(r.errores ?? {});
      setAviso(r.mensaje ?? "No pudimos enviar el formulario.");
    });
  };

  if (enviado) {
    return (
      <div ref={contenedor} style={estilo} className="animate-escalar py-10 text-center" role="status">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full" style={{ background: "var(--marca)", color: "var(--marca-texto)" }}>
          <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12.5 10 17.5 19 7.5" />
          </svg>
        </span>
        <h2 className="mt-4 text-xl font-semibold text-slate-800">{config.textos.exitoTitulo}</h2>
        {config.textos.exitoMensaje ? <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-slate-600">{config.textos.exitoMensaje}</p> : null}
      </div>
    );
  }

  return (
    <div ref={contenedor} style={estilo}>
      {vistaPrevia ? <p className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-800">Vista previa: aquí no se envía nada.</p> : null}
      {config.marca.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.marca.logoUrl} alt={nombre} className="mb-5 h-10 max-w-[200px] object-contain object-left" />
      ) : nombre ? (
        <p className="mb-4 text-sm font-semibold tracking-wide" style={{ color: "var(--marca)" }}>
          {nombre}
        </p>
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-800">{config.textos.titulo}</h1>
      {config.textos.subtitulo ? <p className="mt-1.5 text-[15px] text-slate-600">{config.textos.subtitulo}</p> : null}

      <form onSubmit={enviar} noValidate className="mt-6 space-y-4">
        {config.campos.map((c, i) => (
          <div key={c.id} className="animate-subir" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
            <Pregunta campo={c} valor={valores[c.id] ?? ""} error={errores[c.id]} catalogo={catalogo} onCambio={(v) => cambiar(c.id, v)} />
          </div>
        ))}

        {/* Campo trampa: las personas no lo ven; los robots lo llenan. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Sitio web
            <input tabIndex={-1} autoComplete="off" value={trampa} onChange={(e) => setTrampa(e.target.value)} />
          </label>
        </div>

        {config.consentimiento.activo ? (
          <div className="animate-subir rounded-xl bg-slate-50 p-3.5" style={{ animationDelay: "250ms" }}>
            <label className="flex cursor-pointer items-start gap-3 text-[13px] leading-snug text-slate-600">
              <input
                type="checkbox"
                checked={autoriza}
                onChange={(e) => {
                  setAutoriza(e.target.checked);
                  if (errores["_consentimiento"]) setErrores((x) => ({ ...x, _consentimiento: "" }));
                }}
                className="mt-0.5 size-4 shrink-0"
                style={{ accentColor: marca }}
                aria-invalid={Boolean(errores["_consentimiento"])}
              />
              <span>{config.consentimiento.texto}</span>
            </label>
            {errores["_consentimiento"] ? <p className="mt-2 text-sm text-rose-600">{errores["_consentimiento"]}</p> : null}
          </div>
        ) : null}

        {aviso ? (
          <p role="alert" className="animate-bajar rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {aviso}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pendiente || vistaPrevia}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold shadow-sm transition-[transform,opacity,filter] duration-150 hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-70"
          style={{ background: "var(--marca)", color: "var(--marca-texto)" }}
        >
          {pendiente ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
          {pendiente ? "Enviando…" : config.textos.boton}
        </button>
      </form>
    </div>
  );
}

function Pregunta({ campo, valor, error, catalogo, onCambio }: { campo: CampoForm; valor: string; error?: string; catalogo: string[]; onCambio: (v: string) => void }) {
  const id = `q-${campo.id}`;
  const ayuda = campo.ayuda || undefined;
  const comunes = { id, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-e` : undefined } as const;
  const etiqueta = (
    <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
      {campo.etiqueta}
      {campo.requerido ? <span className="ml-0.5 text-rose-600"> *</span> : <span className="ml-1.5 text-xs font-normal text-slate-400">opcional</span>}
    </label>
  );

  let control: React.ReactNode;
  switch (campo.tipo) {
    case "parrafo":
      control = <textarea {...comunes} rows={3} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={ayuda} className={clsx(entrada, "resize-y")} maxLength={2000} />;
      break;
    case "telefono":
      control = <input {...comunes} type="tel" inputMode="tel" autoComplete="tel" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={ayuda ?? "312 555 1001"} className={entrada} maxLength={30} />;
      break;
    case "correo":
      control = <input {...comunes} type="email" inputMode="email" autoComplete="email" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={ayuda} className={entrada} maxLength={160} />;
      break;
    case "numero":
      control = <input {...comunes} type="text" inputMode="decimal" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={ayuda} className={entrada} maxLength={20} />;
      break;
    case "casilla":
      return (
        <div>
          <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[15px] text-slate-700">
            <input id={id} type="checkbox" checked={valor === "true"} onChange={(e) => onCambio(e.target.checked ? "true" : "")} className="size-4" style={{ accentColor: "var(--marca)" }} aria-invalid={Boolean(error)} />
            {campo.etiqueta}
            {campo.requerido ? <span className="text-rose-600">*</span> : null}
          </label>
          {error ? <p id={`${id}-e`} className="mt-1 text-sm text-rose-600">{error}</p> : null}
        </div>
      );
    case "lista": {
      const opciones = campo.opciones ?? [];
      control =
        opciones.length <= 4 ? (
          <div role="radiogroup" aria-label={campo.etiqueta} className="flex flex-wrap gap-2">
            {opciones.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={valor === o}
                onClick={() => onCambio(valor === o ? "" : o)}
                className={clsx("rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95", valor === o ? "border-transparent" : "border-slate-300 bg-white text-slate-700 hover:border-slate-400")}
                style={valor === o ? { background: "var(--marca)", color: "var(--marca-texto)" } : undefined}
              >
                {o}
              </button>
            ))}
          </div>
        ) : (
          <select {...comunes} value={valor} onChange={(e) => onCambio(e.target.value)} className={entrada}>
            <option value="">Elige una opción</option>
            {opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      break;
    }
    case "catalogo":
      control = catalogo.length ? (
        <select {...comunes} value={valor} onChange={(e) => onCambio(e.target.value)} className={entrada}>
          <option value="">Elige una opción</option>
          {catalogo.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value="Otro o no estoy seguro">Otro o no estoy seguro</option>
        </select>
      ) : (
        <input {...comunes} type="text" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={ayuda ?? "¿Cuál te interesa?"} className={entrada} maxLength={160} />
      );
      break;
    default:
      control = <input {...comunes} type="text" autoComplete={campo.mapea === "nombreCompleto" ? "name" : campo.mapea === "ciudad" ? "address-level2" : "off"} value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={ayuda} className={entrada} maxLength={200} />;
  }

  return (
    <div>
      {etiqueta}
      {control}
      {error ? (
        <p id={`${id}-e`} className="mt-1 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
