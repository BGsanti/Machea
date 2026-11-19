# Formulario personalizado: handoff de diseño

**Para:** Santiago Dias (diseño) · **De:** backend · **Estado:** la API está lista; el diseño visual está pendiente.

Una inmobiliaria o constructora escribe el link de su sitio y recibe **su** formulario: con su nombre, su logo, sus
colores y sus proyectos reales. El backend ya hace todo lo que no es diseño. Lo que falta es cómo se ve.

## Qué ya está listo

- **La API.** Con los datos del formulario (nombre, correo, link, tipo) devuelve el diseño completo:
  `POST /api/formulario/personalizado` y, con el token, `GET /api/formulario/personalizado?d=<token>`.
  Contrato campo por campo: [`backend/features/formulario_personalizado/CONTRATO.md`](../../backend/features/formulario_personalizado/CONTRATO.md).
- **Habla el idioma del formulario de hoy.** `marca` tiene la forma de `window.GDF_MARCA` y `proyectos` la de
  `window.GDF_PROYECTOS` (los archivos de `frontend/public/experiencia/tenants/<slug>/`). También sale como script:
  `GET /api/formulario/personalizado.js?d=<token>`.
- **Se ve hoy, sin diseño nuevo.** `demo_url` abre el formulario actual con el nombre, el logo y los colores de la
  empresa (lo hacen `js/demo.js` y `js/tema.js`). Esa es la base de partida (`diseno.base_actual`).
- **Las fotos se sirven desde la API** (`/api/formulario/imagen?...`): no dependen del sitio de la empresa ni de su
  CORS, y la CSP del formulario ya las permite.
- **Los colores vienen medidos.** `diseno.tokens_sugeridos` trae las custom properties y el contraste WCAG de cada par
  (`_contraste.boton_aa_texto_normal`, `primario_como_texto_aa`…).

## Qué hay que diseñar

Lo que la API no decide, en `diseno.decisiones_abiertas`:

1. **Tipografía.** No se lee del sitio. Hoy Poppins (titulares) y Manrope (cuerpo).
2. **Superficie.** La clara de Machea (`#fdf6f0`) con los colores de la empresa, o una propia de la marca.
3. **Portada.** Genérica o con `diseno.imagen_destacada` (la portada del primer proyecto).
4. **Los proyectos de la empresa en los resultados.** Galería, precio, segmento (VIS/VIP/No VIS solo cuando la ficha
   lo escribe), canon si es arriendo (`precio_es_canon`), estado de obra.
5. **Sin contraste AA.** Qué pasa cuando el primario de la marca no aguanta texto blanco ni negro con 4,5:1 (un amarillo
   claro, un pastel). La API propone `--texto-sobre-primario`, pero no siempre alcanza.
6. **Las opciones de `formulario`.** Si recortan las preguntas (solo las zonas donde la empresa tiene proyectos, solo
   VIS si solo vende VIS) o solo las ordenan.

Y los estados, que existen de verdad:

| `estado` | Qué pasa | Qué debería ver la persona |
|---|---|---|
| `esperando_proyectos` | La marca está lista; los proyectos se leen (hasta ~4 min). | El formulario con su marca; los proyectos llegan después. |
| `completo` | Marca y proyectos. | Todo. |
| `sin_proyectos` | Su sitio no publica fichas que se puedan leer. | El formulario con su marca y el catálogo general. |
| `solo_marca` | La lectura de proyectos está apagada o falló. | Igual que `sin_proyectos`. |
| `marca.identidad.logo` vacío | No se pudo leer el logo. | El nombre escrito (hoy `js/demo.js` ya lo hace). |
| `empresa.marca_detectada: false` | No se leyeron sus colores: van los de Machea. | Decidir si se le ofrece elegir su color. |

## Cómo probarlo hoy

```bash
# Backend local, con la lectura de proyectos encendida
cd backend && EXTRAER_PROYECTOS_WEB=1 uvicorn api.app:app --port 8000

# Crear el formulario de una empresa real
curl -s -X POST http://localhost:8000/api/formulario/personalizado -H 'Content-Type: application/json' \
  -d '{"nombre":"Santiago","correo":"santiago@machea.co","sitio":"cusezar.com","tipo":"constructora"}' > formulario.json

# Abrir la base de hoy: el demo_url del JSON (con el front en npm run dev, cambia el dominio por localhost:5173)
# Ver los proyectos cuando terminen (~30 s en Cusezar)
curl -s "http://localhost:8000/api/formulario/personalizado?d=<token del JSON>"
```

