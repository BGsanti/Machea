/* MACHEA — Centro de control. Lógica del panel de administración.
 *
 * Habla con `GET /api/admin/estado` (cada 10 s) con un token de sesión que vive solo en
 * sessionStorage (se borra al cerrar la pestaña). Todo lo que viene del servidor se pinta
 * con textContent / atributos: nunca con innerHTML, así un dato raro no puede ejecutar código.
 * La clave y el token nunca van en una URL.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- configuración
  var INTERVALO = 10000;
  var CLAVE_SESION = 'machea.admin.sesion';
  var CLAVE_TEMA = 'machea.admin.tema';
  var NS = 'http://www.w3.org/2000/svg';

  // La API de producción es fija. Solo en tu propia máquina se acepta `?api=http://127.0.0.1:8100/api`
  // para probar contra un backend local; un enlace trampa en Internet no puede redirigir el acceso.
  var API = (function () {
    var porDefecto = 'https://machea-api.onrender.com/api';
    var host = location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      try {
        var q = new URLSearchParams(location.search).get('api');
        if (q && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/api$/.test(q)) return q;
      } catch (e) {}
    }
    return porDefecto;
  })();

  var ETQ = {
    ok: ['Operativo', 'i-check'],
    degradado: ['Con avisos', 'i-alert'],
    caido: ['Caído', 'i-x'],
    sin_configurar: ['Sin configurar', 'i-minus'],
    desconocido: ['Sin datos', 'i-minus'],
    cargando: ['Verificando', 'i-minus']
  };
  var NIVEL_A_ESTADO = { ok: 'ok', info: 'desconocido', aviso: 'degradado', error: 'caido' };
  var NIVEL_ICONO = { ok: 'i-check', info: 'i-minus', aviso: 'i-alert', error: 'i-x' };

  // Lo que se dibuja mientras llega la primera respuesta (id, grupo, nombre, ícono).
  var SERVICIOS = [
    ['backend', 'app', 'API de Machea', 'i-server'],
    ['front', 'app', 'Sitio web (Vercel)', 'i-globe'],
    ['supabase', 'datos', 'Base de datos (Supabase)', 'i-db'],
    ['dapta_api', 'voz', 'Cuenta de Dapta', 'i-phone'],
    ['dapta_flow', 'voz', 'Flow de llamadas (Dapta)', 'i-flow'],
    ['manuela', 'voz', 'Agente Manuela (voz)', 'i-wave'],
    ['claude', 'ia', 'Claude (Anthropic)', 'i-spark'],
    ['openai', 'ia', 'OpenAI', 'i-spark'],
    ['correo', 'comunicacion', 'Correo (demo con marca)', 'i-mail'],
    ['whatsapp', 'comunicacion', 'WhatsApp (seguimiento)', 'i-chat']
  ];
  var ICONO_DE = {};
  SERVICIOS.forEach(function (s) { ICONO_DE[s[0]] = s[3]; });

  // ---------------------------------------------------------------- utilidades
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function el(tag, props, hijos) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') n.className = props[k];
        else if (k === 'text') n.textContent = props[k];
        else n.setAttribute(k, props[k]);
      });
    }
    (hijos || []).forEach(function (h) { if (h) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
    return n;
  }
  function icono(id) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('class', 'ic');
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(NS, 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }
  function almacen(tipo) { try { return window[tipo]; } catch (e) { return null; } }
  function leer(tipo, k) { try { return almacen(tipo).getItem(k); } catch (e) { return null; } }
  function guardar(tipo, k, v) { try { almacen(tipo).setItem(k, v); } catch (e) {} }
  function borrar(tipo, k) { try { almacen(tipo).removeItem(k); } catch (e) {} }

  function numero(n) { return typeof n === 'number' ? n.toLocaleString('es-CO') : '—'; }
  function duracion(s) {
    s = Math.max(0, Math.round(s));
    if (s < 60) return s + ' s';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
    var d = Math.floor(h / 24);
    return d + ' d' + (h % 24 ? ' ' + (h % 24) + ' h' : '');
  }

  // ---------------------------------------------------------------- estado de la página
  var S = {
    token: null, expira: 0, generado: 0, recibido: 0,
    fallos: 0, timer: null, cargando: false, primera: true,
    ultimoEvento: 0, datos: null, ultimaCarga: 0
  };
  var tarjetas = {};      // id -> referencias a su DOM
  var historial = {};     // id -> últimas latencias (para la línea)

  // Hora del servidor "ahora", sin depender del reloj de este equipo.
  function ahoraServidor() { return S.generado ? S.generado + (Date.now() - S.recibido) / 1000 : Date.now() / 1000; }
  function hace(t) {
    if (!t) return 'nunca';
    var d = ahoraServidor() - t;
    return d < 5 ? 'ahora mismo' : 'hace ' + duracion(d);
  }

  // ---------------------------------------------------------------- vistas
  function mostrar(vista) {
    $('#vistaLogin').hidden = vista !== 'login';
    $('#vistaPanel').hidden = vista !== 'panel';
    if (vista === 'login') {
      document.title = 'Machea · Acceso';
      setTimeout(function () { var i = $('#inClave'); if (i) i.focus(); }, 30);
    }
  }

  function avisoLogin(texto, tipo) {
    var a = $('#avisoLogin');
    a.hidden = !texto;
    a.textContent = texto || '';
    a.className = 'aviso ' + (tipo === 'info' ? 'aviso-info' : 'aviso-error');
  }

  function entrar(token, expira) {
    S.token = token; S.expira = expira; S.primera = true; S.fallos = 0; S.ultimoEvento = 0;
    guardar('sessionStorage', CLAVE_SESION, JSON.stringify({ t: token, e: expira }));
    $('#inClave').value = ''; $('#inCodigo').value = ''; $('#campoCodigo').hidden = true; avisoLogin('');
    construirEsqueleto();
    mostrar('panel');
    cargar(true);          // la primera lectura va siempre, aunque la pestaña esté en segundo plano
  }

  function cerrarSesion(mensaje) {
    clearTimeout(S.timer);
    S.token = null; S.datos = null;
    borrar('sessionStorage', CLAVE_SESION);
    mostrar('login');
    avisoLogin(mensaje || '', 'info');
  }

  // ---------------------------------------------------------------- acceso
  async function enviarLogin(ev) {
    ev.preventDefault();
    var clave = $('#inClave').value;
    var codigo = $('#inCodigo').value.replace(/\s+/g, '');
    if (!clave) { avisoLogin('Escribe la clave.'); return; }
    var btn = $('#btnEntrar');
    btn.disabled = true; btn.firstElementChild.textContent = 'Verificando…';
    avisoLogin('');
    try {
      var cuerpo = { clave: clave };
      if (codigo) cuerpo.codigo = codigo;
      var r = await fetch(API + '/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
      });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok && j.token) { entrar(j.token, j.expira); return; }
      if (r.status === 401 && j.requiere_codigo) {
        $('#campoCodigo').hidden = false; $('#inCodigo').focus();
        avisoLogin('Escribe el código de 6 dígitos de tu app de autenticación.', 'info');
      } else if (r.status === 404) {
        avisoLogin('El panel está apagado en el servidor. Define ADMIN_PASSWORD (16 caracteres o más) en Render y vuelve a desplegar.');
      } else {
        avisoLogin(typeof j.detail === 'string' ? j.detail : 'No se pudo entrar. Intenta de nuevo.');
        if (r.status === 401) $('#inClave').select();
      }
    } catch (e) {
      avisoLogin('No se pudo conectar con la API. Revisa tu conexión.');
    } finally {
      btn.disabled = false; btn.firstElementChild.textContent = 'Entrar';
    }
  }

  async function salir() {
    var t = S.token;
    cerrarSesion('Cerraste la sesión.');
    if (t) {
      try { await fetch(API + '/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true }); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------- tarjetas de servicio
  function crearTarjeta(id, grupo, nombre) {
    var punto = el('i', { class: 'punto' });
    var pastillaTxt = el('span', { text: ETQ.cargando[0] });
    var pastilla = el('span', { class: 'pastilla' }, [punto, pastillaTxt]);
    var det = el('p', { class: 'svc-det', text: 'Verificando…' });
    var meta = el('dl', { class: 'meta' });
    var acciones = el('div', { class: 'svc-acc' });
    var chequeo = el('span', { text: '' });
    var spark = document.createElementNS(NS, 'svg');
    spark.setAttribute('class', 'spark');
    spark.setAttribute('viewBox', '0 0 96 30');
    spark.setAttribute('aria-hidden', 'true');
    var raiz = el('article', { class: 'svc', 'data-estado': 'cargando', 'data-id': id }, [
      el('header', { class: 'svc-cab' }, [
        el('span', { class: 'svc-ico' }, [icono(ICONO_DE[id] || 'i-server')]),
        el('h3', { text: nombre }),
        pastilla
      ]),
      det, meta, acciones,
      el('footer', { class: 'svc-pie' }, [chequeo, spark])
    ]);
    var cont = $('#grupo-' + grupo);
    if (cont) cont.appendChild(raiz);
    return { raiz: raiz, pastillaTxt: pastillaTxt, det: det, meta: meta, acciones: acciones, chequeo: chequeo, spark: spark, ultimoChequeo: 0, boton: null, mensaje: null };
  }

  function construirEsqueleto() {
    ['app', 'datos', 'voz', 'ia', 'comunicacion'].forEach(function (g) { var c = $('#grupo-' + g); if (c) c.replaceChildren(); });
    tarjetas = {}; historial = {};
    SERVICIOS.forEach(function (s) { tarjetas[s[0]] = crearTarjeta(s[0], s[1], s[2]); });
    var k = $('#kpis'); k.replaceChildren();
    kpis = {};
    [['llamadas', 'Llamadas de Manuela · 24 h'], ['resultados', 'Resultados recibidos · 24 h'], ['demos', 'Demos con marca · 24 h'],
     ['creditos', 'Créditos de Dapta'], ['activo', 'Servidor activo']].forEach(function (d) {
      var val = el('p', { class: 'kpi-val', text: '—' });
      var sub = el('p', { class: 'kpi-sub', text: 'Esperando datos…' });
      k.appendChild(el('div', { class: 'kpi' }, [el('p', { class: 'kpi-et', text: d[1] }), val, sub]));
      kpis[d[0]] = { val: val, sub: sub };
    });
  }
  var kpis = {};

  function pintarLinea(c, serie, estado) {
    var svg = c.spark;
    svg.replaceChildren();
    if (!serie || serie.length < 2) return;
    var max = Math.max.apply(null, serie) * 1.15 || 1;
    var pts = serie.map(function (v, i) {
      return (i * (92 / (serie.length - 1)) + 2).toFixed(1) + ',' + (28 - (v / max) * 26).toFixed(1);
    });
    var linea = document.createElementNS(NS, 'polyline');
    linea.setAttribute('points', pts.join(' '));
    svg.appendChild(linea);
    var ult = pts[pts.length - 1].split(',');
    var c2 = document.createElementNS(NS, 'circle');
    c2.setAttribute('cx', ult[0]); c2.setAttribute('cy', ult[1]); c2.setAttribute('r', '2.6');
    svg.appendChild(c2);
  }

  function metaDe(s) {
    var m = s.meta || {};
    var f = [];
    if (typeof s.ms === 'number' && s.ms > 0) f.push(['Respuesta', s.ms + ' ms']);
    switch (s.id) {
      case 'backend':
        f.push(['Activo desde', duracion(m.activo_s || 0)]);
        if (m.commit) f.push(['Versión', m.commit]);
        if (typeof m.memoria_mb === 'number') f.push(['Memoria', m.memoria_mb + ' MB']);
        f.push(['Python', m.python || '—']);
        break;
      case 'front':
        f.push(['HTTP', String(m.http || '—')]);
        if (m.region) f.push(['Región', m.region]);
        break;
      case 'supabase':
        f.push(['Prueba', m.prueba || '—']);
        break;
      case 'dapta_api':
        if (m.plan) f.push(['Plan', m.plan]);
        if (typeof m.creditos === 'number') f.push(['Créditos', numero(m.creditos)]);
        if (typeof m.minutos_aprox === 'number') f.push(['Equivale a', '≈ ' + numero(m.minutos_aprox) + ' min']);
        if (m.workspace) f.push(['Espacio', m.workspace + '…']);
        break;
      case 'dapta_flow':
        if (m.host) f.push(['Servidor', m.host]);
        if (m.http) f.push(['HTTP', String(m.http)]);
        break;
      case 'manuela':
        f.push(['Pedidas', numero(m.enviadas_24h)]);
        f.push(['Resultados', numero(m.resultados_24h)]);
        f.push(['Errores', numero(m.errores_24h)]);
        f.push(['Último resultado', m.ultimo_resultado ? hace(m.ultimo_resultado) : 'ninguno']);
        break;
      case 'correo':
        f.push(['Vía', m.modo === 'smtp' ? 'Gmail (SMTP)' : m.modo === 'flow' ? 'Flow de Dapta' : 'Sin configurar']);
        f.push(['Último envío', m.ultimo_envio ? hace(m.ultimo_envio) : 'ninguno']);
        break;
    }
    return f;
  }

  function pintarMeta(dl, filas) {
    dl.replaceChildren();
    filas.forEach(function (f) {
      dl.appendChild(el('div', {}, [el('dt', { text: f[0] }), el('dd', { text: f[1] })]));
    });
  }

  function accionesDe(c, s) {
    // Solo el correo tiene acción: comprobar la contraseña de aplicación sin enviar nada.
    if (s.id !== 'correo') return;
    var hayBoton = s.meta && s.meta.modo === 'smtp';
    if (hayBoton && !c.boton) {
      c.boton = el('button', { type: 'button', class: 'btn btn-suave btn-mini' }, [icono('i-shield'), el('span', { text: 'Probar conexión' })]);
      c.mensaje = el('p', { class: 'svc-msg', hidden: '' });
      c.boton.addEventListener('click', probarCorreo);
      c.acciones.appendChild(c.boton);
      c.acciones.appendChild(c.mensaje);
    }
    if (!hayBoton && c.boton) { c.acciones.replaceChildren(); c.boton = null; c.mensaje = null; }
  }

  async function probarCorreo() {
    var c = tarjetas.correo;
    if (!c || !c.boton) return;
    c.boton.disabled = true; c.boton.lastElementChild.textContent = 'Probando…';
    c.mensaje.hidden = true;
    try {
      var r = await fetch(API + '/admin/probar-correo', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token }, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (r.status === 401) { cerrarSesion('Tu sesión venció. Entra de nuevo.'); return; }
      var j = await r.json().catch(function () { return {}; });
      c.mensaje.textContent = typeof j.mensaje === 'string' ? j.mensaje : (typeof j.detail === 'string' ? j.detail : 'No se pudo probar.');
      c.mensaje.setAttribute('data-ok', j.ok ? '1' : '0');
      c.mensaje.hidden = false;
      cargar(true);
    } catch (e) {
      c.mensaje.textContent = 'No se pudo conectar con la API.'; c.mensaje.setAttribute('data-ok', '0'); c.mensaje.hidden = false;
    } finally {
      c.boton.disabled = false; c.boton.lastElementChild.textContent = 'Probar conexión';
    }
  }

  function pintarServicio(s) {
    var c = tarjetas[s.id] || (tarjetas[s.id] = crearTarjeta(s.id, s.grupo, s.nombre));
    var e = ETQ[s.estado] ? s.estado : 'desconocido';
    c.raiz.setAttribute('data-estado', e);
    c.raiz.classList.remove('rancio');
    c.pastillaTxt.textContent = ETQ[e][0];
    c.det.textContent = s.detalle || '';
    pintarMeta(c.meta, metaDe(s));
    accionesDe(c, s);
    if (typeof s.ms === 'number' && s.ms > 0 && c.ultimoChequeo !== s.chequeado) {
      var h = historial[s.id] = historial[s.id] || [];
      h.push(s.ms); if (h.length > 40) h.shift();
    }
    c.ultimoChequeo = s.chequeado;
    c.chequeadoEn = s.chequeado;
    c.chequeo.textContent = 'Comprobado ' + hace(s.chequeado);
    pintarLinea(c, historial[s.id], e);
    // Un grupo sin ninguna tarjeta (no pasa hoy) se esconde.
  }

  // ---------------------------------------------------------------- bloques
  var ICONO_GLOBAL = { ok: 'i-check', degradado: 'i-alert', caido: 'i-x', cargando: 'i-minus' };

  function pintarGlobal(g, servicios) {
    var caja = $('#global');
    caja.setAttribute('data-estado', g.estado);
    $('#globalIco').setAttribute('href', '#' + (ICONO_GLOBAL[g.estado] || 'i-minus'));
    $('#globalTitulo').textContent = g.titulo;
    $('#globalResumen').textContent = g.resumen;
    document.title = g.titulo + ' · Machea';
    var cuenta = { ok: 0, degradado: 0, caido: 0, sin_configurar: 0 };
    servicios.forEach(function (s) {
      var k = s.estado === 'desconocido' ? 'degradado' : s.estado;
      if (k in cuenta) cuenta[k]++;
    });
    var ul = $('#globalCuenta'); ul.replaceChildren();
    [['ok', 'operativos'], ['degradado', 'con avisos'], ['caido', 'caídos'], ['sin_configurar', 'sin configurar']].forEach(function (d) {
      if (!cuenta[d[0]]) return;
      ul.appendChild(el('li', { 'data-estado': d[0] }, [el('i', { class: 'punto' }), el('b', { text: String(cuenta[d[0]]) }), d[1]]));
    });
  }

  function pintarKpis(d) {
    var cont = d.actividad.contadores, uso = d.uso || {};
    var porId = {}; d.servicios.forEach(function (s) { porId[s.id] = s; });
    kpis.llamadas.val.textContent = numero(cont.llamada_enviada.dia);
    kpis.llamadas.sub.textContent = numero(uso.total) + ' de ' + numero(uso.tope_total) + ' del cupo diario' + (cont.llamada_rechazada.dia ? ' · ' + cont.llamada_rechazada.dia + (cont.llamada_rechazada.dia === 1 ? ' rechazada' : ' rechazadas') : '');
    kpis.resultados.val.textContent = numero(cont.resultado_recibido.dia);
    var man = porId.manuela && porId.manuela.meta;
    kpis.resultados.sub.textContent = man && man.ultimo_resultado ? 'Último ' + hace(man.ultimo_resultado) : 'Aún ninguno desde el reinicio';
    kpis.demos.val.textContent = numero(cont.demo_creada.dia);
    kpis.demos.sub.textContent = numero(cont.demo_creada.hora) + ' en la última hora';
    var dapta = porId.dapta_api && porId.dapta_api.meta;
    if (dapta && typeof dapta.minutos_aprox === 'number') {
      kpis.creditos.val.textContent = '≈ ' + numero(dapta.minutos_aprox);
      var u = document.createElement('small'); u.textContent = 'min';
      kpis.creditos.val.appendChild(u);
      kpis.creditos.sub.textContent = numero(dapta.creditos) + ' créditos' + (dapta.plan ? ' · plan ' + dapta.plan : '');
    } else {
      kpis.creditos.val.textContent = '—';
      kpis.creditos.sub.textContent = porId.dapta_api ? porId.dapta_api.detalle : 'Sin datos';
    }
    var back = porId.backend && porId.backend.meta;
    kpis.activo.val.textContent = back ? duracion(back.activo_s || 0) : '—';
    kpis.activo.sub.textContent = back && back.commit ? 'Versión ' + back.commit : 'Desde el último reinicio';
  }

  function pintarProveedores(lista) {
    var ul = $('#proveedores'); ul.replaceChildren();
    lista.forEach(function (p) {
      var e = ETQ[p.estado] ? p.estado : 'desconocido';
      var cab = el('div', { class: 'prov-cab' }, [el('i', { class: 'punto' }), el('span', { text: p.nombre })]);
      var pagina = p.meta && typeof p.meta.pagina === 'string' && /^https:\/\/[a-z0-9.-]+(\/|$)/i.test(p.meta.pagina) ? p.meta.pagina : null;
      if (pagina) {
        var a = el('a', { href: pagina, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Abrir la página de estado de ' + p.nombre }, [icono('i-ext')]);
        cab.appendChild(a);
      }
      ul.appendChild(el('li', { class: 'prov', 'data-estado': e }, [cab, el('p', { class: 'prov-txt', text: ETQ[e][0] + ' · ' + (p.detalle || '') })]));
    });
  }

  function hora(t) {
    try { return new Date(t * 1000).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: 'short' }); } catch (e) { return ''; }
  }

  function pintarEventos(lista, desde) {
    var ol = $('#eventos'); ol.replaceChildren();
    $('#eventosVacio').hidden = lista.length > 0;
    var maximo = S.ultimoEvento;
    lista.forEach(function (ev) {
      var e = NIVEL_A_ESTADO[ev.nivel] || 'desconocido';
      var li = el('li', { class: 'evento' + (!S.primera && ev.t > S.ultimoEvento ? ' nuevo' : ''), 'data-estado': e }, [
        el('span', { class: 'evento-ico' }, [icono(NIVEL_ICONO[ev.nivel] || 'i-minus')]),
        el('span', { text: ev.texto }),
        el('time', { class: 'evento-t', title: hora(ev.t), text: hace(ev.t) })
      ]);
      ol.appendChild(li);
      if (ev.t > maximo) maximo = ev.t;
    });
    S.ultimoEvento = maximo;
    $('#actividadDesde').textContent = 'Desde el último reinicio · ' + hace(desde);
  }

  function pintarMedidores(uso) {
    var cont = $('#medidores'); cont.replaceChildren();
    [['Llamadas del día', uso.total, uso.tope_total], ['De ellas, demos con marca', uso.demo, uso.tope_demo]].forEach(function (d) {
      var pct = d[2] ? Math.min(100, Math.round((d[1] / d[2]) * 100)) : 0;
      var estado = pct >= 100 ? 'caido' : pct >= 70 ? 'degradado' : 'ok';
      var relleno = el('i');
      relleno.style.width = pct + '%';
      cont.appendChild(el('div', { class: 'medidor', 'data-estado': estado }, [
        el('div', { class: 'medidor-cab' }, [el('span', { text: d[0] }), el('span', { text: numero(d[1]) + ' / ' + numero(d[2]) })]),
        el('div', { class: 'barra-med', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(d[2]), 'aria-valuenow': String(d[1]), 'aria-label': d[0] }, [relleno])
      ]));
    });
    $('#limitesNota').textContent = 'Por teléfono: ' + uso.tope_por_telefono_hora + '/hora · por conexión: ' + uso.tope_por_ip_hora + '/hora · demos por conexión: ' + uso.tope_demos_por_ip_hora + '/hora.';
  }

  function pintarAccesos(lista) {
    var ul = $('#accesos'); ul.replaceChildren();
    if (!lista.length) { ul.appendChild(el('li', { class: 'vacio', text: 'Sin accesos desde el reinicio.' })); return; }
    lista.forEach(function (a) {
      var ok = a.tipo === 'admin_login_ok';
      ul.appendChild(el('li', { class: 'acceso', 'data-estado': ok ? 'ok' : 'degradado' }, [
        el('i', { class: 'punto' }), el('span', { text: ok ? 'Acceso correcto · ' + a.texto.replace(/^Acceso desde /, '') : 'Intento fallido · ' + a.texto.replace(/^Intento fallido desde /, '') }),
        el('span', { text: hace(a.t) })
      ]));
    });
  }

  function pintarConfig(lista) {
    var cuerpo = $('#tablaCfg tbody'); cuerpo.replaceChildren();
    lista.forEach(function (v) {
      var estado, texto, ico;
      if (v.configurada) { estado = 'ok'; texto = 'Configurada'; ico = 'i-check'; }
      else if (v.requisito === 'obligatoria') { estado = 'caido'; texto = 'Falta'; ico = 'i-x'; }
      else if (v.requisito === 'recomendada') { estado = 'degradado'; texto = 'Pendiente'; ico = 'i-alert'; }
      else { estado = 'sin_configurar'; texto = 'No usada'; ico = 'i-minus'; }
      cuerpo.appendChild(el('tr', {}, [
        el('td', {}, [el('code', { text: v.variable })]),
        el('td', { text: v.requisito }),
        el('td', {}, [el('span', { class: 'etiq', 'data-estado': estado }, [icono(ico), texto])]),
        el('td', { text: v.para })
      ]));
    });
  }

  function pintarPie(d) {
    var min = Math.max(0, Math.round((S.expira - ahoraServidor()) / 60));
    $('#pieSesion').textContent = 'Sesión activa · caduca en ' + (min < 1 ? 'menos de 1 min' : min + ' min') + '.';
    $('#pieSeg').textContent = d.seguridad && d.seguridad.segundo_factor
      ? 'Verificación en dos pasos activada.'
      : 'Recomendado: activa la verificación en dos pasos (ADMIN_TOTP_SECRET).';
  }

  function pintar(d) {
    S.datos = d;
    S.generado = d.generado; S.recibido = Date.now();
    if (d.sesion && d.sesion.expira) S.expira = d.sesion.expira;
    pintarGlobal(d.global, d.servicios);
    d.servicios.forEach(pintarServicio);
    pintarKpis(d);
    pintarProveedores(d.proveedores);
    pintarEventos(d.eventos, d.actividad.desde);
    pintarMedidores(d.uso);
    pintarAccesos(d.accesos);
    pintarConfig(d.configuracion);
    pintarPie(d);
    $('#avisoRed').hidden = true;
    $('#globalCuenta').hidden = false;
    $('#kpis').classList.remove('rancio');
    S.primera = false;
  }

  // ---------------------------------------------------------------- consulta periódica
  function programar(ms) { clearTimeout(S.timer); S.timer = setTimeout(cargar, ms); }

  function marcarVivo(estado, texto) {
    var v = $('#vivo');
    v.setAttribute('data-estado', estado);
    $('#vivoTxt').textContent = texto;
  }

  async function cargar(manual) {
    if (!S.token || S.cargando) return;
    if (document.hidden && !manual) { programar(INTERVALO); return; }
    S.cargando = true;
    $('#btnActualizar').classList.add('girando');
    var ctrl = new AbortController();
    var corte = setTimeout(function () { ctrl.abort(); }, 25000);
    try {
      var r = await fetch(API + '/admin/estado', {
        headers: { Authorization: 'Bearer ' + S.token }, cache: 'no-store', credentials: 'omit',
        referrerPolicy: 'no-referrer', signal: ctrl.signal
      });
      if (r.status === 401) { cerrarSesion('Tu sesión venció. Entra de nuevo.'); return; }
      if (r.status === 404) { cerrarSesion('El panel está apagado en el servidor.'); return; }
      if (r.status === 429) {
        var a = $('#avisoRed'); a.textContent = 'Demasiadas consultas seguidas. El panel esperará un momento.'; a.hidden = false;
        marcarVivo('espera', 'En pausa'); programar(30000); return;
      }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var datos = await r.json();
      S.fallos = 0; S.ultimaCarga = Date.now();
      pintar(datos);
      marcarVivo('ok', 'En vivo · ' + hace(datos.generado));
      programar(INTERVALO);
    } catch (e) {
      S.fallos++;
      mostrarFallo();
      programar(Math.min(INTERVALO * (S.fallos + 1), 40000));
    } finally {
      clearTimeout(corte);
      S.cargando = false;
      $('#btnActualizar').classList.remove('girando');
    }
  }

  function mostrarFallo() {
    marcarVivo(S.fallos >= 2 ? 'error' : 'espera', S.fallos >= 2 ? 'Sin conexión' : 'Reintentando…');
    Object.keys(tarjetas).forEach(function (id) { tarjetas[id].raiz.classList.add('rancio'); });
    if (S.fallos < 2) return;
    var host = API.replace(/^https?:\/\//, '').replace(/\/api$/, '');
    var caja = $('#global');
    caja.setAttribute('data-estado', 'caido');
    $('#globalIco').setAttribute('href', '#i-x');
    $('#globalTitulo').textContent = 'No se puede contactar con la API';
    $('#globalResumen').textContent = 'El panel no recibe respuesta de ' + host + (S.datos ? '. Se muestran los últimos datos recibidos ' + hace(S.datos.generado) + '.' : '.');
    document.title = 'Sin conexión · Machea';
    $('#globalCuenta').hidden = true;                    // los conteos viejos contradirían el mensaje
    $('#kpis').classList.add('rancio');
    var a = $('#avisoRed');
    a.textContent = 'Sin conexión con la API (' + S.fallos + ' intentos seguidos). Si tu internet funciona, el backend está caído.';
    a.hidden = false;
  }

  // Cada segundo: la hora relativa y la caducidad de la sesión (sin pedir nada a la red).
  function latido() {
    if (!S.token) return;
    if (S.expira && ahoraServidor() >= S.expira) { cerrarSesion('Tu sesión venció. Entra de nuevo.'); return; }
    if (S.datos && S.fallos === 0) {
      // Honesto con lo que se ve: "en vivo" solo si los datos son recientes y la pestaña consulta.
      var edad = ahoraServidor() - S.datos.generado;
      if (document.hidden) marcarVivo('espera', 'En pausa · ' + hace(S.datos.generado));
      else if (edad > INTERVALO / 1000 * 3.5) marcarVivo('espera', 'Actualizando… · ' + hace(S.datos.generado));
      else marcarVivo('ok', 'En vivo · ' + hace(S.datos.generado));
    }
    Object.keys(tarjetas).forEach(function (id) {
      var c = tarjetas[id];
      if (c.chequeadoEn) c.chequeo.textContent = 'Comprobado ' + hace(c.chequeadoEn);
    });
    if (S.datos) pintarPie(S.datos);
  }

  // ---------------------------------------------------------------- tema
  function temaActual() {
    var t = document.documentElement.getAttribute('data-tema');
    if (t) return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }
  function aplicarTema(t) {
    if (t === 'claro' || t === 'oscuro') document.documentElement.setAttribute('data-tema', t);
    var oscuro = temaActual() === 'oscuro';
    var use = $('#btnTema use');
    if (use) use.setAttribute('href', oscuro ? '#i-sun' : '#i-moon');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', oscuro ? '#111823' : '#ffffff');
  }

  // ---------------------------------------------------------------- arranque
  function iniciar() {
    var guardado = leer('localStorage', CLAVE_TEMA);
    aplicarTema(guardado === 'claro' || guardado === 'oscuro' ? guardado : null);
    $('#btnTema').addEventListener('click', function () {
      var nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
      guardar('localStorage', CLAVE_TEMA, nuevo);
      aplicarTema(nuevo);
    });
    $('#formLogin').addEventListener('submit', enviarLogin);
    $('#btnOjo').addEventListener('click', function () {
      var i = $('#inClave'), ver = i.type === 'password';
      i.type = ver ? 'text' : 'password';
      this.setAttribute('aria-pressed', ver ? 'true' : 'false');
      this.setAttribute('aria-label', ver ? 'Ocultar la clave' : 'Mostrar la clave');
    });
    $('#btnSalir').addEventListener('click', salir);
    $('#btnActualizar').addEventListener('click', function () { clearTimeout(S.timer); S.cargando = false; cargar(true); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && S.token && Date.now() - S.ultimaCarga > 4000) { clearTimeout(S.timer); cargar(); }
    });
    setInterval(latido, 1000);

    // ¿Hay una sesión de esta pestaña todavía vigente?
    var previa = null;
    try { previa = JSON.parse(leer('sessionStorage', CLAVE_SESION) || 'null'); } catch (e) {}
    if (previa && previa.t && previa.e * 1000 > Date.now()) entrar(previa.t, previa.e);
    else { borrar('sessionStorage', CLAVE_SESION); mostrar('login'); }
  }

  iniciar();
})();
