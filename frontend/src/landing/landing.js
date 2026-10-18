/* ==========================================================================
   MACHEA — landing plana. Sin librerías: todo el JS pesa unos pocos KB.
   Piezas: menú, entradas suaves (solo escritorio), mini demo del formulario,
   "Empieza gratis" (demo con tu marca) y "Agenda una demo" (formulario por pasos).
   ========================================================================== */

import { pintarCalificacionHero, pintarPruebaSocial } from './prueba-social.js';

/* ---- Configuración ------------------------------------------------------- */
const CONFIG = {
  // Backend de Machea (Render). "Empieza gratis" le pide la demo con la marca.
  apiBase: 'https://machea-api.onrender.com/api',
  // Base de datos de leads (Supabase). Es la clave PUBLICABLE/anon, la misma de
  // experiencia/js/config.js: las tablas están cerradas y solo puede ejecutar
  // funciones SECURITY DEFINER (ver supabase/migrations/…solicitudes_demo.sql).
  supabaseUrl: 'https://ndfsrstnzttbmcxukixw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kZnNyc3RuenR0Ym1jeHVraXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMDU2NzcsImV4cCI6MjEwNjg4MTY3N30.rs6s2sgh6a7v6PiNqlcmpyATmf9_byjK_ilshg6qBGQ',
  email: 'equipo@machea.co',
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const root = document.documentElement;
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

window.__ml = 1; // avisa al script de la cabecera que este módulo cargó

/* ---- Entradas suaves y escenas de una sola vez: solo escritorio con puntero fino ---- */
function contar(el) {
  const to = Number(el.dataset.count), suf = el.dataset.suffix || '', t0 = performance.now(), ms = 1400;
  (function paso(t) {
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(to * e) + suf;
    if (k < 1) requestAnimationFrame(paso);
  })(t0);
}
if (root.classList.contains('anim') && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('in');
      io.unobserve(en.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  $$('.rv').forEach((el) => io.observe(el));

  // Escenas que se juegan una vez (formulario que se escribe, reloj de la demora, pasos que se encienden…).
  // Por defecto el HTML ya trae el estado final: en celular y con "reducir movimiento" no se anima nada.
  $$('[data-go] [data-count], [data-go][data-count]').forEach((n) => { n.textContent = '0' + (n.dataset.suffix || ''); });
  const go = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('go');
      $$('[data-count]', en.target).forEach(contar);
      if (en.target.dataset.count) contar(en.target);
      go.unobserve(en.target);
    });
  }, { threshold: 0.35 });
  $$('[data-go]').forEach((el) => go.observe(el));

  // Hero: la ciudad "enciende" leads (foto con más ventanas coral que se funde despacio) y sigue al cursor unos píxeles.
  const pan = $('.hero-pan');
  if (pan) {
    const lit = new Image();
    lit.className = 'city lit'; lit.alt = ''; lit.decoding = 'async';
    lit.onload = () => pan.appendChild(lit);
    lit.src = '/ciudad/hero-lit-1600.webp';
    let raf = 0, mx = 0, my = 0;
    $('#inicio').addEventListener('pointermove', (e) => {
      mx = e.clientX / window.innerWidth - 0.5; my = e.clientY / window.innerHeight - 0.5;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        pan.style.setProperty('--px', (mx * -16).toFixed(1) + 'px');
        pan.style.setProperty('--py', (my * -9).toFixed(1) + 'px');
      });
    }, { passive: true });
  }
  // Tarjeta del lead: el cronómetro corre hasta 00:28 una vez.
  const tiempo = $('#lcTime');
  if (tiempo) {
    const t0 = performance.now(), ms = 2800;
    tiempo.textContent = '00:00';
    (function paso(t) {
      const k = Math.min(1, (t - t0) / ms), s = Math.round(28 * k);
      tiempo.textContent = '00:' + String(s).padStart(2, '0');
      if (k < 1) requestAnimationFrame(paso);
    })(t0);
  }
} else {
  root.classList.remove('anim');
}

