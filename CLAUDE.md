# Machea — guía técnica

Recomendador de proyectos de vivienda en Bogotá D.C. Recibe el formulario de
un usuario y devuelve los 18 proyectos más compatibles (`TOP_N`), cada uno
con un porcentaje de compatibilidad listo para mostrar.

Hoy el repo tiene tres capas: el **motor** (Python), una **capa HTTP**
(`api.py`, FastAPI) y la **landing** de GO FEST (`web/`, React + Vite) que
consume el motor en vivo y puede disparar la llamada de Manuela.

Este documento describe el contrato de datos, el grafo de proximidad entre
localidades, la resolución de localidad por dirección, la API y la landing.
Para correr el proyecto, ver [README.md](README.md); para el formulario
mínimo que espera el modelo, [CONTRATO_FRONT.md](CONTRATO_FRONT.md).

---

## 1. Arquitectura en una página

```
                    proyectos_bogota.json          usuario_ejemplo.json
                    (scraper_projects.py)          (formulario web)
                              |                             |
                              v                             |
                          prep.py                           |
                  etiqueta el perfil objetivo               |
                  de cada proyecto                          |
                              |                             |
                    proyectos_model.json                    v
                              |                    leer_info_user()
                              |                             |
                              |          +------------------+------------------+
                              |          |                  |                  |
                              |    usuario_modelo   usuario_segmentado   info_contacto
                              |    (3 features)     (4 llaves duras)     (no entra al modelo)
                              |          |                  |
                              +----------|------------------+
                                         |
                                   primer_filtro()
                              filtro duro + BFS sobre el
                              grafo de localidades
                                         |
                              proyectos_preseleccionados (>= 10)
                                         |
                                     modelo()
                          NearestNeighbors contenido + colaborativo
                                         |
                            proyectos_seleccionados (Top TOP_N)
                                         |
                                  post_arreglos()
                          score -> porcentaje de compatibilidad
                                         |
                            proyectos_listos_llamativos.json
```

Y la capa que lo expone al mundo:

```
   web/ (React + Vite)                       api.py (FastAPI, :8000)
   ------------------                        -----------------------
   LiveDemo.tsx  --- POST /api/recomendar -->  recomendar() + respuesta_json()
   Navbar/Hero   --- GET  /api/catalogos  -->  catalogos.py (ids canónicos)
   LiveDemo.tsx  --- POST /api/llamar     -->  payload de 19 campos
                                                        |
                                                        v
                                          DAPTA_FLOW_WEBHOOK_URL
                                          (flow de voz de Manuela)
```

| Archivo | Responsabilidad |
|---|---|
| `catalogos.py` | Vocabularios canónicos y el grafo urbano. **Única fuente de verdad** de los ids. |
| `scraper_projects.py` | Construye el catálogo desde 4 constructoras, asigna localidad y baja imágenes. |
| `prep.py` | Convierte el catálogo crudo en `proyectos_model.json` con el perfil objetivo de cada proyecto. |
| `modelo.py` | Las cuatro etapas del recomendador. |
| `main.py` | Encadena las etapas y expone `recomendar()`, el punto de entrada del front. |
| `api.py` | Wrapper HTTP (FastAPI) sobre `recomendar()`. Tres endpoints + el disparo a Dapta (§5.2). |
| `web/` | La landing de GO FEST: React 19 + Vite + Tailwind v4 (§8). |
| `generar_historial.py` | Convierte los clientes simulados en el historial de interacciones. |
| `simulacion/arquetipos.py` | Los 10 arquetipos de comprador. |
| `simulacion/generar_clientes.py` | 100 variaciones por arquetipo → 1.000 clientes. |
| `simulacion/evaluar.py` | Mide el recall del top con y sin historial contra clientes no vistos. |

El entrenamiento entra por la izquierda del diagrama:

```
simulacion/arquetipos.py ──▶ generar_clientes.py ──▶ clientes_simulados.json
                                                            |
                                                   generar_historial.py
                                                            |
                                                 historial_simulado.json ──▶ modelo()
```

---

## 2. El contrato JSON

Usuario y proyecto comparten estructura a propósito: el modelo compara campo
a campo, así que las dos mitades del cruce tienen que hablar el mismo idioma.

### 2.1 Campos

| Campo | Tipo | Dominio | Lo aporta |
|---|---|---|---|
| `id_proyecto` | `int` | 1 … N, consecutivo | proyecto |
| `nombres` | `string` | libre | usuario |
| `apellidos` | `string` | libre | usuario |
| `correo` | `string` | libre | usuario |
| `telefono` | `int` | libre | usuario |
| `afiliado` | `bool` | `0` no · `1` sí | usuario |
| `tipo_vivienda` | `bool` | `0` No VIS · `1` VIS | **ambos** |
| `salario` | `int` | `1` ≤2 SMMLV · `2` 2–4 · `3` 4–8 · `4` >8 | **ambos** |
| `personas_a_cargo` | `int` | `1`–`4`, donde `4` es "4 o más" | **ambos** |
| `edad` | `int` | 18–125 | **ambos** |
| `Localidad` | `int` | `1`–`20`, sin ceros a la izquierda | **ambos** |
| `numero_habitaciones` | `int` | `1`–`3`, donde `3` es "3 o más" | **ambos** |
| `piso` | `int` | `0` bajo · `1` medio · `3` alto · `4` sin preferencia | usuario |
| `zonas_comunes` | `string[]` | vocabulario de 25 (§2.3) | **ambos** |
| `link_proyecto` | `string` | URL de la ficha oficial | proyecto |

**"Ambos" es la clave del diseño.** En el JSON del usuario esos campos son la
*preferencia declarada*; en el del proyecto son el *perfil objetivo*, es decir
el comprador al que apunta. `salario`, `personas_a_cargo` y `edad` no se leen
de la web de la constructora —ninguna los publica— sino que los **deriva
`prep.py`** del precio, el área y las amenidades (§4.1). El scraper los deja
en `null` y `prep.py` los llena.

Los campos que solo puede aportar la persona (`nombres`, `apellidos`, `correo`,
`telefono`, `afiliado`) salen en `null` en el JSON del proyecto. Se emiten
igual, y en el mismo orden, para que las dos estructuras sean idénticas.

### 2.2 Campos extra del proyecto

El formulario no contempla precio ni dirección, pero el modelo los necesita.
Van después del contrato, agrupados aparte:

