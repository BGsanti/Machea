import { hrefPestana, obtenerApp, pestanaCampanas, type App, type Pestana } from "./apps";
import { obtenerObjeto } from "./objetos";
import { obtenerConfiguracion, obtenerPreferencias } from "./servidor/consultas";
import { recientes } from "./servidor/repositorio";
import type { PestanaVisible } from "./ui/shell/cabecera-app";

const claveDe = (p: Pestana) => `${p.tipo === "objeto" ? "o" : "p"}:${p.id}`;

function etiquetaDe(p: Pestana): string {
  if (p.tipo === "pagina") return p.etiqueta;
  return p.etiqueta ?? obtenerObjeto(p.id)?.etiquetaPlural ?? p.id;
}

/** Pestañas de una app según la configuración y las preferencias del usuario. */
export async function pestanasDeApp(
  id: string,
  usuarioId: string,
): Promise<{ app: App; visibles: PestanaVisible[]; disponibles: { clave: string; etiqueta: string }[] } | null> {
  const app = obtenerApp(id);
  if (!app) return null;
  const [config, prefs, vistos] = await Promise.all([obtenerConfiguracion(), obtenerPreferencias(usuarioId), recientes(usuarioId, 80)]);

  const todas = [...app.pestanas];
  if (app.id === "marketing" && config.marketingActivado) todas.push(pestanaCampanas);
  const porClave = new Map(todas.map((p) => [claveDe(p), p]));
  const elegidas = prefs.navegacion[app.id]?.filter((c) => porClave.has(c));
  const orden = elegidas && elegidas.length > 0 ? elegidas : todas.filter((p) => !p.oculta).map(claveDe);

  const visibles = orden.map((clave) => {
    const p = porClave.get(clave)!;
    return {
      clave,
      etiqueta: etiquetaDe(p),
      href: hrefPestana(app.id, p),
      objeto: p.tipo === "objeto" ? p.id : undefined,
      recientes: p.tipo === "objeto" ? vistos.filter((v) => v.objeto === p.id).slice(0, 5).map((v) => ({ id: v.id, nombre: v.nombre })) : [],
    };
  });
  return { app, visibles, disponibles: todas.map((p) => ({ clave: claveDe(p), etiqueta: etiquetaDe(p) })) };
}

/** Primera pestaña visible de la app, para redirigir a ella. */
export async function primeraPestana(id: string, usuarioId: string): Promise<string | null> {
  const nav = await pestanasDeApp(id, usuarioId);
  return nav?.visibles[0]?.href ?? null;
}
