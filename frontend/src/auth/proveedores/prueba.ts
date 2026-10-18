/* MACHEA — Proveedor de PRUEBA del login: todo vive en el navegador, sin red.
 *
 * Sirve para diseñar, probar y hacer demos del flujo completo mientras se elige la nube (D8). Cumple el
 * mismo contrato que cumplirá el proveedor real, así que las pantallas no cambian al migrar.
 *
 * NO ES SEGURO Y NUNCA DEBE ATENDER A USUARIOS REALES:
 *   - las cuentas y las claves (con hash, pero en el navegador) viven en localStorage;
 *   - los "correos" no se envían: quedan en un buzón local (`buzon()`) para abrir el enlace a mano;
 *   - el token de Google se lee SIN verificar la firma (el real lo verifica en el servidor).
 * `index.ts` lo apaga en producción salvo que se pida explícitamente.
 */

import {
  ErrorAuth,
  type Cuenta,
  type DatosEntrada,
  type DatosGoogle,
  type DatosRegistro,
  type EstadoCuenta,
  type ProveedorAdmin,
  type ProveedorAuth,
  type Sesion,
  type TipoEmpresa,
} from '../contrato.ts';
import { leerJwtSinVerificar, sha256Hex, tokenAleatorio } from '../cripto.ts';
import { type Almacen } from '../sesion.ts';
import { normalizarCorreo, normalizarUsuario, sugerirUsuario, validarClave, validarCorreo, validarRegistro } from '../validacion.ts';

const CLAVE_BASE = 'machea.auth.prueba.v1';
const CLAVE_SESION = 'machea.auth.sesion';
const MINUTO = 60_000;
const VIGENCIA = {
  confirmar: 24 * 60 * MINUTO,
  recuperar: 60 * MINUTO,
  sesionRecordada: 30 * 24 * 60 * MINUTO,
  sesionTemporal: 12 * 60 * MINUTO,
};
const INTENTOS_MAX = 5;
const INTENTOS_VENTANA = 15 * MINUTO;

interface Registro {
  cuenta: Cuenta;
  sal: string;
  /** null = la cuenta solo entra con Google. */
  claveHash: string | null;
  googleSub: string | null;
}

interface TokenEnlace {
  tipo: 'confirmar' | 'recuperar';
  cuentaId: string;
  expira: number;
}

export interface CorreoDePrueba {
  para: string;
  asunto: string;
  enlace: string;
  enviadoEn: string;
}

interface Base {
  cuentas: Registro[];
  /** Por hash del token: ni siquiera aquí se guarda el token en claro. */
  enlaces: Record<string, TokenEnlace>;
  sesiones: Record<string, { cuentaId: string; expira: number }>;
  intentos: Record<string, number[]>;
  buzon: CorreoDePrueba[];
}

export interface OpcionesPrueba {
  /** Donde vive la "base de datos" (localStorage en el navegador, memoria en pruebas). */
  almacen: Almacen;
  /** Donde va la sesión con "Recordarme" (localStorage). */
  sesionRecordada: Almacen;
  /** Donde va la sesión sin "Recordarme" (sessionStorage). */
  sesionTemporal: Almacen;
  /** Origen para armar los enlaces de los correos, p. ej. http://localhost:5173. */
  origen: string;
  /** Espera simulada de red en ms, para ver los estados de carga. */
  retardoMs?: number;
  ahora?: () => number;
}

function baseVacia(): Base {
  return { cuentas: [], enlaces: {}, sesiones: {}, intentos: {}, buzon: [] };
}

export class ProveedorPrueba implements ProveedorAuth, ProveedorAdmin {
  readonly nombre = 'prueba';
  private readonly op: Required<OpcionesPrueba>;

  constructor(opciones: OpcionesPrueba) {
    this.op = { retardoMs: 0, ahora: () => Date.now(), ...opciones };
  }

  // ------------------------------------------------------------------ persistencia
  private leer(): Base {
    try {
      const crudo = this.op.almacen.getItem(CLAVE_BASE);
      return crudo ? { ...baseVacia(), ...JSON.parse(crudo) } : baseVacia();
    } catch {
      return baseVacia();
    }
  }
  private guardar(b: Base): void {
    this.op.almacen.setItem(CLAVE_BASE, JSON.stringify(b));
  }
  private async esperar(): Promise<void> {
    if (this.op.retardoMs > 0) await new Promise((r) => setTimeout(r, this.op.retardoMs));
  }
  private copia(c: Cuenta): Cuenta {
    return { ...c, metodos: [...c.metodos] };
  }