| Campo | Para qué |
|---|---|
| `nombre_proyecto` | Identificación legible. |
| `constructora` | `amarilo` · `cusezar` · `bolivar` · `colsubsidio`. |
| `direccion` | Entrada de la resolución de localidad (§6). |
| `precio_desde_cop` | `prep.py` deriva de aquí `salario` objetivo. |
| `area_desde_m2` | Alimenta `precio_por_m2` y el segmento de precio. |
| `lat` / `lon` | Respaldo de localidad. `null` en Cusezar, que no las publica. |
| `imagenes_origen` | URLs de las que salen `imagenes_proyectos/<id>/`. |
| `zonas_comunes_idx` | Los mismos nombres como índices 0–24, listos para el vector binario. |
| `zonas_comunes_no_mapeadas` | Amenidades que no encajan en las 25. **No se fuerzan**: se reportan. |
| `tipo_vivienda_publicado` | El texto original (`TOPE VIS`, `VIP`, `No aplica`…) antes de codificar. |
| `constructoras` / `links_alternos` | Solo en los 6 proyectos que publican dos constructoras (§7). |
| `localidad_nombre` | Nombre oficial, para que el JSON se lea sin tabla al lado. |
| `_localidad_confianza` | `alta` · `media` · `baja` (§6.2). |
| `_localidad_evidencia` | Qué dato disparó la asignación. Permite auditar el catálogo. |

### 2.3 Vocabulario de zonas comunes

25 posiciones, el índice **es** el identificador. Viven en
`catalogos.ZONAS_COMUNES` y viajan como vector binario de 25 al modelo.

```
 0 Lobby                6 Locales comerciales  12 Coworking       18 Parque
 1 Piscina              7 Zona fitness         13 Sala VIP        19 Sala de juegos
 2 Zona de lavandería   8 Salón social         14 Zona café       20 Pista de trote
 3 Zona BBQ             9 Spa mascotas         15 Gimnasio        21 Voleibol playa
 4 Zona pet            10 Zona cool            16 Parqueadero     22 Cancha de pádel
 5 Zona kids           11 Zona cine            17 Zona verde      23 Taller de bicicletas
                                                                  24 Sauna
```

Cada web usa sus propias etiquetas ("Terraza BBQ", "Gimnasio semidotado",
"Social kitchen"). `scraper_projects.mapear_zonas_comunes` las traduce con una
tabla de alias **explícita**. Nada de coincidencias difusas: una amenidad
desconocida ("Chute de basura", "Ascensores", "Administración") va a
`zonas_comunes_no_mapeadas` en vez de asignarse a una categoría que no le
corresponde.

### 2.4 Ejemplo

Proyecto:

```json
{
  "id_proyecto": 61,
  "nombres": null, "apellidos": null, "correo": null,
  "telefono": null, "afiliado": null,
  "tipo_vivienda": 1,
  "salario": null, "personas_a_cargo": null, "edad": null,
  "Localidad": 7,
  "numero_habitaciones": 3,
  "piso": 4,
  "zonas_comunes": ["Lobby", "Piscina", "Zona de lavandería", "Zona BBQ"],
  "link_proyecto": "https://www.colsubsidio.com/vivienda/proyectos/bogota/acanto",

  "nombre_proyecto": "Acanto",
  "constructora": "colsubsidio",
  "direccion": "Carrera 95A # 78 Sur, Bosa Recreo",
  "precio_desde_cop": 231290000,
  "area_desde_m2": 50.6,
  "aplica_subsidio_caja": true,
  "localidad_nombre": "Bosa",
  "_localidad_confianza": "alta",
  "_localidad_evidencia": "nombre de localidad en la direccion: Bosa"
}
```

Los ids son consecutivos desde 1 y se asignan **después** de resolver la
localidad, ordenando por constructora y nombre: dos corridas seguidas dan los
mismos ids mientras el catálogo publicado no cambie. Cambian, eso sí, cuando
una constructora publica o retira un proyecto — y las carpetas de
`imagenes_proyectos/` se renumeran con ellos.

Usuario: mismas 15 llaves, con los campos de persona llenos y los de proyecto
en su lugar (`usuario_ejemplo.json`).

### 2.5 Notas sobre `piso`

`piso` es una preferencia del comprador. Un proyecto no tiene *un* piso, tiene
torres de muchos, así que el scraper emite siempre `4` (sin preferencia), el
mismo valor neutro que `modelo.py` asume cuando el dato falta. Hoy el campo se
captura pero no filtra nada: ninguna constructora publica el piso por unidad.

---

## 3. El grafo de proximidad entre localidades

### 3.1 Qué es

`catalogos.py` define un grafo **no dirigido, no ponderado y conexo**
`G = (V, E)` donde:

- **V** = las 20 localidades de Bogotá D.C., con su id oficial 1–20.
- **E** = 43 aristas, una por cada par de localidades que **colindan**.
- **W** = todas las aristas pesan 1 (`PESO_ARISTA`). La distancia entre dos
  localidades es el número mínimo de fronteras que hay que cruzar.

```
V = 20 nodos · E = 43 aristas · diámetro = 5 · radio = 3
grado máximo: Teusaquillo (7)      grado mínimo: Usaquén, Bosa, Sumapaz (2)
centro del grafo: Fontibón y Puente Aranda (excentricidad 3)
```

### 3.2 Cómo se construye

La adyacencia se declara a mano en `_ADYACENCIA_DECLARADA` y luego
`_construir_grafo` la **simetriza**: por cada `a → b` declarada se agrega
también `b → a`. Así el grafo queda no dirigido aunque la declaración tenga
omisiones, que es exactamente el tipo de error que se cuela al transcribir 20
listas de vecinos a mano.

```python
GRAFO_LOCALIDADES = {1: [2, 11], 2: [1, 3, 12, 13], ...}   # dict{id: [ids]}
```

### 3.3 Para qué sirve

Para **expandir la búsqueda hacia afuera** cuando en la localidad pedida no
hay suficientes proyectos. `primer_filtro` recorre el grafo por niveles con un
BFS desde la localidad del usuario y va sumando candidatos hasta llegar al
mínimo de 10.

Al pesar todas las aristas 1, el número de saltos del BFS **es** la distancia
mínima del grafo, así que no hace falta Dijkstra.

```
BFS desde Fontibón (9):
  d=0  Fontibón
  d=1  Kennedy · Engativá · Teusaquillo · Puente Aranda
  d=2  Chapinero · Santa Fe · Tunjuelito · Bosa · Suba · Barrios Unidos ·
       Los Mártires · Antonio Nariño · Ciudad Bolívar
  d=3  Usaquén · San Cristóbal · Usme · La Candelaria · Rafael Uribe · Sumapaz
```

**Un nivel se completa antes de decidir si hace falta seguir.** Si al terminar
`d=1` ya hay 10 candidatos, no se entra a `d=2`; pero nunca se corta a la
mitad de un nivel, porque todas las localidades de un mismo nivel están
igual de cerca y partirlas sería un desempate arbitrario.

### 3.4 API

| Función | Devuelve |
|---|---|
| `localidades_por_distancia(origen, max=None)` | `dict{distancia: [ids]}`, BFS por niveles. |
| `orden_expansion(origen, max=None)` | `[(id, distancia), ...]` plano, ordenado por cercanía. |
| `distancia_localidades(a, b)` | Saltos mínimos entre dos localidades. |

El BFS está cacheado con `lru_cache` sobre una estructura inmutable —el grafo
no cambia— pero `localidades_por_distancia` devuelve una copia mutable nueva
en cada llamada: se cachea el cálculo, no el resultado compartido.

