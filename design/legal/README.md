# Legal de Machea

Borradores para salir al mercado con clientes. Pedido de Juan F a Diego (2026-11-03), puntos LG-2 a LG-6 de
`design/crm/REQUERIMIENTOS_SALIDA_AL_MERCADO.md`. **Ninguno reemplaza al abogado:** todos se revisan antes de usarse.

| Documento | Qué resuelve | Estado |
| --- | --- | --- |
| [LLAMADAS_LEY_2300.md](LLAMADAS_LEY_2300.md) | Horarios, intentos, avisos y "no me llame más" para Manuela, Camila y WhatsApp | Borrador, y una lista de lo que falta construir |
| [RNBD_SIC.md](RNBD_SIC.md) | Si hay que inscribir las bases en la SIC | Respuesta: hoy no; revisar cada año |
| [TERMINOS_DE_SERVICIO_BORRADOR.md](TERMINOS_DE_SERVICIO_BORRADOR.md) | Condiciones generales para constructoras e inmobiliarias | Borrador |
| [CONTRATO_CLIENTE_BORRADOR.md](CONTRATO_CLIENTE_BORRADOR.md) | Orden de servicio por cliente y anexo de encargo de datos | Borrador |

La política de privacidad, el aviso provisional y los textos de autorización siguen en `design/login/`. La corrección
de la grabación de las llamadas va en el PR #43.

## Convenciones

- **[PENDIENTE]**: datos que todavía no existen, como la razón social, el NIT, la dirección o la región de un
  proveedor. Se llenan cuando exista la sociedad.
- **[DECIDIR]**: decisiones del equipo, sobre todo de precios, bolsas, soporte y plazos.
- **[VERIFICAR]**: puntos legales que tiene que confirmar el abogado.
- **Sin cifras de precios en este repo**, porque es público. Van solo en la copia firmada de cada cliente.

## Lo que hay que decidir como equipo antes de firmar con un cliente

1. Qué pasa cuando se acaba una bolsa: se cobra el excedente, se pausa o se avisa primero.
2. Si se cobra en dólares liquidados a la TRM o en pesos fijos.
3. Pilotos: duración, precio o gratuidad, y metas.
4. Soporte: canales, horario, tiempos de respuesta y horas incluidas.
5. Plazos: aviso de terminación, días para descargar los datos, aviso de incidentes, tope de responsabilidad.
6. Tope de intentos de llamada por solicitud (`LLAMADAS_LEY_2300.md`).

## Lo que hay que construir para cumplir lo que dicen estos textos

1. **Lista de exclusión** que consulten Manuela, Camila y el WhatsApp de seguimiento. Hoy Manuela registra "no me
   llamen más", pero ningún código lo usa, y el aviso publicado ya promete esa lista.
2. **Horario en `/api/llamar` y en `seguimiento.py`**: programar o aplazar lo que llegue fuera de horario.
3. **Tope de intentos** por día y por solicitud.
4. **Exportar a CSV** los datos de un cliente, para su salida.
5. **Borrado completo** de los datos de un cliente al terminar.
6. **Consulta del RNE** antes de cada campaña de Camila.
