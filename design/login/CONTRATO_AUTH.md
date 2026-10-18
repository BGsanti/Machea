# Contrato del login de Machea

> **Actualización 2026-10-14 (D20):** el proveedor real ya existe y es **nuestro backend**.
> - Front: `frontend/src/auth/proveedores/api.ts`.
> - Rutas: `backend/api/acceso.py`.
> - Almacén: `backend/api/almacen_acceso.py`, en Postgres, esquema `acceso` (`supabase/migrations/20261014090000_cuentas_login.sql`).
> - En producción el front usa `api` por defecto.
>
> Cómo encenderlo: [PUESTA_EN_MARCHA.md](PUESTA_EN_MARCHA.md).

El login se construye **sin atarse a ningún proveedor de nube** (D8): Machea piensa migrar de Supabase a
otro servicio. Las pantallas hablan con una sola interfaz, `ProveedorAuth`, y el día que se elija la nube
se escribe un proveedor que la cumpla. Ninguna pantalla cambia.

Código: `frontend/src/auth/`. Pruebas: `frontend/tests/auth.test.ts` (`npm run test:auth`).

| Archivo | Qué hace |
|---|---|
| `contrato.ts` | Tipos (`Cuenta`, `Sesion`…), las interfaces `ProveedorAuth` y `ProveedorAdmin`, los códigos de error y sus textos. |
| `validacion.ts` | Usuario, correo, contraseña (mínimo 10), medidor de fuerza y usuario sugerido. |
| `sesion.ts` | Dónde va la sesión según "Recordarme", y `destinoSeguro()` contra redirecciones a otros sitios. |
| `google.ts` | Botón oficial de Google (GIS): carga el script, crea el nonce, pinta el botón y entrega el ID token. |
| `cripto.ts` | SHA-256, tokens aleatorios y lectura de un JWT (solo para el proveedor de prueba). |
| `proveedores/prueba.ts` | Proveedor local, sin red, para diseñar y hacer demos. **No es seguro**: nunca atiende usuarios reales. |
| `index.ts` | Elige el proveedor (`VITE_AUTH_PROVEEDOR`). En producción el de prueba queda **apagado**. |

## Cuenta y ciclo de vida

Una cuenta = una empresa (constructora o inmobiliaria). El registro pide solo **usuario, correo y
contraseña** (D12). El tipo (constructora o inmobiliaria) lo marca Machea al aprobar.

```
sin_confirmar ──confirma el correo──> pendiente ──Machea aprueba en /admin──> aprobada
                                               └──Machea rechaza──────────> rechazada
```

- Con Google la cuenta nace en `pendiente`, porque Google ya verificó el correo. Si el correo ya tenía
  cuenta, Google se vincula a ella.
- `pendiente` y `rechazada` **sí** pueden entrar: ven "tu cuenta está en revisión" o "no fue aprobada".
  `sin_confirmar` no entra.

## Lo que debe garantizar el proveedor de la nube

Todo esto lo hace hoy el proveedor de prueba, y las pruebas lo verifican:

1. **Claves:** nunca en claro. En la nube se usa un hash lento (Argon2id o bcrypt) en el servidor; el SHA-256
   del proveedor de prueba es solo para la demo.
2. **No revelar correos:**
   - `pedirRecuperacion` y `reenviarConfirmacion` responden igual exista o no el correo;
   - entrar con un correo inexistente da el mismo error que con una clave mala (`credenciales`).
3. **Tope de intentos:** 5 fallos por correo en 15 minutos → `demasiados_intentos`. En la nube conviene
   agregar un tope por IP y un CAPTCHA en el registro.
4. **Enlaces de un solo uso y con vencimiento:** confirmar el correo dura 24 h y recuperar la clave 1 h.
   Pedir un enlace nuevo invalida el anterior. Se guarda el hash del token, no el token.
5. **Cambiar la clave cierra todas las sesiones.** Si la clave nueva no es válida, el enlace **no** se gasta.
6. **Google:** verificar el ID token en el servidor:
   - firma con las llaves públicas de Google;
   - `iss` = `accounts.google.com` o `https://accounts.google.com`;
   - `aud` = nuestro Client ID;
   - `exp` vigente y `email_verified` = true;
   - `nonce` = SHA-256 del nonce que manda el navegador.
   La cuenta se identifica por `sub` (el id de Google), no solo por el correo.
