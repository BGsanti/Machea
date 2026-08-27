// Capa adaptadora de recomendación: normaliza lo que sea que llegue —el top 6
// del modelo o el motor de reglas local— a UN solo shape que templates.js sabe
// pintar. Así la pantalla de selección no tiene ifs por origen de datos.
//
//   machea -> POST /recomendar (js/machea.js). Es la fuente real.
//   local  -> js/matching.js. Se usa como respaldo cuando el modelo falla, y
//             siempre marcado como aproximado para no engañar a nadie.
//
// LAS FOTOS (la parte que costó)
// ------------------------------
// El contrato del modelo deja las imágenes FUERA de la respuesta: dice que
// viven en `imagenes_proyectos/<id_proyecto>/`, numeradas 01, 02… y sin decir
// la extensión. Quien las resuelve es integracion/servicio_machea.py, que lista
// la carpeta del id y devuelve un `imagenes: [url, …]` por proyecto.
//
// Eso no es un adorno: el cruce por nombre contra el catálogo del tenant
// (`vm.local`) casi nunca acierta, porque el modelo recomienda sobre las cuatro
// constructoras a la vez y el tenant es una sola. Sin `imagenes`, las seis
// tarjetas saldrían sin foto.
//
// `vm.local` se deja en null cuando no cruza, a propósito: es lo que hace que
// el panel #debug siga diciendo la verdad sobre de dónde salió cada cosa.
(function () {
  'use strict';

  // CUANTOS PROYECTOS SE RECOMIENDAN, en total. Eran 6 y ahora son 18, que la
  // pantalla reparte en TRES PAGINAS de seis (ver `recoLista` en templates.js).
  //
  // Seis era poco para un catalogo de 96: quien no encontraba el suyo entre los
  // seis primeros se quedaba sin nada que mirar. Dieciocho sigue siendo una
  // seleccion —no es "el catalogo entero paginado"— y la reparte de seis en
  // seis para que cada pagina se lea igual de bien que antes.
  //
  // El numero manda sobre el motor local; por el camino del backend se usa lo
  // que responda el modelo, que ya devuelve 18.
  var TOTAL_RECOMENDADOS = 18;
  // Cuantas caben en cada pagina de la pantalla de seleccion.
  var POR_PAGINA = 6;

  // Marcas diacriticas de Unicode. Se construye con new RegExp para que el
  // archivo no lleve caracteres combinantes sueltos, que son invisibles en
  // el editor y se pierden con cualquier copiar/pegar.
  var RE_DIACRITICOS = new RegExp('[\u0300-\u036f]', 'g');

  function normalizar(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(RE_DIACRITICOS, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function catalogoLocal() {
    var mapa = {};
    (window.GDF.data.PROJECTS || []).forEach(function (p) {
      mapa[normalizar(p.name)] = p;
    });
    return mapa;
  }

  // --- El view-model único -------------------------------------------------
  // Todo lo que pinta projectCard() sale de acá. `local` es la referencia al
  // proyecto del catálogo scrapeado (o null), y es lo que habilita el
  // desplegable de planos.
  // Las fotos llegan como rutas RELATIVAS ("/imagenes_proyectos/12/01.jpg"),
  // porque el servicio no sabe con qué URL pública lo están llamando. Aquí se
  // resuelven contra MACHEA_BASE: sin esto el navegador las pide al servidor
  // del front, que no las tiene, y las seis tarjetas salen sin foto — sin
  // ningún error, solo un degradado donde debería haber un edificio.
  function urlDeFoto(ruta) {
    var r = String(ruta || '');
    if (!r || /^https?:/i.test(r) || r.indexOf('data:') === 0) return r;
    var base = (window.GDF_CONFIG || {}).MACHEA_BASE || '';
    return base.replace(/\/$/, '') + (r.charAt(0) === '/' ? r : '/' + r);
  }

  /**
   * El icono que el catálogo del tenant tiene para esa zona común, o ''.
   *
   * Se busca por ETIQUETA sin tildes ni mayúsculas, igual que hace machea.js
   * para cruzar el vocabulario: el modelo devuelve "Zona kids" y el catálogo
   * puede tener "Zona Kids", y una mayúscula no puede costar el icono.
   */
  function iconoLocal(local, label) {
    var lista = (local && local.amenidades) || [];
    var buscada = normalizar(label);
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].icon && normalizar(lista[i].label) === buscada) return lista[i].icon;
    }
    return '';
  }

  function desdeMachea(item, porNombre) {
    var local = porNombre[normalizar(item.nombre_proyecto)] || null;
    var enComun = item.zonas_en_comun || [];
    return {
      // Como CADENA a propósito. El id viaja al DOM en un `data-value`, y de
      // ahí vuelve siempre como string: comparar el 12 numérico contra el "12"
      // del dataset con === falla en silencio, y la pantalla de cierre acababa
      // diciendo "Elegiste 12" en vez del nombre del proyecto.
      id: String(item.id_proyecto),
      nombre: item.nombre_proyecto,
      // LA LOCALIDAD VA DELANTE, y no es cosmético: es lo que el usuario acaba
      // de elegir y lo único que le deja reconocer si el proyecto le queda
      // donde pidió. La dirección sola ("Cra 57A # 185-01, Tramonte") no se lo
      // dice: Tramonte es un sector, no una de las 20 localidades.
      ubicacion: [item.localidad, item.direccion].filter(Boolean).join(' · '),
      // Aparte y sin mezclar, porque la razón de la tarjeta la compara contra
      // la localidad elegida. Antes se sacaba partiendo `ubicacion` por la
      // primera coma, y con una dirección delante leía "Cra 57A # 185-01" como
      // si fuera una localidad: la tarjeta decía "queda en Cra 57A # 185-01
      // (lejos de Suba)" de un proyecto que está EN Suba.
      localidad: item.localidad || '',
      precioCop: item.precio_desde_cop || 0,
      area: item.area_construida_m2 || null,
      habitaciones: item.habitaciones ? [item.habitaciones] : [],
      vis: item.tipo_vivienda === 'VIS',
      subsidio: !!item.aplica_subsidio_caja,
      // El modelo manda las etiquetas bien escritas ('Gimnasio'); la tarjeta
      // resalta comparando contra `answers.entorno_deseado`, que guarda los
      // slugs ('gymnasio'). `claveDe` hace esa vuelta — sin ella
      // `zonas_en_comun` llegaría correcta y no se resaltaría ni una.
      // EL ICONO SALE DEL CATÁLOGO LOCAL, no de la respuesta del modelo: el
      // contrato manda `zonas_comunes` como texto y no tiene campo de icono.
      // El del tenant sí lo trae cuando esa constructora los publica —los baja
      // `plataforma/tools/scrape_iconos.py`—, así que se cruza por etiqueta.
      //
      // Sin este cruce el catálogo tenía los iconos y la tarjeta no los
      // pintaba: 49 zonas comunes en pantalla, las 49 con el dibujado.
      amenidades: (item.zonas_comunes || []).map(function (label) {
        var pedida = enComun.indexOf(label) > -1;
        return {
          label: label,
          icon: iconoLocal(local, label),
          clave: pedida ? window.GDF.machea.claveDe(label) : null,
        };
      }),
      score: typeof item.compatibilidad === 'number' ? item.compatibilidad : null,
      origen: 'machea',
      local: local,
      factores: null, // el modelo no desglosa su score; el motor local sí

      // --- lo que solo trae el modelo ---
      // Las fotos, resueltas por id_proyecto (ver la cabecera del módulo).
      imagenes: (item.imagenes || []).map(urlDeFoto),
      fichaUrl: item.url_ficha || '',
      // `fichas_alternas` NO se recoge, aunque el contrato lo mande. Seis
      // proyectos los publican Bolívar y Colsubsidio a la vez, y la tarjeta
      // avisaba "También lo publica otra constructora, con otro precio": eso
      // nombra a otra marca DENTRO de la demo de la primera, que es justo lo
      // que esta pantalla no puede hacer. El dato sigue en el catálogo
      // (`fusionados`) para quien lo necesite.
      //
      // De quién es el proyecto. Con el filtro puesto es siempre la del
      // tenant, pero se sigue leyendo del item —y no de la marca— porque es lo
      // que permite DETECTARLO si algún día no lo fuera.
      constructoras: item.constructoras || (item.constructora ? [item.constructora] : []),
      // Campos que la constructora NO publica. Se pintan "no informado" y
      // nunca un 0: no es lo mismo no saberlo que valer cero.
      noPublicados: item.datos_no_publicados || [],
      // Si es false, el proyecto entró relajando el requisito de habitaciones.
      cumpleHabitaciones: item.cumple_habitaciones !== false,
      cuotaMensual: item.cuota_mensual_estimada_cop || 0,
      ingresoRequerido: item.ingreso_requerido_smmlv || 0,
      razon: null, // lo redacta presentar(), ver más abajo
    };
  }

  // El motor local produce EXACTAMENTE el mismo shape, para poder mezclarse
  // con lo anterior sin que la vista note la diferencia.
  function desdeLocal(p) {
    return {
      // El backend identifica por id_proyecto; el motor local no tiene ids, así
      // que usa el nombre. Es la clave de selección y lo que viajaría en
      // `proyecto_elegido` — ver la nota en state.js sobre por qué eso solo se
      // envía cuando la recomendación vino del backend.
      id: p.name,
      nombre: p.name,
      // La LOCALIDAD, no la zona cardinal del CMS ("Occidente", "Norte"): es
      // lo que el usuario acaba de elegir en el quiz, así que es lo único que
      // le permite reconocer si el proyecto le queda donde pidió.
      ubicacion: p.localidad ? p.localidad + ', Bogotá' : p.muni,
      localidad: p.localidad || '',
      // `price` del catalogo YA viene en pesos (262635750), no en millones.
      // Multiplicarlo daba 2,6e14 y la tarjeta escribia "Desde $262635750,0M".
      precioCop: p.price || 0,
      area: p.area || null,
      habitaciones: p.hab ? [p.hab] : [],
      vis: !!p.vis,
      subsidio: !!p.vis,
      // Zonas comunes reales de la ficha: { label, icon, clave }. `clave` es
      // la del vocabulario de 26 del contrato y es lo que permite resaltar las
      // que el usuario pidió en la pregunta de entorno.
      amenidades: p.amenidades || [],
      score: p.score != null ? p.score : null,
      origen: 'local',
      local: p,
      factores: p.factores || null,
      razon: null, // lo redacta presentar(), ver más abajo
    };
  }

  // --- Podio fijo ----------------------------------------------------------
  // El ORDEN lo decide el motor (o el backend); lo que se fija es el número
  // que se muestra. Los tres primeros siempre se presentan como 96 / 94 / 89 %
  // para que el podio se lea igual en cualquier demo, sin depender de si el
  // usuario eligió una localidad con mucha o poca oferta —con la fórmula cruda,
  // pedir Usaquén (1 proyecto) sacaba un "top 1" del 62 % y parecía roto.
  // El puntaje calculado se conserva en `scoreReal` para el panel #debug.
  var PODIO = [96, 94, 89];

  function aplicarPodio(items) {
    var previo = null;
    items.forEach(function (vm, i) {
      if (vm.scoreReal === undefined) vm.scoreReal = vm.score;
      var valor;
      if (i < PODIO.length) {
        valor = PODIO[i];
      } else {
        // Fuera del podio se respeta el puntaje real, pero nunca puede
        // alcanzar al de arriba: si lo hiciera, la lista se leería al revés.
        // El escalón de -2 también evita el caso de una localidad con poca
        // oferta, donde la fórmula deja a todos en el piso y se veían tres
        // tarjetas seguidas con el mismo 51 %.
        var calculado = vm.scoreReal != null ? vm.scoreReal : previo - 2;
        valor = Math.max(40, Math.min(calculado, previo - 2));
      }
      vm.score = valor;
      previo = valor;
    });
    return items;
  }

  // --- Por qué quedó en esa posición ---------------------------------------
  // Una frase en español por tarjeta, armada con los mismos criterios que usa
  // el scoring (localidad, habitaciones, precio contra el rango de ingresos,
  // VIS/subsidio y las zonas comunes que el usuario marcó). Se redacta desde el
  // view-model, así que sirve igual venga del motor local o del backend.
  //
  // Las frases van SIN comas internas a propósito: se unen en una lista
  // ("a, b y c") y una coma suelta adentro haría ilegible el resultado.
  function listaNatural(arr) {
    if (!arr.length) return '';
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];
  }

  // Las etiquetas reales de la ficha a veces son una frase entera ("Zona
  // fitness con salón de spinning y salón TRX"). Para la razón se usa solo la
  // cabeza; el nombre completo ya aparece en el bloque de zonas comunes.
  function nombreCorto(label) {
    var s = String(label || '').split(/\s+con\s+|\s+-\s+|,/)[0].trim();
    // Solo se baja la inicial: pasarlo entero a minúsculas rompía las siglas
    // ("Salón TRX" -> "salón trx", que parece una errata).
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : '';
  }

  function frasesDeMatch(vm, a) {
    var VECINAS = window.GDF.data.VECINAS || {};
    var mat = window.GDF.matching;
    var buenas = [];
    var malas = [];

    // 1. Localidad. Sale de `vm.localidad`, que el modelo manda aparte.
    var localidad = String(vm.localidad || vm.ubicacion || '').split(/[,·]/)[0].trim();
    if (localidad && a.zona) {
      if (localidad === a.zona) buenas.push('está en ' + localidad + ' (la localidad que elegiste)');
      else if ((VECINAS[a.zona] || []).indexOf(localidad) > -1) buenas.push('queda en ' + localidad + ' (vecina de ' + a.zona + ')');
      else malas.push('queda en ' + localidad + ' (lejos de ' + a.zona + ')');
    }

    // 2. Habitaciones.
    var pedidas = mat.habitacionesPedidas(a);
    var ofrece = (vm.habitaciones || []).reduce(function (max, h) {
      return Math.max(max, Number(h) || 0);
    }, 0);
    function hab(n) {
      return n + (n === 1 ? ' habitación' : ' habitaciones');
    }
    if (ofrece) {
      if ((vm.habitaciones || []).map(Number).indexOf(pedidas) > -1) buenas.push('tiene ' + (pedidas === 1 ? 'la habitación' : 'las ' + pedidas + ' habitaciones') + ' que buscas');
      else if (ofrece > pedidas) buenas.push('ofrece ' + hab(ofrece) + ' (pediste ' + pedidas + ')');
      else malas.push('llega a ' + hab(ofrece) + ' para las ' + pedidas + ' que pediste');
    }

    // 3. Precio contra el techo del rango de ingresos.
    var millones = Math.round((vm.precioCop || 0) / 1e6);
    if (millones) {
      if (millones <= mat.bandaDe(a)) buenas.push('desde $' + millones + ' millones entra en tu presupuesto');
      else malas.push('desde $' + millones + ' millones se pasa de tu presupuesto');
    }

    // 4. Zonas comunes que el usuario marcó en la pregunta de entorno. Se
    // nombran máximo dos: la tarjeta ya las resalta todas con un ✓ más abajo.
    var quiere = a.entorno_deseado || [];
    var coinciden = [];
    (vm.amenidades || []).forEach(function (am) {
      var corto = nombreCorto(am.label);
      if (am.clave && quiere.indexOf(am.clave) > -1 && corto && coinciden.indexOf(corto) === -1) coinciden.push(corto);
    });
    var idxEntorno = -1;
    if (coinciden.length) {
      idxEntorno = buenas.push('trae ' + listaNatural(coinciden.slice(0, 2)) + ' (lo que marcaste del entorno)') - 1;
    }

    // 5. VIS / subsidio. Va de última a propósito: es la única frase sin "y"
    // interna, y `listaNatural` une el último elemento justamente con " y ".
    var quiereVis = a.tipo === 'VIS';
    if (vm.vis === quiereVis) {
      if (vm.vis && a.afiliado === 'Sí') buenas.push('es VIS con subsidio por tu afiliación a Colsubsidio');
      else buenas.push('es ' + (vm.vis ? 'VIS' : 'No VIS') + ' como pediste');
    } else {
      malas.push('es ' + (vm.vis ? 'VIS' : 'No VIS') + ' cuando buscabas ' + (quiereVis ? 'VIS' : 'No VIS'));
    }

    // Si la frase del entorno quedó de última (porque la de VIS se fue a las
    // "malas"), se deja una sola zona: dos encadenarían "… y piscina y sauna".
    if (idxEntorno > -1 && idxEntorno === buenas.length - 1 && coinciden.length > 1) {
      buenas[idxEntorno] = 'trae ' + coinciden[0] + ' (lo que marcaste del entorno)';
    }

    return { buenas: buenas, malas: malas };
  }

  function razonDeMatch(vm, a, pos) {
    var f = frasesDeMatch(vm, a);
    var encabezado = ['Es tu mejor match', 'Segunda mejor opción', 'Tercera mejor opción'][pos] || 'También encaja contigo';
    var texto = f.buenas.length ? encabezado + ': ' + listaNatural(f.buenas) + '.' : encabezado + '.';
    if (f.malas.length) texto += ' Eso sí, ' + listaNatural(f.malas) + '.';
    return texto;
  }

  function explicar(items, answers) {
    items.forEach(function (vm, i) {
      vm.razon = razonDeMatch(vm, answers || {}, i);
    });
    return items;
  }

  /**
   * Lo que toda salida tiene que pasar antes de llegar a la pantalla.
   *
   * EL PODIO SOLO SE APLICA AL MOTOR LOCAL, y esto importa. El 96/94/89 fijo se
   * inventó porque la fórmula cruda de matching.js saca un "top 1" del 51 %
   * cuando el usuario elige una localidad con poca oferta, y tres tarjetas
   * seguidas con el mismo número parecen rotas.
   *
   * El modelo no tiene ese problema: devuelve `compatibilidad` recorriendo de
   * 62 % a 98 % y con `compatibilidad_texto` listo para pintar. Pisar un 86 %
   * calculado con un 96 fijo sería un retroceso — estaríamos tapando el trabajo
   * del modelo con un número decorativo.
   */
  function presentar(items, answers, conPodio) {
    return explicar(conPodio ? aplicarPodio(items) : items, answers);
  }

  function recomendarLocal(answers, cb, extra) {
    var matches = window.GDF.matching.computeMatches(answers, TOTAL_RECOMENDADOS);
    var salida = {
      estado: matches.length ? 'listo' : 'vacio',
      aproximado: true,
      leadId: null,
      items: presentar(matches.map(desdeLocal), answers, true),
      totalCatalogo: (window.GDF.data.PROJECTS || []).length,
      origenCatalogo: 'catálogo de ' + ((window.GDF_MARCA && window.GDF_MARCA.identidad &&
        window.GDF_MARCA.identidad.dominio) || 'la constructora'),
      error: null,
    };
    Object.keys(extra || {}).forEach(function (k) {
      salida[k] = extra[k];
    });
    cb(salida);
  }

  /**
   * LA RED DE SEGURIDAD, y es la que de verdad importa.
   *
   * La demo se vende como "esta es TU app con TU catálogo". El contrato del
   * modelo no tiene forma de pedir una sola constructora —puntúa sobre los 96
   * proyectos de Bogotá—, así que la marca se pide por la URL
   * (`?constructora=`) y el motor local la respeta. Pero eso es una extensión
   * NUESTRA: el modelo real la ignora, y una demo de Amarilo con una tarjeta
   * de Cusezar dentro es el peor fallo que puede tener esta pantalla.
   *
   * Por eso se filtra otra vez aquí, con lo que sea que haya contestado el
   * backend. Es lo que hace estructuralmente imposible pintar la tarjeta de
   * otra marca: para que ocurra tendrían que fallar el motor Y esto.
   *
   * Si el backend ya filtró (`constructoraFiltrada`), esto no descarta nada y
   * no dice nada. Si descarta algo, se avisa por consola: significa que el
   * filtro de arriba no funcionó y hay que mirarlo.
   */
  function soloDelTenant(vms, yaFiltrado) {
    var mia = window.GDF.machea.constructoraDelTenant();
    if (!mia) return vms;
    var fuera = [];
    var dentro = vms.filter(function (vm) {
      var suyas = vm.constructoras || [];
      // Sin constructora no se descarta: no saber de quién es no es lo mismo
      // que saber que es de otro, y quedarse sin tarjetas por un campo que
      // faltaba sería peor que el problema que esto evita.
      if (!suyas.length) return true;
      if (suyas.indexOf(mia) > -1) return true;
      fuera.push(vm.nombre + ' (' + suyas.join(', ') + ')');
      return false;
    });
    if (fuera.length) {
      console.warn(
        '[GDF/recommender] El backend devolvió ' + fuera.length + ' proyecto(s) que NO son de ' +
        mia + ' y se descartaron aquí' +
        (yaFiltrado ? '' : ' (no filtró: no respondió constructora_filtrada)') + ':',
        fuera);
    }
    return dentro;
  }

  // Llamada real al modelo. `cb` recibe el mismo objeto que pinta la pantalla:
  // { estado, aproximado, leadId, items, totalCatalogo, origenCatalogo, error }.
  //
  // `leadId` se queda en null: el modelo no registra leads. El campo sigue en
  // el objeto porque la pantalla de cierre lo lee, y ahí distingue el cierre
  // "quedó registrado" del "no había dónde registrarlo".
  function recomendarMachea(state, cb) {
    var porNombre = catalogoLocal();
    window.GDF.machea.pedirRecomendaciones(state, function (r) {
      if (r.estado === 'error') {
        cb({
          estado: 'error', aproximado: false, leadId: null, items: [],
          totalCatalogo: null, origenCatalogo: null, error: r.error,
        });
        return;
      }
      cb({
        estado: r.estado, // 'listo' | 'vacio'
        aproximado: false,
        leadId: null,
        items: presentar(
          soloDelTenant(
            (r.items || []).map(function (item) {
              return desdeMachea(item, porNombre);
            }),
            !!r.constructoraFiltrada
          ),
          state.answers,
          false // sin podio: el modelo ya trae su compatibilidad real
        ),
        totalCatalogo: r.total,
        origenCatalogo: r.motor ? 'modelo ' + r.motor : 'modelo de recomendación',
        error: null,
      });
    });
  }

  // Punto de entrada único. Se elige con RECOMMENDER en js/config.js:
  //   'machea' (default) -> el modelo, con sus fotos por id_proyecto
  //   'local'            -> solo el motor de reglas, sin red
  function recomendar(state, cb) {
    var cfg = window.GDF_CONFIG || {};
    // Demo sin red (ver SIN_BACKEND en js/config.js): las recomendaciones salen
    // del motor local y se marcan como aproximadas, porque lo son — no es el
    // ranking del modelo.
    if (cfg.SIN_BACKEND || (cfg.RECOMMENDER || 'machea') === 'local') {
      recomendarLocal(state.answers, cb, { aproximado: true });
      return;
    }
    recomendarMachea(state, cb);
  }

  window.GDF = window.GDF || {};
  window.GDF.recommender = {
    recomendar: recomendar,
    recomendarMachea: recomendarMachea,
    recomendarLocal: recomendarLocal,
    desdeLocal: desdeLocal,
    TOTAL_RECOMENDADOS: TOTAL_RECOMENDADOS,
    POR_PAGINA: POR_PAGINA,
  };
})();
