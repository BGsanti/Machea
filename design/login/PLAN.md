# Plan: login de Machea (lógica y diseño, independiente del proveedor de nube)

## Contexto

Felipe subió `acceso-marca` (commit `6203cbf`), que trae la **pantalla** de acceso en `/acceso/`. Es solo
diseño: no autentica. Detrás del login irán un **panel de administrador y un CRM**, más adelante. Este
proyecto es **solo el login**, y como Machea piensa migrar de Supabase a otro servicio de nube pronto, se
construyen **la lógica y el diseño** sin atarse a ningún proveedor. Las decisiones D2 a D14 están en
[DECISIONES.md](DECISIONES.md).

**Rama:** `login` en BGsanti/Machea (una sola, ahí va todo). Copia local: `Proyectos U/Machea-login`
(worktree). Tarea del board: `736de0ba-1df9-41e5-925b-6d751871c5b6`.

---

## Arquitectura

```
frontend/
  acceso/              entrada de Vite: /acceso/ (entrar, crear cuenta, olvidé, confirmar correo)
    nueva-clave/       /acceso/nueva-clave/
  inicio/              /inicio/: página provisional después de entrar (aquí irá el CRM)
  src/auth/
    contrato.ts        tipos y la interfaz ProveedorAuth: lo único que conoce la interfaz gráfica
    validacion.ts      usuario, correo, fuerza de la clave (compartido por todas las pantallas)
    google.ts          botón oficial de Google: carga GIS, nonce y renderButton; entrega el ID token
    sesion.ts          "Recordarme" (localStorage o sessionStorage) y la guarda de las páginas
    proveedores/
      prueba.ts        proveedor local para desarrollo y demos (sin red); simula confirmar y aprobar
      (nube.ts)        el proveedor real, cuando se elija la nube: implementa el mismo contrato
    index.ts           elige el proveedor con VITE_AUTH_PROVEEDOR (por defecto "prueba")
```

- **El contrato es la frontera:** las pantallas solo llaman `ProveedorAuth`, y migrar de nube es escribir
  otro archivo en `proveedores/`.
- Estados de una cuenta: `sin_confirmar` → `pendiente` → `aprobada` / `rechazada`.
- **Google sin atadura:** el botón entrega un ID token firmado por Google. El proveedor (hoy el de prueba,
  mañana el de la nube) lo verifica en el servidor. El nonce va en SHA-256 a Google y en crudo al proveedor.
- **Aprobación desde `/admin` (D11):** se define un contrato HTTP de administración (listar cuentas,
  aprobar con tipo constructora/inmobiliaria, rechazar). La pantalla de `/admin` se construye contra ese
  contrato, y el backend que lo cumpla llega con la nube.
- **Marca:** solo Machea, con los tokens del manual. Se quitan `?marca=`, `?demo=`, los presets y el editor
  del prototipo, y el botón "Ver cómo se vería tu acceso" de la landing. `derivar()` se guarda.
- **Seguridad en el front:**
  - CSP en una sola fuente (`vercel.json`), abierta solo a `accounts.google.com/gsi/` y al dominio del proveedor.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `autocomplete` correcto y sin `maxlength` corto en la clave.
  - Mensajes de error que no revelan si un correo existe.

## Fases

1. **Diseño (hecho, en elección):**
   - 3 mockups con 7 pantallas cada uno → [mockups/login.html](mockups/login.html).
   - Borrador de la política de privacidad.
2. **Lógica (no depende del mockup):** `contrato.ts`, `validacion.ts`, `sesion.ts`, `google.ts` y el
   proveedor de prueba, más las entradas de Vite. Documento `design/login/CONTRATO_AUTH.md` en la rama.
3. **Pantallas:** con el mockup elegido, `/acceso/`, `/acceso/nueva-clave/` e `/inicio/`, sobre el
   prototipo de Felipe.
4. **Admin:** la sección "Cuentas" en `/admin`, contra el contrato de administración.
5. **QA:** Chrome (FedCM), Safari, Firefox y móvil; axe AA; `npm run build`. Al final, un PR de `login` a
   `main` con el visto bueno de Diego.
6. **Con la nube elegida (fuera de esta etapa):**
   - el proveedor real;
   - el backend de administración;
   - SMTP y plantillas;
   - CAPTCHA;
   - el cliente OAuth de Google en una cuenta de Machea, con la política publicada.

## Verificación

- Con el proveedor de prueba, en local:
  - crear cuenta → confirmar correo → "en revisión" → aprobar desde `/admin` → entrar → `/inicio/` → salir;
  - olvidé mi contraseña → nueva contraseña → entrar;
  - "Recordarme" apagado: la sesión se pierde al cerrar el navegador.
- Sin errores en consola ni de CSP. axe AA sin hallazgos. `npm run build` sin errores.

## Fuera de este proyecto

El CRM y el panel de administrador de las empresas, unir leads con empresas, la marca por cliente,
varios usuarios por empresa y los roles.

Fuentes: [Supabase: Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
(receta del nonce) · [Google: configurar Sign in with Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
(CSP, orígenes, consentimiento).
