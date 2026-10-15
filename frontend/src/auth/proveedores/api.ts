/* MACHEA — Proveedor REAL del login: habla con nuestro backend (backend/api/acceso.py, D20).
 *
 * Las rutas son /api/... del MISMO dominio del front: en producción Vercel las reenvía a Render
 * (frontend/vercel.json) y en local las reenvía Vite al backend (vite.config.ts, server.proxy). Así la
 * cookie de sesión es de primera parte (HttpOnly, Secure, SameSite=Lax, Path=/api) y el navegador
 * nunca ve el token: este archivo no guarda nada.
 */

import {
  ErrorAuth,
  type CodigoError,
  type DatosEntrada,
  type DatosGoogle,
  type DatosRegistro,
  type ProveedorAuth,
  type Sesion,
} from '../contrato.ts';

const CODIGOS: ReadonlySet<string> = new Set([
  'datos_invalidos', 'credenciales', 'correo_sin_confirmar', 'usuario_ocupado', 'correo_ocupado',
  'enlace_invalido', 'google_invalido', 'demasiados_intentos', 'no_disponible', 'sin_conexion', 'desconocido',
]);

type Fetch = typeof fetch;

export interface OpcionesApi {
  /** Prefijo de las rutas; '' = mismo dominio (lo normal). */
  base?: string;
  /** Inyectable para pruebas. */
  fetch?: Fetch;
  /** Corte de cada petición, en ms (Render gratis puede tardar en despertar). */
  esperaMs?: number;
}

interface RespuestaError {
  detail?: { codigo?: string; campos?: Record<string, string> } | string;
}

function errorDesde(status: number, cuerpo: RespuestaError | null): ErrorAuth {
  const d = cuerpo && typeof cuerpo.detail === 'object' ? cuerpo.detail : null;
  const codigo = d?.codigo && CODIGOS.has(d.codigo) ? (d.codigo as CodigoError) : null;
  if (codigo) return new ErrorAuth(codigo, (d?.campos || {}) as ErrorAuth['campos']);
  if (status === 429) return new ErrorAuth('demasiados_intentos');
  if (status === 503 || status === 502 || status === 504) return new ErrorAuth('no_disponible');
  return new ErrorAuth('desconocido');
}

export class ProveedorApi implements ProveedorAuth {
  readonly nombre = 'api';
  private readonly base: string;
  private readonly f: Fetch;
  private readonly espera: number;

  constructor(op: OpcionesApi = {}) {
    this.base = (op.base ?? '').replace(/\/$/, '');
    this.f = op.fetch ?? ((...a) => fetch(...a));
    this.espera = op.esperaMs ?? 30000;
  }

  /** Hace la petición y devuelve el cuerpo JSON (o null). Lanza ErrorAuth en cualquier error. */
  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<{ status: number; datos: T | null }> {
    const ctrl = new AbortController();
    const corte = setTimeout(() => ctrl.abort(), this.espera);
    let r: Response;
    try {
      r = await this.f(this.base + ruta, {
        method: metodo,
        headers: cuerpo === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        credentials: 'same-origin',
        cache: 'no-store',
        signal: ctrl.signal,
      });
    } catch {
      throw new ErrorAuth('sin_conexion');
    } finally {
      clearTimeout(corte);
    }
    const texto = await r.text().catch(() => '');
    let datos: unknown = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      datos = null;
    }
    if (!r.ok) throw Object.assign(errorDesde(r.status, datos as RespuestaError), { status: r.status });
    return { status: r.status, datos: datos as T };
  }

  async crearCuenta(d: DatosRegistro): Promise<{ correo: string }> {
    const { datos } = await this.pedir<{ correo: string }>('POST', '/api/cuentas', d);
    return { correo: datos?.correo ?? d.correo.trim().toLowerCase() };
  }

  async confirmarCorreo(token: string): Promise<void> {
    await this.pedir('POST', '/api/cuentas/confirmar', { token });
  }

  async reenviarConfirmacion(correo: string): Promise<void> {
    await this.pedir('POST', '/api/cuentas/reenviar-confirmacion', { correo });
  }

  async entrar(d: DatosEntrada): Promise<Sesion> {
    const { datos } = await this.pedir<Sesion>('POST', '/api/sesion', d);
    return datos as Sesion;
  }

  async entrarConGoogle(d: DatosGoogle): Promise<Sesion> {
    const { datos } = await this.pedir<Sesion>('POST', '/api/sesion/google', d);
    return datos as Sesion;
  }

  async pedirRecuperacion(correo: string): Promise<void> {
    await this.pedir('POST', '/api/clave/recuperar', { correo });
  }

  async cambiarClave(d: { token: string; clave: string }): Promise<void> {
    await this.pedir('POST', '/api/clave', d);
  }

  /** null si no hay sesión, si venció o si el servicio no está disponible (las páginas mandan a /acceso/). */
  async sesionActual(): Promise<Sesion | null> {
    try {
      const { datos } = await this.pedir<Sesion>('GET', '/api/sesion');
      return datos && (datos as Sesion).cuenta ? (datos as Sesion) : null;
    } catch {
      return null;
    }
  }

  async salir(): Promise<void> {
    try {
      await this.pedir('DELETE', '/api/sesion');
    } catch {
      /* si la red falla, la cookie igual vence; la página manda a /acceso/ */
    }
  }
}

