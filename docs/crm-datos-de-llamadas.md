# Llamadas de Manuela guardadas para el CRM

Fase 2 del CRM multiempresa (el plan está en `design/crm/PLAN.md`, rama `crm/multiempresa`). Hasta ahora un
lead no decía de qué formulario venía ni de quién era el proyecto, y el resultado de la llamada de Manuela vivía
solo en la memoria del backend. Desde esta fase:

| Qué | Dónde | Quién lo escribe |
| --- | --- | --- |
| Marca del formulario (`?marca=`) | `public.consultas.marca` | el formulario, con `guardar_consulta(p_marca)` |
| Autorización aceptada (fase 3) | `public.consultas.autorizacion` | el formulario, con `guardar_consulta(p_autorizacion)` |
| Cada llamada pedida, con el proyecto y su dueño | `public.solicitudes_llamada` | `POST /api/llamar` (`api/llamadas.py`) |
| Lo que Dapta manda al colgar | `public.resultados_llamada` | `POST /webhooks/dapta/resultado` |

- **El dueño del proyecto sale del catálogo del backend**, por `id_proyecto` (Compra, `proyectos_bogota.json`) o
  por `id_inmueble` (Arriendo, `inmuebles_arriendo_bogota.json`). Nunca sale de lo que diga el navegador.
- **Las demos con marca no se guardan**: es una empresa probando a Manuela con su número, no un interesado.
- **Guardar nunca rompe la llamada.** Va en segundo plano, después de que Dapta acepta; un error se registra en el
  log y la llamada sigue.
- **El resultado se une con su solicitud** por `external_lead_id` (`machea-<id de la solicitud>`), que Dapta
  devuelve en las variables de la llamada. Si no lo devuelve, se usa la última solicitud de ese teléfono de las
  6 horas anteriores.

## Puesta en marcha (Santiago o Felipe), en este orden

1. **Aplicar la migración** `supabase/migrations/20261018120000_llamadas_y_marca.sql` en `machea-leads`, ANTES
   de desplegar este código.
   - `guardar_consulta` gana dos parámetros opcionales, así que el formulario de hoy sigue funcionando.
   - Si el front nuevo llega antes que la migración, reintenta sin la marca y la consulta se guarda igual.
2. **Render (`machea-api`):**
   - `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` ya deberían estar, porque las usa Camila. Sin ellas, todo queda en
     memoria, como antes.
3. **El secreto del webhook de Manuela.** Hoy cualquiera puede mandarle un resultado falso. El orden evita cortar
   el resumen post-llamada:
   1. Generar 24 o más caracteres al azar.
   2. En el agente de Dapta de Manuela, cambiar el `webhook_url` a
      `https://machea-api.onrender.com/webhooks/dapta/resultado?k=<secreto>`. Mientras Render no tenga el
      secreto, el `k` se ignora.
   3. En Render, poner `MANUELA_WEBHOOK_SECRET=<secreto>`.

   Desde ese momento, un webhook sin `k` correcto responde 401, y los resultados se empiezan a guardar.
4. **Comprobar** con una llamada de prueba real que en `solicitudes_llamada` aparece la fila con `marca` y
   `dueno_slug`, y que, al colgar, en `resultados_llamada` aparece su `call_id` con `solicitud_id`.

Sin el paso 3, el webhook funciona como antes y no guarda nada en la base.

## Pruebas

`python -m unittest tests.test_llamadas -v` desde `backend/` (21 pruebas). La migración se probó en PostgreSQL 18
encima de las de leads:
- `guardar_consulta` con y sin `p_marca`;
- una marca rara o una autorización que no es un objeto se descartan;
- `anon` no puede leer ni escribir las tablas nuevas.
