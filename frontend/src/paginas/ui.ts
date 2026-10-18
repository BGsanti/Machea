/* MACHEA — Piezas compartidas de las pantallas del login (/acceso/, /acceso/nueva-clave/, /inicio/).
 * Sin librerías: HTML con plantillas y TODO dato variable escapado con `esc()` o puesto con textContent. */

import { fuerzaClave } from '../auth/validacion.ts';
import { esErrorAuth, MENSAJES, type ProveedorAdmin, type ProveedorAuth } from '../auth/contrato.ts';
import type { ProveedorPrueba } from '../auth/proveedores/prueba.ts';

export const $ = <T extends Element = HTMLElement>(sel: string, raiz: ParentNode = document): T => raiz.querySelector(sel) as T;

export function esc(texto: unknown): string {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

// ---------------------------------------------------------------- íconos (lineales, del set del formulario)
const TRAZOS: Record<string, string> = {
  ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  'ojo-no': '<path d="M3 3l18 18M10.6 5.7A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 3.9M6.4 7.4A15.6 15.6 0 0 0 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  check: '<path d="M5 12.5 10 17.5 19 7"/>',
  correo: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  atras: '<path d="M15 5l-7 7 7 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12.2 20 3.5M16.5 7l2.5 2.5M14 9.5l2 2"/>',
  cerrado: '<circle cx="12" cy="12" r="9"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7"/>',
  personas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
  telefono: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  grafica: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
};

export function ic(nombre: keyof typeof TRAZOS | string): string {
  return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${TRAZOS[nombre] || ''}</svg>`;
}

// ---------------------------------------------------------------- campos
interface OpcionesCampo {
  id: string;
  etiqueta: string;
  tipo?: 'text' | 'email' | 'password';
  autocomplete: string;
  placeholder?: string;
  valor?: string;
  medidor?: boolean;
  ayuda?: string;
}

export function campoHtml(o: OpcionesCampo): string {
  const esClave = o.tipo === 'password';
  const extra = o.tipo === 'email' ? ' inputmode="email" autocapitalize="off" spellcheck="false"' : o.tipo === 'text' ? ' autocapitalize="off" spellcheck="false"' : '';
  const ayuda = o.medidor
    ? `<div class="ayuda" id="${o.id}-ayuda"><span class="medidor" data-nivel="0" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="medidor-texto">${esc(o.ayuda || '')}</span></div>`
    : o.ayuda
      ? `<div class="ayuda" id="${o.id}-ayuda">${esc(o.ayuda)}</div>`
      : '';
  return (
    `<div class="campo" data-campo="${o.id}">` +
    `<label for="${o.id}">${esc(o.etiqueta)}</label>` +
    `<div class="entrada${esClave ? ' clave' : ''}">` +
    `<input id="${o.id}" name="${o.id}" type="${o.tipo || 'text'}" autocomplete="${o.autocomplete}"${extra}` +
    ` placeholder="${esc(o.placeholder || '')}" value="${esc(o.valor || '')}"` +
    `${ayuda ? ` aria-describedby="${o.id}-ayuda"` : ''}>` +
    (esClave ? `<button type="button" class="ojo" aria-label="Mostrar la contraseña" aria-pressed="false" data-ojo="${o.id}">${ic('ojo')}</button>` : '') +
    `</div>${ayuda}<div class="error" id="${o.id}-error" hidden></div></div>`
  );
}

/** Marca o limpia el error de un campo, con aria-invalid y aria-describedby. */
export function errorCampo(id: string, mensaje: string | null | undefined): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const caja = document.getElementById(`${id}-error`);
  const campo = input?.closest('.campo');
  if (!input || !caja || !campo) return;
  const ayuda = document.getElementById(`${id}-ayuda`) ? `${id}-ayuda` : '';
  if (mensaje) {
    caja.innerHTML = `${ic('alerta')}<span></span>`;
    (caja.querySelector('span') as HTMLElement).textContent = mensaje;
    caja.hidden = false;
    campo.classList.add('mal');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', [ayuda, `${id}-error`].filter(Boolean).join(' '));
  } else {
    caja.hidden = true;
    campo.classList.remove('mal');
    input.removeAttribute('aria-invalid');
    if (ayuda) input.setAttribute('aria-describedby', ayuda);
    else input.removeAttribute('aria-describedby');
  }
}

export function valor(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
}

/** Valida un campo al salir de él y, si ya tenía error, mientras se escribe. */
export function validarEnVivo(id: string, validar: () => string | null): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  if (!input) return;
  input.addEventListener('blur', () => {
    if (input.value) errorCampo(id, validar());
  });
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') errorCampo(id, validar());
  });
}

export function conectarMedidor(id: string): void {
  const input = document.getElementById(id) as HTMLInputElement | null;
  const medidor = document.querySelector<HTMLElement>(`#${id}-ayuda .medidor`);
  const texto = document.querySelector<HTMLElement>(`#${id}-ayuda .medidor-texto`);
  if (!input || !medidor || !texto) return;
  const base = texto.textContent || '';
  input.addEventListener('input', () => {
    const f = fuerzaClave(input.value);
    medidor.dataset.nivel = String(f.nivel);
    texto.textContent = f.texto || base;
  });
}

/** Los botones "ojo" de las contraseñas (delegado: sirve para lo que se pinte después). */
export function conectarOjos(raiz: HTMLElement): void {
  raiz.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-ojo]');
    if (!b) return;
    const input = document.getElementById(b.dataset.ojo as string) as HTMLInputElement;
    const ver = input.type === 'password';
    input.type = ver ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(ver));
    b.setAttribute('aria-label', ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
    b.innerHTML = ic(ver ? 'ojo-no' : 'ojo');
  });
}

