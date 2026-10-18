# CRM multiempresa: puesta en marcha

Para **Santiago o Felipe**: tienen acceso a Supabase (`machea-leads`), Render (`machea-api`) y Vercel. Diego
aprueba cada merge. El plan está en [PLAN.md](PLAN.md) y las decisiones en [DECISIONES.md](DECISIONES.md).

**Nada de esto se publica sin la política de privacidad en `/privacidad/`.** Los textos de autorización del
formulario enlazan ahí (lo decide Diego).

## Qué entra y en qué orden

| # | PR | Rama → destino | Qué trae |
| --- | --- | --- | --- |
| 1 | #14 | `login` → `main` | Login de empresas, `/admin` → Cuentas y Fuentes de leads, cookie con `Path=/` y "Abrir el CRM" |
| 2 | #18 | `crm/datos-llamadas` → `main` | Marca, proyecto y resultado de Manuela guardados; autorización en el formulario |
| 3 | #17, luego #16 | `crm/multiempresa` → `crm/rea-crm` → `main` | El CRM multiempresa en `crm/` y la entrada de leads |

Cada migración se aplica **antes** del merge que la necesita.

## Paso 1. Login (PR #14)

1. **Antes del merge, resolver la rama:**
   - los conflictos con `main` en `CLAUDE.md` y `backend/api/app.py`;
   - en `frontend/vercel.json`, dejar una sola regla de cabeceras para `/acceso` y `/acceso/(.*)` (la de
     `login`: `main` trae otra con `connect-src 'none'`, que tumbaría el login);
   - renombrar `supabase/migrations/20261014090000_cuentas_login.sql` con una fecha posterior a las de `main`
     (por ejemplo, `20261018110000_cuentas_login.sql`), para que el orden de las migraciones sea el real.
2. **Supabase:** aplicar esa migración en `machea-leads`.
3. **Render (`machea-api`):**
   - `DATABASE_URL`, con la cadena del **Session pooler** (IPv4, puerto 5432, usuario `postgres.<ref>`). La
     conexión directa es solo IPv6 y Render no la alcanza.
   - `FRONT_URL=https://www.machea.co`.
4. **Comprobar** el detalle de `design/login/PUESTA_EN_MARCHA.md`: crear una cuenta, que llegue el correo y
   aprobarla en `/admin`.

## Paso 2. Llamadas y autorización (PR #18)

Detalle en `docs/crm-datos-de-llamadas.md` de esa rama.

1. **Supabase:** aplicar `20261018120000_llamadas_y_marca.sql`.
2. **Render:** comprobar que estén `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`; Camila ya las usa.
3. **Secreto del webhook de Manuela**, en este orden para no cortar el resumen post-llamada:
   1. generar 24 o más caracteres al azar;
   2. en el agente de Dapta, poner como `webhook_url`
      `https://machea-api.onrender.com/webhooks/dapta/resultado?k=<secreto>`;
   3. en Render, poner `MANUELA_WEBHOOK_SECRET=<secreto>`.
4. **Merge**, con `/privacidad/` ya publicada.
5. **Comprobar** con una llamada real:
   - en `solicitudes_llamada` aparece la fila con `marca`, `dueno_slug` y `autoriza_compartir`;
   - al colgar, en `resultados_llamada` aparece su `call_id`, con `solicitud_id`.

## Paso 3. El CRM (PR #17 y #16)

1. **Esquema `crm`.** Desde `crm/`, con una conexión de administrador (Session pooler, usuario `postgres.<ref>`):

   ```bash
   cd crm
   pnpm install
   DATABASE_URL='postgresql://postgres.<ref>:<clave>@<pooler>:5432/postgres?sslmode=require' pnpm db:migrar
   ```

2. **Supabase:** aplicar `supabase/migrations/20261018130000_crm_ingesta.sql`. Necesita los pasos 1, 2 y 3.1.
   Crea el rol `crm_app` y los triggers. Sin fuentes asignadas no mueve ningún lead.
