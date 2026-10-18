# Textos de autorización, versión 2 (después de Ariel)

Ariel revisó los tres textos que hoy están en producción (REVISION_LEGAL.md, parte D, mensaje 2). Su conclusión: **las
casillas sirven** (están sin marcar y piden una acción), **pero el texto de cada una debe traer lo esencial**: quién es
el responsable, qué datos, qué se hace con ellos, para qué, a quién se comunican y cómo ejercer los derechos. El
enlace a la política complementa, pero no reemplaza eso (Ley 1581, art. 12; DUR 1074, art. 2.2.2.25.2.2).

Eso choca con la D5 (los textos cortos). Abajo hay **una versión compacta que cumple**, más corta que la de Ariel,
para que Diego decida.

## Lo que sigue igual

- Las casillas sin marcar, separadas por finalidad.
- Que la llamada solo salga con la autorización de compartir, siempre que la llamada de verdad necesite entregar los
  datos (ver el problema 1).
- Los datos de ingresos, edad y personas a cargo **no son sensibles** (Ley 1581, art. 5). Siguen siendo datos
  privados: hay que explicar para qué se piden.

## A. Registro del formulario de Machea (`registro-machea-v2`)

**Hoy (v1):**
> Autorizo a Machea a usar mis datos (nombre, correo, teléfono y mis respuestas) para recomendarme vivienda, llamarme
> con su asistente virtual y escribirme sobre los proyectos que me interesen. Puedo consultar, corregir o borrar mis
> datos cuando quiera. [Política de privacidad]

**Lo que falta, según Ariel:**
- el responsable con nombre propio;
- las operaciones ("usar" es genérico);
- que "escribirme" queda abierto (¿publicidad?);
- los derechos completos y dónde ejercerlos.

**Propuesta compacta (v2):**
> Autorizo a [Nombre 1], [Nombre 2] y [Nombre 3], responsables del proyecto Machea, a guardar y analizar mi nombre,
> correo, teléfono y respuestas para recomendarme vivienda en Bogotá, llamarme (también con una asistente virtual) y
> escribirme por WhatsApp o correo sobre mi solicitud y los proyectos que elija. Puedo consultar, actualizar,
> rectificar o suprimir mis datos y revocar esta autorización en [privacidad@machea.co] o [teléfono].
> [Política de datos]

- **Publicidad de otros proyectos o de terceros:** no se pide. Si un día se quiere, va en una casilla aparte y
  opcional, como recomienda Ariel.

## B. Hoja "Antes de llamarte" (`compartir-v2`)

**Hoy (v1):**
> Autorizo a Machea a compartir con {Constructora} mi nombre, correo, teléfono, mis respuestas y el resultado de la
> llamada, para que me contacten sobre {Proyecto}. [Política de privacidad]

**Lo que falta, según Ariel:**
- que la constructora queda como **responsable independiente**;
- la finalidad completa: contactar, informar y hacer seguimiento;
- qué es "el resultado de la llamada";
- la política y el contacto de la constructora;
- que sin esto no se puede pedir la llamada.

**Propuesta compacta (v2):**
> Autorizo a los responsables de Machea a entregar a {Constructora} mi nombre, correo, teléfono, respuestas y el
> resumen y la calificación de la llamada, para que me contacte sobre {Proyecto}, me informe y haga seguimiento a mi
> solicitud. {Constructora} los tratará como responsable, según su [política]. Puedo ejercer mis derechos ante Machea
> ([privacidad@machea.co]) y ante {Constructora} ([contacto]). Sin esta autorización no podemos pedir esta llamada.

- **El botón** pasa de "Hablar con un asesor" a **"Pedir llamada de {Constructora}"**, como sugiere Ariel.
- **"Resultado de la llamada"** quiere decir el resumen y la calificación. **Manuela no graba la llamada**, así que
  no se entrega audio ni transcripción. [VERIFICAR con Dapta]

## C. Formulario con la marca de una empresa (`registro-marca-v2`)

**Hoy (v1):**
> Autorizo a {Marca} a usar mis datos (nombre, correo, teléfono y mis respuestas) para contactarme sobre sus proyectos
> de vivienda. Machea opera este formulario y la llamada en nombre de {Marca}. [Política de privacidad]

