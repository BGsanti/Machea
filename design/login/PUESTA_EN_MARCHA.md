# Login de Machea: puesta en marcha de la base de datos

Esta guía es para quien tenga acceso al Supabase `machea-leads` y al servicio `machea-api` de Render
(Santiago o Felipe). Diego no tiene acceso a ninguno de los dos.

## Qué se está conectando

- El login lo maneja **nuestro backend**: `backend/api/acceso.py` (FastAPI, Render). No se usa Supabase Auth (D20).
- Las cuentas viven en **Postgres**, en el esquema `acceso`. Por ahora es la base de Supabase `machea-leads`
  usada como un Postgres normal. Si mañana nos vamos de Supabase, se mueven estas tablas y se cambia
  `DATABASE_URL`.
- El front llama a `/api/cuentas`, `/api/sesion` y `/api/clave` en **su mismo dominio**. Vercel las reenvía a
  Render (`frontend/vercel.json`, `rewrites`), así la cookie de sesión es de primera parte.
- **No se tocan las tablas de leads.**

## Orden

**La migración va antes del merge** del PR #14. Primero la base, después el código.

### 1. Crear las tablas (Supabase → `machea-leads` → SQL Editor)

1. Abrir `supabase/migrations/20261014090000_cuentas_login.sql` (rama `login`), copiar todo y ejecutarlo.
2. Verificar con esto, que debe devolver 4 filas (`cuentas`, `enlaces`, `intentos` y `sesiones`):

   ```sql
   select table_name from information_schema.tables where table_schema = 'acceso' order by 1;
   ```
3. Verificar que la clave pública **no** las ve. Esto debe dar 404 o un error de esquema, nunca datos:

   ```bash
   curl "https://ndfsrstnzttbmcxukixw.supabase.co/rest/v1/cuentas" -H "apikey: <ANON_KEY>" -H "Accept-Profile: acceso"
   ```

La migración se probó en PostgreSQL 18 y en PGlite. Rechaza usuarios inválidos, correos en mayúsculas y
cuentas aprobadas sin tipo, y deja las 4 tablas con RLS y sin permisos para `anon` ni `authenticated`.

### 2. La cadena de conexión (Supabase → Connect)

- Usar la del **Session pooler**, no la "Direct connection". La conexión directa de Supabase es solo IPv6, y
  Render no la alcanza.
- Tiene la forma `postgresql://postgres.ndfsrstnzttbmcxukixw:<CLAVE_DE_LA_BASE>@aws-0-<región>.pooler.supabase.com:5432/postgres`.
  Al final se le agrega `?sslmode=require`.
- `<CLAVE_DE_LA_BASE>` es la contraseña de la base de datos, **no** la anon key ni la service_role.
- **Es un secreto:** nunca va en el repo, en el board ni en un chat del equipo.

### 3. Render → `machea-api` → Environment

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La cadena del paso 2. **Secreta.** |
| `FRONT_URL` | `https://www.machea.co`. Con esto se arman los enlaces de los correos de confirmación y recuperación. |
| `CORREO_EQUIPO` | A dónde llega el aviso "Nueva cuenta por revisar". Por defecto, `equipo@machea.co`. |
| `ADMIN_PASSWORD` | Ya existe: es la clave de `/admin`, donde se aprueban las cuentas. |

- **El correo tiene que funcionar:** sin él, nadie puede confirmar su cuenta. Se comprueba en `/admin` →
  tarjeta "Correo" → "Probar conexión".
- Ojo: el plan gratis de Render bloquea el correo saliente (ver `backend/api/correo.py`).

### 4. Merge y despliegue

- Con el visto bueno de Diego, merge del PR #14 a `main`.
- Render instala `psycopg[binary,pool]` (nuevo en `requirements.txt`) y despliega. Vercel despliega el front
  con los `rewrites`.

### 5. Verificación en producción

1. `https://www.machea.co/api/sesion` debe responder **401** `sin_sesion`. Si responde **503** `no_disponible`,
   el backend no tiene `DATABASE_URL` o no llega a la base: mirar los logs de Render ("cuentas: no se pudo
   conectar la base").
2. Crear una cuenta de prueba en `https://www.machea.co/acceso/#crear` con un correo del equipo. Después:
   - confirmar el correo con el enlace;
   - entrar: debe mostrar "en revisión";
   - aprobarla en `/admin` → "Cuentas de empresas": debe llegar el correo "Tu cuenta de Machea está activa".
3. **Topes:** registrarse desde dos redes distintas, por ejemplo el wifi y los datos del celular, no debe
   compartir el tope por IP.
4. Borrar la cuenta de prueba (se borran también sus enlaces y sesiones):

   ```sql
   delete from acceso.cuentas where correo = '<correo de prueba>';
   ```

### Para apagar el login rápido

Quitar `DATABASE_URL` en Render y redesplegar. El login responde "todavía no está disponible" y `/admin`
→ Cuentas lo explica. El resto del sitio sigue igual.

## Antes de abrirlo a empresas reales

- Publicar `/privacidad/`. El registro hace aceptar la política y hoy ese enlace no lleva a nada.
  El borrador está en `POLITICA_PRIVACIDAD_BORRADOR.md`.
- Google sigue apagado (D19).