3. **Clave del rol del CRM**, a mano y fuera del repo:

   ```sql
   alter role crm_app password '<clave larga al azar>';
   ```

4. **Vercel: proyecto nuevo** para el CRM.
   - **Configuración del proyecto:** Root Directory `crm`, framework Next.js, instalación con pnpm, Node 24. La
     región, la misma de Supabase.
   - **Variables de producción:**

     | Variable | Valor |
     | --- | --- |
     | `DATABASE_URL` | pooler de **transacciones** (puerto 6543), usuario `crm_app.<ref>`, `?sslmode=require` |
     | `AUTH_MODO` | `machea` |
     | `MACHEA_URL` | `https://www.machea.co` |
     | `CRM_BASE_PATH` | `/crm` |
     | `CRM_ORIGENES` | `www.machea.co,machea.co` |
     | `CRM_MIGRAR_AL_ARRANCAR` | `false` |
     | `CRM_DB_MAX_CONEXIONES` | `5` (opcional) |

   - **Protección:** la URL de producción del proyecto no debe pedir la autenticación de Vercel, porque el
     rewrite de `www.machea.co` llega ahí.
   - **Si algo falta, el CRM no arranca:** en Vercel exige `AUTH_MODO=machea` y `DATABASE_URL`.
5. **Merge** del PR #17 en `crm/rea-crm` (lo revisa Carlos) y después del #16 en `main`.
6. **Encenderlo** en el proyecto del formulario (`frontend/`):
   - en `frontend/vercel.json`, agregar los rewrites:

     ```json
     { "source": "/crm", "destination": "https://<crm-produccion>.vercel.app/crm" },
     { "source": "/crm/:path*", "destination": "https://<crm-produccion>.vercel.app/crm/:path*" }
     ```

   - en las variables de Vercel del formulario, `VITE_CRM_URL=/crm/`, y volver a desplegar. Las cuentas aprobadas
     ven "Abrir el CRM" en `/inicio/`.
7. **Nuevas tablas del CRM en el futuro:** después de `pnpm db:migrar`, correr `select crm.cerrar_tablas();` en
   Supabase (RLS y permisos para `crm_app`).

## Paso 4. Asignar las fuentes

En `/admin` → Cuentas de empresas → **Todas** → la cuenta aprobada → **Fuentes de leads**:

- **Formulario con marca** (`amarilo`, `colsubsidio`, `constructora-bolivar`, `cusezar`): todo lo que entra por
  ese formulario.
- **Proyectos de la constructora** (`amarilo`, `bolivar`, `colsubsidio`, `cusezar`): quien pidió la llamada por
  uno de sus proyectos y autorizó compartir.
- **Inmuebles de la inmobiliaria:** lo mismo en Arriendo.

Cada fuente es de una sola empresa. Una cuenta sin fuentes no recibe leads.

## Comprobación final

1. Entrar a `www.machea.co/acceso/` con una cuenta aprobada → `/inicio/` → **Abrir el CRM** → abre
   `www.machea.co/crm/` con la empresa.
2. **Sin sesión**, `/crm/` manda a `/acceso/`. **Con una cuenta pendiente**, manda a `/inicio/` ("en revisión").
3. Con una fuente de marca asignada, pedir una llamada de prueba desde ese formulario. Al entrar al CRM aparece el
   candidato y, cuando Manuela cuelga, la llamada (y la cita, si quedó) en su actividad.
4. Con otra cuenta, ese candidato **no** aparece.
5. `POST https://www.machea.co/crm/api/auth/sign-up/email` responde 404.

## Si algo sale mal

| Qué pasa | Qué hacer |
| --- | --- |
| Hay que apagar el CRM | Quitar los rewrites de `frontend/vercel.json` (o `VITE_CRM_URL`) y redesplegar. Los datos se quedan. |
| Hay que dejar de mandar leads a una empresa | Quitarle sus fuentes en `/admin`. |
| Algo falla en los triggers | Los triggers nunca rompen el guardado del lead: avisan con `WARNING` en los logs de Supabase y el lead se guarda igual. |
