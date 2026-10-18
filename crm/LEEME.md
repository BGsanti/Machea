# REA CRM

CRM con ventas, servicio, marketing, comercio y automatización. Sus páginas y funciones se basan en lo que REA observó en una organización Salesforce Starter (ver [docs/inventario-salesforce.md](docs/inventario-salesforce.md)), con código y diseño propios.

## Arrancar

Requisitos: Node.js 24 y pnpm.

```powershell
pnpm install
pnpm dev
```

Abra http://localhost:3000. La primera vez le pedirá crear la cuenta de administrador. Después, en **Configuración** (engranaje de arriba) puede crear más usuarios y cargar datos de ejemplo.

No hace falta instalar ninguna base de datos: sin configuración, la app usa PGlite (PostgreSQL embebido) y guarda los datos en `.data/pglite`. Para borrar todo y empezar de cero, pare la app y elimine esa carpeta.

## Qué incluye

| App | Pestañas |
| --- | --- |
| Inicio | Inicio (sugerencias, tarjetas de informes, recientes) e Información general (indicadores) |
| Contactos, Cuentas | Listas y fichas |
| Ventas | Candidatos, Contactos, Cuentas, Oportunidades, Productos, Listas de precios, Calendario, Análisis, Facturas, Videollamadas |
| Servicio | Casos, Contactos, Cuentas, Textos rápidos, Sesiones de mensajería, Análisis, Knowledge |
| Marketing | Página de activación, Correos de lista y, al activarlo, Campañas |
| Comercio | Establecimientos |
| Su cuenta | Plan, usuarios y uso de datos |
| Automatización | Inicio, Flujos, Integraciones, Supervisar, Centro de acción |

Funciones comunes:

- **Listas:** vistas, búsqueda, orden por columna, paginación, filtros, gráfico lateral, Kanban (arrastrar para cambiar etapa), selección múltiple con eliminar, cambiar propietario, agregar a campaña y enviar correo, e importación CSV.
- **Fichas:** campos destacados, ruta de etapas, pestañas de Detalles, Relacionado y Actividad (tareas, eventos y llamadas).
- **Acciones especiales:** convertir candidato en cuenta, contacto y oportunidad; agregar productos a oportunidades; generar facturas con impuestos; cerrar casos; publicar y archivar artículos.
- **Flujos:** se ejecutan al crear o cambiar registros y pueden crear tareas, actualizar campos, notificar o llamar a un webhook. Cada ejecución queda en Supervisar.
- **Análisis:** constructor de informes (agrupar, sumar, filtrar), gráficos, exportación CSV, paneles y favoritos.
- **Generales:** buscador global, notificaciones, lista de tareas inferior, pestañas personalizables por usuario, usuarios con roles.

## Límites actuales

- Los **correos de lista** se registran en el CRM y en la actividad de cada destinatario, pero no se envían: falta conectar un servidor SMTP.
- De las **integraciones**, solo el conector Webhook funciona. Los demás (HubSpot, QuickBooks…) son un registro, sin sincronización.
- **Videollamadas y sesiones de mensajería** son registros manuales: no hay videollamada ni WhatsApp reales.
- **Comercio** gestiona establecimientos, pero no tiene tienda pública, pedidos ni pagos.
- No se replicaron el asistente de IA (Agentforce), el Centro de orientación ni la facturación de la suscripción.
- Las fichas de registro las diseñamos nosotros: la organización de Salesforce estaba vacía y no se pudieron observar.

## Varias empresas y login de Machea

El CRM es multiempresa: cada constructora o inmobiliaria con cuenta en Machea tiene sus propios datos.

- Todas las tablas viven en el esquema `crm` y llevan `empresa_id`, salvo las de autenticación y las de un usuario (notificaciones, recientes y preferencias).
- Cada lectura y escritura se limita a la empresa del usuario. La empresa sale de la sesión o, fuera de una petición, de `conEmpresa` (`src/db/empresa.ts`).
- Con `AUTH_MODO=machea` se entra con la cuenta de Machea: la cookie `machea_sesion` se busca por su SHA-256 en `acceso.sesiones`, y solo pasan las cuentas aprobadas. La primera visita crea la empresa, su usuario (administrador) y los informes iniciales. Una cuenta es una empresa con un solo usuario, así que en este modo no se crean usuarios ni se cargan datos de ejemplo.
- Con `AUTH_MODO=local` (por defecto) funciona como antes, con una empresa: la primera vez se crea el administrador y él crea al resto. El registro público de Better Auth está apagado.

`pnpm exec tsx scripts/prueba-fugas.ts` comprueba que una empresa no vea ni toque nada de otra (las instrucciones están en el archivo).

### Leads de Machea

- **Cómo llegan:** unos triggers de la base de Machea (`../supabase/migrations/20261018130000_crm_ingesta.sql`) dejan en `crm.bandeja_leads` lo que le corresponde a cada empresa, según sus fuentes en `crm.empresa_fuentes`. Las fuentes las asigna Machea en `/admin`.
- **Qué hace el CRM con ellos** (`src/crm/servidor/ingesta.ts`), cada vez que alguien de la empresa entra:
  - crea el candidato, con las respuestas del formulario;
  - registra la llamada de Manuela como tarea completada;
  - crea la cita como evento, o el seguimiento como tarea pendiente;
  - pone la temperatura como valoración.
- **Pasa por el repositorio**, así que corren las reglas y los flujos de la empresa.
- **No duplica:** cada registro lleva `origen_externo`.

`pnpm exec tsx scripts/prueba-ingesta.ts` lo prueba de punta a punta en PostgreSQL, conectado como `crm_app`.

## Usar PostgreSQL normal

Defina `DATABASE_URL` en `.env.local` (Docker, Neon, AWS RDS…) y ejecute `pnpm db:migrar`. La app aplica también las migraciones pendientes al arrancar, salvo con `CRM_MIGRAR_AL_ARRANCAR=false` (producción).

La zona horaria del negocio es America/Bogota. Para cambiarla, defina `NEXT_PUBLIC_ZONA_HORARIA`.

## Comandos

| Comando | Para qué |
| --- | --- |
| `pnpm dev` | Desarrollo en http://localhost:3000 |
| `pnpm build` y `pnpm start` | Compilar y ejecutar en producción |
| `pnpm typecheck` | Comprobar tipos |
| `pnpm db:generar` | Crear una migración tras cambiar `src/db/esquema.ts` |
| `pnpm db:migrar` | Aplicar migraciones |
