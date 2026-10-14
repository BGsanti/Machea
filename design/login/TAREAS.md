# Login Machea: tareas

Todo va en la rama `login` (D13) y bajo una sola tarea del board:
`736de0ba-1df9-41e5-925b-6d751871c5b6` ("Login de Machea (rama login)"), reclamada por el Agente de Diego.
No lleva la etiqueta Autónoma.

## Reglas

- Nada de credenciales ni claves en el repo, el front, las tareas o las actas.
- Antes de editar `vercel.json`, `frontend/index.html` (landing) o `/admin`, que son archivos compartidos, se hace `lock_file`.
- El proveedor de prueba **nunca** se publica como si fuera real. En producción el login queda apagado
  hasta que exista el proveedor de la nube.

## Lista

- [x] L0. Rama `login` creada desde `acceso-marca` + `main`, y subida a GitHub.
- [x] L1. Mockups: 3 propuestas × 7 pantallas → `mockups/login.html` (capturas en `mockups/capturas/`).
- [x] L2. Borrador de la política de privacidad → `POLITICA_PRIVACIDAD_BORRADOR.md`.
- [x] L3. Lógica (commit `4bab418`): contrato, validación, sesión, Google (GIS + nonce) y proveedor de
  prueba, con 20 pruebas (`npm run test:auth`) y `design/login/CONTRATO_AUTH.md`.
  Las entradas de Vite van con L4.
- [x] L4. Pantallas con la propuesta B: `/acceso/` (entrar, crear, confirmar el correo, olvidé),
  `/acceso/nueva-clave/` e `/inicio/`. QA de punta a punta con Playwright: 31/31, axe AA 0 hallazgos, sin errores de CSP.
- [x] L5. `/admin` → "Cuentas de empresas": listar (pendientes o todas), aprobar (constructora o inmobiliaria) y rechazar
  (doble clic). Backend `api/cuentas.py` (503 hasta conectar el almacén de la nube) con pruebas en `tests/test_cuentas.py`.
- [x] L6. CSP y cabeceras en `vercel.json` (abiertas a Google GIS, `strict-origin-when-cross-origin`); botón de la demo
  quitado de la landing; prototipo `public/acceso/` retirado (queda en el commit `6203cbf`).
- [x] L8. Base de datos (D20):
  - migración `acceso`;
  - backend `api/acceso.py` + `api/almacen_acceso.py`;
  - proveedor `api` del front;
  - reenvío `/api` en Vercel y en Vite.

  Pruebas:
  - backend: 153, todas en verde con un PostgreSQL 18 real (17 de acceso y 6 del almacén Postgres);
  - front: 27;
  - punta a punta navegador → Vite → FastAPI → Postgres: 27/27.
- [ ] L9. Puesta en marcha (Santiago o Felipe, D21): migración en `machea-leads`, `DATABASE_URL` en Render y verificación. Guía en `PUESTA_EN_MARCHA.md`.
- [ ] L7. Merge del PR #14 de `login` a `main` (con el visto bueno de Diego), después de L9 (paso 1).
- [ ] Antes de abrirlo a empresas reales: la puesta en marcha (L9) y la página `/privacidad/`. El registro pide aceptar la
  política y hoy ese enlace no lleva a nada; además, el formulario ya guarda datos de leads y la Ley 1581 pide la
  política de todas formas.
- [ ] Más adelante (D19): Google, cuando estén publicados la política y los términos de servicio. Se activa poniendo
  `VITE_GOOGLE_CLIENT_ID` en Vercel y creando el cliente OAuth en una cuenta de Machea.
