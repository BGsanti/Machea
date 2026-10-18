# Revisión legal de la política y de las autorizaciones

**Para:** Diego, que lo pasa por **Ariel** (arielapp.co), y después un abogado.
**Política que se revisa:** [POLITICA_PRIVACIDAD_BORRADOR.md](POLITICA_PRIVACIDAD_BORRADOR.md), v3.

> **Ojo con las citas.** Las de este documento son mi lectura de la Ley 1581 de 2012 y del Decreto 1377 de 2013
> (compilado en el Decreto 1074 de 2015). **No son asesoría legal.** Por eso la primera pregunta para Ariel (la 0) es
> que las confirme. Ariel tampoco reemplaza a un abogado: su propia FAQ lo dice.

## Cómo usarlo

1. Pega en Ariel, una por una, las preguntas de la parte C. Cada una trae su contexto.
2. Copia cada respuesta, **con sus citas**, en la parte D de este archivo, o mándamela por el chat.
3. Con eso corrijo la política y los textos, cambio la versión de los que cambien y te lo devuelvo para el abogado.

## A. Cumplimiento: lo que pide la norma y dónde está en la v3

| # | Requisito | Norma (por verificar) | Dónde en la v3 | Estado |
| --- | --- | --- | --- | --- |
| 1 | Identificar al responsable: nombre, domicilio, dirección, correo y teléfono | Decreto 1377, art. 13, num. 1; Ley 1581, art. 12, lit. d | §1 | **Falta**: nombres, dirección y teléfono |
| 2 | Decir el tratamiento y para qué se usan los datos | Decreto 1377, art. 13, num. 2; Ley 1581, art. 12, lit. a | §3 y §4 | Listo |
| 3 | Decir los derechos de los titulares | Ley 1581, art. 8; Decreto 1377, art. 13, num. 3 | §8 | Listo |
| 4 | Decir quién atiende las peticiones | Decreto 1377, art. 13, num. 4 | §9 | **Falta**: persona o área |
| 5 | Decir el procedimiento para consultas y reclamos | Ley 1581, arts. 14 y 15; Decreto 1377, art. 13, num. 5 | §9 | Listo; confirmar plazos |
| 6 | Fecha de vigencia de la política y de las bases de datos | Decreto 1377, art. 13, num. 6 | §11 y §7 | Listo; falta la fecha |
| 7 | Autorización previa, expresa e informada | Ley 1581, art. 9; Decreto 1377, art. 5 | §5 y casillas sin marcar | Listo en el formulario; **revisar** "Agenda una demo" y Camila |
| 8 | El silencio no es autorización: casilla sin marcar | Decreto 1377, art. 7 | §5 | Listo |
| 9 | Guardar la prueba de la autorización | Decreto 1377, art. 8 | §5: versión, texto y fecha en `consultas.autorizacion` y `solicitudes_llamada` | Listo en el formulario; **falta** en "Agenda una demo" y en cuentas |
| 10 | Revocatoria y supresión | Ley 1581, art. 8, lit. e; Decreto 1377, art. 9 | §8 y §9 | Listo; **revisar** el caso del lead ya compartido |
| 11 | Datos sensibles y de menores | Ley 1581, arts. 5 a 7 | §3.5 | Listo (no se piden); confirmar que ingresos y edad no son sensibles |
| 12 | Circulación restringida: compartir solo con autorización | Ley 1581, art. 4, lit. f | §6, caso A | Listo; **revisar** el texto de la hoja |
| 13 | Transmisión a encargados fuera de Colombia | Ley 1581, art. 26; Decreto 1377, arts. 24 y 25 | §6, "Transmisión internacional" | **Revisar**: contratos y país adecuado |
| 14 | Deberes del encargado, cuando Machea opera el formulario de una marca | Ley 1581, art. 18 | §6, caso B | **Falta**: el acuerdo con cada empresa |
| 15 | Informar a la SIC los incidentes de seguridad | Ley 1581, art. 17, lit. n | §10 | Listo; confirmar |
| 16 | Avisar los cambios sustanciales antes de aplicarlos | Decreto 1377, arts. 5 y 13 | §12 | Confirmar el artículo |
| 17 | Registro Nacional de Bases de Datos (RNBD) | Ley 1581, art. 25; Decreto 090 de 2018 | No está | **Preguntar** si aplica a personas naturales |