### 3.5 Cómo entra al score

La distancia del grafo aparece dos veces, con papeles distintos:

1. **Como criterio de admisión** en `primer_filtro`: define el orden en que
   entran los candidatos.
2. **Como penalización** en el score final:
   `score_localidad = max(0, 1 − 0.25 × distancia)`.
   Misma localidad → 1.0 · vecina → 0.75 · a dos saltos → 0.5 · a cuatro → 0.0.

Ese componente pesa `0.10` del score (§4.3). Un proyecto en localidad vecina
**no** queda marcado como "relajado" (`_nivel_relajacion = 1`, pero
`_prioridad_filtro = 0`): ya paga su distancia en el score, castigarlo dos
veces lo hundiría injustamente.

---

## 4. El modelo de clustering

### 4.1 `prep.py` — etiquetar el perfil objetivo

Lleva cada proyecto al mismo espacio de features que el usuario:

```
perfil_vector = [salario_objetivo, personas_objetivo, edad_objetivo]
```

**`salario_objetivo`** sale de una simulación de crédito, no del precio a secas:

| Supuesto | Valor |
|---|---|
| SMMLV | $2.000.000 (2026 — actualizar cada año) |
| Cuota inicial | 30 % del precio |
| Plazo | 240 meses (20 años) |
| Tasa | 1 % mensual (≈12,7 % E.A.) |
| Capacidad de endeudamiento | la cuota ≤ 30 % del ingreso |
| Subsidio VIS con caja | 30 SMMLV |

Con eso se calcula la cuota mensual, de ahí el ingreso requerido, y ese
ingreso se corta en los tramos del formulario (`TOPES_SALARIO_SMMLV = [2,4,8]`).
Se guarda también `salario_objetivo_con_subsidio`, que es el mismo cálculo
descontando el subsidio: un proyecto VIS puede bajar un tramo entero.

**`personas_objetivo`** sale de las habitaciones. **`edad_objetivo`** sale del
`perfil_amenidades`: las 25 zonas comunes se agrupan en cuatro perfiles
(`familiar`, `joven_profesional`, `bienestar`, `practico`) y el dominante
sugiere la edad del comprador al que apunta el proyecto.

### 4.2 `primer_filtro` — el filtro duro

Criterio base, coincidencia exacta:

- mismo `tipo_vivienda`
- al menos las `numero_habitaciones` pedidas (`>=`, porque `3` es "3 o más")
- misma `Localidad`
- al menos 1 coincidencia en las zonas comunes pedidas

**Un dato que la fuente no publica no es un incumplimiento.** Cinco proyectos
del catálogo no listan habitaciones y tres no listan zonas comunes. Tratar ese
vacío como un "no cumple" los volvía **inalcanzables**: 7 de los 102 no
aparecían jamás en un Top 6, por un hueco de la web de la constructora y no
por su ficha. Ahora entran, se marcan en `_dato_incompleto` y el score les
descuenta `PENALIZACION_DATO_INCOMPLETO` (0,05) por campo faltante, para que
no le ganen a una ficha completa que sí demostró cumplir. La cobertura del
catálogo pasó de **93 % a 100 %**.

Cuando el proyecto no publica amenidades, `_cobertura_zonas` no vale 0 —eso
afirmaría que no tiene ninguna— sino `COBERTURA_ZONAS_SIN_DATO` (0,35):
deliberadamente por debajo de una coincidencia parcial real.

Si salen menos de `MINIMO_PRESELECCIONADOS = 30`, se relaja en dos ejes, en
este orden:

1. **Geográfico primero**: BFS sobre el grafo (§3.3), completando cada nivel.
2. **Escalera `PASOS_RELAJACION`**, solo si recorrer todo el grafo no alcanzó:

| Paso | Zonas | Habitaciones | `_nivel_relajacion` |
|---|---|---|---|
| 1 | exige | exige | 0 (o 1 si es localidad vecina) |
| 2 | suelta | exige | 2 |
| 3 | suelta | suelta | 3 |

**`tipo_vivienda` no se relaja nunca.** VIS y No VIS son categorías legales y
financieras distintas, no una preferencia: cambiarla cambia si el usuario
puede o no acceder al subsidio.

Las habitaciones se sueltan de últimas porque son el requisito más duro de una
búsqueda de vivienda.

### 4.3 `modelo` — Nearest Neighbors en dos modos

**Contenido (siempre activo).** Se ajusta un `NearestNeighbors` euclidiano
sobre el `perfil_vector` de los preseleccionados y se consulta con el vector
del usuario. Las tres features se escalan a [0,1] con **rangos de dominio
fijos**, no con un scaler ajustado a los candidatos: con 10 candidatos un
scaler empírico sería inestable y cambiaría de escala en cada consulta.

| Feature | Rango | Peso |
|---|---|---|
| `salario` | 1–4 | **0,50** |
| `personas_a_cargo` | 1–4 | 0,30 |
| `edad` | 18–75 | 0,20 |

La capacidad de pago manda: es lo que decide si la compra es viable.

**Colaborativo (si hay `historial_simulado.json`).** Segundo
`NearestNeighbors`, esta vez sobre los vectores de usuarios históricos. Se
buscan los K más parecidos al usuario actual y se acumulan sus interacciones
por proyecto, ponderadas por cercanía (`peso = 1 / (1 + distancia)`). **Este
es el componente que forma los clústeres**: los vecinos en el espacio
demográfico definen el grupo cuyo comportamiento se extrapola.

**K se cuenta en perfiles, no en registros.** Es la corrección más importante
del modelo. El historial repite a la misma persona en cada evento que vive, y
el vector del modelo son solo tres features, así que clientes distintos
colapsan además en el mismo punto: 8.710 registros caen sobre **453 perfiles
distintos**, 19 registros por perfil. El K anterior, tope 200, consultaba unos
10 perfiles y se quedaba corto — tanto que el colaborativo rendía *por debajo*
del contenido solo.

Ahora `K = PERFILES_A_CONSULTAR × (registros por perfil)`, donde el factor de
repetición se mide del propio historial, así que se reajusta solo si cambia la
simulación. Con 30 perfiles objetivo da K ≈ 577. Medido sobre 600 clientes de
prueba no vistos (`simulacion/evaluar.py`):

| K | 200 | 450 | **600** | 900 |
|---|---:|---:|---:|---:|
| recall@6 | 68,8 % | 75,5 % | **77,3 %** | 76,5 % |

El óptimo es un plateau ancho entre 520 y 820. Por debajo el vecindario es
demasiado pequeño para promediar; por encima la personalización se diluye
hasta degenerar en popularidad global.

**Mezcla:**

```
score_modelo = 0.50 · colaborativo + 0.50 · contenido      (si hay historial)
score_modelo = contenido                                    (si no)

score = 0.70 · score_modelo
      + 0.20 · score_zonas        (cobertura de las amenidades pedidas)
      + 0.10 · score_localidad    (max(0, 1 − 0.25 · distancia del grafo))

score -= 0.05 · (campos que el proyecto no publica)
```

