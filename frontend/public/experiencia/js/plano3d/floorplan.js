/* Ensambla el FloorPlan que consume el render, a partir de las respuestas.
   Es el puente entre la mitad "logica" (perfil + zonificacion + muros) y la
   mitad "geometria", y el unico sitio que conoce las dos. */
(function () {
  'use strict';

  // Acabado de piso por zona. Los banos van en ceramica aunque su zona sea
  // privada, que es como se resuelve en obra.
  function acabado(r) {
    if (r.zona === 'humeda') return 'tile';
    if (r.id.indexOf('bano') === 0) return 'tile';
    return 'wood';
  }

  /* Mobiliario por ambiente. Las posiciones son fracciones del rectangulo, no
     metros, para que un mismo ambiente amueble igual de bien en un VIS apretado
     que en un No VIS amplio. */
  function amoblar(r, perfil) {
    var rect = r.rect, out = [];
    var x = rect.x, z = rect.z, w = rect.w, d = rect.d;
    // fx/fz: fraccion del ancho y del fondo -> metros absolutos
    var P = function (fx, fz) { return [x + w * fx, z + d * fz]; };
    var n = 0;
    var HOLGURA = 0.04;   // no pegar al muro: se ve como si lo atravesara

    /* Encaja la pieza dentro del ambiente en vez de confiar en la fraccion.
       Colocar por fracciones es comodo pero no comprueba nada: con un tamano
       fijo, en un ambiente chico la pieza se desborda y aparece atravesando el
       muro. Aqui se encoge lo que no quepa y se corre el centro lo justo. */
    var poner = function (kind, pos, size, rot) {
      var giro = ((rot || 0) % 180 + 180) % 180;
      // A 90 grados el ancho declarado pasa a medir en Z y el fondo en X.
      var ex = giro === 90 ? size[1] : size[0];
      var ez = giro === 90 ? size[0] : size[1];
      ex = Math.min(ex, w - HOLGURA * 2);
      ez = Math.min(ez, d - HOLGURA * 2);

      var cx = Math.min(Math.max(pos[0], x + ex / 2 + HOLGURA), x + w - ex / 2 - HOLGURA);
      var cz = Math.min(Math.max(pos[1], z + ez / 2 + HOLGURA), z + d - ez / 2 - HOLGURA);

      out.push({
        id: r.id + '-' + kind + (++n), kind: kind,
        position: [cx, cz],
        size: giro === 90 ? [ez, ex] : [ex, ez],
        rotation: rot || 0
      });
    };
    var horizontal = w >= d;

    switch (true) {
      case r.id === 'sala':
        poner('rug', P(0.5, 0.5), [w * 0.6, d * 0.5]);
        poner('sofa', P(0.5, 0.18), [Math.min(2.1, w * 0.7), 0.85]);
        poner('table', P(0.5, 0.52), [Math.min(1.0, w * 0.35), 0.6]);
        // Los extras salen del tramo de ingresos: es lo unico que esa pregunta
        // mueve en la escena.
        if (perfil.extrasSala.indexOf('mesaAuxiliar') >= 0) poner('table', P(0.12, 0.2), [0.45, 0.45]);
        if (perfil.extrasSala.indexOf('bar') >= 0) poner('counter', P(0.85, 0.75), [Math.min(1.3, w * 0.4), 0.5], 0);
        if (perfil.extrasSala.indexOf('piano') >= 0) poner('counter', P(0.2, 0.8), [1.4, 0.7], 0);
        break;

      case r.id === 'comedor':
        poner('table', P(0.5, 0.5), [Math.min(1.5, w * 0.6), Math.min(0.95, d * 0.5)]);
        poner('chair', P(0.28, 0.5), [0.45, 0.45], 90);
        poner('chair', P(0.72, 0.5), [0.45, 0.45], -90);
        poner('chair', P(0.5, 0.22), [0.45, 0.45]);
        poner('chair', P(0.5, 0.78), [0.45, 0.45], 180);
        break;

      case r.id === 'flexible':
        if (perfil.esJoven) {
          poner('desk', P(0.5, 0.15), [Math.min(1.4, w * 0.7), 0.6]);
          poner('chair', P(0.5, 0.35), [0.45, 0.45], 180);
        } else {
          poner('sofa', P(0.5, 0.25), [Math.min(1.8, w * 0.7), 0.8]);
          poner('rug', P(0.5, 0.6), [w * 0.6, d * 0.4]);
        }
        break;

      case r.id === 'cocina':
        poner('counter', horizontal ? P(0.5, 0.12) : P(0.12, 0.5),
          horizontal ? [w * 0.85, 0.6] : [0.6, d * 0.85], 0);
        poner('stove', horizontal ? P(0.22, 0.12) : P(0.12, 0.22),
          horizontal ? [0.6, 0.6] : [0.6, 0.6], 0);
        poner('fridge', horizontal ? P(0.85, 0.75) : P(0.75, 0.85), [0.7, 0.7]);
        break;

      case r.id === 'ropas':
        poner('counter', P(0.5, 0.4), [Math.min(1.1, w * 0.8), Math.min(0.6, d * 0.6)]);
        break;

      case r.id.indexOf('bano') === 0:
        poner('toilet', P(0.25, 0.75), [0.45, 0.6], 0);
        poner('sink', P(0.25, 0.18), [0.6, 0.45]);
        poner('shower', P(0.75, 0.6), [Math.min(0.9, w * 0.45), Math.min(0.9, d * 0.45)]);
        break;

      case r.id.indexOf('alcoba') === 0:
        var principal = r.id === 'alcoba1';
        var camaW = principal ? 1.6 : 1.0;
        poner('bed', P(0.45, 0.45), [Math.min(camaW, w * 0.7), Math.min(2.0, d * 0.75)]);
        // Sin rotar: `size` ya se da en [extension X, extension Z]. Rotarlo 90
        // grados sin intercambiar las medidas metia el lado largo a traves del
        // muro y el closet salia del edificio.
        poner('wardrobe', P(0.86, 0.5), [Math.min(0.6, w * 0.22), Math.min(1.8, d * 0.6)]);
        if (principal) poner('rug', P(0.45, 0.85), [w * 0.5, d * 0.18]);
        break;
    }
    return out;
  }

  function construirPlan(answers, paso, opts) {
    var perfil = window.GDF3D.perfilDesdeRespuestas(answers, paso);
    var zon = window.GDF3D.zonificar(perfil);
    var md = window.GDF3D.derivarMuros(zon, opts);

    var rooms = zon.rects.map(function (r) {
      var q = r.rect;
      return {
        id: r.id,
        name: r.nombre,
        zona: r.zona,
        floor: acabado(r),
        // En sentido horario: el generador de geometria triangula el poligono
        // tal cual, sin reordenarlo.
        polygon: [[q.x, q.z], [q.x + q.w, q.z], [q.x + q.w, q.z + q.d], [q.x, q.z + q.d]]
      };
    });

    var furniture = [];
    zon.rects.forEach(function (r) {
      if (r.zona === 'circulacion') return;
      furniture = furniture.concat(amoblar(r, perfil));
    });

    return {
      // La zonificacion ya trabaja en metros, asi que no hay conversion: el
      // `scale` existe para los planos que vienen de una imagen.
      scale: 1,
      walls: md.walls,
      openings: md.openings,
      rooms: rooms,
      furniture: furniture,
      // Util para la ficha y para depurar; el render lo ignora.
      meta: {
        ancho: zon.pl.w, fondo: zon.pl.d,
        area: zon.pl.w * zon.pl.d,
        alcobas: perfil.nAlcobas, banos: perfil.nBanos,
        vis: perfil.vis, paso: perfil.paso
      }
    };
  }

  window.GDF3D = window.GDF3D || {};
  window.GDF3D.construirPlan = construirPlan;
})();