Contra Cusezar, por la API y sin topes: la marca en segundos y `estado: "completo"` a los ~190 s, con 25 proyectos y
200 fotos (8 por proyecto). En Amarilo salen los proyectos sin precio: lo pintan con JavaScript y el lector no lo
ejecuta.

## Cómo se conecta al formulario (cuando el diseño esté)

El formulario carga su marca con `document.write` en `frontend/public/experiencia/index.html` (el bloque que escribe
`tenants/<slug>/marca.js`, `proyectos.js` y `planos.js`). El punto de enganche es ese:

```js
// En lugar de tenants/<slug>/marca.js y proyectos.js, si viene ?formulario=<token>.
// El token se valida antes de escribirlo: viene de la URL y va dentro de un document.write.
var f = /[?&]formulario=([^&]+)/.exec(location.search), token = null;
try { token = f && decodeURIComponent(f[1]); } catch (e) {}
if (token && /^v1\.[\w-]+\.[\w-]+$/.test(token)) {
  document.write('<scr' + 'ipt src="/api/formulario/personalizado.js?d=' + encodeURIComponent(token) + '"></scr' + 'ipt>');
  document.write('<scr' + 'ipt src="tenants/machea/planos.js?v=108"></scr' + 'ipt>');
}
```

Y en `frontend/vercel.json`, un rewrite `/api/formulario/:ruta*` hacia la API (igual que `/api/cuentas`): así el script
es del mismo origen y la CSP de `/experiencia/` no hay que tocarla. Ese script define `GDF_MARCA`, `GDF_PROYECTOS` y
`GDF_FORMULARIO` (el resto del diseño: `formulario`, `diseno`, `estado`). Como la marca lleva `slug: "machea"` y la llave
`demo`, `tema.js` la pinta sin cambios; lo nuevo del diseño puede leer `GDF_FORMULARIO.diseno`.

Ojo con las dos copias del formulario (CLAUDE.md raíz, §8.3): `experiencia/` en la raíz y `frontend/public/experiencia/`.

## Ejemplo de respuesta (recortado)

```json
{
  "version": 1, "estado": "completo",
  "empresa": {"nombre": "Constructora Andes", "tipo": "constructora", "dominio": "constructoraandes.com",
              "marca_detectada": true, "que_vende": {"principal": "vivienda", "tipos": {"vivienda": 2, "oficinas": 1}}},
  "demo_url": "https://www.machea.co/experiencia/index.html?marca=machea&demo=v1.…",
  "marca": {"slug": "machea", "identidad": {"nombre": "Constructora Andes", "logo": "https://<api>/api/marca/logo?d=v1.…"},
            "paleta": {"primario": "#0a7f5a", "acento": "#e4572e", "tinta": "#2d3b4e"},
            "geo": {"ciudades": ["Bogotá"], "campoUbicacion": "localidad", "zonas": ["Bosa", "Chapinero"]},
            "demo": {"nombre": "Constructora Andes", "primario": "#0a7f5a", "tieneLogo": true, "token": "v1.…"}},
  "proyectos": [{"id": 1, "name": "Bosque Verde", "localidad": "Bosa", "price": 230000000, "hab": 2, "habMax": 3,
                 "vis": true, "segmento": "VIS", "image": "https://<api>/api/formulario/imagen?d=v1.…&p=1&i=01",
                 "amenidades": [{"label": "Piscina", "icon": "", "clave": "Piscina"}]}],
  "formulario": {"preguntas": {"tipo_propiedad": {"opciones": ["Vivienda", "Oficinas"]}, "tipo": {"opciones": ["VIS"]},
                               "zona": {"campo": "localidad", "opciones": ["Bosa", "Chapinero"]},
                               "habitaciones": {"opciones": [2, 3]}}},
  "diseno": {"responsable": "Santiago Dias", "estado": "pendiente",
             "tokens_sugeridos": {"--primario": "#0a7f5a", "--texto-sobre-primario": "#ffffff",
                                  "_contraste": {"texto_sobre_primario": 5.0, "boton_aa_texto_normal": true}},
             "decisiones_abiertas": ["tipografía: …", "superficie: …", "portada: …"]}
}
```

## Para entregar

- [ ] Diseño de las pantallas con la marca de la empresa (splash/escarapela, preguntas, resultados).
- [ ] Cómo se ven los proyectos propios en resultados, con y sin foto, con y sin precio.
- [ ] Los seis estados de la tabla de arriba.
- [ ] Regla para marcas sin contraste AA.
- [ ] Decidir si se usan las opciones de `formulario` y cómo.
- [ ] Al implementar: el enganche de `index.html`, el rewrite de `vercel.json` y las dos copias del formulario.