`ALPHA_HISTORIAL` bajó de 0,60 a 0,50: medido sobre los mismos 600 clientes,
0,4 y 0,5 empatan en 77,7 % y de ahí hacia arriba baja de forma sostenida
(0,6 → 77,3 %, 0,9 → 75,7 %). El colaborativo aporta, pero no debe tapar al de
contenido, que es el que sostiene a los proyectos con pocas interacciones —el
arranque en frío—.

**Subsidio.** Un afiliado a la caja que busca VIS accede al subsidio, y eso
baja el ingreso que el proyecto le exige: se compara contra
`salario_objetivo_con_subsidio`. Hasta ahora `afiliado` se capturaba en el
formulario y no se usaba para nada.

**El score ordena dentro de cada tramo de prioridad, nunca entre tramos.** Lo
que cumple todos los requisitos va primero; lo admitido relajando zonas o
habitaciones va después, por mucho score que saque. Devuelve el Top `TOP_N`.

**`TOP_N = 18`, y `MINIMO_PRESELECCIONADOS` tiene que seguir por encima.** Si
el filtro entregara exactamente 18 candidatos, el Nearest Neighbors no
elegiría nada —devolvería el filtro entero— y el score dejaría de ordenar; por
eso el mínimo es 30, ~1,7× el tamaño del top, la misma proporción que había
con Top 6. `recomendar()` además pide `max(MINIMO_PRESELECCIONADOS, top_n)`,
para que un `--top` grande no devuelva una lista corta. El techo real es el
tipo de vivienda, que nunca se relaja: 58 proyectos VIS y 38 No VIS.

### 4.4 `post_arreglos` — el porcentaje comercial

El score crudo (0,68) no se le muestra a nadie. Se convierte en porcentaje de
compatibilidad en **dos capas**, y el orden entre ellas importa.

**Capa 1 — normalización encadenada.** El primero muestra su propio score como
porcentaje, elevado a `PORCENTAJE_TOP_MINIMO = 85` si se queda corto: quien
abre la lista es lo mejor que hay para esa persona y no puede presentarse con
un 60 %. De ahí hacia abajo, cada proyecto resta **los puntos de score que lo
separan del inmediatamente anterior**, no del líder:

```
pct[1] = max(score[1] × 100, 85)
pct[i] = pct[i-1] − (score[i-1] − score[i]) × 100
```

Como la cadena arranca en el score del líder, el resultado es que **el
porcentaje de cada uno es su propio score**, desplazado por lo que se haya
elevado el líder. La resta se acota en 0: un proyecto admitido relajando
requisitos puede traer score bruto mayor y aun así ir detrás (invariante 4),
y ahí el porcentaje se queda quieto en vez de subir.

**En caída libre, sin piso.** Sobre el catálogo actual el último de los 18
aterriza entre 2 % y 64 %, con mediana 45 %. Comprimir la escala para que no
baje tanto obligaría a mentir sobre el encaje del final de la lista; un 27 %
dice la verdad y sigue siendo información útil.

**Capa 2 — el empate lo rompe el precio.** La capa 1 produce empates *a
propósito*: dos scores parecidos redondean al mismo número. Y ningún proyecto
puede mostrar el mismo porcentaje que otro —dos 84 % dejan al usuario sin
criterio para elegir—. Entre los empatados se queda con el número alto **el
más barato**: entre dos que el modelo ve igual de compatibles, la vivienda más
barata es la mejor oferta. El resto baja de a un punto (`PASO_MINIMO = 1`).

```
85 · 84 · 84   ->   85 · 84 · 83
                         ^    ^
                         |    el otro
                         el más barato de los dos empatados
```

`_desempatar_por_precio` reordena solo **dentro del mismo tramo de
`_prioridad_filtro`**: un proyecto admitido relajando requisitos no adelanta a
uno que cumple todo por ser más barato (invariante 4). Un proyecto que no
publica precio se va al final de su grupo de empate, no al principio: sin
precio no puede reclamar ser la mejor oferta.

El último puesto tiene reservado un punto por cada uno de los que van detrás
suyo, de modo que el de más abajo pueda aterrizar en 0 sin que dos choquen
contra el suelo y terminen mostrando el mismo número. Es una garantía
mecánica de que no haya repetidos, no un piso comercial.

**`post_arreglos` ya no tiene nada aleatorio.** El parámetro `semilla` se
sigue aceptando por compatibilidad con la CLI y con `recomendar()`, pero no
hace nada: el mismo formulario da siempre el mismo porcentaje.

---

### 4.5 Entrenamiento: la base de clientes simulados

No hay interacciones reales, así que se fabrican. La forma de fabricarlas
importa: el colaborativo busca **usuarios parecidos entre sí**, y si cada
perfil se muestrea campo a campo de forma independiente no hay nadie a quien
parecerse.

```
10 arquetipos ──100 variaciones──▶ 1.000 clientes ──8 eventos──▶ 8.000 interacciones
```

Los arquetipos (`simulacion/arquetipos.py`) son tipos de comprador reales
—joven profesional, familia numerosa con subsidio, inversionista, nido
vacío…— con su rango de edad, capacidad de pago, dónde buscan y qué
amenidades les importan. Cada uno produce 100 variaciones que se dejan
**derivar** a propósito (12 % busca fuera de su localidad, 15 % se corre un
tramo de ingreso, 20 % olvida una amenidad característica): sin esa deriva
serían 100 copias y el modelo vería 10 puntos en vez de 1.000.

Los clientes salen **en el mismo contrato JSON que manda el front**, así que
sirven también de banco de pruebas: se le pasan tal cual a `recomendar()`.

Cada cliente vive 8 eventos (`vista` 0.2 · `lead` 0.6 · `compra` 1.0),
elegidos con un softmax sobre una utilidad que mezcla afinidad de perfil,
cobertura de zonas, cercanía, capacidad de pago y un **atractivo latente** por
proyecto. Ese atractivo es la pieza clave: representa lo que las etiquetas de
`prep.py` no capturan y **solo el historial puede revelar**. Son 8.000
registros de los arquetipos más ~600 de relleno, porque hay un piso de 30
interacciones por proyecto: sin él un proyecto nunca aparecería por la vía
colaborativa.

Detalle completo en [simulacion/README.md](simulacion/README.md).

### 4.6 Evaluación

`simulacion/evaluar.py` responde si el historial está sirviendo de algo.
Genera clientes con **otra semilla** —el modelo nunca los vio—, les hace
comprar con la misma utilidad que produjo el historial, y compara el Top 6 de
los dos modos. Como el atractivo latente es lo único que los separa, la
diferencia **es** lo que aporta el historial:

```
recall@6 solo contenido      :  69.3%
recall@6 con historial       :  77.5%
mejora que aporta el historial:  +8.2 puntos
posición media del acierto   :   2.68
```

