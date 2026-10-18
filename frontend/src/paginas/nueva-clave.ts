/* MACHEA — /acceso/nueva-clave/?token=…: crear una contraseña nueva desde el enlace del correo. */

import './estilos.css';
import { ErrorAuth, esErrorAuth, proveedor } from '../auth/index.ts';
import { validarClave } from '../auth/validacion.ts';
import { logoHtml } from './marca.ts';
import { $, avisoHtml, campoHtml, conectarMedidor, conectarOjos, errorCampo, ic, mensajeDeError, montarHerramientasDePrueba, ocupado, validarEnVivo, valor } from './ui.ts';

const p = proveedor();
const token = new URLSearchParams(location.search).get('token') || '';
// El token no se queda en la barra de direcciones ni en el historial (ni en capturas de pantalla).
if (location.search) history.replaceState(null, '', location.pathname);

const raiz = document.getElementById('app') as HTMLElement;
raiz.innerHTML =
  `<div class="centrada"><header class="cabeza"><a href="/" aria-label="Machea, ir al inicio">${logoHtml()}</a></header>` +
  `<main class="tarjeta entra" id="tarjeta"></main></div>`;
const tarjeta = $('#tarjeta');
conectarOjos(tarjeta);

function sinEnlace(texto: string): void {
  tarjeta.innerHTML =
    `<div class="estado"><div class="icono">${ic('alerta')}</div><h1 tabindex="-1">El enlace ya no sirve</h1>` +
    `<p class="sub">${texto}</p><a class="boton" href="/acceso/#olvido">Pedir un enlace nuevo</a>` +
    `<p class="debajo"><a href="/acceso/">Volver a entrar</a></p></div>`;
  $<HTMLElement>('h1', tarjeta).focus();
}

if (!token) {
  sinEnlace('Abre el enlace completo que te enviamos por correo, o pide uno nuevo.');
} else {
  tarjeta.innerHTML =
    `<h1 tabindex="-1">Crea una contraseña nueva</h1><p class="sub">Usa al menos 10 caracteres. Al guardarla se cerrará la sesión en tus otros dispositivos.</p>` +
    `<form id="form" novalidate>` +
    campoHtml({ id: 'clave', etiqueta: 'Contraseña nueva', tipo: 'password', autocomplete: 'new-password', placeholder: 'Mínimo 10 caracteres', medidor: true, ayuda: 'Una frase larga es más segura que símbolos raros.' }) +
    campoHtml({ id: 'repetir', etiqueta: 'Repítela', tipo: 'password', autocomplete: 'new-password', placeholder: 'Escríbela otra vez' }) +
    `<div id="error-form"></div><button class="boton" type="submit" id="enviar">Guardar contraseña</button></form>`;
  conectarMedidor('clave');
  validarEnVivo('clave', () => validarClave(valor('clave')));
  validarEnVivo('repetir', () => (valor('repetir') && valor('repetir') !== valor('clave') ? 'Las dos contraseñas no coinciden.' : null));

  const form = document.getElementById('form') as HTMLFormElement;
  const enviar = document.getElementById('enviar') as HTMLButtonElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const caja = document.getElementById('error-form') as HTMLElement;
    caja.innerHTML = '';
    const err1 = validarClave(valor('clave'));
    const err2 = !err1 && valor('repetir') !== valor('clave') ? 'Las dos contraseñas no coinciden.' : null;
    errorCampo('clave', err1);
    errorCampo('repetir', err2);
    if (err1 || err2) return void document.getElementById(err1 ? 'clave' : 'repetir')?.focus();
    try {
      await ocupado(enviar, () => p.cambiarClave({ token, clave: valor('clave') }));
      location.assign('/acceso/?clave=cambiada');
    } catch (err) {
      if (esErrorAuth(err) && err.codigo === 'enlace_invalido') {
        sinEnlace('El enlace venció o ya se usó. Los enlaces para cambiar la contraseña duran una hora y sirven una sola vez.');
      } else if (err instanceof ErrorAuth && err.codigo === 'datos_invalidos' && err.campos.clave) {
        errorCampo('clave', err.campos.clave);
        document.getElementById('clave')?.focus();
      } else {
        caja.innerHTML = avisoHtml(mensajeDeError(err), 'error');
      }
    }
  });
}

montarHerramientasDePrueba(p);
