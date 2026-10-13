/* MACHEA — Punto de entrada del login: elige el proveedor y lo entrega a las pantallas.
 *
 * Variables de Vite (archivo .env.local o el panel de Vercel; ninguna es secreta):
 *   VITE_AUTH_PROVEEDOR              'prueba' (por defecto). El de la nube se agrega cuando se elija (D8).
 *   VITE_AUTH_PRUEBA_EN_PRODUCCION   '1' para permitir el proveedor de prueba en un build de producción
 *                                    (solo para una vista previa de demo; NUNCA en www.machea.co).
 *   VITE_GOOGLE_CLIENT_ID            el Client ID público del cliente OAuth "Web" de Google. Vacío = sin botón.
 */

import { ErrorAuth, type ProveedorAdmin, type ProveedorAuth, type Sesion } from './contrato.ts';
import { ProveedorPrueba } from './proveedores/prueba.ts';
import { almacenDelNavegador } from './sesion.ts';

export * from './contrato.ts';

/** Sin proveedor disponible: el login se ve pero responde "todavía no está disponible". */
class ProveedorApagado implements ProveedorAuth {
  readonly nombre = 'apagado';
  private no(): Promise<never> {
    return Promise.reject(new ErrorAuth('no_disponible'));
  }
  crearCuenta() { return this.no(); }
  confirmarCorreo() { return this.no(); }
  reenviarConfirmacion() { return this.no(); }
  entrar() { return this.no(); }
  entrarConGoogle() { return this.no(); }
  pedirRecuperacion() { return this.no(); }
  cambiarClave() { return this.no(); }
  sesionActual(): Promise<Sesion | null> { return Promise.resolve(null); }
  salir(): Promise<void> { return Promise.resolve(); }
}

let unico: (ProveedorAuth & Partial<ProveedorAdmin>) | null = null;

export function proveedor(): ProveedorAuth & Partial<ProveedorAdmin> {
  if (unico) return unico;
  const env = import.meta.env;
  const nombre = String(env.VITE_AUTH_PROVEEDOR || 'prueba');
  if (nombre === 'prueba') {
    const permitido = !env.PROD || env.VITE_AUTH_PRUEBA_EN_PRODUCCION === '1';
    unico = permitido
      ? new ProveedorPrueba({
          almacen: almacenDelNavegador('local'),
          sesionRecordada: almacenDelNavegador('local'),
          sesionTemporal: almacenDelNavegador('sesion'),
          origen: window.location.origin,
          retardoMs: 450,
        })
      : new ProveedorApagado();
  } else {
    // Aquí se conecta el proveedor de la nube cuando exista: new ProveedorNube({...}).
    unico = new ProveedorApagado();
  }
  return unico;
}

export function googleClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '');
}