/* ---- La demo funcionando: 3 escenas que se juegan solas (perfila · llama · entrega) ---- */
pintarCalificacionHero($('#heroRate'));
pintarPruebaSocial($('#trust'));
(function demoEnMovimiento() {
  const pl = $('#player');
  if (!pl) return;
  const caps = $$('.pl-chapters button', pl), tiempo = $('#plTime'), play = $('.pl-play', pl);
  const T = ['00:12', '00:19', '00:28'];
  let escena = Number(pl.dataset.scene) || 3;
  function poner(n) {
    escena = n;
    pl.dataset.scene = String(n);
    caps.forEach((b, i) => {
      b.parentElement.classList.toggle('on', i + 1 === n);
      b.parentElement.classList.toggle('done', i + 1 < n);
    });
    tiempo.textContent = T[n - 1];
  }
  caps.forEach((b) => b.addEventListener('click', () => poner(Number(b.dataset.go))));
  play.addEventListener('click', () => {
    const en = pl.classList.toggle('paused');
    play.setAttribute('aria-label', en ? 'Reproducir la demostración' : 'Pausar la demostración');
  });
  // Al terminar el relleno del capítulo activo (5 s), pasa a la siguiente escena y vuelve a empezar.
  pl.addEventListener('animationend', (e) => { if (e.animationName === 'plfill') poner(escena % 3 + 1); });
  // Con "reducir movimiento" o sin IntersectionObserver queda quieta en la última escena (se navega con los capítulos).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { pl.classList.add('paused'); play.hidden = true; return; }
  let iniciado = false;
  new IntersectionObserver(([en]) => {
    if (en.isIntersecting && !iniciado) { iniciado = true; pl.classList.add('live'); poner(1); }
    pl.classList.toggle('offscreen', !en.isIntersecting);
  }, { threshold: 0.4 }).observe(pl);
})();

/* ---- Navegación: sombra al bajar y menú móvil ---------------------------- */
const nav = $('#nav');
if (nav && 'IntersectionObserver' in window) {
  const sentinela = document.createElement('div');
  sentinela.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:12px;pointer-events:none';
  document.body.prepend(sentinela);
  new IntersectionObserver(([e]) => nav.classList.toggle('scrolled', !e.isIntersecting)).observe(sentinela);
}
const burger = $('.burger');
function menu(abierto) {
  root.classList.toggle('menu-open', abierto);
  burger.setAttribute('aria-expanded', String(abierto));
  burger.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
}
burger.addEventListener('click', () => menu(!root.classList.contains('menu-open')));
$('#menu').addEventListener('click', (e) => { if (e.target.closest('a')) menu(false); });
window.matchMedia('(min-width: 1040px)').addEventListener('change', (m) => { if (m.matches) menu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('menu-open')) menu(false); });

/* ---- Mini demo: contesta una pregunta y se arma el plano ----------------- */
(function miniDemo() {
  const plan = $('#plan'), lista = $('#prList'), estado = $('#prStatus'), grupo = $('#qRooms');
  if (!plan) return;
  const fijos = ['Sala · comedor', 'Cocina', 'Baño'];
  let respondida = false;
  function pintar(n) {
    plan.dataset.r = n;
    const hab = Array.from({ length: n }, (_, k) => `Habitación ${k + 1}`);
    lista.innerHTML = fijos.concat(hab).map((t, k, a) => `<li${respondida && k === a.length - 1 ? ' class="new"' : ''}>${esc(t)}</li>`).join('');
    $$('.rm', plan).forEach((r) => r.classList.remove('pop'));
    const nueva = $('.rm.h' + n, plan);
    if (respondida && nueva) { void nueva.offsetWidth; nueva.classList.add('pop'); }
    estado.textContent = respondida ? `${n === 3 ? '3 o más' : n} habitación${n === 1 ? '' : 'es'} · plano armado` : 'Esperando tu respuesta';
  }
  grupo.addEventListener('click', (e) => {
    const b = e.target.closest('.q-opt');
    if (!b) return;
    respondida = true;
    $$('.q-opt', grupo).forEach((o) => o.setAttribute('aria-checked', String(o === b)));
    pintar(Number(b.dataset.v));
  });
  pintar(2);
})();

