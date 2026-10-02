# Rediseño del formulario de Machea

Material de trabajo del proyecto de mejora de UI/UX del formulario (`frontend/public/experiencia/`). Todo el trabajo se acumula en la rama **`rediseno-formulario`**; a `main` (producción) solo se sube cuando Diego apruebe el conjunto, con un único PR final.

| Archivo | Para qué |
|---|---|
| [DIAGNOSTICO.md](DIAGNOSTICO.md) | Qué hay hoy en producción, hallazgos con capturas, decisiones tomadas y restricciones. **Empieza aquí.** |
| [MARCA.md](MARCA.md) | Manual de marca aplicado al formulario: paleta, Inter, formas, iconos, movimiento, logo. |
| [TAREAS.md](TAREAS.md) | Desglose de tareas (T1 a T12), orden, qué es Autónoma y estrategia de ramas. |
| [TEXTOS.md](TEXTOS.md) | Tabla de textos aprobada: qué dice hoy y qué debe decir. |
| `mockups/registro.html` | Mockups interactivos del registro. **Elegida: variante B** (formulario limpio). |
| `capturas-antes/` | Capturas de producción antes del rediseño (escritorio y móvil). |
| `recursos/` | Logos: palabra "machea" y isotipos. Ver la tabla de MARCA.md sobre cuáles son definitivos. |

## Reglas que no se negocian

- No tocar `frontend/public/experiencia/js/plano3d/` ni `vendor/` (el 3D queda igual).
- **Cero emojis** en el formulario; si hace falta un símbolo, un icono SVG propio.
- Recorrer el formulario completo contra producción con datos de prueba **dispara una llamada real** de Manuela al teléfono escrito: probar en local con el backend sin `DAPTA_FLOW_WEBHOOK_URL` (modo mock).
- Subir `?v=N` del cache-busting en `frontend/public/experiencia/index.html` con cada cambio de JS o CSS.
- Las tareas parten de `rediseno-formulario`, no de `main`.
