# Requerimientos para salir al mercado (21-oct-2026)

Qué le falta a Machea para que una constructora o una inmobiliaria la use todos los días y pague por ella.
Cubre tres cosas: **UX del panel** (asesores y gerente), **producto y plataforma**, y **legal, empresa y mercado**.
Complementa [PROPUESTA_PANEL_MACHEA.md](PROPUESTA_PANEL_MACHEA.md) (fases del panel) y
[../../docs/puesta-en-produccion.md](../../docs/puesta-en-produccion.md) (lo técnico ya hecho).

Convenciones. **Prioridad:** P0 = antes del primer piloto con una empresa real; P1 = antes de cobrar a la segunda;
P2 = después. **Esfuerzo** (a ojo, trabajando con Claude): S = menos de 1 día, M = 2 a 4 días, L = 1 a 2 semanas,
XL = más de 2 semanas. Son estimaciones, no compromisos.

## 1. Dónde estamos (verificado en el código y en producción)

**Ya funciona**
- Landing, formulario y quiz; Manuela (llamada y resultado de punta a punta); Camila (captación de empresas, construida).
- Login con aprobación manual y CRM multiempresa en `www.machea.co/crm`, con la piel de Machea, la barra lateral nueva y el Inicio nuevo.
- Embudo con arrastrar y soltar, importación de CSV, flujos automáticos, informes, calendario, tareas.

**Huecos que hoy bloquean un piloto**
1. **Una cuenta = un usuario administrador.** Con el login de Machea el rol es siempre `admin` y la empresa es la cuenta
   (`crm/src/auth/sesion.ts`). No hay asesores, ni gerente, ni invitaciones, ni reparto de leads.
2. **El CRM no recibe leads reales** de otras empresas (a propósito, por lo legal: no hay acuerdos firmados).
3. **La llamada de Manuela no se ve dentro del lead**: solo se guarda el análisis, no el audio ni la transcripción.
4. **Sin movimiento ni estados de carga**: no hay `loading.tsx`, solo 3 spinners y 4 transiciones de color en todo el
   CRM; al navegar, la pantalla queda en blanco hasta que carga. Sin atajos de teclado.
5. **No es usable en celular**: las listas no tienen puntos de corte responsivos, no es instalable, no avisa.
6. **No hay cobro ni planes** en el sistema, ni medidor de consumo.
7. **Legal y empresa sin cerrar**: Machea no está constituida; falta definir quién es el responsable del tratamiento,
   los acuerdos con cada empresa y los términos de servicio.
8. **Prueba social vacía** (a propósito, no hay logos ni cifras reales) y las cuentas de infraestructura siguen a nombre
   de personas, no de Machea.

## 2. Qué hace sentir tan intuitivo a Dapta (de los archivos guardados)

Se revisó la pantalla de inicio de Dapta y su hoja de estilos. Lo que importa, y lo que no:

- **El movimiento es corto y discreto, no vistoso.** Casi todo dura entre 0,12 y 0,2 s con la misma curva de salida
  (`cubic-bezier(0,0,.2,1)`): aparecer subiendo, menús que se despliegan, cargas con esqueleto en degradado. No hay
  animaciones largas. La sensación de «rápido» viene de la consistencia y del feedback inmediato.
- **Inicio que empieza por la intención:** «Hola Juan, ¿cómo te ayudo?» con tres atajos grandes (crear agente de voz,
  de texto, flujo). Machea ya tiene los atajos; falta la caja de pregunta.
- **Selector de espacio de trabajo** arriba, menú de cuenta abajo (mi cuenta, credenciales, facturación, cerrar
  sesión), **medidor de consumo** siempre visible («4,4K / 196,8K créditos») y **tabla de actividad reciente**.
- **Barra lateral agrupada y plegable**, un solo nivel visual, y ayuda siempre a mano (centro de ayuda, academia con
  videos cortos, chat).
