/* ==========================================================================
   MACHEA — landing. Sin librerías: todo el JS pesa unos pocos KB.
   Piezas: menú, demo pública embebida ("Probar Machea"), vista de ejemplo del
   CRM, "Demo con tu marca", "Agendar demo" (formulario por pasos), entradas
   suaves y la tarjeta del lead que corre en el hero.
   ========================================================================== */

/* ---- Configuración ------------------------------------------------------- */
const CONFIG = {
  // Backend de Machea (Render). "Demo con tu marca" le pide la demo vestida y
  // "Agendar demo" le pide la llamada de captación.
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
const CORREO_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- Menú móvil ---------------------------------------------------------- */
const burger = $('.burger');
const menuMovil = $('#menu');
function menu(abierto) {
  if (!burger) return;
  root.classList.toggle('menu-open', abierto);
  burger.setAttribute('aria-expanded', String(abierto));
  burger.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
}
function iniciarMenu() {
  if (!burger || !menuMovil) return;
  burger.addEventListener('click', () => menu(!root.classList.contains('menu-open')));
  menuMovil.addEventListener('click', (e) => { if (e.target.closest('a')) menu(false); });
  window.matchMedia('(min-width: 960px)').addEventListener('change', (m) => { if (m.matches) menu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('menu-open')) { menu(false); burger.focus(); }
  });
}

