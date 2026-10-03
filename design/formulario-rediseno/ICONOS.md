# Iconos de interfaz del formulario (T2)

Módulo: `frontend/public/experiencia/js/iconos-ui.js`. Muestra visual: [iconos-ui.html](iconos-ui.html) (se abre directo desde el repo y carga el módulo real).

## Reglas

- **Cero emojis en el formulario, nunca.** Si hace falta un símbolo, se dibuja en `iconos-ui.js`.
- Familia lineal: retícula de 24, trazo de 1,6, puntas redondas y sin relleno. Es la misma familia que `js/iconos.js` (amenidades).
- Sin colores en el SVG: usan `currentColor` y toman el color del texto. El navy, el rojo o el gris los decide el CSS.
- Miden `1em` (crecen con la letra). Para un tamaño fijo: `icono('alerta', { tam: 20 })`.
- Si el icono va **solo**, sin texto al lado (por ejemplo la × de un chip), lleva nombre accesible: `icono('cerrar', { titulo: 'Quitar Chapinero' })`. Si va junto a un texto, es decorativo y no lleva nombre.

```js
var ic = window.GDF.iconosUI.icono;
'<button class="gdf-btn-primary">Continuar ' + ic('flecha-derecha') + '</button>'
```

## Tabla de reemplazo para T3

Inventario de `rediseno-formulario` al 2026-10-03, sin contar comentarios. Fuera de alcance: `js/plano3d/`, `vendor/` y los `mapa_*.js` generados.

| Hoy | Icono | Dónde |
|---|---|---|
| 📞 | `telefono` | `templates.js`: contacto y llamada en la confirmación |
| 📍 | `ubicacion` | `templates.js`: ubicación en la tarjeta y en la confirmación |
| 🏅 | `subsidio` | `templates.js`: "Apto para subsidio" |
| 🔍 | `buscar` | `templates.js`: sin resultados |
| ⚠️ | `alerta` | `templates.js`: error de recomendaciones y de llamada |
| 🚧 | `construccion` | `templates.js`: cierre de Arriendo |
| 🏢 | `edificio` | `templates.js`: tarjeta sin foto |
| 📡 | `senal` | `templates.js`: conectando la llamada |
| 🧭 | `brujula` | `templates.js`: recorrido 360 |
| ↗ | `enlace-externo` | `templates.js`: recorrido 360 y ficha oficial. El texto "Ver ficha oficial ↗" viene de `tenants/machea/marca.js` (`fichaOficial`), que es generado: quitar el símbolo al pintarlo en `templates.js`, no en `marca.js`. |
| 🔥 🌤️ ❄️ | `temp-caliente`, `temp-tibio`, `temp-frio` | `templates.js`: temperatura del lead (`TEMPERATURA`, cambiar `emoji` por `icono`) |
| 🎙️ | `microfono` | `templates.js`: "Manuela está en la llamada" |
| 💰 | `presupuesto` | `templates.js`: chip del resumen |
| 🙋 | `decisor` | `templates.js`: chip del resumen |
| ⏱ | `reloj` | `templates.js`: chip de urgencia |
| 📅 | `calendario` | `templates.js`: chip de seguimiento |
| ✅ | `check-circulo` | `qualification.js`: lead "Listo para asesor" (`icon`) |
| 🌱 | `brote` | `qualification.js`: lead "En maduración" (`icon`) |
| 👷 (y ♀ ♂) | `usuario` | `data.js` (`GENDERS`) y avatar del carné. Desaparece con el registro nuevo (T4b); si T3 va antes, usar `usuario`. |
| 🏗️ | isotipo de Machea | `index.html`: favicon. No es de este set: usar el SVG del isotipo (`design/formulario-rediseno/recursos/isotipo-machea-FC4633.svg`). |
| ✓ | `check` | `templates.js`, `state.js` ("Afiliado ✓"), `styles.css` (`content: '✓'` en `.gdf-multi-opt.selected::after`: pasar a un SVG de fondo o a un elemento) |
| ✦ | `destello` | `templates.js`: rótulos de resultados y del cierre |
| ↺ | `reiniciar` | `templates.js`: "Empezar de nuevo" |
| ← | `flecha-izquierda` | `templates.js`: "Atrás" |
| → | `flecha-derecha` | `templates.js` ("Continuar", botones) y `styles.css` |
| ▾ | `chevron-abajo` | `templates.js`: "Ver todo lo que incluye" |
| × | `cerrar` | `main.js`: quitar un chip (con `titulo`) |
| − + | `menos`, `mas` | `templates.js`: contadores de Arriendo (con `titulo`) |

Además, cuidado en T3:
- Los textos que viajan al backend no se tocan. Los emojis de `qualification.js` y `TEMPERATURA` solo se pintan.
- `esc()` escapa el texto, así que el SVG no puede ir dentro de un texto escapado: concatenarlo fuera de `esc(...)`.
- Al terminar, el chequeo de emojis debe dar cero en `js/`, `css/` e `index.html` (fuera de comentarios).
