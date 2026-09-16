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

  function piezas(M) {
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
        return g;
      },
      sofa: function (w, d) {
        var g = new THREE.Group();
        var brazo = Math.min(0.22, w * 0.12);
        g.add(caja(w, 0.4, d, M.tela, 0, 0.2, 0));
        g.add(caja(w, 0.4, 0.3, M.tela, 0, 0.5, -d / 2 + 0.15));
        g.add(caja(brazo, 0.3, d, M.tela, -w / 2 + brazo / 2, 0.5, 0));
        g.add(caja(brazo, 0.3, d, M.tela, w / 2 - brazo / 2, 0.5, 0));
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
        g.add(caja(w, 1.8, d, M.electro, 0, 0.9, 0));
        return g;
      },
      closet: function (w, d) {
        var g = new THREE.Group();
        g.add(caja(w, 2, d, M.marco, 0, 1, 0));
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
        g.add(caja(w, 2, 0.03, M.vidrio, 0, 1.05, d / 2, false));
        g.add(caja(0.03, 2, d, M.vidrio, w / 2, 1.05, 0, false));
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
    plant: 'planta'
  };

  var cache = null;

  /* Una pieza a la vez, no la habitacion entera: la escena diferencia plano
     contra plano y necesita poder quedarse con un mueble que no cambio. */
  function mueble(item, scale) {
    if (!cache) cache = piezas(window.GDF3D.materiales());
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
})();
