# Procedimientos de datos personales (manual interno)

El manual interno que piden la Ley 1581 (art. 17, lit. k, y art. 18) y Ariel (mensaje 4, "conclusión práctica"). Es
para el equipo, no se publica. Lo aplica quien atienda el correo de privacidad ([PENDIENTE: persona responsable]).

## 1. Consultas y reclamos

| Paso | Qué hacer | Plazo |
| --- | --- | --- |
| 1 | Registrar la solicitud (fecha, canal, quién, qué pide) en [PENDIENTE: dónde: una hoja o una tabla] | El mismo día |
| 2 | Verificar la identidad: que el correo o el teléfono coincidan con el registro | Antes de entregar datos |
| 3 | Si un reclamo está incompleto, pedir lo que falta | Dentro de los 5 días siguientes |
| 4 | Si no es nuestro (por ejemplo, la base es de una constructora y Machea solo es su encargado), trasladarlo y avisarle al titular | 2 días hábiles |
| 5 | Mientras se resuelve un reclamo, marcar el dato como "reclamo en trámite" | Dentro de los 2 días hábiles |
| 6 | Responder una **consulta** | Máximo 10 días hábiles, prorrogables 5 avisando el motivo |
| 7 | Responder un **reclamo** | Máximo 15 días hábiles, prorrogables 8 avisando el motivo |
| 8 | Si en 2 meses no completan un reclamo incompleto, cerrarlo por desistimiento | — |

Normas: Ley 1581, arts. 14, 15 y 16; Decreto 1074 de 2015, art. 2.2.2.25.2.6 (revocatoria y supresión) y
art. 2.2.2.25.3.6 (procedimientos).

## 2. Borrar o revocar cuando el lead ya se compartió con una constructora

1. **Borrar o bloquear lo de Machea:**
   - en `public.leads`, `consultas`, `intereses`, `solicitudes_llamada` y `resultados_llamada`;
   - en el CRM de cada empresa, los candidatos que vienen de Machea (`crm.leads_machea`).
2. **Detener todo:** llamadas, WhatsApp, correos y campañas.
3. **Agregar el teléfono a la lista de "no contactar"**: solo el número, sin el resto.
4. **Ver a quién se compartió:** las filas de `crm.bandeja_leads` con su `telefono_digitos`.
5. **Avisar a cada constructora** que recibió el lead: que la persona revocó o pidió borrar, que no lo siga usando,
   que resuelva la solicitud sobre su propia base y que confirme qué hizo.
6. **Responder al titular**, con este modelo de Ariel:
   > Hemos suprimido o bloqueado sus datos en los sistemas de Machea y hemos detenido nuestras comunicaciones. Sus
   > datos fueron comunicados a {Constructora} como responsable independiente para atender su solicitud sobre
   > {Proyecto}. Hemos trasladado su solicitud a {Constructora}; también puede ejercer directamente sus derechos en
   > [contacto de la constructora].

## 3. Lista de "no contactar"

- **Qué guarda:** solo el número de quien pidió no ser llamado y la fecha. No sirve para publicidad ni para perfiles.
- **Dónde:** hoy `prospectos.estado = no_contactar` en Camila. [PENDIENTE: una lista única para Manuela, Camila y
  WhatsApp.]
- **Antes de cada campaña de Camila**, se cruza también con el Registro de Números Excluidos (RNE) de la CRC.

## 4. Conservación

Aplicar los plazos de la sección 7 de la política. **Se suspenden** mientras haya una consulta o un reclamo abierto,
una investigación de la SIC, un litigio, o haga falta guardar prueba para defenderse (Decreto 1074 de 2015,
art. 2.2.2.25.2.8).

Se guardan por separado:

- la base de leads;
- la lista de "no contactar";
- el registro de autorizaciones;
- los registros de seguridad;
- los expedientes de reclamos e incidentes.

## 5. Incidentes de seguridad

1. **Contener:** cerrar el acceso, cambiar claves y credenciales, y bloquear la cuenta o el proveedor afectado.
2. **Preservar evidencia:** logs, fechas y qué datos se vieron afectados.
3. **Reportar a la SIC** en el aplicativo de incidentes de su sitio (Delegatura para la Protección de Datos).
   - **Plazo:** 15 días hábiles desde que se detecta y se pone en conocimiento de quien lo atiende.
   - **Sin RUT ni NIT:** registrarse como "No tengo representación en Colombia ni RUT".
4. **Avisar a los titulares** si el riesgo para ellos es significativo: qué pasó, qué datos, cuándo, qué se hizo y qué
   deben hacer.
5. **Avisar a la constructora** si la base afectada era suya (Machea como encargado).
6. **Exigir el reporte** a los proveedores involucrados.
7. **Documentar** todo el análisis.

Normas: Ley 1581, art. 17, lit. n, y art. 18, lit. k; Circular Única de la SIC.

## 6. Menores de edad

- **Si en el formulario alguien responde que tiene menos de 18 años:**
  - no se llama;
  - no se comparte con ninguna constructora;
  - no se usa para publicidad ni para perfiles;
  - se muestra: "Este servicio está dirigido a personas mayores de edad".
- **Sus datos se borran**, salvo que haya un motivo legítimo, la autorización del representante legal y se haya
  escuchado al menor (Ley 1581, art. 7; Decreto 1074 de 2015, art. 2.2.2.25.2.9).
- [PENDIENTE: el cambio en el formulario.]

## 7. Datos anonimizados

- **Quitar nombre, correo y teléfono no basta.** Tampoco pueden quedar:
  - combinaciones raras (edad, ingresos y zona);
  - transcripciones;
  - identificadores técnicos;
  - grupos chicos donde se distinga a alguien;
  - claves que permitan volver al titular (eso es seudonimizar, no anonimizar).
- **Datos de los formularios que Machea opera como encargado:** no se usan ni anonimizados sin que el contrato con la
  empresa lo permita.