- **Todo se hace igual en todas partes:** mismo botón primario, mismo menú, mismo vacío con una acción.

Conclusión: no hace falta animar mucho; hace falta que **nada se sienta lento, mudo o distinto** de lo anterior.

## 3. Requisitos de UX

### 3.1 Para todos

| ID | Requisito | Prio | Esf. |
|---|---|---|---|
| UX-1 | **Sistema de movimiento:** 120–200 ms, curva única de salida, entrada «subir y aparecer» de páginas y tarjetas, menús que se despliegan, modales que escalan de 0,98 a 1, avisos que se deslizan, botón con estado presionado y rueda dentro del botón. Respetar `prefers-reduced-motion`. | P0 | S |
| UX-2 | **Estados de carga:** `loading.tsx` por ruta con esqueletos (inicio, lista, ficha, calendario), y precarga de enlaces. Que navegar nunca deje la pantalla en blanco. | P0 | S–M |
| UX-3 | **Acciones optimistas:** cambiar el estado de un lead, completar una tarea o mover una tarjeta se ve al instante y se revierte con aviso si falla. | P0 | M |
| UX-4 | **«Modo inmobiliaria» por defecto:** solo lo que usa una constructora o inmobiliaria en el camino principal (Leads, Contactos, Empresas, Negocios, Citas, Análisis). Servicio, Comercio, Facturas, Listas de precios y Productos quedan en «Más herramientas» o apagados. Lenguaje: lead, proyecto, cita, visita. | P0 | S |
| UX-5 | **Primeros pasos con progreso** (checklist que se queda en el inicio hasta terminar): conectar el formulario, importar leads, invitar asesores, cargar proyectos, elegir horario de Manuela, hacer una llamada de prueba. Estados vacíos con una sola acción clara. | P0 | M |
| UX-6 | **Paleta de comandos (Cmd/Ctrl+K):** buscar lead o contacto y ejecutar acciones («nuevo lead», «ir a citas», «llamar a…»). Atajos de teclado en listas. | P1 | M |
| UX-7 | **Accesibilidad AA y teclado completo** en todo el panel (hoy se verificó solo el login). Modo oscuro opcional. | P1 | M |
| UX-8 | **Asistente («¿cómo te ayudo?»)** que responde con los datos de la empresa: leads calientes sin cita, resumen de la semana, citas de mañana. Va después de tener los datos bien guardados. | P2 | L |

### 3.2 Para el asesor (usa el celular, en sala de ventas o en la calle)

| ID | Requisito | Prio | Esf. |
|---|---|---|---|
| UX-9 | **«Mi día»**: pantalla de inicio del asesor con SUS leads por urgencia (caliente, sin contactar, cita hoy) y botones de un toque: **Llamar, WhatsApp, Registrar resultado, Agendar visita**. | P0 | M |
| UX-10 | **Celular:** listas como tarjetas, barra inferior, PWA instalable y avisos push. El asesor trabaja en computador, así que va después. | P1 | L |
| UX-11 | **Ficha del lead como conversación:** línea de tiempo (formulario → llamada de Manuela con **audio, transcripción y recomendación** → cita → WhatsApp), «siguiente mejor acción», temperatura, notas por dictado. Requiere P-5. | P0 | L |
| UX-12 | **Resultado en dos toques** (contestó / no contestó / visita agendada / descartó + motivo), que alimenta las métricas del gerente. | P0 | S–M |
| UX-13 | **Aviso inmediato de lead caliente** al asesor (WhatsApp, push o correo) con enlace directo a la ficha. | P0 | M |

### 3.3 Para el gerente (el que decide si Machea se queda)

