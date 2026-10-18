# REA CRM

CRM en Next.js 16 (App Router), TypeScript, Drizzle ORM sobre PostgreSQL (PGlite embebido si no hay `DATABASE_URL`), Better Auth, Tailwind 4, Zod y Recharts. Gestor de paquetes: pnpm. Lea `LEEME.md` para el uso y `docs/inventario-salesforce.md` para el origen de las funciones.

## Mapa

- `src/crm/objetos.ts`: **metadatos de cada objeto** (campos, secciones del formulario, columnas, vistas, listas relacionadas, ruta, Kanban y acciones). Listas, formularios, fichas, importación, búsqueda e informes se generan a partir de aquí.
- `src/crm/apps.ts`: las 9 apps y sus pestañas. `src/crm/opciones.ts`: valores de las listas de selección.
- `src/db/esquema.ts`: tablas. Tras cambiarlo: `pnpm db:generar`. La app aplica las migraciones al arrancar.
- `src/crm/tablas.ts`: une cada objeto con su tabla.
- `src/crm/servidor/repositorio.ts`: único acceso genérico a datos (listar, obtener, crear, actualizar, eliminar, agrupar). Aplica `reglas.ts` antes de guardar y `flujos.ts` después.
- `src/crm/servidor/acciones.ts`, `especiales.ts`, `sistema.ts`: server actions. Todas empiezan con `requerirUsuario()` o `requerirAdmin()`.
- `src/crm/ui/`: lista, ficha, formulario y armazón. `src/crm/paginas/`: páginas especiales (`/[app]/p/[pagina]`).
- `src/crm/fechas.ts`: zona horaria del negocio. No use `toISOString().slice(0, 10)` ni `current_date` para "hoy".

## Cómo trabajar

- Para un objeto nuevo: tabla en `esquema.ts`, entrada en `tablas.ts`, definición en `objetos.ts`, pestaña en `apps.ts` y migración.
- Las rutas usan el contexto de app: `/[app]/o/[objeto]` (lista), `/[app]/o/[objeto]/[id]` (ficha), `/[app]/p/[pagina]`.
- El contenido que escriben los usuarios en Markdown se sanea con `markdownSeguro`. No use `dangerouslySetInnerHTML` con otra cosa.
- Verificación: `pnpm typecheck` y `pnpm build`. Para probar la interfaz, arranque `pnpm dev` y recorra el flujo en el navegador.