  // ------------------------------------------------------------------ utilidades
  private async hashClave(sal: string, clave: string): Promise<string> {
    return sha256Hex(sal + ':' + clave);
  }

  private async emitirEnlace(b: Base, tipo: TokenEnlace['tipo'], cuenta: Cuenta): Promise<void> {
    // Un enlace nuevo invalida los anteriores del mismo tipo para esa cuenta.
    for (const [h, t] of Object.entries(b.enlaces)) if (t.cuentaId === cuenta.id && t.tipo === tipo) delete b.enlaces[h];
    const token = tokenAleatorio();
    b.enlaces[await sha256Hex(token)] = { tipo, cuentaId: cuenta.id, expira: this.op.ahora() + VIGENCIA[tipo] };
    const ruta = tipo === 'confirmar' ? '/acceso/?confirmar=' : '/acceso/nueva-clave/?token=';
    b.buzon.unshift({
      para: cuenta.correo,
      asunto: tipo === 'confirmar' ? 'Confirma tu correo en Machea' : 'Crea una contraseña nueva en Machea',
      enlace: this.op.origen.replace(/\/$/, '') + ruta + token,
      enviadoEn: new Date(this.op.ahora()).toISOString(),
    });
    b.buzon = b.buzon.slice(0, 20);
  }

  /** La cuenta del enlace, sin gastarlo. Lanza `enlace_invalido` si no existe, venció o es de otro tipo. */
  private async verEnlace(b: Base, tipo: TokenEnlace['tipo'], token: string): Promise<{ reg: Registro; hash: string }> {
    const hash = await sha256Hex(String(token || ''));
    const t = b.enlaces[hash];
    const reg = t && t.tipo === tipo && t.expira > this.op.ahora() ? b.cuentas.find((r) => r.cuenta.id === t.cuentaId) : undefined;
    if (!reg) throw new ErrorAuth('enlace_invalido');
    return { reg, hash };
  }

  private async consumirEnlace(b: Base, tipo: TokenEnlace['tipo'], token: string): Promise<Registro> {
    const { reg, hash } = await this.verEnlace(b, tipo, token);
    delete b.enlaces[hash];
    return reg;
  }

  private limiteIntentos(b: Base, correo: string): void {
    const ahora = this.op.ahora();
    const recientes = (b.intentos[correo] || []).filter((t) => ahora - t < INTENTOS_VENTANA);
    b.intentos[correo] = recientes;
    if (recientes.length >= INTENTOS_MAX) throw new ErrorAuth('demasiados_intentos');
  }

  private abrirSesion(b: Base, reg: Registro, recordar: boolean): Sesion {
    const token = tokenAleatorio();
    const expira = this.op.ahora() + (recordar ? VIGENCIA.sesionRecordada : VIGENCIA.sesionTemporal);
    b.sesiones[token] = { cuentaId: reg.cuenta.id, expira };
    // Una sola sesión guardada a la vez: la del otro almacén se borra.
    (recordar ? this.op.sesionTemporal : this.op.sesionRecordada).removeItem(CLAVE_SESION);
    (recordar ? this.op.sesionRecordada : this.op.sesionTemporal).setItem(CLAVE_SESION, token);
    return { cuenta: this.copia(reg.cuenta), expiraEn: new Date(expira).toISOString() };
  }

  private usuarioLibre(b: Base, base: string): string {
    let u = base;
    for (let n = 2; b.cuentas.some((r) => r.cuenta.usuario === u); n++) u = `${base.slice(0, 26)}-${n}`;
    return u;
  }

  // ------------------------------------------------------------------ ProveedorAuth
  async crearCuenta(d: DatosRegistro): Promise<{ correo: string }> {
    await this.esperar();
    const errores = validarRegistro(d);
    if (Object.keys(errores).length) throw new ErrorAuth('datos_invalidos', errores);
    const usuario = normalizarUsuario(d.usuario);
    const correo = normalizarCorreo(d.correo);
    const b = this.leer();
    if (b.cuentas.some((r) => r.cuenta.correo === correo)) throw new ErrorAuth('correo_ocupado');
    if (b.cuentas.some((r) => r.cuenta.usuario === usuario)) throw new ErrorAuth('usuario_ocupado');

    const sal = tokenAleatorio(16);
    const cuenta: Cuenta = {
      id: tokenAleatorio(8),
      usuario,
      correo,
      estado: 'sin_confirmar',
      tipo: null,
      metodos: ['correo'],
      creadaEn: new Date(this.op.ahora()).toISOString(),
    };
    b.cuentas.push({ cuenta, sal, claveHash: await this.hashClave(sal, d.clave), googleSub: null });
    await this.emitirEnlace(b, 'confirmar', cuenta);
    this.guardar(b);
    return { correo };
  }

