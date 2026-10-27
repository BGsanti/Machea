"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { puede, type Permiso } from "@/auth/permisos";
import { Icono, IconoObjeto } from "@/ui/icono";
import { obtenerObjeto } from "../../objetos";
import { buscarEnTodo, recientesParaPaleta, type ResultadoPaleta } from "../../servidor/paleta";

export const EVENTO_ABRIR_PALETA = "machea:abrir-paleta";

interface Comando {
  id: string;
  etiqueta: string;
  ayuda?: string;
  icono: string;
  href: string;
  grupo: "Ir a" | "Crear";
  /** Palabras extra con las que también se encuentra. */
  claves?: string;
  permiso?: Permiso;
  /** Atajo de dos teclas (g y luego…), solo para mostrarlo. */
  atajo?: string;
}

const COMANDOS: Comando[] = [
  { id: "inicio", etiqueta: "Inicio", icono: "House", href: "/inicio", grupo: "Ir a", claves: "mi dia panel resumen", atajo: "G I" },
  { id: "leads", etiqueta: "Leads", icono: "UserPlus", href: "/ventas/o/candidatos", grupo: "Ir a", claves: "candidatos interesados prospectos", atajo: "G L" },
  { id: "contactos", etiqueta: "Contactos", icono: "Users", href: "/contactos", grupo: "Ir a", claves: "clientes personas" },
  { id: "citas", etiqueta: "Citas y calendario", icono: "CalendarDays", href: "/ventas/p/calendario", grupo: "Ir a", claves: "visitas agenda calendario", atajo: "G C" },
  { id: "negocios", etiqueta: "Negocios", icono: "Crown", href: "/ventas/o/oportunidades", grupo: "Ir a", claves: "oportunidades ventas pipeline" },
  { id: "tareas", etiqueta: "Mis tareas", icono: "ListChecks", href: "/ventas/o/tareas?vista=mias_abiertas", grupo: "Ir a", claves: "pendientes seguimiento" },
  { id: "analisis", etiqueta: "Análisis e informes", icono: "ChartPie", href: "/ventas/p/analisis", grupo: "Ir a", claves: "reportes graficas" },
  { id: "formularios", etiqueta: "Formularios", icono: "ClipboardList", href: "/formularios", grupo: "Ir a", claves: "captura embebido", permiso: "formularios" },
  { id: "equipo", etiqueta: "Equipo", icono: "UserCog", href: "/equipo", grupo: "Ir a", claves: "asesores usuarios roles reparto invitar", permiso: "equipo", atajo: "G E" },
  { id: "automatizacion", etiqueta: "Automatización", icono: "Workflow", href: "/automatizacion", grupo: "Ir a", claves: "flujos reglas", permiso: "automatizar" },
  { id: "configuracion", etiqueta: "Configuración de la empresa", icono: "Settings", href: "/configuracion", grupo: "Ir a", claves: "ajustes moneda perfil", permiso: "configurar" },
  { id: "nuevo-lead", etiqueta: "Nuevo lead", icono: "UserPlus", href: "/ventas/o/candidatos?nuevo=1", grupo: "Crear", claves: "agregar interesado", atajo: "N" },
  { id: "nueva-tarea", etiqueta: "Nueva tarea", icono: "ListChecks", href: "/ventas/o/tareas?nuevo=1", grupo: "Crear", claves: "recordatorio pendiente" },
  { id: "nuevo-contacto", etiqueta: "Nuevo contacto", icono: "Users", href: "/contactos?nuevo=1", grupo: "Crear" },
  { id: "importar", etiqueta: "Importar leads desde CSV", icono: "Upload", href: "/ventas/o/candidatos?importar=1", grupo: "Crear", claves: "excel subir lista", permiso: "importar" },
  { id: "invitar", etiqueta: "Invitar a alguien al equipo", icono: "Send", href: "/equipo", grupo: "Crear", claves: "asesor gerente agregar", permiso: "equipo" },
];

const quitarTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Fila = { clave: string; tipo: "comando" | "resultado" | "busqueda"; href: string; render: () => React.ReactNode };

