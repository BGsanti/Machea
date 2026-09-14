// Estado central + valores derivados + acciones. Equivalente vanilla del
// estado de hooks + "renderVals()" del prototipo React original.
(function () {
  'use strict';

  function createInitial() {
    return {
      // splash | escarapela | quiz | result | confirmacion
      // 'result' es la pantalla de SELECCIÓN de proyectos (ya sin la casa) y
      // 'confirmacion' es el cierre. Se conserva el nombre 'result' para no
      // renombrar acciones/CSS que ya funcionan.
      //
      // Ya no hay 'landing': esa era la portada clonada de Colsubsidio y se
      // borró con el resto. La app entra directa al splash.
      //
      // EMBEBIDA (`?embed=1`, ver index.html) entra una pantalla más adentro,
      // en la escarapela: quien llega ya pulsó "¡Empezar mi match!" y el
      // splash sería una segunda puerta. No se salta también la escarapela
      // porque es donde se piden nombre y teléfono; sin ella la confirmación
      // cierra con un lead sin contacto y nada lo delata.
      screen: window.GDF_EMBED ? 'escarapela' : 'splash',
      // Sin pantalla de elegir personaje: 'x' (avatar neutro) por defecto.
      gender: 'x', // 'f' | 'm' | 'x'
      nombre: '',
      apellido: '',
      correo: '',
      telefono: '',
      afiliado: null,
      consent: false,
      qi: 0,
      answers: {},
      matches: [],
      lead: null, // resultado de computeLeadQualification
      // Selección ÚNICA: guarda el `id` del view-model elegido (id_proyecto si
      // vino del backend). El contrato manda un solo `proyecto_elegido`, así
      // que marcar uno desmarca el anterior.
      chosen: null,
      // Pagina visible de la seleccion, 0..2. El modelo devuelve 18 proyectos
      // y la pantalla los reparte de seis en seis (ver `recoLista` en
      // templates.js). Vive aqui y no en el DOM para que marcar un proyecto
      // —que repinta la pantalla— no devuelva al usuario a la primera pagina.
      recoPagina: 0,

      // Paso 1 del contrato: POST /recomendaciones. Ver js/leads.js.
      // 'vacio' NO es un error: el backend respondió bien y no tiene proyectos
      // para esa zona; la pantalla lo dice distinto que un fallo de red.
      reco: {
        estado: 'idle', // idle | cargando | listo | vacio | error
        leadId: null,
        items: [],
        totalCatalogo: null,
        origenCatalogo: null,
        error: null,
        aproximado: false, // true = las tarjetas salen del motor local
      },

      // Paso 2 del contrato: la llamada de Manuela (ver js/llamada.js). Se
      // dispara al entrar a 'confirmacion', mismo patrón que 'reco' arriba.
      llamada: {
        estado: 'idle', // idle | cargando | lista | error
        mensaje: '',
      },

      // Paso 3: el resumen post-llamada (temperatura, resumen, recomendación
      // para el asesor). Solo arranca cuando 'llamada' resuelve con un envío
      // REAL — main.js hace polling corto contra /api/llamar/resultado hasta
      // que Dapta empuja el análisis, o hasta agotar los intentos.
      resumen: {
        estado: 'idle', // idle | esperando | listo | agotado
        datos: null,
      },

      // --- Desplegable de planos de cada tarjeta (ver detalleProyecto en
      // templates.js). Vive en el estado, y no solo en el DOM, porque marcar
      // un proyecto sí re-renderiza toda la lista: sin esto el desplegable se
      // cerraría y se perdería la tipología que el usuario estaba viendo.
      // Todos van indexados por NOMBRE de proyecto (no por posición, que
      // cambia si el clustering reordena la lista).
      detalleAbierto: {}, // nombre -> bool
      tipologiaActiva: {}, // nombre -> índice de la pestaña
      // nombre -> { inicial: %, plazo: años, modalidad: 'uvr'|'pesos',
      //             categoria: 'A'|'B'|'C', complementario: bool, ingreso: pesos }
      // Se conserva por proyecto para que volver a abrir el simulador de una
      // tarjeta que ya se tocó no pierda lo que el usuario había ajustado.
      simConfig: {},

      // Simulador de pagos: overlay de dos pasos (1 = elegir producto,
      // 2 = el simulador completo). Ver simuladorOverlay en templates.js.
      // Uno solo a la vez en toda la app —no hace falta un mapa por proyecto
      // como los de arriba— porque solo se puede simular un proyecto a la vez.
      simulador: null, // null | { proyecto: nombre, tipologia: idx, paso: 1|2 }

      // El apartamento REAL que arma el quiz: qué plano oficial se está
      // montando y la geometría de sus piezas. Arranca con elegirApartamento
      // (sorteo estable por nombre) y se REELIGE con cada respuesta vía
      // ajustarPlanta -> planta.mejorApartamento.
      //
      // Converge hacia lo CONTESTADO, no hacia el proyecto ganador: sigue
      // siendo un ejemplo para enseñar cómo se construye una vivienda, no la
      // recomendación —esa la calcula matching.js al final y suele ser otro
      // proyecto, porque solo 8 de los 31 tienen plano utilizable.
      //
      // No es un valor derivado a propósito: el parcheo de DOM de main.js
      // necesita comparar lo que hay pintado contra lo que toca ahora.
      planta: null, // null | ver elegirApartamento() en js/planta.js
    };
  }

  // Ya no hay preguntas condicionales: al ser la demo solo de Bogotá se quitó
  // la de municipio, y con ella el "pregunta la zona solo si eligió Bogotá".
  // La función se conserva porque el resto del flujo (avance, atrás, contador)
  // razona sobre esta lista.
  function qListFor() {
    return window.GDF.data.QUESTIONS;
  }

  function computeDerived(state) {
    var scene = window.GDF.scene;
    var qList = qListFor(state.answers);
    var q = qList[state.qi];

    var answeredQs = qList.filter(function (x) {
      return state.answers[x.id] !== undefined;
    });
    var answered = answeredQs.length;
    // Ya no es un número fijo con excepciones: todas las preguntas se hacen
    // siempre (tipo, ingresos, personas, habitaciones, zona/localidad,
    // piso_preferido, entorno_deseado, edad), así que el total es la lista
    // misma. Ese orden lo fija data.js y no es arbitrario: la última tiene que
    // ser la que menos mueva la recomendación, porque al contestarla se salta
    // a resultados.
    var stepTotal = qList.length;

    var nHab = state.answers.habitaciones === '3+' ? 3 : parseInt(state.answers.habitaciones || '2', 10);
    var nPers = state.answers.personas === '4+' ? 4 : parseInt(state.answers.personas || '0', 10);
    // El encaje con el catalogo, EN VIVO y de verdad: sale del mismo motor
    // que decide las recomendaciones (ver compatDe en matching.js). Antes
    // era `42 + (answered/stepTotal)*55`, o sea el progreso del quiz
    // disfrazado de match: subia igual contestaras lo que contestaras.
    var compat = window.GDF.matching.compatDe(state.answers);

    // El plano REAL que se está armando (ver js/planta.js); aquí solo se
    // decide cuántas de sus piezas se ven ya. La silueta y la losa existen
    // desde antes de la primera respuesta.
    var planta = state.planta;
    var showLote = !planta;
    var losaRevealed = !!planta;
    var visibles = scene.celdasVisibles(state.answers, qList, planta);
    var rooms = scene.buildRooms(planta, visibles);
    var huecos = scene.buildHuecos(planta);

    var a = state.answers;
    var perfilChips = [];
    if (a.tipo) perfilChips.push({ text: a.tipo, hi: true });
    if (a.ingresos) perfilChips.push({ text: a.ingresos, hi: false });
    if (a.habitaciones) perfilChips.push({ text: a.habitaciones + ' hab', hi: false });
    if (a.zona) perfilChips.push({ text: a.zona, hi: false });
    if (a.afiliado === 'Sí') perfilChips.push({ text: 'Afiliado ✓', hi: true });

    return {
      qList: qList,
      q: q,
      answered: answered,
      stepTotal: stepTotal,
      showLote: showLote,
      losaRevealed: losaRevealed,
      rooms: rooms,
      huecos: huecos,
      // El apartamento que se está armando: de aquí salen el rótulo y la
      // relación de aspecto de la losa.
      planta: planta,
      nHab: nHab,
      nPers: nPers,
      compat: compat,
      perfilChips: perfilChips,
    };
  }

  /**
   * Reelige el plano segun TODO lo contestado hasta ahora.
   *
   * Se llama en CADA respuesta, no solo en la de alcobas. `mejorApartamento`
   * (planta.js) devuelve null cuando el que ya esta puesto sigue siendo el
   * mejor, o cuando el candidato no gana por el margen minimo — asi el plano
   * no salta de un lado a otro entre preguntas contiguas.
   *
   * `ajustada` queda en true SIEMPRE que se conteste, cambie el plano o no, y
   * main.js lo lee para animar. Es a proposito: si la misma accion unas veces
   * mueve el plano y otras no hace nada, se lee como que la app se colgo. Lo
   * que la animacion comunica es "tu plano quedo ajustado a lo que pediste", y
   * eso es cierto en los dos casos.
   *
   * EL SUELO DE PIEZAS (`minimo`/`minimoDesde`) es lo que impide que el
   * apartamento ENCOJA al cambiar de plano. Cada plano trae su propio reparto
   * `vis[]`, monotono dentro de si mismo pero no entre planos distintos: pasar
   * de uno de 12 celdas a uno de 9 restaba piezas y el usuario veia MENOS
   * apartamento despues de contestar. Con el suelo, la bola reordena y nunca
   * resta. Se guarda desde que pregunta aplica para que `goBack` siga restando
   * como siempre.
   */
  function ajustarPlanta(state, respondidas, visiblesAntes) {
    var actual = state.planta;
    var nueva = window.GDF.planta.mejorApartamento(state);
    if (!nueva) {
      // El que esta puesto sigue siendo el mejor: no hay nada que cambiar,
      // pero la respuesta igual tiene que producir una reaccion.
      if (actual) actual.ajustada = true;
      return;
    }
    nueva.ajustada = true;
    if (actual) {
      nueva.minimo = visiblesAntes;
      nueva.minimoDesde = respondidas;
    }
    state.planta = nueva;
  }

  function applyAction(state, action, ds) {
    switch (action) {
      case 'goSplash':
        // El splash NO EXISTE en la version embebida: el modal entra directo a
        // la escarapela. Se bloquea aqui ademas de esconder el boton que lleva
        // a el (ver escarapela en templates.js), porque esta accion la puede
        // despachar cualquier otro camino y el fallo no se veria roto — se
        // veria como una pantalla de bienvenida que aparece a destiempo.
        if (window.GDF_EMBED) return false;
        state.screen = 'splash';
        break;

      case 'goEscarapela':
        state.screen = 'escarapela';
        break;

      case 'setAfiliado':
        state.afiliado = ds.value;
        break;

      case 'toggleConsent':
        state.consent = !state.consent;
        break;

      case 'startQuiz': {
        var isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.correo.trim());
        var canStart = !!(
          state.nombre.trim() &&
          state.apellido.trim() &&
          state.correo.trim() &&
          isValidEmail &&
          state.telefono.trim() &&
          state.consent
        );
        if (!canStart) return false;
        state.answers = { afiliado: state.afiliado };
        state.qi = 0;
        state.screen = 'quiz';
        // El apartamento se elige AQUÍ y ya no cambia. Sale del nombre y el
        // apellido que se acaban de escribir, así que la misma persona ve
        // siempre el mismo plano y dos personas seguidas en un stand ven
        // planos distintos.
        state.planta = window.GDF.planta.elegirApartamento(state);
        break;
      }

      case 'selectOption': {
        var qid = ds.qid;
        var value = ds.value;
        var nextAnswers = Object.assign({}, state.answers);
        nextAnswers[qid] = value;
        var list = qListFor(nextAnswers);
        var ni = state.qi + 1;
        state.answers = nextAnswers;
        if (ni >= list.length) {
          // Terminó el quiz -> pantalla de selección de proyectos, en estado
          // 'cargando'. Las recomendaciones ya NO se calculan aquí: las pide
          // main.js al backend (paso 1 del contrato). Ver js/recommender.js.
          state.screen = 'result';
          state.reco = {
            estado: 'cargando', leadId: null, items: [], totalCatalogo: null,
            origenCatalogo: null, error: null, aproximado: false,
          };
          state.chosen = null;
          // La calificación del lead SÍ se calcula ya: es lógica de negocio y
          // no debe depender de una llamada de red. Se apoya en el motor local
          // solo para saber qué tan bien calza el mejor proyecto disponible.
          var mejores = window.GDF.matching.computeMatches(nextAnswers, 1);
          state.lead = window.GDF.qualification.computeLeadQualification(
            nextAnswers,
            mejores[0] ? mejores[0].score : 0
          );
        } else {
          state.qi = ni;
        }
        // El plano se reajusta con CADA respuesta, no solo con la de alcobas:
        // es lo que hace que la escena reaccione a todo lo que se contesta.
        //
        // El cambio es barato de ver porque todas las plantas del sorteo son
        // rectangulares y se trocean igual (12 celdas, c0..c11): las piezas ya
        // puestas no mueren, se reacomodan y cambian de imagen.
        //
        // Se mide cuantas piezas habia ANTES de cambiar para pasarselas como
        // suelo al plano nuevo; si no, cambiar de plano podia restar piezas.
        ajustarPlanta(
          state,
          list.filter(function (x) { return nextAnswers[x.id] !== undefined; }).length,
          window.GDF.scene.celdasVisibles(state.answers, list, state.planta)
        );
        break;
      }

      // Resultado del paso 1 (POST /recomendaciones). Lo despacha main.js
      // cuando resuelve la promesa; `ds` ES el objeto que arma recommender.js.
      case 'recoResuelta':
        state.reco = {
          estado: ds.estado,
          leadId: ds.leadId || null,
          items: ds.items || [],
          totalCatalogo: ds.totalCatalogo || null,
          origenCatalogo: ds.origenCatalogo || null,
          error: ds.error || null,
          aproximado: !!ds.aproximado,
        };
        // Si la lista cambió, la selección anterior puede ya no existir.
        if (state.chosen && !state.reco.items.some(function (x) { return x.id === state.chosen; })) {
          state.chosen = null;
        }
        break;

      case 'recoCargando':
        state.reco.estado = 'cargando';
        state.reco.error = null;
        break;

      // Paso 2: resultado de POST /api/llamar (ver js/llamada.js). `ds` es
      // el objeto que arma llamada.js: { estado, mensaje }.
      case 'llamadaCargando':
        state.llamada = { estado: 'cargando', mensaje: '' };
        break;

      case 'llamadaResuelta':
        state.llamada = { estado: ds.estado, mensaje: ds.mensaje || '' };
        break;

      // Botón "Reintentar" de la pantalla de cierre tras un error. main.js
      // detecta esta acción y vuelve a llamar a llamada.disparar().
      case 'reintentarLlamada':
        state.llamada = { estado: 'cargando', mensaje: '' };
        state.resumen = { estado: 'idle', datos: null };
        break;

      // Paso 3: ciclo de polling de /api/llamar/resultado (ver js/llamada.js
      // y main.js). `ds` en 'resumenListo' es el cuerpo que devolvió el
      // backend cuando `listo: true`.
      case 'resumenEsperando':
        state.resumen = { estado: 'esperando', datos: null };
        break;

      case 'resumenListo':
        state.resumen = { estado: 'listo', datos: ds };
        break;

      case 'resumenAgotado':
        state.resumen = { estado: 'agotado', datos: null };
        break;

      // Botón "Buscar resumen" tras agotar los intentos automáticos. Vuelve
      // a 'esperando' para que main.js relance el ciclo de polling.
      case 'reintentarResumen':
        state.resumen = { estado: 'esperando', datos: null };
        break;

      case 'goBack': {
        // En la primera pregunta no hay a dónde retroceder dentro del quiz:
        // regresa a escarapela (el paso anterior en el flujo completo).
        if (state.qi === 0) {
          state.screen = 'escarapela';
          break;
        }
        var qList = qListFor(state.answers);
        var prev = qList[state.qi - 1];
        var nextAnswers2 = Object.assign({}, state.answers);
        delete nextAnswers2[prev.id];
        state.qi = state.qi - 1;
        state.answers = nextAnswers2;
        // El apartamento NO se pierde al retroceder, ni siquiera hasta la
        // primera pregunta: se queda sin piezas y en pantalla sigue la silueta.
        // Eso es lo que evita tener que reconstruir la escena por innerHTML.
        if (state.planta) state.planta.ajustada = false;
        break;
      }

      // Selección ÚNICA: el contrato manda un solo `proyecto_elegido`, así que
      // elegir otro reemplaza al anterior. Volver a tocar el ya elegido lo
      // desmarca, para poder deshacer sin reiniciar.
      case 'chooseProject':
        state.chosen = state.chosen === ds.value ? null : ds.value;
        break;

      // Las 3 acciones del desplegable de planos solo guardan la preferencia:
      // el repintado lo hace main.js por DOM directo (ver dispatch), porque
      // re-renderizar aquí cerraría el <details> y recargaría los planos.
      case 'setDetalleAbierto':
        state.detalleAbierto[ds.proyecto] = ds.valor === '1';
        break;

      case 'verTipologia':
        state.tipologiaActiva[ds.proyecto] = parseInt(ds.idx, 10) || 0;
        break;

      case 'simSet': {
        var cfg = state.simConfig[ds.proyecto] || {};
        // 'modalidad' y 'categoria' son strings; 'complementario' es un
        // interruptor; el resto (inicial, plazo, ingreso) son numéricos.
        if (ds.campo === 'modalidad' || ds.campo === 'categoria') {
          cfg[ds.campo] = ds.valor;
        } else if (ds.campo === 'complementario') {
          cfg.complementario = ds.valor === '1';
        } else {
          cfg[ds.campo] = parseInt(ds.valor, 10) || 0;
        }
        state.simConfig[ds.proyecto] = cfg;
        break;
      }

      // Acciones del overlay del simulador. Van por el dispatch/render normal,
      // a diferencia de 'simSet': abrir, avanzar de paso o cerrar son acciones
      // discretas, no inputs continuos, así que no hace falta el atajo de
      // parcheo de DOM — y un re-render completo es seguro acá porque ya
      // restaura detalleAbierto/tipologiaActiva/simConfig solo.
      case 'abrirSimulador': {
        var idx = parseInt(ds.tipologia, 10) || 0;
        state.simulador = { proyecto: ds.proyecto, tipologia: idx, paso: 1 };
        // Sembrar los valores por defecto que dependen de las respuestas del
        // quiz. Solo la primera vez: si el usuario ya movió los controles de
        // este proyecto, se respeta lo que dejó.
        if (!state.simConfig[ds.proyecto]) {
          var sim = window.GDF.simulador;
          var cat = sim.categoriaSugerida(state.answers.ingresos);
          state.simConfig[ds.proyecto] = {
            inicial: sim.SUPUESTOS.cuotaInicialDefault,
            plazo: sim.SUPUESTOS.plazoDefault,
            // Se arranca en UVR solo si la tasa de esa categoría está
            // publicada (A y B). Para la C, cuya tasa en UVR es todavía un
            // placeholder, se abre en pesos: es la que sí está verificada.
            modalidad: cat && !sim.tasaUvrPorConfirmar(cat) ? 'uvr' : 'pesos',
            categoria: cat || 'B',
            complementario: false,
            ingreso: Math.round(sim.ingresoMedioDe(state.answers.ingresos)),
          };
        }
        break;
      }

      case 'simPaso':
        if (!state.simulador) return false;
        state.simulador.paso = parseInt(ds.valor, 10) || 1;
        break;

      case 'cerrarSimulador':
        state.simulador = null;
        break;

      // Elegir producto en el paso 1 NO cierra el overlay: avanza al paso 2,
      // que es el simulador completo. El hipotecario es la base siempre; el
      // complementario se enciende sobre él (ver `simular` en simulador.js).
      case 'elegirProducto': {
        if (!state.simulador) return false;
        var cfgProd = state.simConfig[state.simulador.proyecto] || {};
        cfgProd.complementario = ds.valor === 'complementario';
        state.simConfig[state.simulador.proyecto] = cfgProd;
        state.simulador.paso = 2;
        break;
      }

      case 'goConfirmacion':
        // Sin nada marcado no tiene sentido cerrar: el botón está deshabilitado
        // en la UI, pero se valida igual acá por si acaso.
        if (!state.chosen) return false;
        state.screen = 'confirmacion';
        break;

      case 'goSeleccion':
        state.screen = 'result';
        break;

      case 'irAPagina': {
        // El destino llega como texto desde `data-pagina`. Se acota contra el
        // numero real de proyectos —no contra un 3 fijo— porque una tanda con
        // menos de 18 tiene menos paginas, y las flechas de los extremos van
        // deshabilitadas pero un teclado puede llegar igual.
        var porPag = window.GDF.recommender.POR_PAGINA || 6;
        var cuantas = Math.max(1, Math.ceil(((state.reco.items || []).length) / porPag));
        var destino = Number(ds && ds.pagina);
        if (isNaN(destino)) return false;
        destino = Math.min(Math.max(destino, 0), cuantas - 1);
        if (destino === state.recoPagina) return false;
        state.recoPagina = destino;
        break;
      }

      case 'restart': {
        var fresh = createInitial();
        Object.keys(fresh).forEach(function (k) {
          state[k] = fresh[k];
        });
        // "Empezar de nuevo" vuelve a la entrada. Cual es la entrada ya lo
        // decide `createInitial()` —splash suelta, escarapela embebida— asi
        // que aqui NO se fija a mano: escribir 'splash' devolvia al modal la
        // pantalla de bienvenida que precisamente se salta al abrirlo.
        state.screen = fresh.screen;
        break;
      }

      default:
        return false;
    }
    return true;
  }

  window.GDF = window.GDF || {};
  window.GDF.state = {
    createInitial: createInitial,
    computeDerived: computeDerived,
    applyAction: applyAction,
  };
})();
