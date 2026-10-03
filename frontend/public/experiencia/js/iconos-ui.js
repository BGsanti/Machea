/**
 * Los iconos de la INTERFAZ del formulario, dibujados aquí.
 *
 * Hermano de js/iconos.js (que dibuja las zonas comunes) y con las mismas
 * reglas, para que las dos familias se lean como una sola:
 *
 *   - Retícula de 24, trazo de 1,6, puntas y uniones redondas, sin relleno.
 *     El manual de marca pide iconos "lineales, simples y geométricos" y
 *     prohíbe mezclar estilos; un icono macizo a 16 px es una mancha.
 *   - `currentColor`: el icono toma el color del texto que lo rodea. Nada de
 *     colores aquí — el navy, el rojo o el gris los decide el CSS.
 *
 * POR QUÉ EXISTE: el formulario se pintaba con emojis (📞 📍 🏅 🔥 ...) y
 * símbolos tipográficos (✓ ✦ ↺ ← →). Los emojis cambian de dibujo según el
 * sistema operativo, no toman el color de la marca y se leen como juego, no
 * como un producto B2B. Decisión de Diego (2026-10-02): CERO emojis en el
 * formulario, para siempre; si hace falta un símbolo, se dibuja aquí.
 *
 * TAMAÑO: el SVG mide 1em, así que crece con la letra que lo acompaña. Para
 * fijarlo, `{ tam: 20 }` o una regla de CSS sobre `.gdf-icono-ui`.
 *
 * La tabla de qué emoji o símbolo se reemplaza con cuál icono está en
 * design/formulario-rediseno/ICONOS.md, y la muestra visual en
 * design/formulario-rediseno/iconos-ui.html.
 */
