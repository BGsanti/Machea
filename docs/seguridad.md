# Seguridad: auditoría del 22-oct-2026, qué se corrigió y qué falta

Alcance: todo el repositorio (landing, quiz, API, CRM, SQL de Supabase), las dependencias, lo que está publicado en
`www.machea.co` y `machea-api.onrender.com`, y el historial completo de git. **Lo que no se pudo ver desde el código**
(los paneles de Vercel, Render, Supabase, GitHub y Dapta) está en la lista «A hacer en los paneles».

## 1. El aviso de ayer (21-oct): PHP y Node.js

- **PHP no se usa en Machea.** No hay archivos `.php`, ni `composer`, ni WordPress en el repositorio. La API es Python (Render), la landing es
  estática (Vite, Vercel), el CRM es Next.js (Vercel) y la base es Postgres (Supabase). Lo único que habría que confirmar es que
  `machea.co` no tenga además un hosting con PHP (WordPress, cPanel) fuera de este repositorio. PHP: CVE-2026-109618 y CVE-2026-109619
  (ejecución remota de código, 9.2), corregidos en 8.5.12, 8.4.27, 8.3.36 y 8.2.35.
- **Node.js sí está en el camino, pero no en el servidor de la API.** CVE-2026-111497 (fallo del descompresor Brotli que permite ejecutar
  código si se descomprime algo hostil; `fetch()` lo hace solo) y 9 más. Corregidos en **22.23.4, 24.22.1 y 26.12.1**.
  - **Vercel** (landing y CRM): puso reglas de firewall el mismo 21-oct y actualiza sus ejecuciones de Node 22 y 24 sin que usted haga nada.
    **Node 20 no recibe el arreglo.** Por eso `crm/package.json` y `frontend/package.json` ahora fijan `"engines": { "node": "24.x" }`.
  - **Su Mac** (desarrollo): tiene Node `v24.14.1`, que **está afectado**. Actualice a 24.22.1 o superior.
  - **Render** (API): es Python; no corre Node.
- **Next.js del CRM:** el 14-oct salieron dos fallas críticas (ejecución de código en `use cache` y en el optimizador de imágenes con SVG) y una alta
  (denegación de servicio en Server Actions), corregidas en 16.4.1. El CRM usa **16.4.2** y `sharp` 0.35.5: ya están corregidas.

