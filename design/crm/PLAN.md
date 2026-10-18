# CRM multiempresa: plan

Decisiones en [DECISIONES.md](DECISIONES.md). Rama `crm/multiempresa`, que parte de `crm/rea-crm` (PR #16 de
Carlos), con PR hacia la rama de Carlos.

Resultado esperado: una constructora entra con su cuenta de Machea a `www.machea.co/crm` y ve en Candidatos sus
leads: lo que respondieron, el proyecto y el resultado de la llamada de Manuela, con la cita como evento. Usa
todo el CRM sin ver nunca datos de otra empresa.

## Fase 1. CRM multiempresa (solo `crm/`): HECHA

- [x] Esquema `crm` y `empresa_id` en todas las tablas. Tabla `empresas` y `contadores` por empresa; la
      configuración queda por empresa. La migración `crm/drizzle/0000_inicial.sql` se regeneró.
- [x] `src/db/empresa.ts` (`empresaActual`, `conEmpresa`, `deEmpresa`). El filtro va en `repositorio.ts` y en
      cada consulta directa: `consultas`, `sistema`, `especiales`, `flujos`, `inicializar`, `datos-ejemplo`,
      `paginas/inicio` y `paginas/flujo`.
- [x] `validarReferencias`: búsquedas, polimórficos y propietario tienen que ser de la misma empresa.
- [x] `AUTH_MODO=machea` (`src/auth/machea.ts`). En ese modo no hay `/api/auth`, no hay `/login` y no se crean
      usuarios.
- [x] Modo local con `disableSignUp`; el primer administrador se crea desde el servidor.
- [x] Webhook de Flujos solo a URLs `https` públicas (`src/crm/servidor/red.ts`).
- [x] `basePath`, `allowedOrigins`, CSP y `noindex` en `next.config.ts`, controlados por variables
      (`CRM_BASE_PATH`, `CRM_ORIGENES`).
- [x] `CRM_MIGRAR_AL_ARRANCAR=false` para producción; `pnpm db:migrar` las aplica igual.

**Verificado (2026-10-18), con PostgreSQL 18 real, el esquema `acceso` del PR #14 y `next start`:**

- `pnpm typecheck` y `pnpm build`, sin errores.
- `scripts/prueba-fugas.ts`: **735 comprobaciones, 0 fallos.** Como empresa B se recorren todas las apps,
  pestañas, vistas, búsquedas y páginas especiales, y las fichas, informes, paneles y flujos de A (dan 404).
  Después B llama 29 acciones con ids de A: las filas de A no cambian y ninguna fila de B apunta a A.
- La prueba sí detecta fugas: sin el filtro de listas da 356 fallos, y sin el de `actualizar`, 2.
- Sin sesión y con una cuenta pendiente, el CRM manda a `/acceso/` de Machea.
- `POST /api/auth/sign-up/email` da 404 en modo `machea` y 400 ("sign up is not enabled") en modo local, sin
  crear a nadie.
- Modo local en el navegador: el primer administrador se crea desde la pantalla, entra al CRM con su empresa, y
  la segunda vez la pantalla ya solo deja iniciar sesión.

## Fase 2. Machea guarda lo que el CRM necesita: HECHA (sin desplegar)

Rama `crm/datos-llamadas` (parte de `main`), con PR hacia `main`. Puesta en marcha y detalle en
`docs/crm-datos-de-llamadas.md` de esa rama.

- [x] Migración `20261018120000_llamadas_y_marca.sql`:
  - `consultas.marca` y `consultas.autorizacion`, que `guardar_consulta` recibe como parámetros opcionales;
  - `solicitudes_llamada`, con el dueño del proyecto sacado del catálogo por id;
  - `resultados_llamada`, uno por `call_id`.
- [x] `backend/api/llamadas.py`: Supabase con service_role, como Camila; sin él, memoria. Las demos con marca no
      se guardan.
- [x] Webhook de Manuela: con `MANUELA_WEBHOOK_SECRET` exige `?k=` y solo entonces guarda.
- [x] El formulario manda la marca (si la base no tiene la migración, reintenta sin ella) y el id del proyecto o
      inmueble.
- [x] Login (rama `login`, `b806e06`):
  - cookie con `Path=/`, y al salir se borran las dos;
  - "Abrir el CRM" en `/inicio/`, solo con `VITE_CRM_URL`.
- [x] CRM: una cuenta con sesión pero sin aprobar va a `/inicio/`. Mandarla a `/acceso/` era un bucle.

**Verificado (2026-10-18):**
- Backend `main` + fase 2: 192 pruebas, 21 de ellas nuevas.
- Migración sobre las de leads en PostgreSQL 18: `guardar_consulta` funciona con y sin `p_marca`, la marca rara se
  descarta y `anon` no puede leer ni escribir las tablas nuevas.
- El respaldo del formulario cuando la base no tiene la migración, probado en Node.
- Login: backend 153 y front 27/27, y el build con y sin `VITE_CRM_URL`.
- Prueba de fugas del CRM: 735/0.

## Fase 3. Consentimiento: HECHA en código (sin desplegar)

Textos y decisiones en [CONSENTIMIENTO.md](CONSENTIMIENTO.md) (D5: los cortos).

- **Rama `crm/datos-llamadas`, commit `6fe6e61`:**
  - `js/consentimiento.js` con los textos versionados;
  - la casilla del registro (Machea y marcas);
  - la hoja "Antes de llamarte" al tocar "Hablar con un asesor" en un proyecto de otra empresa;
  - la prueba guardada (`consultas.autorizacion`, `autoriza_compartir`).
- **Verificado:** Playwright sobre el formulario real con el backend local, 36/36 (Machea, celular, Amarilo,
  Arriendo y demo).
- **Falta (Diego):** `/privacidad/` publicada y la revisión legal. Sin ellas no se publica.

## Fase 4. Entrada de leads: HECHA (sin desplegar)

- **CRM (`crm/multiempresa`, `1fd2efe`):**
  - `crm.empresa_fuentes`, `crm.bandeja_leads` y `crm.leads_machea`, y `origen_externo`;
  - `ingesta.ts`: candidato, llamada, cita, seguimiento y temperatura, procesados al entrar.
- **Base de Machea:** `supabase/migrations/20261018130000_crm_ingesta.sql`, con el rol `crm_app`, RLS y los
  triggers de las dos reglas.
- **`/admin` → Fuentes de leads** (rama `login`, `056940f`).
- **Verificado en PostgreSQL 18 con todas las migraciones:**
  - `prueba-ingesta.ts`: 22/0, como `crm_app`. Sin la condición de autorización en el trigger da 7 fallos.
  - `prueba-fugas.ts`: 741/0.
  - `test_fuentes`: 10/10, con Postgres.
  - El panel en Playwright: 9/9, en claro y en oscuro.

## Fase 5. Producción: guía lista

Paso a paso en [PUESTA_EN_MARCHA.md](PUESTA_EN_MARCHA.md). La hacen Santiago o Felipe; Diego aprueba los merges.

## Fase 6. Después

- RLS por empresa en la base (`app.empresa_id`), antes de la segunda empresa que pague.
- Camila y las solicitudes de demo como datos de la empresa "Machea".