| ID | Requisito | Prio | Esf. |
|---|---|---|---|
| UX-14 | **Panel gerencial:** leads por asesor, tiempo de primera respuesta, % contactados en menos de 5 minutos, citas agendadas / realizadas / no asistió, conversión por proyecto y por fuente, costo por cita. Alertas de «lead sin atender hace X minutos». | P0 | L |
| UX-15 | **Equipo y permisos:** invitar asesores por correo o WhatsApp, roles (gerente, asesor, solo lectura), el asesor ve solo sus leads, desactivar. Hoy no existe. | P0 | L |
| UX-16 | **Reparto de leads:** por turnos, por proyecto, por disponibilidad o manual; reasignar en masa; ver la carga de cada asesor. | P0 | M–L |
| UX-17 | **Configurar a Manuela sin ayuda de Machea:** proyectos (nombre, precio, ubicación, amenidades, fotos), horarios, tono, ofertas, y un botón «llámame ahora» para probar. | P0 | L |
| UX-18 | **Informe semanal** automático por correo o WhatsApp al gerente. | P1 | M |
| UX-19 | **Medidor del plan** (llamadas, minutos, mensajes) con aviso al 80 %. | P1 | M |

## 4. Producto y plataforma

| ID | Requisito | Prio | Esf. |
|---|---|---|---|
| P-1 | **Entrada de leads de cada empresa:** formulario con su marca, código para incrustar, API/webhook, importación de CSV; más adelante Meta Lead Ads y portales. Hoy solo el formulario de Machea. | P0 | L |
| P-2 | **Manuela por empresa:** un agente (o un contexto) por cliente con sus proyectos, número de salida, ventana horaria y tope de gasto. | P0 | L |
| P-3 | **Agenda real:** calendario del asesor (Google u Outlook), disponibilidad, confirmación y recordatorio 24 h y 2 h antes, reagendar, no asistió. | P0 | L |
| P-4 | **Registro de llamadas propio:** guardar audio y transcripción (con consentimiento) y mostrarlos en la ficha. | P0 | M |
| P-5 | **Aislamiento por empresa en la base (RLS)** con prueba automática de que una empresa no ve a otra; copias de seguridad probadas; 2FA para el gerente; auditoría de accesos. Ya está previsto en `PLAN.md` fase 6. | P0 | M–L |
| P-6 | **Operación:** monitoreo de caídas con alerta, Sentry, registro de llamadas fallidas, panel interno de salud de integraciones, guía de incidentes. Hoy Render no se redespliega solo y el CRM lee la bandeja en cada carga de página. | P0 | M |
| P-7 | **Cuentas a nombre de Machea:** GitHub, Vercel, Render, Supabase, Dapta, dominio y correo (hoy hay piezas en cuentas de Santiago, Diego y personales). | P0 | S (trámite) |
| P-8 | **Exportar y borrar los datos** de un lead o de una empresa, y regla de retención (Habeas Data). | P0 | M |
| P-9 | **WhatsApp Business (Meta) con Dapta:** línea, plantillas aprobadas, bandeja de conversaciones y seguimiento automático. Entra en el piloto. | P0 | L |
| P-10 | **Planes, cobro y facturación:** pasarela (Wompi u otra), facturación electrónica, límites por plan y bolsas de minutos. El primer piloto puede facturarse a mano. | P1 | L |
| P-11 | **Integraciones:** Meta (Lead Ads, Pixel y API de conversiones), Google Sheets/Zapier, portales inmobiliarios si ofrecen API. | P2 | L |
| P-12 | **Bajar el costo de la voz** (otro proveedor o tarifa): es la palanca de margen, ~USD 0,15/min frente al costo actual. Hacerlo con datos de los pilotos. | P2 | L |

## 5. Legal y empresa (revisar con abogado; no es asesoría legal)

