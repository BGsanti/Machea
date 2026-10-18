# Inventario observado con REA

Fuente: una organización de prueba de Salesforce Starter (interfaz en español), inspeccionada el 17/10/2026 con REA 6.5.0 sobre Chrome por CDP. La organización estaba vacía: no había registros, así que las páginas de detalle de registro no se pudieron observar.

Qué se hizo: una inspección pasiva de Inicio y cuatro escenarios de navegación en los que REA solo abrió páginas, abrió formularios de "Nuevo" y desplegó listas de opciones. No se guardó, editó ni borró nada en la organización.

Este documento describe **funciones**, no código ni diseño. REA-CRM se construye con código y diseño propios.

## Estructura general

- **Barra lateral de aplicaciones** con 9 entradas: Inicio, Contactos, Cuentas, Ventas, Servicio, Marketing, Comercio, Su cuenta, Automatización. Cada una es una "app" con su propio juego de pestañas.
- **Cabecera global**: buscador global, Agentforce (asistente IA), Centro de orientación, Ayuda, Parámetros rápidos, Notificaciones, menú de perfil.
- **Cabecera de app**: nombre de la app, pestañas de navegación (cada pestaña de objeto tiene un desplegable con sus registros recientes) y "Modificar elementos de navegación".
- **Barra de utilidades** inferior: "To Do List" (lista de tareas).

## Apps y pestañas

| App | Pestañas |
| --- | --- |
| Inicio | Inicio, Información general |
| Contactos | Contactos |
| Cuentas | Cuentas |
| Ventas | Candidatos, Contactos, Cuentas, Oportunidades, Productos, Listas de precios, Calendario, Análisis, Facturas, Videollamadas |
| Servicio | Casos, Contactos, Cuentas, Textos rápidos, Sesiones de Mensajería, Análisis, Knowledge |
| Marketing | Marketing (página de activación), Correos electrónicos de listas |
| Comercio | Establecimiento |
| Su cuenta | Su cuenta (suscripción, licencias y facturación) |
| Automatización | Inicio (integraciones destacadas), Flujos, Integraciones, Supervisar, Centro de acción |

## Página de Inicio

- Saludo "Le damos la bienvenida, {nombre}" con tarjetas de sugerencias descartables: crear el primer contacto, crear el primer candidato, activar marketing.
- Cuatro tarjetas de informe con selector de informe, botón "Nuevo" y "Actualizar": candidatos (My Leads), oportunidades (My Opportunities), contactos (My Contacts) y casos (All New Cases By Priority).
- Registros recientes, con "Ver todos los registros recientes".
- Tarjeta "Hacerla su Inicio" (personalizar la página).

## Vistas de lista (patrón común)

Selector de vista de lista, anclar vista, contador "N elementos • Ordenado por … • Filtrado por …", buscador dentro de la lista, controles de vista, cambio de visualización (tabla o Kanban), actualizar, ordenar por columna, ancho de columna, modificar lista, gráficos, filtros, casilla de selección por fila y para todas, menú de acciones por fila, y un estado vacío con llamada a la acción.

| Objeto | Vista por defecto | Botones | Columnas |
| --- | --- | --- | --- |
| Contactos | Todos los Contactos | Importar, Agregar a una lista con capacidad de acción, Agregar a campaña, Enviar correo electrónico, Nuevo | Nombre completo, Nombre de la cuenta, Cargo, Teléfono, Correo electrónico, Alias del propietario |
| Cuentas | Todas las Cuentas | Nuevo, Importar, Agregar a una lista con capacidad de acción, Asignar etiqueta | Nombre de la cuenta, Teléfono, Sitio Web, Ciudad de facturación, Estado o provincia de facturación, Alias del propietario |
| Candidatos | Todos los candidatos abiertos | Nuevo, Importar, Agregar a una lista con capacidad de acción, Agregar a campaña, Enviar correo electrónico | Nombre completo, Compañía, Estado o provincia, Teléfono, Correo electrónico, Estado de candidato, Fecha de creación, Alias del propietario |
| Oportunidades | Vistos recientemente | Nuevo, Importar, Agregar a una lista con capacidad de acción, Asignar etiqueta | (sin registros) |
| Productos | Vistos recientemente | Nuevo, Agregar a Categoría | (sin registros) |
| Listas de precios | Vistos recientemente | Nuevo | (sin registros) |
| Casos | Vistos recientemente | Nuevo, Cambiar propietario, Combinar casos, Agregar a una lista con capacidad de acción, Asignar etiqueta | (sin registros) |
| Facturas | Vistos recientemente | (ninguno: solo lectura) | (sin registros) |
| Videollamadas | Vistos recientemente | (ninguno) | (sin registros) |
| Sesiones de Mensajería | Vistos recientemente | (ninguno) | (sin registros) |
| Knowledge | Vistos recientemente | Nuevo, Publicar, Asignar, Archivar, Eliminar artículo | Fecha de publicación, Estado de validación… |
| Correos electrónicos de listas | Vistos recientemente | Enviar correo electrónico | (sin registros) |
| Flujos | Vistos recientemente | Nuevo | (sin registros) |

## Formularios de creación

Todos tienen Cancelar, Guardar y nuevo, Guardar. Los campos marcados con * son obligatorios.