7. **Sesiones:** con "Recordarme", 30 días; sin él, mientras dure la pestaña (máximo 12 h). En la nube, de
   preferencia en una cookie `HttpOnly; Secure; SameSite=Lax` emitida por el servidor.
8. **Aprobar y rechazar** (`ProveedorAdmin`) solo desde el backend, con la sesión de `/admin`. Nunca
   desde el navegador de una empresa.

## Contrato HTTP sugerido para el backend

Es un borrador, para que la nube que se elija (o el backend de FastAPI en `backend/api/`) lo implemente.

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /api/cuentas` | `{usuario, correo, clave}` | `201 {correo}` · `409 correo_ocupado / usuario_ocupado` · `422 datos_invalidos {campos}` |
| `POST /api/cuentas/confirmar` | `{token}` | `204` · `400 enlace_invalido` |
| `POST /api/cuentas/reenviar-confirmacion` | `{correo}` | `204` siempre |
| `POST /api/sesion` | `{correo, clave, recordar}` | `200 Sesion` + cookie · `401 credenciales` · `403 correo_sin_confirmar` · `429 demasiados_intentos` |
| `POST /api/sesion/google` | `{idToken, nonce, recordar}` | `200 Sesion` + cookie · `401 google_invalido` |
| `GET /api/sesion` | — | `200 Sesion` · `401` |
| `DELETE /api/sesion` | — | `204` |
| `POST /api/clave/recuperar` | `{correo}` | `204` siempre |
| `POST /api/clave` | `{token, clave}` | `204` · `400 enlace_invalido` · `422 datos_invalidos` |
| `GET /api/admin/cuentas?estado=pendiente` | — | `200 Cuenta[]` (sesión de `/admin`) |
| `POST /api/admin/cuentas/{id}/aprobar` | `{tipo: constructora \| inmobiliaria}` | `200 Cuenta` |
| `POST /api/admin/cuentas/{id}/rechazar` | — | `200 Cuenta` |

Las tres rutas `/api/admin/cuentas…` **ya existen** en `backend/api/cuentas.py` (panel `/admin` → "Cuentas de empresas").
Delegan en un `AlmacenCuentas` (`listar`, `aprobar` y `rechazar`), que se conecta con `configurar_almacen()` al elegir la
nube. Mientras no haya almacén responden `503 {"detail": {"codigo": "no_disponible", ...}}`. Solo devuelven los campos del
contrato, aunque el almacén traiga más.

Los errores van como `{ "codigo": "<CodigoError>", "campos"?: {...} }` y el front muestra el texto de
`MENSAJES` en `contrato.ts`.

## Variables del front (Vite; ninguna es secreta)

| Variable | Para qué |
|---|---|
| `VITE_AUTH_PROVEEDOR` | `prueba` (por defecto). El de la nube se agrega al elegirla. |
| `VITE_AUTH_PRUEBA_EN_PRODUCCION` | `1` permite el proveedor de prueba en un build de producción. Solo para una vista previa de demo, **nunca** en www.machea.co. |
| `VITE_GOOGLE_CLIENT_ID` | Client ID público del cliente OAuth "Web". Vacío = el bloque de Google no aparece. |

## Requisitos de la página para el botón de Google

Según la guía de Google "Get your Google API client ID":

- **CSP:**
  - `script-src https://accounts.google.com/gsi/client`;
  - `frame-src https://accounts.google.com/gsi/`;
  - `connect-src https://accounts.google.com/gsi/`;
  - `style-src https://accounts.google.com/gsi/style`.
- **`Referrer-Policy: strict-origin-when-cross-origin`.** El prototipo usaba `no-referrer`, y con eso el
  botón no funciona.
- **Orígenes autorizados en el cliente OAuth:** `https://www.machea.co`, `https://machea.co`,
  `http://localhost` y `http://localhost:5173`.
- **Pantalla de consentimiento** con nombre, logo, correo de soporte, página de inicio y **política de
  privacidad** publicada en machea.co. El borrador está en `POLITICA_PRIVACIDAD_BORRADOR.md`.