Es la misma evaluación que destapó el K mal calibrado (§4.3). Conviene
correrla después de cada cambio del catálogo o de la simulación: si la mejora
se vuelve negativa, el historial está desactualizado.

**La ventana del recall está fijada en 6 y no sigue a `TOP_N`.**
`TOP_N_EVALUACION = 6` vive en `evaluar.py` a propósito: los números que
calibraron `K_VECINOS` y `ALPHA_HISTORIAL` se midieron sobre 6 posiciones, y
si la ventana se moviera con el producto dejarían de ser comparables. Para
medir la lista que se entrega hoy, `--top 18`.

**Cuidado al comparar entre configuraciones distintas:** la evaluación sortea
la compra *dentro del pool de candidatos*, así que un pool más grande hace la
tarea más difícil por construcción y los recalls de dos pools distintos no se
pueden poner lado a lado. Lo comparable es la proporción entregada. Medido
sobre 300 clientes de prueba:

| Configuración | Entregado | recall contenido | con historial |
|---|---|---:|---:|
| Top 6 sobre pool ≥10 (antes) | 60 % del pool | 67,3 % | 73,0 % |
| **Top 18 sobre pool ≥30 (hoy)** | **60 % del pool** | **70,7 %** | **72,7 %** |
| Top 18 sobre pool ≥24 | 75 % del pool | 81,7 % | 84,7 % |
| Top 18 sobre pool ≥18 | 100 % del pool | 87,7 % | 90,0 % |

Las dos últimas filas suben porque se entrega casi todo lo que pasó el filtro:
el modelo deja de elegir y solo ordena. Por eso el mínimo se dejó en 30, que
mantiene la misma proporción de siempre y conserva la selección.

---

## 5. Integración con el front

### 5.1 En proceso: `main.recomendar()`

`main.recomendar()` es el punto de entrada. Acepta el payload **como dict**,
sin pasar por disco:

```python
from main import recomendar, respuesta_json

payload = {                       # las 15 llaves del formulario (§2.1)
    "nombres": "Ana", "apellidos": "Torres", "correo": "ana@ejemplo.com",
    "telefono": 3009998877, "afiliado": 1,
    "tipo_vivienda": 1, "salario": 2, "personas_a_cargo": 3, "edad": 34,
    "Localidad": 7, "numero_habitaciones": 3, "piso": 1,
    "zonas_comunes": ["Lobby", "Zona kids", "Parque", "Salón social", "Gimnasio"],
}

resultado = recomendar(payload, ruta_salida=None, verbose=False)
payload_respuesta = respuesta_json(resultado, ruta_salida=None)
```

También acepta un string JSON o una ruta a archivo, para la CLI.

`respuesta_json()` devuelve solo lo que necesita la vista, sin la metadata
interna del pipeline:

```json
{
  "generado_en": "2026-08-26T...",
  "motor": "colaborativo+contenido",
  "total_preseleccionados": 14,
  "usuario": {
    "nombre_completo": "Ana Torres", "correo": "...", "telefono": ..., "afiliado": true,
    "perfil": {"salario": 2, "personas_a_cargo": 3, "edad": 34},
    "busqueda": {"tipo_vivienda": "VIS", "localidad": "Bosa", "numero_habitaciones": 3,
                 "piso": "medio", "zonas_comunes": ["Lobby", "Zona kids", ...]}
  },
  "apartamentos": [
    {"posicion": 1, "compatibilidad": 98, "compatibilidad_texto": "98%",
     "id_proyecto": 93, "nombre_proyecto": "La Gratitud I de la Marlene",
     "tipo_vivienda": "VIS", "localidad": "Bosa", "direccion": "...",
     "precio_desde_cop": 231000000, "area_construida_m2": 44.0, "habitaciones": 3,
     "cumple_habitaciones": true, "aplica_subsidio_caja": true,
     "cuota_mensual_estimada_cop": ..., "ingreso_requerido_smmlv": ...,
     "zonas_comunes": [...], "zonas_en_comun": [...],
     "url_ficha": "https://...", "score": 0.87}
  ]
}
```

Validación: `leer_info_user` levanta `ValueError` con **todos** los errores del
formulario juntos, no el primero que encuentra, para que el front pueda
marcarlos todos de una vez.

Las zonas comunes que el front mande y no estén en el vocabulario de 25 no
rompen nada: viajan en `usuario_info_contacto_v1["zonas_comunes_no_reconocidas"]`.

### 5.2 Por HTTP: `api.py`

`api.py` es un wrapper **delgado** de FastAPI sobre `recomendar()`. Es lo que
consume la landing (§8). No tiene lógica de recomendación propia: valida con
Pydantic, llama al pipeline y devuelve `respuesta_json()`.

```bash
uvicorn api:app --reload --port 8000     # desde la raíz del repo
```

| Endpoint | Qué hace |
|---|---|
| `GET /api/health` | Latido. Lo usa el front para saber si el motor está encendido antes de que el usuario llene nada. |
| `GET /api/catalogos` | Las 20 localidades con su id y las 25 zonas comunes, leídas de `catalogos.py`. **Es la vía para que el front no invente ids.** |
| `POST /api/recomendar` | Recibe el formulario, devuelve `respuesta_json()`. |
| `POST /api/llamar` | Dispara la llamada de Manuela (§5.3). |

`FormularioUsuario` (Pydantic) marca obligatorios **solo los seis campos del
contrato mínimo** —`tipo_vivienda`, `salario`, `personas_a_cargo`, `edad`,
`Localidad`, `numero_habitaciones`—; el resto es opcional y el payload se pasa
con `exclude_none=True`, para que un campo ausente no viaje como `null` y
`leer_info_user` lo trate como "no declarado" en vez de como valor inválido.

El `ValueError` de `leer_info_user` sale como **HTTP 400** con **todos** los
errores del formulario juntos en `detail`, que es justamente para lo que
`leer_info_user` los acumula (§5.1).

**CORS abierto y sin auth**: es una demo local para el stand de GO FEST. Está
anotado en el docstring del módulo y no debe exponerse así a internet.

### 5.3 `POST /api/llamar` — el flow de Dapta

Cierra el ciclo: con el Top 1 en la mano, dispara la llamada de **Manuela**,
la agente de voz que corre en un flow de Dapta (Flow Studio).

- **El teléfono se normaliza a E.164 de móvil colombiano** (`+573XXXXXXXXX`)
  en `normalizar_telefono_e164`: quita el `00`, quita el indicativo `57` si
  viene duplicado y exige 10 dígitos que empiecen por `3`. Lo que no encaja
  —fijo, extranjero, incompleto— se rechaza con **400 antes** de gastar una
  llamada, no después.
- **`subsidio_estimado` se calcula aquí**: `30 × SMMLV` solo si el proyecto
  aplica subsidio de caja **y** la persona es afiliada. `SMMLV_COP` está
  duplicado en `api.py` y en `prep.py`; se actualizan los dos (§9).
