# CRM multiempresa: decisiones

El CRM es el de Carlos (REA CRM, PR #16, carpeta `crm/`), adaptado para que lo use cada constructora o
inmobiliaria con cuenta en Machea. Plan y estado en [PLAN.md](PLAN.md).

## Ronda 1 (Diego, 2026-10-18)

- **D1. Se usa el CRM de Carlos tal cual.** Se copia y se usa, con adaptaciones, y se quedan las 9 apps.
- **D2. Multiempresa.** Cada cuenta aprobada del login de Machea (`acceso.cuentas`, PR #14) es una empresa con
  sus datos aislados.
- **D3. Una cuenta por empresa.** La cuenta del login es el único usuario de esa empresa en el CRM y es su
  administrador. Igual que en el login: sin miembros ni roles.
- **D4. A quién le llega un lead.** A la empresa por cuyo formulario con marca entró (`?marca=`) **o** a la dueña
  del proyecto por el que pidió la llamada. Una persona puede aparecerle a dos empresas, y cada una ve solo lo
  suyo.

## Decisiones técnicas que salen de ahí

- **T1. Esquema `crm` en la misma base que Machea.** Ahí PostgREST no lo expone, y no choca con `public` ni con
  `acceso`. Todas las tablas llevan `empresa_id`, salvo las de autenticación y las de un solo usuario.
- **T2. La empresa se filtra en la aplicación.** Hay un filtro central en `repositorio.ts` y las consultas
  directas filtran una por una. Además:
  - los ids que manda el navegador se validan contra la empresa;
  - numeración propia por empresa (FAC-1 para todas);
  - una prueba de fugas que debe pasar antes de desplegar.

  El RLS por empresa en la base queda para después (PLAN, fase 6).
- **T3. El login es el de Machea.** Con `AUTH_MODO=machea`, el CRM busca el SHA-256 de la cookie `machea_sesion`
  en `acceso.sesiones`, con un rol que solo ve esas columnas. Solo entran cuentas `aprobada`. Better Auth queda
  para el modo local (desarrollo y uso propio de Carlos), con el registro público apagado.
- **T4. Se sirve en `www.machea.co/crm`.** Es un proyecto aparte de Vercel con `basePath: "/crm"`, detrás de un
  rewrite del proyecto del formulario (multi-zones de Next). Así la cookie del login es de primera parte.
- **T5. Huecos que se cerraron:**
  - el registro abierto de Better Auth (`POST /api/auth/sign-up/email`);
  - el webhook de Flujos, que ahora solo llama a URLs `https` públicas y sin redirecciones;
  - las migraciones al arrancar, que en producción se apagan.

## Por defecto, mientras Diego no diga otra cosa

1. **Datos de ejemplo** apagados con el login de Machea; se encienden con `CRM_PERMITIR_EJEMPLOS=1`.
2. **Nombre de la empresa:** al principio es el `usuario` de la cuenta; la empresa lo cambia en Configuración.
   `acceso.cuentas` no guarda el nombre de la empresa.
3. **Cerrar sesión** desde el CRM cierra la sesión de Machea (`DELETE /api/sesion`) y lleva a `/acceso/`.

## Abierto (ronda 2)

1. Visto bueno de Carlos para adaptar su PR. Preguntarle también cómo resuelve `crm-kit` lo multiempresa.
2. Texto exacto de las dos autorizaciones (formulario de Machea y formularios con marca) y quién lo revisa
   legalmente. Sin eso no se enciende la regla del proyecto (D4).
3. Región de Supabase y modo del pooler, para elegir la región del proyecto de Vercel.
