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

  /* Los muebles se separan del borde del ambiente MEDIO MURO mas un poco: el
     muro esta centrado en ese borde (fachada 0.25, tabique 0.12). Con 4 cm
     todo lo arrimado se metia en la pared, y junto a una ventana el respaldo
     del sofa asomaba por el vano. */
  var HOLGURA = 0.14;

  /* Rotacion que deja la ESPALDA de la pieza (su -Z local: respaldo, cabecero,
     tanque) contra ese muro, de frente al ambiente. El render gira con
     `rotation.y = -grados`, asi que la espalda apunta a (sen g, -cos g). */
  var ESPALDA = { n: 0, s: 180, o: -90, e: 90 };
  var OPUESTO = { n: 's', s: 'n', o: 'e', e: 'o' };
  var LADOS = ['n', 's', 'o', 'e'];

  // Rectangulo que ocupa la pieza en planta, girada a cualquier angulo.
  function huella(f) {
    var a = (f.rotation || 0) * Math.PI / 180;
    var c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
    var ex = f.size[0] * c + f.size[1] * s, ez = f.size[0] * s + f.size[1] * c;
    return {
      x0: f.position[0] - ex / 2, x1: f.position[0] + ex / 2,
      z0: f.position[1] - ez / 2, z1: f.position[1] + ez / 2, ex: ex, ez: ez
    };
  }

  function solape(a, b) {
    var ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    var oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    return ox > 0 && oz > 0 ? ox * oz : 0;
  }

  function choca(a, b) {
    return Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0.05 &&
      Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 0.05;
  }

  /* Mobiliario por ambiente. Cada pieza de pared se apoya contra un muro
     concreto (`pared`), no en una fraccion suelta del rectangulo: asi queda
     de espaldas al muro y de frente al ambiente, y `acomodar` puede moverla a
     otro muro sin dejarla mirando la pared. */
  function amoblar(r, perfil, vetados) {
    var rect = r.rect, out = [];
    var x = rect.x, z = rect.z, w = rect.w, d = rect.d;
    var n = 0;
    var veto = function (k) { return (vetados || []).indexOf(k) >= 0; };
    var largo = function (k) { return k === 'n' || k === 's' ? w : d; };
    var fondo = function (k) { return k === 'n' || k === 's' ? d : w; };

    /* Encaja la pieza dentro del ambiente en vez de confiar en la posicion
       pedida: se encoge lo que no quepa y se corre el centro lo justo. `size`
       es la medida LOCAL de la pieza [ancho, fondo], antes de girar. */
    var poner = function (kind, pos, size, rot, extra) {
      var f = { id: r.id + '-' + kind + (++n), kind: kind, position: pos, size: size.slice(), rotation: rot || 0 };
      var h = huella(f);
      var kx = Math.min(1, (w - HOLGURA * 2) / h.ex), kz = Math.min(1, (d - HOLGURA * 2) / h.ez);
      var giro = ((f.rotation % 180) + 180) % 180;
      if (giro === 90) { f.size[1] *= kx; f.size[0] *= kz; } else { f.size[0] *= kx; f.size[1] *= kz; }
      h = huella(f);
      f.position = [
        Math.min(Math.max(pos[0], x + h.ex / 2 + HOLGURA), x + w - h.ex / 2 - HOLGURA),
        Math.min(Math.max(pos[1], z + h.ez / 2 + HOLGURA), z + d - h.ez / 2 - HOLGURA)
      ];
      if (extra) Object.keys(extra).forEach(function (k) { f[k] = extra[k]; });
      out.push(f);
      return f;
    };

    // Centro de una pieza de fondo `prof` apoyada en el muro k, a `t` metros
    // de su inicio (el extremo de menor X o de menor Z).
    var sobre = function (k, t, prof) {
      if (k === 'n') return [x + t, z + HOLGURA + prof / 2];
      if (k === 's') return [x + t, z + d - HOLGURA - prof / 2];
      if (k === 'o') return [x + HOLGURA + prof / 2, z + t];
      return [x + w - HOLGURA - prof / 2, z + t];
    };
    var pared = function (kind, k, frac, ancho, prof, extra) {
      var e = Object.assign({ anclado: true, muro: k }, extra || {});
      return poner(kind, sobre(k, largo(k) * frac, prof), [ancho, prof], ESPALDA[k], e);
    };
    var libres = LADOS.filter(function (k) { return !veto(k); });

    switch (true) {
      case r.id === 'sala': {
        /* Sofa y television en muros OPUESTOS, los largos si se puede. Antes el
           televisor iba al primer muro sin vano, y si ese era el del sofa
           quedaban uno encima del otro. */
        var pares = w >= d ? [['n', 's'], ['s', 'n'], ['o', 'e'], ['e', 'o']] : [['o', 'e'], ['e', 'o'], ['n', 's'], ['s', 'n']];
        var par = pares.filter(function (p) { return !veto(p[0]) && !veto(p[1]); })[0] ||
          pares.filter(function (p) { return !veto(p[0]); })[0] || pares[0];
        var kS = par[0], kT = par[1], L = largo(kS), F = fondo(kS);
        var nsS = kS === 'n' || kS === 's';
        poner('rug', [x + w / 2, z + d / 2], nsS ? [L * 0.6, F * 0.45] : [F * 0.45, L * 0.6]);
        pared('sofa', kS, 0.5, Math.min(2.1, L * 0.7), 0.85);
        pared('console', kT, 0.5, Math.min(1.5, L * 0.45), 0.35);
        // La mesa de centro solo si queda paso a ambos lados.
        var hueco = F - HOLGURA * 2 - 0.85 - 0.35;
        if (hueco >= 0.5 + 0.6) {
          var t = HOLGURA + 0.85 + hueco / 2;
          var cm = kS === 'n' ? [x + w / 2, z + t] : kS === 's' ? [x + w / 2, z + d - t]
            : kS === 'o' ? [x + t, z + d / 2] : [x + w - t, z + d / 2];
          poner('table', cm, [Math.min(1.0, L * 0.35), 0.5], ESPALDA[kS]);
        }
        var laterales = LADOS.filter(function (k) { return k !== kS && k !== kT && !veto(k); });
        var areaSala = w * d;
        if (areaSala > 8.5 && laterales[0]) pared('chair', laterales[0], 0.5, 0.65, 0.65, { opcional: true });
        if (areaSala > 9.8) pared('plant', kS, 0.94, 0.34, 0.34, { opcional: true });
        // Los extras salen del tramo de ingresos: es lo unico que esa pregunta
        // mueve en la escena.
        if (perfil.extrasSala.indexOf('mesaAuxiliar') >= 0) pared('table', kS, 0.06, 0.45, 0.45, { opcional: true });
        if (perfil.extrasSala.indexOf('bar') >= 0) {
          pared('counter', laterales[1] || kT, 0.5, Math.min(1.3, fondo(kS) * 0.45), 0.5, { opcional: true });
        }
        if (perfil.extrasSala.indexOf('piano') >= 0) pared('counter', kT, 0.12, 1.4, 0.7, { opcional: true });
        break;
      }

      case r.id === 'comedor': {
        if (w * d > 9) poner('rug', [x + w / 2, z + d / 2], [w * 0.75, d * 0.7]);
        /* La mesa se dimensiona para que las sillas quepan AFUERA de ella: una
           silla de 0.45 corrida 0.18 del canto, mas el medio muro. Antes iban a
           fracciones fijas y en un comedor angosto quedaban dentro de la mesa,
           con el respaldo atravesando el tablero. */
        var borde = HOLGURA + 0.18 + 0.45;
        var tx = Math.max(0.7, Math.min(w >= d ? 1.5 : 0.95, w - borde * 2));
        var tz = Math.max(0.6, Math.min(w >= d ? 0.95 : 1.5, d - borde * 2));
        var cx = x + w / 2, cz = z + d / 2;
        poner('table', [cx, cz], [tx, tz]);
        // Las de los lados largos siempre; las de las cabeceras, si caben.
        var largoX = tx >= tz;
        poner('chair', [cx, cz - tz / 2 - 0.18], [0.45, 0.45], ESPALDA.n, { opcional: largoX ? false : true });
        poner('chair', [cx, cz + tz / 2 + 0.18], [0.45, 0.45], ESPALDA.s, { opcional: largoX ? false : true });
        poner('chair', [cx - tx / 2 - 0.18, cz], [0.45, 0.45], ESPALDA.o, { opcional: largoX });
        poner('chair', [cx + tx / 2 + 0.18, cz], [0.45, 0.45], ESPALDA.e, { opcional: largoX });
        break;
      }

      /* Nada de sofa aqui: desde que 'flexible' aparece junto a la sala (paso
         2), un segundo sofa con su tapete se leia como dos salas seguidas.
         Estudio o rincon de lectura: piezas que la sala no tiene. */
      case r.id === 'flexible': {
        var kF = libres.filter(function (k) { return (w >= d) === (k === 'n' || k === 's'); })[0] || libres[0] || 'n';
        if (perfil.esJoven) {
          var escritorio = pared('desk', kF, 0.5, Math.min(1.3, largo(kF) * 0.6), 0.6);
          var t2 = HOLGURA + 0.6 + 0.12;
          var pc = kF === 'n' ? [escritorio.position[0], z + t2 + 0.22] : kF === 's' ? [escritorio.position[0], z + d - t2 - 0.22]
            : kF === 'o' ? [x + t2 + 0.22, escritorio.position[1]] : [x + w - t2 - 0.22, escritorio.position[1]];
          // De espaldas al ambiente, mirando el escritorio.
          poner('chair', pc, [0.45, 0.45], ESPALDA[OPUESTO[kF]]);
        } else {
          /* Dos butacas enfrentadas con una mesita entre ellas, a lo largo del
             lado largo. Antes iban a +-45 grados y ambas miraban hacia afuera. */
          poner('rug', [x + w / 2, z + d / 2], [w * 0.55, d * 0.5]);
          if (w >= d) {
            poner('chair', [x + w * 0.3, z + d / 2], [0.6, 0.6], ESPALDA.o);
            poner('chair', [x + w * 0.7, z + d / 2], [0.6, 0.6], ESPALDA.e);
          } else {
            poner('chair', [x + w / 2, z + d * 0.3], [0.6, 0.6], ESPALDA.n);
            poner('chair', [x + w / 2, z + d * 0.7], [0.6, 0.6], ESPALDA.s);
          }
          poner('table', [x + w / 2, z + d / 2], [0.4, 0.4], 0, { opcional: true });
        }
        // Biblioteca baja contra el muro opuesto: es lo que lo hace estudio.
        pared('shelf', OPUESTO[kF], 0.5, Math.min(1.2, largo(kF) * 0.5), 0.35, { opcional: true });
        pared('plant', OPUESTO[kF], 0.92, 0.3, 0.3, { opcional: true });
        break;
      }

      case r.id === 'cocina': {
        /* Una sola linea contra un muro sin vano: nevera en un extremo y el
           meson con la estufa empotrada en el resto. La nevera en otro muro
           chocaba con la punta del meson en las cocinas chicas. */
        var kC = libres.filter(function (k) { return (w >= d) === (k === 'n' || k === 's'); })[0] || libres[0] || 'n';
        var Lu = largo(kC) - HOLGURA * 2;
        if (Lu >= 0.75 + 0.9) {
          var lm = Lu - 0.75;
          pared('counter', kC, (HOLGURA + lm / 2) / largo(kC), lm, 0.6);
          pared('stove', kC, (HOLGURA + 0.4) / largo(kC), 0.6, 0.6, { embebido: true });
          pared('fridge', kC, (HOLGURA + lm + 0.4) / largo(kC), 0.7, 0.7);
        } else {
          pared('counter', kC, 0.5, Lu, 0.6);
          pared('stove', kC, (HOLGURA + 0.4) / largo(kC), 0.6, 0.6, { embebido: true });
          pared('fridge', OPUESTO[kC], 0.8, 0.7, 0.7);
        }
        break;
      }

      case r.id === 'ropas': {
        var kR = libres.filter(function (k) { return (w >= d) === (k === 'n' || k === 's'); })[0] || libres[0] || 'n';
        pared('counter', kR, 0.5, Math.min(1.1, largo(kR) * 0.7), Math.min(0.55, fondo(kR) * 0.5));
        break;
      }

      case r.id.indexOf('bano') === 0: {
        /* Ducha en una esquina cuyos dos muros no tienen vano; sanitario y
           lavamanos en los otros muros. A fracciones fijas se pisaban entre si
           en cualquier bano de menos de 1.8 m. */
        var esquinas = [['n', 'o', 0], ['n', 'e', 90], ['s', 'e', 180], ['s', 'o', -90]];
        var esq = esquinas.filter(function (q) { return !veto(q[0]) && !veto(q[1]); })[0] || esquinas[0];
        var lado = Math.min(0.9, Math.min(w, d) * 0.5);
        var ex0 = esq[1] === 'o' ? x + HOLGURA + lado / 2 : x + w - HOLGURA - lado / 2;
        var ez0 = esq[0] === 'n' ? z + HOLGURA + lado / 2 : z + d - HOLGURA - lado / 2;
        poner('shower', [ex0, ez0], [lado, lado], esq[2]);
        // Los dos muros libres: uno horizontal y uno vertical. Cada pieza va
        // en su tramo mas cercano a la ducha, asi no se juntan en la esquina
        // opuesta. Si el del sanitario tiene vano, se intercambian.
        var kH = OPUESTO[esq[0]], kV = OPUESTO[esq[1]];
        var fracH = esq[1] === 'o' ? 0.3 : 0.7, fracV = esq[0] === 'n' ? 0.3 : 0.7;
        if (veto(kH) && !veto(kV)) {
          pared('toilet', kV, fracV, 0.45, 0.6);
          pared('sink', kH, fracH, 0.6, 0.45);
        } else {
          pared('toilet', kH, fracH, 0.45, 0.6);
          pared('sink', kV, fracV, 0.6, 0.45);
        }
        break;
      }

      case r.id.indexOf('alcoba') === 0: {
        var principal = r.id === 'alcoba1';
        /* Cabecero contra un muro sin vano y closet a los pies. Antes la cama
           iba a una fraccion fija y el closet al primer muro libre: en las
           alcobas angostas quedaba encima de la cama. */
        var kB = libres.filter(function (k) { return largo(k) >= (principal ? 1.6 : 1.0) + 0.5; })[0] || libres[0] || 'n';
        var camaW = Math.min(principal ? 1.6 : 1.0, largo(kB) - HOLGURA * 2 - 0.1);
        var camaL = Math.min(2.0, fondo(kB) - HOLGURA * 2 - 0.55);
        pared('bed', kB, 0.5, camaW, camaL);
        var pies = OPUESTO[kB];
        if (fondo(kB) - HOLGURA * 2 - camaL >= 0.6 + 0.55 && !veto(pies)) {
          pared('wardrobe', pies, 0.5, Math.min(1.8, largo(pies) * 0.6), 0.6);
        } else {
          var lat = LADOS.filter(function (k) { return k !== kB && k !== pies && !veto(k); })[0] || pies;
          // Hacia los pies de la cama, lejos del cabecero.
          var haciaPies = kB === 'n' || kB === 'o' ? 0.8 : 0.2;
          pared('wardrobe', lat, haciaPies, Math.min(1.6, largo(lat) * 0.45), 0.6);
        }
        // Mesas de noche a los lados del cabecero, si caben.
        var mitad = largo(kB) / 2;
        pared('table', kB, (mitad - camaW / 2 - 0.26) / largo(kB), 0.4, 0.4, { opcional: true });
        if (principal) pared('table', kB, (mitad + camaW / 2 + 0.26) / largo(kB), 0.4, 0.4, { opcional: true });
        if (w * d > 10.5) pared('plant', pies, 0.9, 0.32, 0.32, { opcional: true });
        if (principal) poner('rug', [x + w / 2, z + d / 2], [w * 0.5, d * 0.3]);
        break;
      }
    }
    return out;
  }

  /* Franja de paso frente a un vano: por ahi se entra, y ningun mueble puede
     ocuparla. */
  function pasoDe(muro, op) {
    var horiz = Math.abs(muro.end[1] - muro.start[1]) < 1e-6;
    var L = Math.hypot(muro.end[0] - muro.start[0], muro.end[1] - muro.start[1]);
    var t = op.offset * L;
    var cx = horiz ? Math.min(muro.start[0], muro.end[0]) + t : muro.start[0];
    var cz = horiz ? muro.start[1] : Math.min(muro.start[1], muro.end[1]) + t;
    /* Un vano sin hoja solo necesita el paso. La puerta de entrada SI tiene
       hoja, y barre un cuarto de circulo de radio igual a su ancho: con 0.45
       las butacas quedaban dentro del barrido, pegadas a la hoja abierta. */
    var FONDO = op.hoja ? op.width + 0.1 : 0.45;
    return horiz
      ? { x0: cx - op.width / 2, x1: cx + op.width / 2, z0: cz - FONDO, z1: cz + FONDO }
      : { x0: cx - FONDO, x1: cx + FONDO, z0: cz - op.width / 2, z1: cz + op.width / 2 };
  }

  /* Dos piezas pueden compartir planta sin que sea un choque: la alfombra va
     debajo de todo, la estufa va empotrada en el meson, y una silla metida un
     poco bajo su mesa o escritorio es justo como se usa. */
  function compatibles(a, b, area) {
    if (a.kind === 'rug' || b.kind === 'rug') return true;
    if ((a.embebido && b.kind === 'counter') || (b.embebido && a.kind === 'counter')) return true;
    var silla = a.kind === 'chair' ? b : b.kind === 'chair' ? a : null;
    if (silla && (silla.kind === 'table' || silla.kind === 'desk') && area <= 0.07) return true;
    return false;
  }

  /* Ultima pasada por ambiente: ningun mueble choca con otro ni tapa un vano.
     Se respeta el orden en que se pusieron (lo primero es lo esencial). Una
     pieza que estorba se prueba en otras posiciones —las de pared, contra
     cualquier muro y de espaldas a el—, luego mas chica; si es un accesorio y
     aun asi no cabe, se omite. Mejor una planta de menos que una encima de la
     cama. Reemplaza al viejo despeje de vanos, que solo miraba las puertas. */
  function acomodar(piezas, rect, pasos) {
    var hechas = [];
    // Cuanto estorba: tapar un vano es inaceptable; encimarse, se mide.
    var estorbo = function (f) {
      var h = huella(f), puerta = false, area = 0;
      for (var i = 0; i < pasos.length; i++) if (f.kind !== 'rug' && choca(h, pasos[i])) puerta = true;
      for (var j = 0; j < hechas.length; j++) {
        var a = solape(h, huella(hechas[j]));
        if (a > 0.01 && !compatibles(f, hechas[j], a)) area += a;
      }
      return { puerta: puerta, area: area };
    };
    var malo = function (f) { var e = estorbo(f); return e.puerta || e.area > 0; };
    var dentro = function (f, pos) {
      var h = huella({ size: f.size, rotation: f.rotation, position: [0, 0] });
      return [
        Math.min(Math.max(pos[0], rect.x + h.ex / 2 + HOLGURA), rect.x + rect.w - h.ex / 2 - HOLGURA),
        Math.min(Math.max(pos[1], rect.z + h.ez / 2 + HOLGURA), rect.z + rect.d - h.ez / 2 - HOLGURA)
      ];
    };
    var candidatos = function (f) {
      var out = [];
      if (f.anclado) {
        /* Un accesorio solo se corre por SU muro: la mesa auxiliar que no cabe
           junto al sofa, llevada a otra pared, quedaba sola en medio de la
           circulacion. Si ahi no cabe, se omite. */
        var muros = f.opcional && f.muro ? [f.muro] : LADOS;
        muros.forEach(function (k) {
          var L = k === 'n' || k === 's' ? rect.w : rect.d, prof = f.size[1];
          [0.5, 0.25, 0.75, 0.1, 0.9].forEach(function (fr) {
            var t = L * fr, p;
            if (k === 'n') p = [rect.x + t, rect.z + HOLGURA + prof / 2];
            else if (k === 's') p = [rect.x + t, rect.z + rect.d - HOLGURA - prof / 2];
            else if (k === 'o') p = [rect.x + HOLGURA + prof / 2, rect.z + t];
            else p = [rect.x + rect.w - HOLGURA - prof / 2, rect.z + t];
            out.push({ position: p, rotation: ESPALDA[k] });
          });
        });
      } else {
        for (var i = 0; i <= 4; i++) {
          for (var j = 0; j <= 4; j++) {
            out.push({ position: [rect.x + rect.w * (0.1 + i * 0.2), rect.z + rect.d * (0.1 + j * 0.2)], rotation: f.rotation });
          }
        }
      }
      var o = f.position;
      out.forEach(function (c) { c.dist = Math.hypot(c.position[0] - o[0], c.position[1] - o[1]); });
      return out.sort(function (a, b) { return a.dist - b.dist; });
    };

    piezas.forEach(function (f) {
      if (!malo(f)) { hechas.push(f); return; }
      var orig = { position: f.position, size: f.size.slice(), rotation: f.rotation };
      var escalas = [1, 0.8, 0.65], mejor = null;
      for (var e = 0; e < escalas.length; e++) {
        f.size = [orig.size[0] * escalas[e], orig.size[1] * escalas[e]];
        var cs = candidatos(f);
        for (var c = 0; c < cs.length; c++) {
          f.rotation = cs[c].rotation;
          f.position = dentro(f, cs[c].position);
          var est = estorbo(f);
          if (!est.puerta && est.area === 0) { hechas.push(f); return; }
          if (!est.puerta && (!mejor || est.area < mejor.area)) {
            mejor = { area: est.area, position: f.position, size: f.size.slice(), rotation: f.rotation };
          }
        }
      }
      if (f.opcional) return;
      /* Esencial y sin lugar del todo libre (un bano de 1.5 m no admite
         sanitario, lavamanos y ducha sin rozarse): la posicion que no tapa
         ningun vano y que menos se encima. Un vano tapado no se acepta nunca. */
      var q = mejor || orig;
      f.position = q.position; f.size = q.size; f.rotation = q.rotation;
      hechas.push(f);
    });
    return hechas;
  }

  function construirPlan(answers, paso, opts) {
    var perfil = window.GDF3D.perfilDesdeRespuestas(answers, paso);
    var zon = window.GDF3D.zonificar(perfil);
    var md = window.GDF3D.derivarMuros(zon, opts);
    var vetados = md.ladosBloqueados || {};

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

    var pasos = [];
    md.openings.forEach(function (op) {
      if (op.type !== 'door') return;
      var muro = md.walls.filter(function (q) { return q.id === op.wallId; })[0];
      if (muro) pasos.push(pasoDe(muro, op));
    });

    var furniture = [];
    zon.rects.forEach(function (r) {
      if (r.zona === 'circulacion') return;
      furniture = furniture.concat(acomodar(amoblar(r, perfil, vetados[r.id]), r.rect, pasos));
    });

    var plan = {
      // La zonificacion ya trabaja en metros, asi que no hay conversion: el
      // `scale` existe para los planos que vienen de una imagen.
      scale: 1,
      walls: md.walls,
      openings: md.openings,
      rooms: rooms,
      furniture: furniture,
      /* Huella del programa COMPLETO (ambientes + circulacion, revelados o
         no). La planta ya no es un rectangulo: con los retranqueos, la losa de
         obra tiene que seguir este poligono o asoma gris en cada muesca. */
      huella: zon.huella.map(function (r) { return r.rect; }),
      // Util para la ficha y para depurar; el render lo ignora.
      meta: {
        ancho: zon.pl.w, fondo: zon.pl.d,
        area: zon.huella.reduce(function (s, r) { return s + r.rect.w * r.rect.d; }, 0),
        alcobas: perfil.nAlcobas, banos: perfil.nBanos,
        vis: perfil.vis, paso: perfil.paso
      }
    };
    return plan;
  }

  window.GDF3D = window.GDF3D || {};
  window.GDF3D.construirPlan = construirPlan;
})();
