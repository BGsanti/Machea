/* Mobiliario con primitivas: cajas y cilindros, sin assets externos, sin
   licencias que verificar y sin pipeline de compresion. A la distancia de camara
   de este panel es lo que se lee — lo que importa es la silueta y el tamano
   relativo, no el detalle.

   Puerto de `src/scene/Furniture.tsx`. Las proporciones estan afinadas contra
   capturas, asi que conviene no tocarlas a ojo. */
(function () {
  'use strict';

  var THREE = window.GDF3DLibs.THREE;

  function caja(w, h, d, mat, x, y, z, sombra) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (sombra !== false) { m.castShadow = true; m.receiveShadow = true; }
    return m;
  }

  /* Varias cajas en UNA geometria: una sola llamada de dibujo en vez de una
     por caja. Para piezas repetidas y chicas, como las cuatro patas de cada
     silla, que sueltas sumaban decenas de dibujos por plano. */
  function unirCajas(cajas) {
    var pos = [], nor = [], uv = [], idx = [], base = 0;
    cajas.forEach(function (c) {
      var g = new THREE.BoxGeometry(c[0], c[1], c[2]);
      g.translate(c[3], c[4], c[5]);
      Array.prototype.push.apply(pos, g.attributes.position.array);
      Array.prototype.push.apply(nor, g.attributes.normal.array);
      Array.prototype.push.apply(uv, g.attributes.uv.array);
      var ix = g.index.array;
      for (var i = 0; i < ix.length; i++) idx.push(ix[i] + base);
      base += g.attributes.position.count;
      g.dispose();
    });
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setIndex(idx);
    return out;
  }

  // Cuatro patas bajo un asiento de w x d, del piso a `alto`.
  function patas(w, d, alto, mat) {
    var g = 0.045, mx = w / 2 - g / 2 - 0.03, mz = d / 2 - g / 2 - 0.03;
    var cajas = [[-mx, -mz], [mx, -mz], [-mx, mz], [mx, mz]].map(function (p) {
      return [g, alto, g, p[0], alto / 2, p[1]];
    });
    var m = new THREE.Mesh(unirCajas(cajas), mat);
    m.castShadow = true;
    return m;
  }

  /* Las piezas altas se topan contra el muro. No es cosmetico: los muros son de
     casa de munecas (1.3 m), y un closet de 2 m asoma por encima como si
     atravesara el techo. Se derivan del muro en vez de ser fijas, asi que
     cambiar `alturaMuro` no vuelve a romperlas. */
  function piezas(M, techo) {
    var tope = function (h) { return Math.min(h, techo); };
    return {
      cama: function (w, d) {
        var g = new THREE.Group();
        var almohada = Math.min(0.35, d * 0.18);
        /* La base va metida hacia dentro para que el colchon vuele sobre ella.
           Al ras, el marco rodea al colchon y la cama se lee como un cajon con
           algo blanco adentro. */
        g.add(caja(w * 0.9, 0.28, d * 0.94, M.marco, 0, 0.14, 0));
        g.add(caja(w, 0.26, d - almohada, M.linoBlanco, 0, 0.41, almohada / 2));
        g.add(caja(w * 0.88, 0.14, almohada, M.linoAzul, 0, 0.47, -d / 2 + almohada / 2));
        g.add(caja(w, 0.9, 0.06, M.marco, 0, 0.45, -d / 2 - 0.03));
        // Cojin de acento: sin el, la cama es puro lino/madera y no hay
        // ningun punto de color con el que el ojo se quede.
        if (w > 0.9) {
          var cw = Math.min(0.32, w * 0.22);
          g.add(caja(cw, 0.1, cw, M.cojinAcento, -w / 2 + cw * 0.7, 0.48, -d / 2 + almohada * 0.7));
        }
        return g;
      },
      sofa: function (w, d) {
        var g = new THREE.Group();
        var brazo = Math.min(0.22, w * 0.12);
        g.add(caja(w, 0.4, d, M.tela, 0, 0.2, 0));
        g.add(caja(w, 0.4, 0.3, M.tela, 0, 0.5, -d / 2 + 0.15));
        g.add(caja(brazo, 0.3, d, M.tela, -w / 2 + brazo / 2, 0.5, 0));
        g.add(caja(brazo, 0.3, d, M.tela, w / 2 - brazo / 2, 0.5, 0));
        // Dos cojines de acento contra el respaldo: es lo que corta la
        // franja de tela lisa mas grande de toda la escena.
        var cj = Math.min(0.26, d * 0.4);
        [-1, 1].forEach(function (lado) {
          g.add(caja(
            cj, cj * 0.85, cj, M.cojinAcento,
            lado * Math.min(w * 0.28, w / 2 - brazo - cj * 0.6), 0.48, -d / 2 + 0.28
          ));
        });
        return g;
      },
      mesa: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 0.06, d, M.linoBlanco, 0, 0.72, 0));
        var r = Math.min(w, d);
        var pie = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.12, r * 0.16, 0.72, 12), M.marco
        );
        pie.position.y = 0.36;
        pie.castShadow = true;
        g.add(pie);
        return g;
      },
      silla: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 0.08, d, M.telaAcento, 0, 0.44, 0));
        g.add(caja(w, 0.48, 0.08, M.telaAcento, 0, 0.68, -d / 2 + 0.05));
        // Sin patas el asiento flotaba a 40 cm del piso.
        g.add(patas(w, d, 0.4, M.marco));
        return g;
      },
      meson: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 0.88, d, M.linoBlanco, 0, 0.44, 0));
        g.add(caja(w + 0.04, 0.05, d + 0.04, M.meson, 0, 0.9, 0));
        return g;
      },
      estufa: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 0.88, d, M.linoBlanco, 0, 0.44, 0));
        g.add(caja(w, 0.04, d, M.electro, 0, 0.9, 0));
        return g;
      },
      nevera: function (w, d) {
        var g = new THREE.Group();
        var h = tope(1.8);
        g.add(caja(w, h, d, M.electro, 0, h / 2, 0));
        return g;
      },
      closet: function (w, d) {
        var g = new THREE.Group();
        var h = tope(2);
        g.add(caja(w, h, d, M.marco, 0, h / 2, 0));
        return g;
      },
      /* Biblioteca BAJA. Reusar el closet la volvia un bloque hasta el techo
         en medio del estudio; a 1 m, con dos entrepanos claros, se lee como
         mueble de libros y no tapa el ambiente. */
      biblioteca: function (w, d) {
        var g = new THREE.Group();
        var h = tope(1.0);
        g.add(caja(w, h, d, M.marco, 0, h / 2, 0));
        g.add(new THREE.Mesh(unirCajas([
          [w * 0.94, 0.025, d + 0.01, 0, h / 3, 0],
          [w * 0.94, 0.025, d + 0.01, 0, h * 2 / 3, 0]
        ]), M.moldura));
        return g;
      },
      escritorio: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 0.05, d, M.marco, 0, 0.74, 0));
        g.add(caja(0.05, 0.74, d, M.marco, -w / 2 + 0.04, 0.37, 0));
        g.add(caja(0.05, 0.74, d, M.marco, w / 2 - 0.04, 0.37, 0));
        return g;
      },
      inodoro: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w * 0.75, 0.4, d * 0.7, M.porcelana, 0, 0.2, 0.05));
        g.add(caja(w * 0.85, 0.55, 0.18, M.porcelana, 0, 0.45, -d / 2 + 0.09));
        return g;
      },
      lavamanos: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 0.84, d, M.linoBlanco, 0, 0.42, 0));
        g.add(caja(w + 0.03, 0.06, d + 0.03, M.porcelana, 0, 0.87, 0));
        return g;
      },
      ducha: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 0.08, d, M.porcelana, 0, 0.04, 0, false));
        // Mamparas: sin sombra, o el vidrio proyecta una mancha opaca.
        var hm = tope(2);
        g.add(caja(w, hm, 0.03, M.vidrio, 0, 0.05 + hm / 2, d / 2, false));
        g.add(caja(0.03, hm, d, M.vidrio, w / 2, 0.05 + hm / 2, 0, false));
        return g;
      },
      /* Mueble de TV. Reusar `meson` para esto se veia mal: un bloque de 0.88 m
         de alto y metro y medio de largo domina la sala entera. Una consola baja
         con el panel encima ocupa el muro sin robarse el cuadro. */
      consola: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 0.4, d, M.marco, 0, 0.2, 0));
        var esX = w >= d;
        var pw = esX ? w * 0.7 : 0.04;
        var pd = esX ? 0.04 : d * 0.7;
        g.add(caja(pw, 0.5, pd, M.electro, 0, 0.67, 0));
        return g;
      },
      tapete: function (w, d) {
        var g = new THREE.Group();
        var m = caja(w, 0.024, d, M.tapete, 0, 0.012, 0, false);
        m.receiveShadow = true;
        g.add(m);
        return g;
      },
      planta: function (w, d) {
        var g = new THREE.Group();
        var r = Math.min(w, d) / 2;
        var maceta = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.7, r * 0.55, 0.4, 12), M.marco
        );
        maceta.position.y = 0.2;
        maceta.castShadow = true;
        g.add(maceta);
        var hojas = new THREE.Mesh(new THREE.SphereGeometry(r * 1.15, 12, 10), M.follaje);
        hojas.position.y = 0.85;
        hojas.castShadow = true;
        g.add(hojas);
        return g;
      }
    };
  }

  // Los `kind` del FloorPlan vienen en ingles del prototipo; el constructor
  // esta en espanol como el resto de este modulo.
  var NOMBRES = {
    bed: 'cama', sofa: 'sofa', table: 'mesa', chair: 'silla', counter: 'meson',
    stove: 'estufa', fridge: 'nevera', wardrobe: 'closet', desk: 'escritorio',
    toilet: 'inodoro', sink: 'lavamanos', shower: 'ducha', rug: 'tapete',
    plant: 'planta', console: 'consola', shelf: 'biblioteca'
  };

  var cache = null, cacheTecho = null;

  /* Una pieza a la vez, no la habitacion entera: la escena diferencia plano
     contra plano y necesita poder quedarse con un mueble que no cambio. */
  function mueble(item, scale, techo) {
    var t = techo || 2.2;
    if (!cache || cacheTecho !== t) {
      cache = piezas(window.GDF3D.materiales(), t);
      cacheTecho = t;
    }
    var hacer = cache[NOMBRES[item.kind]];
    if (!hacer) return null;

    var s = scale || 1;
    var g = hacer(item.size[0] * s, item.size[1] * s);
    g.position.set(item.position[0] * s, 0, item.position[1] * s);
    g.rotation.y = -THREE.MathUtils.degToRad(item.rotation || 0);
    g.userData.mueble = item.id;
    return g;
  }

  window.GDF3D = window.GDF3D || {};
  window.GDF3D.mueble = mueble;
  window.GDF3D.unirCajas = unirCajas;
})();