- **Cuenta**. About: Nombre de la cuenta*, Sitio Web, Tipo, Descripción, Cuenta principal. Get in Touch: Teléfono, Dirección de facturación (País, Calle, Ciudad, Estado o provincia, Código postal), Dirección de envío (igual).
- **Contacto**. About: Nombre completo* (Tratamiento, Nombre, Apellidos*), Nombre de la cuenta*, Cargo, Supervisor, Descripción. Get in Touch: Teléfono, Correo electrónico, Dirección de correo (País, Calle, Ciudad, Estado o provincia, Código postal).
- **Candidato**. About: Estado de candidato*, Nombre completo* (Tratamiento, Nombre, Apellidos*), Compañía*, Cargo, Sitio Web, Descripción, Valoración. Get in Touch: Teléfono, Correo electrónico, Dirección. Segment: Número de empleados, Ingresos anuales, Origen del candidato, Sector.
- **Oportunidad**. About: Nombre de la oportunidad*, Nombre de la cuenta, Fecha de cierre*, Importe, Descripción. Status: Etapa*, Probabilidad (%), Categoría de previsión*, Siguiente paso.
- **Caso**. Información del caso: Estado, Origen del caso, Prioridad. Información del contacto: Nombre del contacto, Nombre de la cuenta. Descripción: Asunto, Descripción, Enviar correo electrónico de notificación a contacto.
- **Producto**: Nombre del producto*, Familia de productos, Código de producto, SKU de producto, Activo, Descripción del producto.
- **Lista de precios**: Nombre*, Activo, Descripción, Válido desde (fecha y hora), Válido hasta (fecha y hora).
- **Evento**: Asunto* (con sugerencias), Descripción, Inicio, Fin, Registros relacionados (Nombre: contacto o candidato; Relacionado con: otro registro), Ubicación, Evento de todo el día, Privado.
- **Tarea**: Relacionado con, Asunto*, Nombre, Fecha de vencimiento, Comentarios, Estado, Prioridad.
- **Texto rápido**: Nombre*, Mensaje* con inserción de campos de combinación (Relacionado con + Campo), Carpeta, Categoría, Canales (lista doble Disponible/Seleccionado), Incluir en los canales seleccionados, Vista previa.
- **Knowledge**: Título*, Nombre de URL, contenido con editor de texto enriquecido, Visible para el cliente.

## Listas de opciones observadas

- Tipo de cuenta: Analyst, Competitor, Customer, Integrator, Investor, Partner, Press, Prospect, Reseller, Other.
- Estado de candidato: New, Contacted, Nurturing, Qualified, Unqualified.
- Valoración: Hot, Warm, Cold.
- Origen del candidato: Advertisement, Employee Referral, External Referral, Partner, Public Relations, Seminar - Internal, Seminar - Partner, Trade Show, Web, Word of mouth, Other.
- Sector: Agriculture, Apparel, Banking, Biotechnology, Chemicals, Communications, Construction, Consulting, Education, Electronics, Energy, Engineering, Entertainment, Environmental, Finance, Food & Beverage, Government, Healthcare, Hospitality, Insurance, Machinery, Manufacturing, Media, Not For Profit, Other, Recreation, Retail, Shipping, Technology, Telecommunications, Transportation, Utilities.
- Tratamiento: Mr., Ms., Mrs., Dr., Prof., Mx.
- Etapa de oportunidad: Qualify, Meet & Present, Propose, Negotiate, Closed Won, Closed Lost.
- Categoría de previsión: Omitted, Pipeline, Best Case, Commit, Closed.
- Estado de caso: New, Working, Waiting on Customer, Escalated, Closed.
- Origen de caso: Email, Phone, Web.
- Prioridad de caso: High, Medium, Low.
- Asunto de evento: Call, Email, Meeting, Send Letter/Quote, Other.
- Familia de productos: None.

## Otras páginas

- **Calendario**: vista semanal con navegación (semana anterior/siguiente, Hoy), Actualizar, Ver (cambiar vista), Nuevo evento, barra lateral con selector de fecha, fila de eventos de día completo.
- **Análisis**: Inicio, Examinar, Favoritos, Recopilaciones (Sales, Service); buscador de informes y paneles; botón Crear; secciones "Para usted" (recientemente actualizados, creados por mí) y "Mis análisis".
- **Textos rápidos**: Nuevo texto rápido, Nueva carpeta, buscador; navegación Reciente / Todo el Texto rápido, Carpetas (Todas, Creado por mí, Compartido conmigo), Favoritos.
- **Marketing**: página para activar herramientas de marketing (campañas de correo, páginas de destino con formularios, construcción de audiencias, análisis), con enlace a Correos electrónicos de listas.
- **Comercio**: estado vacío "¡No tiene ningún establecimiento aún!" con Crear establecimiento.
- **Su cuenta**: "No se ha suscrito aún", gestión de plan, licencias y facturación.
- **Automatización / Inicio**: integraciones destacadas (HubSpot, QuickBooks Online, Jira, Zendesk, Google Sheets) y catálogo de más de 100 herramientas.
- **Integraciones**: conectores (Salesforce, NetSuite, QuickBooks Online, Jira, Asana, Zendesk, HubSpot, Adobe Marketo Engage, OpenAI), "Todas las conexiones", Nueva conexión.
- **Supervisar**: entrevistas de flujo (Name, Última modificación, Interview Status, Nombre de API del flujo, Versión, Tipo, Detalles de error, Motivo de la pausa).
- **Centro de acción (Beta)**: catálogo de acciones disponibles filtrable por tipo (Etiqueta, Tipo, Descripción, Nombre).

## Lo que no se pudo observar

- Páginas de detalle de registro, ruta de etapas, listas relacionadas y conversión de candidatos: la organización no tenía registros.
- El contenido de Análisis va dentro de un iframe, así que solo se vio en la captura de pantalla.
- "Información general" de Inicio: el clic de REA falló y no se capturó.
- Comportamiento del servidor (reglas, automatizaciones internas, permisos).
