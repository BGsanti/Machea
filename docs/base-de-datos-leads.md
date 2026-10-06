# Base de datos persistente de leads del formulario (`experiencia/`)

Proyecto de Supabase **dedicado exclusivamente a Machea** (no comparte base
con ningún otro producto del equipo), plan gratuito. Guarda quién llenó el
formulario, qué contestó, qué resultados vio, y si terminó interesado en un
proyecto — para que la misma persona que vuelve no tenga que repetir el
quiz, y para que quede un registro de intención de compra más allá de lo
que vive en memoria en `backend/api/app.py` (que se pierde al reiniciar el
servicio, ver su propio comentario `RESULTADOS_LLAMADAS`).

**Mismo criterio de seguridad que el resto del proyecto: sin login, pero
sin dejar datos al aire.** El formulario no tiene autenticación — cualquiera
lo llena desde el navegador con una clave pública — así que la base tiene
que quedar segura incluso asumiendo que esa clave se conoce. La solución no
es esconder la clave (no se puede, viaja al cliente): es que esa clave no
sirva para nada más que las 4 operaciones exactas que necesita el
formulario.

> **Estado al 2026-10-06: encendida en el Supabase de Machea (proyecto
> `machea-leads`), e identifica por teléfono + correo. Las secciones de abajo
> describen cómo se encendió; el texto que sigue es el estado previo.**
>
> *(Estado previo: apagada.)*
> El registro ya no pide la cédula (decisión de Diego), así que la
> migración [`20261006120000_leads_por_telefono_y_correo.sql`](../supabase/migrations/20261006120000_leads_por_telefono_y_correo.sql)
> reemplaza el esquema por cédula. La base nunca se encendió en el
> formulario: `js/datos.js` no se carga en `index.html` y `config.js` no
> tiene credenciales. Para encenderla, ver la sección 5.