- **El payload del flow tiene 19 campos y no es el contrato de §2.** Es el
  vocabulario de Dapta: `zona_interes`, `urgencia`, `entorno_deseado`,
  `piso_preferido`, `external_lead_id`, `current_time` en hora de Bogotá
  (`TZ_BOGOTA`, UTC−5)… La traducción completa vive en `api_llamar` y es el
  único sitio donde hay que tocarla si el flow cambia de campos.
- **La URL del webhook sale de `DAPTA_FLOW_WEBHOOK_URL`, nunca hardcodeada.**
  Sin esa variable el endpoint responde `status: "mock_enqueued"` con el
  payload que *habría* enviado: se puede probar la landing entera, incluido el
  botón de llamar, sin llamarle a nadie.

```bash
export DAPTA_FLOW_WEBHOOK_URL="https://..."   # antes de levantar uvicorn
```

---

## 6. Resolución de localidad por dirección

La función nueva del catálogo, en `scraper_projects.py`. Es la pieza que
conecta el scraping con el grafo: **si la localidad sale mal, el BFS expande
hacia vecinas equivocadas y el top completo queda sesgado.**

### 6.1 API

```python
from scraper_projects import localidad_desde_direccion, asignar_localidades

localidad_desde_direccion("Carrera 95A # 78 Sur, Bosa Recreo")
# {'localidad': 7, 'nombre': 'Bosa', 'confianza': 'alta',
#  'evidencia': 'nombre de localidad en la direccion: Bosa'}

catalogo = asignar_localidades(proyectos)   # agrega `Localidad` a cada uno
```

`asignar_localidades` es la función pedida: recibe el JSON de proyectos, lee
la dirección de cada uno y devuelve **el mismo JSON** con el atributo
`Localidad`. No muta la entrada. Acepta lista, dict con llave `proyectos`,
string JSON o ruta a un `.json`, y devuelve la misma forma que recibió.

### 6.2 Las tres pasadas

Se resuelve de más a menos confiable, y cada proyecto queda marcado con la
pasada que lo resolvió:

| Confianza | Cómo | Ejemplo |
|---|---|---|
| **alta** | La dirección nombra la localidad | `"Bosa, Bogotá. Cra. 95A #90-42 Sur"` → Bosa |
| **media** | La dirección nombra un barrio/sector del gazetteer | `"La Colina, Bogotá. Cra. 55 #152b-71"` → Suba |
| **baja** | Se infiere de la malla vial | `"Calle 13 # 28-52"` → Los Mártires |
| — | Otro municipio, o sin coincidencia | `"La Calera, Cundinamarca…"` → `null` |

**Gazetteer.** 311 barrios, sectores y UPZ. Es explícito: solo entra lo que se
puede afirmar. Los nombres que existen en dos localidades se dejan **fuera a
propósito** —"Unicentro" es el del norte en Usaquén y el de Occidente en
Engativá— y caen a la malla vial, que es preferible a resolver mal con aire de
certeza. Las frases se prueban de la más larga a la más corta, para que
"san cristobal norte" (Usaquén) le gane a "san cristobal" (localidad 4).

**Malla vial.** La cuadrícula de Bogotá es regular y eso la hace utilizable
como último recurso: las calles crecen hacia el **norte** (y hacia el sur con
el sufijo *Sur*) y las carreras hacia el **occidente** (y hacia el oriente con
*Este*). El parser lleva ambos números a un eje con signo:

```
calle_normalizada  = +N al norte, −N si dice "Sur"
carrera_normalizada = +N al occidente, −N si dice "Este"
```

y los busca en una tabla de 19 rectángulos, evaluada **en orden**: primero las
localidades pequeñas y bien delimitadas, para que no se las trague un
rectángulo grande que las contiene. Maneja avenidas con nombre
(`Av. Boyacá` → carrera 72, `Av. El Dorado` → calle 26), avenidas numeradas
(`Av. 70` → carrera 70), el prefijo `Av. Calle` / `Av. Carrera`, y el número
tras `#` como cruce del eje contrario. Es aproximado por construcción, por eso
queda marcado `baja` y no pisa a las otras dos pasadas.

**Fuera de Bogotá.** Cusezar y Bolívar filtran por área metropolitana, no por
ciudad: sus listados traen Cali, Cartagena, La Calera, Soacha, Zipaquirá.
Una dirección que nombra otro municipio devuelve `null` y el proyecto se
descarta del catálogo, con el motivo registrado.

### 6.3 Por qué la dirección le gana a la coordenada

Tres de las cuatro fuentes publican coordenadas, y los límites oficiales del
Distrito (`datos/localidades_bogota.json`, Datos Abiertos Bogotá) permiten
convertirlas en localidad de forma exacta con point-in-polygon.

Aun así **la coordenada no manda**, y la razón es empírica: en varias fichas
el pin apunta a la **sala de ventas**, no al proyecto.

| Proyecto | Dirección publicada | Pin del mapa |
|---|---|---|
| Eskala (Colsubsidio) | Av. carrera 50 # 5F-19 → **Puente Aranda** | Bosa |
| Reserva del Nogal (Colsubsidio) | Calle 59B sur # 86a-15, **Bosa** Nova | San Cristóbal |

La dirección es lo que la constructora afirma del proyecto, así que decide
ella. La coordenada entra **solo cuando la dirección no alcanza**, y cuando
ambas discrepan queda anotado en `_localidad_evidencia` — que es justamente
como se detectaron estos casos.

Sobre el catálogo actual: **84 de 88** proyectos con coordenada coinciden con
lo que dice su dirección (95 %). De los 4 restantes, 2 son los errores de pin
de la tabla de arriba y 2 son fronteras reales —direcciones sobre la Carrera
30 y sobre la Avenida Ciudad de Cali, justo encima del límite entre dos
localidades—, donde ninguna de las dos respuestas es "la mala".

El contraste dirección/coordenada es además la herramienta con la que se
afinó la malla vial: cada desacuerdo señalaba un rectángulo mal puesto o un
sector que le faltaba al gazetteer.

El point-in-polygon está verificado: los 20 centroides de los polígonos
oficiales caen dentro de su propia localidad.

---

## 7. El scraper

Las cuatro webs cargan sus proyectos por JavaScript, así que **ninguna se
puede leer del HTML plano del listado**. En vez de montar un navegador
headless se usa la misma fuente de datos que consume el front de cada sitio,
que además llega ya estructurada:

| Fuente | Cómo se obtiene | Detalle |
|---|---|---|
| **Amarilo** | API interna `apiweb.amarilo.com.co/search/v1/proyecto` | El listado renderiza en cliente (`<div id="proyectos" class="loading">`). La API trae el nodo completo: dirección, cifras, galería y zonas comunes. |
| **Cusezar** | HTML del listado + ficha por proyecto | Es la única que sí trae las tarjetas (`article.project-card`), con dirección y precio en `data-gtm-props`. Amenidades y galería salen de la ficha. |
| **Bolívar** | API interna `/api/proyectos-vivienda/20/all/all/all/all` + ficha | App Vue: el HTML trae la plantilla, no los datos. Cada ficha publica un **JSON-LD `ApartmentComplex`** con dirección postal, coordenadas, amenidades y alcobas. |
| **Colsubsidio** | `/api/basicProjectSearch` + `__NEXT_DATA__` de cada ficha | Los 29 de Bogotá son los que traen `field_housing_project_department == "Bogotá"` (el campo `city` guarda el sector comercial —Norte, Occidente, Centro—, no el municipio). Su JSON:API responde vacío a usuarios anónimos. El sitemap corrige las URLs viejas. |

