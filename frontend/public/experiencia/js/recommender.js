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
  // Las fotos llegan como rutas RELATIVAS, porque el servicio no sabe con qué
  // URL pública lo están llamando. Dos formas, según quién respondió:
  //   - "/experiencia/imagenes_proyectos/12/01.webp" (backend/api/app.py):
  //     las fotos SON un estático de este mismo front (ver ese archivo) —
  //     se resuelven contra location.origin, la propia página.
  //   - "/imagenes_proyectos/12/01.jpg" (integracion/servicio_machea.py, para
  //     correr junto al modelo en un stand): ahí sí viven en el servicio, no
  //     en el front — se resuelven contra MACHEA_BASE como antes.
  // Sin esto, alguna de las dos rutas sale sin foto: sin ningún error, solo
  // un degradado donde debería haber un edificio.
  function urlDeFoto(ruta) {
    var r = String(ruta || '');
    if (!r || /^https?:/i.test(r) || r.indexOf('data:') === 0) return r;
    if (r.indexOf('/experiencia/') === 0) return r;
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
      // El BARRIO va entre las dos: es la pieza que faltaba. Con varias zonas
      // elegidas en el mapa, la localidad sola no dice cuál de ellas es —y el
      // usuario que marcó cinco sectores no sabe si este cae en el suyo—.
      ubicacion: [item.localidad, item.barrio].filter(Boolean).join(' · '),
      direccion: item.direccion || '',
      barrio: item.barrio || '',
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
      // Localidad · barrio, y la direccion aparte (la pinta la tarjeta en su
      // propia linea). El catalogo del tenant no traia ninguno de los dos: se
      // cruzan desde proyectos_model.json por nombre, que es donde el backend
      // si los tiene. Sin el barrio, quien marca cinco sectores en el mapa ve
      // "Suba" en las seis tarjetas y no sabe cual cae donde pidio.
      ubicacion: [p.localidad, p.barrio].filter(Boolean).join(' · ') || p.muni || '',
      localidad: p.localidad || '',
      direccion: p.direccion || '',
      barrio: p.barrio || '',
      // `price` del catalogo YA viene en pesos (262635750), no en millones.
      // Multiplicarlo daba 2,6e14 y la tarjeta escribia "Desde $262635750,0M".
      precioCop: p.price || 0,
      area: p.area || null,
      habitaciones: p.hab ? [p.hab] : [],
      vis: !!p.vis,
      subsidio: !!p.vis,
      // Zonas comunes reales de la ficha: { label, icon, clave }.
      //
      // El catálogo del tenant guarda en `clave` la ETIQUETA del vocabulario
      // ('Gimnasio', 'Cancha de pádel'), mientras que `answers.entorno_deseado`
      // guarda los SLUGS de la pregunta ('gymnasio', 'cancha e padel'). La
      // tarjeta compara las dos con un `indexOf`, así que sin esta vuelta no
      // coincidía NUNCA ninguna: "Tiene lo que buscas ✓" no se pintaba jamás
      // en la demo sin red, y las razones perdían la línea de zonas en común.
      // `desdeMachea` ya hacía esta misma conversión con `claveDe`; aquí
      // faltaba, y por eso el fallo solo se veía con SIN_BACKEND.
      amenidades: (p.amenidades || []).map(function (a) {
        return {
          label: a.label,
          icon: a.icon,
          // Si la zona no cruza con el vocabulario, `claveDe` devuelve null y
          // la amenidad se sigue listando: simplemente no se resalta.
          clave: window.GDF.machea.claveDe(a.clave || a.label),
        };
      }),
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
  // Se arma con los mismos criterios que usa el scoring (localidad,
  // habitaciones, precio contra el rango de ingresos, VIS/subsidio y las zonas
  // comunes que el usuario marcó), desde el view-model, así que sirve igual
  // venga del motor local o del backend.
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

  /**
   * Los motivos de la tarjeta, YA CLASIFICADOS: lo que juega a favor, cada uno
   * con su etiqueta (Zona, Tamaño, Entorno, Precio, Tipo), y lo que juega en
   * contra, en frases sueltas.
   *
   * ANTES ERA UN PÁRRAFO de seis a ocho líneas ("Es el que mejor encaja
   * contigo: reparte sus 37 m² en las 2 habitaciones que buscabas, que es lo
   * que necesitas para…"). Se leía, pero no de un vistazo, y en una tarjeta
   * de resultados la gente escanea. Ahora cada motivo es una línea con su
   * etiqueta delante (TEXTOS.md, sección 4, aprobado por Diego).
   *
   * LO QUE NO CAMBIA ES LA VERDAD. Cada motivo sigue saliendo de un dato del
   * catálogo cruzado con una respuesta del quiz, y lo que no encaja SIEMPRE
   * se dice (en "A considerar"). Esconder que un proyecto se sale del
   * presupuesto no es mejor copy: es una recomendación peor.
   */
  function motivosDeMatch(vm, a) {
    var VECINAS = window.GDF.data.VECINAS || {};
    var mat = window.GDF.matching;
    var aFavor = [];
    var enContra = [];

    // 1. Zona. Se compara contra TODAS las zonas pedidas, no solo contra la
    // primera: en el mapa se pueden marcar varios sectores en localidades
    // distintas, y un proyecto en la segunda zona elegida no puede anunciarse
    // como "lejos de lo que pediste".
    var zonas = (a.zonas && a.zonas.length) ? a.zonas : (a.zona ? [a.zona] : []);
    var localidad = String(vm.localidad || vm.ubicacion || '').split(/[,·]/)[0].trim();
    if (localidad && zonas.length) {
      if (zonas.indexOf(localidad) > -1) {
        aFavor.push({ etiqueta: 'Zona', texto: localidad +
          (zonas.length > 1 ? ', una de las zonas que marcaste' : ', la localidad que pediste') });
      } else {
        // La vecindad se mira contra CUALQUIERA de las pedidas, y se nombra la
        // que la produce: decir "vecina de" sin decir de cuál no ubica a nadie.
        var vecinaDe = null;
        for (var z = 0; z < zonas.length; z++) {
          if ((VECINAS[zonas[z]] || []).indexOf(localidad) > -1) { vecinaDe = zonas[z]; break; }
        }
        if (vecinaDe) aFavor.push({ etiqueta: 'Zona', texto: localidad + ', vecina de ' + vecinaDe });
        else enContra.push('queda en ' + localidad + ', fuera de ' + (zonas.length > 1 ? 'las zonas que marcaste' : zonas[0]));
      }
    }

    // 2. Tamaño: habitaciones y metros. El área convierte "2 habitaciones" en
    // un espacio imaginable; las dos cosas vienen del catálogo.
    var pedidas = mat.habitacionesPedidas(a);
    var ofrece = (vm.habitaciones || []).reduce(function (max, h) {
      return Math.max(max, Number(h) || 0);
    }, 0);
    function hab(n) {
      return n + (n === 1 ? ' habitación' : ' habitaciones');
    }
    var m2 = vm.area ? Math.round(vm.area) : 0;
    var conM2 = m2 ? ', ' + m2 + ' m²' : '';
    if (ofrece) {
      if ((vm.habitaciones || []).map(Number).indexOf(pedidas) > -1) {
        aFavor.push({ etiqueta: 'Tamaño', texto: hab(pedidas) + conM2 });
      } else if (ofrece > pedidas) {
        aFavor.push({ etiqueta: 'Tamaño', texto: hab(ofrece) + conM2 + ' (' +
          (ofrece - pedidas === 1 ? 'una más' : (ofrece - pedidas) + ' más') + ' de las que pediste)' });
      } else {
        enContra.push('tiene ' + hab(ofrece) + ' y pediste ' + pedidas);
      }
    } else if (m2) {
      aFavor.push({ etiqueta: 'Tamaño', texto: m2 + ' m² construidos' });
    }

    // 3. Entorno: las zonas comunes que marcó. Se nombran máximo dos; la
    // tarjeta las resalta todas más abajo.
    var quiere = a.entorno_deseado || [];
    var coinciden = [];
    (vm.amenidades || []).forEach(function (am) {
      var corto = nombreCorto(am.label);
      if (am.clave && quiere.indexOf(am.clave) > -1 && corto && coinciden.indexOf(corto) === -1) coinciden.push(corto);
    });
    if (coinciden.length) {
      var resto = coinciden.length - 2;
      aFavor.push({ etiqueta: 'Entorno', texto: 'tiene ' + listaNatural(coinciden.slice(0, 2)) +
        (resto > 0 ? ' y ' + resto + ' más de lo que marcaste' : '') });
    }

    // 4. Precio contra el techo del rango de ingresos.
    var millones = Math.round((vm.precioCop || 0) / 1e6);
    if (millones) {
      if (millones <= mat.bandaDe(a)) aFavor.push({ etiqueta: 'Precio', texto: 'dentro de tu rango de ingresos' });
      else enContra.push('arranca en $' + millones + ' millones, por encima de tu rango de ingresos');
    }

    // 5. VIS / subsidio.
    var quiereVis = a.tipo === 'VIS';
    if (vm.vis === quiereVis) {
      aFavor.push({ etiqueta: 'Tipo', texto: vm.vis ? 'VIS, puedes aplicar a subsidio' : 'No VIS, con financiación más flexible' });
    } else {
      enContra.push('es ' + (vm.vis ? 'VIS' : 'No VIS') + ' y buscabas ' + (quiereVis ? 'VIS' : 'No VIS'));
    }

    return { aFavor: aFavor, enContra: enContra };
  }

  /**
   * La razón de la tarjeta, como DATOS para pintar (ver projectCard en
   * templates.js), no como un texto:
   *
   *   { titulo: 'Mejor opción' | 'Segunda opción' | 'Tercera opción' | null,
   *     puntos: [{ etiqueta: 'Zona', texto: 'Fontibón, vecina de Usaquén' }, ...],  // máximo 3
   *     considerar: 'arranca en $563 millones, por encima de tu rango de ingresos' | '' }
   *
   * Tres puntos es el corte: con más la tarjeta vuelve a ser un párrafo. Se
   * toman en el orden de arriba (zona, tamaño, entorno, precio, tipo), que es
   * el de lo que más pesa al elegir dónde vivir.
   */
  function razonDeMatch(vm, a, pos) {
    var m = motivosDeMatch(vm, a);
    // Solo el podio lleva encabezado. Con 18 tarjetas en tres páginas, un
    // rótulo en cada una se volvía relleno.
    var titulo = ['Mejor opción', 'Segunda opción', 'Tercera opción'][pos] || null;
    return {
      titulo: titulo,
      puntos: m.aFavor.slice(0, 3),
      considerar: listaNatural(m.enContra),
    };
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
