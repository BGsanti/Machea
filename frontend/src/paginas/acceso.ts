/* MACHEA — /acceso/: entrar, crear cuenta, confirmar el correo y pedir el enlace para recuperar la clave.
 * Diseño: propuesta B "Centrada" (design/login/mockups/). La lógica vive en src/auth/; aquí solo pantalla.
 *
 * Vistas (el hash permite compartir el enlace): #entrar (por defecto), #crear, #olvido.
 * Estados internos sin hash: "correo" (revisa tu correo después de crear la cuenta) y "enviado" (recuperación).
 * Parámetros: ?confirmar=<token> (enlace del correo), ?clave=cambiada, ?volver=/ruta (a dónde ir al entrar).
 */

import './estilos.css';
import { ErrorAuth, esErrorAuth, googleClientId, proveedor } from '../auth/index.ts';
import { montarBotonGoogle } from '../auth/google.ts';
import { destinoSeguro } from '../auth/sesion.ts';
import { validarClave, validarCorreo, validarRegistro, validarUsuario } from '../auth/validacion.ts';
import { logoHtml } from './marca.ts';
import {
  $, avisoHtml, campoHtml, conectarMedidor, conectarOjos, errorCampo, esc, ic, mensajeDeError, montarHerramientasDePrueba,
  ocupado, refrescarPrueba, validarEnVivo, valor,
} from './ui.ts';

const RUTA_PRIVACIDAD = '/privacidad/';
const p = proveedor();
const params = new URLSearchParams(location.search);
const volver = destinoSeguro(params.get('volver'));

type Vista = 'entrar' | 'crear' | 'olvido' | 'correo' | 'enviado';
let vista: Vista = 'entrar';
let correoActual = '';
let aviso = '';

const raiz = document.getElementById('app') as HTMLElement;
raiz.innerHTML =
  `<div class="centrada"><header class="cabeza"><a href="/" aria-label="Machea, ir al inicio">${logoHtml()}</a></header>` +
  `<main class="tarjeta" id="tarjeta"></main>` +
  `<p class="pie">Al continuar aceptas la <a href="${RUTA_PRIVACIDAD}">Política de privacidad</a> de Machea.</p></div>`;
const tarjeta = $('#tarjeta');
conectarOjos(tarjeta);

// ---------------------------------------------------------------- plantillas
function selector(activa: 'entrar' | 'crear'): string {
  const b = (v: 'entrar' | 'crear', t: string) => `<button type="button" data-ir="${v}"${activa === v ? ' aria-current="page"' : ''}>${t}</button>`;
  return `<nav class="selector" aria-label="Entrar o crear cuenta">${b('entrar', 'Entrar')}${b('crear', 'Crear cuenta')}</nav>`;
}

function bloqueGoogle(): string {
  return googleClientId() ? `<div class="google" id="google"></div><div class="separador">o con tu correo</div>` : '';
}

function avisoActual(): string {
  if (!aviso) return '';
  const html = aviso;
  aviso = '';
  return html;
}

