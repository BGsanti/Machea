// Plantillas: una función por pantalla que devuelve un string HTML.
// Nada de virtual DOM — cada render() reconstruye el innerHTML del root
// completo, lo que hace que las animaciones CSS se disparen solas en cada
// cambio de pantalla/pregunta (son nodos DOM nuevos).
(function () {
  'use strict';

  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Un icono de interfaz (js/iconos-ui.js). El formulario no usa emojis ni
  // simbolos tipograficos (decision de Diego, 2026-10-02): todo pictograma
  // sale de aqui. Va SIEMPRE fuera de esc(): es HTML, no texto.
  function ic(nombre, opciones) {
    var I = window.GDF.iconosUI;
    return I ? I.icono(nombre, opciones) : '';
  }

  // -------------------------------------------------------------------------
  // LA MARCA ACTIVA
  // -------------------------------------------------------------------------
  // Los literales de marca que estaban repartidos por este archivo (el nombre,
  // el logo, la pregunta de afiliación, el Habeas Data, el cierre) salen
  // ahora del manifiesto del tenant, para que la misma app pueda vestirse de
  // cualquier constructora.
  //
  // CADA LECTURA LLEVA SU DEFAULT, y el default es el texto de Colsubsidio tal
  // como estaba escrito. Se duplica a propósito: si el manifiesto no cargara,
  // la app sigue funcionando y con el texto correcto, en vez de pintar huecos
  // en blanco en mitad de una demo.
  function marca() {
    return window.GDF_MARCA || {};
  }

  // Textos de Machea fijados en el código (T11, TEXTOS.md sección 4): su
  // manifiesto (tenants/machea/marca.js) es generado y todavía dice
  // "Demostración" y "Ver ficha oficial ↗". Ganan sobre el manifiesto solo en
  // Machea; las constructoras siguen leyendo el suyo.
  var COPY_MACHEA = {
    fichaOficial: 'Ver ficha oficial del proyecto',
    sinPlanos: 'Aún no tenemos los planos de este proyecto.',
    disclaimerCatalogo:
      'Datos de área, habitaciones, baños y precio tomados de las fichas publicadas por cada constructora. ' +
      'Precios y disponibilidad pueden cambiar: confírmalos con el asesor.',
  };

  /** Un texto del manifiesto, o el de Colsubsidio si la marca no lo declara. */
  function txt(clave, porDefecto) {
    if (marca().slug === 'machea' && COPY_MACHEA[clave] != null) return COPY_MACHEA[clave];
    var c = marca().copy || {};
    return c[clave] != null ? c[clave] : porDefecto;
  }

  /** Un campo de identidad (nombre, logo, dominio…). */
  function ident(clave, porDefecto) {
    var i = marca().identidad || {};
    return i[clave] != null ? i[clave] : porDefecto;
  }

  /** El nombre de la constructora. Se usa dentro de frases redactadas. */
  function nombreMarca() {
    return ident('nombre', 'Colsubsidio');
  }

  /**
   * El logo, o el nombre escrito si no hay logo.
   *
   * NO ES UN DETALLE: el extractor no siempre va a conseguir un logo utilizable
   * del sitio de una constructora (los hay en sprites, en CSS de fondo, o en un
   * SVG que referencia fuentes externas). Sin este respaldo, la cabecera de esa
   * marca mostraria el icono de imagen rota — que es justo lo que no puede
   * pasar cuando le estas enseñando su propia version a un cliente.
   *
   * El texto hereda `--sobre-marca`, asi que se lee igual sobre la cabecera de
   * cualquier color.
   */
  function logoHtml(clase) {
    var src = ident('logo', 'assets/Logov2.png');
    var nombre = nombreMarca();
    if (!src) {
      return '<span class="gdf-logo-texto' + (clase ? ' ' + clase : '') + '">' + esc(nombre) + '</span>';
    }
    return '<img' + (clase ? ' class="' + clase + '"' : '') + ' src="' + esc(src) + '" alt="' + esc(nombre) + '" />';
  }

  /**
   * ¿Esta marca pregunta por afiliación?
   *
   * Solo tiene sentido en una caja de compensación: una constructora privada no
   * tiene afiliados, y preguntarlo en su demo es justo lo que rompe la ilusión.
   * Apagarlo esconde la pregunta de la escarapela y la insignia del carné; las
   * reglas de matching que miran `a.afiliado` quedan muertas solas, sin tocar
   * su lógica.
   */
  // Las notas de afiliación ("Afiliado Colsubsidio", "No afiliado — cupo
  // 10%…") son la regla 90/10 de una caja de compensación. qualification.js
  // las escribe para todas las marcas; se pintan solo donde se pregunta la
  // afiliación. El PUNTAJE de ese bloque no se toca aquí: es lógica de
  // calificación y la decide quien lleva qualification.js.
  function notaVisible(nota) {
    return pideAfiliacion() || !/afiliad/i.test(nota);
  }

  function pideAfiliacion() {
    var n = marca().negocio || {};
    return n.tipo ? n.tipo === 'caja' : true;
  }


  /**
   * La casita ilustrada. Hoy solo la usa splash(): la portada dejó de tener
   * bloque propio al pasar a ser el clon de la página de Colsubsidio, cuyo
   * hero lleva la casa 3D amarilla de ellos.
   *
   * Es UN SVG y no veinte <div> absolutos, y esa es la corrección de fondo:
   * antes cada pieza (muro, tejado, chimenea, puerta, ventanas…) llevaba su
   * propia copia de la animación de flotación, que incluía un `rotate(-3deg)`.
   * Como cada elemento gira sobre SU centro y todos estaban en sitios
   * distintos, en cuanto arrancaba la animación la casa se descuadraba: el
   * tejado se salía de los muros, la chimenea quedaba flotando en el aire y la
   * puerta se desbordaba por abajo. Se veía torcida.
   *
   * Con un solo `<g class="casa">` que flota, las piezas comparten origen y
   * ya no pueden separarse — la casa se mueve entera. Y al ser coordenadas de
   * un `viewBox`, la geometría es exacta: el tejado apoya en los muros, la
   * chimenea nace DENTRO del faldón (se dibuja antes que el tejado, que le
   * tapa la base) y la puerta se apoya en la línea del suelo.
   */
  function houseIllustration() {
    return (
      '<div class="gdf-hero-illustration">' +
      '<div class="glow"></div>' +
      '<svg class="gdf-casa" viewBox="0 0 320 240" role="img" aria-label="Ilustración de una casa">' +
      // La sombra NO flota: se queda en el suelo y por eso la casa se lee
      // como que se despega de él.
      '<ellipse class="suelo" cx="160" cy="186" rx="76" ry="10" />' +
      '<g class="casa">' +
      // Chimenea primero: el tejado se pinta encima y le esconde la base.
      '<rect x="190" y="44" width="16" height="46" fill="var(--tinta-media)" />' +
      // Muros. El trazo va por dentro para que el ancho declarado sea el real.
      '<rect x="104" y="100" width="112" height="76" rx="9"' +
      ' fill="#fdfefe" stroke="var(--marca)" stroke-width="5" />' +
      // Tejado: base exactamente sobre la línea de los muros (y=100), con
      // alero de 14 a cada lado.
      '<path d="M160 50 L232 102 L88 102 Z" fill="var(--acento)" />' +
      '<rect x="86" y="98" width="148" height="9" rx="4.5" fill="var(--acento-oscuro)" />' +
      // Remate de la chimenea, ya por encima del tejado.
      '<rect x="186" y="38" width="24" height="7" rx="3" fill="var(--tinta)" />' +
      '<circle class="humo h1" cx="198" cy="32" r="5" />' +
      '<circle class="humo h2" cx="201" cy="28" r="4" />' +
      // Asta y bandera, apoyadas en la cumbrera.
      '<rect x="158.5" y="16" width="3" height="36" rx="1.5" fill="var(--tinta-suave)" />' +
      '<path class="bandera" d="M161.5 20 L186 27 L161.5 34 Z" fill="var(--acento)" />' +
      // Puerta en arco, apoyada en el suelo del muro.
      '<path d="M145 173.5 V143 a15 15 0 0 1 30 0 V173.5 Z" fill="var(--acento)" />' +
      '<circle cx="168" cy="158" r="2.6" fill="#fff" />' +
      // Ventanas, dentro de los muros y a la misma altura.
      ventanaSvg(120, 118) + ventanaSvg(178, 118) +
      // Jardinera bajo la ventana izquierda.
      '<rect x="116" y="138" width="28" height="9" rx="2" fill="#7a5b3a" />' +
      '<circle cx="124" cy="136" r="3.2" fill="#ff8fab" />' +
      '<circle cx="134" cy="135" r="3.2" fill="var(--acento)" />' +
      '</g>' +
      '</svg>' +
      '<div class="accent-1"></div>' +
      '<div class="accent-2"></div>' +
      '<div class="accent-3"></div>' +
      '<div class="accent-4"></div>' +
      '</div>'
    );
  }

  // Ventana de 22x20 con sus cruces, para no repetir el bloque dos veces.
  function ventanaSvg(x, y) {
    return (
      '<g>' +
      '<rect x="' + x + '" y="' + y + '" width="22" height="20" rx="3" fill="var(--marca)" />' +
      '<rect x="' + (x + 10) + '" y="' + y + '" width="2" height="20" fill="#fff" />' +
      '<rect x="' + x + '" y="' + (y + 9) + '" width="22" height="2" fill="#fff" />' +
      '</g>'
    );
  }

  // AQUI VIVIA LA BARRA DE ARRIBA: una franja del color de la marca, de lado a
  // lado, con solo su nombre alineado a la derecha. Se quito a peticion.
  //
  // Con el diseño estandar dejo de aportar: era una banda naranja igual en las
  // cuatro constructoras, y lo unico que la diferenciaba —el nombre— sigue
  // apareciendo donde importa (el consentimiento de la escarapela, el enlace a
  // la ficha oficial, el cierre). `logoHtml` se queda: lo usa el splash.

  // AQUI VIVIA LA PORTADA. Eran ~400 lineas que clonaban
  // colsubsidio.com/vivienda/proyectos: sus tres barras de cabecera, sus cuatro
  // carruseles con su reparto por breakpoint y su footer de pestañas. Se fue
  // entera con Colsubsidio, junto con `paginasPortada` y `guionesHtml`.
  //
  // La app entra ahora por el splash, que es de marca y no de nadie en
  // concreto: se viste con el tenant que toque.

  // Pantalla de entrada: sigue el spec visual de
  // design/landing-hero-handoff/ (nav azul con logo, pastilla de campaña,
  // casa ilustrada con CSS, un solo badge). El CTA salta directo a escarapela:
  // ya no hay pantalla de elegir personaje.
  function splash() {
    return (
      '<div class="gdf-screen gdf-hero">' +
      // El splash tenia su propia barra de marca, igual que el resto de
      // pantallas. Se fue con ellas: era la misma franja naranja con el nombre
      // a la derecha, y el nombre ya sale dos lineas mas abajo, dentro de la
      // frase de entrada ("...encaja contigo, con Cusezar").
      '<main class="gdf-hero-main">' +
      '<div class="gdf-hero-pill"><span class="dot"></span>Grúa del Futuro</div>' +
      houseIllustration() +
      '<h1>' + txt('splashTitulo', 'Construye tu sueño') + '</h1>' +
      '<p class="gdf-hero-lead">' +
      txt('splashLead', 'Responde jugando y encuentra tu vivienda ideal.') +
      '</p>' +
      '<p class="gdf-hero-quote">' +
      txt('splashQuote', '&ldquo;Tú pones el sueño. Nosotros la grúa.&rdquo;') +
      '</p>' +
      '<button class="gdf-hero-cta" data-action="goEscarapela">' +
      txt('splashCta', '¡Construir mi casa!') +
      '</button>' +
      '<div class="gdf-hero-badges">' +
      '<span class="gdf-hero-badge"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--marca)" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l3 2"></path><path d="M9 2h6"></path></svg>2 minutos</span>' +
      '</div>' +
      '</main>' +
      '</div>'
    );
  }

  // nombre/apellido/correo separados (no un solo "nombre completo"): el
  // backend de leads (contrato SenalBowl) los requiere como campos
  // independientes — ver js/leads.js.
  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  // El isotipo de Machea (el dibujo de Santiago, mismo que favicon y landing)
  // en el rojo del manual, con la palabra al lado.
  var ISOTIPO_MACHEA =
    '<svg viewBox="3 3 50.5 33.7" aria-hidden="true" focusable="false">' +
    '<g fill="none" stroke="#FC4633" stroke-width="6" stroke-linejoin="miter" stroke-miterlimit="10">' +
    '<path d="M6 25.6 24.4 7.2 33.6 16.4"/><path d="M12 19.6V36.7"/><path d="M20.5 23.3 26.7 29.5 47.6 11.6"/></g>' +
    '<path fill="#FC4633" d="M41.25 7.9 53.3 6 51 18.75Z M40 25 45.8 20.9V36.7H40Z"/></svg>';

  /** Un campo del registro de Machea: rótulo, input y su mensaje de error. */
  function campoRegistro(c, valor) {
    return (
      '<div class="gdf-reg-campo" data-campo="' + c.campo + '">' +
      '<label class="gdf-field-label" for="' + c.id + '">' + c.rotulo + '</label>' +
      '<input class="gdf-input" id="' + c.id + '" type="' + c.tipo + '"' +
      (c.modo ? ' inputmode="' + c.modo + '"' : '') +
      ' autocomplete="' + c.auto + '" placeholder="' + c.ejemplo + '"' +
      ' aria-describedby="' + c.id + 'Error" value="' + esc(valor) + '" />' +
      '<p class="gdf-reg-error" id="' + c.id + 'Error">' + ic('alerta', { tam: 14 }) + '<span>' + c.error + '</span></p>' +
      '</div>'
    );
  }

  /**
   * El registro de Machea, variante B "formulario limpio" (T4b; mockup en
   * design/formulario-rediseno/mockups/registro.html, textos de TEXTOS.md
   * sección 1). Sin carné, sin avatar y sin cédula. La validación en vivo la
   * pinta updateStartButton() en main.js sin repintar la pantalla, para no
   * perder el foco; aquí solo sale el estado inicial.
   */
  function registroMachea(state) {
    var v = window.GDF.state.validarRegistro(state);
    var campos = [
      { campo: 'nombre', id: 'nombreInput', rotulo: 'Nombres', tipo: 'text', auto: 'given-name', ejemplo: 'Ej: Ana', error: 'Escribe tu nombre.' },
      { campo: 'apellido', id: 'apellidoInput', rotulo: 'Apellidos', tipo: 'text', auto: 'family-name', ejemplo: 'Ej: Ruiz', error: 'Escribe tus apellidos.' },
      { campo: 'correo', id: 'correoInput', rotulo: 'Correo electrónico', tipo: 'email', modo: 'email', auto: 'email', ejemplo: 'ana.ruiz@correo.com', error: 'Revisa el correo: debe verse como nombre@dominio.com' },
      { campo: 'telefono', id: 'telefonoInput', rotulo: 'Teléfono (WhatsApp)', tipo: 'tel', modo: 'tel', auto: 'tel-national', ejemplo: '300 123 4567', error: 'Escribe un celular de 10 dígitos.' },
    ];
    var valores = { nombre: state.nombre, apellido: state.apellido, correo: state.correo, telefono: state.telefono };
    return (
      '<div class="gdf-screen gdf-escarapela gdf-registro">' +
      '<div class="gdf-registro-caja">' +
      '<div class="gdf-registro-logo" role="img" aria-label="Machea">' + ISOTIPO_MACHEA + '<span aria-hidden="true">machea</span></div>' +
      '<p class="eyebrow">Tus datos</p>' +
      '<h2>Cuéntanos quién eres</h2>' +
      '<p class="gdf-registro-sub">Después te hacemos unas preguntas sobre la vivienda que buscas.</p>' +
      '<div class="gdf-registro-fila">' +
      campoRegistro(campos[0], valores.nombre) +
      campoRegistro(campos[1], valores.apellido) +
      '</div>' +
      campoRegistro(campos[2], valores.correo) +
      campoRegistro(campos[3], valores.telefono) +
      '<div class="gdf-reg-campo" data-campo="consent">' +
      '<label class="gdf-consent" data-action="toggleConsent" role="checkbox" tabindex="0"' +
      ' aria-checked="' + (state.consent ? 'true' : 'false') + '" aria-describedby="consentError">' +
      '<span class="box' + (state.consent ? ' checked' : '') + '">' + (state.consent ? ic('check') : '') + '</span>' +
      '<span class="text">' +
      txt('habeasData', 'Autorizo el tratamiento de mis datos personales para recibir información de vivienda (Habeas Data).') +
      '</span>' +
      '</label>' +
      '<p class="gdf-reg-error" id="consentError">' + ic('alerta', { tam: 14 }) + '<span>Necesitamos tu autorización para continuar.</span></p>' +
      '</div>' +
      '<button class="gdf-btn-primary' + (v.ok ? ' enabled' : '') + '" data-action="startQuiz" aria-disabled="' + (v.ok ? 'false' : 'true') + '">' +
      'Empezar ' + ic('flecha-derecha') + '</button>' +
      '<p class="gdf-hint" aria-live="polite">' + (v.ok ? 'Todo listo.' : 'Completa los campos para continuar.') + '</p>' +
      '</div>' +
      '</div>'
    );
  }

  function escarapela(state) {
    if (marca().slug === 'machea') return registroMachea(state);
    var canStart = window.GDF.state.validarRegistro(state).ok;

    var affiliateBadge =
      pideAfiliacion() && state.afiliado !== null
        ? '<span class="affiliate-badge">' + (state.afiliado === 'Sí' ? 'Afiliado ' + ic('check') : 'No afiliado') + '</span>'
        : '';

    // La pregunta de afiliación solo existe en una caja de compensación. En una
    // constructora privada no se pinta — ver pideAfiliacion(). No bloquea nada:
    // `canStart` nunca la exigió.
    var afiliacionCampo = !pideAfiliacion()
      ? ''
      : '<label class="gdf-field-label">' +
        txt('afiliacionPregunta', '¿Estás afiliado a Colsubsidio?') +
        '</label>' +
        '<div class="gdf-affiliate-row">' +
        '<button class="gdf-affiliate-btn' +
        (state.afiliado === 'Sí' ? ' selected' : '') +
        '" data-action="setAfiliado" data-value="Sí">' +
        txt('afiliacionSi', 'Sí, afiliado') +
        '</button>' +
        '<button class="gdf-affiliate-btn' +
        (state.afiliado === 'No' ? ' selected' : '') +
        '" data-action="setAfiliado" data-value="No">' +
        txt('afiliacionNo', 'No lo soy') +
        '</button>' +
        '</div>';

    var fullName = (state.nombre.trim() + ' ' + state.apellido.trim()).trim();

    return (
      '<div class="gdf-screen gdf-escarapela">' +
      // EMBEBIDA NO HAY ATRAS, porque no hay nada detras. La escarapela es la
      // primera pantalla dentro del modal (ver `screen` en state.js), asi que
      // este boton llevaba al splash —"Encuentra tu proximo hogar"—, una
      // pantalla de bienvenida que dentro de un modal sobra: quien pulso
      // "¡Empezar mi match!" ya dijo que queria empezar. Se colaba solo por
      // aqui, y quien lo pulsaba se quedaba en una puerta anterior a la que
      // ya habia cruzado.
      (window.GDF_EMBED
        ? ''
        : '<button class="gdf-back-btn" data-action="goSplash">' + ic('flecha-izquierda') + ' Atrás</button>') +
      '<div class="kicker"><div class="eyebrow">TU CARNÉ DE CONSTRUCTOR</div><h2>Primero, preséntate</h2></div>' +
      '<div class="gdf-carnet">' +
      '<div class="clip"></div>' +
      // El sello de la banda es opcional: una marca sin él muestra solo el
      // rótulo, en vez de un hueco de imagen rota.
      '<div class="band">' +
      (ident('marcaChica', 'assets/mark-yellow.png')
        ? '<img src="' + esc(ident('marcaChica', 'assets/mark-yellow.png')) + '" alt="" />'
        : '') +
      '<span>CARNÉ DE CONSTRUCTOR</span></div>' +
      '<div class="body">' +
      '<div class="avatar" id="carnetAvatar">' + ic('usuario') + '</div>' +
      '<div class="name" id="carnetName">' + (esc(fullName) || 'Tu nombre') + '</div>' +
      '<div class="phone" id="carnetPhone">' + (esc(state.telefono.trim()) || 'Tu teléfono') + '</div>' +
      '<div class="badge-wrap" id="carnetBadgeWrap">' + affiliateBadge + '</div>' +
      '</div>' +
      '</div>' +
      '<label class="gdf-field-label">Nombres</label>' +
      '<input class="gdf-input" id="nombreInput" placeholder="Ej: Ana" value="' + esc(state.nombre) + '" />' +
      '<label class="gdf-field-label">Apellidos</label>' +
      '<input class="gdf-input" id="apellidoInput" placeholder="Ej: Ruiz Gómez" value="' + esc(state.apellido) + '" />' +
      '<label class="gdf-field-label">Correo electrónico</label>' +
      '<input class="gdf-input" id="correoInput" type="email" placeholder="Ej: ana.ruiz@correo.com" value="' + esc(state.correo) + '" />' +
      '<label class="gdf-field-label">Teléfono (WhatsApp)</label>' +
      '<input class="gdf-input" id="telefonoInput" inputmode="tel" placeholder="Ej: 300 123 4567" value="' + esc(state.telefono) + '" />' +
      afiliacionCampo +
      '<label class="gdf-consent" data-action="toggleConsent">' +
      '<span class="box' + (state.consent ? ' checked' : '') + '">' + (state.consent ? ic('check') : '') + '</span>' +
      '<span class="text">' +
      txt(
        'habeasData',
        'Autorizo el tratamiento de mis datos personales para recibir información de vivienda de Colsubsidio (Habeas Data).'
      ) +
      '</span>' +
      '</label>' +
      '<button class="gdf-btn-primary' + (canStart ? ' enabled' : '') + '" data-action="startQuiz">Empezar a construir ' + ic('flecha-derecha') + '</button>' +
      '<p class="gdf-hint">Completa nombres, apellidos, correo, teléfono y consentimiento para continuar.</p>' +
      '</div>'
    );
  }

  // Una sola fuente del HTML de un cuarto: la usan sceneBlock (render completo)
  // y updatePlantaDOM en main.js (para insertar las piezas nuevas). Si diverge,
  // las piezas que caen de la grúa dejarían de parecerse a las que ya estaban.
  // Una pieza del plano: una caja que recorta, y dentro un lienzo con la imagen
  // COMPLETA del plano, dimensionado y desplazado para que por el recorte
  // asome exactamente su trozo. Cuando están todas las piezas, el conjunto es
  // la imagen entera y sin costuras.
  //
  // Es la única fuente del HTML de una pieza: la usan sceneBlock (pintado
  // completo) y updatePlantaDOM en main.js (para insertar las que caen). Si
  // divergen, las piezas nuevas dejan de parecerse a las que ya estaban.
  function cuartoHtml(room, animado) {
    return (
      '<div class="gdf-room' + (animado ? ' animated' : '') + '"' +
      ' data-room="' + esc(room.id) + '" style="' + room.styleText + '">' +
      '<i class="lienzo" style="' + room.lienzoStyle + '"></i>' +
      '</div>'
    );
  }

  // La silueta: la forma real del apartamento, en gris, desde antes de la
  // primera respuesta. Sirve para que las piezas caigan DENTRO de algo en vez
  // de aparecer flotando, y para que al retroceder quede el hueco a la vista.
  function siluetaHtml(huecos, rooms) {
    if (!huecos || !huecos.length) return '';
    // Qué celdas ya tienen pieza encima: su hueco nace apagado.
    var ocupados = {};
    (rooms || []).forEach(function (r) { ocupados[r.id] = true; });
    return (
      '<div class="gdf-silueta">' +
      huecos
        .map(function (h) {
          // El id permite apagar el hueco en cuanto su pieza cae encima. Hace
          // falta porque las piezas van en `mix-blend-mode: multiply` para que
          // el papel blanco del plano no tape la escena: si el hueco gris
          // siguiera debajo, la pieza se multiplicaría contra él y el plano
          // entero saldría entintado de gris.
          return '<i class="gdf-hueco" data-hueco="' + esc(h.id) + '"' +
            (ocupados[h.id] ? ' style="opacity:0;' + h.styleText + '"' : ' style="' + h.styleText + '"') +
            '></i>';
        })
        .join('') +
      '</div>'
    );
  }

  // NOTA: aquí estaba `rotuloHtml`, la pastilla azul que nombraba el proyecto y
  // la tipología del plano que se estaba armando. Se quitó a propósito: el
  // apartamento es un EJEMPLO y ponerle nombre solo invitaba a leerlo como la
  // recomendación, que se calcula al final y suele ser otro proyecto.

  // Las zonas comunes REALES del proyecto líder, alrededor de la losa. Las que
  // el usuario pidió en 'entorno_deseado' van resaltadas. El cruce es directo
  // porque `amenidades[].clave` ya viene normalizada del scraper al mismo
  // vocabulario que usan los valores de esa pregunta.
  function haloAmenidadesHtml(planta, answers) {
    if (!planta || !planta.amenidades || !planta.amenidades.length) return '';
    var pedidas = answers.entorno_deseado || [];
    var lista = planta.amenidades.slice();
    // Primero las que coinciden con lo que pidió: son las que quiere ver.
    lista.sort(function (a, b) {
      return (pedidas.indexOf(b.clave) > -1) - (pedidas.indexOf(a.clave) > -1);
    });
    var chips = lista
      .slice(0, 6)
      .map(function (am) {
        var coincide = am.clave && pedidas.indexOf(am.clave) > -1;
        var icono = am.icon
          ? '<img src="' + esc(am.icon) + '" alt="" loading="lazy" />'
          : '<span class="punto">•</span>';
        return (
          '<span class="gdf-halo-chip' + (coincide ? ' coincide' : '') + '"' +
          ' title="' + esc(am.label) + '">' + icono + '</span>'
        );
      })
      .join('');
    return '<div class="gdf-halo">' + chips + '</div>';
  }

  function sceneBlock(state, derived, animarTodo) {
    var planta = derived.planta;
    var answers = state.answers || {};
    // 'operacion' (Comprar/Arrendar, ver data.js): lienzo en blanco, ni
    // lote ni losa -- `state.planta` ya existe desde 'startQuiz', así que
    // sin este corte se alcanzaría a ver el contorno vacío de la casa
    // antes de elegir siquiera qué se está buscando.
    var vacio = derived.q && derived.q.escena === 'vacio';

    var loteHtml = (derived.showLote && !vacio) ? '<div class="gdf-lote"><span>Tu lote</span></div>' : '';

    var roomsHtml = '';
    if (derived.losaRevealed && !vacio) {
      var roomsInner = derived.rooms
        .map(function (room) {
          return cuartoHtml(room, !!animarTodo);
        })
        .join('');
      // --ratio le da a la losa la forma real del apartamento (sin él, el mismo
      // plano se ve apaisado en móvil y cuadrado en escritorio) y --wmax impide
      // ampliar la imagen por encima de 1:1 en pantallas anchas.
      roomsHtml =
        '<div class="gdf-losa" data-sello="' + esc(planta ? planta.sello : '') + '"' +
        ' style="--ratio:' + (planta ? planta.ratio : 1.4) +
        ';--wmax:' + (planta ? planta.wmax : 700) + 'px">' +
        siluetaHtml(derived.huecos, derived.rooms) +
        roomsInner +
        '</div>';
    }

    // La bola cuelga de una grúa que está FUERA DE CUADRO, por encima de la
    // escena: el cable se corta contra el borde superior (`.gdf-scene` lleva
    // `overflow:hidden`) y eso es justo lo que se quiere: que la grúa se
    // intuya, no que se dibuje.
    //
    // Aquí vivían un brazo amarillo giratorio (`.gdf-crane-jib` + su
    // contrapeso) y un gancho amarillo (`.gdf-crane-hook-top`) clavados en la
    // esquina superior izquierda. Se quitaron a petición: leían como ruido
    // encima del plano. Si vuelven a aparecer, es un retroceso.
    //
    // AQUI COLGABA LA BOLA DE DEMOLICION. Entraba desde la izquierda cuando el
    // plano cambiaba, lo reventaba en pedazos y salia por arriba. Se quito a
    // peticion, con su cable, su polvo y la sacudida de la losa.
    //
    // El plano se SIGUE armando pieza a pieza, y cada pieza sigue llegando en
    // pedazos que convergen: eso nunca fue la bola.

    // Aquí flotaba el avatar del usuario (`.gdf-avatar-marker`, el emoji que
    // eligió en la escarapela). Se quitó a petición: encima de la escena no
    // aporta nada y se leía como el logo de una constructora pegado al plano.
    // El avatar SIGUE en la escarapela (ver carnet), que es donde tiene
    // sentido.

    // La pregunta del piso no añade piezas: cambia lo que se ve DEBAJO del
    // apartamento (a qué altura está) y la sombra que proyecta. Es data-* para
    // que main.js lo actualice sin tocar el resto de la escena.
    var piso = answers.piso_preferido ? ' data-piso="' + esc(answers.piso_preferido) + '"' : '';
    var haloHtml = (answers.entorno_deseado && !vacio) ? haloAmenidadesHtml(planta, answers) : '';

    // EL MAPA TAPA LA ESCENA, NO LA SUSTITUYE. En la pregunta de ubicación el
    // lienzo lo ocupa el mapa de Bogotá, pero `.gdf-scene` se sigue pintando
    // igual y el mapa entra como un hijo en position:absolute encima.
    //
    // Es deliberado: reconstruir la escena por innerHTML destruye los
    // `.gdf-room` y entonces cada respuesta rehace el plano entero en vez de
    // añadirle una pieza (ver updateQuizDOM en main.js). Tapándola, la losa y
    // la silueta no se destruyen NUNCA y esa invariante queda intacta.
    //
    // Y no hay nada que tapar de todos modos: con cero respuestas
    // `scene.celdasVisibles` devuelve 0, así que durante esa pregunta no
    // existe ni una sola pieza pintada.
    //
    // El nodo va vacío: lo llena Leaflet cuando main.js lo monta (js/mapa.js).
    var mapaHtml = derived.q && derived.q.escena === 'mapa'
      ? '<div class="gdf-mapa-real" id="zonaMapa"></div>'
      : '';

    // Sin rótulo ni marca de localidad: el apartamento es un EJEMPLO para
    // enseñar cómo se arma una vivienda, y nombrarlo solo invita a creer que es
    // la recomendación. La recomendación sale al final, calculada con las
    // respuestas. Además el nombre de la localidad chocaba con la que el
    // usuario acababa de elegir.
    // `gdf-scene--vacio` es lo que lee el CSS (y updateEscenaVacioDOM en
    // main.js, en preguntas siguientes) para pasar el panel a pantalla
    // completa en vez de dejar esta mitad en blanco -- ver el media query de
    // 900px en styles.css.
    return (
      '<div class="gdf-scene' + (vacio ? ' gdf-scene--vacio' : '') + '"' + piso + '>' +
      loteHtml + roomsHtml + haloHtml + mapaHtml +
      '</div>'
    );
  }

  // La mayoría de preguntas son grillas de botones (q.options), pero 'edad'
  // (entero exacto, lo pide el contrato de leads), 'entorno_deseado'
  // (buscador con chips sobre las 25 opciones fijas) necesitan un input real
  // en vez de opciones fijas de un solo valor — ver 'answerQuizNumber'/
  // 'answerQuizText'/'answerQuizMultiselect' en main.js, que leen el
  // input/la selección en curso al vuelo y despachan 'selectOption' con el
  // valor armado.
  function quiz(state, derived) {
    // La escena se pinta entera solo aquí (primera vez que se entra al quiz, o
    // un F5): por eso animarTodo=true, que ahí sí todo es nuevo de verdad. Al
    // responder una pregunta NO se pasa por aquí — main.js parchea el DOM para
    // que solo caiga de la grúa la pieza nueva. Ver updateQuizDOM.
    return sceneBlock(state, derived, true) + quizPanel(state, derived);
  }

  // Texto de confirmación de la pregunta 'zona'. Lo repinta main.js sin pasar
  // por render(), igual que los chips de 'entorno_deseado': un re-render en
  // cada tecla perdería el foco del buscador.
  // Recibe la LISTA de sectores elegidos, `[{localidad, barrio}, ...]`. Los
  // nombres de cada uno los pintan los chips (ver renderZonaChips en main.js);
  // esto es la línea de estado que va debajo: cuántos van y qué conviene saber.
  function zonaEco(sectores) {
    var lista = sectores || [];
    if (!lista.length) {
      return '<span class="vacio">Toca en el mapa las zonas donde te gustaría vivir, o búscalas arriba. Puedes elegir varias.</span>';
    }
    var oferta = window.GDF.data.OFERTA || {};
    // Las localidades DISTINTAS: dos barrios de Suba son una sola localidad
    // para el modelo, y decir "2 zonas" cuando filtra por una sería mentir.
    var locs = [];
    lista.forEach(function (s) {
      if (locs.indexOf(s.localidad) < 0) locs.push(s.localidad);
    });
    var txt = lista.length === 1
      ? '<strong>1 zona elegida</strong>'
      : '<strong>' + lista.length + ' zonas elegidas</strong>';
    if (locs.length !== lista.length) {
      txt += '<span class="en">en ' + locs.length +
        (locs.length === 1 ? ' localidad' : ' localidades') + '</span>';
    }
    // Las que no tienen un solo proyecto se pueden elegir igual: el modelo
    // expande a las vecinas por su grafo. Se avisa para que no sorprenda, y se
    // nombran, que con varias elegidas hace falta saber cuál es.
    var sinOferta = locs.filter(function (l) { return !oferta[l]; });
    if (sinOferta.length) {
      txt += '<span class="aviso">Sin proyectos propios en ' + esc(sinOferta.join(', ')) +
        ' — ahí te mostramos los de las zonas vecinas.</span>';
    }
    return txt;
  }

  // EL PANEL DE LA PREGUNTA DE UBICACIÓN. Aquí solo va el buscador de
  // barrios: el mapa vive en el lienzo grande (ver `escena: 'mapa'` en
  // data.js y el `.gdf-mapa-real` de sceneBlock), no dentro de esta columna.
  //
  // Los dos caminos llevan al mismo sitio, el NOMBRE de una localidad, que es
  // lo que `state.answers.zona` ha guardado siempre y lo que traducen a
  // `Localidad` 1..20 el localidadId() de machea.js y el motor local.
  //
  // NO autoavanza al tocar el mapa, y ahí se aparta de la grilla de botones:
  // si el primer clic saltara de pregunta no habría nada que sincronizar
  // entre mapa y buscador, ni forma de corregirse. La elección en curso vive
  // fuera de `state` (ver `zonaSeleccion` en main.js) y se compromete al
  // pulsar Continuar, exactamente como 'entorno_deseado'.
  // UN SOLO BUSCADOR PARA LOS DOS CAMINOS. Quien conoce los barrios de Bogotá
  // escribe el suyo; quien no, el centro comercial o el parque de al lado. Ya
  // no se le pregunta antes cuál de los dos es: eran dos pestañas, y la
  // persona tenía que decidir de qué tipo era lo que iba a escribir antes de
  // escribirlo. Ahora el desplegable trae las dos cosas juntas —barrios
  // arriba, lugares debajo (ver renderZonaSugerencias en main.js)— y las dos
  // terminan en el mismo `{localidad, barrio, bi}`.
  //
  // Los chips van arriba del buscador, en su propia fila: son la respuesta
  // completa, venga del barrio, del lugar o del mapa.
  function zonaPanel(q, state) {
    // Habilitado si ya había zonas elegidas —se vuelve aquí con "Atrás"—; con
    // la lista vacía, el botón lo enciende sincronizarZona() al primer clic.
    var elegida = (state.zonaSectores || []).length;
    return (
      '<div class="gdf-quiz-freeform gdf-zona">' +
      '<div class="gdf-entorno-chips gdf-zona-chips" id="zonaChips"></div>' +

      '<div class="gdf-entorno-combo">' +
      '<div class="gdf-zona-input-wrap" id="zonaInputWrap">' +
      '<input class="gdf-input gdf-zona-input" id="zonaSearch" type="text" autocomplete="off" ' +
      'placeholder="' + (elegida ? 'Agregar otra zona…' : 'Tu barrio o un lugar cerca (Cedritos, Unicentro…)') + '" />' +
      '</div>' +
      '<div class="gdf-multi-opt-list" id="zonaOpciones"></div>' +
      '</div>' +

      '<p class="gdf-zona-eco" id="zonaEco">' + zonaEco(state.zonaSectores) + '</p>' +
      '<button class="gdf-btn-primary' + (elegida ? ' enabled' : '') + '" ' +
      'data-action="answerQuizZona" data-qid="' + q.id + '">Continuar ' + ic('flecha-derecha') + '</button>' +
      '</div>'
    );
  }

  function quizPanel(state, derived) {
    var q = derived.q;
    var answerAreaHtml = '';

    if (q && q.type === 'number') {
      answerAreaHtml =
        '<div class="gdf-quiz-freeform">' +
        '<input class="gdf-input" id="quizNumberInput" type="number" inputmode="numeric"' +
        (q.min != null ? ' min="' + q.min + '"' : '') +
        (q.max != null ? ' max="' + q.max + '"' : '') +
        ' placeholder="' + esc(q.placeholder || '') + '" />' +
        '<button class="gdf-btn-primary" data-action="answerQuizNumber" data-qid="' + q.id + '">Continuar ' + ic('flecha-derecha') + '</button>' +
        '</div>';
    } else if (q && q.type === 'text') {
      answerAreaHtml =
        '<div class="gdf-quiz-freeform">' +
        '<input class="gdf-input" id="quizTextInput" type="text" placeholder="' + esc(q.placeholder || '') + '" />' +
        '<button class="gdf-btn-primary enabled" data-action="answerQuizText" data-qid="' + q.id + '">Continuar ' + ic('flecha-derecha') + '</button>' +
        '</div>';
    } else if (q && q.type === 'zona') {
      answerAreaHtml = zonaPanel(q, state);
    } else if (q && q.type === 'multiselect') {
      var multiOpts = q.options
        .map(function (o) {
          return (
            '<button type="button" class="gdf-multi-opt" data-action="toggleEntorno" data-value="' + esc(o.v) + '">' +
            esc(o.label) +
            '</button>'
          );
        })
        .join('');
      // Con `min` declarado (estilo de vida de Arriendo, data.js): lista
      // corta y fija, DESPLEGABLE. Reusa '.gdf-multi-opt-list' de las
      // amenidades de Compra para el estilo de cada fila, pero con el
      // modificador `--plegable` (ver CSS): esa lista flota encima de lo que
      // sigue (pensada para un buscador, que se cierra solo al elegir o al
      // escribir), y aquí con 11 opciones fijas y min:3 el usuario elige
      // varias seguidas sin cerrarla -- flotando le tapaba los chips y el
      // botón Continuar mientras tanto. `--plegable` la abre empujando el
      // resto hacia abajo en vez de flotar. El botón alterna 'abierto' a
      // mano (ver 'entornoToggle' en main.js); el cierre por "clic afuera" lo
      // cubre gratis cerrarEntornoSiTocaAfuera(), que ya recorre TODOS los
      // '.gdf-entorno-combo' de la pantalla. El botón Continuar arranca
      // deshabilitado -- toggleEntornoValor()/renderEntornoChips() en main.js
      // lo habilitan al llegar a `min` elegidos.
      if (q.min) {
        answerAreaHtml =
          '<div class="gdf-quiz-freeform">' +
          '<div class="gdf-entorno-combo">' +
          '<button type="button" class="gdf-input gdf-entorno-toggle" id="entornoToggle" ' +
          'aria-haspopup="listbox" aria-expanded="false" aria-controls="entornoOpciones">' +
          '<span>Elige tus preferencias (mínimo ' + q.min + ')</span>' +
          '<span class="gdf-entorno-toggle-caret" aria-hidden="true"></span>' +
          '</button>' +
          '<div class="gdf-multi-opt-list gdf-multi-opt-list--plegable" id="entornoOpciones">' + multiOpts + '</div>' +
          '</div>' +
          '<div class="gdf-entorno-chips" id="entornoChips"></div>' +
          '<button class="gdf-btn-primary" data-action="answerQuizMultiselect" data-qid="' + q.id + '">Continuar ' + ic('flecha-derecha') + '</button>' +
          '</div>';
      } else {
        // Buscador con "explorar todo": al enfocar aparece el listado
        // completo (25 zonas, precargadas de una — ver main.js) y escribir
        // lo filtra. Flota pegado al buscador (position:absolute sobre
        // '.gdf-entorno-combo', ver CSS), por eso no es un <details>
        // nativo: ahí no hay forma de decidir por JS cuándo mostrarlo.
        // Debajo, en su propio lugar: chips de lo elegido y Continuar.
        answerAreaHtml =
          '<div class="gdf-quiz-freeform">' +
          '<div class="gdf-entorno-combo">' +
          '<input class="gdf-input" id="entornoSearch" type="text" placeholder="Busca (ej. piscina, bbq)…" autocomplete="off" />' +
          '<div class="gdf-multi-opt-list" id="entornoOpciones">' + multiOpts + '</div>' +
          '</div>' +
          '<div class="gdf-entorno-chips" id="entornoChips"></div>' +
          '<button class="gdf-btn-primary enabled" data-action="answerQuizMultiselect" data-qid="' + q.id + '">Continuar ' + ic('flecha-derecha') + '</button>' +
          '</div>';
      }
    } else if (q && q.type === 'contador') {
      // Arriendo: 4 contadores en una sola pantalla (ver data.js, id
      // 'habitaciones'). Estilos en `.gdf-contador*` de styles.css (antes
      // iban en línea). Valor no controlado (igual que
      // zonaSeleccion/entornoSeleccion): +/- patchea el número en el DOM sin
      // re-render, ver ajustarContador() en main.js.
      var filasContador = q.campos
        .map(function (c) {
          return (
            '<div class="gdf-contador">' +
            '<span>' + esc(c.label) + '</span>' +
            '<div class="gdf-contador-control">' +
            '<button type="button" class="gdf-back-btn gdf-contador-btn" data-action="ajustarContador" data-campo="' + c.id + '" data-delta="-1" aria-label="Menos ' + esc(c.label) + '">' + ic('menos') + '</button>' +
            '<span class="gdf-contador-valor" id="contadorValor-' + c.id + '">' + c.inicial + '</span>' +
            '<button type="button" class="gdf-back-btn gdf-contador-btn" data-action="ajustarContador" data-campo="' + c.id + '" data-delta="1" aria-label="Más ' + esc(c.label) + '">' + ic('mas') + '</button>' +
            '</div>' +
            '</div>'
          );
        })
        .join('');
      answerAreaHtml =
        '<div class="gdf-quiz-freeform">' +
        filasContador +
        '<button class="gdf-btn-primary enabled" data-action="answerPreferencias" data-qid="' + q.id + '">Continuar ' + ic('flecha-derecha') + '</button>' +
        '</div>';
    } else if (q) {
      var cols = q.cols || 1;
      // DOS FORMAS DE OPCION (variante B "lista sobria", aprobada por Diego
      // el 2026-10-03; mockup en design/formulario-rediseno):
      //   - FILA: ancho completo, con el indicador de selección a la derecha
      //     (o, si la opción tiene icono, el icono a la izquierda y una
      //     flecha a la derecha). Es la de casi todas las preguntas.
      //   - CASILLA: las numéricas cortas (personas, habitaciones), que en
      //     filas serían cinco renglones para "0, 1, 2, 3, 4+". Siguen en
      //     cuadrícula, con la misma forma y los mismos estados.
      var iconos = ICONOS_OPCION[q.id] || null;
      var enFilas = !!iconos || cols <= 2 || q.options.some(function (o) { return !!o.hint; });
      // La elegida: la respuesta vigente o, al volver con "Atrás" (que la
      // deshace), la que había — ver `respuestaPrevia` en state.js.
      var previa = state.respuestaPrevia;
      var elegida = state.answers && state.answers[q.id] != null
        ? state.answers[q.id]
        : previa && previa.qid === q.id ? previa.v : null;
      var options = q.options
        .map(function (o) {
          var hasHint = !!o.hint;
          var icono = iconos && iconos[o.v];
          var sel = elegida != null && String(elegida) === String(o.v);
          var indicador = '';
          if (enFilas) {
            indicador = icono
              ? '<span class="gdf-opt-flecha">' + ic('flecha-derecha') + '</span>'
              : '<span class="gdf-opt-radio">' + (sel ? ic('check') : '') + '</span>';
          }
          return (
            '<button class="gdf-opt-btn' + (hasHint ? ' has-hint' : '') + (sel ? ' selected' : '') +
            '" data-action="selectOption" data-qid="' + q.id + '" data-value="' + esc(o.v) + '"' +
            (sel ? ' aria-pressed="true"' : '') + '>' +
            (icono ? '<span class="gdf-opt-icono">' + ic(icono) + '</span>' : '') +
            '<span class="gdf-opt-texto"><span class="label">' + esc(o.label) + '</span>' +
            (hasHint ? '<span class="hint">' + esc(o.hint) + '</span>' : '') + '</span>' +
            indicador +
            '</button>'
          );
        })
        .join('');
      answerAreaHtml = enFilas
        ? '<div class="gdf-options gdf-options--filas">' + options + '</div>'
        : '<div class="gdf-options gdf-options--casillas cols-' + cols + '">' + options + '</div>';
    }

    // Siempre visible: en la primera pregunta (qi===0) goBack regresa a
    // escarapela en vez de no hacer nada (ver applyAction en state.js).
    // Va DEBAJO DE LAS RESPUESTAS, alineado con ellas (variante B): antes
    // quedaba suelto al fondo del panel, lejos de lo que se estaba mirando.
    var backBtn = '<button class="gdf-back-btn" data-action="goBack">' + ic('flecha-izquierda') + ' Atrás</button>';

    // EL PROGRESO ES EL DE LAS PREGUNTAS: un segmento por pregunta, rellenos
    // los contestados y el actual. Antes la única barra era la de afinidad,
    // que no aparece en la primera respuesta ni en Arriendo, así que el
    // formulario no tenía un progreso constante.
    var paso = Math.min(derived.answered + 1, derived.stepTotal);
    var segmentos = '';
    for (var s = 1; s <= derived.stepTotal; s++) {
      segmentos += '<i class="' + (s < paso ? 'hecho' : s === paso ? 'actual' : '') + '"></i>';
    }

    // LA AFINIDAD queda como dato secundario, junto al paso.
    //
    // El número es REAL: sale de matching.js con lo contestado hasta ahora
    // (ver compatDe), y puede BAJAR si una respuesta aleja a la persona del
    // catálogo. Es una estimación del motor local; el "% match" de los
    // resultados viene del modelo y puede no coincidir (diagnóstico A5).
    //
    // NO SE MUESTRA HASTA LA SEGUNDA RESPUESTA. Con una sola contestada el
    // número lo decide un único factor, y desde que `zona` va primera ese
    // factor es el más brusco de la fórmula: +29 si el proyecto está en la
    // localidad pedida, −16 si no (ver matching.js). Quien elija una de las
    // seis localidades sin oferta lo veía caer a su suelo del 40 % en la
    // primera pantalla, que se lee como "no hay nada para ti".
    // Arriendo nunca la muestra: matching.js es 100 % de compra (VIS,
    // crédito) y no significa nada para un canon de arriendo.
    var afinidad = derived.answered >= 2 && state.answers.operacion !== 'arriendo'
      ? '<span class="gdf-afinidad">Afinidad con el catálogo <b>' + derived.compat + '%</b></span>'
      : '';

    return (
      '<div class="gdf-screen gdf-quiz">' +
      // LAS TRES ZONAS. El progreso de arriba es el punto fijo del panel:
      // entre pregunta y pregunta no se mueve ni un píxel. Todo lo que cambia
      // vive en `.gdf-quiz-cuerpo`, que es lo único que respira — se centra
      // cuando sobra sitio y scrollea cuando falta (el buscador de barrios de
      // `zona`, o las 25 amenidades).
      '<div class="gdf-quiz-progreso">' +
      '<div class="gdf-pasos" aria-hidden="true">' + segmentos + '</div>' +
      '<div class="gdf-quiz-meta"><span class="gdf-step-count">Pregunta ' + paso + ' de ' + derived.stepTotal + '</span>' +
      afinidad + '</div>' +
      '</div>' +
      '<div class="gdf-quiz-cuerpo">' +
      '<div class="gdf-question"><h2>' + (q ? esc(q.title) : '') + '</h2><p>' + (q ? esc(q.sub) : '') + '</p></div>' +
      answerAreaHtml +
      backBtn +
      '</div>' +
      '</div>'
    );
  }

  // Iconos de las opciones que tienen uno (variante B): las dos preguntas de
  // entrada, donde la persona elige QUÉ busca. Por `v`, que es lo que no
  // cambia; los textos visibles sí pueden cambiar.
  var ICONOS_OPCION = {
    operacion: { compra: 'llave', arriendo: 'contrato' },
    tipo_propiedad: { Vivienda: 'casa', Oficinas: 'edificio', Bodegas: 'bodega' },
  };

  // Arriendo: no hay modelo ni catálogo real detrás (ver el plan de esta
  // entrega) -- se agradece, se resume lo contestado (mismos chips que
  // Compra) y se explica que el matching automático está en desarrollo.
  // Nunca llega a `state.lead`/`state.reco`: bifurca ANTES de que result()
  // los toque.
  // Los tres estados de GET /api/arriendo (ver js/arriendo.js). Mismo
  // criterio que recoCargando/recoVacio/recoError para Compra -- y, desde
  // esta entrega, la misma tarjeta (`projectCardArriendo`, calcada de
  // `projectCard` de Compra): el pedido fue justamente que Arriendo se vea
  // igual, con foto y todo. Sin mapa: Compra tampoco lo tiene en resultados.
  // Los tres usan el mismo marcado que Compra (esqueleto y `.gdf-reco-aviso`)
  // para que Arriendo herede su diseño sin CSS propio.
  function arriendoCargando() {
    return recoCargando().replace('Buscando proyectos para ti…', 'Buscando inmuebles en arriendo…');
  }

  function arriendoError(arriendo) {
    return (
      '<div class="gdf-reco-aviso error">' +
      '<div class="icono">' + ic('alerta') + '</div>' +
      '<h3>No pudimos cargar los inmuebles en arriendo</h3>' +
      '<p>' + esc(arriendo.error || 'Hubo un problema de conexión.') + '</p>' +
      '<div class="acciones">' +
      '<button class="gdf-btn-primary enabled" data-action="reintentarArriendo">Reintentar</button>' +
      '</div>' +
      '</div>'
    );
  }

  function arriendoVacio() {
    return (
      '<div class="gdf-reco-aviso vacio">' +
      '<div class="icono">' + ic('buscar') + '</div>' +
      '<h3>Todavía no tenemos inmuebles de este tipo</h3>' +
      '<p>Prueba con otra zona o vuelve a intentarlo más adelante.</p>' +
      '<div class="acciones">' +
      '<button class="gdf-btn-primary enabled" data-action="goBack">' + ic('flecha-izquierda') + ' Cambiar mis respuestas</button>' +
      '</div>' +
      '</div>'
    );
  }

  // Tarjeta de un inmueble de Arriendo. Mismo esqueleto visual que
  // `projectCard()` (Compra) -- mismas clases CSS, cero CSS nuevo -- pero
  // con los campos que Arriendo sí tiene: canon mensual en vez de "Desde",
  // tipo de inmueble en vez de VIS/subsidio, un solo botón "Ver ficha" en
  // vez de Llamar/WhatsApp (Arriendo no dispara la llamada de Manuela, eso
  // no cambió en esta entrega).
  // El pliego de fotos. Cada ficha de Fincaraíz publica 18 en promedio (hasta
  // 60) y la portada sola desaprovecha el resto, que es justo lo que deja ver
  // si una bodega sirve o no. Se corta en `MAX_FOTOS_ARRIENDO` porque son
  // imágenes remotas del CDN de Fincaraíz: 60 por tarjeta x 6 tarjetas serían
  // 360 descargas por página.
  //
  // Reusa `.gdf-project-detalle` de Compra tal cual, y con ello el acordeón y
  // la persistencia al repintar: el listener de 'toggle' en main.js engancha
  // por esa clase y guarda el estado en `state.detalleAbierto[data-proyecto]`.
  var MAX_FOTOS_ARRIENDO = 12;

  // "Detalles de la Propiedad" tal como los publica la ficha de Fincaraíz: el
  // scraper copia su tabla (`technicalSheet`) con sus propias etiquetas, así
  // que aquí no se traduce ni se reordena nada. Ver `_ficha` en
  // scraping/scraper_arriendo.py.
  function fichaArriendo(item) {
    var filas = (item.ficha || [])
      .map(function (f) {
        return (
          '<div class="gdf-ficha-fila">' +
          '<span class="gdf-ficha-etiqueta">' + esc(f.etiqueta) + '</span>' +
          '<span class="gdf-ficha-valor">' + esc(f.valor) + '</span>' +
          '</div>'
        );
      })
      .join('');
    if (!filas) return '';
    return (
      '<div class="gdf-detalle-titulo-bloque">Detalles de la propiedad</div>' +
      '<div class="gdf-ficha">' + filas + '</div>'
    );
  }

  // "Comodidades de la propiedad", agrupadas como vienen en la ficha
  // (Interior, Exterior, Sector...). Sin agrupar, 30 etiquetas sueltas se
  // leen como una bolsa: el grupo es lo que deja ver de un vistazo si lo que
  // tiene es del inmueble o del barrio.
  function comodidadesArriendo(item) {
    var comodidades = item.comodidades || [];
    if (!comodidades.length) return '';
    var grupos = [];
    var porGrupo = {};
    comodidades.forEach(function (c) {
      var grupo = c.grupo || 'Otras';
      if (!porGrupo[grupo]) {
        porGrupo[grupo] = [];
        grupos.push(grupo);
      }
      porGrupo[grupo].push(c.nombre);
    });
    var html = grupos
      .map(function (grupo) {
        return (
          '<div class="gdf-comodidad-grupo">' +
          '<span class="gdf-comodidad-grupo-nombre">' + esc(grupo) + '</span>' +
          porGrupo[grupo]
            .map(function (n) { return '<span class="gdf-comodidad">' + esc(n) + '</span>'; })
            .join('') +
          '</div>'
        );
      })
      .join('');
    return (
      '<div class="gdf-detalle-titulo-bloque">Comodidades (' + comodidades.length + ')</div>' +
      '<div class="gdf-comodidades">' + html + '</div>'
    );
  }

  function galeriaArriendo(item, state) {
    var fotos = (item.imagenes || []).slice(0, MAX_FOTOS_ARRIENDO);
    var extras = fichaArriendo(item) + comodidadesArriendo(item);
    if (fotos.length < 2 && !extras) return '';
    var id = String(item.id_inmueble);
    var abierto = !!state.detalleAbierto[id];
    var total = (item.imagenes || []).length;

    // `loading="lazy"`: el pliego nace cerrado y sin esto el navegador se baja
    // las 12 fotos de las 6 tarjetas igual, para no mostrarlas.
    //
    // La miniatura abre el VISOR (ver `visorFotos`) en vez de la foto en una
    // pestaña nueva: ahí se ven en grande y se pueden pasar sin salirse de la
    // experiencia, que es lo que se pidió.
    var miniaturas = fotos
      .map(function (url, idx) {
        return (
          '<button class="gdf-arriendo-foto" data-action="abrirVisor" data-inmueble="' + esc(id) +
          '" data-idx="' + idx + '" aria-label="Ver la foto ' + (idx + 1) + ' en grande">' +
          '<img src="' + esc(url) + '" alt="Foto ' + (idx + 1) + ' de ' + esc(item.nombre || 'el inmueble') +
          '" loading="lazy">' +
          '</button>'
        );
      })
      .join('');

    return (
      '<details class="gdf-project-detalle"' + (abierto ? ' open' : '') +
      ' data-action="noop" data-proyecto="' + esc(id) + '">' +
      '<summary><span class="gdf-detalle-titulo">' +
      (total > 1 ? 'Ver las ' + total + ' fotos y los detalles' : 'Ver los detalles') +
      '</span><span class="gdf-detalle-chevron">' + ic('chevron-abajo') + '</span></summary>' +
      '<div class="gdf-detalle-body">' +
      (miniaturas ? '<div class="gdf-arriendo-galeria">' + miniaturas + '</div>' : '') +
      (total > fotos.length
        ? '<p class="gdf-detalle-vacio">Las otras ' + (total - fotos.length) +
          ' están en la ficha de Fincaraíz.</p>'
        : '') +
      extras +
      '</div>' +
      '</details>'
    );
  }

  // Las comodidades de Fincaraíz traducidas al vocabulario de iconos
  // (js/iconos.js), que está escrito con los nombres del catálogo de Compra.
  // Se compara por substring normalizado: la fuente dice "Zonas Verdes",
  // "Ascensor(es) inteligente(s)" o "Sauna / Turco / Jacuzzi" para lo que el
  // vocabulario llama "Zona verde", "Ascensor" y "Sauna".
  //
  // EL ORDEN IMPORTA: gana la primera que coincida, así que lo específico va
  // antes que lo genérico ("salon de juegos" antes que "salon").
  // Se construye con new RegExp para no dejar caracteres combinantes sueltos
  // en el archivo, que son invisibles en el editor (mismo criterio que
  // RE_DIACRITICOS en js/recommender.js).
  var RE_DIACRITICOS_TPL = new RegExp('[̀-ͯ]', 'g');

  var ICONO_POR_COMODIDAD = [
    ['zona infantil', 'Zona kids'],
    ['salon de juegos', 'Sala de juegos'],
    ['salon comunal', 'Salón social'],
    ['parques cercanos', 'Parque'],
    ['zonas verdes', 'Zona verde'],
    ['jardin', 'Zona verde'],
    ['mascota', 'Zona pet'],
    ['gimnasio', 'Gimnasio'],
    ['sauna', 'Sauna'],
    ['canchas deportivas', 'Cancha múltiple'],
    ['bici', 'Taller de bicicletas'],
    ['lavanderia', 'Zona de lavandería'],
    ['sala de internet', 'Coworking'],
    ['deposito', 'Depósito'],
    ['balcon', 'Balcón'],
    ['terraza', 'Balcón'],
    ['ascensor', 'Ascensor'],
    ['colegios', 'Colegios'],
    ['porteria', 'Portería'],
    ['piscina', 'Piscina'],
  ];

  function claveDeIcono(nombre) {
    var limpio = String(nombre || '')
      .normalize('NFD')
      .replace(RE_DIACRITICOS_TPL, '')
      .toLowerCase();
    for (var i = 0; i < ICONO_POR_COMODIDAD.length; i++) {
      if (limpio.indexOf(ICONO_POR_COMODIDAD[i][0]) > -1) return ICONO_POR_COMODIDAD[i][1];
    }
    return '';
  }

  // "Tiene lo que buscas ✓": lo que la persona marcó en estilo de vida y este
  // inmueble sí publica (lo cruza `_coincidencias_estilo` en Model/arriendo.py).
  //
  // VA SIEMPRE VISIBLE, fuera del pliego, por lo mismo que en Compra: es el
  // "esto sí tiene lo que pediste", y metido entre las otras 20 comodidades
  // deja de leerse como respuesta a lo que la persona pidió.
  //
  // Reusa el mismo marcado de Compra (`.gdf-project-entorno.destacado` +
  // `amenidadItem`), así que hereda sus iconos, su ✓ y su entrada escalonada
  // sin una sola regla de CSS nueva.
  function estiloCoincideArriendo(item) {
    var coinciden = item.estilo_coinciden || [];
    if (!coinciden.length) return '';
    var items = coinciden
      .map(function (c, idx) {
        return amenidadItem({ label: c.comodidad, icon: '', iconoClave: claveDeIcono(c.comodidad) }, true, idx);
      })
      .join('');
    return (
      '<div class="gdf-project-entorno destacado">' +
      '<div class="gdf-entorno-titulo">Tiene lo que buscas ' + ic('check') + '</div>' +
      '<div class="gdf-project-amenities">' + items + '</div>' +
      '</div>'
    );
  }

  // Calcado de `accionesContacto` de Compra, con el texto del mensaje de
  // WhatsApp adaptado: en arriendo no se pregunta por un proyecto, se pregunta
  // si el inmueble sigue disponible.
  function accionesContactoArriendo(item, state) {
    var numero = String((window.GDF_CONFIG && window.GDF_CONFIG.WHATSAPP_NUMERO) || '').replace(/\D/g, '');
    var quien = (state.nombre || '').trim();
    var mensaje =
      'Hola, me interesa ' + (item.nombre || 'este inmueble') +
      (item.localidad_nombre ? ' (' + item.localidad_nombre + ')' : '') +
      '. ¿Sigue disponible? Vengo de Machea' + (quien ? ', mi nombre es ' + quien : '') + '.';
    var url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensaje);
    // Mismos textos y pesos que en Compra (T9): la principal dispara la
    // llamada de Manuela, la secundaria es un enlace.
    return (
      '<div class="gdf-project-acciones">' +
      '<button class="gdf-btn-primary enabled gdf-project-llamar" data-action="llamarProyecto" data-value="' +
      esc(item.id_inmueble) + '">' +
      ic('telefono') + 'Hablar con un asesor</button>' +
      '<a class="gdf-project-whatsapp" data-action="whatsapp" href="' + esc(url) + '" target="_blank" rel="noopener">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>' +
      'Escribir por WhatsApp</a>' +
      '</div>'
    );
  }

  var ICONO_TIPO_ARRIENDO = { vivienda: 'casa', oficina: 'edificio', bodega: 'bodega' };

  function projectCardArriendo(item, i, state) {
    var foto = (item.imagenes || [])[0] || '';
    // Mismo fondo sin foto que Compra: Machea lo cambia por un color liso.
    var fondo = 'var(--fondo-sin-foto, linear-gradient(135deg,var(--marca),var(--marca-medio)))';
    var headerStyle = foto
      ? "background:url('" + foto + "') center/cover no-repeat, " + fondo
      : 'background:' + fondo;
    var emojiHtml = foto ? '' : '<span class="emoji">' + ic(ICONO_TIPO_ARRIENDO[item.tipo_inmueble] || 'casa') + '</span>';
    // El % lo calcula Model/arriendo.py (cercanía a la zona elegida, y en
    // Vivienda también presupuesto y perfil). Sin zona no hay % que defender
    // y llega null: ahí se muestra la posición, como Compra sin score.
    // `.gdf-match-cifra` es la que anima el contador al entrar (ver main.js).
    var pct = item.porcentaje_compatibilidad;
    var badge =
      pct != null
        ? '<span class="gdf-project-badge"><span class="gdf-match-cifra" data-hasta="' + esc(pct) + '">' +
          esc(pct) + '</span>% match</span>'
        : '<span class="gdf-project-badge">#' + (i + 1) + '</span>';

    var precioHtml = item.precio_canon_cop
      ? '<div class="gdf-project-precio">Arriendo <strong>' +
        esc('$' + Math.round(item.precio_canon_cop).toLocaleString('es-CO') + '/mes') +
        '</strong></div>'
      : '<div class="gdf-project-tags"><span class="gdf-project-tag no-informado">Precio no informado</span></div>';

    var tipoLabel = { vivienda: 'Vivienda', oficina: 'Oficina', bodega: 'Bodega' }[item.tipo_inmueble] || '';
    // Habitaciones/baños solo para vivienda: una bodega o una oficina no se
    // describen por "alcobas", aunque Fincaraíz a veces publique ese campo
    // igual (son plantillas de formulario compartidas con vivienda).
    var esVivienda = item.tipo_inmueble === 'vivienda';
    var tags =
      (tipoLabel ? '<span class="gdf-project-tag">' + tipoLabel + '</span>' : '') +
      (item.area_m2 ? '<span class="gdf-project-tag">' + esc(item.area_m2 + ' m²') + '</span>' : '') +
      (esVivienda && item.habitaciones ? '<span class="gdf-project-tag">' + item.habitaciones + (item.habitaciones === 1 ? ' hab' : ' habs') + '</span>' : '') +
      (esVivienda && item.banos ? '<span class="gdf-project-tag">' + item.banos + (item.banos === 1 ? ' baño' : ' baños') + '</span>' : '');

    // Las mismas dos salidas que en Compra (ver `accionesContacto`): llamar
    // dispara a Manuela y WhatsApp abre el chat con el mensaje escrito. La
    // ficha de Fincaraíz baja a enlace: es para mirar, no para contactar.
    var accionesHtml = accionesContactoArriendo(item, state) +
      (item.link_origen
        ? '<a class="gdf-project-ficha" href="' + esc(item.link_origen) +
          '" target="_blank" rel="noopener noreferrer">Ver ficha en Fincaraíz ' + ic('enlace-externo') + '</a>'
        : '');

    // Mismo orden que la tarjeta de Compra (T9): primero se entiende el
    // inmueble (datos, por qué quedó aquí y lo que coincide) y después se
    // actúa. El detalle va al final porque al abrirse empujaría los botones.
    return (
      '<div class="gdf-project-card">' +
      '<div class="gdf-project-header" style="' + headerStyle + '">' +
      emojiHtml +
      badge +
      '</div>' +
      '<div class="gdf-project-body">' +
      '<div class="gdf-project-name">' + esc(item.nombre || 'Inmueble') + '</div>' +
      precioHtml +
      (item.localidad_nombre ? '<div class="gdf-project-loc">' + ic('ubicacion') + ' ' + esc(item.localidad_nombre) + '</div>' : '') +
      direccionHtml(item.direccion) +
      '<div class="gdf-project-tags">' + tags + '</div>' +
      // Por qué quedó en esta posición, redactado por el modelo con los mismos
      // criterios del score (mismo rol que `vm.razon` en Compra).
      (item.razon ? '<div class="gdf-project-razon"><p class="gdf-razon-texto">' + esc(item.razon) + '</p></div>' : '') +
      estiloCoincideArriendo(item) +
      accionesHtml +
      galeriaArriendo(item, state) +
      '</div>' +
      '</div>'
    );
  }

  // Grilla paginada de tarjetas, igual patrón que `recoLista()` de Compra:
  // de a 6 (`POR_PAGINA`), con los mismos `.gdf-projects`/`.gdf-paginacion`.
  function arriendoLista(state, arriendo) {
    var porPagina = window.GDF.recommender.POR_PAGINA || 6;
    var totalPaginas = Math.max(1, Math.ceil(arriendo.items.length / porPagina));
    var pagina = Math.min(Math.max(state.arriendoPagina || 0, 0), totalPaginas - 1);
    var desde = pagina * porPagina;

    var tarjetasHtml = arriendo.items
      .slice(desde, desde + porPagina)
      .map(function (item, i) {
        return projectCardArriendo(item, desde + i, state);
      })
      .join('');

    var paginacionHtml = '';
    if (totalPaginas > 1) {
      var puntos = '';
      for (var n = 0; n < totalPaginas; n++) {
        puntos +=
          '<button class="gdf-pag-punto' + (n === pagina ? ' activo' : '') + '"' +
          ' data-action="irAPaginaArriendo" data-pagina="' + n + '"' +
          ' aria-label="Página ' + (n + 1) + ' de ' + totalPaginas + '"' +
          (n === pagina ? ' aria-current="true"' : '') + '></button>';
      }
      paginacionHtml =
        '<div class="gdf-paginacion">' +
        '<button class="gdf-pag-btn" data-action="irAPaginaArriendo" data-pagina="' + (pagina - 1) + '"' +
        (pagina === 0 ? ' disabled' : '') + '>' + ic('flecha-izquierda') + ' Anteriores</button>' +
        '<div class="gdf-pag-puntos">' + puntos + '</div>' +
        '<button class="gdf-pag-btn" data-action="irAPaginaArriendo" data-pagina="' + (pagina + 1) + '"' +
        (pagina === totalPaginas - 1 ? ' disabled' : '') + '>Siguientes ' + ic('flecha-derecha') + '</button>' +
        '</div>';
    }

    var conMatch = arriendo.items.length && arriendo.items[0].porcentaje_compatibilidad != null;
    return (
      '<p class="gdf-match-count"><b>' + arriendo.items.length +
      (arriendo.items.length === 1 ? ' inmueble' : ' inmuebles') + '</b>' +
      (conMatch ? ' ordenados por compatibilidad con la zona que elegiste.' : '.') +
      (totalPaginas > 1
        ? ' Mostrando del ' + (desde + 1) + ' al ' + Math.min(desde + porPagina, arriendo.items.length) + '.'
        : '') +
      '</p>' +
      '<div class="gdf-projects">' + tarjetasHtml + '</div>' +
      paginacionHtml
    );
  }

  function resultadoArriendo(state, derived) {
    var chipsHtml = derived.perfilChips
      .map(function (c) {
        return '<span class="gdf-chip' + (c.hi ? ' hi' : '') + '">' + esc(c.text) + '</span>';
      })
      .join('');
    var firstNameA = state.nombre.trim().split(' ')[0];
    var arriendo = state.arriendo;

    var cuerpoHtml;
    if (arriendo.estado === 'cargando') cuerpoHtml = arriendoCargando();
    else if (arriendo.estado === 'error') cuerpoHtml = arriendoError(arriendo);
    else if (!arriendo.items.length) cuerpoHtml = arriendoVacio();
    else cuerpoHtml = arriendoLista(state, arriendo);

    return (
      '<div class="gdf-screen gdf-result">' +
      '<div class="gdf-result-head">' +
      '<div class="eyebrow">Arriendo</div>' +
      '<h2>Esto es lo que encontramos para ti' + (firstNameA ? ',<br>' + esc(firstNameA) : '') + '</h2>' +
      '</div>' +
      '<div class="gdf-chips">' + chipsHtml + '</div>' +
      cuerpoHtml +
      '<button class="gdf-restart-btn" data-action="restart">' + ic('reiniciar') + ' Empezar de nuevo</button>' +
      '<p class="gdf-disclaimer">Catálogo demo de arriendo, tomado de Fincaraíz para Bogotá D.C. — no es el catálogo completo del portal.</p>' +
      '</div>'
    );
  }

  function result(state, derived) {
    if (state.answers.operacion === 'arriendo') return resultadoArriendo(state, derived);
    var lead = state.lead;

    var chipsHtml = derived.perfilChips
      .map(function (c) {
        return '<span class="gdf-chip' + (c.hi ? ' hi' : '') + '">' + esc(c.text) + '</span>';
      })
      .join('');

    var notesHtml = lead.notes
      .filter(notaVisible)
      .map(function (n) {
        return '<span class="gdf-lead-note">' + esc(n) + '</span>';
      })
      .join('');

    var leadTitle = lead.status === 'ready' ? 'Tu perfil está listo para un asesor' : 'Seguimos afinando tu búsqueda';
    var leadSub =
      lead.status === 'ready'
        ? 'Con lo que nos contaste, un asesor ya puede ayudarte.'
        : 'Te acompañamos con información y seguimiento mientras defines tu compra.';

    var leadBadgeHtml =
      '<div class="gdf-lead-badge ' + lead.status + '">' +
      '<span class="icon">' + ic(lead.icon) + '</span>' +
      '<div class="title">' + leadTitle + '</div>' +
      '<div class="subcopy">' + leadSub + '</div>' +
      '<div class="gdf-lead-notes">' + notesHtml + '</div>' +
      '</div>';

    var firstName = state.nombre.trim().split(' ')[0];
    var reco = state.reco;

    // El cuerpo cambia según en qué punto va el paso 1 del contrato. Solo el
    // estado 'listo' pinta tarjetas y CTA; los demás explican qué pasó.
    var cuerpoHtml;
    if (reco.estado === 'cargando') cuerpoHtml = recoCargando();
    else if (reco.estado === 'vacio') cuerpoHtml = recoVacio(state);
    else if (reco.estado === 'error') cuerpoHtml = recoError(reco);
    else cuerpoHtml = recoLista(state, reco);

    return (
      '<div class="gdf-screen gdf-result">' +
      '<div class="gdf-result-head">' +
      '<div class="eyebrow">Tus proyectos recomendados</div>' +
      '<h2>Esto es lo que encaja contigo' + (firstName ? ',<br>' + esc(firstName) : '') + '</h2>' +
      '</div>' +
      '<div class="gdf-chips">' + chipsHtml + '</div>' +
      cuerpoHtml +
      '<button class="gdf-restart-btn" data-action="restart">' + ic('reiniciar') + ' Empezar de nuevo</button>' +
      '<p class="gdf-disclaimer">' +
      txt(
        'disclaimerCatalogo',
        'Datos de área, habitaciones, baños y precio tomados de las fichas oficiales de cada proyecto en ' +
          ident('dominio', 'colsubsidio.com') +
          '. La recomendación es una demostración del reto.'
      ) +
      '</p>' +
      '</div>'
    );
  }

  // --- Los cuatro estados de la pantalla de selección ----------------------

  // Esqueleto de carga. El aviso del servidor dormido aparece solo a los 8s
  // (lo activa una clase por CSS, sin temporizadores en JS): el plan gratuito
  // de Render tarda ~25s en despertar y sin explicación parece que se colgó.
  function recoCargando() {
    var tarjetas = '';
    for (var i = 0; i < 6; i++) {
      tarjetas +=
        '<div class="gdf-skeleton-card">' +
        '<div class="gdf-skeleton-header"></div>' +
        '<div class="gdf-skeleton-body">' +
        '<div class="gdf-skeleton-linea ancha"></div>' +
        '<div class="gdf-skeleton-linea media"></div>' +
        '<div class="gdf-skeleton-tags"><span></span><span></span><span></span></div>' +
        '</div></div>';
    }
    return (
      '<p class="gdf-match-count">Buscando proyectos para ti…</p>' +
      '<p class="gdf-reco-lento">Estamos preparando tus resultados. La primera consulta puede tardar unos segundos.</p>' +
      '<div class="gdf-projects">' + tarjetas + '</div>'
    );
  }

  // 200 con lista vacía: el backend respondió bien, simplemente no tiene nada
  // en esa zona. No es un fallo y no se ofrece "reintentar" — reintentar daría
  // exactamente lo mismo. Lo accionable es cambiar la zona.
  function recoVacio(state) {
    var zona = state.answers.zona || 'tu localidad';
    return (
      '<div class="gdf-reco-aviso vacio">' +
      '<div class="icono">' + ic('buscar') + '</div>' +
      '<h3>Sin resultados para ' + esc(zona) + '</h3>' +
      '<p>No encontramos proyectos disponibles ahí con lo que nos contaste. ' +
      'Prueba con otra zona o ajusta el presupuesto.</p>' +
      '<div class="acciones">' +
      '<button class="gdf-btn-primary enabled" data-action="goBack">' + ic('flecha-izquierda') + ' Cambiar mis respuestas</button>' +
      '<button class="gdf-btn-secundario" data-action="usarLocalAproximado">Ver proyectos parecidos</button>' +
      '</div>' +
      '</div>'
    );
  }

  // Fallo de red o del servidor. Se distingue a propósito del caso vacío: acá
  // sí tiene sentido reintentar, y se ofrece la salida por el motor local.
  function recoError(reco) {
    return (
      '<div class="gdf-reco-aviso error">' +
      '<div class="icono">' + ic('alerta') + '</div>' +
      '<h3>No pudimos traer tus recomendaciones</h3>' +
      '<p>' + esc(reco.error || 'Hubo un problema de conexión.') + '</p>' +
      '<div class="acciones">' +
      '<button class="gdf-btn-primary enabled" data-action="reintentarReco">Reintentar</button>' +
      '<button class="gdf-btn-secundario" data-action="usarLocalAproximado">Ver recomendaciones aproximadas</button>' +
      '</div>' +
      '</div>'
    );
  }

  function recoLista(state, reco) {
    // TRES PAGINAS DE SEIS. El modelo devuelve 18 y enseñarlas de golpe hacia
    // una parrilla de tres pantallas de alto en la que las de abajo no las
    // miraba nadie; de seis en seis cada pagina se lee como se leia la unica
    // que habia antes.
    var porPagina = window.GDF.recommender.POR_PAGINA || 6;
    var totalPaginas = Math.max(1, Math.ceil(reco.items.length / porPagina));
    // La pagina se acota aqui y no al guardarla: si el usuario estaba en la 3
    // y una nueva recomendacion devuelve menos proyectos, quedaria mirando una
    // pagina vacia sin nada que se lo dijera.
    var pagina = Math.min(Math.max(state.recoPagina || 0, 0), totalPaginas - 1);
    var desde = pagina * porPagina;

    var projectsHtml = reco.items
      .slice(desde, desde + porPagina)
      .map(function (vm, i) {
        // El indice que viaja es el ABSOLUTO, no el de la pagina: es lo que
        // pinta el "#N" de la tarjeta y lo que decide si el texto dice "es tu
        // mejor match". En la pagina 2, un indice relativo volveria a poner un
        // #1 y habria tres "mejores match" en el mismo resultado.
        return projectCard(vm, state, desde + i);
      })
      .join('');

    var paginacionHtml = '';
    if (totalPaginas > 1) {
      var puntos = '';
      for (var n = 0; n < totalPaginas; n++) {
        puntos +=
          '<button class="gdf-pag-punto' + (n === pagina ? ' activo' : '') + '"' +
          ' data-action="irAPagina" data-pagina="' + n + '"' +
          ' aria-label="Página ' + (n + 1) + ' de ' + totalPaginas + '"' +
          (n === pagina ? ' aria-current="true"' : '') + '></button>';
      }
      paginacionHtml =
        '<div class="gdf-paginacion">' +
        '<button class="gdf-pag-btn" data-action="irAPagina" data-pagina="' + (pagina - 1) + '"' +
        (pagina === 0 ? ' disabled' : '') + '>' + ic('flecha-izquierda') + ' Anteriores</button>' +
        '<div class="gdf-pag-puntos">' + puntos + '</div>' +
        '<button class="gdf-pag-btn" data-action="irAPagina" data-pagina="' + (pagina + 1) + '"' +
        (pagina === totalPaginas - 1 ? ' disabled' : '') + '>Siguientes ' + ic('flecha-derecha') + '</button>' +
        '</div>';
    }

    // Cuando las tarjetas salen del motor local hay que decirlo, siempre. Que
    // el backend esté caído no puede parecer un resultado del modelo.
    var avisoAprox = reco.aproximado
      ? '<div class="gdf-reco-banner">' + ic('alerta') + '<span>Mostramos una selección aproximada porque el servicio de ' +
        'recomendación no respondió. Los proyectos son reales; el orden puede variar.</span></div>'
      : '';

    return (
      avisoAprox +
      // Sin "Continuar" al pie ni proyecto que marcar: cada tarjeta trae sus
      // propios botones de llamar y WhatsApp (ver `accionesContacto`).
      '<p class="gdf-match-count"><b>' + reco.items.length + (reco.items.length === 1 ? ' proyecto' : ' proyectos') +
      '</b> ordenados por afinidad con tu perfil.' +
      (totalPaginas > 1
        ? ' Mostrando del ' + (desde + 1) + ' al ' + Math.min(desde + porPagina, reco.items.length) + '.'
        : '') +
      '</p>' +
      debugPanel(state) +
      '<div class="gdf-projects">' + projectsHtml + '</div>' +
      paginacionHtml
    );
  }

  // "1 hab" · "2 hab" · "1–3 hab" — el backend manda un array de tipologías.
  function etiquetaHabitaciones(habitaciones) {
    if (!habitaciones || !habitaciones.length) return null;
    var min = Math.min.apply(null, habitaciones);
    var max = Math.max.apply(null, habitaciones);
    return (min === max ? min : min + '–' + max) + ' hab';
  }

  // Zonas comunes del proyecto ("Este proyecto cuenta con:" en la ficha real).
  // Las que el usuario pidió en la pregunta de entorno se separan en dos
  // grupos en vez de un solo grid con las coincidencias ordenadas primero:
  //   - amenidadesCoincidenHtml(): SIEMPRE visible en la tarjeta, sin abrir
  //     nada — es el efecto psicológico de "esto sí tiene lo que pediste",
  //     que se pierde si queda mezclado con el resto del catálogo.
  //   - amenidadesRestoHtml(): lo que NO coincide (o, si el usuario no marcó
  //     nada, el catálogo completo) va al pliego (`detalleProyecto`), visible
  //     igual pero sin competir por atención con el match.
  function amenidadItem(a, coincide, idx) {
    // DOS ORÍGENES, y el orden importa:
    //
    // 1. `a.icon` — el icono PROPIO de esta constructora, bajado de su web por
    //    `plataforma/tools/scrape_iconos.py`. Gana siempre que esté, porque es
    //    el que la persona reconoce de su propio catálogo.
    // 2. `js/iconos.js` — los 26 dibujados por nosotros. Cubren el vocabulario
    //    entero y toman el color de la marca.
    //
    // NUNCA SE MEZCLAN LOS DOS DENTRO DE UNA MISMA MARCA, y de eso se encarga
    // `generar_tenants.py`: o le pone `icon` a TODAS sus zonas o no se lo pone
    // a ninguna. Doce macizos de color junto a tres de línea se lee como un
    // error de carga, no como una mezcla de estilos.
    //
    // El punto es la última red: una zona que no cruce con el vocabulario
    // —"Cuarto de residuos", "Subestación eléctrica"— se sigue leyendo.
    // `iconoClave` permite buscar el dibujo con un nombre distinto al que se
    // muestra. Lo usa Arriendo, que enseña la etiqueta de Fincaraíz ("Zonas
    // Verdes") pero busca el icono por la del vocabulario ("Zona verde").
    // Compra no lo manda y sigue buscando por `label`, como siempre.
    var dibujado = (window.GDF.iconos && window.GDF.iconos.icono(a.iconoClave || a.label)) || '';
    var ico = a.icon
      ? '<img src="' + esc(a.icon) + '" alt="" loading="lazy" />'
      : dibujado || '<span class="gdf-amenity-punto">•</span>';
    var delay = coincide ? ' style="animation-delay:' + idx * 70 + 'ms"' : '';
    return (
      '<div class="gdf-amenity' + (coincide ? ' coincide' : '') + '"' + delay + '>' +
      ico + '<span class="gdf-amenity-label">' + esc(a.label) + '</span>' +
      (coincide ? '<span class="gdf-amenity-check" aria-hidden="true">' + ic('check') + '</span>' : '') +
      '</div>'
    );
  }

  function amenidadesCoincidenHtml(amenidades, buscadas) {
    if (!amenidades || !amenidades.length || !buscadas || !buscadas.length) return '';
    var coinciden = amenidades.filter(function (a) {
      return !!a.clave && buscadas.indexOf(a.clave) > -1;
    });
    if (!coinciden.length) return '';

    var items = coinciden.map(function (a, idx) { return amenidadItem(a, true, idx); }).join('');

    return (
      '<div class="gdf-project-entorno destacado">' +
      '<div class="gdf-entorno-titulo">Tiene lo que buscas ' + ic('check') + '</div>' +
      '<div class="gdf-project-amenities' + marcaEnCuadricula(amenidades) + '">' + items + '</div>' +
      '</div>'
    );
  }

  /**
   * ¿Esta marca trae sus PROPIOS iconos?
   *
   * Si los trae, los pocos que falten —y que salen dibujados— tienen que
   * dejar de ir en color de marca: los propios se pintan como silueta clara
   * sobre la tarjeta oscura, y un verde suelto entre seis blancos se lee como
   * un icono roto, no como un acento. Con la marca sin iconos propios no pasa
   * nada de esto y los dibujados se quedan en su color.
   */
  function marcaEnCuadricula(amenidades) {
    var propios = (amenidades || []).some(function (a) { return !!a.icon; });
    return propios ? ' con-propios' : '';
  }

  function amenidadesRestoHtml(amenidades, buscadas) {
    if (!amenidades || !amenidades.length) return '';
    var pedidas = buscadas || [];
    var resto = amenidades.filter(function (a) {
      return !(a.clave && pedidas.indexOf(a.clave) > -1);
    });
    // Si nada coincidió (o no se pidió nada), el pliego muestra el catálogo
    // completo — ninguna amenidad se pierde por falta de match.
    if (!resto.length) resto = amenidades;

    var items = resto.map(function (a) { return amenidadItem(a, false, 0); }).join('');

    return (
      '<div class="gdf-detalle-amenidades">' +
      '<div class="gdf-detalle-amenidades-titulo">Todo lo que incluye este proyecto</div>' +
      '<div class="gdf-project-amenities' + marcaEnCuadricula(amenidades) + '">' + items + '</div>' +
      '</div>'
    );
  }

  // Tarjeta de proyecto de la pantalla de selección. Recibe el VIEW-MODEL que
  // arma js/recommender.js, no un proyecto del catálogo: así da igual si la
  // recomendación vino del backend o del motor local. `vm.local` es el proyecto
  // scrapeado equivalente (o null) y es lo que habilita imagen y planos.
  // El rango de área del proyecto: "42 - 65 m²" si publica varias tipologías
  // con metrajes distintos, "50,6 m²" si son todas iguales (o solo hay una),
  // null si no hay ningún dato. `local.tipologias` sale del catálogo del
  // tenant y trae el metraje de cada unidad; cuando no cruzó (ver la nota de
  // `foto` en projectCard) se cae al área única que sí manda siempre el
  // modelo (`vm.area`).
  function rangoArea(vm) {
    var tips = (vm.local && vm.local.tipologias) || [];
    var areas = tips
      .map(function (t) { return t.area; })
      .filter(function (a) { return a; });
    if (areas.length) {
      var min = Math.min.apply(null, areas);
      var max = Math.max.apply(null, areas);
      return min === max
        ? numeroEs(min) + ' m²'
        : numeroEs(min) + ' - ' + numeroEs(max) + ' m²';
    }
    return vm.area ? numeroEs(vm.area) + ' m²' : null;
  }

  function projectCard(vm, state, i) {
    var local = vm.local || {};
    var sim = window.GDF.simulador;

    // DE DONDE SALE LA FOTO, en dos intentos.
    //
    // `vm.local` es el proyecto del catálogo del tenant cruzado por nombre, y
    // casi nunca acierta: el modelo recomienda sobre las cuatro constructoras a
    // la vez y el tenant es una sola. Por eso el que de verdad manda es
    // `vm.imagenes[0]`, la portada que resuelve el servicio buscando la carpeta
    // `imagenes_proyectos/<id_proyecto>/`. Sin ella las seis tarjetas saldrían
    // con el degradado y un emoji.
    var foto = local.image || (vm.imagenes || [])[0] || '';
    // El degradado va DEBAJO de la foto, y solo si existe. Ojo con la coma: la
    // version anterior escribia "url(...) center/cover no-repeat, " + grad, y
    // cuando `grad` venia vacio quedaba una coma colgando. Eso es CSS invalido,
    // asi que el navegador tiraba la declaracion ENTERA y la tarjeta salia sin
    // foto — sin error de consola, solo un hueco. Antes no se notaba porque
    // solo habia foto si habia `local`, y entonces tambien habia `grad`.
    // `--fondo-sin-foto` deja a una marca cambiar ese degradado por un color
    // liso (Machea lo hace en styles.css); sin la variable, el de siempre.
    var fondo = local.grad || 'var(--fondo-sin-foto, linear-gradient(135deg,var(--marca),var(--marca-medio)))';
    var headerStyle = foto
      ? "background:url('" + foto + "') center/cover no-repeat, " + fondo
      : 'background:' + fondo;
    var emojiHtml = foto ? '' : '<span class="emoji">' + ic('edificio') + '</span>';

    // El modelo puntúa (compatibilidad); si algún día no lo mandara, se muestra
    // la posición en vez de un "% match" inventado.
    var badge =
      vm.score != null
        ? '<span class="gdf-project-badge"><span class="gdf-match-cifra" data-hasta="' + vm.score + '">' + vm.score + '</span>% match</span>'
        : '<span class="gdf-project-badge">#' + (i + 1) + '</span>';

    var habLabel = etiquetaHabitaciones(vm.habitaciones);
    // Apto para subsidio es una propiedad del INMUEBLE (VIS y bajo el techo de
    // valor), así que el badge se muestra siempre que el proyecto califique. El
    // monto, en cambio, depende del hogar: solo se añade si sus ingresos están
    // dentro del escalón. Sin esa distinción prometería plata a quien no la
    // puede recibir.
    var montoSubsidio = sim.subsidioEstimado(state.answers.ingresos);
    // LLAMATIVO A PROPÓSITO, y separado del precio: es la razón por la que
    // este proyecto puede costarle menos al usuario de lo que dice la
    // etiqueta de arriba, y esa es información que decide una compra — no
    // puede quedar mezclada entre habitaciones y baños como una etiqueta más.
    var subsidioHtml = sim.aptoParaSubsidio(vm.vis, vm.precioCop)
      ? '<div class="gdf-project-subsidio">' + ic('subsidio') + ' Apto para subsidio' +
        (montoSubsidio ? '<span class="monto">hasta ' + esc(sim.pesos(montoSubsidio)) + '</span>' : '') +
        '</div>'
      : '';

    // DATOS QUE LA CONSTRUCTORA NO PUBLICA. El modelo los nombra en
    // `datos_no_publicados` justamente para que no se pinten como un 0: "0 m²"
    // o "0 habitaciones" se leen como un dato, y son la ausencia de uno.
    var noPub = vm.noPublicados || [];
    function sinDato(campo) {
      return noPub.indexOf(campo) > -1;
    }
    function tagNoInformado(que) {
      return '<span class="gdf-project-tag no-informado">' + esc(que) + ' no informado</span>';
    }

    // EL PRECIO ES LO PRIMERO QUE SE LEE, así que sale de la fila de etiquetas
    // y se pinta grande y en el color de marca — ver `.gdf-project-precio`.
    // Sin precio publicado se queda como una etiqueta chica: un hueco enorme
    // donde debería ir el número más buscado se lee peor que una etiqueta gris.
    var precioHtml = vm.precioCop
      ? '<div class="gdf-project-precio">Desde <strong>' + esc(sim.pesos(vm.precioCop)) + '</strong></div>'
      : '<div class="gdf-project-tags">' + tagNoInformado('Precio') + '</div>';

    // Habitaciones, baños y área VAN ABAJO, como especificaciones — el precio
    // ya no vive acá. El área puede ser un rango: `rangoArea` mira todas las
    // tipologías publicadas, no solo la primera.
    var areaTexto = rangoArea(vm);
    var especificaciones =
      (habLabel ? '<span class="gdf-project-tag">' + habLabel + '</span>'
        : sinDato('habitaciones') ? tagNoInformado('Habitaciones') : '') +
      (local.banos ? '<span class="gdf-project-tag">' + local.banos + (local.banos === 1 ? ' baño' : ' baños') + '</span>' : '') +
      (areaTexto ? '<span class="gdf-project-tag">' + esc(areaTexto) + '</span>'
        : sinDato('area_construida_m2') ? tagNoInformado('Área') : '');

    // Entró relajando el requisito de habitaciones: conviene avisarlo, o el
    // usuario ve un 2 alcobas cuando pidió 3 y parece que no lo escuchamos.
    var avisoHab = vm.cumpleHabitaciones === false
      ? '<div class="gdf-project-aviso">Tiene menos habitaciones de las que pediste</div>'
      : '';

    // LA TARJETA NO SE ELIGE: se actúa sobre ella. Las dos salidas van en
    // todas las tarjetas desde el principio, justo debajo de las
    // especificaciones, sin un paso previo de "marcar" el proyecto.
    //   - Llamar: `llamarProyecto` deja ese proyecto como el elegido y pasa a
    //     la pantalla de cierre, que dispara la llamada de Manuela (ver
    //     dispatch en main.js).
    //   - WhatsApp: enlace directo a wa.me con el mensaje ya escrito.
    return (
      '<div class="gdf-project-card">' +
      '<div class="gdf-project-header" style="' + headerStyle + '">' +
      emojiHtml +
      badge +
      '</div>' +
      '<div class="gdf-project-body">' +
      '<div class="gdf-project-name">' + esc(vm.nombre) + '</div>' +
      precioHtml +
      subsidioHtml +
      // DOS LINEAS, no una. Arriba localidad y barrio, que es lo que el
      // usuario acaba de elegir en el mapa y lo que le deja reconocer cual de
      // sus zonas es esta. Debajo la direccion exacta, en tono mas bajo:
      // interesa cuando ya decidio mirar el proyecto, no antes.
      (vm.ubicacion ? '<div class="gdf-project-loc">' + ic('ubicacion') + ' ' + esc(vm.ubicacion) + '</div>' : '') +
      direccionHtml(vm.direccion) +
      '<div class="gdf-project-tags">' + especificaciones + '</div>' +
      avisoHab +
      // Por qué quedó en esta posición. Lo arma js/recommender.js con los
      // mismos criterios del scoring, para que el % del badge no sea un número
      // que aparece sin explicación.
      razonHtml(vm.razon) +
      amenidadesCoincidenHtml(vm.amenidades, state.answers.entorno_deseado) +
      // LAS ACCIONES AL PIE (T9): primero se entiende el proyecto, después se
      // actúa. `margin-top: auto` en CSS las alinea entre tarjetas de distinto
      // alto. El detalle (planos y todo lo que incluye) va debajo porque se
      // despliega y empujaría los botones fuera de vista.
      accionesContacto(vm, state) +
      detalleProyecto(vm, state) +
      '</div>' +
      '</div>'
    );
  }

  /**
   * La dirección exacta de la tarjeta. Algunas fichas la publican con
   * "(Dirección provisional)" pegado al texto: se quita el paréntesis y se
   * dice con una etiqueta aparte, que se lee ordenada y sigue siendo honesta.
   */
  var RE_DIR_PROVISIONAL = /\s*\(\s*direcci[oó]n provisional\s*\)\s*/i;
  function direccionHtml(direccion) {
    if (!direccion) return '';
    var provisional = RE_DIR_PROVISIONAL.test(direccion);
    var limpia = String(direccion).replace(RE_DIR_PROVISIONAL, ' ').replace(/\s+,/g, ',').replace(/\s{2,}/g, ' ').trim();
    return (
      '<div class="gdf-project-dir">' + esc(limpia) +
      (provisional ? ' <span class="gdf-dir-confirmar">Dirección por confirmar</span>' : '') +
      '</div>'
    );
  }

  /**
   * La razón del match: encabezado por puesto, máximo tres motivos con su
   * etiqueta y, aparte, lo que no encaja (ver razonDeMatch en recommender.js).
   */
  function razonHtml(r) {
    if (!r || (!r.puntos.length && !r.considerar)) return '';
    return (
      '<div class="gdf-project-razon">' +
      (r.titulo ? '<div class="gdf-razon-titulo">' + esc(r.titulo) + '</div>' : '') +
      (r.puntos.length
        ? '<ul class="gdf-razon-lista">' +
          r.puntos.map(function (p) {
            return '<li>' + ic('check') + '<span><b>' + esc(p.etiqueta) + ':</b> ' + esc(p.texto) + '</span></li>';
          }).join('') +
          '</ul>'
        : '') +
      (r.considerar
        ? '<p class="gdf-razon-considerar"><b>A considerar:</b> ' + esc(r.considerar) + '</p>'
        : '') +
      '</div>'
    );
  }

  // El número de WhatsApp sale de la configuración (`WHATSAPP_NUMERO` en
  // js/config.js, en formato internacional sin "+"). Sin número, wa.me abre
  // WhatsApp con el mensaje listo para que la persona elija a quién mandarlo.
  function accionesContacto(vm, state) {
    var numero = String((window.GDF_CONFIG && window.GDF_CONFIG.WHATSAPP_NUMERO) || '').replace(/\D/g, '');
    var quien = (state.nombre || '').trim();
    var mensaje =
      'Hola, me interesa el proyecto ' + vm.nombre +
      (vm.ubicacion ? ' (' + vm.ubicacion + ')' : '') +
      '. Vengo de Machea' + (quien ? ', mi nombre es ' + quien : '') + '.';
    var url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensaje);
    return (
      '<div class="gdf-project-acciones">' +
      // La principal dispara la llamada de Manuela (ver dispatch en main.js);
      // la secundaria es un enlace. El peso visual dice esa diferencia.
      '<button class="gdf-btn-primary enabled gdf-project-llamar" data-action="llamarProyecto" data-value="' + esc(vm.id) + '">' +
      ic('telefono') + 'Hablar con un asesor</button>' +
      '<a class="gdf-project-whatsapp" data-action="whatsapp" href="' + esc(url) + '" target="_blank" rel="noopener">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.6-.4zM12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2z"/></svg>' +
      'Escribir por WhatsApp</a>' +
      '</div>'
    );
  }

  // ---------------------------------------------------------------------
  // Desplegable de planos (reemplaza al viejo enlace "Ver ficha oficial"
  // suelto en la tarjeta).
  //
  // Todo lo interactivo de acá adentro va con data-action propio; el
  // <details> lleva data-action="noop" para que un clic dentro no despache
  // ninguna acción del estado (applyAction devuelve false para 'noop', así
  // que tampoco re-renderiza y el <details> abre y cierra solo).
  // ---------------------------------------------------------------------

  function numeroEs(v) {
    // 50.6 -> "50,6"  ·  46 -> "46"
    if (v == null) return '—';
    return String(v).replace('.', ',');
  }

  function metrica(rotulo, valor) {
    return '<div class="gdf-tipo-metrica"><span>' + esc(rotulo) + '</span><strong>' + esc(valor) + '</strong></div>';
  }

  /**
   * Los planos de una tipología que DE VERDAD publica la constructora.
   *
   * Deja fuera las plantas dibujadas por nosotros (ver `dibujar_planos.py`).
   * La tipología sigue apuntando a ellas porque es lo que hace que planta.js
   * sepa cuántas alcobas tiene lo que la escena está armando; lo que se filtra
   * es lo que se PINTA en la tarjeta del proyecto.
   */
  function planosReales(t) {
    return ((t && t.planos) || []).filter(function (pl) { return !pl.inventado; });
  }

  function planosStrip(t) {
    // LAS PLANTAS DIBUJADAS NO SALEN AQUI, y la diferencia es lo que separa la
    // escena de la tarjeta. La escena es ANONIMA —nunca dice de que proyecto es
    // el apartamento que se arma— asi que una planta dibujada por nosotros vale
    // ahi. La tarjeta NO: dice "el plano DE ESTE proyecto", con su enlace para
    // ampliarlo, y ensenar ahi un dibujo nuestro seria atribuirle a Amarilo una
    // planta que no ha publicado.
    //
    // La tipologia sigue apuntando al dibujo porque es lo que hace que
    // `habitacionesDe` en planta.js sepa cuantas alcobas tiene lo que la escena
    // esta armando. Lo que se filtra es lo que se PINTA.
    var reales = planosReales(t);
    if (!reales.length) return '';
    var total = reales.length;
    var laminas = reales
      .map(function (pl, i) {
        // Abre el archivo original en otra pestaña: es el equivalente al
        // botón "Ampliar" de la ficha real, sin montar un visor propio.
        var contador = total > 1
          ? '<span class="gdf-plano-num">' + (i + 1) + ' / ' + total + '</span>'
          : '';
        return (
          '<a class="gdf-plano" href="' + esc(pl.src) + '" target="_blank" rel="noopener">' +
          '<span class="gdf-plano-lienzo">' +
          '<img src="' + esc(pl.src) + '" alt="' + esc(pl.alt || pl.desc || 'Plano') + '" loading="lazy" />' +
          contador +
          '<span class="gdf-plano-zoom">Ampliar ⤢</span>' +
          '</span>' +
          (pl.desc ? '<span class="gdf-plano-desc">' + esc(pl.desc) + '</span>' : '') +
          '</a>'
        );
      })
      .join('');
    // FLECHAS, no solo "desliza". Cada lámina es un <a> que abre la imagen a
    // tamaño completo, así que arrastrarla inicia un arrastre de enlace en vez
    // de mover la tira; y la barra de desplazamiento va oculta a propósito.
    // Con un ratón sin rueda horizontal no había forma de llegar al plano 2.
    var flechas = total > 1
      ? '<button class="gdf-plano-flecha ant" type="button" data-action="planoMover" ' +
        'data-value="ant" aria-label="Plano anterior">‹</button>' +
        '<button class="gdf-plano-flecha sig" type="button" data-action="planoMover" ' +
        'data-value="sig" aria-label="Plano siguiente">›</button>'
      : '';
    return (
      '<div class="gdf-planos">' +
      '<div class="gdf-planos-caja">' +
      '<div class="gdf-planos-strip">' + laminas + '</div>' + flechas +
      '</div>' +
      (total > 1
        ? '<div class="gdf-planos-pista">' + total + ' planos publicados — usa las flechas</div>'
        : '') +
      '</div>'
    );
  }

  // Recorrido virtual 360° (Matterport, Bolívar360, Shape...): viene de
  // tools/scrape_proyectos.py (`extraer_recorridos_360`), es un link externo
  // real de la ficha, no algo montado por la app. Mismo `<a target="_blank">`
  // que `planosStrip`, en su propio botón para que se note que es interactivo
  // y no una imagen más.
  function tour360Html(url, etiqueta) {
    if (!url) return '';
    return (
      '<a class="gdf-tour360" href="' + esc(url) + '" target="_blank" rel="noopener">' +
      '<span class="gdf-tour360-icon">' + ic('brujula') + '</span>' +
      '<span class="gdf-tour360-texto">' + esc(etiqueta) + '</span>' +
      '<span class="gdf-tour360-flecha">' + ic('enlace-externo') + '</span>' +
      '</a>'
    );
  }

  function espaciosGrid(t) {
    if (!t.espacios || !t.espacios.length) return '';
    var items = t.espacios
      .map(function (e) {
        var dib = (window.GDF.iconos && window.GDF.iconos.icono(e.label)) || '';
        var ico = e.icon
          ? '<img src="' + esc(e.icon) + '" alt="" loading="lazy" />'
          : dib || '<span class="gdf-espacio-punto">•</span>';
        return '<div class="gdf-espacio">' + ico + '<span>' + esc(e.label) + '</span></div>';
      })
      .join('');
    return (
      '<div class="gdf-tipo-subtitulo">Esta tipología cuenta con:</div>' +
      '<div class="gdf-espacios">' + items + '</div>'
    );
  }

  function tipologiaPanel(vm, t, idx, activo, state) {
    // NI EL PRECIO NI EL ÁREA CONSTRUIDA SE REPITEN AQUÍ. El precio ya va
    // grande en la cabecera de la tarjeta (`.gdf-project-precio`) y el área
    // construida es lo que nombra la pestaña de la tipología ("Apto 48m²"):
    // volver a ponerlos al fondo del pliego era decir dos veces lo mismo. Lo
    // único que la pestaña no dice es el área privada.
    var metricas = t.areaPrivada
      ? '<div class="gdf-tipo-metricas">' +
        metrica('Área privada', numeroEs(t.areaPrivada) + ' m²') +
        '</div>'
      : '';

    return (
      '<div class="gdf-tipo-panel' + (activo ? ' active' : '') + '" data-panel="' + idx + '">' +
      planosStrip(t) +
      tour360Html(t.tour360, 'Recorrido virtual 360° de este apartamento') +
      metricas +
      espaciosGrid(t) +
      '</div>'
    );
  }

  function detalleProyecto(vm, state) {
    var local = vm.local || {};
    var tips = local.tipologias || [];
    var abierto = !!state.detalleAbierto[vm.id];
    // Igual que la foto: si el proyecto no cruzó con el catálogo del tenant,
    // la ficha oficial la trae el propio modelo en `url_ficha`.
    var urlFicha = local.url || vm.fichaUrl || '';
    var fichaHtml = urlFicha
      ? '<a class="gdf-project-ficha" href="' + esc(urlFicha) + '" target="_blank" rel="noopener">' +
        // El texto viene del tenant con su propia flecha al final (marca.js es
        // generado y no se edita): se le quita y se pone el icono.
        String(txt('fichaOficial', 'Ver ficha oficial en ' + ident('dominio', 'colsubsidio.com')))
          .replace(/\s*\u2197\s*$/, '') + ' ' + ic('enlace-externo') +
        '</a>'
      : '';
    // Recorrido del EDIFICIO (zonas comunes, fachada...), distinto del que
    // pueda traer cada tipología (ese es de un apartamento puntual). Los dos
    // pueden coexistir y no se excluyen.
    // EL DEL PROYECTO SOLO SI ES OTRO. Cuando una ficha publica un unico
    // recorrido, se lo lleva la tipologia que le cuadra por metraje y ademas
    // quedaba como recorrido "del proyecto": dos botones, el mismo enlace,
    // uno encima del otro. Se compara la URL, no la posicion.
    var toursDeTipologias = tips.map(function (t) { return t.tour360 || ''; });
    var tour360ProyectoHtml = (local.tour360 && toursDeTipologias.indexOf(local.tour360) === -1)
      ? tour360Html(local.tour360, 'Recorrido virtual 360° del proyecto')
      : '';
    // El pliego: amenidades que NO quedaron arriba en "Tiene lo que buscas"
    // (o el catálogo completo, si nada coincidió) — ver amenidadesRestoHtml.
    var restoAmenidadesHtml = amenidadesRestoHtml(vm.amenidades, state.answers.entorno_deseado);

    // Dos motivos distintos para no tener planos, y conviene no confundirlos:
    //   - el proyecto SÍ está en nuestro catálogo pero su ficha no publica
    //     tipologías (20 de los 66);
    //   - el proyecto viene del catálogo del backend y no lo tenemos scrapeado,
    //     así que no hay de dónde sacar los planos.
    if (!tips.length) {
      var motivo = vm.local
        ? 'Este proyecto todavía no publica planos por tipología en su ficha oficial.'
        : txt(
            'sinPlanos',
            'Aún no tenemos los planos de este proyecto: no está en el catálogo que bajamos de ' +
              ident('dominio', 'colsubsidio.com') +
              '.'
          );
      return (
        '<details class="gdf-project-detalle"' + (abierto ? ' open' : '') + ' data-action="noop" data-proyecto="' + esc(vm.id) + '">' +
        '<summary><span class="gdf-detalle-titulo">Ver todo lo que incluye</span>' +
        '<span class="gdf-detalle-chevron">' + ic('chevron-abajo') + '</span></summary>' +
        '<div class="gdf-detalle-body">' +
        restoAmenidadesHtml +
          '<p class="gdf-detalle-vacio">' + motivo + '</p>' +
        tour360ProyectoHtml +
        fichaHtml +
        '</div>' +
        '</details>'
      );
    }

    var activa = state.tipologiaActiva[vm.id] || 0;
    if (activa >= tips.length) activa = 0;

    // Con hasta 11 tipologías (Nuva Park) la fila scrollea; el envoltorio le
    // pone un degradado al borde derecho para que se note que hay más.
    var tabsHtml =
      tips.length > 1
        ? '<div class="gdf-tipo-tabs-wrap">' +
          '<div class="gdf-tipo-tabs" role="tablist">' +
          tips
            .map(function (t, idx) {
              return (
                '<button class="gdf-tipo-tab' + (idx === activa ? ' active' : '') + '"' +
                ' data-action="verTipologia" data-proyecto="' + esc(vm.id) + '" data-idx="' + idx + '">' +
                esc(t.nombre) + '</button>'
              );
            })
            .join('') +
          '</div></div>'
        : '<div class="gdf-tipo-unica">' + esc(tips[0].nombre) + '</div>';

    var panelesHtml = tips
      .map(function (t, idx) {
        return tipologiaPanel(vm, t, idx, idx === activa, state);
      })
      .join('');

    var grupo = tips[0].grupo ? esc(tips[0].grupo.toLowerCase()) : 'tipologías';
    // El rótulo NO puede prometer un plano que luego no se pinta. Con una sola
    // tipología decía "el plano" siempre, y en los tres proyectos de Amarilo
    // que llevan una planta dibujada el desplegable se abría sin ninguna.
    var hayPlano = tips.some(function (t) { return planosReales(t).length; });
    var resumen =
      'Ver todo lo que incluye' +
      (tips.length === 1
        ? (hayPlano ? ', el plano' : '')
        : ', ' + tips.length + ' ' + grupo);

    return (
      '<details class="gdf-project-detalle"' + (abierto ? ' open' : '') + ' data-action="noop" data-proyecto="' + esc(vm.id) + '">' +
      '<summary><span class="gdf-detalle-titulo">' + esc(resumen) + '</span>' +
      '<span class="gdf-detalle-chevron">' + ic('chevron-abajo') + '</span></summary>' +
      '<div class="gdf-detalle-body">' +
      restoAmenidadesHtml +
      tabsHtml +
      panelesHtml +
      tour360ProyectoHtml +
      fichaHtml +
      '</div>' +
      '</details>'
    );
  }

  // Panel de depuración: se activa poniendo #debug en la URL. Sirve para ver
  // POR QUÉ el motor ordenó así, y para comparar contra el clustering cuando
  // se conecte. No se muestra nunca en el flujo normal.
  function debugPanel(state) {
    if (typeof location === 'undefined' || location.hash.indexOf('debug') === -1) return '';
    var reco = state.reco;
    var filas = reco.items
      .map(function (vm, i) {
        // Solo el motor local explica su puntaje. El backend manda match_score
        // sin desglose, así que se dice eso en vez de fingir factores.
        var detalle = (vm.factores || []).length
          ? '<ul>' +
            vm.factores
              .slice()
              .sort(function (a, b) {
                return Math.abs(b.puntos) - Math.abs(a.puntos);
              })
              .map(function (f) {
                return (
                  '<li class="' + (f.puntos >= 0 ? 'pos' : 'neg') + '">' +
                  '<b>' + (f.puntos > 0 ? '+' : '') + f.puntos + '</b> ' + esc(f.motivo) +
                  '</li>'
                );
              })
              .join('') +
            '</ul>'
          : '<ul><li>El backend no desglosa su match_score.</li>' +
            (vm.local ? '' : '<li class="neg">Sin equivalente en el catálogo local: no hay planos.</li>') +
            '</ul>';
        return (
          '<div class="gdf-debug-row">' +
          '<div class="gdf-debug-head">#' + (i + 1) + ' ' + esc(vm.nombre) +
          // Se muestran los dos: el que ve el usuario (podio fijo 96/94/89) y
          // el que salió de la fórmula. Si solo se mostrara el primero, el
          // desglose de factores de abajo parecería no cuadrar.
          ' <span>' + (vm.score != null ? vm.score + '%' : 'sin puntaje') +
          (vm.scoreReal != null && vm.scoreReal !== vm.score ? ' <em>(real ' + vm.scoreReal + '%)</em>' : '') +
          '</span></div>' +
          detalle +
          '</div>'
        );
      })
      .join('');

    var cruzados = reco.items.filter(function (vm) {
      return !!vm.local;
    }).length;

    return (
      '<div class="gdf-debug">' +
      '<div class="gdf-debug-title">' + ic('buscar') + ' Depuración del motor de recomendación</div>' +
      '<div class="gdf-debug-meta">' +
      'origen: <b>' + esc(reco.items[0] ? reco.items[0].origen : '—') +
      (reco.aproximado ? ' (aproximado)' : '') + '</b>' +
      (reco.origenCatalogo ? ' · catálogo: <b>' + esc(reco.origenCatalogo) + '</b>' : '') +
      (reco.totalCatalogo ? ' (' + reco.totalCatalogo + ')' : '') +
      (reco.leadId ? ' · lead: <b>' + esc(reco.leadId) + '</b>' : '') +
      ' · cruzados con el catálogo local: <b>' + cruzados + '/' + reco.items.length + '</b>' +
      '</div>' +
      filas +
      '</div>'
    );
  }

  // "Qué sigue": el trámite real que le espera al lead, no solo un mensaje de
  // gracias. El paso 2 cambia de redacción según cómo quedó calificado
  // (`lead.status`, de qualification.js): a uno "ready" se le promete una
  // llamada de agendamiento; a uno "nurture" se le explica que primero hay
  // una conversación de acompañamiento — mentir con el mismo texto para los
  // dos casos sería lo contrario de auténtico.
  function pasosSiguientesHtml(lead) {
    var paso2 =
      lead.status === 'ready'
        ? 'Te llama para agendar la visita y resolver dudas de financiación.'
        : 'Te llama primero para acompañarte con información — sin apuro a cerrar.';
    var pasos = [
      { t: 'Revisamos tu perfil', d: 'Afiliación, capacidad de compra y el proyecto que elegiste.' },
      { t: 'Un asesor te contacta', d: paso2 },
      { t: 'Agendamos tu visita', d: 'Conoces el proyecto en sitio y resuelves todo en persona.' },
    ];
    var itemsHtml = pasos
      .map(function (p, i) {
        return (
          '<div class="gdf-paso">' +
          '<div class="gdf-paso-num">' + (i + 1) + '</div>' +
          '<div class="gdf-paso-texto"><b>' + esc(p.t) + '</b><span>' + esc(p.d) + '</span></div>' +
          '</div>'
        );
      })
      .join('');
    return '<div class="gdf-confirm-pasos"><h3>Qué sigue</h3>' + itemsHtml + '</div>';
  }

  // Paso 3: resumen de la llamada apenas Manuela cuelga — temperatura del
  // lead, resumen de 2-3 frases y una recomendación concreta para el asesor.
  // Viene del análisis post-llamada de Dapta (ver /webhooks/dapta/resultado
  // en api.py); main.js hace el polling y solo llama a esto una vez con
  // 'esperando' y otra vez con 'listo' (o 'agotado' si nunca llegó).
  //
  // NO ES LO MISMO QUE gdf-lead-badge. Ese bloque (más abajo en esta pantalla)
  // es la calificación con la que YA se contaba al elegir el proyecto —
  // 'ready'/'nurture' calculados en vivo por qualification.js sobre las
  // respuestas del quiz, antes de que Manuela llame a nadie. Este es el
  // veredicto de DESPUÉS de la llamada real, con lo que la persona dijo de
  // verdad. Los dos pueden decir cosas distintas — es información, no un bug.
  var TEMPERATURA = {
    caliente: { icono: 'temp-caliente', label: 'Caliente', clase: 'gdf-temp--caliente' },
    tibio: { icono: 'temp-tibio', label: 'Tibio', clase: 'gdf-temp--tibio' },
    frio: { icono: 'temp-frio', label: 'Frío', clase: 'gdf-temp--frio' },
  };

  function resumenLlamadaHtml(resumen) {
    if (resumen.estado === 'esperando') {
      return (
        '<div class="gdf-confirm-resumen gdf-confirm-resumen--esperando">' +
        ic('microfono') + ' Manuela está en la llamada. El resumen aparecerá aquí cuando termine.' +
        '</div>'
      );
    }
    if (resumen.estado === 'agotado') {
      return (
        '<div class="gdf-confirm-resumen gdf-confirm-resumen--agotado">' +
        'La llamada se alargó más de lo esperado y todavía no llega el resumen. ' +
        '<button class="gdf-llamada-reintentar" data-action="reintentarResumen">Buscar resumen</button>' +
        '</div>'
      );
    }
    if (resumen.estado !== 'listo' || !resumen.datos) return '';

    var d = resumen.datos;
    var temp = TEMPERATURA[d.temperatura_lead] || null;
    var tempHtml = temp
      ? '<span class="gdf-temp-badge ' + temp.clase + '">' + ic(temp.icono) + ' ' + esc(temp.label) + '</span>'
      : '';

    var filas = '';
    if (d.resumen_llamada) {
      filas += '<p class="gdf-confirm-resumen-texto">' + esc(d.resumen_llamada) + '</p>';
    }
    if (d.recomendacion_asesor) {
      filas +=
        '<p class="gdf-confirm-resumen-reco"><strong>Para el asesor:</strong> ' +
        esc(d.recomendacion_asesor) + '</p>';
    }

    // Chips secundarios: solo los que Manuela sí pudo determinar. Un booleano
    // ausente (null, porque no salió en la conversación) no se pinta como
    // "No" — se omite, que es honesto con lo que de verdad se sabe.
    var chips = [];
    if (d.presupuesto_confirmado === true) chips.push(ic('presupuesto') + ' Presupuesto confirmado');
    if (d.tomador_de_decision === true) chips.push(ic('decisor') + ' Toma la decisión');
    if (d.nivel_de_urgencia) {
      chips.push(ic('reloj') + ' Urgencia ' + (d.nivel_de_urgencia === 'high' ? 'alta' : d.nivel_de_urgencia === 'medium' ? 'media' : 'baja'));
    }
    if (d.fecha_de_seguimiento) chips.push(ic('calendario') + ' Seguimiento: ' + esc(d.fecha_de_seguimiento));
    var chipsHtmlResumen = chips.length
      ? '<div class="gdf-confirm-resumen-chips">' +
        chips.map(function (c) { return '<span class="gdf-chip">' + c + '</span>'; }).join('') +
        '</div>'
      : '';

    return (
      '<div class="gdf-confirm-resumen gdf-confirm-resumen--listo">' +
      '<div class="gdf-confirm-resumen-cabecera"><h3>Resumen de la llamada</h3>' + tempHtml + '</div>' +
      filas +
      chipsHtmlResumen +
      '</div>'
    );
  }

  // Cierre del flujo. Elegir el proyecto y tocar "Llamar" YA es la
  // confirmación: acá no se pide otra acción para lograr lo que el usuario ya
  // pidió. Solo se cierra y se dice qué sigue.
  /**
   * El cierre de Arriendo. Bifurca ANTES de `confirmacion()` por lo mismo que
   * `resultadoArriendo`: esa pantalla se apoya en `state.lead` (que Arriendo
   * no calcula, ver `avanzarQuiz`) y en la constructora y el subsidio del
   * proyecto, que en un arriendo no existen.
   *
   * Lo que sí es idéntico es el relato de la llamada: los mismos tres estados
   * de `state.llamada` que pinta Compra, porque es el mismo POST /api/llamar.
   */
  function confirmacionArriendo(state, derived) {
    var firstName = state.nombre.trim().split(' ')[0];
    var elegido = null;
    (state.arriendo.items || []).forEach(function (item) {
      if (String(item.id_inmueble) === String(state.chosen)) elegido = item;
    });

    var nombreInmueble = elegido ? elegido.nombre : '';
    var foto = ((elegido && elegido.imagenes) || [])[0] || '';
    var canon = elegido && elegido.precio_canon_cop
      ? '$' + Math.round(elegido.precio_canon_cop).toLocaleString('es-CO') + '/mes'
      : '';

    var proyectoHtml = elegido
      ? '<div class="gdf-confirm-proyecto">' +
        (foto ? '<div class="gdf-confirm-foto" style="background-image:url(\'' + esc(foto) + '\')"></div>' : '') +
        '<div class="gdf-confirm-proyecto-info">' +
        '<div class="gdf-confirm-proyecto-nombre">' + esc(nombreInmueble) + '</div>' +
        (elegido.localidad_nombre
          ? '<div class="gdf-confirm-proyecto-loc">' + ic('ubicacion') + ' ' + esc(elegido.localidad_nombre) + '</div>' : '') +
        (canon
          ? '<div class="gdf-confirm-proyecto-precio">Arriendo ' + esc(canon) +
            (elegido.area_m2 ? ' · ' + esc(elegido.area_m2) + ' m²' : '') + '</div>' : '') +
        '</div></div>'
      : '';

    var chipsHtml = derived.perfilChips
      .map(function (c) {
        return '<span class="gdf-chip' + (c.hi ? ' hi' : '') + '">' + esc(c.text) + '</span>';
      })
      .join('');

    // Los mismos tres estados y textos que la confirmación de Compra (T10).
    var llamada = state.llamada;
    var extra = '';
    if (llamada.estado === 'cargando') {
      extra = '<div class="gdf-confirm-llamada gdf-confirm-llamada--cargando">' + ic('senal') +
        ' Conectando con Manuela, nuestra asistente. Puede tardar unos segundos.</div>';
    } else if (llamada.estado === 'lista') {
      extra = '<div class="gdf-confirm-llamada gdf-confirm-llamada--ok">' + ic('telefono') + ' ' + esc(llamada.mensaje) + '</div>';
    } else if (llamada.estado === 'error') {
      extra = '<div class="gdf-confirm-llamada gdf-confirm-llamada--error">' + ic('alerta') + ' ' + esc(llamada.mensaje) +
        ' <button class="gdf-llamada-reintentar" data-action="reintentarLlamada">Reintentar</button></div>';
    }

    var contactoHtml =
      '<div class="gdf-confirm-contacto">' +
      '<div class="gdf-confirm-contacto-avatar">' + ic('telefono') + '</div>' +
      '<div class="gdf-confirm-contacto-info">' +
      '<div class="gdf-confirm-contacto-titulo">Te contactamos por llamada</div>' +
      '<div class="gdf-confirm-contacto-tel">' + esc(state.telefono.trim()) + '</div>' +
      '</div></div>';

    // Mismo orden que Compra: lo que pasa, por dónde te contactamos, el
    // resumen de la llamada cuando llegue, el inmueble y tu perfil. Sin el
    // bloque de calificación del lead, que Arriendo no calcula.
    return (
      '<div class="gdf-screen gdf-confirmacion">' +
      '<div class="gdf-confirm-hero gdf-confirm-hero--ok">' +
      '<div class="gdf-confirm-icon"><span class="gdf-confirm-check">' + ic('check') + '</span></div>' +
      '<h2>¡Gracias por tu interés' + (firstName ? ', ' + esc(firstName) : '') + '!</h2>' +
      '<p>Te interesa <strong>' + esc(nombreInmueble) + '</strong>. Te llamamos para confirmar ' +
      'disponibilidad y coordinar la visita.</p>' +
      extra +
      '</div>' +
      contactoHtml +
      resumenLlamadaHtml(state.resumen) +
      proyectoHtml +
      '<div class="gdf-confirm-bloque">' +
      '<h3>Tu perfil</h3>' +
      '<div class="gdf-chips">' + chipsHtml + '</div>' +
      '</div>' +
      '<button class="gdf-back-btn" data-action="goSeleccion">' + ic('flecha-izquierda') + ' Cambiar mi selección</button>' +
      '<button class="gdf-restart-btn" data-action="restart">' + ic('reiniciar') + ' Empezar de nuevo</button>' +
      '</div>'
    );
  }

  function confirmacion(state, derived) {
    if (state.answers.operacion === 'arriendo') return confirmacionArriendo(state, derived);
    var lead = state.lead;
    var firstName = state.nombre.trim().split(' ')[0];

    var sim = window.GDF.simulador;
    var elegido = null;
    state.reco.items.forEach(function (vm) {
      if (vm.id === state.chosen) elegido = vm;
    });
    var nombreProyecto = elegido ? elegido.nombre : state.chosen || '';
    var local = (elegido && elegido.local) || {};
    // Mismo respaldo que en la tarjeta: la portada que resolvió el servicio.
    var fotoCierre = local.image || ((elegido && elegido.imagenes) || [])[0] || '';
    // Quien acompaña es la constructora DEL PROYECTO. Decir la del tenant
    // mandaba a un asesor de Amarilo a atender un proyecto de Bolívar.
    var duenaProyecto = ((elegido && elegido.constructoras) || [])[0] || '';
    // El catálogo identifica a las constructoras por un slug en minúscula
    // ('bolivar'). Capitalizar a secas daría "Bolivar", sin tilde y sin el
    // "Constructora" que va en su nombre.
    var NOMBRE_CONSTRUCTORA = {
      amarilo: 'Amarilo',
      bolivar: 'Constructora Bolívar',
      colsubsidio: 'Colsubsidio',
      cusezar: 'Cusezar',
    };
    function bonita(s) {
      if (!s) return '';
      return NOMBRE_CONSTRUCTORA[s] || (s.charAt(0).toUpperCase() + s.slice(1));
    }

    var proyectoHtml =
      '<div class="gdf-confirm-proyecto">' +
      (fotoCierre ? '<div class="gdf-confirm-foto" style="background-image:url(\'' + esc(fotoCierre) + '\')"></div>' : '') +
      '<div class="gdf-confirm-proyecto-info">' +
      '<div class="gdf-confirm-proyecto-nombre">' + esc(nombreProyecto) + '</div>' +
      (elegido && elegido.ubicacion ? '<div class="gdf-confirm-proyecto-loc">' + ic('ubicacion') + ' ' + esc(elegido.ubicacion) + '</div>' : '') +
      (elegido
        ? '<div class="gdf-confirm-proyecto-precio">Desde ' + esc(sim.pesos(elegido.precioCop)) +
          (elegido.area ? ' · ' + elegido.area + ' m²' : '') + '</div>'
        : '') +
      '</div>' +
      '</div>';

    var chipsHtml = derived.perfilChips
      .map(function (c) {
        return '<span class="gdf-chip' + (c.hi ? ' hi' : '') + '">' + esc(c.text) + '</span>';
      })
      .join('');

    var notesHtml = lead.notes
      .filter(notaVisible)
      .map(function (n) {
        return '<span class="gdf-lead-note">' + esc(n) + '</span>';
      })
      .join('');

    var leadTitle = lead.status === 'ready' ? 'Tu perfil está listo para un asesor' : 'Seguimos afinando tu búsqueda';
    var leadSub =
      lead.status === 'ready'
        ? 'Con lo que nos contaste, un asesor ya puede ayudarte.'
        : 'Te acompañamos con información y seguimiento mientras defines tu compra.';
    var leadBloqueHtml =
      '<div class="gdf-lead-badge ' + lead.status + '">' +
      '<span class="icon">' + ic(lead.icon) + '</span>' +
      '<div class="title">' + leadTitle + '</div>' +
      '<div class="subcopy">' + leadSub + '</div>' +
      '<div class="gdf-lead-notes">' + notesHtml + '</div>' +
      '</div>';

    var telefono = esc(state.telefono.trim());
    var heroClase, heroIcono, heroTitulo, heroTexto, extra;

    // Tarjeta de contacto: el detalle "auténtico" es nombrar el CANAL real
    // (una llamada, no un genérico "te contactamos") y el número exacto al
    // que le va a sonar el teléfono.
    var contactoHtml =
      '<div class="gdf-confirm-contacto">' +
      '<div class="gdf-confirm-contacto-avatar">' + ic('telefono') + '</div>' +
      '<div class="gdf-confirm-contacto-info">' +
      '<div class="gdf-confirm-contacto-titulo">Te contactamos por llamada</div>' +
      '<div class="gdf-confirm-contacto-tel">' + telefono + '</div>' +
      '</div>' +
      '</div>';

    // ESTA VEZ SÍ HAY UN ENVÍO QUE RELATAR: al entrar a esta pantalla,
    // main.js dispara POST /api/llamar (ver js/llamada.js) — la llamada real
    // de Manuela, no el POST /leads del backend viejo que este comentario
    // describía antes. Los tres estados vuelven, pero para esto:
    //   cargando -> "Conectando con Manuela" mientras el POST está en vuelo.
    //   lista    -> el mensaje que mandó el backend (enviado o mock).
    //   error    -> qué falló, con botón para reintentar sin perder nada.
    var llamada = state.llamada;
    var heroClase = 'gdf-confirm-hero--ok';
    var heroIcono = '<span class="gdf-confirm-check">' + ic('check') + '</span>';
    var heroTitulo = '¡Gracias por tu interés' + (firstName ? ', ' + esc(firstName) : '') + '!';
    var heroTexto =
      'Elegiste <strong>' + esc(nombreProyecto) + '</strong>. Un asesor de vivienda de ' +
      esc(bonita(duenaProyecto) || nombreMarca()) + ' te acompaña desde acá.';
    var extra = '';

    if (llamada.estado === 'cargando') {
      extra = '<div class="gdf-confirm-llamada gdf-confirm-llamada--cargando">' + ic('senal') +
        ' Conectando con Manuela, nuestra asistente. Puede tardar unos segundos.</div>';
    } else if (llamada.estado === 'lista') {
      extra = '<div class="gdf-confirm-llamada gdf-confirm-llamada--ok">' + ic('telefono') + ' ' + esc(llamada.mensaje) + '</div>';
    } else if (llamada.estado === 'error') {
      extra = '<div class="gdf-confirm-llamada gdf-confirm-llamada--error">' + ic('alerta') + ' ' + esc(llamada.mensaje) +
        ' <button class="gdf-llamada-reintentar" data-action="reintentarLlamada">Reintentar</button></div>';
    }

    // Paso 3: resumen post-llamada (ver js/llamada.js + main.js, que hacen el
    // polling de /api/llamar/resultado). Solo tiene sentido mostrarlo cuando
    // la llamada fue real — 'resumen' se queda en 'idle' en modo mock.
    var resumenHtml = resumenLlamadaHtml(state.resumen);

    // heroTitulo/heroTexto ya llevan cualquier dato dinámico pasado por esc()
    // en el punto en que se armaron arriba; el resto es texto fijo del propio
    // código. Se insertan tal cual, sin volver a escapar.
    return (
      '<div class="gdf-screen gdf-confirmacion">' +
      '<div class="gdf-confirm-hero ' + heroClase + '">' +
      '<div class="gdf-confirm-icon">' + heroIcono + '</div>' +
      '<h2>' + heroTitulo + '</h2>' +
      '<p>' + heroTexto + '</p>' +
      extra +
      '</div>' +
      (heroClase === 'gdf-confirm-hero--ok' ? contactoHtml + resumenHtml + pasosSiguientesHtml(lead) : '') +
      proyectoHtml +
      (heroClase === 'gdf-confirm-hero--ok' ? leadBloqueHtml : '') +
      '<div class="gdf-confirm-bloque">' +
      '<h3>Tu perfil</h3>' +
      '<div class="gdf-chips">' + chipsHtml + '</div>' +
      '</div>' +
      '<button class="gdf-back-btn" data-action="goSeleccion">' + ic('flecha-izquierda') + ' Cambiar mi selección</button>' +
      '<button class="gdf-restart-btn" data-action="restart">' + ic('reiniciar') + ' Empezar de nuevo</button>' +
      '</div>'
    );
  }

  /**
   * Visor de fotos a pantalla completa. Se pinta por ENCIMA de la pantalla
   * que haya, no en lugar de ella: `state.screen` no cambia, así que al
   * cerrarlo la lista sigue en la misma página y con el mismo pliego abierto.
   *
   * EL FONDO ES LA MISMA FOTO, ampliada y desenfocada. Un velo negro plano
   * funciona, pero deja la foto flotando en el vacío; con el desenfoque
   * detrás, el color de la propia imagen llena la pantalla y el inmueble se
   * sigue leyendo aunque la foto sea vertical y ocupe media pantalla.
   */
  function visorFotos(state) {
    var v = state.visor;
    if (!v) return '';
    var url = v.fotos[v.i];
    var varias = v.fotos.length > 1;
    var flecha = function (paso, clase, signo, etiqueta) {
      return (
        '<button class="gdf-visor-flecha ' + clase + '" data-action="visorMover" data-paso="' + paso +
        '" aria-label="' + etiqueta + '">' + signo + '</button>'
      );
    };
    return (
      // El clic en el fondo cierra; el marco de adentro lleva `noop` para que
      // tocar la foto o las flechas no lo cierre por burbujeo.
      '<div class="gdf-visor" data-action="cerrarVisor">' +
      '<div class="gdf-visor-fondo" style="background-image:url(\'' + esc(url) + '\')"></div>' +
      '<button class="gdf-visor-cerrar" data-action="cerrarVisor" aria-label="Cerrar">' + ic('cerrar', { tam: 18 }) + '</button>' +
      '<div class="gdf-visor-marco" data-action="noop">' +
      (varias ? flecha('-1', 'izq', ic('flecha-izquierda', { tam: 22 }), 'Foto anterior') : '') +
      '<img class="gdf-visor-foto" src="' + esc(url) + '" alt="' +
      esc(v.nombre || 'Foto del inmueble') + ' — foto ' + (v.i + 1) + '">' +
      (varias ? flecha('1', 'der', ic('flecha-derecha', { tam: 22 }), 'Foto siguiente') : '') +
      '</div>' +
      '<div class="gdf-visor-pie" data-action="noop">' +
      (v.nombre ? '<span class="gdf-visor-nombre">' + esc(v.nombre) + '</span>' : '') +
      '<span class="gdf-visor-contador">' + (v.i + 1) + ' / ' + v.fotos.length + '</span>' +
      '</div>' +
      '</div>'
    );
  }

  function renderApp(state, derived) {
    var screenHtml;
    switch (state.screen) {
      case 'splash':
        screenHtml = splash();
        break;
      case 'escarapela':
        screenHtml = escarapela(state);
        break;
      case 'quiz':
        screenHtml = quiz(state, derived);
        break;
      case 'result':
        screenHtml = result(state, derived);
        break;
      case 'confirmacion':
        screenHtml = confirmacion(state, derived);
        break;
      default:
        // Incluye el 'landing' de la portada borrada: si algo dejo ese valor
        // guardado, se entra por el splash en vez de a una pantalla en blanco.
        screenHtml = splash();
    }
    // `data-embed` cuelga del shell y no del <body> porque es este nodo el
    // que lleva el grid de dos columnas del media query de 900px: la regla que
    // invierte la escena y el panel tiene que poder leerlo en el mismo
    // elemento sobre el que aplica.
    return (
      '<div class="gdf-shell"' + (window.GDF_EMBED ? ' data-embed' : '') + '>' + screenHtml + '</div>' +
      visorFotos(state)
    );
  }

  window.GDF = window.GDF || {};
  window.GDF.templates = {
    renderApp: renderApp,
    esc: esc,
    // Las que usa main.js para actualizar el quiz sin re-render completo:
    // `quizPanel` repinta la pregunta (la escena no se toca), `cuartoHtml`
    // inserta las piezas del plano que acaban de caer y `haloAmenidadesHtml`
    // rehace las zonas comunes de la última pregunta.
    quizPanel: quizPanel,
    // main.js la usa para repintar la línea de confirmación de 'zona' cada
    // vez que se toca el mapa o se elige un barrio, sin re-render.
    zonaEco: zonaEco,
    cuartoHtml: cuartoHtml,
    siluetaHtml: siluetaHtml,
    haloAmenidadesHtml: haloAmenidadesHtml,
  };
})();
