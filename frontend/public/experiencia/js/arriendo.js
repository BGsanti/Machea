// GET /api/arriendo (backend/api/app.py): match de Arriendo
// (vivienda/oficina/bodega) sobre el catálogo demo que scrapeó
// scraping/scraper_arriendo.py de Fincaraíz. El backend lo puntúa con
// Model/arriendo.py -- la misma cercanía, el mismo k-NN de perfil y los mismos
// porcentajes que Compra, sin el histórico ni la cuota de hipoteca, que en un
// canon mensual no existen.
//
// Mismo MACHEA_BASE que recomendar() (ver base() en js/machea.js): es el
// mismo servicio de backend/api/app.py, solo otra ruta.
(function () {
  'use strict';

  function base() {
    return (window.GDF_CONFIG && window.GDF_CONFIG.MACHEA_BASE) || '';
  }

  var TIPOS = { Vivienda: 'vivienda', Oficinas: 'oficina', Bodegas: 'bodega' };

  function tipoInmuebleDe(answers) {
    return TIPOS[answers.tipo_propiedad] || 'vivienda';
  }

  // Una entrada por sector elegido en el mapa, "<localidad>" o
  // "<localidad>:<barrio>". Se mandan TODOS (no solo el primero, como hace
  // Compra): el modelo mide la cercanía a la más cercana de todas.
  function zonasDe(state) {
    var localidades = (window.GDF.machea && window.GDF.machea.LOCALIDADES) || {};
    var sectores = state.zonaSectores || [];
    if (!sectores.length && state.answers.zona) {
      sectores = [{ localidad: state.answers.zona, barrio: null }];
    }
    var zonas = [];
    sectores.forEach(function (s) {
      var loc = localidades[s.localidad] || s.localidad;
      if (!loc) return;
      var valor = String(loc) + (s.barrio ? ':' + s.barrio : '');
      if (zonas.indexOf(valor) < 0) zonas.push(valor);
    });
    return zonas;
  }

  /**
   * Llama a GET /api/arriendo. `cb` recibe siempre:
   *   { estado: 'listo' | 'error', items, error }
   * No hay 'vacio' aparte de 'listo': una lista vacía ya lo dice (ver
   * resultadoArriendo() en templates.js).
   */
  function cargar(state, cb) {
    var url = base();
    if (!url) {
      console.error('[GDF/arriendo] Falta window.GDF_CONFIG.MACHEA_BASE (ver js/config.js).');
      cb({ estado: 'error', items: [], error: 'MACHEA_BASE no configurado' });
      return;
    }

    var answers = state.answers;
    var params = ['tipo_inmueble=' + encodeURIComponent(tipoInmuebleDe(answers))];
    zonasDe(state).forEach(function (z) {
      params.push('zona=' + encodeURIComponent(z));
    });

    // Presupuesto y preferencias solo existen en el recorrido de Vivienda:
    // Oficinas/Bodegas terminan en la zona (ver qListFor en state.js), así que
    // para ellas el modelo puntúa solo la cercanía.
    if (answers.presupuesto) params.push('presupuesto=' + encodeURIComponent(answers.presupuesto));
    var prefs = answers.preferencias;
    if (prefs) {
      ['habitaciones', 'banos', 'estrato', 'parqueaderos'].forEach(function (campo) {
        if (prefs[campo] != null) params.push(campo + '=' + encodeURIComponent(prefs[campo]));
      });
    }
    // `estilo_vida` y no `entorno_deseado`: el segundo es el subconjunto que
    // entiende el plano 3D (ver ESTILO_A_AMENIDAD en data.js), y aquí hace
    // falta TODO lo que la persona marcó para cruzarlo contra la ficha.
    (answers.estilo_vida || []).forEach(function (slug) {
      params.push('estilo_vida=' + encodeURIComponent(slug));
    });

    fetch(url + '/arriendo?' + params.join('&'))
      .then(function (res) {
        if (res.ok) return res.json();
        return res
          .json()
          .catch(function () { return {}; })
          .then(function (body) {
            throw new Error(body.detail || 'HTTP ' + res.status);
          });
      })
      .then(function (data) {
        cb({ estado: 'listo', items: data.inmuebles || [], error: null });
      })
      .catch(function (error) {
        console.error('[GDF/arriendo] fetch fallo:', error);
        cb({ estado: 'error', items: [], error: String((error && error.message) || error) });
      });
  }

  window.GDF = window.GDF || {};
  window.GDF.arriendoApi = { cargar: cargar };
})();