| ID | Requisito | Prio |
|---|---|---|
| LG-1 | Constituir la empresa (SAS), RUT, cuenta bancaria y facturación. Machea hoy no está constituida. | P0 |
| LG-2 | Definir **quién es responsable y quién encargado** del tratamiento, y el contrato de transmisión de datos con cada cliente (modelo estándar). | P0 |
| LG-3 | Textos finales: **términos de servicio** (falta), política de privacidad (ya publicada, v4) y la autorización del formulario (`TEXTOS_AUTORIZACION_V2.md`), revisados por Ariel o un abogado. | P0 |
| LG-4 | **Llamadas con IA:** avisar que es una asistente virtual, grabar solo con consentimiento, respetar horarios y frecuencia de contacto (Ley 2300 de 2023), baja inmediata («no me llame más»). Camila ya llama L–V 8–18 y sábados 9–12 sin festivos. | P0 |
| LG-5 | Confirmar si Machea debe inscribir sus bases en el **Registro Nacional de Bases de Datos** de la SIC. | P1 |
| LG-6 | Contrato comercial: precios, vigencia, SLA, propiedad de los datos y salida del cliente. | P0 |
| LG-7 | Cumplir las políticas de Meta para WhatsApp y de la DIAN para facturar. | P1 |
| LG-8 | Visto bueno de **Carlos** para adaptar su CRM y de **Diego** para los cambios que tocan el login (siguen pendientes). | P0 |

## 6. Salida al mercado

| ID | Requisito | Prio |
|---|---|---|
| G-1 | **Definir el piloto:** 3 empresas (una constructora VIS, una mediana y una inmobiliaria), 30 a 45 días, precio piloto o gratis a cambio de caso de estudio, y metas acordadas (tiempo de respuesta menor a 5 min, % contactados, citas por lead, costo por cita). | P0 |
| G-2 | **Medir antes:** cómo atiende hoy cada piloto (tiempo de respuesta, leads sin llamar) para demostrar la mejora. | P0 |
| G-3 | **Prueba social real:** logos autorizados, cifras comprobables (llamadas de Manuela), testimonios y un video con grabación real. | P1 |
| G-4 | **Landing comercial:** precios de los 3 planes, preguntas frecuentes, seguridad y privacidad, casos por tipo de cliente, medición (GA4, Pixel, API de conversiones). | P1 |
| G-5 | **Material de venta:** demostración con la marca del prospecto (existe), presentación, propuesta, contrato y calculadora de retorno (el modelo de precios ya existe). | P1 |
| G-6 | **Prospección propia:** Camila llama a las 95 empresas (después de LG-2 a LG-4) y todo queda en el CRM con Machea como su propio cliente. | P1 |
| G-7 | **Activar un cliente en menos de 48 h:** lista fija (formulario, proyectos, Manuela, calendario, asesores) con responsable. | P0 |
| G-8 | **Soporte:** canal (WhatsApp o correo), horario, ayuda corta en video (como la academia de Dapta), escalamiento. | P0 |
| G-9 | **Métricas del negocio:** ingreso mensual recurrente, costo de adquisición, activación y retención. | P2 |
| G-10 | **Reparto del equipo:** quién vende, quién implementa, quién da soporte. | P0 |

## 7. Orden propuesto

**Ola 0 · esta semana (desbloqueos, casi sin código):** elegir los 3 pilotos (G-1), cuentas a nombre de Machea (P-7),
arrancar LG-1 a LG-4 con Ariel y Diego, y subir el modo inmobiliaria (UX-4).

**Ola 1 · «se siente como producto» (1 a 2 semanas):** UX-1, UX-2, UX-3, UX-5, más UX-9, UX-11, UX-12 y UX-13 con
las llamadas de Manuela guardadas (P-4). Entregable: una demostración en vivo con un lead real de punta a punta
(formulario → Manuela → ficha con audio → aviso al asesor → cita).

**Ola 2 · piloto (2 a 4 semanas):** UX-15 (equipo y permisos), UX-16 (reparto), UX-14 (panel del gerente), UX-17
(configurar a Manuela), P-1 (entrada de leads), P-2, P-3 (agenda real), P-5 (RLS), P-6 (operación), UX-10 (celular).

**Ola 3 · cobrar y escalar:** P-10 (cobro), P-9 (WhatsApp), UX-18, UX-19, UX-6, UX-7, P-11, UX-8, P-12, G-3 a G-6.

