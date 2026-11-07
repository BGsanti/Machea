# ¿Hay que inscribir las bases de datos en la SIC?

**Borrador para revisión legal.** Pedido de Juan F a Diego (2026-11-03), LG-5.

## Respuesta corta

**Hoy no.** El Registro Nacional de Bases de Datos (RNBD) de la Superintendencia de Industria y Comercio solo es
obligatorio para:

- **sociedades y entidades sin ánimo de lucro con activos totales de más de 100.000 UVT**, y
- personas jurídicas de naturaleza pública.

Las personas naturales y las sociedades con 100.000 UVT o menos quedaron por fuera (Decreto 090 de 2018, que
modificó el Decreto 1074 de 2015, art. 2.2.2.26.1.2).

Con la UVT de 2026 ($52.374, Resolución DIAN 000238 de 2025), el umbral son **$5.237.400.000 en activos**. Machea
está lejos de eso, y Ariel llegó a la misma conclusión (`design/login/REVISION_LEGAL.md`).

## Lo que sí hay que hacer, aunque no se inscriba

No inscribirse no quita ninguna obligación de la Ley 1581 de 2012:

- tener la política de tratamiento publicada (`design/login/POLITICA_PRIVACIDAD_BORRADOR.md`);
- pedir y guardar la prueba de la autorización;
- atender consultas en 10 días hábiles y reclamos en 15;
- tener contratos o DPA con los encargados (`design/login/MATRIZ_ROLES.md`);
- reportar los incidentes de seguridad a la SIC [VERIFICAR con el abogado: el plazo y el canal para quien no está
  inscrito en el RNBD].

## Cuándo volver a revisarlo

- **Cada año, al cerrar los estados financieros** de [RAZÓN SOCIAL]: si los activos totales pasan de 100.000 UVT
  del año, hay que inscribir las bases. [VERIFICAR con el abogado: el plazo para inscribirse después de pasar el
  umbral.]
- Si Machea pasa a ser parte de una entidad pública o a contratar con una de forma que la obligue.

## Bases que habría que inscribir si llegara el caso

Para tenerlo listo, son las de `design/login/MATRIZ_ROLES.md`, en las que Machea es responsable: interesados del
formulario, llamadas de Manuela, cuentas de empresas, prospectos de demos, contactos de Camila y registros de
seguridad. El CRM de cada empresa **no**: ahí el responsable es la empresa.

## Fuentes

- Decreto 090 de 2018 ([texto en Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=85039)).
- [Deloitte: Registro Nacional de Bases de Datos 2025](https://www2.deloitte.com/content/dam/Deloitte/co/Documents/legal/Registro-Nacional-de-Bases-de-Datos-2025.pdf).
- [UVT 2026: $52.374 (INCP)](https://incp.org.co/publicaciones/infoincp-publicaciones/impuestos/2025/12/dian-fijo-en-52-374-en-valor-de-la-uvt-para-el-ano-gravable-2026/).
