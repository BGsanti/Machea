/* Traduce las respuestas del formulario a lo que la zonificacion necesita.
   Aisla en un solo sitio el mapeo pregunta -> construccion, que es lo que
   cambia cuando el formulario se reordena o gana preguntas. */
(function () {
  'use strict';

  /* Que pregunta desbloquea cada ambiente, por ID y no por posicion.
     Las etapas (CUANTAS respuestas hacen falta) salen del orden real del
     formulario de la anfitriona: en Machea, `zona` paso a ser la primera y una
     tabla de numeros fijos dejo toda la construccion corrida una pregunta
     (la sala salia antes de contestar el tipo y las alcobas antes de
     contestar cuantas).

     `zona` y `entorno_deseado` no construyen nada — la primera solo ordena los
     proyectos recomendados y la segunda son amenidades del conjunto, no de la
     vivienda. Son pasos con la escena quieta. Mientras nada se haya
     desbloqueado la losa lleva el replanteo de obra y la camara encuadra el
     lote entero (ver `aplicarPlan` en escena.js). */
  var DESBLOQUEA = {
    sala: 'tipo',
    comedor: 'ingresos',     // ademas sube los extras de la sala
    /* Antes con `edad`, la ultima pregunta: su area ya estaba reservada en el
       programa completo desde la primera respuesta (asi los muros no bailan),
       pero sin nadie construyendo ahi se veia como losa cruda pegada a la
       cocina durante media encuesta. Se adelanta junto al resto de la zona
       social: `esJoven` ya tiene un default (< 35 anios) para nombrarla antes
       de saber la edad real, igual que hace con el mobiliario. */
    flexible: 'ingresos',
    cocina: 'personas',
    ropas: 'personas',
    bano: 'habitaciones',
    alcoba1: 'habitaciones',
    alcobas: 'habitaciones'
  };

  // El prototipo (Vivienda 3D) no carga la lista de preguntas de Machea.
  var ORDEN_PROTOTIPO = ['tipo', 'ingresos', 'personas', 'habitaciones', 'zona', 'entorno_deseado', 'edad'];

  var qs = window.GDF && window.GDF.data && window.GDF.data.QUESTIONS;
  var orden = qs && qs.length ? qs.map(function (q) { return q.id; }) : ORDEN_PROTOTIPO;

  var ETAPAS = {};
  Object.keys(DESBLOQUEA).forEach(function (ambiente) {
    ETAPAS[ambiente] = orden.indexOf(DESBLOQUEA[ambiente]) + 1;
  });

  /* Nivel de ingresos -> ACABADOS y extras. No mueve muros: el tamano ya lo
     fijan tipo y habitaciones, y que el plano salte por el ingreso seria
     prometer metros que el catalogo no tiene. Lo que cambia es la calidad:
     pisos (ver `acabado` en floorplan.js) y lo que amuebla la sala.
     Antes eran solo extras de sala, y dos de los cuatro niveles se veian
     identicos porque el "piano" nunca cabia: la pregunta no se notaba. */
  var EXTRAS_SALA = {
    0: [],
    1: [],
    2: ['mesaAuxiliar'],
    3: ['mesaAuxiliar', 'lampara'],
    4: ['mesaAuxiliar', 'lampara', 'biblioteca', 'plantas']
  };

  // 0 = aun sin contestar: acabado neutro, igual al de siempre.
  function nivelIngresos(answers) {
    return { '≤2 SMMLV': 1, '2–4 SMMLV': 2, '4–8 SMMLV': 3, '8+ SMMLV': 4 }[answers.ingresos] || 0;
  }

  function personasACargo(answers) {
    return answers.personas === '4+' ? 4 : Number(answers.personas || 0);
  }

  /* Mientras no se conteste cuantas alcobas, se estima por el tamano del hogar.
     Sin estimacion la planta se dimensionaria para una sola y al contestar
     tendria que crecer entera. */
  function sugeridaAlcobas(answers) {
    return Math.min(3, Math.max(1, 1 + Math.ceil(personasACargo(answers) / 2)));
  }

  function perfilDesdeRespuestas(answers, paso) {
    answers = answers || {};
    paso = paso || 0;

    var contestadas = paso;
    var n;
    if (contestadas >= ETAPAS.alcobas && answers.habitaciones) {
      n = answers.habitaciones === '3+' ? 3 : Number(answers.habitaciones);
    } else {
      n = contestadas >= ETAPAS.cocina ? sugeridaAlcobas(answers) : 2;
    }

    return {
      paso: contestadas,
      etapas: ETAPAS,
      // Todo lo que no diga 'No VIS' es VIS: el catalogo solo tiene esos dos.
      vis: answers.tipo !== 'No VIS',
      nAlcobas: n,
      // Antes de responder `habitaciones`, `n` es una ESTIMA que puede no
      // coincidir con lo que se responda despues. Cualquier regla que dependa
      // de un umbral de `n` (como cuantos ambientes entran en el programa) debe
      // mirar esta bandera primero: si no, la estima de un paso temprano puede
      // activar una regla pensada para la respuesta real y mover el plano sin
      // que el usuario haya contestado nada nuevo.
      nAlcobasResuelto: contestadas >= ETAPAS.alcobas && !!answers.habitaciones,
      // Una alcoba: un solo bano, privado. Dos o mas: social + principal.
      nBanos: n >= 2 ? 2 : 1,
      // El ambiente flexible es estudio para los mas jovenes y sala de estar
      // para el resto. Misma area, distinto nombre y mobiliario.
      esJoven: Number(answers.edad || 35) < 35,
      personas: personasACargo(answers),
      nivel: nivelIngresos(answers),
      extrasSala: EXTRAS_SALA[nivelIngresos(answers)] || [],
      // El espejado de la planta se siembra con el nombre para que dos personas
      // distintas no vean exactamente el mismo apartamento. Determinista: no
      // cambia mientras se responde.
      semilla: (answers.tipo || '') + '|' + (answers.nombres || '') + (answers.apellidos || '')
    };
  }

  window.GDF3D = window.GDF3D || {};
  window.GDF3D.perfilDesdeRespuestas = perfilDesdeRespuestas;
  window.GDF3D.ETAPAS = ETAPAS;
})();
