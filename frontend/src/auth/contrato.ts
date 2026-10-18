/* MACHEA — Contrato del login.
 *
 * Es la ÚNICA frontera entre las pantallas (/acceso/, /inicio/, /admin) y quien guarda las cuentas.
 * Machea piensa migrar de Supabase a otro servicio de nube, así que nada fuera de `proveedores/`
 * sabe qué nube hay detrás: migrar es escribir otro proveedor que cumpla esta interfaz.
 *
 * Una cuenta = una empresa (constructora o inmobiliaria). Ciclo de vida:
 *   sin_confirmar ──(confirma el correo)──> pendiente ──(Machea la aprueba en /admin)──> aprobada
 *                                                     └─(Machea la rechaza)──────────> rechazada
 * Una cuenta creada con Google llega ya confirmada: Google verificó el correo.
 */

export type TipoEmpresa = 'constructora' | 'inmobiliaria';
export type EstadoCuenta = 'sin_confirmar' | 'pendiente' | 'aprobada' | 'rechazada';
export type MetodoAcceso = 'correo' | 'google';

export interface Cuenta {
  id: string;
  /** Nombre de usuario público de la empresa, p. ej. `constructora-andes`. */
  usuario: string;
  correo: string;
  estado: EstadoCuenta;
  /** Lo marca Machea al aprobar; el registro no lo pregunta (registro mínimo, D12). */
  tipo: TipoEmpresa | null;
  metodos: MetodoAcceso[];
  /** ISO 8601. */
  creadaEn: string;
}

export interface Sesion {
  cuenta: Cuenta;
  /** ISO 8601. */
  expiraEn: string;
}

export interface DatosRegistro {
  usuario: string;
  correo: string;
  clave: string;
}

export interface DatosEntrada {
  correo: string;
  clave: string;
  /** true: la sesión sobrevive al cierre del navegador; false: solo dura la pestaña. */
  recordar: boolean;
}

export interface DatosGoogle {
  /** El ID token (JWT) que entrega el botón oficial de Google. El proveedor lo verifica en el servidor. */
  idToken: string;
  /** El nonce en crudo; a Google se le pasó su SHA-256. */
  nonce: string;
  recordar: boolean;
}

export interface ProveedorAuth {
  readonly nombre: string;

  /** Crea la cuenta en `sin_confirmar` y envía el correo de confirmación. */
  crearCuenta(datos: DatosRegistro): Promise<{ correo: string }>;
  confirmarCorreo(token: string): Promise<void>;
  /** Siempre resuelve, exista o no el correo: no revela qué correos tienen cuenta. */
  reenviarConfirmacion(correo: string): Promise<void>;

  entrar(datos: DatosEntrada): Promise<Sesion>;
  /** Entra o, si el correo no tiene cuenta, la crea en `pendiente` con un usuario sugerido. */
  entrarConGoogle(datos: DatosGoogle): Promise<Sesion>;

  /** Siempre resuelve, exista o no el correo. */
  pedirRecuperacion(correo: string): Promise<void>;
  cambiarClave(datos: { token: string; clave: string }): Promise<void>;

  sesionActual(): Promise<Sesion | null>;
  salir(): Promise<void>;
}

/** Lo que usa /admin para aprobar cuentas (D11). En la nube vive detrás del backend, nunca en el navegador. */
export interface ProveedorAdmin {
  listarCuentas(filtro?: { estado?: EstadoCuenta }): Promise<Cuenta[]>;
  aprobar(id: string, tipo: TipoEmpresa): Promise<Cuenta>;
  rechazar(id: string): Promise<Cuenta>;
}

export type CodigoError =
  | 'datos_invalidos'
  | 'credenciales'
  | 'correo_sin_confirmar'
  | 'usuario_ocupado'
  | 'correo_ocupado'
  | 'enlace_invalido'
  | 'google_invalido'
  | 'demasiados_intentos'
  | 'no_disponible'
  | 'sin_conexion'
  | 'desconocido';

/** Textos listos para mostrar. Ninguno revela si un correo existe (salvo "correo_ocupado" al registrarse). */
export const MENSAJES: Record<CodigoError, string> = {
  datos_invalidos: 'Revisa los datos marcados.',
  credenciales: 'El correo o la contraseña no coinciden.',
  correo_sin_confirmar: 'Confirma tu correo antes de entrar. Te podemos reenviar el enlace.',
  usuario_ocupado: 'Ese nombre de usuario ya está en uso.',
  correo_ocupado: 'Ese correo ya tiene una cuenta. Entra o recupera tu contraseña.',
  enlace_invalido: 'El enlace venció o ya se usó. Pide uno nuevo.',
  google_invalido: 'No pudimos verificar tu cuenta de Google. Intenta de nuevo.',
  demasiados_intentos: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
  no_disponible: 'El acceso todavía no está disponible.',
  sin_conexion: 'No hay conexión. Revisa tu internet e intenta de nuevo.',
  desconocido: 'Algo salió mal. Intenta de nuevo.',
};

export class ErrorAuth extends Error {
  readonly codigo: CodigoError;
  /** Errores por campo (`usuario`, `correo`, `clave`) cuando el código es `datos_invalidos`. */
  readonly campos: Partial<Record<keyof DatosRegistro, string>>;

  constructor(codigo: CodigoError, campos: Partial<Record<keyof DatosRegistro, string>> = {}) {
    super(MENSAJES[codigo]);
    this.name = 'ErrorAuth';
    this.codigo = codigo;
    this.campos = campos;
  }
}

export function esErrorAuth(e: unknown): e is ErrorAuth {
  return e instanceof ErrorAuth;
}
