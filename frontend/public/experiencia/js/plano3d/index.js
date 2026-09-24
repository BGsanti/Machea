/* Puente con la experiencia de Machea.
   Es el unico modulo que conoce a la anfitriona; el resto no sabe que existe.

   La anfitriona llama a `actualizar(state, derived)` desde `updatePlantaDOM`,
   que es por donde pasa el quiz: responder o volver atras NO dispara el
   `render()` completo, justamente para no destruir los nodos de la escena. */
(function () {
  'use strict';

  var G = window.GDF3D;
  var escena = null;
  var apagado = false;
  var ultimaClave = null;
  // Evita relanzar el deszoom del entorno en cada repintado mientras se sigue
  // EN esa pregunta (marcar un chip repinta el panel sin cambiar de pregunta).
  var previaEntornoLanzada = false;

  /* Se cae al plano 2D de recortes —que ya funciona— en vez de mostrar un
     hueco. El 3D es una mejora, no un requisito. */
  function soportado() {
    try {
      var c = document.createElement('canvas');
      if (!(c.getContext('webgl2') || c.getContext('webgl'))) return false;
    } catch (e) { return false; }
    var n = navigator;
    if (n.deviceMemory && n.deviceMemory <= 2) return false;
    if (n.hardwareConcurrency && n.hardwareConcurrency <= 2) return false;
    if (n.connection && n.connection.saveData) return false;
    return true;
  }

  function preset() {
    var angosto = window.matchMedia('(max-width: 900px)').matches;
    var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      // En un panel de 250 px las sombras no se leen y cuestan un pase entero.
      sombras: !angosto,
      dprMax: angosto ? 1.5 : 2,
      mapaSombra: 1024,
      animar: !quieto
    };
  }

  function crear() {
    if (escena || apagado) return escena;
    if (!soportado()) { apagado = true; return null; }
    try {
      escena = G.crearEscena(preset());
    } catch (e) {
      // Crear el contexto puede fallar por razones que no detecta el sondeo.
      console.warn('[plano3d] sin 3D:', e);
      apagado = true;
    }
    return escena;
  }

  function actualizar(state, derived) {
    var esc = crear();
    if (!esc) return false;

    var host = document.querySelector('.gdf-scene');
    if (!host) return false;
    // Idempotente: `render()` desprende el lienzo del arbol sin destruir su
    // contexto, asi que basta re-adoptarlo.
    esc.montar(host);
    host.classList.add('con-plano3d');

    // Al aterrizar en la pregunta de entorno (no en cada repintado suyo: marcar
    // un chip no cambia `q.id`), la camara hace un deszoom de ida y vuelta que
    // revela las carreteras y arboles alrededor del lote. Es la unica pregunta
    // que hoy no mueve el plano (ver CLAUDE.md), asi que esto es lo que la
    // hace sentir viva.
    var enPreguntaEntorno = !!(derived && derived.q && derived.q.id === 'entorno_deseado');
    if (enPreguntaEntorno && !previaEntornoLanzada) {
      previaEntornoLanzada = true;
      esc.previsualizarEntorno(3000);
    } else if (!enPreguntaEntorno) {
      previaEntornoLanzada = false;
    }

    var answers = (state && state.answers) || {};
    // `qi` es el indice de la pregunta en curso, o sea cuantas van contestadas.
    var paso = Math.max(0, Number(state && state.qi) || 0);
    if (paso < 1) {
      // Volver al principio (p. ej. "Empezar de nuevo") no debe heredar la
      // vista cenital del intento anterior: es estado de modulo, no del plano.
      esc.resetCamara();
    }

    /* No hay early return en paso 0: `construirPlan` con paso 0 ya da rooms y
       walls vacios pero `meta.ancho/fondo` con la huella completa estimada, y
       `aplicarPlan` con eso solo levanta la losa del lote (ver cajaDelPlano).
       Antes de esto la escena se quedaba en blanco hasta la primera respuesta
       — el lote debe existir antes que la vivienda, no aparecer con ella. */

    /* Reconstruir el plano en cada repintado seria tirar el CSG a la basura sin
       motivo: la anfitriona llama aqui tambien por cambios que no tocan las
       respuestas. */
    var clave = paso + '|' + JSON.stringify(answers);
    if (clave === ultimaClave) return true;
    ultimaClave = clave;

    esc.aplicarPlan(G.construirPlan(answers, paso));
    return true;
  }

  // Sube la camara a vista cenital una unica vez, al terminar el quiz. `cb` es
  // obligatorio para la anfitriona: solo despues de que llega es seguro pasar
  // a la pantalla de resultados sin cortar la animacion a medio camino. Si no
  // hay escena (3D no soportado), avisa de inmediato para no bloquear el flujo.
  function finalizarVistaSuperior(duracion, cb) {
    if (!escena) { if (cb) cb(); return; }
    escena.finalizarVistaSuperior(duracion, cb);
  }

  window.GDF3D.actualizar = actualizar;
  window.GDF3D.finalizarVistaSuperior = finalizarVistaSuperior;
  window.GDF3D.activo = function () { return !!escena && !apagado; };
  window.GDF3D.escena = function () { return escena; };
})();