## B. Los textos de autorización que hoy están en producción

Están en www.machea.co desde que se fusionaron los PR #14 y #18 el 2026-10-18. Todos enlazan a `/privacidad/`, que
todavía da 404, salvo el de "Agenda una demo", que no la enlaza.

1. **Registro del formulario de Machea** (`registro-machea-v1`):
   > Autorizo a Machea a usar mis datos (nombre, correo, teléfono y mis respuestas) para recomendarme vivienda,
   > llamarme con su asistente virtual y escribirme sobre los proyectos que me interesen. Puedo consultar, corregir o
   > borrar mis datos cuando quiera. [Política de privacidad]
2. **Registro del formulario con marca** (`registro-marca-v1`; ejemplo con Amarilo):
   > Autorizo a Amarilo a usar mis datos (nombre, correo, teléfono y mis respuestas) para contactarme sobre sus
   > proyectos de vivienda. Machea opera este formulario y la llamada en nombre de Amarilo. [Política de privacidad]
3. **Hoja "Antes de llamarte"** (`compartir-v1`), al tocar "Hablar con un asesor" en un proyecto de otra empresa. La
   llamada solo sale con la casilla marcada.
   > Manuela, la asistente virtual de Machea, te va a llamar para agendar tu visita a {Proyecto}. Para que el equipo
   > de {Constructora} te atienda, necesitamos tu permiso para compartirle tus datos.
   >
   > ☐ Autorizo a Machea a compartir con {Constructora} mi nombre, correo, teléfono, mis respuestas y el resultado de
   > la llamada, para que me contacten sobre {Proyecto}. [Política de privacidad]
4. **"Agenda una demo"** (landing, sin versión):
   > Autorizo a Machea a tratar mis datos para contactarme sobre esta solicitud, incluida una llamada o mensaje de su
   > equipo o de su agente de voz con IA.
5. **Crear una cuenta de empresa** (`/acceso/`, sin versión):
   > Acepto la [Política de privacidad] y el tratamiento de mis datos.
6. **Llamadas en frío de Camila**: no hay autorización previa. Los números salen de directorios públicos de empresas.
   Al empezar, Camila dice: "Esta llamada puede ser grabada para mejorar el servicio".

## C. Preguntas para Ariel (copiar y pegar)

**Contexto general**, para pegarlo antes de la primera pregunta:

> Somos Machea, una startup colombiana todavía no constituida como sociedad (sin razón social ni NIT); hoy la
> desarrollan personas naturales.
> - **Para interesados en vivienda:** un formulario web recomienda proyectos de vivienda en Bogotá. Una asistente
>   virtual de voz (Manuela, con el proveedor Dapta) llama al interesado para agendar una visita.
> - **Para constructoras e inmobiliarias:** les damos un CRM y les entregamos los leads. A veces el interesado entra
>   por un formulario con la marca de la constructora, que operamos nosotros.
> - **Para conseguir clientes:** otra asistente de voz (Camila) llama a contactos de empresas para ofrecer el
>   servicio.
>
> Usamos proveedores en Estados Unidos: Vercel, Render, Supabase y Google. Aplica la Ley 1581 de 2012 y el
> Decreto 1377 de 2013.

**0. Citas.** Confirma o corrige cada cita de la tabla de la parte A, con el número de artículo exacto en el Decreto
1074 de 2015 donde aplique.

**1. Responsable sin sociedad.**
- ¿Pueden ser responsables del tratamiento varias personas naturales a la vez, como corresponsables?
- ¿Qué datos mínimos de ellas hay que publicar en la política? ¿Hace falta el número de cédula? ¿Puede ser una
  dirección de correspondencia que no sea la casa de alguno?