const PLANTILLAS: Record<Vista, () => string> = {
  entrar: () =>
    selector('entrar') +
    `<h1 tabindex="-1">Bienvenido de nuevo</h1><p class="sub">Entra a la cuenta de tu empresa en Machea.</p>` +
    avisoActual() +
    bloqueGoogle() +
    `<form id="form" novalidate>` +
    campoHtml({ id: 'correo', etiqueta: 'Correo', tipo: 'email', autocomplete: 'username', placeholder: 'tu@empresa.com', valor: correoActual }) +
    campoHtml({ id: 'clave', etiqueta: 'Contraseña', tipo: 'password', autocomplete: 'current-password', placeholder: 'Tu contraseña' }) +
    `<div class="fila"><label class="casilla"><input type="checkbox" id="recordar" checked><span class="caja">${ic('check')}</span>Recordarme</label>` +
    `<button type="button" class="enlace" data-ir="olvido">¿Olvidaste tu contraseña?</button></div>` +
    `<div id="error-form"></div>` +
    `<button class="boton" type="submit" id="enviar">Entrar</button></form>` +
    `<p class="debajo">¿Tu empresa aún no tiene cuenta? <button type="button" class="enlace" data-ir="crear">Crear cuenta</button></p>`,

  crear: () =>
    selector('crear') +
    `<h1 tabindex="-1">Crea la cuenta de tu empresa</h1><p class="sub">Para constructoras e inmobiliarias. Revisamos cada cuenta antes de activarla.</p>` +
    avisoActual() +
    bloqueGoogle() +
    `<form id="form" novalidate>` +
    campoHtml({ id: 'usuario', etiqueta: 'Nombre de usuario', autocomplete: 'username', placeholder: 'Ej.: constructora-andes', ayuda: 'Minúsculas, números, puntos o guiones.' }) +
    campoHtml({ id: 'correo', etiqueta: 'Correo', tipo: 'email', autocomplete: 'email', placeholder: 'tu@empresa.com', valor: correoActual }) +
    campoHtml({ id: 'clave', etiqueta: 'Contraseña', tipo: 'password', autocomplete: 'new-password', placeholder: 'Mínimo 10 caracteres', medidor: true, ayuda: 'Una frase larga es más segura que símbolos raros.' }) +
    `<label class="casilla legal" id="acepto-caja"><input type="checkbox" id="acepto"><span class="caja">${ic('check')}</span>` +
    `<span>Acepto la <a href="${RUTA_PRIVACIDAD}" target="_blank" rel="noopener">Política de privacidad</a> y el tratamiento de mis datos.</span></label>` +
    `<div id="error-form"></div>` +
    `<button class="boton" type="submit" id="enviar">Crear cuenta</button></form>` +
    `<p class="debajo">¿Ya tienes cuenta? <button type="button" class="enlace" data-ir="entrar">Entrar</button></p>`,

  correo: () =>
    `<div class="estado"><div class="icono">${ic('correo')}</div>` +
    `<h1 tabindex="-1">Confirma tu correo</h1><p class="sub">Te enviamos un enlace a <b>${esc(correoActual)}</b>. Ábrelo para confirmar que el correo es tuyo.</p>` +
    avisoActual() +
    `<ol class="pasos"><li class="hecho"><span class="punto">${ic('check')}</span>Cuenta creada</li><li class="ahora"><span class="punto">2</span>Confirma tu correo</li><li><span class="punto">3</span>Machea revisa y activa tu cuenta</li></ol>` +
    `<button class="boton secundario" type="button" id="reenviar">Reenviar el correo</button>` +
    `<p class="debajo">¿Ya lo confirmaste? <button type="button" class="enlace" data-ir="entrar">Entrar</button></p></div>`,

  olvido: () =>
    `<button type="button" class="volver" data-ir="entrar">${ic('atras')}Volver</button>` +
    `<h1 tabindex="-1">¿Olvidaste tu contraseña?</h1><p class="sub">Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva.</p>` +
    avisoActual() +
    `<form id="form" novalidate>` +
    campoHtml({ id: 'correo', etiqueta: 'Correo', tipo: 'email', autocomplete: 'username', placeholder: 'tu@empresa.com', valor: correoActual }) +
    `<div id="error-form"></div>` +
    `<button class="boton" type="submit" id="enviar">Enviar enlace</button></form>`,

  enviado: () =>
    `<div class="estado"><div class="icono navy">${ic('llave')}</div>` +
    `<h1 tabindex="-1">Revisa tu correo</h1><p class="sub">Si <b>${esc(correoActual)}</b> tiene una cuenta en Machea, te llegará un enlace para crear una contraseña nueva. Vence en una hora.</p>` +
    avisoHtml('Si no lo ves en unos minutos, revisa la carpeta de spam.') +
    `<button class="boton secundario" type="button" data-ir="entrar">Volver a entrar</button></div>`,
};

// ---------------------------------------------------------------- navegación entre vistas
function ir(v: Vista, { enfocar = true, hash = true, conservarCorreo = false } = {}): void {
  // Lo escrito en "Correo" pasa a la vista siguiente, salvo que el flujo ya fijó el correo (p. ej. el normalizado).
  const actual = document.getElementById('correo') as HTMLInputElement | null;
  if (!conservarCorreo && actual?.value) correoActual = actual.value.trim();
  vista = v;
  tarjeta.innerHTML = PLANTILLAS[v]();
  tarjeta.classList.remove('entra');
  void tarjeta.offsetWidth;
  tarjeta.classList.add('entra');
  if (hash && (v === 'entrar' || v === 'crear' || v === 'olvido')) history.replaceState(null, '', `${location.pathname}${location.search}${v === 'entrar' ? '' : '#' + v}`);
  document.title = { entrar: 'Entrar', crear: 'Crear cuenta', olvido: 'Recuperar la contraseña', correo: 'Confirma tu correo', enviado: 'Revisa tu correo' }[v] + ' · Machea';
  conectar();
  if (enfocar) $<HTMLElement>('h1', tarjeta).focus();
}