  async confirmarCorreo(token: string): Promise<void> {
    await this.esperar();
    const b = this.leer();
    const reg = await this.consumirEnlace(b, 'confirmar', token);
    if (reg.cuenta.estado === 'sin_confirmar') reg.cuenta.estado = 'pendiente';
    this.guardar(b);
  }

  async reenviarConfirmacion(correo: string): Promise<void> {
    await this.esperar();
    const b = this.leer();
    const reg = b.cuentas.find((r) => r.cuenta.correo === normalizarCorreo(correo));
    if (reg && reg.cuenta.estado === 'sin_confirmar') {
      await this.emitirEnlace(b, 'confirmar', reg.cuenta);
      this.guardar(b);
    }
  }

  async entrar(d: DatosEntrada): Promise<Sesion> {
    await this.esperar();
    const correo = normalizarCorreo(d.correo);
    if (validarCorreo(correo) || !d.clave) throw new ErrorAuth('credenciales');
    const b = this.leer();
    this.limiteIntentos(b, correo);
    const reg = b.cuentas.find((r) => r.cuenta.correo === correo);
    const ok = !!reg && !!reg.claveHash && (await this.hashClave(reg.sal, d.clave)) === reg.claveHash;
    if (!ok || !reg) {
      b.intentos[correo].push(this.op.ahora());
      this.guardar(b);
      throw new ErrorAuth('credenciales');
    }
    delete b.intentos[correo];
    if (reg.cuenta.estado === 'sin_confirmar') {
      this.guardar(b);
      throw new ErrorAuth('correo_sin_confirmar');
    }
    const sesion = this.abrirSesion(b, reg, d.recordar);
    this.guardar(b);
    return sesion;
  }

  async entrarConGoogle(d: DatosGoogle): Promise<Sesion> {
    await this.esperar();
    // OJO: solo se lee el token. El proveedor real verifica firma, emisor, audiencia y vencimiento en el servidor.
    const t = leerJwtSinVerificar(d.idToken);
    const correo = normalizarCorreo(String(t?.email || ''));
    const nonceOk = !t?.nonce || t.nonce === (await sha256Hex(d.nonce));
    const vigente = typeof t?.exp !== 'number' || t.exp * 1000 > this.op.ahora();
    if (!t || !correo || t.email_verified === false || !nonceOk || !vigente || validarCorreo(correo)) {
      throw new ErrorAuth('google_invalido');
    }
    const sub = String(t.sub || correo);
    const b = this.leer();
    let reg = b.cuentas.find((r) => r.googleSub === sub) || b.cuentas.find((r) => r.cuenta.correo === correo);
    if (reg) {
      // Google ya verificó el correo: se vincula y, si faltaba confirmar, queda confirmado.
      reg.googleSub = sub;
      if (!reg.cuenta.metodos.includes('google')) reg.cuenta.metodos.push('google');
      if (reg.cuenta.estado === 'sin_confirmar') reg.cuenta.estado = 'pendiente';
    } else {
      const base = sugerirUsuario(String(t.name || correo.split('@')[0]));
      reg = {
        cuenta: {
          id: tokenAleatorio(8),
          usuario: this.usuarioLibre(b, base),
          correo,
          estado: 'pendiente',
          tipo: null,
          metodos: ['google'],
          creadaEn: new Date(this.op.ahora()).toISOString(),
        },
        sal: tokenAleatorio(16),
        claveHash: null,
        googleSub: sub,
      };
      b.cuentas.push(reg);
    }
    const sesion = this.abrirSesion(b, reg, d.recordar);
    this.guardar(b);
    return sesion;
  }

  async pedirRecuperacion(correo: string): Promise<void> {
    await this.esperar();
    const b = this.leer();
    const reg = b.cuentas.find((r) => r.cuenta.correo === normalizarCorreo(correo));
    if (reg) {
      await this.emitirEnlace(b, 'recuperar', reg.cuenta);
      this.guardar(b);
    }
  }

