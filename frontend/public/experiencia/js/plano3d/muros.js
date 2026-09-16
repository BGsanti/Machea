/* Deriva muros y aberturas de los rectangulos que devuelve la zonificacion.
   Es el trabajo real del puerto: en la maqueta de agosto esta logica no existia
   como datos, estaba entretejida con la creacion de meshes (2268-2347).

   Coordenadas en metros, en el mismo sistema que la zonificacion: X a lo ancho
   de la planta, Z en profundidad. Coinciden con el par [x, y] del FloorPlan,
   cuya segunda componente el render mapea a Z. */
(function () {
  'use strict';

  var POR_DEFECTO = {
    // 2.2 m es lo que quedo afinado en el prototipo: por debajo las ventanas
    // asoman por encima del muro. La maqueta de agosto usaba 1.1 m a proposito,
    // para poder mirar dentro desde arriba — vale reconsiderarlo en un panel de
    // 250 px, donde muros altos tapan el interior.
    alturaMuro: 2.2,
    alturaCascara: 2.2,
    grosorCascara: 0.25,
    grosorTabique: 0.12,
    anchoPuerta: 0.9,
    // El vano nunca deja menos de esto de muro a cada lado.
    holguraPuerta: 0.85,
    anchoVentana: 1.4,
    alfeizar: 0.85,
    altoVentana: 1.1
  };

  var EPS = 0.04;   // tolerancia de contacto entre bordes, en metros

  function cerca(a, b, tol) { return Math.abs(a - b) < (tol || EPS); }

  // Los cuatro lados de un rectangulo, como segmentos con su normal saliente.
  function lados(rect) {
    var x = rect.x, z = rect.z, w = rect.w, d = rect.d;
    return {
      n: { a: [x, z], b: [x + w, z], horiz: true, fuera: [0, -1] },
      s: { a: [x, z + d], b: [x + w, z + d], horiz: true, fuera: [0, 1] },
      o: { a: [x, z], b: [x, z + d], horiz: false, fuera: [-1, 0] },
      e: { a: [x + w, z], b: [x + w, z + d], horiz: false, fuera: [1, 0] }
    };
  }

  function largo(seg) { return Math.hypot(seg.b[0] - seg.a[0], seg.b[1] - seg.a[1]); }

  /* Lado del ambiente que da a una zona de circulacion, para que la puerta abra
     ahi y no contra otra habitacion. Puerto de `ladoHaciaCirculacion` (2137). */
  function ladoHaciaCirculacion(rect, zonas, permitidos) {
    for (var i = 0; i < (zonas || []).length; i++) {
      var q = zonas[i].rect;
      var solX = Math.min(rect.x + rect.w, q.x + q.w) - Math.max(rect.x, q.x) > 0.5;
      var solZ = Math.min(rect.z + rect.d, q.z + q.d) - Math.max(rect.z, q.z) > 0.5;
      if (permitidos.indexOf('o') >= 0 && cerca(rect.x, q.x + q.w) && solZ) return 'o';
      if (permitidos.indexOf('e') >= 0 && cerca(rect.x + rect.w, q.x) && solZ) return 'e';
      if (permitidos.indexOf('n') >= 0 && cerca(rect.z, q.z + q.d) && solX) return 'n';
      if (permitidos.indexOf('s') >= 0 && cerca(rect.z + rect.d, q.z) && solX) return 's';
    }
    return null;
  }

  /* Hacia que lado del muro queda el interior del ambiente, para que la hoja no
     barra hacia el pasillo ni, peor, hacia fuera del edificio.

     El signo esta invertido respecto del producto cruz a proposito: el render
     gira la hoja con `rotation.y = anguloMuro + giro * APERTURA` sobre una
     bisagra desplazada `-giro * ancho/2`, y con esa combinacion el sentido
     positivo barre hacia el lado NEGATIVO del cruz. Verificado en vista cenital:
     con el signo directo, la puerta de entrada quedaba colgando fuera. */
  function sentidoGiro(seg, centroAmbiente) {
    var dx = seg.b[0] - seg.a[0], dz = seg.b[1] - seg.a[1];
    var mx = (seg.a[0] + seg.b[0]) / 2, mz = (seg.a[1] + seg.b[1]) / 2;
    var cruz = dx * (centroAmbiente[1] - mz) - dz * (centroAmbiente[0] - mx);
    return cruz >= 0 ? -1 : 1;
  }

  function enPerimetro(seg, pl) {
    var hw = pl.w / 2, hd = pl.d / 2;
    if (seg.horiz) return cerca(seg.a[1], -hd, 0.01) || cerca(seg.a[1], hd, 0.01);
    return cerca(seg.a[0], -hw, 0.01) || cerca(seg.a[0], hw, 0.01);
  }

  function derivarMuros(zon, opts) {
    var o = Object.assign({}, POR_DEFECTO, opts || {});
    var pl = zon.pl;
    var walls = [], openings = [];
    var nOp = 0;

    function muro(id, a, b, grosor, altura) {
      walls.push({
        id: id, start: [a[0], a[1]], end: [b[0], b[1]],
        thickness: grosor, height: altura
      });
      return walls[walls.length - 1];
    }

    /* --- Cascara perimetral --- */
    var hw = pl.w / 2, hd = pl.d / 2;
    var perim = {
      n: muro('p-n', [-hw, -hd], [hw, -hd], o.grosorCascara, o.alturaCascara),
      e: muro('p-e', [hw, -hd], [hw, hd], o.grosorCascara, o.alturaCascara),
      s: muro('p-s', [hw, hd], [-hw, hd], o.grosorCascara, o.alturaCascara),
      o: muro('p-o', [-hw, hd], [-hw, -hd], o.grosorCascara, o.alturaCascara)
    };

    /* Ventanas: una por ambiente habitable que toque el perimetro, centrada en
       SU tramo y no en el muro entero — un muro perimetral suele bordear varios
       ambientes, y una sola ventana al medio dejaria habitaciones a oscuras. */
    zon.rects.forEach(function (r) {
      if (r.zona === 'circulacion') return;
      var L = lados(r.rect);
      ['n', 's', 'o', 'e'].forEach(function (k) {
        var seg = L[k];
        if (!enPerimetro(seg, pl)) return;
        var pared = perim[k];
        if (!pared) return;
        var ancho = Math.min(o.anchoVentana, largo(seg) - 0.9);
        if (ancho < 0.7) return;

        // Posicion del centro del tramo, normalizada sobre el muro perimetral.
        var pl0 = [pared.start[0], pared.start[1]], pl1 = [pared.end[0], pared.end[1]];
        var lp = Math.hypot(pl1[0] - pl0[0], pl1[1] - pl0[1]);
        var cx = (seg.a[0] + seg.b[0]) / 2, cz = (seg.a[1] + seg.b[1]) / 2;
        var t = ((cx - pl0[0]) * (pl1[0] - pl0[0]) + (cz - pl0[1]) * (pl1[1] - pl0[1])) / (lp * lp);
        if (t <= 0.02 || t >= 0.98) return;

        openings.push({
          id: 'v' + (++nOp), wallId: pared.id, type: 'window',
          offset: t, width: ancho, sill: o.alfeizar, height: o.altoVentana
        });
      });
    });

    /* Puerta de entrada: sobre el muro perimetral que toca la circulacion, para
       que se entre al vestibulo y no directamente a una alcoba. */
    var acceso = zon.corredores.filter(function (c) { return c.id === 'vestibulo'; })[0] ||
      zon.corredores[0] ||
      zon.rects.filter(function (r) { return r.zona === 'social'; })[0];
    if (acceso) {
      var ladoEnt = ladoHaciaCirculacion(
        { x: -hw, z: -hd, w: pl.w, d: pl.d }, [acceso], ['n', 's', 'o', 'e']
      );
      var paredEnt = perim[ladoEnt || 's'];
      openings.push({
        id: 'd-entrada', wallId: paredEnt.id, type: 'door',
        offset: 0.5, width: o.anchoPuerta,
        /* Hacia el centro de la planta. Fijarlo a mano dejaba la hoja girando
           hacia afuera, colgada en el aire fuera del edificio. */
        swing: sentidoGiro(
          { a: paredEnt.start, b: paredEnt.end }, [0, 0]
        )
      });
    }

    /* --- Tabiques interiores ---
       Solo los emiten los ambientes cerrados. La zona social y la circulacion no
       aportan muros propios: quedan delimitadas por los tabiques de sus vecinos
       y por la cascara. Si tambien los emitieran, cada medianera se construiria
       dos veces. */
    /* Se recogen primero como candidatos y se fusionan al final. Emitirlos
       directamente dejaba tabiques que se pisan a medias: la banda humeda y la
       columna privada comparten plano, pero sus ambientes no arrancan ni
       terminan a la misma altura, asi que cada uno describia un tramo distinto
       de la misma medianera. La clave canonica solo caza el duplicado exacto. */
    var candidatos = [], puertas = [];

    zon.rects.forEach(function (r) {
      if (r.zona === 'social' || r.zona === 'circulacion') return;
      var rect = r.rect, L = lados(rect);
      var centro = [rect.x + rect.w / 2, rect.z + rect.d / 2];

      var libres = ['n', 's', 'o', 'e'].filter(function (k) { return !enPerimetro(L[k], pl); });
      if (!libres.length) return;

      // Un lado solo sirve de puerta si le queda muro a ambos costados del vano.
      var cabe = function (k) { return largo(L[k]) - o.holguraPuerta >= 0.7; };
      var utiles = libres.filter(cabe);

      /* Preferencias de por donde se entra, de mejor a peor. Se filtran por las
         que de verdad admiten un vano: elegir el lado "correcto" y descubrir
         despues que mide 1.2 m deja el ambiente sin puerta, que es peor que
         entrar por un lado menos natural. */
      var ladoPuerta = null;
      if (r.id === 'banoPriv') {
        // El bano principal abre desde la alcoba principal, este donde este.
        var a1 = zon.completo.filter(function (q) { return q.id === 'alcoba1'; })[0];
        if (a1) ladoPuerta = ladoHaciaCirculacion(rect, [a1], utiles);
      }
      if (!ladoPuerta) ladoPuerta = ladoHaciaCirculacion(rect, zon.corredores, utiles);
      if (!ladoPuerta) ladoPuerta = ladoHaciaCirculacion(rect, zon.zonasAcceso, utiles);
      if (!ladoPuerta) {
        // Sin vecino claro, al lado mas largo: el que mejor tolera perder 90 cm.
        ladoPuerta = utiles.slice().sort(function (a, b) {
          return largo(L[b]) - largo(L[a]);
        })[0] || null;
      }

      libres.forEach(function (k) {
        var seg = L[k];
        var horiz = seg.horiz;
        var fija = horiz ? seg.a[1] : seg.a[0];
        var p0 = horiz ? seg.a[0] : seg.a[1];
        var p1 = horiz ? seg.b[0] : seg.b[1];
        candidatos.push({ horiz: horiz, fija: fija, a: Math.min(p0, p1), b: Math.max(p0, p1) });

        if (k !== ladoPuerta) return;
        puertas.push({
          horiz: horiz, fija: fija, centro: (p0 + p1) / 2,
          ancho: Math.min(o.anchoPuerta, largo(seg) - o.holguraPuerta),
          swing: sentidoGiro(seg, centro), ambiente: r.id
        });
      });
    });

    /* Fusion por linea: se unen los tramos que se tocan o se solapan, y queda
       un solo muro continuo por tramo real. */
    var lineas = {};
    candidatos.forEach(function (c) {
      var clave = (c.horiz ? 'h' : 'v') + '@' + c.fija.toFixed(2);
      (lineas[clave] = lineas[clave] || { horiz: c.horiz, fija: c.fija, tramos: [] }).tramos.push(c);
    });

    var nMuro = 0;
    Object.keys(lineas).forEach(function (clave) {
      var linea = lineas[clave];
      var tramos = linea.tramos.slice().sort(function (p, q) { return p.a - q.a; });
      var fusion = [];
      tramos.forEach(function (t) {
        var ultimo = fusion[fusion.length - 1];
        if (ultimo && t.a <= ultimo.b + 0.01) ultimo.b = Math.max(ultimo.b, t.b);
        else fusion.push({ a: t.a, b: t.b });
      });
      fusion.forEach(function (f) {
        var id = 't' + (++nMuro);
        var a = linea.horiz ? [f.a, linea.fija] : [linea.fija, f.a];
        var b = linea.horiz ? [f.b, linea.fija] : [linea.fija, f.b];
        muro(id, a, b, o.grosorTabique, o.alturaMuro);
        f.id = id;
      });
      linea.fusion = fusion;
    });

    // Cada puerta se cuelga del tramo fusionado que la contiene, recalculando
    // su posicion relativa: el muro final es mas largo que el que la pidio.
    puertas.forEach(function (p) {
      var linea = lineas[(p.horiz ? 'h' : 'v') + '@' + p.fija.toFixed(2)];
      if (!linea) return;
      var f = linea.fusion.filter(function (q) {
        return p.centro >= q.a - 0.01 && p.centro <= q.b + 0.01;
      })[0];
      if (!f) return;
      var L = f.b - f.a;
      if (L <= 0) return;
      openings.push({
        id: 'd' + (++nOp), wallId: f.id, type: 'door', ambiente: p.ambiente,
        offset: (p.centro - f.a) / L, width: p.ancho, swing: p.swing
      });
    });

    return { walls: walls, openings: openings };
  }

  window.GDF3D = window.GDF3D || {};
  window.GDF3D.derivarMuros = derivarMuros;
  window.GDF3D.MUROS_POR_DEFECTO = POR_DEFECTO;
})();
