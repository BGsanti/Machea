/* Entorno de la vivienda: una maqueta de barrio REDONDA alrededor del lote.

   Entra con la pregunta de amenidades (`entorno_deseado`) y se queda hasta el
   final del quiz. Tres capas, cada una una pieza aparte para que la escena las
   pueda animar por separado:
     - base: disco de pasto, lote, cerca/seto, andenes, calles, vecinos,
       arboles de calle, postes y carros. Fija mientras no cambie el plano.
     - amenidades: una por cada grupo elegido en la pregunta (piscina, cancha,
       parque...), cada una en una celda del lote alrededor de la casa.
     - relleno: la celda que ninguna amenidad ocupa lleva arboles o jardin, y
       se va cuando llega una amenidad a ocuparla.

   Redonda a proposito: el anillo cuadrado de calle que habia antes se leia
   como un marco de cuadro. Con un disco las calles se cortan contra el borde
   como en una maqueta, y la planta irregular de la casa no queda encerrada en
   otro rectangulo.

   Todo lo de una pieza se funde en UNA geometria por material: el barrio tiene
   cientos de cajas y sueltas serian cientos de llamadas de dibujo. */
(function () {
  'use strict';

  var THREE = window.GDF3DLibs.THREE;

  var FRANJA = 3.4;         // lote alrededor de la casa, en metros
  var ACERA = 0.6, VIA = 2.0;
  var PAD_EXT = 0.55, PAD_CASA = 0.35, PAD_LAT = 0.15;
  var GROSOR_DISCO = 0.45;
  // Alturas de las capas del suelo. Todo queda bajo la losa de la casa
  // (tope -0.02) y con al menos 1 cm entre capas: menos que eso parpadea.
  var Y_DISCO = -0.08, Y_VIA = -0.07, Y_LOTE = -0.055, Y_ACERA = -0.045;

  // Determinista, no Math.random(): el barrio no puede cambiar entre un
  // repintado y otro, o se lee como que la escena tiembla.
  function azar(i, sal) {
    var n = Math.sin(i * 12.9898 + sal * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  function rot(lx, lz, ry) {
    var c = Math.cos(ry), s = Math.sin(ry);
    return [lx * c + lz * s, -lx * s + lz * c];
  }

  /* ---------- acumulador: muchas primitivas, una malla por material ---------- */

  function fundir(geos) {
    var nv = 0, ni = 0;
    geos.forEach(function (g) {
      nv += g.attributes.position.count;
      ni += g.index ? g.index.count : g.attributes.position.count;
    });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    var idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    var ov = 0, oi = 0;
    geos.forEach(function (g) {
      var p = g.attributes.position;
      pos.set(p.array, ov * 3);
      nor.set(g.attributes.normal.array, ov * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, ov * 2);
      var i;
      if (g.index) {
        var ix = g.index.array;
        for (i = 0; i < ix.length; i++) idx[oi++] = ix[i] + ov;
      } else {
        for (i = 0; i < p.count; i++) idx[oi++] = ov + i;
      }
      ov += p.count;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  function acumulador() {
    var lotes = {}, orden = [];
    function meter(mat, geo, sombra) {
      var k = mat.uuid + (sombra ? '|s' : '');
      if (!lotes[k]) { lotes[k] = { mat: mat, geos: [], sombra: sombra }; orden.push(k); }
      lotes[k].geos.push(geo);
    }
    function colocar(geo, x, y, z, ry, rx) {
      if (rx) geo.rotateX(rx);
      if (ry) geo.rotateY(ry);
      geo.translate(x, y, z);
      return geo;
    }
    var a = {
      caja: function (mat, w, h, d, x, y, z, ry, rx, sombra) {
        meter(mat, colocar(new THREE.BoxGeometry(w, h, d), x, y, z, ry, rx), sombra !== false);
      },
      cil: function (mat, r1, r2, h, seg, x, y, z, rx, ry) {
        meter(mat, colocar(new THREE.CylinderGeometry(r1, r2, h, seg || 10), x, y, z, ry, rx), true);
      },
      cono: function (mat, r, h, seg, x, y, z, ry) {
        meter(mat, colocar(new THREE.ConeGeometry(r, h, seg || 8), x, y, z, ry), true);
      },
      // Bola facetada: a esta distancia se lee como copa de arbol de maqueta.
      bola: function (mat, r, x, y, z, sy) {
        var g = new THREE.IcosahedronGeometry(r, 0);
        if (sy) g.scale(1, sy, 1);
        meter(mat, colocar(g, x, y, z), true);
      },
      // Techo a cuatro aguas de w x d: una piramide de 4 lados estirada.
      piramide: function (mat, w, d, h, x, y, z, ry) {
        var g = new THREE.ConeGeometry(Math.SQRT1_2, h, 4);
        g.rotateY(Math.PI / 4);
        g.scale(w, 1, d);
        meter(mat, colocar(g, x, y, z, ry), true);
      },
      // Poligono plano en el suelo; `pts` en [x, z].
      plano: function (mat, pts, y) {
        var forma = new THREE.Shape(pts.map(function (p) { return new THREE.Vector2(p[0], -p[1]); }));
        var g = new THREE.ShapeGeometry(forma);
        g.rotateX(-Math.PI / 2);
        g.translate(0, y, 0);
        meter(mat, g, false);
      },
      // Cuarto de anillo plano (curvas de la pista de trote).
      anillo: function (mat, r0, r1, t0, tl, x, y, z) {
        var g = new THREE.RingGeometry(r0, r1, 12, 1, t0, tl);
        g.rotateX(-Math.PI / 2);
        g.translate(x, y, z);
        meter(mat, g, false);
      },
      toro: function (mat, r, tubo, x, y, z, ry) {
        meter(mat, colocar(new THREE.TorusGeometry(r, tubo, 5, 14), x, y, z, ry), true);
      },
      grupo: function () {
        var g = new THREE.Group();
        orden.forEach(function (k) {
          var l = lotes[k];
          var m = new THREE.Mesh(fundir(l.geos), l.mat);
          m.receiveShadow = true;
          m.castShadow = l.sombra;
          g.add(m);
        });
        return g;
      }
    };
    return a;
  }

  /* ---------- piezas sueltas reutilizables ---------- */

  // v: 0 copa redonda, 1 pino, 2 frondoso. `s` escala todo el arbol.
  function arbol(a, M, x, z, s, v) {
    var alto = 0.55 * s;
    a.cil(M.tronco, 0.045 * s, 0.065 * s, alto, 6, x, alto / 2, z);
    if (v === 1) {
      a.cono(M.copaOscura, 0.36 * s, 0.75 * s, 7, x, alto + 0.25 * s, z);
      a.cono(M.copaOscura, 0.26 * s, 0.55 * s, 7, x, alto + 0.66 * s, z);
    } else if (v === 2) {
      a.bola(M.copaClara, 0.34 * s, x - 0.12 * s, alto + 0.2 * s, z);
      a.bola(M.copaClara, 0.3 * s, x + 0.16 * s, alto + 0.28 * s, z + 0.08 * s);
      a.bola(M.copa, 0.28 * s, x, alto + 0.5 * s, z - 0.06 * s);
    } else {
      a.bola(M.copa, 0.44 * s, x, alto + 0.3 * s, z, 1.1);
    }
  }

  function arbusto(a, M, x, z, s) {
    a.bola(M.seto, 0.2 * (s || 1), x, 0.12 * (s || 1), z, 0.75);
  }

  function banca(a, M, x, z, ry) {
    var p = function (lx, lz) { var r = rot(lx, lz, ry); return [x + r[0], z + r[1]]; };
    var q = p(0, 0);
    a.caja(M.marco, 0.62, 0.05, 0.2, q[0], 0.24, q[1], ry);
    q = p(0, -0.09);
    a.caja(M.marco, 0.62, 0.16, 0.04, q[0], 0.36, q[1], ry);
    [-0.25, 0.25].forEach(function (lx) {
      var r = p(lx, 0);
      a.caja(M.metal, 0.04, 0.22, 0.18, r[0], 0.11, r[1], ry);
    });
  }

  function poste(a, M, x, z) {
    a.cil(M.metal, 0.022, 0.03, 1.5, 6, x, 0.75, z);
    a.caja(M.metal, 0.05, 0.06, 0.05, x, 1.52, z);
    a.caja(M.farol, 0.14, 0.05, 0.14, x, 1.5, z);
  }

  // Carro de juguete a la escala de la calle (que ya es de maqueta: 2 m).
  function carro(a, M, x, z, ry, color) {
    var L = 1.0, W = 0.48;
    a.caja(M.llanta, L * 0.84, 0.12, W * 1.04, x, 0.06, z, ry);
    a.caja(color, L, 0.17, W, x, 0.18, z, ry);
    var o = rot(-0.06, 0, ry);
    a.caja(M.ventanal, L * 0.55, 0.15, W * 0.88, x + o[0], 0.33, z + o[1], ry);
    a.caja(color, L * 0.5, 0.03, W * 0.84, x + o[0], 0.42, z + o[1], ry);
  }

  function bloque(a, M, x, z, w, d, h, ry, mat, sem) {
    a.caja(mat, w, h, d, x, h / 2, z, ry);
    // Ventanas corridas: una franja oscura por piso que da la vuelta al
    // bloque. Sin ellas un bloque de 3 m es una caja muda.
    for (var y = 0.42; y < h - 0.3; y += 0.52) {
      a.caja(M.ventanal, w + 0.02, 0.2, d + 0.02, x, y, z, ry, 0, false);
    }
    a.caja(M.techo, w + 0.08, 0.07, d + 0.08, x, h + 0.035, z, ry);
    if (azar(sem, 4) > 0.35) {
      var o = rot((azar(sem, 5) - 0.5) * w * 0.4, (azar(sem, 6) - 0.5) * d * 0.3, ry);
      a.caja(M.techo, 0.36, 0.26, 0.3, x + o[0], h + 0.2, z + o[1], ry);
    }
  }

  function casita(a, M, x, z, w, d, ry, mat, techo) {
    var h = 0.75;
    a.caja(mat, w, h, d, x, h / 2, z, ry);
    a.caja(M.ventanal, w + 0.02, 0.18, d + 0.02, x, 0.45, z, ry, 0, false);
    a.piramide(techo, w + 0.14, d + 0.14, 0.5, x, h + 0.25, z, ry);
  }

  /* ---------- disposicion: donde va cada cosa ---------- */

  var LADOS = {
    n: { eje: 'z', sg: -1 }, s: { eje: 'z', sg: 1 },
    o: { eje: 'x', sg: -1 }, e: { eje: 'x', sg: 1 }
  };

  function disponer(plan) {
    var sc = plan.scale || 1;
    var x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    // La huella del programa COMPLETO, no lo revelado: el lote no puede
    // moverse si una respuesta posterior revela otra alcoba.
    (plan.huella || []).forEach(function (r) {
      x0 = Math.min(x0, r.x * sc); x1 = Math.max(x1, (r.x + r.w) * sc);
      z0 = Math.min(z0, r.z * sc); z1 = Math.max(z1, (r.z + r.d) * sc);
    });
    if (!isFinite(x0)) {
      var w2 = (plan.meta && plan.meta.ancho) || 6, d2 = (plan.meta && plan.meta.fondo) || 6;
      x0 = -w2 / 2; x1 = w2 / 2; z0 = -d2 / 2; z1 = d2 / 2;
    }
    var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    var L = { x0: x0 - FRANJA, x1: x1 + FRANJA, z0: z0 - FRANJA, z1: z1 + FRANJA };
    var hx = (L.x1 - L.x0) / 2, hz = (L.z1 - L.z0) / 2;
    var R = Math.max(Math.sqrt(hx * hx + hz * hz) + 0.9, Math.max(hx, hz) + ACERA + VIA + 1.0);

    /* La calle principal pasa por el lado de la puerta de entrada, para que
       el camino de la casa llegue a algun lado. La segunda es la del lado
       cercano a la camara: una esquina, no un anillo. */
    var puerta = null;
    (window.GDF3D.ubicarAberturas(plan, 'door') || []).forEach(function (p) {
      if (!puerta && p.opening && p.opening.hoja) puerta = p;
    });
    var lado = 's', px = cx, pz = z1;
    if (puerta) {
      px = puerta.center[0]; pz = puerta.center[2];
      var aLoLargoX = Math.abs(Math.cos(puerta.wallAngle)) > Math.abs(Math.sin(puerta.wallAngle));
      if (aLoLargoX) lado = pz < cz ? 'n' : 's';
      else lado = px < cx ? 'o' : 'e';
    }
    var calles = [lado, (lado === 'n' || lado === 's') ? 'e' : 's'];
    var tp = LADOS[lado].eje === 'z' ? px - cx : pz - cz;

    var lay = {
      cx: cx, cz: cz, R: R, hx: hx, hz: hz,
      casa: { x0: x0, x1: x1, z0: z0, z1: z1 }, L: L,
      lado: lado, calles: calles, puerta: { x: px, z: pz, t: tp },
      celdas: []
    };
    lay.clave = [x0, x1, z0, z1, px, pz].map(function (v) { return v.toFixed(2); }).join(',') + lado;

    // Camino de la puerta al anden, en coordenadas del mundo.
    var cam;
    if (lado === 's') cam = { x0: px - 0.6, x1: px + 0.6, z0: pz, z1: L.z1 };
    else if (lado === 'n') cam = { x0: px - 0.6, x1: px + 0.6, z0: L.z0, z1: pz };
    else if (lado === 'e') cam = { x0: px, x1: L.x1, z0: pz - 0.6, z1: pz + 0.6 };
    else cam = { x0: L.x0, x1: px, z0: pz - 0.6, z1: pz + 0.6 };
    lay.camino = cam;

    /* Celdas del lote: cuatro esquinas y la franja de cada lado partida en
       tramos de ~3.6 m. Cada celda deja libre el borde del lote (seto y pista
       de trote) y un pasillo contra la casa. */
    function celda(id, ax0, ax1, az0, az1, pads) {
      var c = {
        id: id,
        x0: ax0 + pads[0], x1: ax1 - pads[1], z0: az0 + pads[2], z1: az1 - pads[3]
      };
      c.w = c.x1 - c.x0; c.d = c.z1 - c.z0;
      c.x = (c.x0 + c.x1) / 2; c.z = (c.z0 + c.z1) / 2;
      if (c.w < 1.2 || c.d < 1.2) return;
      c.camino = !(cam.x1 <= c.x0 || cam.x0 >= c.x1 || cam.z1 <= c.z0 || cam.z0 >= c.z1);
      // -1 lejos de la camara (esquina -x,-z), +1 cerca (+x,+z).
      c.cercania = ((c.x - cx) / hx + (c.z - cz) / hz) / 2;
      lay.celdas.push(c);
    }
    var E = PAD_EXT, C = PAD_CASA, T = PAD_LAT;
    celda('no', L.x0, x0, L.z0, z0, [E, T, E, T]);
    celda('ne', x1, L.x1, L.z0, z0, [T, E, E, T]);
    celda('so', L.x0, x0, z1, L.z1, [E, T, T, E]);
    celda('se', x1, L.x1, z1, L.z1, [T, E, T, E]);
    var i, n;
    n = Math.max(1, Math.round((x1 - x0) / 3.6));
    for (i = 0; i < n; i++) {
      var a0 = x0 + (x1 - x0) * i / n, a1 = x0 + (x1 - x0) * (i + 1) / n;
      celda('n' + i, a0, a1, L.z0, z0, [T, T, E, C]);
      celda('s' + i, a0, a1, z1, L.z1, [T, T, C, E]);
    }
    n = Math.max(1, Math.round((z1 - z0) / 3.6));
    for (i = 0; i < n; i++) {
      var b0 = z0 + (z1 - z0) * i / n, b1 = z0 + (z1 - z0) * (i + 1) / n;
      celda('o' + i, L.x0, x0, b0, b1, [E, C, T, T]);
      celda('e' + i, x1, L.x1, b0, b1, [C, E, T, T]);
    }

    // Lo que la camara tiene que encuadrar: el borde del disco, a ras y a la
    // altura de los vecinos mas bajos. Puntos del borde y no la caja: la caja
    // de un disco sobra en las esquinas y achica todo sin necesidad.
    lay.puntos = [];
    for (i = 0; i < 24; i++) {
      var t = i / 24 * Math.PI * 2;
      lay.puntos.push([Math.cos(t) * R, -GROSOR_DISCO, Math.sin(t) * R]);
      lay.puntos.push([Math.cos(t) * R * 0.92, 1.4, Math.sin(t) * R * 0.92]);
    }
    return lay;
  }

  /* ---------- amenidades ---------- */

  // Valor de la pregunta -> grupo que se construye. Las de salon (cine,
  // coworking, cafe...) comparten UN club que crece con cada una: nueve
  // edificios sueltos no caben en el lote y se leerian como otro barrio.
  var GRUPO = {
    'piscina': 'piscina', 'zona bbq': 'bbq', 'parque': 'parque',
    'zona verde': 'jardin', 'zona kid': 'juegos', 'cancha multiple': 'cancha',
    'cancha e padel': 'padel', 'voleibol playa': 'voley', 'parqueadero': 'parqueadero',
    'pista de trote': 'pista', 'gymnasio': 'gimnasio', 'zona fitness': 'fitness',
    'lobby': 'lobby', 'zona pet': 'mascotas', 'spa mascotas': 'mascotas',
    'locales comerciales': 'locales', 'taller de bicicletas': 'bicis'
  };
  // Sin celda propia: la pista rodea el lote y el lobby va en la reja.
  var SIN_CELDA = { pista: true, lobby: true };
  var PERFIL = {
    piscina: 'grande', cancha: 'grande', padel: 'grande', voley: 'grande',
    parqueadero: 'grande', club: 'alto', gimnasio: 'alto', locales: 'alto'
  };

  function grupos(lista) {
    var out = [], club = 0;
    (lista || []).forEach(function (v) {
      var g = GRUPO[v] || 'club';
      if (g === 'club') club++;
      if (out.indexOf(g) < 0) out.push(g);
    });
    return { lista: out, club: club };
  }

  /* Reparte los grupos en celdas. `previa` es la asignacion anterior: lo que
     ya estaba se queda en su celda, o elegir una amenidad nueva haria saltar
     a las demas. Las planas y grandes van del lado de la camara; las altas,
     del lado lejano, para no tapar la casa. */
  function asignar(lay, lista, previa) {
    var gs = grupos(lista);
    var libres = lay.celdas.filter(function (c) { return !c.camino; });
    var porId = {};
    libres.forEach(function (c) { porId[c.id] = c; });
    var asig = {}, tomadas = {};
    gs.lista.forEach(function (g) {
      var id = previa && previa[g];
      if (!SIN_CELDA[g] && id && porId[id] && !tomadas[id]) { asig[g] = id; tomadas[id] = true; }
    });
    gs.lista.forEach(function (g) {
      if (SIN_CELDA[g] || asig[g]) return;
      var mejor = null, puntaje = -Infinity;
      libres.forEach(function (c) {
        if (tomadas[c.id]) return;
        var area = c.w * c.d, p;
        if (PERFIL[g] === 'grande') p = area + c.cercania * 2;
        else if (PERFIL[g] === 'alto') p = -c.cercania * 3 + Math.min(area, 9) * 0.3;
        else p = c.cercania + Math.min(area, 8) * 0.3 - Math.max(0, area - 10) * 0.2;
        if (p > puntaje) { puntaje = p; mejor = c; }
      });
      if (mejor) { asig[g] = mejor.id; tomadas[mejor.id] = true; }
    });
    return { celdas: asig, grupos: gs.lista, club: gs.club };
  }

  /* Constructores de amenidad: coordenadas locales de la celda, con el eje
     largo en X (w >= d) y el pasto del lote en y = 0. */
  var AMENIDAD = {
    piscina: function (a, M, w, d) {
      a.caja(M.deck, w, 0.05, d, 0, 0.025, 0, 0, 0, false);
      var pw = Math.min(w - 0.95, 3.6), pd = Math.min(d - 0.6, 2.2);
      var ox = -w / 2 + 0.3 + pw / 2;
      a.caja(M.agua, pw, 0.08, pd, ox, 0.045, 0, 0, 0, false);
      a.caja(M.blanco, pw + 0.2, 0.1, 0.1, ox, 0.05, -pd / 2 - 0.05);
      a.caja(M.blanco, pw + 0.2, 0.1, 0.1, ox, 0.05, pd / 2 + 0.05);
      a.caja(M.blanco, 0.1, 0.1, pd, ox - pw / 2 - 0.05, 0.05, 0);
      a.caja(M.blanco, 0.1, 0.1, pd, ox + pw / 2 + 0.05, 0.05, 0);
      // Carriles: sin ellos el agua es un rectangulo celeste liso.
      a.caja(M.aguaClara, pw * 0.92, 0.004, 0.03, ox, 0.087, -pd / 6, 0, 0, false);
      a.caja(M.aguaClara, pw * 0.92, 0.004, 0.03, ox, 0.087, pd / 6, 0, 0, false);
      var sx = (ox + pw / 2 + 0.1 + w / 2) / 2;
      [-0.35, 0.35].forEach(function (lz, i) {
        a.caja(M.blanco, 0.26, 0.06, 0.6, sx, 0.13, lz * (d / 2.4));
        a.caja(i ? M.toldo3 : M.toldo1, 0.22, 0.01, 0.4, sx, 0.165, lz * (d / 2.4) + 0.06, 0, 0, false);
        a.caja(M.blanco, 0.26, 0.05, 0.22, sx, 0.22, lz * (d / 2.4) - 0.24, 0, -0.7);
      });
      a.cil(M.metal, 0.015, 0.015, 0.95, 6, sx, 0.5, 0);
      a.cono(M.toldo1, 0.42, 0.18, 8, sx, 1.0, 0);
    },
    bbq: function (a, M, w, d) {
      var pw = Math.min(w - 0.3, 2.6), pd = Math.min(d - 0.3, 2.0);
      a.caja(M.adoquin, pw, 0.04, pd, 0, 0.02, 0, 0, 0, false);
      // Pergola de madera con listones.
      var gx = pw / 2 - 0.12, gz = pd / 2 - 0.12;
      [[-gx, -gz], [gx, -gz], [-gx, gz], [gx, gz]].forEach(function (p) {
        a.caja(M.marco, 0.07, 1.1, 0.07, p[0], 0.55, p[1]);
      });
      a.caja(M.marco, pw - 0.1, 0.06, 0.06, 0, 1.1, -gz);
      a.caja(M.marco, pw - 0.1, 0.06, 0.06, 0, 1.1, gz);
      for (var i = 0; i < 7; i++) {
        a.caja(M.marco, 0.04, 0.05, pd - 0.05, -gx + (2 * gx) * i / 6, 1.16, 0);
      }
      a.caja(M.blanco, 1.0, 0.05, 0.5, 0.15, 0.45, 0);
      a.caja(M.marco, 0.1, 0.42, 0.4, 0.15, 0.21, 0);
      a.caja(M.marco, 1.0, 0.05, 0.16, 0.15, 0.26, -0.42);
      a.caja(M.marco, 1.0, 0.05, 0.16, 0.15, 0.26, 0.42);
      // Asador: cuerpo oscuro, parrilla y chimenea.
      a.caja(M.llanta, 0.5, 0.75, 0.36, -gx + 0.4, 0.375, -gz + 0.3);
      a.caja(M.metal, 0.46, 0.03, 0.32, -gx + 0.4, 0.765, -gz + 0.3);
      a.caja(M.llanta, 0.08, 0.5, 0.08, -gx + 0.55, 1.0, -gz + 0.22);
    },
    parque: function (a, M, w, d, sem) {
      a.caja(M.adoquin, w - 0.2, 0.012, 0.36, 0, 0.006, 0, 0, 0, false);
      a.caja(M.adoquin, 0.36, 0.013, d - 0.2, 0, 0.0065, 0, 0, 0, false);
      a.cil(M.blanco, 0.42, 0.46, 0.14, 16, 0, 0.07, 0);
      a.cil(M.agua, 0.35, 0.35, 0.02, 16, 0, 0.14, 0);
      a.cil(M.blanco, 0.05, 0.07, 0.35, 8, 0, 0.25, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q, i) {
        var x = q[0] * (w / 4 + 0.05), z = q[1] * (d / 4 + 0.05);
        if (i === 1 || i === 2) arbol(a, M, x, z, 1.15 + azar(sem + i, 2) * 0.3, i === 1 ? 0 : 2);
        else { arbusto(a, M, x - 0.15, z); arbusto(a, M, x + 0.15, z + 0.1, 0.8); }
      });
      banca(a, M, -w / 4, 0.33, Math.PI);
      banca(a, M, w / 4, -0.33, 0);
    },
    jardin: function (a, M, w, d, sem) {
      var flores = [M.flor1, M.flor2, M.flor3];
      for (var f = 0; f < 3; f++) {
        var bz = -d / 2 + 0.45 + f * (d - 0.9) / 2;
        var bw = w * (0.45 + azar(sem + f, 3) * 0.2), bx = (azar(sem + f, 7) - 0.5) * (w - bw - 0.3);
        a.caja(M.tierra, bw, 0.06, 0.4, bx, 0.03, bz, 0, 0, false);
        for (var k = 0; k < Math.floor(bw / 0.2); k++) {
          a.bola(flores[(f + k) % 3], 0.07, bx - bw / 2 + 0.12 + k * 0.2, 0.11, bz + (k % 2 ? 0.08 : -0.08));
        }
      }
      arbol(a, M, w / 2 - 0.45, -d / 2 + 0.5, 1.2, 0);
      arbol(a, M, -w / 2 + 0.45, d / 2 - 0.5, 1.0, 2);
    },
    juegos: function (a, M, w, d) {
      a.caja(M.pisoJuegos, w - 0.2, 0.03, d - 0.2, 0, 0.015, 0, 0, 0, false);
      // Torre con resbalador.
      var tx = -w / 2 + 0.6, tz = -d / 2 + 0.55;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        a.caja(M.metal, 0.05, 0.85, 0.05, tx + q[0] * 0.22, 0.425, tz + q[1] * 0.22);
      });
      a.caja(M.toldo3, 0.52, 0.05, 0.52, tx, 0.5, tz);
      a.piramide(M.toldo1, 0.62, 0.62, 0.3, tx, 1.0, tz);
      a.caja(M.toldo2, 0.22, 0.03, 0.95, tx, 0.27, tz + 0.62, 0, 0.55);
      // Columpio.
      var sx = w / 2 - 0.7;
      [-0.5, 0.5].forEach(function (lz) {
        a.caja(M.metal, 0.05, 0.8, 0.05, sx - 0.2, 0.4, lz);
        a.caja(M.metal, 0.05, 0.8, 0.05, sx + 0.2, 0.4, lz);
      });
      a.caja(M.metal, 0.05, 0.05, 1.05, sx, 0.8, 0);
      [-0.2, 0.2].forEach(function (lz, i) {
        a.caja(i ? M.toldo2 : M.toldo1, 0.18, 0.03, 0.14, sx, 0.25, lz);
        a.caja(M.metal, 0.01, 0.55, 0.01, sx, 0.52, lz - 0.06, 0, 0, false);
        a.caja(M.metal, 0.01, 0.55, 0.01, sx, 0.52, lz + 0.06, 0, 0, false);
      });
      // Balancin.
      a.caja(M.toldo3, 0.08, 0.04, 0.9, 0, 0.15, d / 2 - 0.5, 0, 0.18);
      a.caja(M.metal, 0.1, 0.14, 0.1, 0, 0.07, d / 2 - 0.5);
    },
    cancha: function (a, M, w, d) { cancha(a, M, w, d, 'multiple'); },
    padel: function (a, M, w, d) { cancha(a, M, w, d, 'padel'); },
    voley: function (a, M, w, d) { cancha(a, M, w, d, 'voley'); },
    parqueadero: function (a, M, w, d, sem) {
      a.caja(M.asfalto, w - 0.1, 0.02, d - 0.1, 0, 0.01, 0, 0, 0, false);
      var colores = [M.auto1, M.auto2, M.auto3, M.auto4];
      var n = Math.max(2, Math.floor((w - 0.3) / 0.66)), bw = (w - 0.3) / n;
      var filas = d >= 2.3 ? [-1, 1] : [0];
      var prof = filas.length > 1 ? Math.min(1.1, (d - 0.5) / 2) : d - 0.4;
      filas.forEach(function (f, fi) {
        var zc = f * (d / 2 - 0.05 - prof / 2);
        for (var i = 0; i <= n; i++) {
          a.caja(M.blanco, 0.035, 0.004, prof, -w / 2 + 0.15 + i * bw, 0.022, zc, 0, 0, false);
        }
        for (var j = 0; j < n; j++) {
          if (azar(sem + j + fi * 7, 9) < 0.45) continue;
          carro(a, M, -w / 2 + 0.15 + (j + 0.5) * bw, zc + f * 0.02, Math.PI / 2, colores[(j + fi) % 4]);
        }
      });
    },
    gimnasio: function (a, M, w, d) {
      var bw = Math.min(w - 0.5, 2.6), bd = Math.min(d - 0.6, 1.6);
      a.caja(M.acera, bw + 0.5, 0.05, bd + 0.5, 0, 0.025, 0, 0, 0, false);
      a.caja(M.ventanal, bw, 1.0, bd, 0, 0.55, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        a.caja(M.blanco, 0.09, 1.0, 0.09, q[0] * bw / 2, 0.55, q[1] * bd / 2);
      });
      a.caja(M.blanco, bw + 0.3, 0.09, bd + 0.3, 0, 1.1, 0);
      a.caja(M.toldo2, bw + 0.32, 0.04, 0.06, 0, 1.08, bd / 2 + 0.15);
      a.caja(M.toldo3, 0.6, 0.16, 0.05, 0, 1.24, bd / 2 + 0.1);
    },
    fitness: function (a, M, w, d) {
      a.caja(M.pista, w - 0.3, 0.025, d - 0.3, 0, 0.0125, 0, 0, 0, false);
      [-1, 0, 1].forEach(function (i) {
        var x = i * (w / 3.4);
        var h = 0.7 + (i + 1) * 0.15;
        a.caja(M.metal, 0.05, h, 0.05, x, h / 2, -0.35);
        a.caja(M.metal, 0.05, h, 0.05, x, h / 2, 0.35);
        a.caja(M.toldo3, 0.04, 0.04, 0.75, x, h, 0);
      });
      a.caja(M.marco, 0.8, 0.05, 0.22, 0, 0.22, d / 2 - 0.45);
      a.caja(M.metal, 0.08, 0.2, 0.2, -0.3, 0.1, d / 2 - 0.45);
      a.caja(M.metal, 0.08, 0.2, 0.2, 0.3, 0.1, d / 2 - 0.45);
    },
    club: function (a, M, w, d, sem, n) {
      var bw = Math.min(w - 0.4, 1.6 + 0.3 * (n || 1)), bd = Math.min(d - 1.0, 1.5);
      var bz = -d / 2 + 0.2 + bd / 2;
      a.caja(M.clubMuro, bw, 1.0, bd, 0, 0.5, bz);
      a.caja(M.ventanal, bw * 0.8, 0.5, 0.03, 0, 0.45, bz + bd / 2 + 0.01, 0, 0, false);
      a.caja(M.techo, bw + 0.24, 0.08, bd + 0.24, 0, 1.04, bz);
      a.caja(M.toldo2, bw + 0.26, 0.1, 0.05, 0, 1.0, bz + bd / 2 + 0.12);
      // Terraza con mesas y parasoles.
      var tz0 = bz + bd / 2, tz = (tz0 + d / 2) / 2;
      a.caja(M.deck, bw, 0.04, d / 2 - tz0, 0, 0.02, tz, 0, 0, false);
      var colores = [M.toldo1, M.toldo3, M.toldo2];
      var nm = Math.max(1, Math.min(3, Math.floor(bw / 0.8)));
      for (var i = 0; i < nm; i++) {
        var x = -bw / 2 + bw * (i + 0.5) / nm;
        a.cil(M.blanco, 0.16, 0.16, 0.03, 10, x, 0.4, tz);
        a.cil(M.metal, 0.02, 0.02, 0.4, 6, x, 0.2, tz);
        a.cil(M.metal, 0.012, 0.012, 0.9, 6, x, 0.6, tz);
        a.cono(colores[i % 3], 0.34, 0.15, 8, x, 1.05, tz);
      }
    },
    mascotas: function (a, M, w, d) {
      a.caja(M.pasto, w - 0.2, 0.02, d - 0.2, 0, 0.01, 0, 0, 0, false);
      var fx = w / 2 - 0.12, fz = d / 2 - 0.12;
      a.caja(M.blanco, 2 * fx, 0.03, 0.03, 0, 0.22, -fz);
      a.caja(M.blanco, 2 * fx, 0.03, 0.03, 0, 0.22, fz);
      a.caja(M.blanco, 0.03, 0.03, 2 * fz, -fx, 0.22, 0);
      a.caja(M.blanco, 0.03, 0.03, 2 * fz, fx, 0.22, 0);
      for (var x = -fx; x <= fx + 0.01; x += (2 * fx) / Math.round(2 * fx / 0.45)) {
        a.caja(M.blanco, 0.035, 0.27, 0.035, x, 0.135, -fz);
        a.caja(M.blanco, 0.035, 0.27, 0.035, x, 0.135, fz);
      }
      [-0.5, 0.2].forEach(function (lx, i) {
        a.caja(M.toldo1, 0.04, 0.3, 0.04, lx, 0.15, -0.25);
        a.caja(M.toldo1, 0.04, 0.3, 0.04, lx, 0.15, 0.25);
        a.caja(i ? M.toldo3 : M.toldo2, 0.04, 0.04, 0.5, lx, 0.24, 0);
      });
      a.cil(M.toldo2, 0.13, 0.13, 0.7, 12, w / 2 - 0.55, 0.13, 0, Math.PI / 2);
      a.caja(M.edificio2, 0.36, 0.28, 0.3, -w / 2 + 0.45, 0.14, -d / 2 + 0.45);
      a.piramide(M.toldo1, 0.42, 0.36, 0.2, -w / 2 + 0.45, 0.38, -d / 2 + 0.45);
      a.cil(M.toldo1, 0.035, 0.045, 0.18, 8, w / 2 - 0.4, 0.09, -d / 2 + 0.4);
    },
    locales: function (a, M, w, d) {
      var n = 3, mw = (w - 0.3) / n, md = Math.min(d - 0.8, 1.2);
      var bz = -d / 2 + 0.15 + md / 2;
      a.caja(M.adoquin, w - 0.1, 0.02, d - md - 0.2, 0, 0.01, bz + md / 2 + (d - md - 0.2) / 2, 0, 0, false);
      var muros = [M.edificio1, M.edificio4, M.edificio3], toldos = [M.toldo1, M.toldo2, M.toldo3];
      for (var i = 0; i < n; i++) {
        var x = -w / 2 + 0.15 + mw * (i + 0.5);
        a.caja(muros[i], mw - 0.04, 0.95, md, x, 0.475, bz);
        a.caja(M.ventanal, mw * 0.72, 0.48, 0.03, x, 0.32, bz + md / 2 + 0.01, 0, 0, false);
        a.caja(toldos[i], mw * 0.84, 0.03, 0.36, x, 0.7, bz + md / 2 + 0.14, 0, 0.35);
        a.caja(toldos[i], mw * 0.6, 0.1, 0.03, x, 0.86, bz + md / 2 + 0.01, 0, 0, false);
      }
    },
    bicis: function (a, M, w, d) {
      var pw = Math.min(w - 0.4, 2.0), pd = Math.min(d - 0.4, 1.4);
      a.caja(M.adoquin, pw, 0.03, pd, 0, 0.015, 0, 0, 0, false);
      [[-1, -1], [1, -1]].forEach(function (q) {
        a.caja(M.metal, 0.05, 1.0, 0.05, q[0] * (pw / 2 - 0.1), 0.5, q[1] * (pd / 2 - 0.1));
      });
      a.caja(M.toldo2, pw, 0.04, pd * 0.7, 0, 1.0, -pd * 0.15, 0, -0.08);
      var colores = [M.auto1, M.auto2, M.auto4, M.toldo2];
      var nb = Math.max(2, Math.floor(pw / 0.3));
      for (var i = 0; i < nb; i++) {
        var x = -pw / 2 + 0.2 + i * ((pw - 0.4) / Math.max(1, nb - 1));
        // Bicis a lo largo de Z: ruedas en el plano YZ.
        a.toro(M.llanta, 0.12, 0.014, x, 0.13, -0.15, Math.PI / 2);
        a.toro(M.llanta, 0.12, 0.014, x, 0.13, 0.17, Math.PI / 2);
        a.caja(colores[i % 4], 0.025, 0.025, 0.34, x, 0.2, 0.01);
        a.caja(colores[i % 4], 0.025, 0.16, 0.025, x, 0.24, -0.08);
      }
      a.caja(M.metal, pw * 0.9, 0.03, 0.03, 0, 0.22, -0.32);
    }
  };

  function cancha(a, M, w, d, tipo) {
    var sup = tipo === 'padel' ? M.canchaAzul : tipo === 'voley' ? M.arena : M.canchaVerde;
    a.caja(tipo === 'voley' ? M.arena : M.canchaBorde, w - 0.1, 0.03, d - 0.1, 0, 0.015, 0, 0, 0, false);
    var cw = w - 0.5, cd = d - 0.5, y = 0.036;
    a.caja(sup, cw, 0.035, cd, 0, 0.0185, 0, 0, 0, false);
    var linea = tipo === 'voley' ? M.toldo1 : M.blanco;
    a.caja(linea, cw, 0.004, 0.04, 0, y + 0.002, -cd / 2 + 0.02, 0, 0, false);
    a.caja(linea, cw, 0.004, 0.04, 0, y + 0.002, cd / 2 - 0.02, 0, 0, false);
    a.caja(linea, 0.04, 0.004, cd, -cw / 2 + 0.02, y + 0.002, 0, 0, 0, false);
    a.caja(linea, 0.04, 0.004, cd, cw / 2 - 0.02, y + 0.002, 0, 0, 0, false);
    a.caja(linea, 0.04, 0.004, cd, 0, y + 0.002, 0, 0, 0, false);
    if (tipo === 'multiple') {
      a.anillo(M.blanco, 0.3, 0.34, 0, Math.PI * 2, 0, y + 0.003, 0);
      [-1, 1].forEach(function (s) {
        var x = s * (cw / 2 - 0.05);
        a.caja(M.blanco, 0.04, 0.4, 0.04, x, 0.2, -0.3);
        a.caja(M.blanco, 0.04, 0.4, 0.04, x, 0.2, 0.3);
        a.caja(M.blanco, 0.04, 0.04, 0.64, x, 0.4, 0);
      });
      return;
    }
    // Red al centro; el padel ademas lleva los vidrios del fondo.
    a.caja(M.metal, 0.04, 0.5, 0.04, 0, 0.25, -cd / 2 - 0.04);
    a.caja(M.metal, 0.04, 0.5, 0.04, 0, 0.25, cd / 2 + 0.04);
    a.caja(M.red, 0.02, 0.18, cd, 0, tipo === 'voley' ? 0.4 : 0.2, 0, 0, 0, false);
    if (tipo === 'padel') {
      [-1, 1].forEach(function (s) {
        a.caja(M.vidrio, 0.03, 0.6, cd, s * cw / 2, 0.33, 0, 0, 0, false);
        a.caja(M.metal, 0.04, 0.65, 0.04, s * cw / 2, 0.33, -cd / 2);
        a.caja(M.metal, 0.04, 0.65, 0.04, s * cw / 2, 0.33, cd / 2);
      });
    }
  }

  /* Relleno de las celdas libres. Cuatro variantes para que dos celdas
     vecinas no se vean clonadas. */
  function relleno(a, M, w, d, sem) {
    var v = Math.floor(azar(sem, 1) * 4);
    var rx = function (k) { return (azar(sem + k, 21) - 0.5) * (w - 0.9); };
    var rz = function (k) { return (azar(sem + k, 23) - 0.5) * (d - 0.9); };
    if (v === 0) {
      arbol(a, M, rx(1), rz(1), 1.3 + azar(sem, 3) * 0.3, 0);
      arbol(a, M, rx(2), rz(2), 1.0 + azar(sem, 4) * 0.3, 2);
      arbusto(a, M, rx(3), rz(3)); arbusto(a, M, rx(4), rz(4), 0.8); arbusto(a, M, rx(5), rz(5), 1.1);
    } else if (v === 1) {
      a.caja(M.tierra, w * 0.5, 0.06, 0.36, 0, 0.03, d / 4, 0, 0, false);
      var flores = [M.flor1, M.flor2, M.flor3];
      for (var k = 0; k < Math.floor(w * 0.5 / 0.2); k++) {
        a.bola(flores[k % 3], 0.07, -w / 4 + 0.1 + k * 0.2, 0.11, d / 4 + (k % 2 ? 0.07 : -0.07));
      }
      arbol(a, M, -w / 4, -d / 5, 1.35, 0);
      arbusto(a, M, w / 4, -d / 4);
    } else if (v === 2) {
      banca(a, M, 0, d / 2 - 0.45, Math.PI);
      arbol(a, M, -w / 2 + 0.5, -d / 4, 1.25, 2);
      arbol(a, M, w / 2 - 0.5, -d / 5, 1.1, 0);
      arbusto(a, M, 0.5, d / 2 - 0.4); arbusto(a, M, -0.5, d / 2 - 0.4, 0.8);
    } else {
      arbol(a, M, rx(6), rz(6), 1.4, 1);
      arbol(a, M, rx(7), rz(7), 1.1, 1);
      arbol(a, M, rx(8), rz(8), 1.2, 0);
      arbusto(a, M, rx(9), rz(9));
    }
  }

  /* ---------- base: suelo, calles, vecinos ---------- */

  function base(lay, M) {
    var a = acumulador();
    var cx = lay.cx, cz = lay.cz, R = lay.R, L = lay.L;

    // El disco: pasto arriba, tierra en el canto.
    var tapa = new THREE.CircleGeometry(R, 64);
    tapa.rotateX(-Math.PI / 2);
    tapa.translate(cx, Y_DISCO, cz);
    var canto = new THREE.CylinderGeometry(R, R * 0.97, GROSOR_DISCO, 64, 1, true);
    canto.translate(cx, Y_DISCO - GROSOR_DISCO / 2, cz);
    var extra = [{ geo: tapa, mat: M.pasto, sombra: false }, { geo: canto, mat: M.tierra, sombra: false }];

    // Lote del conjunto, un escalon apenas mas claro que el barrio.
    a.caja(M.pastoLote, L.x1 - L.x0, 0.02, L.z1 - L.z0, cx, Y_LOTE - 0.01, cz, 0, 0, false);

    function borde(k) { return LADOS[k].eje === 'z' ? lay.hz : lay.hx; }
    function punto(k, t, dd) {
      var l = LADOS[k];
      return l.eje === 'z' ? [cx + t, cz + l.sg * dd] : [cx + l.sg * dd, cz + t];
    }
    function giro(k) { return LADOS[k].eje === 'z' ? 0 : Math.PI / 2; }
    function cuerda(dd) { return Math.sqrt(Math.max(0, R * R - dd * dd)) - 0.08; }
    function franja(mat, k, d0, d1, y) {
      a.plano(mat, [
        punto(k, -cuerda(d0), d0), punto(k, cuerda(d0), d0),
        punto(k, cuerda(d1), d1), punto(k, -cuerda(d1), d1)
      ], y);
    }

    var colores = [M.auto1, M.auto2, M.auto3, M.auto4];
    lay.calles.forEach(function (k, ci) {
      var b = borde(k), di = b + ACERA, dm = di + VIA / 2, dk = di + VIA;
      franja(M.acera, k, b, di, Y_ACERA);
      franja(M.bordillo, k, di - 0.06, di, Y_ACERA + 0.002);
      franja(M.asfalto, k, di, dk, Y_VIA);
      var hc = cuerda(dm) - 0.4, t, p;
      for (t = -hc; t < hc - 0.45; t += 0.95) {
        p = punto(k, t + 0.22, dm);
        a.caja(M.marcaVial, 0.45, 0.006, 0.06, p[0], Y_VIA + 0.003, p[1], giro(k), 0, false);
      }
      var principal = k === lay.lado;
      if (principal) {
        // Cebra frente a la entrada.
        for (var z = 0; z < 5; z++) {
          p = punto(k, lay.puerta.t, di + 0.25 + z * (VIA - 0.5) / 4);
          a.caja(M.marcaVial, 0.8, 0.006, 0.14, p[0], Y_VIA + 0.003, p[1], giro(k), 0, false);
        }
      }
      // Carros estacionados contra el anden, lejos de la cebra.
      for (var c = 0; c < 2; c++) {
        var tc = (azar(ci * 3 + c, 17) - 0.5) * 1.3 * hc;
        if (principal && Math.abs(tc - lay.puerta.t) < 1.2) tc += tc > lay.puerta.t ? 1.2 : -1.2;
        if (Math.abs(tc) > hc - 0.6) continue;
        var carril = c % 2 ? di + 0.42 : dk - 0.42;
        p = punto(k, tc, carril);
        carro(a, M, p[0], p[1], giro(k) + (c % 2 ? 0 : Math.PI), colores[(ci * 2 + c) % 4]);
      }
      // Postes y arboles de anden, alternados.
      var ha = cuerda(b + ACERA / 2) - 0.5, i = 0;
      for (t = -ha; t <= ha; t += 1.7, i++) {
        if (principal && Math.abs(t - lay.puerta.t) < 0.9) continue;
        p = punto(k, t, b + ACERA / 2);
        if (i % 2) poste(a, M, p[0], p[1]);
        else arbol(a, M, p[0], p[1], 0.95, 0);
      }
      // Reja baja del lote, con hueco en la entrada.
      var largo = LADOS[k].eje === 'z' ? lay.hx : lay.hz, tr;
      for (tr = -largo; tr <= largo + 0.01; tr += 0.5) {
        if (principal && Math.abs(tr - lay.puerta.t) < 0.7) continue;
        p = punto(k, tr, b - 0.06);
        a.caja(M.blanco, 0.04, 0.34, 0.04, p[0], 0.17 + Y_LOTE, p[1]);
      }
      var tramos = principal
        ? [[-largo, lay.puerta.t - 0.7], [lay.puerta.t + 0.7, largo]]
        : [[-largo, largo]];
      tramos.forEach(function (tt) {
        if (tt[1] - tt[0] < 0.2) return;
        p = punto(k, (tt[0] + tt[1]) / 2, b - 0.06);
        var lw = tt[1] - tt[0];
        a.caja(M.blanco, lw, 0.04, 0.03, p[0], Y_LOTE + 0.3, p[1], giro(k));
        a.caja(M.blanco, lw, 0.03, 0.03, p[0], Y_LOTE + 0.15, p[1], giro(k));
      });
    });

    // Seto en los lados del lote que no dan a la calle, y vecinos detras.
    ['n', 's', 'o', 'e'].forEach(function (k, ki) {
      if (lay.calles.indexOf(k) >= 0) return;
      var b = borde(k), largo = LADOS[k].eje === 'z' ? lay.hx : lay.hz;
      for (var t = -largo; t < largo - 0.2; t += 1.75) {
        var seg = Math.min(1.6, largo - t);
        var p = punto(k, t + seg / 2, b - 0.14);
        a.caja(M.seto, seg, 0.32 + azar(t, ki) * 0.08, 0.28, p[0], Y_LOTE + 0.17, p[1], giro(k));
      }

      /* Vecinos. Del lado cercano a la camara van bajos (casitas con techo):
         un bloque de tres pisos ahi taparia la casa. Del lado lejano, bloques
         de apartamentos como telon de fondo. Los lados X no entran a las
         esquinas: esas son de los lados Z, o dos filas se pisarian. */
      var cerca = k === 's' || k === 'e';
      var tmin, tmax;
      if (LADOS[k].eje === 'x') { tmin = -lay.hz; tmax = lay.hz; }
      else {
        tmin = lay.calles.indexOf('o') >= 0 ? -lay.hx : -R;
        tmax = lay.calles.indexOf('e') >= 0 ? lay.hx : R;
      }
      var d0 = b + 0.5, t2 = tmin, i = 0;
      var muros = [M.edificio1, M.edificio2, M.edificio3, M.edificio4];
      var techos = [M.techoRojo, M.techo];
      while (t2 < tmax - 0.6) {
        var bw = 1.6 + azar(i, 11 + ki) * 1.0;
        var bd = cerca ? 1.3 : 1.7 + azar(i, 13 + ki) * 0.8;
        var tc = t2 + bw / 2;
        if (tc + bw / 2 > tmax) { bw = tmax - t2; tc = t2 + bw / 2; }
        var lim = Math.sqrt(Math.max(0, (R - 0.15) * (R - 0.15) - Math.pow(Math.abs(tc) + bw / 2, 2)));
        bd = Math.min(bd, lim - d0);
        var q = punto(k, tc, d0 + Math.max(bd, 0) / 2);
        if (bw >= 1.0 && bd >= 0.9) {
          if (cerca) casita(a, M, q[0], q[1], bw - 0.3, bd, giro(k), muros[i % 4], techos[i % 2]);
          else bloque(a, M, q[0], q[1], bw - 0.3, bd, 1.5 + azar(i, 19 + ki) * 1.9, giro(k), muros[i % 4], i + ki * 10);
        } else {
          var pa = punto(k, tc, d0 + 0.5);
          var dr = Math.sqrt(Math.pow(pa[0] - cx, 2) + Math.pow(pa[1] - cz, 2));
          if (dr < R - 0.5) arbol(a, M, pa[0], pa[1], 1.1 + azar(i, 29) * 0.3, i % 3);
        }
        t2 += bw + 0.3;
        i++;
      }
    });

    // Camino de la puerta al anden, con postes y arbustos de borde.
    var cm = lay.camino;
    a.caja(M.adoquin, cm.x1 - cm.x0 - 0.3, 0.02, cm.z1 - cm.z0 - 0, (cm.x0 + cm.x1) / 2, Y_ACERA - 0.005,
      (cm.z0 + cm.z1) / 2, 0, 0, false);
    var k0 = lay.lado, bc = borde(k0);
    var dCasa = LADOS[k0].eje === 'z' ? Math.abs(lay.puerta.z - cz) : Math.abs(lay.puerta.x - cx);
    [-0.62, 0.62].forEach(function (s) {
      var p = punto(k0, lay.puerta.t + s, dCasa + 1.4);
      poste(a, M, p[0], p[1] + 0);
      var q = punto(k0, lay.puerta.t + s * 1.05, bc - 0.9);
      arbusto(a, M, q[0], q[1], 0.9);
    });

    var grupo = a.grupo();
    extra.forEach(function (e) {
      var m = new THREE.Mesh(e.geo, e.mat);
      m.receiveShadow = true;
      grupo.add(m);
    });
    return grupo;
  }

  /* ---------- piezas para la escena ---------- */

  // Lo que la escena tiene que mostrar para esta lista de amenidades. Cada
  // pieza trae su clave y un `crear` perezoso: solo se construye lo nuevo.
  function piezas(lay, asig, M) {
    var out = [];
    out.push({ clave: 'entorno|base|' + lay.clave, clase: 'base', crear: function () { return base(lay, M); } });

    var ocupadas = {};
    Object.keys(asig.celdas).forEach(function (g) { ocupadas[asig.celdas[g]] = g; });
    var porId = {};
    lay.celdas.forEach(function (c) { porId[c.id] = c; });

    function enCelda(c, hacer, sem) {
      var ancho = c.w >= c.d;
      var a = acumulador();
      hacer(a, ancho ? c.w : c.d, ancho ? c.d : c.w, sem);
      var gr = a.grupo();
      gr.position.set(c.x, Y_LOTE, c.z);
      gr.rotation.y = ancho ? 0 : Math.PI / 2;
      return gr;
    }

    lay.celdas.forEach(function (c, i) {
      if (c.camino || ocupadas[c.id]) return;
      out.push({
        clave: 'entorno|rel|' + lay.clave + '|' + c.id, clase: 'rel',
        crear: function () {
          return enCelda(c, function (a, w, d, sem) { relleno(a, M, w, d, sem); }, i * 7 + 3);
        }
      });
    });

    asig.grupos.forEach(function (g) {
      if (g === 'pista') {
        out.push({ clave: 'entorno|am|' + lay.clave + '|pista', clase: 'am', crear: function () { return pista(lay, M); } });
        return;
      }
      if (g === 'lobby') {
        out.push({ clave: 'entorno|am|' + lay.clave + '|lobby', clase: 'am', crear: function () { return lobby(lay, M); } });
        return;
      }
      var c = porId[asig.celdas[g]];
      if (!c || !AMENIDAD[g]) return;
      var n = g === 'club' ? asig.club : 0;
      out.push({
        clave: 'entorno|am|' + lay.clave + '|' + g + '|' + c.id + '|' + n, clase: 'am',
        crear: function () {
          return enCelda(c, function (a, w, d, sem) { AMENIDAD[g](a, M, w, d, sem, n); }, c.id.length * 13 + 5);
        }
      });
    });
    return out;
  }

  // Pista de trote: un anillo con esquinas redondeadas por dentro del seto.
  function pista(lay, M) {
    var a = acumulador(), L = lay.L;
    var ins = 0.34, an = 0.28, r = 0.75;
    var X0 = L.x0 + ins, X1 = L.x1 - ins, Z0 = L.z0 + ins, Z1 = L.z1 - ins, y = 0.006;
    a.caja(M.pista, X1 - X0 - 2 * r, 0.012, an, (X0 + X1) / 2, y, Z0, 0, 0, false);
    a.caja(M.pista, X1 - X0 - 2 * r, 0.012, an, (X0 + X1) / 2, y, Z1, 0, 0, false);
    a.caja(M.pista, an, 0.012, Z1 - Z0 - 2 * r, X0, y, (Z0 + Z1) / 2, 0, 0, false);
    a.caja(M.pista, an, 0.012, Z1 - Z0 - 2 * r, X1, y, (Z0 + Z1) / 2, 0, 0, false);
    [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(function (q) {
      var ccx = q[0] > 0 ? X1 - r : X0 + r, ccz = q[1] > 0 ? Z1 - r : Z0 + r;
      var tc = Math.atan2(-q[1], q[0]);
      a.anillo(M.pista, r - an / 2, r + an / 2, tc - Math.PI / 4, Math.PI / 2, ccx, y + 0.006, ccz);
    });
    var g = a.grupo();
    g.position.y = Y_LOTE;
    return g;
  }

  // Porteria: portico sobre el camino en la reja y una caseta al lado.
  function lobby(lay, M) {
    var a = acumulador();
    var k = lay.lado, l = LADOS[k];
    var b = l.eje === 'z' ? lay.hz : lay.hx;
    var ry = l.eje === 'z' ? 0 : Math.PI / 2;
    function punto(t, dd) {
      return l.eje === 'z' ? [lay.cx + t, lay.cz + l.sg * dd] : [lay.cx + l.sg * dd, lay.cz + t];
    }
    var t = lay.puerta.t;
    [-0.62, 0.62].forEach(function (s) {
      [b - 0.15, b - 0.85].forEach(function (dd) {
        var p = punto(t + s, dd);
        a.caja(M.blanco, 0.07, 1.0, 0.07, p[0], 0.5, p[1]);
      });
    });
    var c = punto(t, b - 0.5);
    a.caja(M.blanco, 1.5, 0.08, 0.95, c[0], 1.04, c[1], ry);
    var f = punto(t, b - 0.02);
    a.caja(M.toldo3, 1.52, 0.12, 0.05, f[0], 1.0, f[1], ry);
    var s = punto(t + 1.35, b - 0.75);
    a.caja(M.blanco, 0.7, 0.75, 0.6, s[0], 0.375, s[1], ry);
    a.caja(M.ventanal, 0.72, 0.25, 0.62, s[0], 0.5, s[1], ry, 0, false);
    a.caja(M.techo, 0.85, 0.06, 0.75, s[0], 0.78, s[1], ry);
    var g = a.grupo();
    g.position.y = Y_LOTE;
    return g;
  }

  /* ---------- replanteo de obra (antes de la primera respuesta) ----------
     Lo primero que se hace en una obra: trazar en el suelo lo que se va a
     construir. Tiza en todos los bordes de la huella (se adivinan los
     ambientes), estacas y cuerda en el contorno, cinta de peligro alrededor de
     la losa y material acopiado. Se va al contestar la primera pregunta, cuando
     empieza a caer la vivienda de verdad. */

  // Contorno de la union de rectangulos: celdas de la grilla que forman sus
  // coordenadas, y un borde donde una celda de adentro toca una de afuera.
  function contorno(rects) {
    var xs = [], zs = [];
    rects.forEach(function (r) { xs.push(r.x, r.x + r.w); zs.push(r.z, r.z + r.d); });
    var uniq = function (a) {
      return a.sort(function (p, q) { return p - q; }).filter(function (v, i) { return i === 0 || v - a[i - 1] > 1e-6; });
    };
    xs = uniq(xs); zs = uniq(zs);
    var dentro = function (i, j) {
      if (i < 0 || j < 0 || i >= xs.length - 1 || j >= zs.length - 1) return false;
      var cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      return rects.some(function (r) { return cx > r.x && cx < r.x + r.w && cz > r.z && cz < r.z + r.d; });
    };
    var segs = [], i, j;
    for (i = 0; i < xs.length - 1; i++) {
      for (j = 0; j <= zs.length - 1; j++) {
        if (dentro(i, j - 1) !== dentro(i, j)) segs.push([xs[i], zs[j], xs[i + 1], zs[j]]);
      }
    }
    for (j = 0; j < zs.length - 1; j++) {
      for (i = 0; i <= xs.length - 1; i++) {
        if (dentro(i - 1, j) !== dentro(i, j)) segs.push([xs[i], zs[j], xs[i], zs[j + 1]]);
      }
    }
    // Fundir los colineales contiguos: las estacas van en las esquinas reales.
    var cambio = true;
    while (cambio) {
      cambio = false;
      for (i = 0; i < segs.length && !cambio; i++) {
        for (j = 0; j < segs.length && !cambio; j++) {
          if (i === j) continue;
          var a = segs[i], b = segs[j];
          var hz = a[1] === a[3] && b[1] === b[3] && a[1] === b[1];
          var vt = a[0] === a[2] && b[0] === b[2] && a[0] === b[0];
          if ((hz || vt) && Math.abs(a[2] - b[0]) < 1e-6 && Math.abs(a[3] - b[1]) < 1e-6) {
            segs[i] = [a[0], a[1], b[2], b[3]];
            segs.splice(j, 1);
            cambio = true;
          }
        }
      }
    }
    return segs;
  }

  function linea(a, mat, x0, z0, x1, z1, grosor, alto, y, sombra) {
    var L = Math.sqrt((x1 - x0) * (x1 - x0) + (z1 - z0) * (z1 - z0));
    if (L < 0.01) return;
    var ry = -Math.atan2(z1 - z0, x1 - x0);
    a.caja(mat, L, alto, grosor, (x0 + x1) / 2, y, (z0 + z1) / 2, ry, 0, sombra);
  }

  function obra(plan, lote) {
    var M = window.GDF3D.materiales();
    var rects = (plan.huella || []).map(function (r) {
      var s = plan.scale || 1;
      return { x: r.x * s, z: r.z * s, w: r.w * s, d: r.d * s };
    });
    if (!rects.length) return [];
    var out = [];

    // 1. Tiza: todos los bordes de la huella, finos, a ras de losa.
    var tiza = acumulador();
    rects.forEach(function (r) {
      linea(tiza, M.tiza, r.x, r.z, r.x + r.w, r.z, 0.03, 0.004, 0.002, false);
      linea(tiza, M.tiza, r.x, r.z + r.d, r.x + r.w, r.z + r.d, 0.03, 0.004, 0.002, false);
      linea(tiza, M.tiza, r.x, r.z, r.x, r.z + r.d, 0.03, 0.004, 0.002, false);
      linea(tiza, M.tiza, r.x + r.w, r.z, r.x + r.w, r.z + r.d, 0.03, 0.004, 0.002, false);
    });
    out.push({ clave: 'obra|tiza', grupo: tiza.grupo(), ambiente: 'obra1' });

    // 2. Estacas en las esquinas del contorno, con cuerda tensada entre ellas.
    var est = acumulador();
    var esquinas = {};
    contorno(rects).forEach(function (s) {
      linea(est, M.cuerda, s[0], s[1], s[2], s[3], 0.012, 0.012, 0.26, false);
      linea(est, M.tizaAzul, s[0], s[1], s[2], s[3], 0.05, 0.005, 0.004, false);
      esquinas[s[0].toFixed(2) + ',' + s[1].toFixed(2)] = [s[0], s[1]];
      esquinas[s[2].toFixed(2) + ',' + s[3].toFixed(2)] = [s[2], s[3]];
    });
    Object.keys(esquinas).forEach(function (k) {
      var p = esquinas[k];
      est.caja(M.estaca, 0.05, 0.34, 0.05, p[0], 0.17, p[1]);
      est.caja(M.toldo1, 0.055, 0.05, 0.055, p[0], 0.32, p[1]);
    });
    out.push({ clave: 'obra|estacas', grupo: est.grupo(), ambiente: 'obra2' });

    // 3. Cinta de peligro sobre postes, por el borde de la losa. Franjas
    // alternas amarillo/negro: con una sola tira amarilla no se lee "obra".
    var cin = acumulador();
    var ins = 0.18;
    var X0 = lote.x0 + ins, X1 = lote.x1 - ins, Z0 = lote.z0 + ins, Z1 = lote.z1 - ins;
    var lados = [[X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X1, Z1, X0, Z1], [X0, Z1, X0, Z0]];
    lados.forEach(function (l) {
      var L = Math.abs(l[2] - l[0]) + Math.abs(l[3] - l[1]);
      var n = Math.max(1, Math.round(L / 1.6));
      var ux = (l[2] - l[0]) / L, uz = (l[3] - l[1]) / L;
      for (var i = 0; i < n; i++) {
        var px = l[0] + ux * L * i / n, pz = l[1] + uz * L * i / n;
        cin.cil(M.conoObra, 0.025, 0.03, 0.55, 6, px, 0.275, pz);
        cin.cil(M.cuerda, 0.07, 0.08, 0.03, 8, px, 0.015, pz);
      }
      var tramo = 0.18, k = 0;
      for (var t = 0; t < L - 0.01; t += tramo, k++) {
        var t1 = Math.min(L, t + tramo);
        linea(cin, k % 2 ? M.cintaNegra : M.cintaAmarilla,
          l[0] + ux * t, l[1] + uz * t, l[0] + ux * t1, l[1] + uz * t1, 0.012, 0.06, 0.48, false);
      }
    });
    out.push({ clave: 'obra|cinta|' + [X0, X1, Z0, Z1].map(function (v) { return v.toFixed(2); }).join(','), grupo: cin.grupo(), ambiente: 'obra3' });

    /* 4. Material acopiado, DENTRO de la huella hacia la esquina de la
       camara: ladrillos en estiba, cemento, arena, varilla, mezcladora y
       carretilla. Se arma en coordenadas locales y se agranda entero: a
       escala real, con la camara encuadrando la losa completa, quedaba en
       unos pixeles que no se leian como nada. */
    var mat = acumulador();
    var f, c, h;
    mat.caja(M.estaca, 1.0, 0.07, 0.6, 0, 0.035, 0);
    for (f = 0; f < 4; f++) {
      for (c = 0; c < 4; c++) {
        for (h = 0; h < 4 - (f === 3 ? 1 : 0); h++) {
          mat.caja(M.ladrillo, 0.21, 0.07, 0.11, -0.33 + c * 0.22 + (h % 2) * 0.04, 0.11 + h * 0.074, -0.17 + f * 0.115);
        }
      }
    }
    [[0, 0, 0], [0.38, 0, 0.1], [0.19, 0.13, -0.08]].forEach(function (p) {
      mat.caja(M.cemento, 0.36, 0.13, 0.52, -1.05 + p[0], 0.065 + p[1], -0.9, p[2]);
    });
    mat.cono(M.arena, 0.55, 0.4, 10, 0.6, 0.2, -1.2);
    // Varilla: un atado de barras largas sobre dos tacos.
    mat.caja(M.estaca, 0.08, 0.06, 0.3, -0.95, 0.03, -1.55);
    mat.caja(M.estaca, 0.08, 0.06, 0.3, 0.0, 0.03, -1.55);
    for (var v = 0; v < 6; v++) {
      mat.cil(M.metal, 0.016, 0.016, 1.3, 5, -0.47, 0.08 + (v % 2) * 0.03, -1.62 + v * 0.028, Math.PI / 2, Math.PI / 2);
    }
    // Mezcladora: tambor inclinado sobre un chasis con rueda.
    mat.caja(M.metal, 0.5, 0.06, 0.3, 1.1, 0.25, 0.5);
    mat.caja(M.metal, 0.05, 0.25, 0.05, 0.9, 0.12, 0.5);
    mat.toro(M.llanta, 0.1, 0.03, 1.3, 0.1, 0.5, Math.PI / 2);
    mat.cil(M.conoObra, 0.2, 0.26, 0.45, 12, 1.1, 0.55, 0.5, 0.6);
    mat.cil(M.conoObra, 0.08, 0.2, 0.14, 12, 1.1, 0.83, 0.35, 0.6);
    // Carretilla: batea inclinada, rueda y dos varas.
    var cx = -0.95, cz = 0.25;
    mat.caja(M.conoObra, 0.6, 0.18, 0.42, cx, 0.33, cz, 0.4, 0);
    mat.toro(M.llanta, 0.11, 0.035, cx + 0.4 * Math.cos(0.4), 0.13, cz - 0.4 * Math.sin(0.4), 0.4);
    [-0.13, 0.13].forEach(function (o) {
      var r = rot(-0.35, o, 0.4);
      mat.caja(M.metal, 0.5, 0.025, 0.025, cx + r[0], 0.3, cz + r[1], 0.4);
    });
    var hx0 = Infinity, hx1 = -Infinity, hz0 = Infinity, hz1 = -Infinity;
    rects.forEach(function (r) {
      hx0 = Math.min(hx0, r.x); hx1 = Math.max(hx1, r.x + r.w);
      hz0 = Math.min(hz0, r.z); hz1 = Math.max(hz1, r.z + r.d);
    });
    var ESC = 1.5;
    var bx = Math.max((hx0 + hx1) / 2, hx1 - 2.2), bz = Math.max((hz0 + hz1) / 2, hz1 - 1.3);
    var dentro = mat.grupo();
    dentro.scale.setScalar(ESC);
    dentro.position.set(bx, 0, bz);
    // Contenedor en el origen: la animacion de entrada mueve la posicion del
    // grupo de la pieza, y pisaria la del acopio.
    var acopio = new THREE.Group();
    acopio.add(dentro);
    out.push({ clave: 'obra|material|' + bx.toFixed(2) + ',' + bz.toFixed(2), grupo: acopio, ambiente: 'obra4' });

    // Conos en las esquinas de la cinta y el nivel del topografo en la
    // opuesta al acopio: es el que hizo el replanteo.
    var con = acumulador();
    [[X1 - 0.3, Z0 + 0.3], [X0 + 0.3, Z1 - 0.3], [X1 - 0.3, Z1 - 0.3]].forEach(function (p) {
      con.caja(M.cuerda, 0.3, 0.03, 0.3, p[0], 0.015, p[1]);
      con.cono(M.conoObra, 0.12, 0.48, 10, p[0], 0.27, p[1]);
      con.cil(M.blanco, 0.075, 0.09, 0.07, 10, p[0], 0.28, p[1]);
    });
    var tx = X0 + 0.55, tz = Z0 + 0.55;
    [0, 2.1, 4.2].forEach(function (g) {
      con.caja(M.metal, 0.03, 0.9, 0.03, tx + Math.cos(g) * 0.16, 0.44, tz + Math.sin(g) * 0.16, -g, 0.2);
    });
    con.caja(M.cintaAmarilla, 0.24, 0.15, 0.15, tx, 0.95, tz);
    con.cil(M.red, 0.045, 0.045, 0.22, 8, tx, 0.97, tz + 0.15, Math.PI / 2);
    out.push({ clave: 'obra|conos|' + [X0, X1, Z0, Z1].map(function (v) { return v.toFixed(2); }).join(','), grupo: con.grupo(), ambiente: 'obra4' });

    return out;
  }

  window.GDF3D = window.GDF3D || {};
  window.GDF3D.entorno = { disponer: disponer, asignar: asignar, piezas: piezas, grupos: grupos };
  window.GDF3D.obra = obra;
})();