/* ---- Despertar el backend ------------------------------------------------ */
// Render (plan gratis) duerme el servicio sin tráfico y tarda en arrancar. Un
// ping temprano hace que la demo y los formularios no paguen ese arranque.
// `no-cors`: no hace falta leer la respuesta, solo que llegue.
function despertarBackend() {
  const ping = () => fetch(CONFIG.apiBase + '/health', { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(ping, { timeout: 3000 });
  else setTimeout(ping, 1500);
}

/* ---- Probar Machea: la demo pública dentro de la página ------------------ */
// `modo=demo` arranca el formulario sin registro, sin guardar datos y sin la
// llamada de Manuela (ver experiencia/js/demo.js).
const DEMO_URL = '/experiencia/index.html?marca=machea&modo=demo';
const DEMO_ESPERA_MS = 20000;
function iniciarPrueba() {
  const cuerpo = $('#stageBody');
  if (!cuerpo) return;
  const reposo = $('#stageIdle'), carga = $('#stageCarga'), fallo = $('#stageError');
  let marco = null, temporizador = 0;

  function estado(e) {
    cuerpo.dataset.estado = e;
    reposo.hidden = e !== 'reposo';
    carga.hidden = e !== 'carga';
    fallo.hidden = e !== 'error';
  }
  function limpiar() {
    clearTimeout(temporizador);
    if (marco) { marco.remove(); marco = null; }
  }
  function mostrarError() {
    limpiar();
    estado('error');
    $('#stageReintentar').focus({ preventScroll: true });
  }
  function cargar() {
    limpiar();
    if (navigator.onLine === false) { mostrarError(); return; }
    estado('carga');
    const f = marco = document.createElement('iframe');
    f.title = 'Demo pública de Machea: formulario con recomendación de proyectos';
    f.setAttribute('loading', 'eager');
    f.hidden = true;
    f.addEventListener('load', () => {
      if (marco !== f) return;
      // Mismo origen: se puede mirar adentro. Una página vacía o un 404 cuentan como fallo.
      let ok = false;
      try {
        const d = f.contentDocument;
        ok = !!(d && d.body && d.body.children.length > 0 && !/^(404|Not Found)/i.test(d.title || ''));
      } catch { ok = false; }
      if (!ok) { mostrarError(); return; }
      clearTimeout(temporizador);
      estado('activa');
      f.hidden = false;
      f.focus({ preventScroll: true });
    });
    f.src = DEMO_URL;
    cuerpo.appendChild(f);
    temporizador = setTimeout(mostrarError, DEMO_ESPERA_MS);
  }
  $('#stageIniciar').addEventListener('click', cargar);
  $('#stageReintentar').addEventListener('click', cargar);
}

/* ---- Vista de ejemplo del CRM (datos ficticios) -------------------------- */
const LEADS_EJEMPLO = [
  { n: 'Andrea G.', p: 'VIS · Engativá', pago: 'Cuota estimada $780.000 al mes; subsidio disponible',
    proy: ['Reserva de Engativá (ejemplo)', 'Torres del Parque (ejemplo)', 'Alameda 80 (ejemplo)'],
    res: 'Quiere mudarse en 6 meses. Confirmó ingresos del hogar y que visitaría el proyecto.', sig: 'Llamar hoy y agendar visita' },
  { n: 'Carlos M.', p: 'No VIS · Suba', pago: 'Cuota inicial lista; crédito preaprobado',
    proy: ['Mirador de Suba (ejemplo)', 'Colina Alta (ejemplo)'],
    res: 'Compara dos proyectos. Pregunta por zonas comunes y parqueadero.', sig: 'Enviar comparativo y llamar' },
  { n: 'Laura P.', p: 'VIS · Bosa', pago: 'En validación durante la llamada',
    proy: ['Parques de Bosa (ejemplo)', 'Casas del Sur (ejemplo)'],
    res: 'La llamada de IA está en curso; la ficha se completa al terminar.', sig: 'Esperar la ficha completa' },
  { n: 'Jhon R.', p: 'No VIS · Usaquén', pago: 'Presupuesto validado hasta $420 millones',
    proy: ['Santa Ana 120 (ejemplo)', 'Cedritos Plaza (ejemplo)'],
    res: 'Llegó por referido. Busca vivienda para inversión.', sig: 'Llamar y compartir rentabilidad esperada' },
  { n: 'Marcela T.', p: 'VIS · Kennedy', pago: 'Falta confirmar ingresos',
    proy: ['Kennedy Central (ejemplo)'],
    res: 'No contestó la primera llamada. Se programó un nuevo intento.', sig: 'Reintento automático mañana' },
];
function iniciarCrm() {
  const filas = $$('#crmFilas tr'), ficha = $('#crmFicha');
  if (!filas.length || !ficha) return;

  function elegir(k) {
    const l = LEADS_EJEMPLO[k];
    if (!l) return;
    filas.forEach((tr) => {
      const sel = Number(tr.dataset.k) === k;
      tr.classList.toggle('sel', sel);
      $('.lead-btn', tr).setAttribute('aria-pressed', String(sel));
    });
    ficha.innerHTML = `<h3>${esc(l.n)}</h3><dl>
      <div><dt>Perfil</dt><dd>${esc(l.p)}</dd></div>
      <div><dt>Capacidad de pago</dt><dd>${esc(l.pago)}</dd></div>
      <div><dt>Proyectos compatibles</dt><dd>${l.proy.map(esc).join(' · ')}</dd></div>
      <div><dt>Resumen de la llamada</dt><dd>${esc(l.res)}</dd></div>
      <div><dt>Siguiente paso</dt><dd>${esc(l.sig)}</dd></div></dl>`;
  }
  $('#crmFilas').addEventListener('click', (e) => {
    const b = e.target.closest('.lead-btn');
    if (b) elegir(Number(b.closest('tr').dataset.k));
  });
  elegir(0);

  const fEstado = $('#fEstado'), fFuente = $('#fFuente'), fBuscar = $('#fBuscar');
  const vacio = $('#crmVacio'), cuenta = $('#crmCuenta');
  if (!fEstado || !fFuente || !fBuscar) return;
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function filtrar() {
    const q = norm(fBuscar.value.trim());
    let n = 0;
    filas.forEach((tr) => {
      const ve = (!fEstado.value || tr.dataset.st === fEstado.value)
        && (!fFuente.value || $('.c-src', tr).textContent.trim() === fFuente.value)
        && (!q || norm($('.lead-btn', tr).textContent).includes(q));
      tr.hidden = !ve;
      if (ve) n++;
    });
    vacio.hidden = n > 0;
    cuenta.textContent = n === filas.length ? `${n} en total` : `${n} de ${filas.length}`;
  }
  [fEstado, fFuente].forEach((s) => s.addEventListener('change', filtrar));
  fBuscar.addEventListener('input', filtrar);
  $('#crmLimpiar').addEventListener('click', () => {
    fEstado.value = ''; fFuente.value = ''; fBuscar.value = '';
    filtrar();
    fBuscar.focus();
  });
}

/* ---- Demo con tu marca --------------------------------------------------- */
function iniciarDemoMarca() {
  const form = $('#demoForm'), card = $('#demoCard');
  if (!form) return;
  const err = $('#dErr'), btn = $('button[type=submit]', form), lbl = $('.lbl', btn);
  // El selector de color siempre trae un valor: solo se manda si la persona lo tocó.
  let colorElegido = false;
  $('#dColor').addEventListener('input', () => { colorElegido = true; });

  const CAMPOS = [
    ['#dName', '#dNameErr', (v) => (v.length < 2 ? 'Escribe tu nombre.' : '')],
    ['#dMail', '#dMailErr', (v) => (!v ? 'Escribe tu correo.' : CORREO_OK.test(v) ? '' : 'Revisa el correo: parece incompleto.')],
    ['#dSite', '#dSiteErr', (v) => (!v ? 'Pega el link de tu sitio web.'
      : /\s/.test(v) || !/\./.test(v) ? 'Escribe un link válido, por ejemplo tuempresa.com.' : '')],
  ];
  function marcar(input, salida, msg) {
    salida.textContent = msg;
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }
  CAMPOS.forEach(([i, e]) => $(i).addEventListener('input', () => { marcar($(i), $(e), ''); err.textContent = ''; }));
  function validar() {
    let primero = null;
    CAMPOS.forEach(([i, e, regla]) => {
      const input = $(i), msg = regla(input.value.trim());
      marcar(input, $(e), msg);
      if (msg && !primero) primero = input;
    });
    if (!primero) return true;
    err.textContent = 'Revisa los campos marcados.';
    primero.focus();
    return false;
  }
  function ocupado(si) {
    btn.disabled = si;
    btn.setAttribute('aria-busy', String(si));
    lbl.textContent = si ? 'Armando tu demo…' : 'Armar mi demo';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    err.textContent = '';
    if (!validar()) return;
    if (navigator.onLine === false) {
      err.textContent = 'Parece que no tienes conexión. Conéctate e intenta de nuevo; lo que escribiste sigue aquí.';
      return;
    }
    const tipo = (form.querySelector('input[name=tipo]:checked') || {}).value || 'inmobiliaria';
    const empresa = $('#dEmpresa').value.trim();
    ocupado(true);
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await fetch(CONFIG.apiBase + '/demo/solicitar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({
          nombre: $('#dName').value.trim(), correo: $('#dMail').value.trim(), sitio: $('#dSite').value.trim(),
          empresa: empresa || null, tipo, color: colorElegido ? $('#dColor').value : null, website: $('#dWeb').value,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.demo_url) {
        err.textContent = (typeof j.detail === 'string' && j.detail)
          || (r.status === 429
            ? 'Hay muchas solicitudes ahora mismo. Espera unos minutos e intenta de nuevo.'
            : `No pudimos armar tu demo. Intenta de nuevo en un momento o escríbenos a ${CONFIG.email}.`);
        return;
      }
      $('#demoLink').href = j.demo_url;
      $('#demoOkTitle').textContent = `Tu demo con la marca de ${(j.marca && j.marca.nombre) || 'tu empresa'} está lista.`;
      $('#demoOkText').textContent = j.correo_enviado
        ? `Ábrela ahora. También te enviamos el enlace a ${$('#dMail').value.trim()}; funciona durante 30 días.`
        : 'Ábrela ahora y guarda este enlace: funciona durante 30 días.';
      $('#demoAviso').textContent = j.aviso || '';
      card.classList.add('done');
      const titulo = $('#demoOkTitle');
      titulo.setAttribute('tabindex', '-1');
      titulo.focus({ preventScroll: true });
    } catch (ex) {
      err.textContent = ex && ex.name === 'AbortError'
        ? `Tu sitio tardó demasiado en responder. Prueba de nuevo o escríbenos a ${CONFIG.email}.`
        : 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo; lo que escribiste sigue aquí.';
    } finally {
      clearTimeout(timer);
      ocupado(false);
    }
  });
}

