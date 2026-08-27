// Simulador del plan de pagos de una vivienda. Reemplaza al "contacta a un
// asesor" de la ficha oficial: en vez de mandar al usuario a un formulario,
// le mostramos de una qué cuota mensual implicaría el proyecto que está
// mirando.
//
// ⚠️ ESTIMACIÓN, NO COTIZACIÓN. Todo lo que no viene del catálogo real está
// en TASAS/SUPUESTOS acá abajo, en un solo lugar, para que se pueda corregir
// sin tocar la fórmula. Cada constante dice si está VERIFICADA contra
// Colsubsidio o si es un placeholder POR CONFIRMAR; la UI repite esa
// distinción donde corresponde, en vez de esconderlo todo en la letra chica.
(function () {
  'use strict';

  // Tasas de los dos productos de vivienda de Colsubsidio.
  //
  // VERIFICADAS: las de crédito hipotecario en UVR de las categorías A y B, y
  // la de pesos. En UVR la tasa depende de la CATEGORÍA DE AFILIACIÓN; en
  // pesos Colsubsidio publica "desde ~10,7% E.A." sin abrir por categoría, así
  // que acá va una sola.
  //
  // POR CONFIRMAR: la del complementario y la de la categoría C en UVR (ver
  // CATEGORIAS). La del complementario no la publican; se deja un 16% E.A.
  // como placeholder porque un complementario se cotiza más caro que el
  // hipotecario (financia inicial/escrituración/acabados, no el inmueble), y
  // poner la misma tasa del hipotecario subestimaría la cuota. La UI las marca
  // explícitamente como sujetas a verificación — hay que confirmarlas con el
  // área hipotecaria antes de usar esto con clientes reales.
  var TASAS = {
    hipotecario: {
      uvr: { A: 0.0436, B: 0.0545, C: 0.065 },
      pesos: 0.107,
    },
    complementario: {
      pesos: 0.16,
      porConfirmar: true,
    },
  };

  // Categorías de afiliación a Colsubsidio, en el orden del control segmentado
  // del simulador. Son las que definen la tasa en UVR del hipotecario: el
  // corte va por ingreso del hogar en SMMLV.
  //
  // La C está marcada `porConfirmar` porque Colsubsidio solo publica las tasas
  // preferenciales de A y B. El 6,5% E.A. de arriba es un placeholder elegido
  // para quedar entre la de B (5,45%) y la de pesos (10,7%), que es la que hoy
  // aplicaría un hogar de más de 4 SMMLV. Por eso el simulador tampoco arranca
  // en UVR para un hogar categoría C: ver `tasaUvrPorConfirmar`.
  var CATEGORIAS = [
    { v: 'A', label: 'A', rango: 'hasta 2 SMMLV' },
    { v: 'B', label: 'B', rango: 'más de 2 y hasta 4 SMMLV' },
    { v: 'C', label: 'C', rango: 'más de 4 SMMLV', porConfirmar: true },
  ];

  // Los dos productos, en el orden en que se ofrecen en el paso 1 del
  // simulador (ver simuladorOverlay en js/templates.js).
  var PRODUCTOS = [
    {
      v: 'hipotecario',
      label: 'Crédito hipotecario Colsubsidio',
      corto: 'Hipotecario',
      blurb: 'Financia la compra del inmueble',
      // El tope legal de financiación es lo que obliga a que exista el
      // complementario: con una cuota inicial del 10% ningún hipotecario
      // cubre el resto.
      detalle: 'Hasta el 80% del valor en VIS y el 70% en No VIS',
    },
    {
      v: 'complementario',
      label: 'Crédito complementario',
      corto: 'Complementario',
      blurb: 'Cubre lo que falta de la cuota inicial',
      detalle: 'También sirve para escrituración y acabados',
    },
  ];

  var SUPUESTOS = {
    // Salario mínimo 2026. Las pistas de la pregunta de ingresos en
    // js/data.js se calculan con este mismo valor, así que moverlo obliga a
    // revisarlas ("hasta 2 SMMLV ≈ $3,5M").
    smmlv: 1750905,
    anioSmmlv: 2026,

    tasas: TASAS,
    productos: PRODUCTOS,
    categorias: CATEGORIAS,

    // Tope legal de financiación sobre el valor del inmueble (LTV). Es la
    // razón por la que una cuota inicial del 10% deja un faltante: el
    // hipotecario no puede cubrirlo, y ahí entra el complementario.
    maxLtv: { vis: 0.8, noVis: 0.7 },

    // Techo del valor de una vivienda VIS, en SMMLV. Son 135 en general y
    // 150 en aglomeración urbana; la demo es solo de Bogotá, que va por los
    // 150. Confirmar si algún día se vuelve a incluir el resto del país.
    topeVisSmmlv: 150,

    // Subsidio a la cuota inicial para vivienda VIS, escalonado por ingresos
    // del hogar y expresado en SMMLV. Va SIN nombre de programa a propósito:
    // el esquema está en transición, así que la UI lo llama "subsidio
    // estimado, sujeto a verificación" y no promete un programa puntual.
    subsidioSmmlv: { '≤2 SMMLV': 30, '2–4 SMMLV': 20 },

    // Cuota inicial mínima habitual y opciones que ofrece el simulador.
    cuotaInicialOpciones: [10, 20, 30],
    cuotaInicialDefault: 20,

    // El plazo es un slider continuo, no una lista de opciones.
    plazoMin: 5,
    plazoMax: 20,
    plazoDefault: 20,

    // Meses del plan de ahorro cuando el proyecto no publica fecha de entrega
    // usable (ver planAhorro).
    mesesAhorroDefault: 36,

    // Regla de oro de originación hipotecaria: la cuota no debería pasar de
    // ~30% del ingreso del hogar. Se usa solo para dar una señal de alerta.
    maxCuotaSobreIngreso: 0.3,
  };

  // Punto medio del rango declarado en el quiz, en pesos. Es el respaldo
  // cuando el usuario no ha digitado su ingreso en el simulador.
  // '8+ SMMLV' no tiene techo: se toma 8 como piso conservador.
  var INGRESO_MEDIO_SMMLV = { '≤2 SMMLV': 1.5, '2–4 SMMLV': 3, '4–8 SMMLV': 6, '8+ SMMLV': 8 };

  function ingresoMedioDe(rangoIngresos) {
    return (INGRESO_MEDIO_SMMLV[rangoIngresos] || 0) * SUPUESTOS.smmlv;
  }

  function subsidioDe(vis, rangoIngresos) {
    if (!vis) return 0;
    var enSmmlv = SUPUESTOS.subsidioSmmlv[rangoIngresos] || 0;
    return enSmmlv * SUPUESTOS.smmlv;
  }

  function categoriaDe(v) {
    for (var i = 0; i < CATEGORIAS.length; i++) {
      if (CATEGORIAS[i].v === v) return CATEGORIAS[i];
    }
    return null;
  }

  // Cualquier valor que no sea una categoría conocida cae en B, que es el
  // término medio: ni la tasa más baja (regalarla sería mentir a favor) ni una
  // que esté por confirmar.
  function normalizarCategoria(v) {
    return categoriaDe(v) ? v : 'B';
  }

  // Categoría de afiliación sugerida a partir del rango de ingresos del quiz.
  // Devuelve null solo si el rango no es uno de los del quiz — un hogar sin
  // respuesta de ingresos no tiene categoría que sugerir.
  function categoriaSugerida(rangoIngresos) {
    if (rangoIngresos === '≤2 SMMLV') return 'A';
    if (rangoIngresos === '2–4 SMMLV') return 'B';
    if (rangoIngresos === '4–8 SMMLV' || rangoIngresos === '8+ SMMLV') return 'C';
    return null;
  }

  // ¿La tasa en UVR de esta categoría es todavía un placeholder? Solo la de C.
  // Se usa para dos cosas: marcarla en la UI donde se muestra el número, y no
  // arrancar el simulador en UVR para un hogar categoría C — ese hogar ve
  // primero la tasa en pesos, que sí está publicada, y cambia a UVR si quiere.
  function tasaUvrPorConfirmar(categoria) {
    var c = categoriaDe(categoria);
    return !!(c && c.porConfirmar);
  }

  // Tasa E.A. del producto/modalidad/categoría elegidos. En UVR la tasa es
  // REAL (por encima de la inflación): la cuota que sale de acá es la del
  // primer mes en pesos de hoy, y en la vida real sube con el IPC. La UI lo
  // dice; ver simuladorOverlay en js/templates.js.
  function tasaEaDe(producto, modalidad, categoria) {
    if (producto === 'complementario') return TASAS.complementario.pesos;
    if (modalidad === 'uvr') {
      return TASAS.hipotecario.uvr[categoria] || TASAS.hipotecario.uvr.B;
    }
    return TASAS.hipotecario.pesos;
  }

  // Amortización francesa (cuota fija). La tasa del crédito se cotiza
  // efectiva anual, así que hay que convertirla a efectiva mensual —
  // dividir entre 12 daría una cuota más baja de la real.
  function cuotaMensual(monto, tasaEa, anios) {
    if (monto <= 0) return 0;
    var i = Math.pow(1 + tasaEa, 1 / 12) - 1;
    var n = anios * 12;
    return (monto * i) / (1 - Math.pow(1 + i, -n));
  }

  /**
   * @param {object} opciones
   *   precio          {number}  valor de la vivienda en PESOS
   *   vis             {boolean} define tope de financiación y subsidio
   *   rangoIngresos   {string}  respuesta del quiz ('2–4 SMMLV'...)
   *   porcentajeInicial {number} % de cuota inicial (10/20/30)
   *   plazoAnios      {number}  5 a 20
   *   modalidad       {string}  'uvr' | 'pesos'
   *   categoria       {string}  'A' | 'B' | 'C' (solo aplica en UVR)
   *   complementario  {boolean} financiar el faltante de la inicial
   *   ingresoMensual  {number}  ingreso digitado; sin él se usa el rango
   */
  function simular(opciones) {
    var precio = opciones.precio || 0;
    var pctInicial = opciones.porcentajeInicial || SUPUESTOS.cuotaInicialDefault;
    var plazo = opciones.plazoAnios || SUPUESTOS.plazoDefault;
    var vis = !!opciones.vis;
    var modalidad = opciones.modalidad === 'pesos' ? 'pesos' : 'uvr';
    var categoria = normalizarCategoria(opciones.categoria);

    var cuotaInicial = precio * (pctInicial / 100);
    var subsidio = subsidioDe(vis, opciones.rangoIngresos);
    // El subsidio se abona a la cuota inicial: baja lo que hay que ahorrar,
    // no lo que se financia. Si supera la inicial, el excedente sí reduce el
    // crédito (por eso el Math.max de abajo no deja el ahorro en negativo).
    var ahorroNecesario = Math.max(0, cuotaInicial - subsidio);
    var excedenteSubsidio = Math.max(0, subsidio - cuotaInicial);
    var aFinanciar = Math.max(0, precio - cuotaInicial - excedenteSubsidio);

    // El hipotecario no puede pasar del tope legal sobre el VALOR (no sobre
    // lo que falta por pagar). Lo que quede por encima es el faltante que
    // cubre el complementario — con una inicial del 10% en No VIS son 20
    // puntos del valor del inmueble.
    var maxLtv = vis ? SUPUESTOS.maxLtv.vis : SUPUESTOS.maxLtv.noVis;
    var topeHipotecario = precio * maxLtv;
    var montoHipotecario = Math.min(aFinanciar, topeHipotecario);
    var faltante = Math.max(0, aFinanciar - montoHipotecario);
    var usaComplementario = !!opciones.complementario && faltante > 0;
    var montoComplementario = usaComplementario ? faltante : 0;

    var tasaEa = tasaEaDe('hipotecario', modalidad, categoria);
    var tasaEaComplementario = TASAS.complementario.pesos;
    var cuotaHipotecario = cuotaMensual(montoHipotecario, tasaEa, plazo);
    // El complementario es un crédito más corto que el hipotecario: se
    // amortiza en la mitad del plazo, con piso de 5 años (el mínimo que
    // ofrece el simulador).
    var plazoComplementario = Math.max(SUPUESTOS.plazoMin, Math.round(plazo / 2));
    var cuotaComplementario = cuotaMensual(montoComplementario, tasaEaComplementario, plazoComplementario);
    var cuotaTotal = cuotaHipotecario + cuotaComplementario;

    // Si NO se activa el complementario, el faltante hay que ponerlo de
    // bolsillo: se suma a lo que toca ahorrar. Es la contracara honesta de
    // apagar el producto, en vez de dejar el número como si nada faltara.
    var ahorroTotal = ahorroNecesario + (usaComplementario ? 0 : faltante);

    var ingreso = opciones.ingresoMensual || ingresoMedioDe(opciones.rangoIngresos);
    var pctIngreso = ingreso ? cuotaTotal / ingreso : null;

    return {
      precio: precio,
      cuotaInicial: cuotaInicial,
      subsidio: subsidio,
      ahorroNecesario: ahorroTotal,
      montoCredito: montoHipotecario + montoComplementario,
      montoHipotecario: montoHipotecario,
      montoComplementario: montoComplementario,
      faltante: faltante,
      usaComplementario: usaComplementario,
      cuotaHipotecario: cuotaHipotecario,
      cuotaComplementario: cuotaComplementario,
      cuotaMensual: cuotaTotal,
      tasaEa: tasaEa,
      tasaEaComplementario: tasaEaComplementario,
      // La tasa del hipotecario solo está por confirmar en UVR categoría C:
      // en pesos es la publicada, sin importar la categoría.
      tasaEaPorConfirmar: modalidad === 'uvr' && tasaUvrPorConfirmar(categoria),
      modalidad: modalidad,
      categoria: categoria,
      maxLtv: maxLtv,
      plazoAnios: plazo,
      plazoComplementario: plazoComplementario,
      porcentajeInicial: pctInicial,
      ingresoUsado: ingreso,
      totalPagado: cuotaHipotecario * plazo * 12 + cuotaComplementario * plazoComplementario * 12 + cuotaInicial,
      // null cuando no sabemos el ingreso: no es lo mismo que "sí cabe".
      porcentajeDelIngreso: pctIngreso,
      holgado: pctIngreso === null ? null : pctIngreso <= SUPUESTOS.maxCuotaSobreIngreso,
    };
  }

  // ---------------------------------------------------------------------
  // Plan de ahorro: convierte "reúne $12.495.000" en "~$347.000/mes durante
  // 36 meses". El horizonte sale de la fecha de entrega REAL de la tipología
  // — el dinero no se necesita hoy sino cuando entregan.
  // ---------------------------------------------------------------------

  // El catálogo publica la entrega en texto libre y en cuatro formatos
  // distintos: '2028', 'Semestre 1 de 2028', 'Segundo semestre 2027' y
  // 'Final de 2029'. Se saca el año por regex y el mes del semestre que
  // nombre el texto; un año pelado se toma a mitad de año, que es el punto
  // medio honesto entre los dos semestres.
  function mesesHastaEntrega(entrega, hoy) {
    if (!entrega) return null;
    var anio = String(entrega).match(/20\d\d/);
    if (!anio) return null;
    var texto = String(entrega).toLowerCase();
    var mes = 5; // junio (los meses de Date van de 0 a 11)
    if (texto.indexOf('segundo') > -1 || texto.indexOf('final') > -1) mes = 11;
    else if (texto.indexOf('semestre 1') > -1 || texto.indexOf('primer') > -1) mes = 5;

    var ahora = hoy || new Date();
    var meses = (parseInt(anio[0], 10) - ahora.getFullYear()) * 12 + (mes - ahora.getMonth());
    return meses > 0 ? meses : null;
  }

  function planAhorro(ahorroNecesario, entrega, hoy) {
    var meses = mesesHastaEntrega(entrega, hoy);
    var desdeEntrega = meses !== null;
    if (!desdeEntrega) meses = SUPUESTOS.mesesAhorroDefault;
    return {
      mensual: ahorroNecesario > 0 ? ahorroNecesario / meses : 0,
      meses: meses,
      // La UI solo puede decir "hasta la entrega" cuando el plazo salió de
      // verdad de la ficha; con el respaldo de 36 meses sería inventarlo.
      desdeEntrega: desdeEntrega,
      anioEntrega: desdeEntrega ? String(entrega).match(/20\d\d/)[0] : null,
    };
  }

  // ¿Este proyecto puede recibir el subsidio a la cuota inicial? Dos
  // condiciones del INMUEBLE: estar marcado VIS y no pasarse del techo de
  // valor. El `vis` del catálogo no basta — hay proyectos marcados VIS cuyas
  // tipologías más grandes se salen del tope.
  function aptoParaSubsidio(vis, precio) {
    if (!vis || !precio) return false;
    return precio <= SUPUESTOS.topeVisSmmlv * SUPUESTOS.smmlv;
  }

  // Monto estimado del subsidio para un hogar, en pesos; 0 si sus ingresos
  // se pasan del tope (el escalón solo llega hasta 4 SMMLV).
  function subsidioEstimado(rangoIngresos) {
    return (SUPUESTOS.subsidioSmmlv[rangoIngresos] || 0) * SUPUESTOS.smmlv;
  }

  // "$1.234.567" — formato colombiano, sin decimales (a esta escala sobran).
  function pesos(v) {
    if (v == null || isNaN(v)) return '—';
    return '$' + Math.round(v).toLocaleString('es-CO');
  }

  // "$240,8M" para los titulares, donde el peso exacto estorba.
  function millones(v) {
    if (!v) return '—';
    return '$' + (v / 1e6).toFixed(1).replace('.', ',') + 'M';
  }

  // "4,36" — las tasas se escriben con coma decimal, como el resto de cifras.
  function porcentaje(v, decimales) {
    return (v * 100).toFixed(decimales == null ? 2 : decimales).replace('.', ',');
  }

  window.GDF = window.GDF || {};
  window.GDF.simulador = {
    simular: simular,
    cuotaMensual: cuotaMensual,
    tasaEaDe: tasaEaDe,
    categoriaSugerida: categoriaSugerida,
    normalizarCategoria: normalizarCategoria,
    tasaUvrPorConfirmar: tasaUvrPorConfirmar,
    ingresoMedioDe: ingresoMedioDe,
    mesesHastaEntrega: mesesHastaEntrega,
    planAhorro: planAhorro,
    aptoParaSubsidio: aptoParaSubsidio,
    subsidioEstimado: subsidioEstimado,
    pesos: pesos,
    millones: millones,
    porcentaje: porcentaje,
    SUPUESTOS: SUPUESTOS,
  };
})();
