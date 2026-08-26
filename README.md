# Machea

Recomendador de proyectos de vivienda en Bogotá D.C.

Una persona llena un formulario —cuánto gana, con cuántos vive, en qué
localidad quiere estar, qué zonas comunes le importan— y Machea le devuelve
los **6 proyectos más compatibles**, cada uno con un porcentaje de
compatibilidad listo para mostrar en pantalla.

El catálogo se construye scrapeando cuatro constructoras que publican en
Bogotá: **Amarilo, Cusezar, Constructora Bolívar y Colsubsidio**.

> **¿Vas a conectar el front?** Empieza por
> **[CONTRATO_FRONT.md](CONTRATO_FRONT.md)**: qué formulario mínimo hay que
> llenar, qué JSON se manda y qué JSON vuelve.
>
> Detalle técnico del contrato de datos, del grafo de localidades y del
> modelo: **[CLAUDE.md](CLAUDE.md)**.

---

## Instalación

```bash
pip install -r requirements.txt
```

Requiere Python 3.10+.

## Uso

### 1. Construir el catálogo

```bash
python scraper_projects.py
```

Consulta las cuatro constructoras, resuelve la localidad de cada proyecto a
partir de su dirección, escribe `proyectos_bogota.json` y baja las imágenes a
`imagenes_proyectos/<id_proyecto>/`.

```bash
python scraper_projects.py --no-imagenes           # solo el JSON (rápido)
python scraper_projects.py --fuente amarilo cusezar
python scraper_projects.py --salida otro.json
python scraper_projects.py --sin-coordenadas       # localidad solo por dirección
python scraper_projects.py --rehacer-imagenes      # re-bajar las que ya están
```

Las imágenes son varios cientos de MB, así que `imagenes_proyectos/` está en
`.gitignore`. Una corrida interrumpida se retoma sola: por defecto se omite el
proyecto cuya carpeta ya está completa.

Al terminar imprime un resumen: proyectos por constructora, por localidad, por
confianza de la localidad asignada, y la lista de descartados con su motivo.

### 2. Preparar los datos del modelo

```bash
python prep.py
```

Lee el catálogo, simula el crédito hipotecario de cada proyecto y le etiqueta
el **perfil de comprador** al que apunta. Escribe `proyectos_model.json`.

### 3. Entrenar el componente colaborativo

```bash
python simulacion/generar_clientes.py --semilla 42   # 10 arquetipos x 100 = 1.000 clientes
python generar_historial.py --semilla 42             # 1.000 x 8 eventos = 8.000 interacciones
python simulacion/evaluar.py --clientes-prueba 600   # ¿está sirviendo?
```

Sin `historial_simulado.json` el modelo funciona solo en modo **contenido**.
Con él se activa el componente **colaborativo**, que busca usuarios parecidos
y extrapola su comportamiento. La evaluación mide exactamente cuánto aporta:

```
recall@6 solo contenido      :  69.3%
recall@6 con historial       :  77.5%
mejora que aporta el historial:  +8.2 puntos
```

Detalle en [simulacion/README.md](simulacion/README.md).

### 4. Recomendar

```bash
python main.py --usuario usuario_ejemplo.json
```

Deja el resultado en `proyectos_listos_llamativos.json`.

Desde el front, con el payload que llega por HTTP — sin pasar por disco:

```python
from main import recomendar, respuesta_json

payload = {                       # las 15 llaves del formulario
    "nombres": "Ana", "apellidos": "Torres", "correo": "ana@ejemplo.com",
    "telefono": 3009998877, "afiliado": 1,
    "tipo_vivienda": 1, "salario": 2, "personas_a_cargo": 3, "edad": 34,
    "Localidad": 7, "numero_habitaciones": 3, "piso": 1,
    "zonas_comunes": ["Lobby", "Zona kids", "Parque", "Salón social", "Gimnasio"],
}

resultado = recomendar(payload, ruta_salida=None, verbose=False)
return respuesta_json(resultado, ruta_salida=None)   # el JSON que consume la vista
```

`recomendar()` acepta un dict, un string JSON o una ruta a archivo.
`respuesta_json()` deja solo lo que la vista necesita. Formato completo en
[CLAUDE.md §5](CLAUDE.md).

Si el formulario viene mal, `recomendar()` levanta `ValueError` con **todos**
los errores juntos, no el primero, para que el front pueda marcarlos de una vez.

---

## Cómo funciona

```
scraper_projects.py  ->  prep.py  ->  modelo.py  ->  main.py
   4 constructoras      perfil del    filtro duro    orquesta
   + localidad          proyecto      + NN + score   las etapas
   + imágenes
```

