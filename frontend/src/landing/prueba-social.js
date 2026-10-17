/* ==========================================================================
   PRUEBA SOCIAL de la landing (la franja justo encima de la demo).

   REGLA: aquí solo va lo REAL y verificable. Nada de logos de empresas que no
   sean clientes o pilotos autorizados, ni calificaciones o cifras inventadas.
   Mientras todo esté vacío (null / []), la franja no se muestra.

   Cómo completarla:
     - logos: pon el archivo en `frontend/public/logos/` (SVG o PNG con fondo
       transparente, de preferencia en una sola tinta) y agrégalo abajo. Solo de
       clientes que hayan autorizado mostrar su marca.
     - resumen: una cifra que se pueda comprobar (p. ej. las llamadas que Manuela
       lleva hechas según el panel de Dapta o el de /admin/).
     - calificacion: puntaje real y de dónde sale (Google, G2…).
   ========================================================================== */
export const PRUEBA_SOCIAL = {
  titulo: null,        // p. ej. 'Empresas que ya perfilan sus leads con Machea'
  logos: [],           // p. ej. [{ nombre: 'Constructora X', src: '/logos/constructora-x.svg' }]
  resumen: null,       // p. ej. '+1.200 llamadas de calificación hechas por Manuela'
  calificacion: null,  // p. ej. { puntaje: 4.8, resenas: 36, fuente: 'Google', url: 'https://…' }
};

const estrella = (llena) => {
  const id = 'st' + Math.random().toString(36).slice(2, 8);
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}"><stop offset="${Math.round(llena * 100)}%" stop-color="#f5a623"/><stop offset="${Math.round(llena * 100)}%" stop-color="#e3dfd9"/></linearGradient></defs><path fill="url(#${id})" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>`;
};
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const calificacionReal = (datos) => (datos.calificacion && Number(datos.calificacion.puntaje) > 0 ? datos.calificacion : null);

function htmlCalificacion(cal) {
  const p = Math.max(0, Math.min(5, Number(cal.puntaje)));
  const e = [0, 1, 2, 3, 4].map((i) => estrella(Math.max(0, Math.min(1, p - i)))).join('');
  const detalle = [cal.resenas ? `${esc(cal.resenas)} reseñas` : '', cal.fuente ? `en ${esc(cal.fuente)}` : ''].filter(Boolean).join(' ');
  const texto = `<b>${p.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>${detalle ? ` · ${detalle}` : ''}`;
  return `<span class="stars-row" role="img" aria-label="Calificación ${p} de 5">${e}</span><span>${cal.url ? `<a href="${esc(cal.url)}" target="_blank" rel="noopener">${texto}</a>` : texto}</span>`;
}

// Estrellas del hero: solo si hay una calificación REAL cargada arriba.
export function pintarCalificacionHero(host, datos = PRUEBA_SOCIAL) {
  if (!host) return;
  const cal = calificacionReal(datos);
  if (!cal) { host.hidden = true; return; }
  host.innerHTML = htmlCalificacion(cal);
  host.hidden = false;
}

// Franja bajo el hero. Si la calificación ya se muestra en el hero, aquí no se repite.
export function pintarPruebaSocial(host, datos = PRUEBA_SOCIAL, { conCalificacion = false } = {}) {
  if (!host) return;
  const logos = (datos.logos || []).filter((l) => l && l.src);
  const cal = conCalificacion ? calificacionReal(datos) : null;
  if (!logos.length && !datos.resumen && !cal) { host.hidden = true; return; }
  const partes = [];
  if (datos.titulo || datos.resumen) partes.push(`<p class="trust-k">${esc(datos.titulo || datos.resumen)}</p>`);
  if (logos.length) partes.push(`<div class="trust-logos">${logos.map((l) => `<img src="${esc(l.src)}" alt="${esc(l.nombre || '')}" height="30" loading="lazy" decoding="async">`).join('')}</div>`);
  if (datos.titulo && datos.resumen) partes.push(`<p class="trust-k">${esc(datos.resumen)}</p>`);
  if (cal) partes.push(`<div class="trust-rate">${htmlCalificacion(cal)}</div>`);
  host.innerHTML = partes.join('');
  host.hidden = false;
}