/* ---- Agendar demo: formulario por pasos ---------------------------------- */
function iniciarAgendar() {
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
        <label class="ag-consent"><input type="checkbox" id="agAcepto"><span>Autorizo a Machea a tratar mis datos para contactarme sobre esta solicitud, incluida una llamada o mensaje de su equipo o de su agente de voz con IA. <a href="/privacidad/" target="_blank" rel="noopener">Aviso de privacidad</a></span></label>
        <p class="ag-err" id="agErr" role="alert"></p>
        <div class="ag-actions"><button type="button" class="btn btn-coral btn-lg" data-enviar>Enviar solicitud</button></div>`;
    }
    host.innerHTML = `<div class="ag-step"><h2 id="agTitulo" tabindex="-1">${esc(p.t)}</h2>${p.tipo === 'contacto' ? '<p class="hint">Un asesor de Machea te contacta para mostrarte cómo funciona con tu operación.</p>' : ''}${cuerpo}</div>`;
    const foco = $('input:not([type=checkbox]):not(#agWeb)', host);
    (foco || $('#agTitulo')).focus({ preventScroll: true });
  }

  function siguiente() { if (i < PASOS.length - 1) { i += 1; pintar(); } }
  // El error se anuncia (role=alert), se asocia al campo y le devuelve el foco.
  function error(m, el) {
    const e = $('#agErr');
    if (e) e.textContent = m;
    if (!el) return;
    if (el.type !== 'checkbox') {
      el.setAttribute('aria-invalid', 'true');
      if (e) el.setAttribute('aria-describedby', 'agErr');
    }
    el.focus();
  }

  host.addEventListener('input', () => {
    const e = $('#agErr');
    if (e) e.textContent = '';
    $$('[aria-invalid="true"]', host).forEach((el) => el.removeAttribute('aria-invalid'));
  });
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
    if (!CORREO_OK.test(correo)) return error('Revisa el correo: parece incompleto.', $('#agMail'));
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
      <div class="ctas"><a class="btn btn-coral" href="#marca" data-cerrar>Armar demo con mi marca</a><button type="button" class="btn btn-line" data-cerrar>Cerrar</button></div></div>`;
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
      <div class="ctas"><a class="btn btn-coral" href="${esc(mail)}">Enviar por correo</a><button type="button" class="btn btn-line" data-reintentar>Intentar de nuevo</button></div></div>`;
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
  // Entrar con /#agendar (por ejemplo, desde el cierre de la demo pública) abre el formulario.
  const porHash = () => { if (location.hash === '#agendar') abrir(); else if (dlg.open) cerrar(); };
  window.addEventListener('hashchange', porHash);
  porHash();
}

/* ---- Entradas suaves al hacer scroll ------------------------------------- */
// Sin IntersectionObserver o con "reducir movimiento" no se anima nada. Si algo
// no llega a entrar (pestaña en segundo plano), a los 6 s se muestra igual.
const REVELAR = '.sec-head, .try-side, .stage, .step, .crm, .brand-copy, .form-card, details.qa, .final .wrap > *';
function iniciarEntradas() {
  if (!('IntersectionObserver' in window) || sinMovimiento()) return;
  const els = $$(REVELAR);
  if (!els.length) return;
  root.classList.add('js-rv');
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      en.target.classList.add('in');
      io.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.01 });
  els.forEach((el, k) => {
    el.classList.add('rv');
    if (el.matches('.step')) el.style.setProperty('--d', `${(k % 3) * 110}ms`);
    io.observe(el);
  });
  setTimeout(() => els.forEach((el) => el.classList.add('in')), 6000);
}

/* ---- Hero: titular por palabras, inclinación con el cursor y la tarjeta que corre ---- */
function partirTitular() {
  const h = $('#h-hero');
  if (!h) return;
  let n = 0;
  const partir = (nodo) => {
    [...nodo.childNodes].forEach((c) => {
      if (c.nodeType === 3) {
        const frag = document.createDocumentFragment();
        c.textContent.split(/(\s+)/).forEach((pal) => {
          if (!pal) return;
          if (/^\s+$/.test(pal)) { frag.append(' '); return; }
          const w = document.createElement('span');
          w.className = 'w';
          const s = document.createElement('span');
          s.textContent = pal;
          s.style.setProperty('--i', n++);
          w.append(s);
          frag.append(w);
        });
        c.replaceWith(frag);
      } else if (c.nodeType === 1) partir(c);
    });
  };
  partir(h);
  h.classList.add('split');
}

function seguirCursor() {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const hero = $('.hero'), tarjeta = $('.lead-wrap');
  if (hero && tarjeta) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      tarjeta.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`);
      tarjeta.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
    });
    hero.addEventListener('pointerleave', () => {
      tarjeta.style.setProperty('--ry', '0deg');
      tarjeta.style.setProperty('--rx', '0deg');
    });
  }
  $$('.step, .idle-tiles li, .form-card').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

