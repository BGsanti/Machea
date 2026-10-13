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
- [ ] L4. Pantallas con el mockup elegido (ronda 2): `/acceso/`, `/acceso/nueva-clave/` e `/inicio/`.
- [ ] L5. `/admin` → Cuentas: listar, aprobar (con constructora o inmobiliaria) y rechazar, contra el contrato de administración.
- [ ] L6. CSP y cabeceras, y quitar el botón de la demo de la landing.
- [ ] L7. QA y PR de `login` a `main`.