## 1. Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Esquema | [`supabase/migrations/20260928184500_leads_consultas_intereses.sql`](../supabase/migrations/20260928184500_leads_consultas_intereses.sql) (por cédula, ya aplicada) y [`20261006120000_leads_por_telefono_y_correo.sql`](../supabase/migrations/20261006120000_leads_por_telefono_y_correo.sql) (la reemplaza; falta aplicarla) |
| El único módulo que habla con Supabase | [`frontend/public/experiencia/js/datos.js`](../frontend/public/experiencia/js/datos.js) |
| Credenciales (URL + clave publicable) | [`frontend/public/experiencia/js/config.js`](../frontend/public/experiencia/js/config.js) — campos `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| Dónde se engancha en el formulario | `js/main.js`: `BUSQUEDA_ACTIVA`, `iniciarQuizConBusqueda` / `restaurarConsultaGuardada`, `onRecoResuelta`, y los dos `if (window.GDF.datos) ...` dentro de `dispatch()` e `iniciarPolling()` |
| Identidad | El teléfono y el correo del registro (`state.telefono`, `state.correo`); `consultaId` en `createInitial()` de `js/state.js` |

## 2. Esquema

Tres tablas, sin nada más:

- **`leads`** — una fila por teléfono: correo, nombre y apellido. El
  correo se fija en la primera consulta y **ninguna** función lo
  sobreescribe: teléfono y correo tienen que coincidir para leer o escribir,
  así que nadie puede tocar el historial de otra persona sabiendo solo su
  número.
- **`consultas`** — una fila por cada vez que el quiz completo calculó
  resultados nuevos: `respuestas` (`state.answers`, jsonb) y `resultados`
  (`state.reco` — items, catálogo, si es aproximado —, jsonb).
- **`intereses`** — una fila por proyecto que alguien pidió llamar:
  `marcar_interes()` la crea al pedir la llamada (`intencion_compra` en
  falso); `marcar_intencion()` la actualiza cuando llega el resumen
  post-llamada de Dapta. `intencion_compra` queda en `true` **solo** si
  `fecha_seguimiento` trae un valor — es la señal de que Manuela agendó una
  cita real en la llamada, no solo que se pidió el contacto.

El teléfono se compara **siempre por sus dígitos**
(`regexp_replace(valor, '\D', '', 'g')`): `"300 123 4567"` y
`"3001234567"` son el mismo teléfono. El correo, sin espacios y en
minúscula. Se normalizan igual al guardarlos.

## 3. Por qué queda seguro sin login

- **RLS activado en las tres tablas, sin una sola política.** Postgres
  deniega por defecto todo lo que no tenga una política explícita — así
  que sin políticas, nadie entra directo.
- **`anon` y `authenticated` no tienen ningún privilegio sobre las tablas**
  (`REVOKE ALL`, y `ALTER DEFAULT PRIVILEGES` para que una tabla futura
  tampoco los herede por accidente).
- **El único acceso es a través de 4 funciones `SECURITY DEFINER`**, y son
  las únicas con `GRANT EXECUTE` a `anon`:
  - `guardar_consulta(nombre, apellido, correo, telefono, respuestas, resultados)`
    — si el teléfono ya existe con otro correo, no guarda nada.
  - `buscar_resultados(telefono, correo)` — exige los **dos** datos a la
    vez; si no coinciden (el teléfono no existe, o existe con otro correo)
    devuelve cero filas **en los dos casos por igual** — la respuesta nunca
    delata si un teléfono existe.
  - `marcar_interes(telefono, correo, proyecto, consulta_id)`
  - `marcar_intencion(telefono, correo, proyecto, fecha_seguimiento, temperatura)`

  Las cuatro comparan el par con `lead_coincide()`, que es interna: `anon`
  no la puede llamar.
  
  Una función `SECURITY DEFINER` corre con los privilegios de quien la
  creó, y el dueño de una tabla en Postgres siempre atraviesa su propio RLS
  — por eso no hacen falta políticas ni `FORCE ROW LEVEL SECURITY`: basta
  con que nadie más que estas 4 funciones tenga privilegios directos sobre
  las tablas.
- **`guardar_consulta()` nunca guarda un resultado vacío o de error** — lo
  rechaza con una excepción aunque el frontend ya filtre esto antes de
  llamarla (misma idea que "la base rechaza un `done` sin acta" en
  `Multi-Agents_System`: la última línea de defensa vive en la base, no
  solo en el cliente).

## 4. Cómo se engancha en el formulario

`js/datos.js` es el único archivo que llama a Supabase (vía PostgREST,
`POST .../rest/v1/rpc/<función>`, con la clave publicable en el header
`apikey`/`Authorization`). Tres reglas dictan cómo está escrito:

1. **Nunca la `service_role`** — solo la clave publicable/anon, la misma
   que puede viajar al navegador sin riesgo por todo lo de arriba.
2. **Nunca bloquea el formulario.** Cada llamado tiene un timeout de 4 s
   (`AbortController`) y siempre resuelve su callback una vez — con éxito,
   con "no encontrado", o con un motivo de error — nunca deja al llamador
   esperando para siempre. Sin `SUPABASE_URL`/`SUPABASE_ANON_KEY`
   configuradas, la app funciona exactamente igual que antes de este
   cambio: cada función resuelve de inmediato como "sin configurar".
3. **Es best-effort en las escrituras** — un fallo de red o de Supabase
   queda en consola (`console.warn`) y no interrumpe el quiz, la llamada de
   Manuela, ni el contrato con el modelo de recomendación.

Los 4 puntos de enganche, en el orden en que ocurren durante una visita:

1. **Antes de arrancar el quiz** (clic en "Empezar a construir"), solo si
   `BUSQUEDA_ACTIVA` está en true: `iniciarQuizConBusqueda()` en `main.js`
   llama a `buscarResultados`. Si
   hay match, `restaurarConsultaGuardada()` salta las 7 preguntas y pinta
   directo la pantalla de resultados con lo que se guardó la vez anterior.
   Sin match (o si Supabase no responde a tiempo), sigue el quiz normal.
2. **Al terminar el quiz** (`onRecoResuelta`, que reemplaza el callback que
   antes tenían `cargarRecomendaciones()` y `usarLocalAproximado()` por
   separado): si `resultado.estado === 'listo'` y trae al menos un
   proyecto, `guardarConsulta()` hace el upsert del lead y guarda la
   consulta. El `id` que devuelve queda en `state.consultaId`.
3. **Al pedir la llamada** (entrar a la pantalla `confirmacion`, mismo
   punto donde ya se disparaba `dispararLlamada()`): `marcarInteres()` crea
   la fila en `intereses` para el proyecto elegido.
4. **Cuando llega el resumen post-llamada de Dapta** (mismo punto donde
   `iniciarPolling()` ya marcaba `resumenListo`): `marcarIntencion()`
   actualiza esa fila con `fecha_de_seguimiento` y `temperatura_lead` del
   payload de `/api/llamar/resultado` (ver `backend/api/app.py`, el
   webhook `/webhooks/dapta/resultado`).

## 5. Encenderla

En este orden:

1. Aplicar `supabase/migrations/20261006120000_leads_por_telefono_y_correo.sql`
   en el proyecto de Supabase. Solo corre con las tablas vacías: si hay
   datos, se detiene sin tocar nada.
2. Llenar las credenciales en `js/config.js` (abajo).
3. Cargar `js/datos.js` en `experiencia/index.html`, antes de `main.js`.
4. Poner `BUSQUEDA_ACTIVA` en true en `js/main.js`.

Hoy solo Compra guarda consultas e intereses: Arriendo todavía no escribe
en la base.

En `js/config.js`, llenar `SUPABASE_URL` (la Project URL) y
`SUPABASE_ANON_KEY` (la clave publicable/`anon`, **nunca** la
`service_role`) del proyecto de Supabase. Si se dejan vacíos, el
formulario funciona igual — solo que sin recordar a nadie entre visitas ni
guardar intención de compra.