tarjeta.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-ir]');
  if (b) ir(b.dataset.ir as Vista);
});

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if ((v === 'crear' || v === 'olvido' || v === '' || v === 'entrar') && v !== vista) ir((v || 'entrar') as Vista);
});

function errorFormulario(texto: string, extraHtml = ''): void {
  const caja = document.getElementById('error-form');
  if (caja) caja.innerHTML = texto ? avisoHtml(texto, 'error') + extraHtml : '';
}

function irA(destino: string): void {
  location.assign(destino);
}

// ---------------------------------------------------------------- comportamiento de cada vista
function conectar(): void {
  const form = document.getElementById('form') as HTMLFormElement | null;
  const enviar = document.getElementById('enviar') as HTMLButtonElement | null;

  if (vista === 'entrar' || vista === 'crear') void montarGoogle();

  if (vista === 'entrar' && form && enviar) {
    validarEnVivo('correo', () => validarCorreo(valor('correo')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorFormulario('');
      const errCorreo = validarCorreo(valor('correo'));
      const errClave = valor('clave') ? null : 'Escribe tu contraseña.';
      errorCampo('correo', errCorreo);
      errorCampo('clave', errClave);
      if (errCorreo || errClave) return void document.getElementById(errCorreo ? 'correo' : 'clave')?.focus();
      try {
        await ocupado(enviar, () => p.entrar({ correo: valor('correo'), clave: valor('clave'), recordar: (document.getElementById('recordar') as HTMLInputElement).checked }));
        irA(volver);
      } catch (err) {
        if (esErrorAuth(err) && err.codigo === 'correo_sin_confirmar') {
          errorFormulario(err.message, `<button type="button" class="boton secundario" id="reenviar-entrar">Reenviar el correo de confirmación</button>`);
          document.getElementById('reenviar-entrar')?.addEventListener('click', async (ev) => {
            correoActual = valor('correo');
            await ocupado(ev.currentTarget as HTMLButtonElement, () => p.reenviarConfirmacion(correoActual));
            refrescarPrueba();
            ir('correo');
          });
        } else {
          errorFormulario(mensajeDeError(err));
          (document.getElementById('clave') as HTMLInputElement).value = '';
        }
      }
    });
  }

  if (vista === 'crear' && form && enviar) {
    validarEnVivo('usuario', () => validarUsuario(valor('usuario')));
    validarEnVivo('correo', () => validarCorreo(valor('correo')));
    validarEnVivo('clave', () => validarClave(valor('clave'), { usuario: valor('usuario'), correo: valor('correo') }));
    conectarMedidor('clave');
    const acepto = document.getElementById('acepto') as HTMLInputElement;
    acepto.addEventListener('change', () => document.getElementById('acepto-caja')?.classList.toggle('mal', false));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorFormulario('');
      const datos = { usuario: valor('usuario'), correo: valor('correo'), clave: valor('clave') };
      const errores = validarRegistro(datos);
      (['usuario', 'correo', 'clave'] as const).forEach((c) => errorCampo(c, errores[c]));
      const primero = (['usuario', 'correo', 'clave'] as const).find((c) => errores[c]);
      if (primero) return void document.getElementById(primero)?.focus();
      if (!acepto.checked) {
        document.getElementById('acepto-caja')?.classList.add('mal');
        errorFormulario('Para crear la cuenta tienes que aceptar la Política de privacidad.');
        return void acepto.focus();
      }
      try {
        const r = await ocupado(enviar, () => p.crearCuenta(datos));
        correoActual = r.correo;
        refrescarPrueba();
        ir('correo', { conservarCorreo: true });
      } catch (err) {
        if (err instanceof ErrorAuth && err.codigo === 'datos_invalidos') {
          (['usuario', 'correo', 'clave'] as const).forEach((c) => errorCampo(c, err.campos[c]));
        } else if (err instanceof ErrorAuth && err.codigo === 'correo_ocupado') {
          errorCampo('correo', err.message);
          document.getElementById('correo')?.focus();
        } else if (err instanceof ErrorAuth && err.codigo === 'usuario_ocupado') {
          errorCampo('usuario', err.message);
          document.getElementById('usuario')?.focus();
        } else {
          errorFormulario(mensajeDeError(err));
        }
      }
    });
  }

  if (vista === 'correo') {
    const b = document.getElementById('reenviar') as HTMLButtonElement;
    b.addEventListener('click', async () => {
      try {
        await ocupado(b, () => p.reenviarConfirmacion(correoActual));
        refrescarPrueba();
        // Una espera corta entre reenvíos, para no llenar la bandeja (ni el tope del proveedor).
        b.disabled = true;
        let s = 30;
        b.textContent = `Enviado. Puedes reenviar en ${s} s`;
        const t = window.setInterval(() => {
          s -= 1;
          if (s <= 0) {
            window.clearInterval(t);
            b.disabled = false;
            b.textContent = 'Reenviar el correo';
          } else b.textContent = `Enviado. Puedes reenviar en ${s} s`;
        }, 1000);
      } catch (err) {
        aviso = avisoHtml(mensajeDeError(err), 'error');
        ir('correo');
      }
    });
  }

  if (vista === 'olvido' && form && enviar) {
    validarEnVivo('correo', () => validarCorreo(valor('correo')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = validarCorreo(valor('correo'));
      errorCampo('correo', err);
      if (err) return void document.getElementById('correo')?.focus();
      try {
        await ocupado(enviar, () => p.pedirRecuperacion(valor('correo')));
        correoActual = valor('correo').trim();
        refrescarPrueba();
        ir('enviado');
      } catch (e2) {
        errorFormulario(mensajeDeError(e2));
      }
    });
  }
}