### Detalles que cuestan tiempo si se descubren dos veces

- **Amarilo tiene la cadena TLS incompleta.** No envía el certificado
  intermedio, así que `requests` falla con `CERTIFICATE_VERIFY_FAILED`. Su
  propio front arranca axios con `rejectUnauthorized: false` por lo mismo.
  `_get` reintenta sin verificar **por host** y solo tras haberlo intentado
  bien primero.
- **Colsubsidio sirve páginas de ~1,7 MB** y corta conexiones bajo
  concurrencia: con 6 hilos se caían 12 de 29 fichas y esos proyectos quedaban
  sin dirección. Se baja a 3 hilos (`HILOS_POR_FUENTE`), hay backoff
  exponencial en `_get`, y al final `_reintentar_sin_direccion` relee una a una
  las fichas que quedaron vacías. Sin eso la corrida no es reproducible.
- **En Colsubsidio, `field_address_2` es la sala de ventas**, no el proyecto.
  La dirección del proyecto está en `field_long_description_two` del mismo
  paragraph. Las dos conviven; confundirlas manda proyectos de Bogotá a Soacha.
- **Las imágenes de Colsubsidio no están en `www`.** Las rutas del nodo
  (`/sites/default/files/…`) son del Drupal de atrás: sobre `www` devuelven
  **404 con una página de error de 800 KB**, que además pesa más que la foto.
  Hay que pedirlas a `cms.colsubsidio.com`.
- **El buscador de Colsubsidio publica alguna URL vieja.** Para "Abeto"
  apunta a `/abeto`, que responde **200 pero sin nodo** —no 404—, así que el
  proyecto se caía del catálogo sin error visible. La ficha viva es
  `/abeto-v2`. El sitemap sí está al día, así que se usa para corregir las
  URLs cuyo slug tiene una versión más nueva.
- **`?ciudad=bogota` de Cusezar no filtra del lado del servidor.** El listado
  trae Cali, Cartagena y La Calera igual. El filtro real lo hace la localidad.
- **Los proyectos comerciales se descartan** ("Zona Comercial", "Locales",
  "Oficina", "Parque Empresarial"): no son vivienda, no tienen habitaciones ni
  subsidio y no le sirven a quien busca dónde vivir.
- **Seis proyectos salen dos veces.** Constructora Bolívar los construye y
  Colsubsidio los comercializa, cada uno con su ficha y su precio —el de
  Colsubsidio suele ser el de afiliado, hasta un 19 % más bajo—: Álamo
  Veramonte, Austro de Cuatro Vientos, Baviera Park, Novum Ricaurte, Senderos
  de Fontibón y Urbana 30. Sin fusionarlos, el top gasta dos casillas en el
  mismo edificio. `fusionar_duplicados` los une conservando **las dos fichas**
  (`links_alternos`, `constructoras`), el precio más bajo, y la unión de zonas
  comunes e imágenes.

  Para decidir que son el mismo proyecto se exige el mismo nombre **y** que
  las localidades coincidan o sean vecinas en el grafo. Lo segundo no sobra:
  la dirección que publica cada constructora difiere, y Novum Ricaurte cae en
  Puente Aranda por una y en Los Mártires por la otra. Sin ese margen no se
  fusionaría; sin el límite de un salto, dos proyectos distintos con el mismo
  nombre en extremos opuestos de la ciudad se fusionarían por error.

### Imágenes

`imagenes_proyectos/<id_proyecto>/01.webp, 02.jpg, …` — una carpeta por
proyecto, nombrada con su id. Se numeran en el orden en que las publica la
fuente, así que la primera es siempre la de portada. La extensión sale del
`Content-Type` que declara el servidor, no de la URL.

Son varios cientos de MB, así que `imagenes_proyectos/` está en `.gitignore`:
se regeneran corriendo el scraper. Una imagen que no baja no aborta nada —
falla rápido (25 s, 2 intentos) y se sigue, porque bloquear la descarga
entera por un archivo opcional no compensa.

### Estado del catálogo

Última corrida: **96 proyectos** en 14 de las 20 localidades (102 fichas menos
las 6 fusionadas).

| Constructora | Proyectos | | Tipo | Proyectos |
|---|---:|---|---|---:|
| Amarilo | 37 | | VIS | 58 |
| Colsubsidio | 23 | | No VIS | 38 |
| Bolívar | 22 | | | |
| Cusezar | 14 | | | |

Concentración por localidad: Suba 31 · Bosa 14 · Fontibón 13 · Engativá 12 ·
Usme 10, y el resto con 3 o menos. **Seis localidades se quedan sin oferta**:
Tunjuelito, Antonio Nariño, La Candelaria, Rafael Uribe Uribe, Ciudad Bolívar
y Sumapaz. Ese es exactamente el caso para el que existe la expansión por el
grafo (§3.3): un usuario de Rafael Uribe Uribe no se queda sin resultados,
recibe los de sus vecinas con la penalización de distancia correspondiente.

Descartados: 21. Dieciséis por estar fuera de Bogotá —Cusezar y Bolívar
mezclan Cali, Cartagena, La Calera, Funza, Cajicá, Zipaquirá y Soacha— y
cinco por no ser vivienda (zonas comerciales, locales, oficinas). Todos
quedan listados con su motivo en la llave `descartados` del JSON, y las
fusiones en `fusionados`: **nada se cae en silencio**.

Cobertura: con estos 96 proyectos, **todos son alcanzables** por el
recomendador en modo contenido. Con el historial activo el sesgo de
popularidad del colaborativo deja fuera a unos pocos de las localidades
sobreofertadas; el piso de 30 interacciones por proyecto y `ALPHA_HISTORIAL`
en 0,50 son lo que evita que sean muchos más.

---

## 8. La landing (`web/`)

La landing de **GO FEST**: vende Machea a inmobiliarias y, en la misma página,
deja probar el motor de verdad contra el catálogo de 96 proyectos.

**Stack:** React 19 · Vite 8 · TypeScript · **Tailwind v4** · Framer Motion ·
lucide-react · oxlint. Sin router: es una sola página con anclas.

### 8.1 Correr las dos mitades

```bash
uvicorn api:app --port 8000            # terminal 1, raíz del repo
cd web && npm install && npm run dev   # terminal 2, landing en :5173
```

