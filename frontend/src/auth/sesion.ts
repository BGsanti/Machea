/* MACHEA — Sesión del lado del navegador: dónde se guarda y a dónde se va después de entrar. */

/** Lo mínimo de `Storage` que usamos; permite pasar un almacén en memoria en pruebas. */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

export function almacenEnMemoria(): Almacen {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
  };
}

/**
 * localStorage o sessionStorage, o memoria si el navegador los bloquea (ventana privada, cookies
 * apagadas). Nunca lanza: el login no se puede caer porque el almacenamiento falle.
 */
export function almacenDelNavegador(tipo: 'local' | 'sesion'): Almacen {
  try {
    const s = tipo === 'local' ? window.localStorage : window.sessionStorage;
    const prueba = '__machea_prueba__';
    s.setItem(prueba, '1');
    s.removeItem(prueba);
    return s;
  } catch {
    return almacenEnMemoria();
  }
}

export const RUTA_ACCESO = '/acceso/';
export const RUTA_INICIO = '/inicio/';

/**
 * El `?volver=` de la URL, solo si es una ruta de este mismo sitio. Evita que un enlace como
 * /acceso/?volver=https://otro-sitio.com mande a alguien a una página falsa después de entrar.
 */
export function destinoSeguro(volver: string | null | undefined, porDefecto: string = RUTA_INICIO): string {
  const v = String(volver || '');
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return porDefecto;
  // Caracteres de control (saltos de línea, tabuladores): algunos navegadores los ignoran y "/\n/malo.com" acabaría en otro sitio.
  if (Array.from(v).some((ch) => ch.charCodeAt(0) < 32)) return porDefecto;
  if (v.startsWith(RUTA_ACCESO)) return porDefecto; // no volver al login después de entrar
  return v;
}

/** /acceso/?volver=<ruta actual>: a dónde mandar a quien llega sin sesión a una página protegida. */
export function rutaDeAcceso(rutaActual: string): string {
  const destino = destinoSeguro(rutaActual, '');
  return destino ? `${RUTA_ACCESO}?volver=${encodeURIComponent(destino)}` : RUTA_ACCESO;
}
