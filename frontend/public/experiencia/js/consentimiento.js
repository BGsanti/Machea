// Textos de autorización del formulario (design/crm/CONSENTIMIENTO.md en la rama crm/multiempresa).
//
// Son textos legales: no salen del copy de cada marca (tenants/<slug>/marca.js), salen de aquí. Diego eligió
// los cortos (D5, 2026-10-18). Cada cambio de un texto SUBE SU VERSIÓN: la versión y el texto exacto se
// guardan con la consulta (consultas.autorizacion) y con la llamada (solicitudes_llamada), y son la prueba de
// lo que la persona aceptó.
//
// Dos momentos:
//   1. registro(): la casilla del registro. En el formulario de Machea autoriza a Machea; en uno con marca,
//      a esa empresa (Machea opera el formulario en su nombre).
//   2. compartir(): la hoja "Antes de llamarte". Al tocar "Hablar con un asesor" en un proyecto que es de otra
//      empresa (en Machea, de cualquiera), la llamada solo sale si la persona autoriza compartir sus datos con
//      esa empresa. Sin dueño conocido o en una demo con marca, no se pide y no se comparte.
(function () {
  'use strict';

  var RUTA_PRIVACIDAD = '/privacidad/';
  var VERSION = {
    registroMachea: 'registro-machea-v1',
    registroMarca: 'registro-marca-v1',
    compartir: 'compartir-v1',
  };
  // Nombre para mostrar de las constructoras del catálogo (proyectos_bogota.json trae el slug).
  var CONSTRUCTORAS = {
    amarilo: 'Amarilo',
    bolivar: 'Constructora Bolívar',
    colsubsidio: 'Colsubsidio',
    cusezar: 'Cusezar',
  };

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function marca() {
    return window.GDF_MARCA || {};
  }

  function esFormularioMachea() {
    return (marca().slug || 'machea') === 'machea';
  }

  function nombreMarca() {
    return (marca().identidad && marca().identidad.nombre) || 'Machea';
  }

  // El enlace va dentro de la etiqueta de la casilla: `abrirEnlace` hace que main.js lo deje abrirse sin
  // marcar ni desmarcar la casilla.
  function enlace(texto, url) {
    return ' <a href="' + esc(url) + '" target="_blank" rel="noopener" data-action="abrirEnlace">' + esc(texto) + '</a>';
  }

  /** La casilla del registro: { version, texto, html }. */
  function registro() {
    if (esFormularioMachea()) {
      var texto =
        'Autorizo a Machea a usar mis datos (nombre, correo, teléfono y mis respuestas) para recomendarme ' +
        'vivienda, llamarme con su asistente virtual y escribirme sobre los proyectos que me interesen. ' +
        'Puedo consultar, corregir o borrar mis datos cuando quiera.';
      return { version: VERSION.registroMachea, texto: texto, html: esc(texto) + enlace('Política de privacidad', RUTA_PRIVACIDAD) };
    }
    var n = nombreMarca();
    var textoMarca =
      'Autorizo a ' + n + ' a usar mis datos (nombre, correo, teléfono y mis respuestas) para contactarme sobre ' +
      'sus proyectos de vivienda. Machea opera este formulario y la llamada en nombre de ' + n + '.';
    var politica = (marca().identidad && marca().identidad.privacidad) || RUTA_PRIVACIDAD;
    return {
      version: VERSION.registroMarca,
      texto: textoMarca,
      html: esc(textoMarca) + enlace('Política de privacidad', politica),
    };
  }

  function titulo(slug) {
    return String(slug || '')
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); })
      .join(' ');
  }

  /**
   * De quién es lo que la persona eligió: { tipo, slug, nombre, proyecto } o null.
   * Compra: la constructora del proyecto (vm.constructoras, del catálogo). Arriendo: la inmobiliaria que
   * publica el inmueble. El backend lo vuelve a sacar del catálogo por id: esto es solo para mostrarlo.
   */
  function duenoDeElegido(state, id) {
    if (state.answers && state.answers.operacion === 'arriendo') {
      var inm = ((state.arriendo && state.arriendo.items) || []).filter(function (r) {
        return String(r.id_inmueble) === String(id);
      })[0];
      var pub = inm && String(inm.inmobiliaria_publicadora || '').trim();
      if (!pub) return null;
      return { tipo: 'inmobiliaria', slug: null, nombre: pub, proyecto: inm.nombre || 'el inmueble' };
    }
    var vm = ((state.reco && state.reco.items) || []).filter(function (p) { return p.id === id; })[0];
    var slug = vm && vm.constructoras && vm.constructoras[0];
    if (!slug) return null;
    return { tipo: 'constructora', slug: slug, nombre: CONSTRUCTORAS[slug] || titulo(slug), proyecto: vm.nombre };
  }

  /** ¿Hay que pedir permiso antes de llamar? Solo si el dueño es otra empresa y no es una demo. */
  function requierePermiso(dueno) {
    if (!dueno) return false;
    if (window.GDF_DEMO && window.GDF_DEMO.token) return false;
    var propia = marca().constructora;
    return !(propia && dueno.tipo === 'constructora' && dueno.slug === propia);
  }

  /** La casilla de la hoja "Antes de llamarte": { version, texto, html }. */
  function compartir(dueno) {
    var quien = (dueno.tipo === 'inmobiliaria' ? 'la inmobiliaria ' : '') + dueno.nombre;
    var texto =
      'Autorizo a Machea a compartir con ' + quien + ' mi nombre, correo, teléfono, mis respuestas y el ' +
      'resultado de la llamada, para que me contacten sobre ' + dueno.proyecto + '.';
    return {
      version: VERSION.compartir,
      texto: texto,
      html:
        'Autorizo a Machea a compartir con <b>' + esc(quien) + '</b> mi nombre, correo, teléfono, mis respuestas ' +
        'y el resultado de la llamada, para que me contacten sobre <b>' + esc(dueno.proyecto) + '</b>.' +
        enlace('Política de privacidad', RUTA_PRIVACIDAD),
    };
  }

  window.GDF = window.GDF || {};
  window.GDF.consentimiento = {
    VERSION: VERSION,
    registro: registro,
    duenoDeElegido: duenoDeElegido,
    requierePermiso: requierePermiso,
    compartir: compartir,
  };
})();