- Cuando se constituya la sociedad (por ejemplo, una SAS), ¿cómo se le pasan las bases de datos? ¿Hay que pedir una
  nueva autorización a cada titular, o basta con avisar el cambio de responsable?

**2. Texto del registro.** Este es el texto (parte B, n.º 1), con un enlace a la política completa.
- ¿Cumple el deber de informar del art. 12 de la Ley 1581 con un texto corto más el enlace, o hay algo que debe ir
  en el texto mismo?
- ¿Hace falta nombrar al responsable con nombre propio en la casilla, ya que "Machea" no es una persona jurídica?

**3. Compartir con la constructora.** Este es el texto (parte B, n.º 3).
- Al entregar el lead, ¿la constructora queda como responsable autónoma (una transferencia nacional), con su propia
  política?
- ¿Basta con esta autorización, o hay que decir también para qué usará los datos la constructora?
- ¿Es válido que la llamada solo se haga si la persona acepta compartir, frente al principio de libertad?

**4. Formulario con marca.** Machea opera el formulario y la llamada por cuenta de la constructora (parte B, n.º 2).
- ¿Machea es encargado y la constructora responsable?
- ¿Qué debe tener el acuerdo entre las dos (art. 18 de la Ley 1581)?
- ¿Basta con enlazar la política de la constructora, o también la de Machea?

**5. Proveedores en Estados Unidos** (Vercel, Render, Supabase, Google, Dapta).
- ¿Es una transmisión internacional a encargados?
- ¿Estados Unidos está en la lista de países con nivel adecuado de protección de la SIC? ¿Qué circular lo dice?
- ¿Hace falta un contrato de transmisión (Decreto 1377, art. 25), o bastan sus términos de servicio y la
  autorización?

**6. Llamadas en frío de Camila.** Llamamos a contactos de inmobiliarias y constructoras sacados de directorios
públicos de empresas.
- ¿El nombre y el teléfono de un contacto de una empresa son datos personales?
- ¿Hace falta autorización previa, o aplica alguna excepción del art. 10 de la Ley 1581 (datos de naturaleza
  pública)?
- ¿Aplica la Ley 2300 de 2023 (horarios y frecuencia de contacto) a estas llamadas, y también a las de Manuela, que
  la persona pidió?
- ¿Qué hay que decir al comienzo de la llamada?

**7. Plazos de conservación.** ¿Son razonables los plazos propuestos en la sección 7 de la política? ¿Hay alguna norma
que obligue a guardar algo más tiempo?

**8. RNBD.** ¿Tenemos que inscribir las bases de datos en el Registro Nacional de Bases de Datos siendo personas
naturales? ¿Y cuando seamos una SAS pequeña (Decreto 090 de 2018)?

**9. Prueba de la autorización.** Guardamos la versión del texto, el texto exacto, la fecha y hora y el teléfono y
correo de la persona. ¿Es suficiente como prueba (Decreto 1377, art. 8)?

**10. Grabaciones.** La llamada de Manuela no se graba, pero el proveedor genera un resumen. La de Camila "puede ser
grabada".
- ¿Qué hay que informar en cada caso?
- ¿Hace falta otra autorización para grabar?

**11. Revocatoria de un lead ya compartido.** Si alguien pide que borremos sus datos después de que su lead llegó a
una constructora, ¿qué debe hacer Machea? ¿Basta con borrar lo suyo e informarle a quién se compartió, o debe
avisarle a la constructora?

**12. Datos sensibles.** ¿El rango de ingresos del hogar, la edad y el número de personas a cargo son datos
sensibles?

## D. Respuestas

> Pegar aquí lo que responda Ariel, con sus citas, y después lo que diga el abogado.

| # | Respuesta (resumen) | Cita | Qué cambia en la política o en los textos |
| --- | --- | --- | --- |
| 0 | | | |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |
| 11 | | | |
| 12 | | | |
