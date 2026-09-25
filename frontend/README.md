# frontend — la landing y el formulario

Esta mitad del repo sirve **dos cosas**: la landing de marketing (React 19 +
Tailwind v4 + Framer Motion, en `src/`) y, embebida dentro por iframe en el
modal "Pruébalo tú mismo", la experiencia de 7 preguntas de
`public/experiencia/`.

Hubo una etapa intermedia donde `src/` entero se borró y esta copia servía
solo el formulario a pantalla completa (commit `d5ec2fc`) — la landing volvió
con secciones nuevas de segmentos y precios, y `public/experiencia/` **sigue
sin tocarse**: es el mismo bundle vanilla de siempre.

| | |
|---|---|
| `src/` | La landing. React + Vite, compila normal (`tsc -b && vite build`). |
| `src/components/LiveDemo.tsx` | El modal que incrusta el quiz por iframe — ahí vive `EXPERIENCIA_URL`. |
| `public/experiencia/` | **El formulario.** JS vanilla, sin build; Vite lo sirve tal cual desde `public/`. No se toca. |

```bash
npm install
npm run dev        # :5173, falla si el puerto está ocupado (strictPort)
npm run build      # tsc -b && vite build — landing + copia public/ a dist/
npm run preview
```

Tres cosas que no hay que deshacer sin querer, en `LiveDemo.tsx`:

- **`?marca=machea`** es el tenant neutro: sin ese parámetro el bundle cae en
  `constructora-bolivar` y filtra el catálogo a una sola constructora.
- **Se nombra `index.html`**, no el directorio: en `npm run dev` una ruta sin
  extensión devuelve el `index.html` de la landing, y el iframe la cargaría
  a sí misma dentro de sí misma en vez del quiz.
- **Sigue siendo un iframe** porque el quiz inyecta el tenant con
  `document.write` en el punto del parser: pasarlo por el build de Vite o
  ponerle `defer` borra el documento entero.

El backend que consume está en `../backend` (`uvicorn api.app:app --port
8000`). Ojo: la copia publicada del bundle de `public/experiencia/` lleva
`SIN_BACKEND: true` en `js/config.js`, así que por defecto recomienda con el
motor de reglas de `matching.js` y no llama al modelo.

La documentación completa: [CLAUDE.md §8](../CLAUDE.md).