// La tarjeta del lead cuenta de 00:00 a 00:28 y enciende cada paso a su hora;
// se queda quieta un momento en el final y vuelve a empezar. Solo corre visible.
const CORRE_MS = 4200, PAUSA_MS = 4500;
const reloj = (s) => `00:${String(s).padStart(2, '0')}`;
function iniciarTarjetaLead() {
  const card = $('.lead-card');
  if (!card) return;
  const t = $('.lc-top .t', card), pasos = $$('.lc-steps li', card);
  const horas = pasos.map((li) => Number($('em', li).textContent.split(':')[1]));
  const final = () => { t.textContent = '00:28'; pasos.forEach((li) => li.classList.add('done')); };
  if (sinMovimiento() || !('IntersectionObserver' in window)) { final(); return; }

  root.classList.add('js-live');
  partirTitular();
  seguirCursor();

  let visible = true, t0 = performance.now(), fase = 'corre';
  function reiniciar() {
    pasos.forEach((li) => li.classList.remove('done'));
    t.textContent = reloj(0);
    t0 = performance.now();
    fase = 'corre';
  }
  function tic() {
    if (!visible) return;
    const dt = performance.now() - t0;
    if (fase === 'corre') {
      const s = Math.min(28, Math.round(dt / CORRE_MS * 28));
      t.textContent = reloj(s);
      pasos.forEach((li, k) => li.classList.toggle('done', s >= horas[k]));
      if (dt >= CORRE_MS) { final(); fase = 'pausa'; t0 = performance.now(); }
    } else if (dt >= PAUSA_MS) reiniciar();
  }
  reiniciar();
  setInterval(tic, 100);
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(card);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });
}

iniciarMenu();
despertarBackend();
iniciarPrueba();
iniciarCrm();
iniciarDemoMarca();
iniciarAgendar();
iniciarEntradas();
iniciarTarjetaLead();
