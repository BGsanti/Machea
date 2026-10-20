# Puesta en producción: login + CRM + Camila

Una sola guía, en orden, para llevar a producción lo que hoy está repartido en cuatro ramas. Complementa (no reemplaza)
`design/login/PUESTA_EN_MARCHA.md`, `design/crm/PLAN.md` (fase 5) y `docs/agente-captacion.md`.

## Qué se integra

| PR | Rama | De | Qué trae |
|---|---|---|---|
| #14 | `login` | Diego | Cuentas de empresas en nuestro backend y en Postgres (esquema `acceso`), pantallas `/acceso/`, `/acceso/nueva-clave/`, `/inicio/`, aprobación desde `/admin`. |
| #18 | `crm/datos-llamadas` | Diego | Las llamadas de Manuela y a quién pertenece cada lead se guardan (`api/llamadas.py`). Autorización corta en el registro y hoja «Antes de llamarte». |
| #16 + #17 | `crm/rea-crm` + `crm/multiempresa` | Carlos + Diego | El CRM (`crm/`, Next.js 16): multiempresa, entra con la cuenta de Machea, y los leads de Machea llegan al CRM de cada empresa. |
| — | `main` | — | Landing plana, Camila, Manuela v2.1. |

Rama `integracion-crm-login`: las cuatro fusionadas sobre `main`. Conflictos resueltos: `backend/api/app.py` (dos routers),
`CLAUDE.md` (§8.4 ahora es el login real) y `frontend/vercel.json` (se quitaron las reglas del prototipo de `/acceso`, cuyo
`connect-src 'none'` bloqueaba las llamadas del login real); se borró el prototipo `frontend/public/acceso/`.
Verificado en esa rama: backend 230 pruebas (6 omitidas por requerir Postgres), front 27/27 y build, CRM `typecheck` y `build`.

## Orden

### 1. Decisiones y requisitos legales (antes de abrir a empresas reales)
- Publicar **`/privacidad/`** (hoy el registro hace aceptar una política cuyo enlace no lleva a nada). Borrador: `design/login/POLITICA_PRIVACIDAD_BORRADOR.md`.
- Decidir **el responsable del tratamiento** (Machea no está constituida: qué personas figuran, con qué dirección y correo).
- Revisión de un abogado de los textos de `design/crm/CONSENTIMIENTO.md` y un acuerdo con cada empresa que reciba leads.
- **Sin esto, la regla «el lead va a la dueña del proyecto» (D4) no se enciende**; sí puede encenderse la regla de marca (formulario propio de la empresa).
- Visto bueno de **Carlos** para adaptar su CRM (pendiente en `design/crm/DECISIONES.md`).

### 2. Merge a `main`
Es seguro hacerlo antes de Supabase/Render: Vercel solo cambia el front («Iniciar sesión» pasa a llevar al login real, que responde
«todavía no está disponible» mientras Render no tenga `DATABASE_URL`); Render no despliega solo; el CRM no se publica hasta tener su proyecto
de Vercel y el rewrite `/crm`.

### 3. Supabase (`machea-leads`) · SQL Editor
Carpeta `~/Desktop/MACHEA/SUPABASE/` (copia de `supabase/migrations/`):
1. Corra `0-que-falta.sql`: muestra cuáles migraciones están aplicadas.
2. Corra, en orden y **una sola vez cada una**, las que salgan en `false`: `1-cuentas_login`, `2-solicitudes_demo`, `3-captacion`, `4-llamadas_y_marca`.
   (Las de Diego no se pueden repetir; si una falla a medias, avise antes de volver a correrla.)
3. Desde `crm/`: `DATABASE_URL=<cadena con permisos de administrador> pnpm db:migrar` crea el esquema `crm`.
   **El CRM usa el driver de Node (`pg`), que con `?sslmode=require` verifica el certificado y falla con `self-signed certificate in certificate chain`**
   (el certificado del pooler de Supabase lo firma su propia entidad). Para el CRM, tanto en esta migración como en Vercel, termine la cadena en
   `?sslmode=no-verify` (cifra igual; es lo mismo que hace `psycopg` en Render con `require`). Render sigue con `?sslmode=require`.
4. Corra `6-crm_ingesta.sql` (crea el rol `crm_app` y los triggers). Después ponga la clave del rol a mano:
   `alter role crm_app with password '<clave larga>';` — nunca en el repo ni en un chat.
5. Verifique con `0-que-falta.sql`: todo en `true`.

### 4. Render (`machea-api`) · Environment, luego Manual Deploy
| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Login y cuentas. **Session pooler** de Supabase (`…pooler.supabase.com:5432/postgres?sslmode=require`), con la clave de la base. Secreta. |
| `FRONT_URL` = `https://www.machea.co` | Enlaces de los correos de confirmación y recuperación. |
| `SMTP_USER`, `SMTP_PASSWORD` (+ `CORREO_EQUIPO`) | Sin correo nadie confirma su cuenta. Probar en `/admin` → Correo. El plan gratis de Render lo bloquea. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Camila y las llamadas de Manuela guardadas. La `service_role`, solo aquí. |
| `MANUELA_WEBHOOK_SECRET` (24+) | Con él, el webhook de Manuela exige `?k=` y guarda. Sin él, funciona como hoy y no guarda. |
| `DAPTA_CAPTACION_FLOW_URL`, `CAPTACION_WEBHOOK_SECRET`, `CAPTACION_API_KEY` | Camila (valores en `~/Desktop/MACHEA/AGENTE/camila-secretos-NO-SUBIR.txt`). |
| `CAPTACION_LLAMAR_DEMOS` = `false` | Pasar a `true` solo después de la primera llamada de prueba. |

### 5. Dapta
- Si se fijó `MANUELA_WEBHOOK_SECRET`: cambiar el webhook del agente Manuela a `https://machea-api.onrender.com/webhooks/dapta/resultado?k=<secreto>` y releerlo (guardar el agente en la interfaz de Dapta a veces borra el webhook).

### 6. Vercel
- Proyecto del front (el actual): `VITE_CRM_URL=https://www.machea.co/crm` enciende el botón «Abrir el CRM» en `/inicio/`.
- **Proyecto nuevo del CRM**, raíz `crm/`: `DATABASE_URL` (con el rol `crm_app`, terminada en `?sslmode=no-verify`, no `require`), `AUTH_MODO=machea`, `MACHEA_URL=https://www.machea.co`,
  `CRM_MIGRAR_AL_ARRANCAR=false`, `CRM_BASE_PATH=/crm`, `CRM_ORIGENES=www.machea.co`. Más detalle en `crm/.env.example`.
- **Último paso, el que lo enciende:** agregar a `frontend/vercel.json` el rewrite `/crm/:path*` hacia ese proyecto.

### 7. Verificación
1. `https://www.machea.co/api/sesion` → 401 `sin_sesion` (503 = Render sin `DATABASE_URL` o sin llegar a la base).
2. Crear una cuenta de prueba en `/acceso/#crear`, confirmar el correo, aprobarla en `/admin` → «Cuentas de empresas», entrar a `/inicio/` y a `/crm`.
3. `GET /api/captacion/resumen` (cabecera `X-Captacion-Key`) → `almacen: supabase`.
4. Borrar la cuenta de prueba: `delete from acceso.cuentas where correo = '<correo>';`

## Para apagar rápido
- Login: quitar `DATABASE_URL` en Render y redesplegar.
- CRM: quitar el rewrite `/crm` de `frontend/vercel.json`.
- Camila: `CAPTACION_LLAMAR_DEMOS=false`.