async function montarGoogle(): Promise<void> {
  const cont = document.getElementById('google');
  if (!cont) return;
  const montado = await montarBotonGoogle(cont, {
    clientId: googleClientId(),
    texto: vista === 'crear' ? 'signup_with' : 'signin_with',
    ancho: cont.clientWidth || 360,
    alRecibir: async ({ idToken, nonce }) => {
      try {
        const recordar = (document.getElementById('recordar') as HTMLInputElement | null)?.checked ?? true;
        await p.entrarConGoogle({ idToken, nonce, recordar });
        irA(volver);
      } catch (err) {
        errorFormulario(mensajeDeError(err));
      }
    },
    alFallar: () => {
      cont.nextElementSibling?.remove();
      cont.remove();
    },
  });
  if (!montado && cont.isConnected) {
    cont.nextElementSibling?.remove();
    cont.remove();
  }
}

// ---------------------------------------------------------------- arranque
async function arrancar(): Promise<void> {
  const confirmar = params.get('confirmar');
  if (confirmar !== null) {
    // El token no se queda en la barra de direcciones ni en el historial.
    params.delete('confirmar');
    history.replaceState(null, '', `${location.pathname}${params.toString() ? '?' + params : ''}`);
    try {
      await p.confirmarCorreo(confirmar);
      aviso = avisoHtml('Tu correo quedó confirmado. Ya puedes entrar: Machea revisará tu cuenta.');
    } catch (err) {
      aviso = avisoHtml(esErrorAuth(err) && err.codigo === 'enlace_invalido' ? 'El enlace de confirmación venció o ya se usó. Entra con tu correo y te ofrecemos reenviarlo.' : mensajeDeError(err), 'error');
    }
    refrescarPrueba();
  } else if (params.get('clave') === 'cambiada') {
    aviso = avisoHtml('Listo: tu contraseña cambió. Entra con la nueva.');
  } else {
    const sesion = await p.sesionActual().catch(() => null);
    if (sesion) return irA(volver);
  }
  const inicial = location.hash.slice(1);
  ir(inicial === 'crear' || inicial === 'olvido' ? inicial : 'entrar', { enfocar: false, hash: false });
  montarHerramientasDePrueba(p);
}

void arrancar();