  async cambiarClave(d: { token: string; clave: string }): Promise<void> {
    await this.esperar();
    const b = this.leer();
    // Primero se valida la clave y solo después se gasta el enlace: si la clave no sirve, la persona
    // corrige y reintenta con el mismo enlace.
    const { reg: previa } = await this.verEnlace(b, 'recuperar', d.token);
    const error = validarClave(d.clave, { usuario: previa.cuenta.usuario, correo: previa.cuenta.correo });
    if (error) throw new ErrorAuth('datos_invalidos', { clave: error });
    const reg = await this.consumirEnlace(b, 'recuperar', d.token);
    reg.sal = tokenAleatorio(16);
    reg.claveHash = await this.hashClave(reg.sal, d.clave);
    if (!reg.cuenta.metodos.includes('correo')) reg.cuenta.metodos.push('correo');
    // Abrir el enlace prueba que el correo es suyo.
    if (reg.cuenta.estado === 'sin_confirmar') reg.cuenta.estado = 'pendiente';
    // Cambiar la clave cierra todas las sesiones abiertas.
    for (const [k, s] of Object.entries(b.sesiones)) if (s.cuentaId === reg.cuenta.id) delete b.sesiones[k];
    this.guardar(b);
  }

  async sesionActual(): Promise<Sesion | null> {
    const token = this.op.sesionRecordada.getItem(CLAVE_SESION) || this.op.sesionTemporal.getItem(CLAVE_SESION);
    if (!token) return null;
    const b = this.leer();
    const s = b.sesiones[token];
    const reg = s && s.expira > this.op.ahora() ? b.cuentas.find((r) => r.cuenta.id === s.cuentaId) : undefined;
    if (!s || !reg) {
      if (s) {
        delete b.sesiones[token];
        this.guardar(b);
      }
      this.op.sesionRecordada.removeItem(CLAVE_SESION);
      this.op.sesionTemporal.removeItem(CLAVE_SESION);
      return null;
    }
    return { cuenta: this.copia(reg.cuenta), expiraEn: new Date(s.expira).toISOString() };
  }

  async salir(): Promise<void> {
    const token = this.op.sesionRecordada.getItem(CLAVE_SESION) || this.op.sesionTemporal.getItem(CLAVE_SESION);
    this.op.sesionRecordada.removeItem(CLAVE_SESION);
    this.op.sesionTemporal.removeItem(CLAVE_SESION);
    if (token) {
      const b = this.leer();
      delete b.sesiones[token];
      this.guardar(b);
    }
  }

  // ------------------------------------------------------------------ ProveedorAdmin
  async listarCuentas(filtro: { estado?: EstadoCuenta } = {}): Promise<Cuenta[]> {
    await this.esperar();
    return this.leer()
      .cuentas.map((r) => this.copia(r.cuenta))
      .filter((c) => !filtro.estado || c.estado === filtro.estado)
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));
  }

  private async cambiarEstado(id: string, estado: 'aprobada' | 'rechazada', tipo: TipoEmpresa | null): Promise<Cuenta> {
    await this.esperar();
    const b = this.leer();
    const reg = b.cuentas.find((r) => r.cuenta.id === id);
    if (!reg || reg.cuenta.estado === 'sin_confirmar') throw new ErrorAuth('datos_invalidos');
    reg.cuenta.estado = estado;
    if (tipo) reg.cuenta.tipo = tipo;
    this.guardar(b);
    return this.copia(reg.cuenta);
  }

  aprobar(id: string, tipo: TipoEmpresa): Promise<Cuenta> {
    if (tipo !== 'constructora' && tipo !== 'inmobiliaria') return Promise.reject(new ErrorAuth('datos_invalidos'));
    return this.cambiarEstado(id, 'aprobada', tipo);
  }

  rechazar(id: string): Promise<Cuenta> {
    return this.cambiarEstado(id, 'rechazada', null);
  }

  // ------------------------------------------------------------------ solo para la demo local
  /** Los "correos" enviados, del más nuevo al más viejo. */
  buzon(): CorreoDePrueba[] {
    return this.leer().buzon.map((c) => ({ ...c }));
  }

  /** Borra todo lo del proveedor de prueba. */
  reiniciar(): void {
    this.op.almacen.removeItem(CLAVE_BASE);
    this.op.sesionRecordada.removeItem(CLAVE_SESION);
    this.op.sesionTemporal.removeItem(CLAVE_SESION);
  }
}
