// Único módulo que habla con la base de datos persistente de leads
// (Supabase). Ver docs/base-de-datos-leads.md para el esquema real
// aplicado y supabase/migrations/ para el SQL exacto.
//
// La persona se identifica con TELÉFONO + CORREO, sin cédula (decisión de
// Diego, 2026-10-06; ver 20261006120000_leads_por_telefono_y_correo.sql).
// Los dos tienen que coincidir en todas las funciones.
//
// TRES REGLAS DURAS:
//   1. Nunca usa la service_role key -- solo la clave PUBLICABLE/anon de
//      config.js, la misma que puede viajar al navegador sin riesgo: las
//      tablas están cerradas (RLS sin políticas) y esa clave solo puede
//      ejecutar las 4 funciones de la migración.
//   2. Nunca bloquea el formulario. Cada llamado tiene un timeout corto y
//      SIEMPRE llama a su callback exactamente una vez -- con éxito, con
//      un motivo de por qué no, o con "no encontrado" -- jamás deja a
//      main.js esperando para siempre.
//   3. Es best-effort en las escrituras: un fallo de red o de Supabase se
//      registra en consola y no interrumpe el quiz, la llamada de Manuela,
//      ni nada del contrato con el modelo de recomendación.
(function () {
  'use strict';

  var TIMEOUT_MS = 4000;

  function cfg() {
    var c = window.GDF_CONFIG || {};
    return c.SUPABASE_URL && c.SUPABASE_ANON_KEY ? c : null;
  }

  // POST a <url>/rest/v1/rpc/<nombre> (PostgREST). Nunca lanza: siempre
  // resuelve cb(datos, error) -- error es un texto corto o null.
  function rpc(nombre, args, cb) {
    var c = cfg();
    if (!c) { cb(null, 'Supabase sin configurar (config.js)'); return; }

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var terminado = false;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, TIMEOUT_MS);

    function terminar(datos, error) {
      // El timeout y la respuesta pueden cruzarse; el callback solo corre
      // una vez, con lo primero que llegue.
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      cb(datos, error);
    }

    fetch(c.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + nombre, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: c.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + c.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(args),
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        return res.text().then(function (texto) {
          var datos = null;
          try { datos = texto ? JSON.parse(texto) : null; } catch (e) { /* respuesta no-JSON */ }
          if (!res.ok) {
            var msg = (datos && (datos.message || datos.hint)) || ('HTTP ' + res.status);
            terminar(null, msg);
            return;
          }
          terminar(datos, null);
        });
      })
      .catch(function (err) {
        var abortado = err && err.name === 'AbortError';
        terminar(null, abortado ? 'tiempo agotado' : ((err && err.message) || 'fallo de red'));
      });
  }

  /**
   * ¿Ya existe una consulta guardada para este teléfono+correo? Se llama
   * antes de arrancar el cuestionario. SIEMPRE resuelve -- con match o sin
   * él, nunca dejando el botón "Empezar a construir" colgado.
   * cb({ encontrado, consultaId, respuestas, resultados }).
   */
  function buscarResultados(telefono, correo, cb) {
    rpc('buscar_resultados', { p_telefono: telefono, p_correo: correo }, function (datos, error) {
      if (error) {
        console.warn('[GDF/datos] buscar_resultados:', error);
        cb({ encontrado: false });
        return;
      }
      var fila = Array.isArray(datos) ? datos[0] : null;
      if (!fila) { cb({ encontrado: false }); return; }
      cb({
        encontrado: true,
        consultaId: fila.consulta_id,
        respuestas: fila.respuestas || {},
        resultados: fila.resultados || {},
      });
    });
  }

  /**
   * Guarda la consulta (upsert del lead + fila nueva en consultas). El
   * llamador ya filtró que `resultado` no esté vacío ni en error -- la
   * función guardar_consulta() de la base lo vuelve a exigir por su cuenta.
   * `cb(consultaId)` es opcional; recibe null si algo falló.
   */
  function guardarConsulta(state, resultado, cb) {
    rpc('guardar_consulta', {
      p_nombre: state.nombre,
      p_apellido: state.apellido,
      p_correo: state.correo,
      p_telefono: state.telefono,
      p_respuestas: state.answers,
      p_resultados: resultado,
    }, function (datos, error) {
      if (error) {
        console.warn('[GDF/datos] guardar_consulta:', error);
        if (cb) cb(null);
        return;
      }
      if (cb) cb(datos);
    });
  }

  // El proyecto elegido, como lo necesitan marcar_interes/marcar_intencion.
  function proyectoElegido(state) {
    var elegido = null;
    (state.reco.items || []).forEach(function (vm) {
      if (vm.id === state.chosen) elegido = vm;
    });
    return elegido ? elegido.nombre : null;
  }

  /**
   * Se llama al pedir la llamada de Manuela (al entrar a 'confirmacion').
   * Fire-and-forget: un fallo no debe impedir ni retrasar la llamada real.
   */
  function marcarInteres(state) {
    var proyecto = proyectoElegido(state);
    if (!proyecto) return;
    rpc('marcar_interes', {
      p_telefono: state.telefono,
      p_correo: state.correo,
      p_proyecto: proyecto,
      p_consulta_id: state.consultaId || null,
    }, function (datos, error) {
      if (error) console.warn('[GDF/datos] marcar_interes:', error);
    });
  }

  /**
   * Se llama cuando llega el resumen post-llamada de Dapta (ver
   * 'resumenListo' en main.js). `datosResumen` es el cuerpo crudo del
   * webhook (mismo objeto que state.resumen.datos): trae fecha_de_seguimiento
   * y temperatura_lead. intencion_compra queda en true solo si la fecha de
   * seguimiento viene con valor -- es la señal de que Dapta agendó cita.
   */
  function marcarIntencion(state, datosResumen) {
    var proyecto = proyectoElegido(state);
    if (!proyecto) return;
    var d = datosResumen || {};
    rpc('marcar_intencion', {
      p_telefono: state.telefono,
      p_correo: state.correo,
      p_proyecto: proyecto,
      p_fecha_seguimiento: d.fecha_de_seguimiento || null,
      p_temperatura: d.temperatura_lead || null,
    }, function (datos, error) {
      if (error) console.warn('[GDF/datos] marcar_intencion:', error);
    });
  }

  window.GDF = window.GDF || {};
  window.GDF.datos = {
    buscarResultados: buscarResultados,
    guardarConsulta: guardarConsulta,
    marcarInteres: marcarInteres,
    marcarIntencion: marcarIntencion,
  };
})();