// ---------------------------------------------------------------- botones y avisos
/** Pone el botón en "cargando" mientras corre `tarea`; evita el doble envío. */
export async function ocupado<T>(boton: HTMLButtonElement, tarea: () => Promise<T>): Promise<T> {
  if (boton.getAttribute('aria-busy') === 'true') return Promise.reject(new Error('ocupado'));
  boton.setAttribute('aria-busy', 'true');
  boton.disabled = true;
  try {
    return await tarea();
  } finally {
    boton.removeAttribute('aria-busy');
    boton.disabled = false;
  }
}

export function avisoHtml(texto: string, tipo: 'info' | 'error' = 'info'): string {
  return `<div class="aviso${tipo === 'error' ? ' error' : ''}" role="${tipo === 'error' ? 'alert' : 'status'}">${ic(tipo === 'error' ? 'alerta' : 'info')}<span>${esc(texto)}</span></div>`;
}

/** El texto para mostrar de cualquier error (los de red y los inesperados también). */
export function mensajeDeError(e: unknown): string {
  if (esErrorAuth(e)) return e.message;
  if (e instanceof TypeError) return MENSAJES.sin_conexion;
  return MENSAJES.desconocido;
}

// ---------------------------------------------------------------- herramientas del proveedor de prueba
type ConPrueba = ProveedorAuth & Partial<ProveedorAdmin> & Partial<Pick<ProveedorPrueba, 'buzon' | 'reiniciar'>>;

/**
 * Panel flotante SOLO con el proveedor de prueba (nunca en producción): muestra el buzón de correos
 * simulados y deja aprobar o rechazar cuentas, para recorrer el flujo completo sin servidor ni /admin.
 */
export function montarHerramientasDePrueba(p: ConPrueba, alCambiar: () => void = () => location.reload()): void {
  if (p.nombre !== 'prueba' || !p.buzon || !p.listarCuentas || !p.aprobar || !p.rechazar) return;
  const cont = document.createElement('details');
  cont.className = 'prueba';
  cont.setAttribute('aria-label', 'Herramientas del proveedor de prueba');
  cont.innerHTML = '<summary><span><span class="marca">Prueba</span> · buzón y cuentas</span></summary>';
  document.body.appendChild(cont);
  document.body.classList.add('con-prueba');
  let abierto = false;
  cont.addEventListener('toggle', () => (abierto = cont.open));

  async function pintar() {
    const correos = p.buzon!();
    const cuentas = await p.listarCuentas!();
    cont.innerHTML =
      `<summary><span><span class="marca">Prueba</span> · buzón y cuentas</span><span>${correos.length}</span></summary>` +
      `<p>Solo existe en local: el proveedor de prueba guarda todo en este navegador.</p>` +
      `<h2>Correos enviados</h2>` +
      (correos.length
        ? `<ul>${correos.slice(0, 6).map((c) => `<li><p>${esc(c.asunto)} → ${esc(c.para)}</p><a href="${esc(c.enlace)}">Abrir el enlace</a></li>`).join('')}</ul>`
        : '<p>Ninguno todavía.</p>') +
      `<h2>Cuentas</h2>` +
      (cuentas.length
        ? `<ul>${cuentas
            .map(
              (c) =>
                `<li><p><b>${esc(c.usuario)}</b> · ${esc(c.correo)}</p><p>${esc(c.estado)}${c.tipo ? ' · ' + esc(c.tipo) : ''}</p>` +
                (c.estado === 'pendiente' || c.estado === 'rechazada'
                  ? `<button data-aprobar="${esc(c.id)}" data-tipo="constructora">Aprobar constructora</button><button data-aprobar="${esc(c.id)}" data-tipo="inmobiliaria">Aprobar inmobiliaria</button>`
                  : '') +
                (c.estado === 'pendiente' || c.estado === 'aprobada' ? `<button data-rechazar="${esc(c.id)}">Rechazar</button>` : '') +
                `</li>`,
            )
            .join('')}</ul>`
        : '<p>Ninguna todavía.</p>') +
      `<h2>Datos</h2><button data-reiniciar>Borrar todo lo de prueba</button>`;
    cont.open = abierto;
  }

  cont.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.aprobar) await p.aprobar!(b.dataset.aprobar, b.dataset.tipo as 'constructora' | 'inmobiliaria');
    else if (b.dataset.rechazar) await p.rechazar!(b.dataset.rechazar);
    else if ('reiniciar' in b.dataset) p.reiniciar?.();
    else return;
    alCambiar();
  });

  void pintar();
  window.addEventListener('focus', () => void pintar());
  document.addEventListener('machea:prueba', () => void pintar());
}

/** Avisa al panel de prueba que hay correos o cuentas nuevas. */
export function refrescarPrueba(): void {
  document.dispatchEvent(new Event('machea:prueba'));
}
