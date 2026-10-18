/* MACHEA — Botón oficial de "Acceder con Google" (Google Identity Services).
 *
 * El botón lo dibuja Google dentro de un iframe; nosotros solo decidimos dónde va y qué texto lleva.
 * Al terminar, Google entrega un ID token (JWT firmado por Google) que se le pasa al proveedor con
 * `entrarConGoogle`. El proveedor lo verifica en el SERVIDOR: el navegador nunca decide si es válido.
 *
 * Nonce (contra la reutilización de un token robado): a Google se le pasa el SHA-256 del nonce, y al
 * proveedor el nonce en crudo; el proveedor comprueba que coincidan. Es la receta de la guía de Supabase
 * "Login with Google", que sirve igual para cualquier backend.
 *
 * Requisitos de la página (ver la guía de Google "Get your Google API client ID"):
 *   - CSP: script-src https://accounts.google.com/gsi/client; frame-src y connect-src
 *     https://accounts.google.com/gsi/; style-src https://accounts.google.com/gsi/style
 *   - Referrer-Policy: strict-origin-when-cross-origin (con no-referrer el botón no funciona)
 *   - El origen (https://www.machea.co, http://localhost:5173…) registrado en el cliente OAuth.
 */

import { sha256Hex } from './cripto.ts';

const URL_GIS = 'https://accounts.google.com/gsi/client';

interface RespuestaCredencial {
  credential: string;
}

interface GoogleId {
  initialize(opciones: Record<string, unknown>): void;
  renderButton(contenedor: HTMLElement, opciones: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

/** { nonce en crudo, su SHA-256 en hexadecimal }. */
export async function crearNonce(): Promise<{ nonce: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(String.fromCharCode(...bytes));
  return { nonce, hash: await sha256Hex(nonce) };
}

let cargando: Promise<GoogleId> | null = null;

/** Carga el script de Google una sola vez. Falla a los 10 s (red bloqueada, CSP mal puesta). */
export function cargarGoogle(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (cargando) return cargando;
  cargando = new Promise<GoogleId>((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = URL_GIS;
    s.async = true;
    const plazo = window.setTimeout(() => fallar(new Error('Google no respondió a tiempo')), 10000);
    function fallar(e: Error) {
      window.clearTimeout(plazo);
      cargando = null;
      s.remove();
      rechazar(e);
    }
    s.onload = () => {
      window.clearTimeout(plazo);
      const id = window.google?.accounts?.id;
      if (id) resolver(id);
      else fallar(new Error('El script de Google cargó sin la API esperada'));
    };
    s.onerror = () => fallar(new Error('No se pudo cargar el script de Google'));
    document.head.appendChild(s);
  });
  return cargando;
}

export interface OpcionesBoton {
  clientId: string;
  /** 'signin_with' = "Acceder con Google"; 'signup_with' = "Registrarse con Google". */
  texto: 'signin_with' | 'signup_with' | 'continue_with';
  /** Ancho en px (Google acepta de 200 a 400). */
  ancho: number;
  alRecibir(datos: { idToken: string; nonce: string }): void;
  alFallar?(error: Error): void;
}

/**
 * Pinta el botón oficial en `contenedor`. Devuelve false si no hay clientId (por ejemplo en local sin
 * configurar): la pantalla debe ocultar el bloque de Google en vez de mostrar un botón roto.
 */
export async function montarBotonGoogle(contenedor: HTMLElement, op: OpcionesBoton): Promise<boolean> {
  if (!op.clientId) return false;
  try {
    const [gid, { nonce, hash }] = await Promise.all([cargarGoogle(), crearNonce()]);
    gid.initialize({
      client_id: op.clientId,
      nonce: hash,
      ux_mode: 'popup',
      use_fedcm_for_prompt: true,
      itp_support: true,
      context: op.texto === 'signup_with' ? 'signup' : 'signin',
      callback: (r: RespuestaCredencial) => {
        if (r && r.credential) op.alRecibir({ idToken: r.credential, nonce });
        else op.alFallar?.(new Error('Google no devolvió una credencial'));
      },
    });
    contenedor.replaceChildren();
    gid.renderButton(contenedor, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      shape: 'pill',
      text: op.texto,
      logo_alignment: 'center',
      locale: 'es',
      width: Math.max(200, Math.min(400, Math.round(op.ancho))),
    });
    return true;
  } catch (e) {
    op.alFallar?.(e instanceof Error ? e : new Error(String(e)));
    return false;
  }
}

/** Al salir: que Google no vuelva a entrar solo con la misma cuenta. */
export function olvidarGoogle(): void {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* sin Google cargado no hay nada que olvidar */
  }
}
