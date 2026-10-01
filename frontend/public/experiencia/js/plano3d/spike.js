/* Spike de la fase 0. No es el render definitivo: solo prueba las tres cosas
   que pueden hundir la integracion, y que conviene saber antes de portar nada.

     1. Que el bundle IIFE cargue como <script src> en una app sin bundler.
     2. Que el canvas SOBREVIVA a `render()`, que hace `root.innerHTML = ...`.
     3. Que se recupere si el navegador pierde el contexto WebGL.

   La clave del punto 2: `innerHTML` DESPRENDE el canvas del arbol, pero no
   destruye su contexto mientras alguien conserve la referencia al nodo. Por eso
   el renderer se crea UNA sola vez a nivel de modulo y `montar()` es idempotente
   — se la puede llamar en cada render sin costo. */
(function () {
  'use strict';

  var Libs = window.GDF3DLibs;
  if (!Libs) { console.error('[plano3d] falta el bundle'); return; }
  var THREE = Libs.THREE;

  var renderer = null, scene = null, camera = null, cubo = null;
  var contenedor = null, ro = null, animando = false, perdido = false, perdedor = null;

  function crear() {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      console.error('[plano3d] sin WebGL:', e);
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    perdedor = renderer.getContext().getExtension('WEBGL_lose_context');

    var lienzo = renderer.domElement;
    lienzo.className = 'gdf-losa3d';
    lienzo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:2';

    lienzo.addEventListener('webglcontextlost', function (ev) {
      ev.preventDefault();      // sin esto el contexto no se restaura nunca
      perdido = true;
      console.warn('[plano3d] contexto perdido');
    });
    lienzo.addEventListener('webglcontextrestored', function () {
      perdido = false;
      console.warn('[plano3d] contexto restaurado');
      bucle();
    });

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(3, 3, 5);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 2));
    cubo = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.6, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xa7acb0, roughness: 0.6 })
    );
    scene.add(cubo);
    return true;
  }

  function medir() {
    if (!contenedor || !renderer) return;
    var r = contenedor.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /* Idempotente a proposito: se llama despues de CADA render de la anfitriona,
     y casi siempre no hay nada que hacer. */
  function montar(el) {
    if (!el || !crear()) return false;
    if (renderer.domElement.parentNode !== el) {
      el.appendChild(renderer.domElement);
      contenedor = el;
      if (ro) ro.disconnect();
      ro = new ResizeObserver(medir);
      ro.observe(el);
      medir();
    }
    if (!animando) bucle();
    return true;
  }

  function bucle() {
    animando = true;
    requestAnimationFrame(function paso() {
      if (perdido) { animando = false; return; }
      cubo.rotation.y += 0.01;
      cubo.rotation.x += 0.004;
      renderer.render(scene, camera);
      requestAnimationFrame(paso);
    });
  }

  window.GDF3D = {
    montar: montar,
    // Para que el arnes de prueba pueda forzar la perdida de contexto.
    // La extension se pide UNA VEZ y se guarda: sobre un contexto ya perdido
    // `getExtension` devuelve null, asi que pedirla despues de perderlo deja
    // sin forma de restaurarlo.
    _perder: function () {
      if (!perdedor) return false;
      perdedor.loseContext();
      return true;
    },
    _restaurar: function () {
      if (!perdedor) return false;
      perdedor.restoreContext();
      return true;
    },
    _info: function () {
      return {
        montado: !!(renderer && renderer.domElement.parentNode),
        perdido: perdido,
        tam: renderer ? [renderer.domElement.width, renderer.domElement.height] : null,
        geometrias: renderer ? renderer.info.memory.geometries : null
      };
    }
  };
})();
