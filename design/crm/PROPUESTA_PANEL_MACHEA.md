# Propuesta: el panel de Machea sobre el CRM

Mockup interactivo: [mockups/panel-machea.html](mockups/panel-machea.html) (un solo archivo, sin dependencias; ábralo en el navegador).
Pantallas: Inicio, Leads (lista y embudo), ficha del lead con la llamada de Manuela, y Citas. **Datos de ejemplo.**

## Qué se quiere

Conservar el motor del CRM actual (multiempresa, login de Machea, ingesta de leads, flujos, informes, importación) y
cambiar **cómo se usa**: que sea tan fácil como el panel de Dapta, con la estética de Machea y enfocado en lo que
Machea vende: leads que Manuela contacta, qué dijeron, y la cita.

## Lo que se toma del panel de Dapta (UX, no estética)

| Patrón de Dapta | En el panel de Machea |
|---|---|
| Selector de espacio de trabajo arriba a la izquierda | Selector de empresa (hoy una cuenta es una empresa; el equipo de Machea podría cambiar entre empresas) |
| Barra lateral plana, un solo nivel, ícono + nombre, con submenús que se abren | Inicio, Leads, Llamadas, Citas, Agentes de voz, Análisis, Automatización. Las apps actuales del CRM (Contactos, Ventas, Servicio, Marketing, Comercio) quedan en «Más herramientas»: no se quita ninguna función |
| Inicio que arranca con un saludo y una caja de pregunta | «¿Cómo te ayudo?» con un asistente que responde con los datos del CRM, y atajos: leads calientes sin cita, resumen de la semana, citas de mañana, importar |
| Atajos de creación como botones | Acciones rápidas bajo la caja |
| Medidor de consumo del plan en la barra | Llamadas de Manuela usadas del plan |
| Tabla de «Actividad reciente» (nombre, tipo, última actividad) | Igual, con etiquetas de tipo y clic para abrir el lead |
| Tarjetas sobrias, mucho aire, pocas decisiones por pantalla | Igual |

## Lo que es de Machea

- **Paleta de la landing:** navy `#2d3b4e`, coral `#ff6259`, esmeralda `#2dd4a7`, fondos cálidos `#fcfaf8` / `#f5eee7`; tipografía Archivo; el logo real.
- **Para hacer hoy:** los leads calientes y qué hacer con cada uno, en vez de un panel de informes genérico.
- **La ficha del lead cuenta la historia:** formulario → llamada de Manuela (grabación, resumen, recomendación para el asesor, transcripción) → cita → WhatsApp, con «siguiente mejor acción», temperatura y tareas.
- **Lenguaje inmobiliario:** lead, proyecto, cita, visita; no candidato ni oportunidad.
- **Citas:** agenda semanal, «por confirmar», y confirmación automática por Manuela 24 h antes.

## Qué ya existe y qué es concepto

- **Ya hay datos para:** leads y respuestas del formulario, resultado y resumen de la llamada, temperatura, cita y seguimiento (`crm.leads_machea`, ingesta de la fase 4).
- **Hay que construir:** la grabación y transcripción dentro de la ficha (hoy solo se guarda el análisis), el asistente de preguntas, la agenda con Google Calendar, el aviso al asesor, la confirmación automática 24 h antes y los indicadores del inicio.
- **Habrá que decidir con Diego y Carlos** antes de tocar `crm/`: rama aparte, nombres (candidato → lead) y qué apps quedan visibles por defecto.

## Fases propuestas

1. **Piel Machea:** paleta, tipografía, logo, barra lateral.
2. **Inicio nuevo.**
3. **Leads y ficha** con la llamada.
4. **Citas y agenda.**
5. **Machea como su propio cliente:** prospectos y demos de Camila dentro del CRM.
