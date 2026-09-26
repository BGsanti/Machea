/* Materiales y texturas procedurales. Puerto de `src/scene/{materials,textures}.ts`.

   Los materiales son singletons de modulo: compartir uno entre todas las mallas
   que lo usan evita que el renderer re-suba uniformes por objeto y evita
   asignar memoria dentro del bucle de dibujo. */
(function () {
  'use strict';

  var THREE = window.GDF3DLibs.THREE;

  /* Tamano fisico que cubre el lienzo, en metros. Las UV de los pisos vienen en
     metros (son ShapeGeometry, cuyas UV por defecto son la X/Y del vertice), asi
     que esto es lo que mantiene tablas y baldosas del mismo tamano real en
     habitaciones de cualquier forma. */
  var PARCHE = 2;
  var PX = 512;

  /* Variacion determinista por celda. Un PRNG de verdad romperia la continuidad
     del mosaico entre repeticiones: la funcion tiene que ser periodica. */
  function ruido(a, b) {
    var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function lienzo() {
    var el = document.createElement('canvas');
    el.width = PX; el.height = PX;
    return { el: el, ctx: el.getContext('2d') };
  }

  function terminar(el) {
    var t = new THREE.CanvasTexture(el);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    /* Las juntas son lineas finas de alto contraste: vistas en escorzo alias an
       en moire que se arrastra, salvo que el muestreo tome varias muestras a lo
       largo del eje comprimido. */
    t.anisotropy = 16;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.repeat.set(1 / PARCHE, 1 / PARCHE);
    return t;
  }

  function rgb(c, s, k) {
    return 'rgb(' + Math.round(c[0] + s) + ',' + Math.round(c[1] + s * (k || 0.8)) + ',' + Math.round(c[2] + s * (k || 0.8) * 0.75) + ')';
  }

  /* Tablas corridas. `c` es el color medio de la tabla; la junta y la veta
     salen de oscurecerlo, asi un solo parametro da madera clara u oscura. */
  function texturaMadera(c, filas) {
    var l = lienzo(), ctx = l.ctx;
    filas = filas || 10;
    var altoFila = PX / filas, tabla = PX / 2;

    ctx.fillStyle = rgb(c, -52);
    ctx.fillRect(0, 0, PX, PX);

    for (var f = 0; f < filas; f++) {
      var off = ruido(f, 3) * tabla;
      for (var x = off - tabla; x < PX; x += tabla) {
        var s = ruido(f, Math.round(x)) * 26 - 13;
        ctx.fillStyle = rgb(c, s);
        ctx.fillRect(x, f * altoFila, tabla - 1.5, altoFila - 1.5);

        ctx.strokeStyle = 'rgba(70, 48, 28, 0.16)';
        ctx.lineWidth = 1;
        for (var g = 0; g < 3; g++) {
          var gy = f * altoFila + ruido(f + g, x) * altoFila;
          ctx.beginPath();
          ctx.moveTo(x, gy);
          ctx.lineTo(x + tabla, gy);
          ctx.stroke();
        }
      }
    }
    return terminar(l.el);
  }

  /* Parque en tejido de cesta: bloques de 4 tablillas, alternando horizontal
     y vertical como un tablero. Con 4x4 bloques el mosaico repite limpio. */
  function texturaParque(c) {
    var l = lienzo(), ctx = l.ctx;
    var n = 4, lado = PX / n, tab = lado / 4;
    ctx.fillStyle = rgb(c, -40);
    ctx.fillRect(0, 0, PX, PX);
    for (var by = 0; by < n; by++) {
      for (var bx = 0; bx < n; bx++) {
        var horiz = (bx + by) % 2 === 0;
        for (var k = 0; k < 4; k++) {
          ctx.fillStyle = rgb(c, ruido(bx * 7 + k, by) * 30 - 15);
          if (horiz) ctx.fillRect(bx * lado + 1, by * lado + k * tab + 1, lado - 2, tab - 2);
          else ctx.fillRect(bx * lado + k * tab + 1, by * lado + 1, tab - 2, lado - 2);
        }
      }
    }
    return terminar(l.el);
  }

  // Baldosas con junta. `c` color medio, `n` baldosas por lado del parche.
  function texturaCeramica(c, n, junta) {
    var l = lienzo(), ctx = l.ctx;
    c = c || [216, 212, 204];
    n = n || 5;
    var lado = PX / n, j = junta || 2;

    ctx.fillStyle = rgb(c, -45, 1);
    ctx.fillRect(0, 0, PX, PX);

    for (var ty = 0; ty < n; ty++) {
      for (var tx = 0; tx < n; tx++) {
        var s = ruido(tx, ty) * 14 - 7;
        ctx.fillStyle = rgb(c, s, 1);
        ctx.fillRect(tx * lado + j, ty * lado + j, lado - j * 2, lado - j * 2);
      }
    }
    return terminar(l.el);
  }

  /* Marmol: baldosa blanca con vetas grises. Las vetas se recortan a SU
     baldosa: una que cruzara el borde del lienzo romperia el mosaico. */
  function texturaMarmol() {
    var l = lienzo(), ctx = l.ctx;
    var n = 3, lado = PX / n;
    ctx.fillStyle = '#b9b7b2';
    ctx.fillRect(0, 0, PX, PX);
    for (var ty = 0; ty < n; ty++) {
      for (var tx = 0; tx < n; tx++) {
        var x0 = tx * lado + 1.5, y0 = ty * lado + 1.5, w = lado - 3;
        ctx.fillStyle = 'rgb(' + (238 + ruido(tx, ty) * 10) + ',237,233)';
        ctx.fillRect(x0, y0, w, w);
        ctx.save();
        ctx.beginPath(); ctx.rect(x0, y0, w, w); ctx.clip();
        for (var v = 0; v < 3; v++) {
          ctx.strokeStyle = 'rgba(120,120,125,' + (0.18 + ruido(tx + v, ty) * 0.2) + ')';
          ctx.lineWidth = 0.8 + ruido(v, tx + ty) * 1.6;
          ctx.beginPath();
          var y = y0 + ruido(tx * 3 + v, ty) * w;
          ctx.moveTo(x0, y);
          for (var s = 1; s <= 6; s++) {
            y += (ruido(tx + s, ty * 5 + v) - 0.5) * w * 0.35;
            ctx.lineTo(x0 + w * s / 6, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    return terminar(l.el);
  }

  function mat(color, rug, metal) {
    return new THREE.MeshStandardMaterial({ color: color, roughness: rug, metalness: metal || 0 });
  }

  var materiales = null;
  var pisos = null;

  /* Perezoso: las texturas necesitan `document.createElement`, y estos modulos
     se cargan antes de que exista la escena. */
  function init() {
    if (materiales) return;
    materiales = {
      /* Gris frio a proposito, pero CLARO. Los muros blancos se lavaban contra
         los pisos vistos desde arriba y las divisiones dejaban de leerse; un
         gris calido quedaba demasiado cerca en luminosidad de la madera. El
         frio separa por tono y por valor a la vez.
         Mas claro que en el prototipo de React porque aqui no hay HDRI: con
         solo luces directas el mismo hex renderiza bastante mas oscuro, y sobre
         el crema de la experiencia se leia pesado. */
      muro: mat('#bcc1c4', 0.9),
      // El lote, no asfalto: sobre fondo crema un gris oscuro pesa demasiado.
      base: mat('#b3b0a9', 0.95),
      marco: mat('#8a6a4a', 0.6),
      // Antes casi sin color (#d8d3c8/#b9c6cc): a la distancia de camara del
      // panel se leia como una casa de muestra sin amoblar. Terracota y verde
      // azulado son el mismo nivel de saturacion que la madera del piso, asi
      // que compiten con ella en vez de apagarse al lado.
      tela: mat('#c1734a', 0.85),
      telaAcento: mat('#3f7a78', 0.85),
      cojinAcento: mat('#d99a3a', 0.8),
      linoAzul: mat('#7fa6c2', 0.9),
      linoBlanco: mat('#eceae4', 0.95),
      meson: mat('#e8e6e0', 0.4),
      electro: mat('#5c5f63', 0.35, 0.6),
      porcelana: mat('#f6f6f4', 0.25),
      vidrio: new THREE.MeshStandardMaterial({
        color: '#cfe0e6', roughness: 0.05, metalness: 0,
        transparent: true, opacity: 0.28
      }),
      tapete: mat('#a8552f', 0.95),
      follaje: mat('#4d7a3f', 0.9),
      /* Entorno (entorno.js): se ve con la camara alejada, asi que manda la
         lectura por color, no la sutileza de los acabados interiores. Verdes
         distintos por capa (barrio, lote, copas) o todo se funde en una
         mancha. Las copas van facetadas: estilo maqueta, no follaje. */
      asfalto: mat('#55585c', 0.95),
      marcaVial: mat('#e8e4d8', 0.5),
      bordillo: mat('#b9b4aa', 0.9),
      acera: mat('#d6d1c6', 0.9),
      adoquin: mat('#cdb28a', 0.85),
      deck: mat('#c89a6a', 0.75),
      tronco: mat('#6b4a2a', 0.85),
      pasto: mat('#7da45a', 0.95),
      pastoLote: mat('#93bb66', 0.95),
      tierra: mat('#8a6647', 1),
      seto: mat('#4f8a44', 0.9),
      copa: new THREE.MeshStandardMaterial({ color: '#5b9a48', roughness: 0.9, flatShading: true }),
      copaClara: new THREE.MeshStandardMaterial({ color: '#86b852', roughness: 0.9, flatShading: true }),
      copaOscura: new THREE.MeshStandardMaterial({ color: '#3d7446', roughness: 0.9, flatShading: true }),
      flor1: mat('#e8658c', 0.8), flor2: mat('#f4c247', 0.8), flor3: mat('#a98be6', 0.8),
      agua: new THREE.MeshStandardMaterial({
        color: '#45b4e0', roughness: 0.08, metalness: 0.1, emissive: '#0e4a66', emissiveIntensity: 0.35
      }),
      aguaClara: mat('#bfeaf7', 0.2),
      arena: mat('#e6d19c', 1),
      canchaVerde: mat('#4f9e6c', 0.8),
      canchaAzul: mat('#3c7cc4', 0.7),
      canchaBorde: mat('#c96f4a', 0.85),
      pista: mat('#c95a40', 0.9),
      pisoJuegos: mat('#6fb3a8', 0.9),
      red: mat('#2d3033', 0.8),
      blanco: mat('#f3f1eb', 0.6),
      metal: mat('#6d7277', 0.4, 0.5),
      farol: new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffe2a0', emissiveIntensity: 0.6 }),
      ventanal: mat('#3e5668', 0.2, 0.3),
      techo: mat('#8b8e91', 0.85),
      techoRojo: mat('#b9573f', 0.85),
      clubMuro: mat('#efe3cf', 0.85),
      edificio1: mat('#e6d8c3', 0.9), edificio2: mat('#cbb8a2', 0.9),
      edificio3: mat('#c4d0d4', 0.9), edificio4: mat('#ecc9a2', 0.9),
      toldo1: mat('#dd5a4e', 0.8), toldo2: mat('#2f9487', 0.8), toldo3: mat('#f1a73a', 0.8),
      auto1: mat('#d64a3c', 0.45, 0.2), auto2: mat('#3f6fba', 0.45, 0.2),
      auto3: mat('#f1efe9', 0.45, 0.2), auto4: mat('#f2b93b', 0.45, 0.2),
      llanta: mat('#2b2d30', 0.8),
      pantalla: new THREE.MeshStandardMaterial({
        color: '#f7e7c4', roughness: 0.8, emissive: '#f3c77a', emissiveIntensity: 0.45
      }),
      // Replanteo de obra (paso 0, `GDF3D.obra` en entorno.js).
      tiza: mat('#f4f1ea', 0.9),
      tizaAzul: mat('#4d8fd6', 0.9),
      cuerda: mat('#e0d2b0', 0.9),
      estaca: mat('#a77c4f', 0.85),
      conoObra: mat('#f26b1d', 0.7),
      cintaAmarilla: mat('#f6c928', 0.6),
      cintaNegra: mat('#26272a', 0.6),
      ladrillo: mat('#b8573a', 0.9),
      cemento: mat('#cfcac0', 0.95),
      // Madera clara: una hoja casi blanca no se distingue del muro donde va.
      puerta: mat('#d9bd97', 0.65),
      // Mas claro que los muros, para que el marco se lea como pieza aparte.
      moldura: mat('#e9e6e0', 0.7)
    };
    pisos = {
      // Color base blanco: el mapa lleva el color, no lo tine el material.
      wood: new THREE.MeshStandardMaterial({ map: texturaMadera([138, 103, 64]), roughness: 0.75 }),
      tile: new THREE.MeshStandardMaterial({ map: texturaCeramica(), roughness: 0.4 }),
      // Acabados por nivel de ingresos (ver `acabado` en floorplan.js).
      ceramic: new THREE.MeshStandardMaterial({ map: texturaCeramica([206, 190, 164], 4, 2.5), roughness: 0.5 }),
      woodLight: new THREE.MeshStandardMaterial({ map: texturaMadera([196, 162, 118], 9), roughness: 0.7 }),
      parquet: new THREE.MeshStandardMaterial({ map: texturaParque([112, 74, 44]), roughness: 0.55 }),
      marble: new THREE.MeshStandardMaterial({ map: texturaMarmol(), roughness: 0.18 }),
      stone: mat('#c8c4bc', 0.6)
    };
  }

  window.GDF3D = window.GDF3D || {};
  window.GDF3D.materiales = function () { init(); return materiales; };
  window.GDF3D.materialPiso = function (acabado) { init(); return pisos[acabado || 'wood']; };
})();