`vite.config.ts` usa `strictPort: true` en 5173 (respeta `PORT` si está): si
el puerto está ocupado **falla en vez de moverse solo**, para que la URL del
stand sea siempre la misma. `npm run build` corre `tsc -b` antes de compilar,
así que un error de tipos rompe el build; `npm run lint` es oxlint, no ESLint.

### 8.2 Estructura

```
web/src/
├── App.tsx            el orden de las secciones de la página, y nada más
├── index.css          @theme de Tailwind v4: la paleta y las animaciones
├── components/
│   ├── Navbar · Hero · Marquee · Demos · LiveDemo · Credibility
│   ├── FAQ · Offer · Footer                    las secciones
│   ├── Reveal.tsx     Reveal / StaggerGroup / StaggerItem — las animaciones
│   ├── AnimatedWords · CountUp · GrainOverlay · ScrollProgress · Logo
│   └── LeadMockup.tsx la ficha que "recibe el asesor"
└── lib/
    ├── api.ts         el cliente HTTP de api.py (§5.2) y sus tipos
    ├── catalogos.ts   espejo de catalogos.py para el formulario
    ├── content.ts     las 5 demos y los 3 pasos — texto, no maquetación
    └── offerConfig.ts la oferta comercial, en un solo objeto editable
```

**Las animaciones de scroll no se escriben a mano.** Se envuelve con
`<Reveal>` (fade + subida, una sola vez) o con `<StaggerGroup>` +
`<StaggerItem>` cuando una lista debe entrar en cascada en vez de como un
bloque. Añadir `whileInView` suelto a un componente nuevo rompe la
consistencia del ritmo de la página.

### 8.3 El diseño vive en `index.css`

Tailwind v4: **no hay `tailwind.config.js`**. La paleta se declara en el
bloque `@theme` de `index.css` y Tailwind genera las utilidades a partir de
ahí, así que `--color-coral` es lo que habilita `bg-coral`, `text-coral`,
`border-coral/40`…

| Token | Valor | Papel |
|---|---|---|
| `--color-coral` | `#ff6259` | Acento y CTA. |
| `--color-navy` | `#2d3b4e` | Texto y fondos oscuros. |
| `--color-beige` | `#fdf6f0` | Fondo de la página. |
| `--color-emerald` | `#2dd4a7` | Señal de éxito: match, compatibilidad, llamada. |
| `--font-heading` | Sora | Titulares. El resto es Manrope. |

Ahí mismo viven las texturas de marca (`dawn-sky`, `star-field`,
`dot-field-a/b/c`, `signal-streak`) y sus keyframes. Un color nuevo se agrega
al `@theme`, **no** como hex suelto en una clase.

### 8.4 El texto está fuera de la maquetación

Tres archivos de `lib/` existen para poder cambiar el contenido sin tocar JSX:

- **`content.ts`** — las 5 demos y los 3 pasos. Cada demo lleva un `match`
  opcional que es **salida real de `recomendar()`** sobre el catálogo, no
  texto de relleno: si el catálogo cambia de precios o de proyectos, esos
  bloques quedan desactualizados y hay que volver a correrlos.
- **`offerConfig.ts`** — el stack de valor, la garantía y el CTA. Tiene
  marcadores `[CONFIRMAR CON EQUIPO]` y un `contactEmail` con `TODO`: son
  cifras y datos que el equipo todavía no cerró, y están así **a propósito**
  para no publicar números inventados.
- **`catalogos.ts`** — ver §8.5.

### 8.5 `LiveDemo` — el formulario contra el motor real

Es el componente que conecta las dos mitades del repo, y el más delicado:

- Arma el payload del **contrato mínimo** (§2.1) y solo agrega `afiliado` y
  `zonas_comunes` si el usuario los tocó — mismo criterio que el
  `exclude_none` de `api.py`. Muestra el **Top 3**, no los 18 que devuelve
  `recomendar()`: la lista completa no cabe en la pantalla del stand.
- **Comprueba que la API esté viva al primer foco o clic** (`checkApi` →
  `GET /api/catalogos`), para que el primer error que vea alguien no sea uno
  de red a mitad del formulario.
- **`lib/catalogos.ts` es un espejo deliberado de `catalogos.py`.** Está
  duplicado para que el formulario tenga las etiquetas sin depender de la red.
  Las 20 localidades están completas; las zonas comunes son un **subconjunto
  curado de 10** de las 25, para que el form quepa en una pantalla. Los
  nombres tienen que coincidir **carácter por carácter** con
  `catalogos.ZONAS_COMUNES` (tildes incluidas: "Salón social", "Zona de
  lavandería") o el modelo los recibe como no reconocidos y los ignora en
  silencio (invariante 6, §9).
- El botón de llamar reenvía el `Apartamento` **completo** que devolvió la
  API, no una versión recortada, porque `POST /api/llamar` arma el payload de
  Dapta a partir de él.
- **`API_BASE` está fijo en `http://localhost:8000`** (`lib/api.ts`). Es una
  demo local; sacarla del portátil implica moverlo a una variable de entorno
  de Vite y cerrar el CORS de `api.py`.

Nota: `web/README.md` sigue siendo el del template de Vite. La documentación
real de la landing es esta sección.

---

## 9. Invariantes que no se pueden romper

1. **`catalogos.py` es la única fuente de los ids.** Los índices de
   `ZONAS_COMUNES` (0–24) y los de `LOCALIDADES_BOGOTA` (1–20) viajan dentro
   de `proyectos_model.json` y del perfil del usuario. Si un módulo define su
   propia copia, cualquier desfase produce cruces mal hechos **en silencio**:
   nada falla, solo se recomienda peor.
2. **Una amenidad desconocida se reporta, no se adivina.** Ese es el contrato
   de `mapear_zonas_comunes`.
3. **`tipo_vivienda` nunca se relaja** en el filtro.
4. **Nada relajado queda por encima de algo que cumple todo**, sin importar el
   score.
5. **`SMMLV` se actualiza cada año**, y está en **dos** archivos: `prep.py`
   (todo el eje de `salario` depende de él) y `api.py` (`SMMLV_COP`, para el
   subsidio que se le informa a Dapta). Si se desfasan, el motor y la llamada
   dicen cosas distintas sobre el mismo proyecto.
6. **`web/src/lib/catalogos.ts` es un espejo, no una fuente.** Duplica los ids
   de `catalogos.py` a propósito, y por eso hereda el invariante 1: si se
   desincroniza, el front manda ids que apuntan a otra localidad o zonas que
   el modelo descarta **sin error visible**. `GET /api/catalogos` sirve la
   versión buena y es la vía para verificarlo.
7. **`DAPTA_FLOW_WEBHOOK_URL` nunca se hardcodea.** Sin la variable el
   endpoint responde en modo mock, que es el comportamiento correcto en
   desarrollo — no un fallo que haya que "arreglar" poniendo la URL en el
   código.
8. **`api.py` no toma decisiones de recomendación.** Valida, traduce y
   delega. Cualquier regla de negocio nueva va en `modelo.py` o `main.py`, o
   quedará invisible para la CLI, la evaluación y los clientes simulados.
