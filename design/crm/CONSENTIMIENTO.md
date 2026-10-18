# CRM multiempresa: consentimiento (fase 3)

**Borrador para que Diego decida y para revisión legal.** No es asesoría legal: lo tiene que revisar un abogado
antes de publicarse. Mockup interactivo en [mockups/consentimiento.html](mockups/consentimiento.html), en
escritorio y en celular.

## Por qué hace falta

La regla D4 le entrega el lead a la constructora o inmobiliaria **dueña del proyecto** por el que la persona pidió
la llamada. Hoy el formulario de Machea solo pide esto:

> Autorizo el tratamiento de mis datos personales para recibir información de vivienda (Habeas Data).

Eso no dice quién es el responsable, ni para qué se usan los datos, ni que se van a compartir con otra empresa.
Además, la autorización no se guarda en ningún lado. Lo que pide la ley, en lo que importa aquí:

- **La autorización es previa, expresa e informada** (Ley 1581 de 2012, art. 9). Al pedirla hay que decir para qué
  se usan los datos, qué derechos tiene la persona y quién es el responsable, con su dirección y su correo
  (art. 12).
- **El silencio no cuenta como autorización** (Decreto 1377 de 2013, art. 7, hoy en el Decreto 1074 de 2015). Por
  eso la casilla va sin marcar.
- **Hay que poder demostrarla** (Decreto 1377, art. 8): se guarda qué texto aceptó y cuándo. La fase 2 ya dejó el
  lugar para eso: `consultas.autorizacion` y `solicitudes_llamada.autoriza_compartir` / `version_autorizacion`.
- **Si la constructora usa los datos para sus propios fines** (contactar, vender), los recibe como responsable, no
  como encargada de Machea. Por eso la persona tiene que autorizar que se le entreguen, y conviene nombrar a la
  empresa.

No pedimos datos sensibles: ingresos, edad y personas a cargo no lo son. La llamada no se graba.

## Propuesta

**Dos momentos, cada uno con su texto.** Así cada autorización dice exactamente para qué es.

### 1. En el registro: el tratamiento de Machea

Hoy en la pantalla "Cuéntanos quién eres". Sigue siendo obligatoria para empezar.

**Opción A (recomendada, corta, con la política enlazada):**

> Autorizo a Machea a usar mis datos (nombre, correo, teléfono y mis respuestas) para recomendarme vivienda,
> llamarme con su asistente virtual y escribirme sobre los proyectos que me interesen. Puedo consultar, corregir
> o borrar mis datos cuando quiera. [Política de privacidad]

**Opción B (más completa, más larga en el celular):**

> Autorizo a Machea, responsable del tratamiento, a recoger y usar mi nombre, correo, teléfono y las respuestas de
> este formulario para recomendarme vivienda, llamarme con su asistente virtual Manuela y enviarme la ficha de los
> proyectos por correo o WhatsApp. Tengo derecho a conocer, actualizar, rectificar y suprimir mis datos, y a
> revocar esta autorización, escribiendo a equipo@machea.co. [Política de privacidad]

### 2. Al tocar "Hablar con un asesor": compartir con la dueña del proyecto

Hoy el botón dispara la llamada de inmediato. Propuesta: primero se abre una hoja corta, y la llamada sale solo
con la casilla marcada.

> **Antes de llamarte**
>
> Manuela, la asistente virtual de Machea, te va a llamar para agendar tu visita a **{Proyecto}**. Para que el
> equipo de **{Constructora}** te atienda, necesitamos tu permiso para compartirle tus datos.
>
> ☐ Autorizo a Machea a compartir con **{Constructora}** mi nombre, correo, teléfono, mis respuestas y el
> resultado de la llamada, para que me contacten sobre **{Proyecto}**. [Política de privacidad]
>
> [Llamarme ahora] · Ahora no

- En **Arriendo** dice "la inmobiliaria **{Inmobiliaria}**" y "el inmueble".
- **Si el proyecto no tiene dueño en el catálogo**, no se abre la hoja: la llamada sale como hoy y no se comparte.
- **"Ahora no"** deja a la persona en los resultados. Puede seguir por WhatsApp.

### 3. Formularios con marca (`?marca=amarilo` y los demás)

Ahí la empresa es la dueña del formulario: recibe el lead por la regla de la marca, y Machea opera el formulario y
la llamada **en su nombre** (como encargado). El texto del registro de cada marca pasa a ser:

> Autorizo a **{Marca}** a usar mis datos (nombre, correo, teléfono y mis respuestas) para contactarme sobre sus
> proyectos de vivienda. Machea opera este formulario y la llamada en nombre de {Marca}. [Política de privacidad
> de {Marca}]

La hoja del paso 2 solo aparece si el proyecto elegido es de **otra** empresa.

## Qué se guarda

| Momento | Dónde | Qué |
| --- | --- | --- |
| Registro | `consultas.autorizacion` | `{"version": "registro-machea-v1", "texto": "...", "aceptada_en": "..."}` |
| Hablar con un asesor | `solicitudes_llamada` | `autoriza_compartir = true`, `version_autorizacion = "compartir-v1"` |

Cada cambio de texto sube la versión. El texto exacto de cada versión queda en este documento.

## Lo que hay que tener antes de encender la regla del proyecto

1. **`/privacidad/` publicada.** Hoy el enlace del login no lleva a nada. Hay que actualizar el borrador
   `design/login/POLITICA_PRIVACIDAD_BORRADOR.md`:
   - §4.1, punto 5, y §6: las constructoras e inmobiliarias como destinatarias, solo con esta autorización;
   - §3.2: lo que Machea guarda de cada empresa en su CRM;
   - §7: plazos de conservación, y qué pasa con los leads cuando una cuenta se cierra.
2. **Un acuerdo con cada empresa** (fuera del código): qué puede hacer con los leads, cómo atiende una solicitud de
   borrado y, en los formularios con marca, que Machea trata los datos por encargo suyo.
3. **El responsable.** Machea no está constituida: hay que decidir qué personas naturales figuran como
   responsables y con qué dirección y correo.
4. **Los leads anteriores** a esto no se comparten por el proyecto: su autorización no lo cubría.

## Ronda 3: decide Diego

1. **Texto del registro:** ¿A (corta, recomendada) o B (completa)?
2. **Compartir al pedir la llamada:** ¿obligatorio para que salga la llamada (recomendado: la llamada existe para
   conectar con la constructora), u opcional, con una llamada de Machea que no se comparte?
3. **Responsable y contacto:** ¿qué nombres figuran mientras Machea no esté constituida? ¿El correo de contacto es
   `equipo@machea.co`?
4. **Formularios con marca:** ¿se le pide a cada cliente el enlace a su política de privacidad?
5. **Revisión legal:** ¿quién la hace? Por defecto queda pendiente, y la regla del proyecto no se enciende sin ella.