Fuentes: [aviso de Vercel](https://vercel.com/kb/bulletin/node-js-security-advisory),
[resumen de Next.js y Node.js](https://brandefense.io/security-news/next-js-node-js-security-updates-october-2026/),
[Node.js y PHP, parches urgentes](https://cybernews.com/security/php-node-js-vulnerabilities-patch-exploit/).

## 2. Resultado de la auditoría

### Llaves y secretos
- **Archivos versionados y todo el historial de git: ninguna llave real.** Solo hay ejemplos (`.env.example`), datos de prueba y la llave `anon` de
  Supabase en `frontend/public/experiencia/js/config.js` (rol `anon`, pública por diseño; lo que protege los datos es el RLS).
- Lo publicado en producción (cabeceras, rutas sensibles como `/.env` y `/.git/config`, el esquema de la API) no expone llaves.
- Limitación: el historial local tiene un objeto de git dañado (`71541ac…`), así que ese commit no se pudo leer.
  Ejecute el escáner también en un clon nuevo: `python3 scripts/seguridad/escanear-secretos.py --historial`.
- La clave del webhook de Manuela (`MANUELA_WEBHOOK_SECRET`) apareció en la salida de una herramienta durante una sesión de trabajo.
  **Cámbiela** (tabla de la sección 4) por higiene.

### Hallazgos y estado

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| S-01 | Alta | Node `v24.14.1` en el computador de desarrollo, afectado por CVE-2026-111497 | **Usted:** actualizar |
| S-02 | Alta | La API aceptaba llamadas desde cualquier página del mundo (`CORS: *`), incluido `/api/llamar`, que dispara llamadas reales | **Corregido** (lista de orígenes; `CORS_ORIGENES` para sumar uno) |
| S-03 | Media | `/docs`, `/redoc` y `/openapi.json` públicos en Render: el mapa completo de la API | **Corregido** (apagados en Render; `API_DOCS=1` los enciende) |
| S-04 | Media | La página principal solo traía HSTS: sin CSP, sin protección contra clickjacking ni `nosniff` | **Corregido** (`frontend/vercel.json`, probado sin violaciones en landing, quiz y página anterior) |
| S-05 | Media | La API sin cabeceras de seguridad ni tope de tamaño de las peticiones | **Corregido** (2 MB; 413 si se excede) |
| S-06 | Media | `.gitignore` sin reglas para `.env`, llaves ni archivos de secretos, en un repositorio público | **Corregido** |
| S-07 | Baja | Herramientas de desarrollo con vulnerabilidades (Vite alto; esbuild moderado, solo del servidor de desarrollo) | **Corregido** (`npm audit` y `pnpm audit` en 0) |
| S-08 | Media | Sin revisión automática de secretos ni de dependencias | **Parcial** (Dependabot, escáner y hook activos; los dos workflows de GitHub esperan en `scripts/seguridad/workflows-pendientes/`, ver sección 5) |
| S-09 | Media | El CRM no tiene aislamiento por empresa en la base (RLS): depende de que cada consulta filtre por `empresa_id`. Se revisaron todas y filtran, pero un olvido futuro filtraría datos entre empresas | **Parcial** (pruebas automáticas de aislamiento por empresa y por asesor en `crm/src/crm/servidor/equipo.test.ts`; el RLS en la base sigue pendiente, `design/crm/PLAN.md` fase 6, antes de la segunda empresa) |
| S-10 | Baja | Contraseñas con scrypt N=2^14, p=1 (OWASP pide más memoria) | **Corregido** (N=2^15, p=3 y se vuelven a cifrar solas al iniciar sesión) |
| S-11 | Baja | Dependencias de la API sin versión fija (`>=`) | **Parcial** (`pip-audit` en CI; falta un archivo de versiones fijas) |
| S-12 | Info | Render corre Python 3.11 | Subir a 3.12 o 3.13 cuando se pueda |
| S-13 | Info | La política de privacidad y el aviso provisional dicen que Manuela no graba; Dapta sí graba y transcribe | Corregir los textos antes de `GRABACIONES_GUARDAR=todas` |

### Lo que ya estaba bien (se verificó)
- **Supabase:** todas las tablas de `public` con RLS; todas las funciones `SECURITY DEFINER` fijan `search_path`; la clave `anon` solo ejecuta 5 funciones.
- **Login:** scrypt con sal, comparación en tiempo constante, cookie `HttpOnly` + `Secure` + `SameSite=Lax`, sesión guardada como hash, límites por intento,
  segundo factor (TOTP) para el panel de administración, hash señuelo contra enumeración de cuentas.
- **API:** webhooks de Dapta con secreto (401 sin él), `/api/captacion/*` con llave, protección contra SSRF al leer logos (`api/ssrf.py`) y logos con CSP.
- **CRM:** todas las acciones de servidor exigen sesión (salvo el envío del formulario público, que se defiende solo: campo trampa, tiempo mínimo,
  límite por IP y por formulario, validación contra la configuración guardada, autorización de datos registrada); el audio solo se sirve a la empresa
  dueña y desde `files.dapta.ai`; Markdown de artículos saneado con `sanitize-html`; las rutas de Better Auth devuelven 404 con el login de Machea.

## 3. Cómo se vigila ahora

- **En cada cambio y cada madrugada** (`seguridad.yml`; activar según la sección 5): escáner de secretos sobre archivos e historial, `npm audit` / `pnpm audit` /
  `pip-audit`, compilación, pruebas y la comprobación de que la CSP de la landing coincide con su página (`frontend/scripts/verificar-csp.mjs`).
- **Cada semana** (`codeql.yml`; activar según la sección 5): análisis estático de GitHub (JavaScript/TypeScript y Python).
- **Dependabot** (`.github/dependabot.yml`): abre un cambio cuando una dependencia tiene arreglo de seguridad.
- **Antes de cada commit** (una vez por clon: `bash scripts/seguridad/instalar-hooks.sh`): el hook detiene el commit si trae una llave.
- **Si cambia el script en línea de la landing o del quiz**, hay que actualizar su huella en `frontend/vercel.json` (el verificador dice cuál).

## 4. Si se filtra una llave (borrar del código NO basta: el repositorio es público)

1. **Cambiar la llave el mismo día** (tabla), antes de limpiar el historial.
2. Revisar los registros del servicio por uso raro desde la fecha de la filtración.
3. Si hubo acceso a datos de personas: avisar a los afectados y a la SIC, con el abogado (Ley 1581 de 2012).
4. Anotar qué pasó y cómo se evitará.

| Qué | Dónde está | Cómo se cambia |
|---|---|---|
| Contraseña de la base (`DATABASE_URL` de Render) | Render | Supabase → Database → reset password; actualizar Render; redeploy |
| Cadena de `crm_app` | Vercel `machea2` | `alter role crm_app with password '…'` (SQL Editor); actualizar Vercel |
| `SUPABASE_SERVICE_KEY` | Render | Supabase → API Keys → rotar `service_role`; actualizar Render |
| `MANUELA_WEBHOOK_SECRET` | Render + URL del webhook en Dapta (`?k=`) | Nuevo valor en Render y en el agente de Dapta (cuidado: guardar el agente en la interfaz de Dapta puede borrar el webhook) |
| `CAPTACION_WEBHOOK_SECRET`, `CAPTACION_API_KEY`, `DAPTA_CAPTACION_FLOW_URL` | Render + Dapta | Nuevos valores en ambos lados |
| `DAPTA_API_KEY`, `DAPTA_FLOW_WEBHOOK_URL` | Render | Dapta → credenciales; actualizar Render |
| `ADMIN_PASSWORD`, `ADMIN_TOTP_SECRET` | Render | Nuevos valores; volver a registrar el autenticador |
| `DEMO_SECRET` | Render | Nuevo valor (los enlaces de demo anteriores dejan de servir) |
| `SMTP_PASSWORD` | Render | Contraseña de aplicación de Google: revocar y crear otra |
| `FORMULARIOS_SECRETO` / `AUTH_SECRET` | Vercel `machea2` | Nuevo valor (los formularios abiertos en ese momento piden recargar) |
| Credencial de GitHub del computador | Llavero de macOS | Revocar el token en GitHub y volver a iniciar sesión |

## 5. A hacer en los paneles (yo no puedo verlos)

**GitHub** (repositorio `BGsanti/Machea`, público)
- [ ] **Activar los dos workflows.** El token guardado en el computador no tiene el permiso `workflow`, así que GitHub rechazó subirlos a
  `.github/workflows/`. Están en `scripts/seguridad/workflows-pendientes/` (`seguridad.yml` y `codeql.yml`). Opción A: en github.com abra cada
  archivo → lápiz (Edit) → cambiar la ruta del nombre a `.github/workflows/<archivo>.yml` → Commit. Opción B: crear un token con el permiso
  `workflow` y volver a iniciar sesión en el computador, y mover los archivos con `git mv`.
- [ ] Settings → Code security: activar **Secret scanning**, **Push protection**, **Dependabot alerts** y **Dependabot security updates**, y el aviso privado de vulnerabilidades.
- [ ] Settings → Branches: proteger `main` (exigir revisión y que pasen los chequeos de «Seguridad»; sin *force push*).
- [ ] Verificación en dos pasos (idealmente con llave física) para todas las personas con acceso.

**Vercel** (`my-project` y `machea2`)
- [ ] Settings → General → **Node.js Version: 24.x o 22.x** (nunca 20.x ni menor); redeploy.
- [ ] Firewall: dejar activas las reglas que Vercel agregó el 21-oct; revisar los bloqueos.
- [ ] Variables de entorno de `machea2`: marcar la de la base y los secretos como *Sensitive*; que existan solo en Production.
- [ ] Deployment Protection para las vistas previas.

**Render** (`machea-api`)
- [ ] Tras desplegar: comprobar que `https://machea-api.onrender.com/docs` ya da 404.
- [ ] Si alguna página de otro dominio usa la API desde el navegador (por ejemplo, un stand), sumarla en `CORS_ORIGENES`.
- [ ] Revisar quién tiene acceso al servicio y a sus variables.

**Supabase** (`machea-leads`)
- [ ] Settings → API → *Exposed schemas*: solo `public` (que `crm` y `acceso` no estén).
- [ ] Database → *Network restrictions* (o al menos *Enforce SSL*) y copias de seguridad / PITR.
- [ ] Verificación en dos pasos en la cuenta.

**Dapta y Google**
- [ ] Cambiar `MANUELA_WEBHOOK_SECRET` (ver sección 2) y decidir lo de «Public call link» (deja los audios accesibles por enlace).
- [ ] Verificación en dos pasos en la cuenta de Google de `machea.co@gmail.com` y en Dapta.

**Su computador**
- [ ] Actualizar Node.js a 24.22.1 o superior (`node --version`).
- [ ] `bash scripts/seguridad/instalar-hooks.sh` en cada clon del repositorio.
