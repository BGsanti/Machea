# Integración con el modelo de recomendación (Machea v0.1)

Dos servicios que hablan **el mismo contrato**. El front no distingue cuál
está contestando, salvo por el campo `motor` de la respuesta.

| archivo | qué es | cuándo se usa |
|---|---|---|
| `servicio_machea.py` | envuelve el **modelo real** en HTTP | cuando se tiene su repo |
| `fake_machea.py` | **motor local de reglas** sobre el mismo catálogo | desarrollo, y si el modelo no está levantado |

Los dos escuchan en `http://localhost:8100`, que es lo que espera
`MACHEA_BASE` en `app/js/config.js`.

---

## El motor local (lo que funciona hoy, sin nada más)

```bash
python integracion/fake_machea.py
```

Recomienda de verdad sobre los **96 proyectos de Bogotá** de
`plataforma/datos/proyectos_bogota.json`, con sus fotos, repartiendo el peso
como declara el contrato: ubicación 30 %, zonas comunes 20 %, precio 20 %,
habitaciones 15 %, tipo de vivienda 15 %.

**No es el modelo.** El modelo es `colaborativo+contenido`: aprende de un
historial simulado y por eso puede recomendar cosas que unas reglas no ven.
Esto son reglas. Lo dice en cada respuesta (`"motor": "reglas locales (NO es el
modelo Machea)"`) y al arrancar, para que nadie los confunda por accidente.

Necesita que estén las fotos:

```bash
python plataforma/tools/generar_modelo.py     # baja 498 fotos (~78 MB)
```

## El modelo real

`servicio_machea.py` **se copia a la raíz del repo del modelo**, junto a
`main.py`:

```bash
pip install fastapi uvicorn
python servicio_machea.py          # http://localhost:8100
```

No toca `recomendar()` ni una línea. Le añade tres cosas que al front le
faltan:

1. **Las fotos.** El contrato las deja fuera de la respuesta a propósito: dice
   que viven en `imagenes_proyectos/<id_proyecto>/`, numeradas 01, 02…, y que
   la 01 es la portada. Lo que **no** dice es la extensión. El servicio lista
   la carpeta y devuelve `imagenes: [url, …]` ya resuelto, además de servirlas.
   Es una capa encima del contrato, no un cambio del contrato.
2. **Los errores enteros.** `recomendar()` levanta un `ValueError` que junta
   TODOS los fallos del formulario en un solo texto en vez de parar en el
   primero — justamente para que el front los pueda marcar de una vez.
   Devolver solo el primero tiraría ese trabajo, así que el 400 lleva el texto
   íntegro.
3. **Un `/salud` que sirva.** Dice si `main.py` es importable y si están el
   catálogo y las carpetas de fotos. Un despliegue a medias se ve así en una
   petición, en vez de en seis tarjetas rotas.

---

## `?constructora=` — la extensión que NO es del contrato

La demo se vende como "esta es TU app con TU catálogo", y el contrato no tiene
forma de pedirlo: `recomendar()` puntúa sobre los 96 proyectos de Bogotá a la
vez. Medido sobre 90 perfiles distintos, **en ninguno salían seis proyectos de
una sola marca**.

Va **en la URL y no en el cuerpo**, a propósito: el formulario del §3 está
verificado llave por llave contra el ejemplo del contrato, y meterle un campo
que el contrato no declara lo rompe.

| | qué hace | resultado |
|---|---|---|
| `fake_machea.py` | filtra el catálogo **antes** de puntuar | siempre 6, siempre de esa marca |
| `servicio_machea.py` | filtra **después**, sobre los 6 que devolvió el modelo | puede quedarse en 2 o 3 |

La segunda fila es un parche y conviene que se vea como tal. **El arreglo de
verdad es que el formulario del modelo acepte la constructora** y filtre antes
de puntuar; hasta entonces la demo de marca única solo está garantizada con el
motor local. Por eso la respuesta dice `descartados_por_constructora` y
`filtrado_despues_de_puntuar` en vez de dejarlo notar por el hueco.

Una clave desconocida **se ignora**, no da 400: no es un dato del usuario ni del
contrato, y una demo entera no puede caerse por un slug mal escrito en la URL.

Y pase lo que pase aquí, `app/js/recommender.js` vuelve a filtrar en el front
con lo que conteste el backend. Para que se pinte la tarjeta de otra marca
tendrían que fallar las dos cosas.

```bash
curl -s -X POST 'localhost:8100/recomendar?constructora=cusezar'   -H 'Content-Type: application/json' -d '{ … }'   # los 6 de Cusezar
```

## Comprobar que el contrato se cumple

```bash
curl localhost:8100/salud

# el camino feliz
curl -s -X POST localhost:8100/recomendar -H 'Content-Type: application/json' -d '{
  "tipo_vivienda": 1, "salario": 2, "personas_a_cargo": 3, "edad": 34,
  "Localidad": 9, "numero_habitaciones": 3,
  "zonas_comunes": ["Lobby","Piscina","Zona BBQ","Zona kids","Coworking","Gimnasio"]
}'

# el 400: tiene que traer los SEIS errores, no el primero
curl -s -X POST localhost:8100/recomendar -H 'Content-Type: application/json' \
  -d '{"salario":9,"edad":5,"Localidad":44}'
```

Y desde la consola del navegador, con el quiz contestado, lo que de verdad
importa:

```js
GDF.machea.construirFormulario(state)
```

- `zonas_comunes` tienen que salir como los **labels con tilde** (`"Gimnasio"`,
  `"Cancha de pádel"`, `"Zona kids"`) y **nunca** como los slugs (`gymnasio`,
  `cancha e padel`, `zona kid`). Ese es el fallo que anula el 20 % del score
  sin dar ningún error;
- `Localidad` con L mayúscula y entero;
- `personas_a_cargo` nunca 0.

## Dos casos borde que ya rompieron algo

- **Localidad sin oferta.** Seis de las 20 no tienen ni un proyecto
  (Tunjuelito, Antonio Nariño, La Candelaria, Rafael Uribe Uribe, Ciudad
  Bolívar, Sumapaz). El contrato promete que nunca devuelve lista vacía, y lo
  cumple expandiendo a las localidades vecinas — elegir Ciudad Bolívar devuelve
  Bosa. Si alguna vez devuelve `[]`, el contrato está roto, no la red.
- **"Cancha múltiple".** El quiz ofrece 26 zonas y el contrato conoce 25. La de
  más no es un error: se descarta y se reporta en `zonas_comunes_ignoradas`.
