# Seguridad

## Cómo reportar una vulnerabilidad

Escriba a **machea.co@gmail.com** con el asunto «Seguridad» (o abra un aviso privado en la pestaña *Security* de este
repositorio). Incluya qué encontró, cómo reproducirlo y qué impacto cree que tiene. No publique el hallazgo ni lo
pruebe con datos de personas reales. Respondemos en un máximo de 3 días hábiles y avisamos cuando esté corregido.

## Qué guardamos y dónde

| Pieza | Dónde vive | Qué datos tiene |
|---|---|---|
| Landing y formulario | Vercel (`my-project`) | Nada: es estática; llama a la API y a Supabase |
| CRM (`/crm`) | Vercel (`machea2`) | Leads, llamadas y formularios de cada empresa (base compartida, filtrada por empresa) |
| API | Render (`machea-api`) | Cuentas, sesiones, solicitudes de llamada; habla con Dapta |
| Base de datos | Supabase (`machea-leads`) | Todo lo anterior. Tablas cerradas por RLS; el navegador solo llama a 5 funciones públicas |
| Voz y flujos | Dapta | Llamadas de Manuela y Camila (audio y transcripción) |

## Reglas

- Ninguna llave, contraseña ni cadena de conexión entra al repositorio. Está activo un escáner (`scripts/seguridad/escanear-secretos.py`)
  y un hook de commit (`bash scripts/seguridad/instalar-hooks.sh`).
- La clave `service_role` de Supabase y la cadena de administrador de la base solo existen en Render y en la terminal de quien migra.
- Las contraseñas, llaves y cadenas **nunca se pegan en un chat**, un correo ni un documento.
- Si una llave se filtra, se cambia ese mismo día: ver `docs/seguridad.md`, «Si se filtra una llave».
