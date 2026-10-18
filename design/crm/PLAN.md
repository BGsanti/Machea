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

## Fase 2. Machea guarda lo que el CRM necesita

Hoy un lead no guarda ni la marca ni la constructora, y el resultado de Manuela vive en memoria.

- [ ] Migración `<ts>_llamadas_y_marca.sql`:
  - `consultas.marca` y `consultas.autorizacion`, y `guardar_consulta` con `p_marca` y `p_autorizacion`;
  - `public.solicitudes_llamada`, que escribe `/api/llamar`, con la constructora tomada del catálogo por
    `id_proyecto`. Ojo: `constructora-bolivar` en la marca y `bolivar` en el catálogo;
  - `public.resultados_llamada`, que escribe el webhook (resumen, temperatura, seguimiento, `cita_*`).
- [ ] `backend/api/llamadas.py`, en memoria y en Postgres, con el patrón de `almacen_acceso.py`. Secreto
      `MANUELA_WEBHOOK_SECRET` en el webhook de Dapta, que hoy no tiene.
- [ ] `datos.js` y `llamada.js` mandan la marca, `id_proyecto`, el correo y la autorización.
- [ ] Login (rama `login`): la cookie con `Path=/` (hoy `/api`, y el CRM no la ve), y el botón "Abrir CRM"
      en `/inicio/`.

## Fase 3. Consentimiento y política (requisito de D4)

- [ ] Formulario de Machea: una casilla aparte, sin marcar, que nombra a la constructora del proyecto antes de
      la llamada. Formularios con marca: el texto dice que Machea recoge los datos para esa empresa. Se guarda
      la versión aceptada.
- [ ] Política (`design/login/POLITICA_PRIVACIDAD_BORRADOR.md`): las empresas como destinatarias y Machea como
      encargado; plazos. Fuera del código: un acuerdo de tratamiento con cada empresa.

## Fase 4. Entrada de leads

- [ ] Migración `<ts>_crm_ingesta.sql`:
  - `crm.empresa_fuentes (empresa_id, tipo marca|constructora|inmobiliaria, slug)`;
  - triggers que llenan `crm.bandeja_leads`, con la regla de marca y la de constructora (esta, solo con
    autorización).
- [ ] `crm/src/crm/servidor/ingesta.ts`: `procesarBandeja(empresaId)` escribe con `repo.crear` dentro de
      `conEmpresa`, así corren las reglas y los flujos. Mapeo:
  - lead → candidato;
  - llamada → tarea completada;
  - cita → evento;
  - seguimiento → tarea pendiente.
- [ ] `/admin` → "Fuentes" por cuenta. Si está vacía no pasa nada, así que se puede desplegar sin riesgo.

## Fase 5. Producción (la hacen Santiago o Felipe)

1. Merge del PR #14. Hay que resolver los conflictos con `main` en `CLAUDE.md` y `app.py`, quitar las reglas de
   `/acceso` repetidas en `vercel.json`, poner un timestamp nuevo a la migración y la cookie con `Path=/`.
2. Migraciones en este orden: login → `llamadas_y_marca` → `crm` → `crm_ingesta`. Luego la clave del rol
   `crm_app`, puesta a mano, y `MANUELA_WEBHOOK_SECRET`.
3. Proyecto de Vercel con root `crm/`:
   - `DATABASE_URL` con el rol `crm_app`, `AUTH_MODO=machea`, `MACHEA_URL`, `CRM_MIGRAR_AL_ARRANCAR=false`;
   - `CRM_BASE_PATH=/crm` y `CRM_ORIGENES=www.machea.co`.
4. Merge del CRM. Al final, el rewrite `/crm/:path*` en `frontend/vercel.json`, que es el que lo enciende.

El detalle irá en `PUESTA_EN_MARCHA.md` cuando estén las fases 2 a 4.

## Fase 6. Después

- RLS por empresa en la base (`app.empresa_id`), antes de la segunda empresa que pague.
- Camila y las solicitudes de demo como datos de la empresa "Machea".