/**
 * Paleta de comandos (Cmd/Ctrl + K o «/»): una sola caja para buscar leads, contactos y negocios, ir a cualquier pantalla
 * y crear cosas, sin tocar el ratón. También los atajos «g» + letra para navegar y «n» para un lead nuevo.
 */
export function PaletaComandos({ rol }: { rol: string }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [activo, setActivo] = useState(0);
  const [resultados, setResultados] = useState<ResultadoPaleta[]>([]);
  const [recientes, setRecientes] = useState<ResultadoPaleta[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLUListElement>(null);

  const cerrar = useCallback(() => {
    setAbierta(false);
    setTexto("");
    setResultados([]);
    setActivo(0);
  }, []);

  const ir = useCallback(
    (href: string) => {
      cerrar();
      router.push(href);
    },
    [cerrar, router],
  );

  // Abrir desde cualquier parte: el teclado y el campo de búsqueda de la cabecera.
  useEffect(() => {
    let esperandoG = 0;
    const alTeclear = (e: KeyboardEvent) => {
      const objetivo = e.target as HTMLElement | null;
      const escribiendo = objetivo && (objetivo.tagName === "INPUT" || objetivo.tagName === "TEXTAREA" || objetivo.tagName === "SELECT" || objetivo.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierta((a) => !a);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || escribiendo || document.querySelector("[role=dialog]")) return;
      if (e.key === "/") {
        e.preventDefault();
        setAbierta(true);
      } else if (e.key === "?") {
        setAyuda(true);
      } else if (e.key === "n") {
        ir("/ventas/o/candidatos?nuevo=1");
      } else if (e.key === "g") {
        esperandoG = Date.now();
      } else if (esperandoG && Date.now() - esperandoG < 1200) {
        const destino = { i: "/inicio", l: "/ventas/o/candidatos", c: "/ventas/p/calendario", e: "/equipo" }[e.key.toLowerCase()];
        esperandoG = 0;
        if (destino && (destino !== "/equipo" || puede(rol, "equipo"))) ir(destino);
      }
    };
    const alPedir = () => setAbierta(true);
    window.addEventListener("keydown", alTeclear);
    window.addEventListener(EVENTO_ABRIR_PALETA, alPedir);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      window.removeEventListener(EVENTO_ABRIR_PALETA, alPedir);
    };
  }, [ir, rol]);

  useEffect(() => {
    if (!abierta) return;
    entrada.current?.focus();
    recientesParaPaleta().then(setRecientes).catch(() => setRecientes([]));
  }, [abierta]);

  // Búsqueda en vivo, con una pausa corta para no pedir en cada letra.
  useEffect(() => {
    const q = texto.trim();
    if (!abierta || q.length < 2) {
      setResultados([]);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    let vigente = true;
    const id = setTimeout(() => {
      buscarEnTodo(q)
        .then((r) => vigente && setResultados(r))
        .catch(() => vigente && setResultados([]))
        .finally(() => vigente && setBuscando(false));
    }, 160);
    return () => {
      vigente = false;
      clearTimeout(id);
    };
  }, [texto, abierta]);

  const filas = useMemo<Fila[]>(() => {
    const q = quitarTildes(texto.trim());
    const permitidos = COMANDOS.filter((c) => !c.permiso || puede(rol, c.permiso));
    const comandos = q ? permitidos.filter((c) => quitarTildes(`${c.etiqueta} ${c.claves ?? ""}`).includes(q)) : permitidos;
    const salida: Fila[] = [];
    const fuente = q ? resultados : recientes;
    for (const r of fuente) {
      const def = obtenerObjeto(r.objeto);
      salida.push({
        clave: `r:${r.objeto}:${r.id}`,
        tipo: "resultado",
        href: r.href,
        render: () => (
          <>
            {def ? <IconoObjeto icono={def.icono} color={def.color} tamano="sm" /> : null}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{r.nombre}</span>
            <span className="shrink-0 text-xs text-slate-400">{r.etiqueta}</span>
          </>
        ),
      });
    }
    for (const c of comandos) {
      salida.push({
        clave: `c:${c.id}`,
        tipo: "comando",
        href: c.href,
        render: () => (
          <>
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icono nombre={c.icono} className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{c.grupo === "Crear" ? c.etiqueta : `Ir a ${c.etiqueta}`}</span>
            {c.atajo ? <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{c.atajo}</kbd> : null}
          </>
        ),
      });
    }
    if (q) {
      salida.push({
        clave: "busqueda",
        tipo: "busqueda",
        href: `/buscar?q=${encodeURIComponent(texto.trim())}`,
        render: () => (
          <>
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-marca-50 text-marca-700">
              <Icono nombre="Search" className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-800">Ver todos los resultados para «{texto.trim()}»</span>
          </>
        ),
      });
    }
    return salida;
  }, [texto, resultados, recientes, rol]);

  useEffect(() => setActivo(0), [texto, resultados.length]);
  useEffect(() => {
    (lista.current?.children[activo] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  if (ayuda) return <AyudaAtajos alCerrar={() => setAyuda(false)} />;
  if (!abierta) return null;

  return (
    <div
      className="animate-aparecer fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 px-4 pt-[12vh] backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Paleta de comandos" className="animate-escalar flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Icono nombre={buscando ? "LoaderCircle" : "Search"} className={clsx("size-4 shrink-0 text-slate-400", buscando && "animate-spin")} />
          <input
            ref={entrada}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cerrar();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setActivo((a) => Math.min(a + 1, filas.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActivo((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                const fila = filas[activo];
                if (fila) ir(fila.href);
              }
            }}
            placeholder="Busca un lead, contacto o negocio, o escribe lo que quieres hacer…"
            aria-label="Buscar o ejecutar un comando"
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Esc</kbd>
        </div>
        <ul ref={lista} role="listbox" className="desplazable min-h-0 flex-1 overflow-y-auto p-2">
          {filas.length === 0 ? <li className="px-3 py-8 text-center text-sm text-slate-500">Nada coincide con «{texto}».</li> : null}
          {filas.map((f, i) => {
            const anterior = filas[i - 1];
            const titulo =
              f.tipo === "resultado" && anterior?.tipo !== "resultado"
                ? texto.trim()
                  ? "Resultados"
                  : "Recientes"
                : f.tipo === "comando" && anterior?.tipo !== "comando"
                  ? texto.trim()
                    ? "Acciones"
                    : "Ir a y crear"
                  : null;
            return (
              <li key={f.clave} role="option" aria-selected={i === activo}>
                {titulo ? <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{titulo}</p> : null}
                <button
                  type="button"
                  onMouseMove={() => setActivo(i)}
                  onClick={() => ir(f.href)}
                  className={clsx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-100", i === activo ? "bg-marca-50 ring-1 ring-marca-200" : "hover:bg-slate-50")}
                >
                  {f.render()}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[11px] text-slate-500">
          <span>
            <kbd className="font-semibold">↑↓</kbd> moverte · <kbd className="font-semibold">Enter</kbd> abrir · <kbd className="font-semibold">Esc</kbd> cerrar
          </span>
          <button type="button" onClick={() => { cerrar(); setAyuda(true); }} className="hover:text-slate-800">
            Ver atajos <kbd className="font-semibold">?</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

const ATAJOS: [string, string][] = [
  ["⌘ K  /  Ctrl K  /  /", "Abrir la paleta de comandos"],
  ["N", "Nuevo lead"],
  ["G luego I", "Ir a Inicio"],
  ["G luego L", "Ir a Leads"],
  ["G luego C", "Ir a Citas"],
  ["G luego E", "Ir a Equipo (gerente o dueño)"],
  ["?", "Ver esta lista"],
  ["Esc", "Cerrar lo que esté abierto"],
];

function AyudaAtajos({ alCerrar }: { alCerrar: () => void }) {
  useEffect(() => {
    const t = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [alCerrar]);
  return (
    <div className="animate-aparecer fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 px-4" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div role="dialog" aria-modal="true" aria-label="Atajos de teclado" className="animate-escalar w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Atajos de teclado</h2>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <Icono nombre="X" className="size-4" />
          </button>
        </div>
        <dl className="space-y-2">
          {ATAJOS.map(([tecla, texto]) => (
            <div key={tecla} className="flex items-center justify-between gap-4 text-sm">
              <dt className="text-slate-600">{texto}</dt>
              <dd>
                <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">{tecla}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
