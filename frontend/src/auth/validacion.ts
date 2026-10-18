/* MACHEA — Validación del login, compartida por las pantallas y por los proveedores.
 * Las pantallas la usan para avisar en vivo; el proveedor la vuelve a aplicar (nunca se confía en el
 * navegador, y el proveedor real de la nube debe repetirla en el servidor). */

export const CLAVE_MIN = 10;
/** Tope generoso: frases largas sí, pero no un texto de megas para hashear. */
export const CLAVE_MAX = 128;
export const USUARIO_MIN = 3;
export const USUARIO_MAX = 30;

// Minúsculas, números, punto, guion y guion bajo; empieza y termina en letra o número.
const RE_USUARIO = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizarCorreo(correo: string): string {
  return String(correo || '').trim().toLowerCase();
}

export function normalizarUsuario(usuario: string): string {
  return String(usuario || '').trim().toLowerCase();
}

export function validarCorreo(correo: string): string | null {
  const c = normalizarCorreo(correo);
  if (!c) return 'Escribe tu correo.';
  if (c.length > 254 || !RE_CORREO.test(c)) return 'Escribe un correo válido, como nombre@empresa.com.';
  return null;
}

export function validarUsuario(usuario: string): string | null {
  const u = normalizarUsuario(usuario);
  if (!u) return 'Escribe un nombre de usuario.';
  if (u.length < USUARIO_MIN) return `Usa al menos ${USUARIO_MIN} caracteres.`;
  if (u.length > USUARIO_MAX) return `Usa máximo ${USUARIO_MAX} caracteres.`;
  if (!RE_USUARIO.test(u)) return 'Usa minúsculas, números, puntos o guiones, sin espacios ni tildes.';
  return null;
}

export function validarClave(clave: string, contexto: { usuario?: string; correo?: string } = {}): string | null {
  const c = String(clave || '');
  if (!c) return 'Escribe una contraseña.';
  if (c.length < CLAVE_MIN) return `Usa al menos ${CLAVE_MIN} caracteres.`;
  if (c.length > CLAVE_MAX) return `Usa máximo ${CLAVE_MAX} caracteres.`;
  const baja = c.toLowerCase();
  const usuario = normalizarUsuario(contexto.usuario || '');
  const local = normalizarCorreo(contexto.correo || '').split('@')[0];
  if ((usuario && baja.includes(usuario)) || (local && local.length >= 4 && baja.includes(local))) {
    return 'No uses tu usuario ni tu correo dentro de la contraseña.';
  }
  if (/^(.)\1+$/.test(c)) return 'Evita repetir el mismo carácter.';
  return null;
}

export interface Fuerza {
  /** 0 a 4, para pintar las cuatro rayitas del medidor. */
  nivel: 0 | 1 | 2 | 3 | 4;
  texto: string;
}

/** Medidor orientativo: premia el largo sobre los símbolos (una frase larga es mejor que "P@ssw0rd!"). */
export function fuerzaClave(clave: string): Fuerza {
  const c = String(clave || '');
  if (!c) return { nivel: 0, texto: '' };
  const variedad = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(c)).length;
  let nivel: Fuerza['nivel'];
  if (c.length < CLAVE_MIN) nivel = 1;
  else if (c.length < 14) nivel = variedad >= 3 ? 3 : 2;
  else nivel = variedad >= 2 ? 4 : 3;
  const textos = ['', 'Muy corta', 'Aceptable: agrega más caracteres', 'Buena', 'Muy buena'];
  return { nivel, texto: textos[nivel] };
}

/** "Constructora Ñandú S.A.S." -> "constructora-nandu-s.a.s" (para sugerir un usuario a quien entra con Google). */
export function sugerirUsuario(base: string): string {
  const limpio = String(base || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, USUARIO_MAX)
    .replace(/[._-]+$/g, '');
  return limpio.length >= USUARIO_MIN ? limpio : (limpio + '-empresa').replace(/^-/, '');
}

/** Todos los errores del registro de una vez, por campo. Vacío = válido. */
export function validarRegistro(d: { usuario: string; correo: string; clave: string }): Partial<Record<'usuario' | 'correo' | 'clave', string>> {
  const errores: Partial<Record<'usuario' | 'correo' | 'clave', string>> = {};
  const u = validarUsuario(d.usuario);
  const c = validarCorreo(d.correo);
  const k = validarClave(d.clave, { usuario: d.usuario, correo: d.correo });
  if (u) errores.usuario = u;
  if (c) errores.correo = c;
  if (k) errores.clave = k;
  return errores;
}
