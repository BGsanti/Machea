# Matriz de roles por flujo de datos

La recomendó Ariel (mensaje 1) como paso **antes de cerrar la política**. Para cada flujo dice quién decide sobre los
datos (el **responsable**), quién los trata por encargo (el **encargado**), qué autorización lo cubre y qué falta.
Sirve también como base para el acuerdo entre los fundadores (parte B) y para los contratos con las empresas y los
proveedores.

> Es una propuesta del equipo para revisar con Ariel y con un abogado. Donde dice **R**, son los responsables del
> proyecto (las personas naturales de la política, §1).

## A. La matriz

| # | Flujo | Titulares y datos | Responsable | Encargados | Autorización o base | Conservación (propuesta) | Qué falta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Formulario de Machea | Interesados: contacto, respuestas, resultados, marca, autorización | **R** | Vercel (front), Supabase (base), Render (API) | `registro-machea-v1` | 24 meses desde el último contacto | Contratos o DPA de los encargados |
| 2 | Llamada de Manuela y seguimiento por WhatsApp | Interesados: teléfono, nombre, proyecto; resumen, temperatura, cita | **R** | Dapta (voz y WhatsApp), Render, Supabase | `registro-machea-v1` (la pidió el titular) | Igual que el flujo 1 | Qué guarda Dapta (audio, transcripción) y su DPA; si aplica la Ley 2300 (mensaje 3) |
| 3 | Lead compartido con la dueña del proyecto (caso A) | Interesados: contacto, respuestas, resultado de la llamada | **R** hasta la entrega; desde ahí, **la constructora como responsable independiente** | Supabase y Vercel (el CRM) mientras la entrega | `compartir-v1`, en la hoja "Antes de llamarte" | La copia de la empresa, según su política | Validar el texto y la transferencia nacional (mensaje 2); acuerdo con cada empresa |
| 4 | Formulario con la marca de una empresa (caso B) | Interesados de esa marca | **La empresa** (o conjunta con R, según el contrato) | **R como encargado**, con Vercel, Supabase, Render y Dapta como subencargados | `registro-marca-v1` | Según la política de la empresa | Definir si es encargo o responsabilidad conjunta (mensaje 2); contrato de encargo (Ley 1581, art. 18); enlace a la política de cada empresa |
| 5 | CRM de cada empresa | Lo que la empresa carga: sus contactos, oportunidades, notas | **La empresa** | **R como encargado**, con Vercel y Supabase como subencargados | La de la empresa con sus titulares | Mientras la cuenta esté activa, más 90 días | Términos de servicio para clientes con la cláusula de encargo |
| 6 | Cuentas de empresas (login y `/admin`) | Representantes: usuario, correo, contraseña (hash) | **R** | Render, Supabase, Google (correo y, si se enciende, el inicio de sesión) | "Acepto la política", al registrarse | Mientras la cuenta esté activa | Versionar esa aceptación |
| 7 | "Pruébalo con tu marca" | Prospectos: nombre, correo, empresa, sitio | **R** | Render, Google (correo), Dapta (llamada de demo) | La casilla del formulario de demo | 12 meses | Revisar el texto |
| 8 | "Agenda una demo" | Prospectos: nombre, celular, correo, empresa, datos comerciales | **R** | Supabase, Render, Dapta (Camila, en modo cálido) | "Autorizo a Machea a tratar mis datos…", sin enlace a la política | 12 meses | Enlazar la política y versionar el texto |
| 9 | Llamadas en frío de Camila | Contactos de empresas: nombre, cargo, teléfono; resultado y grabación | **R** | Dapta, Supabase, Render | **Sin autorización previa**: base legal por confirmar | 12 meses; si pide no ser llamado, solo el número | Base legal y Ley 2300 (mensaje 3); qué graba Dapta |
| 10 | Seguridad y operación | Visitantes: IP, navegador, fechas | **R** | Vercel, Render | Interés legítimo de seguridad [VERIFICAR] | 90 días | Confirmar la base |

### Proveedores: qué revisar de cada uno

Para confirmar que son encargados y que su contrato cubre la transmisión (Decreto 1074 de 2015, arts. 2.2.2.25.5.1 y
2.2.2.25.5.2):

| Proveedor | Qué trata | Dónde mirar | Estado |
| --- | --- | --- | --- |
| Supabase | Base de datos de leads, cuentas y CRM | Su DPA (Data Processing Addendum) | [PENDIENTE] |
| Vercel | Front y CRM | Su DPA | [PENDIENTE] |
| Render | API | Su DPA | [PENDIENTE] |
| Dapta | Voz (Manuela, Camila), WhatsApp, resúmenes | Contrato o términos; preguntar qué guarda y dónde | [PENDIENTE] |
| Google | Correo (Gmail) y, si se enciende, el inicio de sesión | Google Workspace DPA (con Gmail personal no hay DPA) | [PENDIENTE] |

## B. Acuerdo entre los fundadores (qué debe decir)

Lo recomendó Ariel mientras no exista la SAS. No reemplaza la política: prueba quién decide y cómo se gobiernan los
datos.

1. **Responsables:** quiénes son, como personas naturales que deciden conjuntamente.
2. **Bases de datos:** cuáles son (los flujos 1, 2, 6, 7, 8, 9 y 10 de la matriz) y cuáles se tratan por encargo de
   empresas (4 y 5).
3. **Finalidades** de cada base, las mismas de la política.
4. **Atención de consultas y reclamos:** quién la hace, el correo y el teléfono, y los plazos (10 y 15 días hábiles).
5. **Proveedores:** quién los contrata y supervisa, y quién guarda sus contratos.
6. **Prueba de las autorizaciones:** dónde se guarda (`consultas.autorizacion`, `solicitudes_llamada`) y quién
   responde por ella.
7. **Seguridad:** quién tiene acceso a qué, y qué hacer si hay un incidente (avisar a la SIC).
8. **Reparto interno** de las obligaciones y de la responsabilidad.
9. **Paso a la SAS:** el compromiso de documentar el traspaso, actualizar la política y avisar a los titulares.