## 8. Decisiones (respondidas el 21-oct)

1. **Asesor en computador**, no en celular: el panel se diseña primero para escritorio. UX-10 (celular/PWA) baja a P1.
2. **Sin pilotos todavía:** se arma la infraestructura para inmobiliarias y constructoras (ver P-13 a P-15) y los pilotos llegan después.
3. **WhatsApp entra en el piloto**, usando Dapta (P-9 sube a P0, ola 2).
4. **«Lead»** es el nombre de la persona interesada en comprar o arrendar, solo en lo que ve el panel. Pendiente: que el equipo lo confirme.
5. Por resolver: quién lleva legal (Ariel y Diego) y fechas; quién da soporte los primeros 90 días.

## 8.1 Requisitos nuevos que salen de esas respuestas

| ID | Requisito | Prio | Esf. |
|---|---|---|---|
| P-13 | **Constructor de formularios dentro del panel de la empresa:** campos, preguntas, marca (logo y colores), autorización de datos y código para incrustarlo en su sitio; los leads entran directo a su CRM. Hoy el formulario lo implementa Machea a mano por marca. | P0 | XL |
| P-14 | **Agentes predeterminados por tipo de cliente** (constructora VIS, constructora media, inmobiliaria de venta, de arriendo), **generados con IA** a partir de los datos de la empresa (proyectos, precios, tono, horarios) y con una versión de prueba antes de activarlos. | P0 | XL |
| P-15 | **Conexión con Dapta por API desde el panel:** crear y actualizar el agente y el flujo de cada empresa, número de salida, línea de WhatsApp y plantillas, sin que Machea entre a Dapta a mano. Incluye guardar el audio y la transcripción de cada llamada (P-4). | P0 | XL |

## 8.2 Estado de la Ola 1 (rama `ux/ola-1`)

| ID | Qué quedó | Falta |
|---|---|---|
| UX-1 | Sistema de movimiento (0,14–0,22 s, una curva), páginas que entran subiendo, modales, avisos, menús, botones con estado presionado y contadores que suben; respeta «reducir movimiento» | — |
| UX-2 | Esqueletos de carga en inicio/análisis, listas y fichas; el enlace de la barra lateral late mientras carga | Esqueleto para el calendario |
| UX-3 | Cambiar de etapa, completar tareas (inicio, pie y ficha) y resultado de llamada se ven al instante; el embudo ya arrastraba y ahora da feedback | Deshacer |
| UX-4 | Pestañas de Ventas sin Productos, Listas de precios, Facturas ni Videollamadas (siguen en el lápiz «Agregar»); la lista de leads muestra teléfono, temperatura, estado y origen; empresa opcional; vistas «Leads calientes» y «Sin contactar»; datos de ejemplo de compradores | Ocultar Servicio y Comercio por defecto |
| UX-5 | «Primeros pasos» con progreso, calculado con datos reales; se oculta al terminar | Pasos de conectar formulario, invitar asesores y probar a Manuela (dependen de P-13, UX-15 y UX-17) |
| UX-9 | «Para hacer hoy» con **Llamar** (marca desde el computador), **WhatsApp** (WhatsApp Web) y **Resultado** a un clic; tareas que se tachan al instante | «Mi día» propio del asesor (depende de UX-15) |
| UX-11 | Tarjeta **«Llamada de Manuela»** en la ficha: resumen, qué hacer ahora, objeción, temperatura y cita | **Audio y transcripción** (P-4) |
| UX-12 | «¿Cómo te fue?» en dos toques (contestó interesado, no contestó, no le interesa, número equivocado), con nota opcional; mueve el estado y deja «Volver a llamar» mañana | Reportes al gerente (UX-14) |
| UX-13 | **Aviso en pantalla** (cada 30 s con la pestaña visible) cuando entra un lead nuevo o Manuela deja uno caliente, con botón «Abrir» | Aviso por WhatsApp, correo o push (necesita P-9) |