1. **Filtro duro.** Se descarta lo que no sirve: tipo de vivienda, número de
   habitaciones, localidad y zonas comunes. Si quedan menos de 10 candidatos,
   la búsqueda se abre hacia las **localidades vecinas** recorriendo un grafo
   de colindancia (BFS), y solo si eso no alcanza se sueltan requisitos, del
   menos al más costoso para el usuario. El tipo de vivienda nunca se suelta:
   VIS y No VIS son categorías legales distintas. Un dato que la constructora
   no publica no cuenta como incumplimiento: el proyecto entra marcado y el
   score le descuenta.

2. **Nearest Neighbors.** Los candidatos se puntúan contra el usuario en un
   espacio de tres features —salario, personas a cargo, edad— donde la
   capacidad de pago pesa la mitad. Si hay historial de interacciones, se suma
   un componente colaborativo que busca usuarios parecidos y extrapola su
   comportamiento.

3. **Score final.** `0.70` modelo + `0.20` coincidencia de zonas comunes +
   `0.10` cercanía de localidad, menos lo que se descuenta por datos que el
   proyecto no publica. Todos los componentes se devuelven por separado para
   que el ranking sea auditable.

4. **Porcentaje comercial.** El score crudo se convierte en un porcentaje de
   compatibilidad entre 62 % y 98 %, con las diferencias entre proyectos
   proporcionales a las diferencias reales de score.

---

## Estructura

```
Machea/
├── scraper_projects.py   catálogo desde 4 constructoras + localidad + imágenes
├── catalogos.py          vocabularios canónicos y grafo de localidades
├── prep.py               etiqueta el perfil objetivo de cada proyecto
├── modelo.py             filtro duro, Nearest Neighbors y score
├── main.py               orquesta el pipeline · recomendar()
├── generar_historial.py  convierte los clientes simulados en interacciones
├── simulacion/
│   ├── arquetipos.py             los 10 arquetipos de comprador
│   ├── generar_clientes.py       100 variaciones cada uno → 1.000 clientes
│   ├── evaluar.py                recall@6 con y sin historial
│   └── clientes_simulados.json
├── datos/
│   └── localidades_bogota.json   límites oficiales de las 20 localidades
├── imagenes_proyectos/
│   ├── 1/  01.webp 02.jpg ...
│   └── 2/  ...
├── proyectos_bogota.json         catálogo scrapeado
├── proyectos_model.json          catálogo con perfil objetivo (lo genera prep.py)
├── usuario_ejemplo.json          formulario de ejemplo
├── CLAUDE.md                     guía técnica
└── README.md
```

## El JSON, en corto

Usuario y proyecto comparten estructura a propósito: el modelo los compara
campo a campo.

```json
{
  "id_proyecto": 14,
  "nombres": null, "apellidos": null, "correo": null,
  "telefono": null, "afiliado": null,
  "tipo_vivienda": 1,
  "salario": null, "personas_a_cargo": null, "edad": null,
  "Localidad": 7,
  "numero_habitaciones": 3,
  "piso": 4,
  "zonas_comunes": ["Lobby", "Piscina", "Zona de lavandería", "Zona BBQ"],
  "link_proyecto": "https://www.colsubsidio.com/vivienda/proyectos/bogota/acanto"
}
```

En el JSON del **usuario** están llenos los campos de persona; en el del
**proyecto** están en `null`, porque un proyecto no tiene correo ni edad.
`salario`, `personas_a_cargo` y `edad` sí los tiene el proyecto —son el perfil
de comprador al que apunta— pero los deriva `prep.py`, no el scraper.

Dominios completos en [CLAUDE.md §2](CLAUDE.md).

## Localidad a partir de la dirección

`scraper_projects.py` resuelve la localidad leyendo la dirección, en tres
pasadas de mayor a menor confianza: nombre explícito de la localidad →
gazetteer de ~250 barrios y sectores → malla vial (calle/carrera). Cada
proyecto queda marcado con la pasada que lo resolvió.

```python
from scraper_projects import localidad_desde_direccion, asignar_localidades

localidad_desde_direccion("Carrera 95A # 78 Sur, Bosa Recreo")
# {'localidad': 7, 'nombre': 'Bosa', 'confianza': 'alta', ...}

asignar_localidades(proyectos)   # devuelve el mismo JSON con `Localidad`
```

Las coordenadas de los proyectos que las publican se usan solo como respaldo:
en varias fichas el pin del mapa apunta a la sala de ventas y no al proyecto.
Ver [CLAUDE.md §6.3](CLAUDE.md).