/* ---- Empieza gratis: demo con tu marca ----------------------------------- */
(function demoMarca() {
  const form = $('#demoForm'), card = $('#demoCard');
  if (!form) return;
  const err = $('#dErr'), btn = $('button[type=submit]', form), lbl = $('.lbl', btn);
  // El selector de color siempre trae un valor: solo se manda si la persona lo tocó.
  let colorElegido = false;
  $('#dColor').addEventListener('input', () => { colorElegido = true; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('#dName').value.trim(), correo = $('#dMail').value.trim(), sitio = $('#dSite').value.trim();
    const empresa = $('#dEmpresa').value.trim();
    const tipo = (form.querySelector('input[name=tipo]:checked') || {}).value || 'inmobiliaria';
    if (!nombre || !correo || !sitio) {
      err.textContent = 'Escribe tu nombre, tu correo y el link de tu sitio web.';
      (!nombre ? $('#dName') : !correo ? $('#dMail') : $('#dSite')).focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { err.textContent = 'Revisa el correo: parece incompleto.'; $('#dMail').focus(); return; }
    err.textContent = ''; btn.disabled = true; lbl.textContent = 'Armando tu demo…';
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await fetch(CONFIG.apiBase + '/demo/solicitar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ nombre, correo, sitio, empresa: empresa || null, tipo, color: colorElegido ? $('#dColor').value : null, website: $('#dWeb').value }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.demo_url) {
        err.textContent = (typeof j.detail === 'string' && j.detail) || 'No pudimos armar tu demo. Intenta de nuevo en un momento.';
        return;
      }
      $('#demoLink').href = j.demo_url;
      // La pantalla de acceso (prototipo) se viste con el mismo enlace firmado de la demo.
      const acceso = $('#demoAcceso');
      try {
        const tk = new URL(j.demo_url).searchParams.get('demo');
        acceso.hidden = !tk;
        if (tk) acceso.href = '/acceso/?demo=' + encodeURIComponent(tk);
      } catch { acceso.hidden = true; }
      $('#demoOkTitle').textContent = `Tu demo con la marca de ${j.marca.nombre} está lista.`;
      $('#demoOkText').textContent = j.correo_enviado
        ? `Ábrela ahora. También te enviamos el enlace a ${correo}; funciona durante 30 días.`
        : 'Ábrela ahora y guarda este enlace: funciona durante 30 días.';
      $('#demoAviso').textContent = j.aviso || '';
      card.classList.add('done');
    } catch (ex) {
      err.textContent = ex && ex.name === 'AbortError'
        ? `Tu sitio tardó demasiado en responder. Prueba de nuevo o escríbenos a ${CONFIG.email}.`
        : 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.';
    } finally {
      clearTimeout(timer); btn.disabled = false; lbl.textContent = 'Armar mi demo';
    }
  });
})();

