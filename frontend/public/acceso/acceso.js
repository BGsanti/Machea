/* MACHEA — Acceso con marca propia (prototipo).
 *
 * QUÉ HACE. Viste la pantalla de acceso con la identidad de una empresa a partir de UNO o DOS
 * colores y un nombre, y se asegura de que todo se lea: el texto sobre el panel y sobre el
 * botón es blanco u oscuro según el contraste, y los enlaces se oscurecen hasta pasar AA (4,5:1).
 *
 * DE DÓNDE SALE LA MARCA (en este orden):
 *   ?demo=<token>   el enlace firmado de "Pruébalo con tu marca" (nombre, tipo, color y logo del prospecto)
 *   ?marca=<slug>   una marca de ejemplo ya conocida (machea, amarilo, colsubsidio, constructora-bolivar, cusezar)
 *   (nada)          Machea
 * Un nombre o un color escritos a mano en la dirección NO se aceptan: cualquiera podría armar un
 * enlace con el nombre de un banco. Solo el editor (?editor=1) deja probar colores y nombres libres,
 * y lo hace en tu pantalla, sin tocar la dirección.
 *
 * NO HACE LOGIN. El formulario no envía nada a ningún sitio (la CSP lo impide) y descarta lo escrito.
 * Todo texto externo se pinta con textContent.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var HEX = /^#[0-9a-f]{6}$/i;
  var BLANCO = '#ffffff';
  var OSCURO = '#1b2230';
  var FONDO_FORM = '#fbfaf8';

  // La API solo se toca para el logo de una demo. Solo en tu máquina se acepta ?api=http://127.0.0.1:8100/api.
  var API = (function () {
    var porDefecto = 'https://machea-api.onrender.com/api';
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') {
      try {
        var q = new URLSearchParams(location.search).get('api');
        if (q && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/api$/.test(q)) return q;
      } catch (e) {}
    }
    return porDefecto;
  })();

  // ---------------------------------------------------------------- marcas conocidas
  var PRESETS = {
    machea: { nombre: 'Machea', tipo: 'inmobiliaria', primario: '#ff6259', panel: '#2d3b4e', propia: true },
    amarilo: { nombre: 'Amarilo', tipo: 'constructora', primario: '#e30613' },
    colsubsidio: { nombre: 'Colsubsidio', tipo: 'constructora', primario: '#0067b1' },
    'constructora-bolivar': { nombre: 'Constructora Bolívar', tipo: 'constructora', primario: '#00843d' },
    cusezar: { nombre: 'Cusezar', tipo: 'constructora', primario: '#00a0af' },
    claro: { nombre: 'Hogar Sol', tipo: 'inmobiliaria', primario: '#ffc900' }   // solo en el editor: una marca CLARA
  };
  var ETIQUETAS = { machea: 'Machea', amarilo: 'Amarilo', colsubsidio: 'Colsubsidio', 'constructora-bolivar': 'Bolívar', cusezar: 'Cusezar', claro: 'Marca clara' };
  var EN_URL = ['machea', 'amarilo', 'colsubsidio', 'constructora-bolivar', 'cusezar'];

  var TEXTOS = {
    inmobiliaria: {
      titulo: 'Tus leads, listos para comprar',
      desc: 'Machea califica a cada interesado con una experiencia interactiva y una llamada de IA, y entrega a tus asesores solo a quienes están listos.'
    },
    constructora: {
      titulo: 'Más compradores listos para tu proyecto',
      desc: 'Machea califica a cada interesado en tus proyectos con una experiencia interactiva y una llamada de IA, y entrega a tu fuerza de ventas solo a quienes están listos para comprar.'
    }
  };

  // ---------------------------------------------------------------- color
  function rgb(h) {
    h = String(h).replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function hex(c) {
    return '#' + c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function mezcla(a, b, t) {
    var x = rgb(a), y = rgb(b);
    return hex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
  }
  function lum(h) {
    var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    var la = lum(a), lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')'; }

  // El color, oscurecido (mezcla con negro) lo justo para que `texto` se lea encima con `min`:1.
  // null si habría que oscurecerlo más de `tope`: ya no sería el color de la marca.
  function oscurecerHasta(color, texto, min, tope) {
    for (var t = 0; t <= tope + 1e-9; t += 0.02) {
      var c = mezcla(color, '#000000', t);
      if (contraste(c, texto) >= min) return c;
    }
    return null;
  }

  // De uno o dos colores salen todos los tokens de la pantalla.
  function derivar(m) {
    var p = m.primario;

    // Botón: blanco encima si se puede (oscureciendo hasta un 40 %); si el color es claro, texto oscuro.
    var boton = p, botonTxt = BLANCO;
    if (contraste(p, BLANCO) < 4.5) {
      var o = oscurecerHasta(p, BLANCO, 4.5, 0.4);
      if (o) boton = o;
      else botonTxt = contraste(p, OSCURO) >= 4.5 ? OSCURO : BLANCO;
    }
    // Enlaces sobre el fondo claro del formulario.
    var texto = contraste(p, FONDO_FORM) >= 4.5 ? p : (oscurecerHasta(p, FONDO_FORM, 4.5, 0.75) || '#1d2735');

    // Panel: mismo criterio con el color del panel (el de la marca, o uno propio como el navy de Machea).
    var base = m.panel || p, g2 = base, on = BLANCO;
    // Con más margen que el botón (5,2:1): el degradado aclara una esquina y ahí no puede bajar de ~4:1.
    if (contraste(base, BLANCO) < 5.2) {
      var o2 = oscurecerHasta(base, BLANCO, 5.2, 0.4);
      if (o2) g2 = o2; else on = OSCURO;
    }
    var claroSobre = on === BLANCO;
    var g1 = mezcla(g2, BLANCO, claroSobre ? 0.09 : 0.22);
    var g3 = mezcla(g2, '#000000', claroSobre ? 0.34 : 0.18);
    var propioPanel = !!m.panel && m.panel.toLowerCase() !== p.toLowerCase();

    return {
      '--p': p,
      '--p-boton': boton,
      '--p-boton-hover': mezcla(boton, '#000000', 0.12),
      '--p-boton-txt': botonTxt,
      '--p-texto': texto,
      '--p-aro': rgba(p, 0.34),
      '--p-suave': mezcla(p, BLANCO, 0.9),
      '--g1': g1, '--g2': g2, '--g3': g3,
      '--on': on,
      '--on-2': rgba(on, claroSobre ? 0.82 : 0.8),
      '--on-3': rgba(on, claroSobre ? 0.16 : 0.12),
      '--vidrio': rgba(on, claroSobre ? 0.1 : 0.07),
      '--vidrio-borde': rgba(on, claroSobre ? 0.22 : 0.16),
      '--rejilla': rgba(on, claroSobre ? 0.06 : 0.07),
      '--glow': propioPanel ? rgba(p, 0.42) : rgba(claroSobre ? BLANCO : '#ffffff', claroSobre ? 0.16 : 0.34)
    };
  }

  function aplicarTokens(tokens) {
    var raiz = document.documentElement;
    Object.keys(tokens).forEach(function (k) { raiz.style.setProperty(k, tokens[k]); });
    var meta = $('#metaTema');
    if (meta) meta.setAttribute('content', tokens['--g2']);
  }

  // ---------------------------------------------------------------- de dónde sale la marca
  function limpiarNombre(t) {
    return String(t || '').replace(/[\u0000-\u001f<>{}"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  }

  function decodificarDemo(token) {
    var partes = String(token || '').split('.');
    if (partes.length !== 3 || partes[0] !== 'v1') return null;
    var b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var d;
    try {
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      d = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (e) { return null; }
    var nombre = limpiarNombre(d && d.n);
    if (!nombre || (d.t !== 'inmobiliaria' && d.t !== 'constructora')) return null;
    if (d.exp && d.exp * 1000 < Date.now()) return null;
    var colores = Array.isArray(d.c) ? d.c : [];
    return {
      nombre: nombre,
      tipo: d.t,
      primario: HEX.test(colores[0] || '') ? colores[0].toLowerCase() : PRESETS.machea.primario,
      logo: (d.li || d.l) ? API + '/marca/logo?d=' + encodeURIComponent(token) : ''
    };
  }

  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  function marcaDeLaUrl() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return clonar(PRESETS.machea); }
    var token = q.get('demo');
    if (token) { var d = decodificarDemo(token); if (d) return d; }
    var slug = (q.get('marca') || '').toLowerCase();
    if (EN_URL.indexOf(slug) >= 0) return clonar(PRESETS[slug]);
    return clonar(PRESETS.machea);
  }

  // ---------------------------------------------------------------- identidad (logo / nombre)
  function el(tag, clase, texto) {
    var n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function lockup(clase) {
    var s = svg('svg', { viewBox: '0 0 155.6 33.7', role: 'img', 'aria-label': 'Machea', 'class': clase });
    s.appendChild(svg('use', { href: '#logo-lockup' }));
    return s;
  }
  // Si el logo no carga (venció el enlace, el sitio lo bloqueó…) se escribe el nombre: nunca un icono roto.
  function imagenLogo(m, clase) {
    var img = el('img', clase);
    img.alt = m.nombre; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', function () {
      if (img.parentNode) img.parentNode.replaceChild(el('span', 'id-nombre', m.nombre), img);
    });
    img.src = m.logo;
    return img;
  }

  // `donde`: 'form' (sobre fondo claro) o 'panel' (sobre el degradado).
  function identidad(m, donde, grande) {
    if (m.propia) return lockup(donde === 'form' ? 'lockup' : 'id-lockup');
    var pila = el('div', 'id-pila');
    if (m.logo) {
      if (donde === 'panel') {
        var pastilla = el('span', 'id-pastilla');
        pastilla.appendChild(imagenLogo(m, 'id-logo'));
        pila.appendChild(pastilla);
        pila.appendChild(el('span', 'id-nombre', m.nombre));
      } else {
        pila.appendChild(imagenLogo(m, 'id-logo'));
      }
    } else {
      pila.appendChild(el('span', 'id-nombre', m.nombre));
    }
    return pila;
  }

  // ---------------------------------------------------------------- animación
  var SILUETAS = [
    'M3 11 12 3l9 8v10H3z M9.5 21v-6h5v6',
    'M6 21V3h12v18z M9.5 7h1 M13.5 7h1 M9.5 11h1 M13.5 11h1 M9.5 15h1 M13.5 15h1 M10.5 21v-2.5h3V21',
    'M3 21V9h7v12 M14 21V3h7v18 M5.5 12h2 M5.5 16h2 M16.5 7h2 M16.5 11h2 M16.5 15h2',
    'M12 21s-6.5-5.7-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21z M12 10.5m-2.2 0a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0-4.4 0',
    'M3 12 12 4l9 8 M6.5 10.5V21h11V10.5 M9.5 15l2 2 3.5-3.5'
  ];

  // Siempre la misma lluvia (semilla fija): que la entrada no cambie de una vez a otra.
  function semilla(s) {
    return function () {
      s |= 0; s = s + 0x6d2b79f5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pintarLluvia() {
    var cont = $('#lluvia');
    cont.replaceChildren();
    var azar = semilla(42);
    SILUETAS.forEach(function (d, a) {
      for (var s = 0; s < 3; s++) {
        var izq = ((a * 3 + s) / 15) * 100 + 5 * azar();
        var lado = 22 + 30 * azar();
        var g = svg('svg', { viewBox: '0 0 24 24', 'class': 'gota' });
        g.style.left = izq.toFixed(1) + '%';
        g.style.width = lado.toFixed(0) + 'px';
        g.style.height = lado.toFixed(0) + 'px';
        g.style.setProperty('--r', (1.5 * azar()).toFixed(2) + 's');
        g.style.setProperty('--d', (0.9 + 0.8 * azar()).toFixed(2) + 's');
        g.style.setProperty('--o', (0.4 + 0.25 * azar()).toFixed(2));
        g.appendChild(svg('path', { d: d }));
        cont.appendChild(g);
      }
    });
  }

  var timers = [];
  function limpiarTimers() { timers.forEach(clearTimeout); timers = []; }
  function luego(ms, fn) { timers.push(setTimeout(fn, ms)); }

  var sinAnimacion = function () {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches || window.matchMedia('(max-width: 1023px)').matches;
  };

  function mostrarTodo(textos) {
    $('#tituloEscrito').textContent = textos.titulo;
    $('#intro').classList.add('fuera');
    $('#marcaCuerpo').classList.add('listo');
    $('#marcaDesc').classList.add('entra');
    document.querySelectorAll('.chip').forEach(function (c) { c.classList.add('entra'); });
    $('.cursor').classList.add('quieto');
  }

  // La entrada: 1,5 s de marca atravesando la pantalla, y luego el título se escribe letra a letra,
  // aparece la descripción y entran las tres tarjetas una tras otra.
  function reproducir() {
    limpiarTimers();
    var textos = TEXTOS[marca.tipo] || TEXTOS.inmobiliaria;
    $('#tituloCompleto').textContent = textos.titulo;
    if (sinAnimacion()) { mostrarTodo(textos); return; }

    var intro = $('#intro'), cuerpo = $('#marcaCuerpo'), cursor = $('.cursor');
    pintarLluvia();
    var im = $('#introMarca'); im.replaceChildren(); im.appendChild(identidad(marca, 'panel', true));
    // reinicia la animación de la marca (quita y vuelve a poner el nodo)
    var padre = im.parentNode, siguiente = im.nextSibling; padre.removeChild(im); padre.insertBefore(im, siguiente);

    intro.classList.remove('fuera');
    cuerpo.classList.remove('listo');
    $('#marcaDesc').classList.remove('entra');
    document.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('entra'); });
    $('#tituloEscrito').textContent = '';
    cursor.classList.remove('quieto');

    luego(1500, function () {
      intro.classList.add('fuera');
      cuerpo.classList.add('listo');
      var i = 0;
      (function escribir() {
        if (i > textos.titulo.length) {
          luego(300, function () { $('#marcaDesc').classList.add('entra'); });
          document.querySelectorAll('.chip').forEach(function (c, k) { luego(700 + k * 200, function () { c.classList.add('entra'); }); });
          luego(2000, function () { cursor.classList.add('quieto'); });
          return;
        }
        $('#tituloEscrito').textContent = textos.titulo.slice(0, i++);
        luego(45 + 30 * Math.random(), escribir);
      })();
    });
  }

  // ---------------------------------------------------------------- pintar la marca
  var marca = null;

  function pintarMarca() {
    var m = marca;
    aplicarTokens(derivar(m));

    var logoForm = $('#formLogo'); logoForm.replaceChildren(); logoForm.appendChild(identidad(m, 'form'));
    var id = $('#marcaId'); id.replaceChildren(); id.appendChild(identidad(m, 'panel'));

    var textos = TEXTOS[m.tipo] || TEXTOS.inmobiliaria;
    $('#tituloCompleto').textContent = textos.titulo;
    $('#marcaDesc').textContent = textos.desc;
    $('#marcaEyebrow').textContent = m.propia ? 'Machea CRM' : 'Panel comercial';
    $('#formSub').textContent = m.propia ? 'Ingresa a tu panel para continuar' : 'Ingresa al panel de ' + m.nombre;
    $('#marcaPie').hidden = !!m.propia;
    document.title = 'Acceso · ' + m.nombre;
  }

  function aplicar(m, conAnimacion) {
    marca = m;
    pintarMarca();
    if (conAnimacion) reproducir();
    else { limpiarTimers(); mostrarTodo(TEXTOS[m.tipo] || TEXTOS.inmobiliaria); }
  }

  // ---------------------------------------------------------------- formulario (sin login real)
  var toastTimer = null;
  function aviso(texto) {
    var t = $('#toast');
    t.textContent = texto; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3600);
  }
  function alerta(texto, tipo) {
    var a = $('#alerta');
    $('#alertaTxt').textContent = texto;
    a.className = 'alerta' + (tipo === 'error' ? ' error' : '') + ' entra';
    a.hidden = false;
  }

  function iniciarFormulario() {
    var correo = $('#correo'), clave = $('#clave'), boton = $('#entrar');

    $('#ojo').addEventListener('click', function () {
      var ver = clave.type === 'password';
      clave.type = ver ? 'text' : 'password';
      this.setAttribute('aria-pressed', ver ? 'true' : 'false');
      this.setAttribute('aria-label', ver ? 'Ocultar la contraseña' : 'Mostrar la contraseña');
      this.firstElementChild.firstElementChild.setAttribute('href', ver ? '#i-eye-off' : '#i-eye');
    });

    document.querySelectorAll('[data-aviso]').forEach(function (n) {
      n.addEventListener('click', function (e) { e.preventDefault(); aviso(n.getAttribute('data-aviso')); });
    });

    [correo, clave].forEach(function (i) { i.addEventListener('input', function () { i.classList.remove('mal'); }); });

    $('#form').addEventListener('submit', function (e) {
      e.preventDefault();
      $('#alerta').hidden = true;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.value.trim())) {
        correo.classList.add('mal'); alerta('Escribe un correo válido.', 'error'); correo.focus(); return;
      }
      if (!clave.value) { clave.classList.add('mal'); alerta('Escribe tu contraseña.', 'error'); clave.focus(); return; }
      // Nada se envía ni se guarda: solo se muestra cómo se sentiría.
      boton.setAttribute('aria-busy', 'true'); boton.disabled = true;
      setTimeout(function () {
        boton.removeAttribute('aria-busy'); boton.disabled = false;
        clave.value = ''; correo.value = '';
        alerta('Esto es una vista de diseño: aún no hay inicio de sesión real y no se guardó nada de lo que escribiste.');
        reproducir();
      }, 900);
    });
  }

  // ---------------------------------------------------------------- editor de marca (?editor=1)
  function iniciarEditor() {
    var dock = $('#dock'); dock.hidden = false;
    var presets = $('#dockPresets');
    var nombre = $('#dkNombre'), color = $('#dkColor'), panel = $('#dkPanel'), igual = $('#dkIgual');
    var tipos = dock.querySelectorAll('[data-tipo]');

    function aCampos(m) {
      nombre.value = m.nombre;
      color.value = m.primario;
      panel.value = m.panel || m.primario;
      igual.checked = !m.panel;
      tipos.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-tipo') === m.tipo ? 'true' : 'false'); });
    }
    function desdeCampos() {
      var tipoSel = dock.querySelector('[data-tipo][aria-pressed="true"]');
      var m = {
        nombre: limpiarNombre(nombre.value) || 'Tu empresa',
        tipo: tipoSel ? tipoSel.getAttribute('data-tipo') : 'inmobiliaria',
        primario: HEX.test(color.value) ? color.value.toLowerCase() : PRESETS.machea.primario
      };
      if (!igual.checked) m.panel = panel.value.toLowerCase();
      // Si los campos describen a Machea tal cual, se muestra con su logo.
      if (m.nombre === 'Machea' && m.primario === PRESETS.machea.primario && m.panel === PRESETS.machea.panel) m.propia = true;
      return m;
    }

    Object.keys(PRESETS).forEach(function (k) {
      var b = el('button', null, ETIQUETAS[k]); b.type = 'button'; b.setAttribute('data-preset', k);
      b.setAttribute('aria-pressed', k === 'machea' ? 'true' : 'false');
      b.addEventListener('click', function () {
        presets.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        var m = clonar(PRESETS[k]); aCampos(m); aplicar(m, true);
      });
      presets.appendChild(b);
    });

    function editar() {
      presets.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      aplicar(desdeCampos(), false);
    }
    [nombre, color, panel].forEach(function (i) { i.addEventListener('input', editar); });
    igual.addEventListener('change', editar);
    tipos.forEach(function (b) {
      b.addEventListener('click', function () {
        tipos.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        editar();
      });
    });
    $('#dkRepetir').addEventListener('click', function () { reproducir(); });
    $('#dockX').addEventListener('click', function () { dock.hidden = true; });
    aCampos(marca);
    var activo = presets.querySelector('[data-preset="' + (marca.propia ? 'machea' : '') + '"]');
    if (activo) activo.setAttribute('aria-pressed', 'true');
  }

  // ---------------------------------------------------------------- arranque
  function iniciar() {
    iniciarFormulario();
    marca = marcaDeLaUrl();
    var editor = false;
    try { editor = new URLSearchParams(location.search).has('editor'); } catch (e) {}
    aplicar(marca, true);
    if (editor) iniciarEditor();
    // Ya está pintada la marca: desde aquí sí hay transiciones (el timeout cubre una pestaña oculta).
    setTimeout(function () { document.documentElement.classList.remove('preparando'); }, 80);
  }
  iniciar();
})();