## 8.3 Estado de la Ola 3 (27-oct-2026)

| ID | Qué quedó | Falta |
|---|---|---|
| UX-15 | **Equipo y permisos:** roles (dueño, gerente, asesor, solo lectura), invitar por enlace (WhatsApp o copiar), cambiar rol, desactivar con traspaso de leads, `/crm/equipo`. El asesor solo ve y edita lo suyo (leads, contactos, tareas, citas, audios, avisos); lo de gestión no existe para él. Permisos en el servidor, con pruebas. | Invitar por correo desde el sistema (hoy se manda el enlace a mano); salir de «una cuenta de Machea por persona» no es necesario. |
| UX-16 | **Reparto de leads:** por turnos o manual; los leads que entran (bandeja, formularios) van al siguiente asesor y se le avisa en la campana; reasignar en masa (de una persona a otra o por turnos); tiempo de respuesta configurable. | Reparto por proyecto o por disponibilidad/horario; límite de leads por asesor. |
| UX-9 | **«Mi día»** del asesor: leads por contactar con reloj de respuesta en vivo (verde, ámbar, rojo), Llamar / WhatsApp / Resultado, citas de hoy y de la semana, tareas, y sus cifras de la semana. | Aviso por WhatsApp o push (P-9). |
| UX-14 | **Panel del gerente** en Inicio: leads nuevos, % contactados a tiempo, tiempo de respuesta (mediana), citas, negocios; tendencia contra el periodo anterior (7, 30 y 90 días); tabla por asesor; embudo; fuentes; leads esperando respuesta con alerta. | Alerta por correo o WhatsApp al gerente; conversión por proyecto; costo por cita; citas «realizadas» y «no asistió». |
| UX-6 | **Paleta de comandos** (Cmd/Ctrl + K o «/»): busca leads, contactos, empresas y negocios (el asesor solo los suyos), ir a cualquier pantalla y crear; atajos `N`, `G I`, `G L`, `G C`, `G E` y `?`. | — |
| UX-3 | **Deshacer** al cambiar de etapa, mover una tarjeta y completar una tarea. | Deshacer al eliminar (requiere papelera). |
| UX-5 | «Invite a su equipo» entra en Primeros pasos y se marca solo. | Conectar el formulario y probar a Manuela (P-13, UX-17). |
| P-5 | **Parcial:** pruebas automáticas de que una empresa no ve a otra y un asesor no ve a otro asesor (PGlite). | RLS en la base. |
| P-6 | **Parcial:** `/crm/api/salud` para un monitor externo (estado de la base, del esquema y de la bandeja) y pantalla «Actualizando» si el código llega antes que la migración. | Sentry, alertas, panel de salud de integraciones, Render con despliegue automático. |
| P-8 | **Exportar:** botón «Sus datos» en cada lead y contacto (JSON con datos, historial, formularios, llamadas y autorización); eliminar ya existía (solo gerente o dueño). | Regla de retención y borrado por empresa completa. |
| Seguridad | S-10: scrypt más fuerte con actualización silenciosa. SQL de «Machea como cliente» probado y corregido (`pnpm prueba:sql`). | S-09 (RLS), S-11, S-12. |

## 9. Riesgos principales

- **Legal antes que código:** sin acuerdos firmados y sin el responsable del tratamiento definido, el CRM no puede recibir
  leads de otras empresas ni Camila puede llamar a escala.
- **Una cuenta por empresa:** sin equipo y permisos (UX-15) no hay producto para una inmobiliaria con varios asesores.
- **Costo de la voz:** el margen depende de cuánto hable Manuela; medir en los pilotos antes de prometer bolsas.
- **Dependencia de Dapta** para voz y flujos; una caída o un cambio de precio llega directo al cliente.
- **Infraestructura en cuentas ajenas** y sin alertas: una caída se detecta cuando el cliente se queja.