(function () {
  'use strict';

  var TRAZOS = {
    // --- Contacto y lugar -------------------------------------------------
    'telefono': '<path d="M6.2 3.8h2.6l1.5 4-1.9 1.3a10.4 10.4 0 0 0 6.5 6.5l1.3-1.9 4 1.5v2.6' +
                'a1.8 1.8 0 0 1-1.9 1.8A15.6 15.6 0 0 1 4.4 5.7a1.8 1.8 0 0 1 1.8-1.9Z"/>',
    'ubicacion': '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11Z"/>' +
                 '<circle cx="12" cy="10" r="2.4"/>',
    // Persona con diadema: el asesor que llama.
    'asesor': '<circle cx="12" cy="10" r="3"/><path d="M5.5 20.5a6.5 6.5 0 0 1 13 0"/>' +
              '<path d="M6.8 10V9.5a5.2 5.2 0 0 1 10.4 0v.5"/>' +
              '<rect x="5.4" y="9.6" width="2.4" height="3.6" rx="1"/>' +
              '<rect x="16.2" y="9.6" width="2.4" height="3.6" rx="1"/>' +
              '<path d="M17.4 13.2c0 1.5-1.1 2.3-2.8 2.3"/>',
    'usuario': '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    // Persona con un check: quien toma la decisión de compra.
    'decisor': '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20.5a6.5 6.5 0 0 1 10.6-5"/>' +
               '<path d="M15 18.2l2 2 4-4"/>',
    'microfono': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/>' +
                 '<path d="M12 17.5V21M9 21h6"/>',
    'senal': '<circle cx="12" cy="18" r="1.1"/><path d="M8.6 14.6a4.8 4.8 0 0 1 6.8 0"/>' +
             '<path d="M5.6 11.6a9 9 0 0 1 12.8 0"/><path d="M2.6 8.6a13.3 13.3 0 0 1 18.8 0"/>',

    // --- Vivienda y obra --------------------------------------------------
    'edificio': '<rect x="5" y="3" width="10" height="18" rx="1"/><path d="M15 9h4v12"/>' +
                '<path d="M8.5 7h3M8.5 11h3M8.5 15h3"/><path d="M3 21h18"/>',
    // Grúa torre: mástil, pluma, contrapeso y el gancho con su carga.
    'obra': '<path d="M7 21V4"/><path d="M4.5 21h5"/><path d="M3 6h18"/><path d="M7 4 4 6"/>' +
            '<path d="M7 9 10 6"/><path d="M17 6v4"/><rect x="15.5" y="10" width="3" height="2.6" rx=".4"/>',
    // Valla de obra a rayas: "en construcción".
    'construccion': '<rect x="3" y="7" width="18" height="6" rx="1"/><path d="M8 7l-3 6M13 7l-3 6M18 7l-3 6"/>' +
                    '<path d="M6 13v7M18 13v7M4 20h4M16 20h4"/>',
    // Insignia con cinta y check: apto para subsidio.
    'subsidio': '<circle cx="12" cy="9" r="5.5"/><path d="M9.3 14 8 21l4-2.2 4 2.2-1.3-7"/>' +
                '<path d="M9.7 9.1l1.6 1.6 3-3.1"/>',
    'presupuesto': '<path d="M17 7V5.6A1.6 1.6 0 0 0 15.4 4H6a2 2 0 0 0-2 2"/>' +
                   '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M20 11h-3.4a2 2 0 0 0 0 4H20"/>',
    'calendario': '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17"/>' +
                  '<path d="M8 3v4M16 3v4"/>',
    'reloj': '<circle cx="12" cy="13.5" r="7"/><path d="M12 10v3.5l2.4 1.5"/><path d="M10 3h4M12 3v3.5"/>' +
             '<path d="M18.2 6.8l1.3-1.3"/>',
    'brujula': '<circle cx="12" cy="12" r="8.5"/><path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1Z"/>',

    // --- Opciones de las preguntas (T5) ----------------------------------
    // Comprar / Arrendar y el tipo de propiedad de Arriendo.
    'llave': '<circle cx="8" cy="15" r="4.5"/><path d="M11.2 11.8 20 3"/><path d="M16.5 6.5l2.5 2.5"/>' +
             '<path d="M14 9l2 2"/>',
    'contrato': '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>' +
                '<path d="M8.5 12.5h7M8.5 16h4"/>',
    'casa': '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
    'bodega': '<path d="M3 20V9l9-5 9 5v11"/><path d="M7 20v-7h10v7"/><path d="M7 16h10"/><path d="M3 20h18"/>',

    // --- Estado y avisos --------------------------------------------------
    'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'check-circulo': '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/>',
    'alerta': '<path d="M10.3 4.3 2.9 17.4a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/>' +
              '<path d="M12 9.5v4.3"/><path d="M12 17.1h.01"/>',
    'buscar': '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.4-4.4"/>',
    // Brote: el lead que todavía está madurando.
    'brote': '<path d="M12 21v-8.5"/><path d="M12 12.5C12 8.6 9.3 6.5 5 6.5c0 3.9 2.7 6 7 6Z"/>' +
             '<path d="M12 10.5c0-3.4 2.3-5.5 6.5-5.5 0 3.4-2.3 5.5-6.5 5.5Z"/>',
    // Temperatura del lead: el MISMO termómetro con el nivel a tres alturas.
    // Así los tres se leen como una escala, que es lo que son, y no como tres
    // dibujos sueltos (fuego, sol, copo).
    'temp-caliente': '<path d="M10 14.6V5a2 2 0 0 1 4 0v9.6a4 4 0 1 1-4 0Z"/><path d="M12 17V7"/>' +
                     '<path d="M17 5h2M17 8h2M17 11h2"/>',
    'temp-tibio': '<path d="M10 14.6V5a2 2 0 0 1 4 0v9.6a4 4 0 1 1-4 0Z"/><path d="M12 17v-6"/>' +
                  '<path d="M17 8h2M17 11h2"/>',
    'temp-frio': '<path d="M10 14.6V5a2 2 0 0 1 4 0v9.6a4 4 0 1 1-4 0Z"/><path d="M12 17v-2.5"/>' +
                 '<path d="M17 11h2"/>',

    // --- Navegación y acciones -------------------------------------------
    'flecha-izquierda': '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
    'flecha-derecha': '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
    'chevron-abajo': '<path d="M6 9.5l6 6 6-6"/>',
    'reiniciar': '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 3.5v4h4"/>',
    'enlace-externo': '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/>' +
                      '<path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    'cerrar': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    'mas': '<path d="M12 5.5v13M5.5 12h13"/>',
    'menos': '<path d="M5.5 12h13"/>',
    // Destello de cuatro puntas, para los rótulos ("Tus proyectos recomendados").
    'destello': '<path d="M12 3.5c.7 4.6 3.9 7.8 8.5 8.5-4.6.7-7.8 3.9-8.5 8.5-.7-4.6-3.9-7.8-8.5-8.5' +
                ' 4.6-.7 7.8-3.9 8.5-8.5Z"/>',
  };

  function esc(t) {
    return String(t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /**
   * El SVG de un icono de interfaz, como texto HTML.
   *
   *   icono('telefono')                       decorativo, mide 1em
   *   icono('alerta', { tam: 20 })             a 20 px
   *   icono('cerrar', { titulo: 'Quitar' })    con nombre para lectores de
   *                                            pantalla (si va SOLO, sin texto)
   *
   * Un nombre que no existe devuelve '' y avisa por consola: mejor un hueco
   * visible en la revisión que un icono equivocado en pantalla.
   */
  function icono(nombre, opciones) {
    var trazo = TRAZOS[nombre];
    if (!trazo) {
      if (window.console) console.warn('[GDF/iconos-ui] No existe el icono "' + nombre + '".');
      return '';
    }
    var o = opciones || {};
    var tam = o.tam ? ' width="' + o.tam + '" height="' + o.tam + '"' : '';
    var clase = 'gdf-icono-ui gdf-icono-ui--' + nombre + (o.clase ? ' ' + o.clase : '');
    var a11y = o.titulo
      ? ' role="img" aria-label="' + esc(o.titulo) + '"'
      : ' aria-hidden="true" focusable="false"';
    return (
      '<svg class="' + clase + '" viewBox="0 0 24 24"' + tam + ' fill="none" stroke="currentColor"' +
      ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"' + a11y + '>' +
      trazo + '</svg>'
    );
  }

  window.GDF = window.GDF || {};
  window.GDF.iconosUI = { icono: icono, TRAZOS: TRAZOS, nombres: Object.keys(TRAZOS) };
})();