/* ---- Agenda una demo: formulario por pasos ------------------------------- */
(function agendar() {
  const dlg = $('#agendar');
  if (!dlg) return;
  const host = $('#agPaso'), barra = $('#agProg .bar i'), cuenta = $('#agProg small'), atras = $('#agProg .ag-back');

  const PASOS = [
    { k: 'problema', t: '¿Cuál es el problema más grande que quieres resolver?', op: [
      ['Leads que nadie llama a tiempo', 'Tengo leads que nadie llama a tiempo y los pierdo', 'i-phone'],
      ['Leads de WhatsApp que se enfrían', 'Tengo muchos leads en WhatsApp y se me enfrían', 'i-chat'],
      ['No sé cuáles leads están listos', 'No sé cuáles de mis leads están listos para comprar', 'i-target'],
      ['Ninguna de las anteriores', 'Ninguna de las anteriores', 'i-x'],
    ] },
    { k: 'fuente_leads', t: '¿Cómo consigues leads?', dos: true, op: [
      ['Facebook / Instagram Ads'], ['Google Ads'], ['Portales inmobiliarios'], ['Sala de ventas y ferias'],
      ['Referidos y listas internas'], ['Outbound'], ['Otro'], ['No tengo leads'],
    ] },
    { k: 'pauta_mensual', t: '¿Cuánto inviertes en pauta al mes?', op: [
      ['No invierto en pauta'], ['Menos de $2 millones'], ['$2 a $6 millones'], ['$6 a $15 millones'], ['$15 a $40 millones'], ['Más de $40 millones'],
    ] },
    { k: 'leads_mes', t: '¿Cuántos leads recibes al mes?', tipo: 'numero', sufijo: 'leads / mes' },
    { k: 'tipo_empresa', t: '¿Qué tipo de empresa eres?', dos: true, op: [
      ['Inmobiliaria'], ['Constructora'], ['Asesor o corredor independiente'], ['Otro'],
    ] },
    { k: 'crm', t: '¿Qué CRM usas?', dos: true, op: [
      ['Ninguno'], ['Excel o Google Sheets'], ['HubSpot'], ['Salesforce'], ['Zoho CRM'], ['Pipedrive'], ['Go High Level'], ['Bitrix24'], ['Odoo'], ['Otro'],
    ] },
    { k: 'empresa', t: '¿Cuál es tu empresa?', tipo: 'empresa' },
    { k: 'contacto', t: '¿Dónde te contactamos?', tipo: 'contacto' },
  ];

  let i = 0, resp = {}, enviado = false, ocupado = false;

  const normTel = (v) => {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
    return /^3\d{9}$/.test(d) ? d : null;
  };
  const normSitio = (v) => {
    let s = String(v || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { const u = new URL(s); return u.hostname.includes('.') ? u.href : null; } catch { return null; }
  };

  function progreso() {
    barra.style.width = ((i + 1) / PASOS.length * 100) + '%';
    cuenta.textContent = `${i + 1} de ${PASOS.length}`;
    atras.hidden = i === 0;
  }

  function pintar() {
    const p = PASOS[i];
    $('#agProg').hidden = false;
    progreso();
    let cuerpo = '';
    if (p.op) {
      cuerpo = `<div class="ag-opts${p.dos ? ' two' : ''}">` + p.op.map(([v, txt, ic]) =>
        `<button type="button" class="ag-opt" data-v="${esc(v)}" aria-pressed="${resp[p.k] === v}">${ic ? `<span class="oi">${ico(ic)}</span>` : ''}<span>${esc(txt || v)}</span></button>`
      ).join('') + '</div>';
    } else if (p.tipo === 'numero') {
      cuerpo = `<div class="ag-num"><input id="agNum" type="number" inputmode="numeric" min="0" max="1000000" step="1" placeholder="500" value="${resp[p.k] || ''}" aria-label="${esc(p.t)}"><span>${esc(p.sufijo)}</span></div>
        <p class="ag-err" id="agErr" role="alert"></p>
        <div class="ag-actions"><button type="button" class="btn btn-coral" data-sig>Continuar</button><button type="button" class="ag-skip" data-skip>No lo sé</button></div>`;
    } else if (p.tipo === 'empresa') {
      cuerpo = `<div class="ag-fields">
          <div class="field"><input id="agEmpresa" type="text" placeholder=" " autocomplete="organization" value="${esc(resp.empresa || '')}"><label for="agEmpresa">Nombre de tu empresa</label></div>
          <div class="field"><input id="agSitio" type="text" inputmode="url" placeholder=" " autocomplete="url" value="${esc(resp.sitio_visible || '')}"><label for="agSitio">Link de tu sitio web (tuempresa.com)</label></div>
        </div>
        <p class="ag-err" id="agErr" role="alert"></p>
        <div class="ag-actions"><button type="button" class="btn btn-coral" data-sig>Continuar</button><button type="button" class="ag-skip" data-skip>No tengo sitio web</button></div>`;
    } else {
      cuerpo = `<div class="ag-fields">
          <div class="field"><input id="agNombre" type="text" placeholder=" " autocomplete="name" value="${esc(resp.nombre || '')}"><label for="agNombre">Tu nombre</label></div>
          <div class="ag-phone"><span class="cc" aria-hidden="true">+57</span><div class="field"><input id="agTel" type="tel" inputmode="tel" placeholder=" " autocomplete="tel-national" value="${esc(resp.telefono_visible || '')}"><label for="agTel">Tu celular</label></div></div>
          <div class="field"><input id="agMail" type="email" placeholder=" " autocomplete="email" value="${esc(resp.correo || '')}"><label for="agMail">Tu correo</label></div>
          <div class="hp" aria-hidden="true"><label>No llenes este campo<input id="agWeb" type="text" tabindex="-1" autocomplete="off"></label></div>
        </div>
        <label class="ag-consent"><input type="checkbox" id="agAcepto"><span>Autorizo a Machea a tratar mis datos para contactarme sobre esta solicitud, incluida una llamada o mensaje de su equipo o de su agente de voz con IA.</span></label>
        <p class="ag-err" id="agErr" role="alert"></p>
        <div class="ag-actions"><button type="button" class="btn btn-coral btn-lg" data-enviar>Enviar solicitud</button></div>`;
    }
    host.innerHTML = `<div class="ag-step"><h2 id="agTitulo" tabindex="-1">${esc(p.t)}</h2>${p.tipo === 'contacto' ? '<p class="hint">Un asesor de Machea te contacta para mostrarte cómo funciona con tu operación.</p>' : ''}${cuerpo}</div>`;
    const foco = $('input:not([type=checkbox]):not(#agWeb)', host);
    (foco || $('#agTitulo')).focus({ preventScroll: true });
  }

  function siguiente() { if (i < PASOS.length - 1) { i += 1; pintar(); } }
  function error(m, el) { const e = $('#agErr'); if (e) e.textContent = m; if (el) el.focus(); }

  host.addEventListener('click', (e) => {
    const p = PASOS[i];
    const op = e.target.closest('.ag-opt');
    if (op) {
      resp[p.k] = op.dataset.v;
      $$('.ag-opt', host).forEach((b) => b.setAttribute('aria-pressed', String(b === op)));
      setTimeout(siguiente, 170);
      return;
    }
    if (e.target.closest('[data-skip]')) {
      if (p.tipo === 'numero') resp.leads_mes = null;
      if (p.tipo === 'empresa') {
        const emp = $('#agEmpresa').value.trim();
        if (!emp) return error('Escribe el nombre de tu empresa.', $('#agEmpresa'));
        resp.empresa = emp; resp.sitio = ''; resp.sitio_visible = '';
      }
      siguiente();
      return;
    }
    if (e.target.closest('[data-sig]')) avanzar();
    if (e.target.closest('[data-enviar]')) enviar();
  });
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return;
    e.preventDefault();
    if (PASOS[i].tipo === 'contacto') enviar(); else avanzar();
  });

  function avanzar() {
    const p = PASOS[i];
    if (p.tipo === 'numero') {
      const n = parseInt($('#agNum').value, 10);
      if (!(n > 0)) return error('Escribe un número mayor que cero, o pulsa “No lo sé”.', $('#agNum'));
      resp.leads_mes = n;
    } else if (p.tipo === 'empresa') {
      const emp = $('#agEmpresa').value.trim(), vis = $('#agSitio').value.trim();
      if (!emp) return error('Escribe el nombre de tu empresa.', $('#agEmpresa'));
      const url = normSitio(vis);
      if (!vis || url === null) return error('Escribe el link de tu sitio web (por ejemplo tuempresa.com) o pulsa “No tengo sitio web”.', $('#agSitio'));
      resp.empresa = emp; resp.sitio = url; resp.sitio_visible = vis;
    }
    siguiente();
  }

  atras.addEventListener('click', () => { if (i > 0) { i -= 1; pintar(); } });

  /* --- Envío: la solicitud queda guardada en Supabase (tabla solicitudes_demo) --- */
  function origen() {
    const o = { pagina: location.pathname };
    new URLSearchParams(location.search).forEach((v, k) => { if (/^utm_/.test(k) && Object.keys(o).length < 8) o[k] = String(v).slice(0, 80); });
    try { if (document.referrer) o.ref = new URL(document.referrer).hostname; } catch { /* sin referrer */ }
    return o;
  }
  async function guardar(datos) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/solicitar_demo', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', apikey: CONFIG.supabaseAnonKey, Authorization: 'Bearer ' + CONFIG.supabaseAnonKey },
        body: JSON.stringify(datos),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error((j && (j.message || j.hint)) || 'HTTP ' + r.status); }
      return true;
    } finally { clearTimeout(timer); }
  }
  /* Camila, la agente de captación, llama a quien pide la demo. El backend decide si llama (horario, límites,
     interruptor CAPTACION_LLAMAR_DEMOS) y también deja el prospecto registrado aunque Supabase falle. */
  async function pedirLlamada(d) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 45000); // Render puede tardar en despertar
    try {
      const r = await fetch(CONFIG.apiBase + '/captacion/demo', {
        method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  async function enviar() {
    if (ocupado) return;
    const nombre = $('#agNombre').value.trim(), telVis = $('#agTel').value.trim(), correo = $('#agMail').value.trim().toLowerCase();
    if (nombre.length < 2) return error('Escribe tu nombre.', $('#agNombre'));
    const tel = normTel(telVis);
    if (!tel) return error('Escribe tu celular de 10 dígitos, empieza por 3 (por ejemplo 3001234567).', $('#agTel'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return error('Revisa el correo: parece incompleto.', $('#agMail'));
    if (!$('#agAcepto').checked) return error('Marca la autorización para poder contactarte.', $('#agAcepto'));
    Object.assign(resp, { nombre, telefono: tel, telefono_visible: telVis, correo });
    if ($('#agWeb').value) { cerrarOk(); return; } // trampa para bots: se ve como éxito y no se guarda
    ocupado = true;
    const b = $('[data-enviar]'); b.disabled = true; b.textContent = 'Enviando…';
    const datos = {
      p_nombre: nombre, p_telefono: tel, p_correo: correo,
      p_empresa: resp.empresa || null, p_sitio: resp.sitio || null,
      p_tipo_empresa: resp.tipo_empresa || null, p_problema: resp.problema || null,
      p_fuente_leads: resp.fuente_leads || null, p_pauta_mensual: resp.pauta_mensual || null,
      p_leads_mes: resp.leads_mes || null, p_crm: resp.crm || null, p_origen: origen(),
    };
    const agente = pedirLlamada({
      nombre, telefono: tel, correo, empresa: resp.empresa || null, sitio: resp.sitio || null, tipo_empresa: resp.tipo_empresa || null,
      problema: resp.problema || null, fuente_leads: resp.fuente_leads || null, pauta_mensual: resp.pauta_mensual || null,
      leads_mes: resp.leads_mes || null, crm: resp.crm || null, acepto: true,
    }).catch((ex) => { console.warn('[machea] captacion/demo falló:', ex && ex.message); return null; });
    try {
      let guardado = true;
      try { await guardar(datos); } catch (ex) { guardado = false; console.warn('[machea] solicitar_demo falló:', ex && ex.message); }
      // Si Supabase guardó, no se hace esperar a nadie por la API; si no, la API es la única vía de registro.
      const r = guardado ? await Promise.race([agente, new Promise((ok) => setTimeout(() => ok(null), 6000))]) : await agente;
      if (!guardado && !r) pantallaFallo(); else cerrarOk(r);
    } finally {
      ocupado = false;
    }
  }

  function cerrarOk(r) {
    enviado = true;
    $('#agProg').hidden = true;
    const nombre = esc((resp.nombre || '').split(' ')[0] || '');
    const estado = r && r.status;
    const texto = estado === 'llamando'
      ? 'Camila, la agente de voz con IA de Machea, te va a llamar en los próximos minutos al número que nos diste. Contesta aunque aparezca un número desconocido.'
      : estado === 'fuera_de_horario'
        ? 'Recibimos tu solicitud. Ahora estamos fuera del horario de llamadas: te contactamos el próximo día hábil al número y al correo que nos diste.'
        : 'Recibimos tu solicitud. Un asesor de Machea te va a contactar muy pronto al número y al correo que nos diste.';
    host.innerHTML = `<div class="ag-done"><span class="ok-i">${ico('i-check')}</span>
      <h2 id="agTitulo" tabindex="-1">¡Listo${nombre ? ', ' + nombre : ''}!</h2>
      <p>${texto}</p>
      <p>Mientras tanto, puedes armar tu demo con la marca de tu empresa.</p>
      <div class="ctas"><a class="btn btn-coral" href="#empieza" data-cerrar>Empieza gratis</a><button type="button" class="btn btn-line" data-cerrar>Cerrar</button></div></div>`;
    $('#agTitulo').focus({ preventScroll: true });
  }

  function pantallaFallo() {
    $('#agProg').hidden = true;
    const lineas = [
      'Solicitud de demo', '', `Nombre: ${resp.nombre}`, `Celular: ${resp.telefono}`, `Correo: ${resp.correo}`,
      `Empresa: ${resp.empresa || ''}`, `Sitio: ${resp.sitio || ''}`, `Problema: ${resp.problema || ''}`, `Fuente de leads: ${resp.fuente_leads || ''}`,
      `Pauta mensual: ${resp.pauta_mensual || ''}`, `Leads al mes: ${resp.leads_mes || ''}`, `Tipo de empresa: ${resp.tipo_empresa || ''}`, `CRM: ${resp.crm || ''}`,
    ];
    const mail = `mailto:${CONFIG.email}?subject=${encodeURIComponent('Solicitud de demo')}&body=${encodeURIComponent(lineas.join('\n'))}`;
    host.innerHTML = `<div class="ag-done ag-warn"><span class="ok-i">${ico('i-frown')}</span>
      <h2 id="agTitulo" tabindex="-1">No pudimos enviar tu solicitud</h2>
      <p>Pasó algo de nuestro lado. No pierdas tu turno: envíanos tus respuestas por correo con un clic y te contactamos.</p>
      <div class="ctas"><a class="btn btn-coral" href="${mail}">Enviar por correo</a><button type="button" class="btn btn-line" data-reintentar>Intentar de nuevo</button></div></div>`;
    $('#agTitulo').focus({ preventScroll: true });
  }

  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]')) { cerrar(); if (enviado) reiniciar(); }
    if (e.target.closest('[data-reintentar]')) { i = PASOS.length - 1; pintar(); }
  });
  $('.ag-x', dlg).addEventListener('click', cerrar);

  function reiniciar() { i = 0; resp = {}; enviado = false; }
  function abrir() {
    if (dlg.open) return;
    if (enviado) reiniciar();
    pintar();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    root.classList.add('modal-open');
    menu(false);
    try { history.replaceState(null, '', '#agendar'); } catch { /* sin historial */ }
  }
  function cerrar() { if (typeof dlg.close === 'function') dlg.close(); else { dlg.removeAttribute('open'); alCerrar(); } }
  function alCerrar() {
    root.classList.remove('modal-open');
    if (location.hash === '#agendar') { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* sin historial */ } }
    if (enviado) reiniciar();
  }
  dlg.addEventListener('close', alCerrar);

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-agendar]');
    if (!a) return;
    e.preventDefault();
    abrir();
  });
  const porHash = () => { if (location.hash === '#agendar') abrir(); else if (dlg.open) cerrar(); };
  window.addEventListener('hashchange', porHash);
  porHash();
})();
