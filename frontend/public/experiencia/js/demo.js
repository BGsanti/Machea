// "Pruébalo con tu marca": viste el formulario de Machea con el nombre, los colores
// y el logo de una empresa, a partir del token del enlace (?demo=...).
//
// CÓMO FUNCIONA. El enlace lo genera el backend (api/demo.py, POST /api/demo/solicitar)
// con un token FIRMADO que lleva el nombre, el tipo (inmobiliaria o constructora), el
// color principal y de dónde sale el logo. Aquí solo se LEE para pintar: la firma no se
// comprueba en el navegador y no hace falta. Quien manda es el servidor, que verifica el
// token en cada llamada (/api/llamar): uno falso o vencido se ignora allí y Manuela habla
// como siempre, de Machea. Lo peor que puede lograr alguien que invente un token es ver
// SU propia pantalla con un nombre falso.
//
// QUÉ HACE. No toca ninguna pantalla: funde la marca de la demo en `window.GDF_MARCA`,
// que es de donde el resto de la app ya lee su nombre, su logo y sus textos. Conserva
// `slug: 'machea'`, así que mantiene la superficie clara y la estructura de Machea; el
// color lo aplica tema.js a partir de `GDF_MARCA.demo`.
//
// Va DESPUÉS de config.js (necesita MACHEA_BASE para el logo) y ANTES de tema.js (que
// pinta al cargar). Solo actúa con `marca=machea`: en el formulario de una constructora
// el parámetro se ignora.
(function () {
  'use strict';

  var HEX = /^#[0-9a-f]{6}$/i;
  var M = window.GDF_MARCA;

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function decodificar(token) {
    var partes = String(token || '').split('.');
    if (partes.length !== 3 || partes[0] !== 'v1') return null;
    var b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var d;
    try {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      d = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (e) {
      return null;
    }
    if (!d || typeof d.n !== 'string' || !d.n.trim()) return null;
    if (d.t !== 'inmobiliaria' && d.t !== 'constructora') return null;
    if (d.exp && d.exp * 1000 < Date.now()) return null;
    var colores = Array.isArray(d.c) ? d.c : [];
    return {
      nombre: d.n.trim().slice(0, 40),
      tipo: d.t,
      primario: HEX.test(colores[0] || '') ? colores[0].toLowerCase() : null,
      acento: HEX.test(colores[1] || '') ? colores[1].toLowerCase() : null,
      tieneLogo: !!(d.li || d.l),
      fondoLogo: d.lo === 'oscuro' ? 'oscuro' : 'claro',
      host: String(d.s || '').slice(0, 80),
      token: token,
    };
  }

  var token = null;
  try {
    token = new URLSearchParams(window.location.search).get('demo');
  } catch (e) {}

  var demo = M && M.slug === 'machea' && token ? decodificar(token) : null;
  window.GDF_DEMO = demo;
  if (!demo) return;

  var base = ((window.GDF_CONFIG || {}).MACHEA_BASE || '').replace(/\/$/, '');
  var logo = demo.tieneLogo && base ? base + '/marca/logo?d=' + encodeURIComponent(token) : '';

  M.demo = demo;
  M.identidad = Object.assign({}, M.identidad, { nombre: demo.nombre, logo: logo });
  M.copy = Object.assign({}, M.copy, {
    splashLead:
      'Responde jugando y descubre qué vivienda de Bogotá encaja contigo, con <strong>' + esc(demo.nombre) + '</strong>.',
    habeasData:
      'Autorizo el tratamiento de mis datos personales para esta demostración de Machea, incluida la llamada de prueba de Manuela y mi contacto por correo o WhatsApp (Habeas Data).',
  });

  // Si el logo no carga (el sitio lo bloqueó, venció el token…), se escribe el nombre:
  // nunca un icono de imagen rota delante de quien está viendo SU demo.
  document.addEventListener(
    'error',
    function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG' || String(img.src).indexOf('/marca/logo?d=') < 0) return;
      var span = document.createElement('span');
      span.className = 'gdf-logo-texto';
      span.textContent = demo.nombre;
      if (img.parentNode) img.parentNode.replaceChild(span, img);
    },
    true
  );

  // Una etiqueta fija, siempre visible: esto es una demostración, no el sitio de la empresa.
  function etiqueta() {
    if (document.querySelector('.gdf-demo-badge')) return;
    var b = document.createElement('div');
    b.className = 'gdf-demo-badge';
    b.setAttribute('role', 'note');
    b.innerHTML = 'Demo de <b>Machea</b> para <b>' + esc(demo.nombre) + '</b> · datos de ejemplo';
    document.body.appendChild(b);
  }
  if (document.body) etiqueta();
  else document.addEventListener('DOMContentLoaded', etiqueta);
})();