**Lo que falta, según Ariel:**
- que {Marca} es la responsable;
- las operaciones y finalidades concretas;
- que Machea es su **encargado** y no usa los datos para fines propios;
- los derechos ante {Marca};
- **enlazar la política de {Marca}**, no la de Machea.

**Propuesta compacta (v2):**
> Autorizo a {Marca}, responsable del tratamiento, a guardar y usar mi nombre, correo, teléfono y respuestas para
> contactarme sobre sus proyectos de vivienda, atender mi solicitud y hacerle seguimiento. Machea opera este
> formulario, la llamada y el CRM por cuenta de {Marca}, como encargado, y no usa estos datos para otros fines. Puedo
> ejercer mis derechos ante {Marca} en [contacto de {Marca}]. [Política de {Marca}]

## D. Problemas que salieron al revisarlo

1. **La hoja pide permiso para compartir con empresas que no son clientes.** Hoy aparece con cualquier constructora
   del catálogo (Amarilo, Bolívar…), pero a las que no tienen cuenta y fuentes en `/admin` nunca les llega el lead.
   - Condicionar la llamada a "compartir" solo vale si la llamada lo necesita (Ariel).
   - Con una empresa que no es cliente, la llamada la hace Machea para sí misma: ahí basta la autorización del
     registro (A), y la hoja no debería salir.
   - **Propuesta:** la hoja solo aparece si el dueño del proyecto es cliente (tiene la fuente asignada). El front lo
     pregunta al backend (`GET /api/crm/dueno?tipo=…&slug=…`), que responde también el nombre, el enlace a la
     política y el contacto de la empresa.
2. **Los formularios con marca nombran a empresas sin acuerdo.** `?marca=amarilo`, `colsubsidio`,
   `constructora-bolivar` y `cusezar` dicen "Autorizo a {Marca}…", pero no hay contrato con ellas.
   - **Propuesta:** esos formularios quedan **solo como demostración** (sin guardar leads ni llamar) hasta tener el
     acuerdo de encargo con la empresa, y su política y su contacto.
   - Cuando una empresa firme, se activa su formulario.
3. **Faltan datos de cada empresa cliente:** el enlace a su política de tratamiento y su contacto para los derechos.
   Se piden al aprobar la cuenta en `/admin`.
4. **La prueba de la autorización se queda corta.** Hoy se guardan la versión, el texto y la fecha. Ariel recomienda
   sumar:
   - un identificador del evento y la URL o el formulario;
   - la versión de la política vigente;
   - el user agent y, si es proporcional, la IP;
   - que la casilla empezó sin marcar;
   - la empresa y el proyecto de la autorización de compartir.

   Se puede hacer sin cambiar el esquema: `consultas.autorizacion` es JSON, y `/api/llamar` ya conoce la IP y el user
   agent.
5. **Ingresos, edad y personas a cargo.** Hay que explicar para qué se piden.
   - Ingresos y personas a cargo los usa el recomendador (presupuesto y subsidio): decirlo en la pregunta.
   - La edad es la que menos mueve la recomendación: **hacerla opcional** ("Prefiero no decir").
   - Agregar en el formulario: "Las preguntas sobre ingresos, edad y personas a cargo se usan solo para recomendarte
     vivienda; no se comparten sin tu autorización".

## E. Ronda 4: decide Diego

1. **Textos:** ¿las versiones compactas (v2) de este documento, o el texto completo que propuso Ariel? Recomiendo las
   compactas: cumplen con lo esencial y siguen leyéndose en el celular.
2. **La hoja, solo con clientes** (problema 1): ¿sí? Recomiendo que sí.
3. **Formularios con marca solo como demo** hasta tener el acuerdo (problema 2): ¿sí? Recomiendo que sí; es el
   riesgo más grande hoy.
4. **La edad opcional y la explicación de por qué se piden los datos** (problema 5): ¿sí?
5. **Los nombres de los responsables, el correo y el teléfono**: hacen falta para cualquiera de los textos.
