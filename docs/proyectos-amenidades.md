# Amenidades / zonas comunales reales de los 26 proyectos de vivienda Colsubsidio

Investigación para poblar una fila de íconos de amenidades en la tarjeta de
resultado de cada proyecto en la app "Grúa del Futuro".

**Método:** se revisitaron las mismas páginas oficiales de proyecto en
`colsubsidio.com/vivienda/proyectos/...` que en la investigación previa de
imágenes (`proyectos-imagenes.md`) tenían `og:image` funcional en
`cms.colsubsidio.com`. Estas páginas son una SPA Next.js, pero el HTML
servido en la primera respuesta (`curl` con User-Agent de navegador, sin
JS) ya trae embebido el JSON de Drupal (`__NEXT_DATA__` / JSON:API) con los
párrafos de tipo `information_with_icons_item`, cada uno con un
`field_link.title` que es exactamente el texto visible de la ficha
icono+etiqueta de "zonas comunales" en la página (p. ej. `"Portería con
lobby"`, `"Cancha múltiple"`, `"Zona BBQ"`). Se extrajo ese texto
directamente del HTML crudo (no interpretado por un modelo), y cada
etiqueta se mapeó a la categoría más cercana del vocabulario fijo. Se
descartaron etiquetas sin equivalente razonable en el vocabulario (p. ej.
"Coworking", "Bicicleteros", "Zona para mascotas", "Lavandería comunal",
"Mirador") en vez de forzarlas a una categoría incorrecta.

Para los 6 proyectos que en la investigación de imágenes ya habían
resultado "no encontrado" (sin microsite propio activo), se confirmó de
nuevo aquí revisando el `canonical` URL embebido en la respuesta: en los 4
casos que devuelven HTTP 200 "falso" (Fuentevida, Campo Alegre El Dorado,
Jardín, Mompós), el `canonical` apunta a un bloque JSON:API genérico de
"página no encontrada" compartido por los cuatro — confirma que Colsubsidio
no tiene ficha propia para ellos. Villa Fiorita devuelve HTTP 200 pero su
`canonical` apunta al listado genérico `/vivienda/proyectos` (sin ficha
propia). Villa Mercedes El Dorado dio 404 en todas las variantes de URL
probadas (`la-mesa/villa-mercedes-el-dorado`, `la-mesa/villa-mercedes`,
`cundinamarca/villa-mercedes-el-dorado`) — consistente con que es un
proyecto conjunto Gobernación de Cundinamarca / Obras Capital donde
Colsubsidio solo participa en el componente social, sin microsite propio.

**20 de 26 proyectos (77%) obtuvieron al menos una amenidad real** — el
mismo conjunto de 6 "no encontrado" que en la investigación de imágenes
(Villa Fiorita, Fuentevida, Campo Alegre El Dorado, Abeto*, Jardín, Mompós),
salvo que aquí **Abeto sí tiene ficha propia** (`colsubsidio.com/vivienda/
proyectos/abeto`, confirmada por su `canonical`) con 4 amenidades reales,
aunque el `og:title` de esa página no está personalizado (posible descuido
del CMS, no señal de página genérica).

## Vocabulario fijo usado

`porteria` · `cancha` · `recreativa` · `biosaludable` · `infantil` ·
`salon` · `gimnasio` · `piscina` · `parqueadero`

## Tabla completa

| # | Proyecto | Amenidades encontradas | Fuente/URL | Confianza |
|---|---|---|---|---|
| 1 | Agrupación De Vivienda Monguí | porteria, salon, infantil, biosaludable, recreativa, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/soacha/mongui | alta — texto literal de la página (`Portería con lobby`, `Salón social con terraza`, `Juegos infantiles`, `Zona para ecogym`, `Zona verde`, `Parqueaderos comunales`) |
| 2 | Agrupación De Vivienda La Macarena | porteria, cancha, recreativa, biosaludable, infantil, parqueadero, gimnasio, salon | https://www.colsubsidio.com/vivienda/proyectos/soacha/macarena | alta — 18 ítems de icono+texto en la página (proyecto coliving, ficha muy completa) |
| 3 | Verde Esperanza El Dorado | recreativa, salon, biosaludable, infantil, porteria, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/ubate/verde-esperanza | alta — texto literal (`Zonas verdes`, `Salón comunal`, `Zonas biosaludables`, `Juegos infantiles`, `Portería`, `Parqueadero`) |
| 4 | La Arboleda | porteria, salon, infantil, gimnasio, recreativa | https://www.colsubsidio.com/vivienda/proyectos/bogota/arboleda | alta — texto literal (`Portería con lobby`, `Salón social`, `Salón infantil`, `Salón juvenil`, `Gimnasio`, `Terraza BBQ`) |
| 5 | INARI | porteria, gimnasio, biosaludable, infantil, salon | https://www.colsubsidio.com/vivienda/proyectos/chia/inari | alta — texto literal (`Portería con lobby`, `Gimnasio`, `Parque biosaludable`, `Juegos infantiles`, `Salón de juegos`) |
| 6 | Agrupación De Vivienda Pamplona I | porteria, gimnasio, cancha, infantil, recreativa, biosaludable | https://www.colsubsidio.com/vivienda/proyectos/soacha/pamplona | alta — texto literal (`Lobby y administración`, `Gimnasio`, `Cancha múltiple`, `Juegos infantiles`, `Zonas verdes`, `Parque biosaludable`, `BBQ`) |
| 7 | Los Nogales | recreativa, salon, gimnasio, parqueadero, cancha, infantil | https://www.colsubsidio.com/vivienda/proyectos/bogota/nogales | alta — texto literal (`BBQ`, `Salón social`, `Gimnasio`, `Parqueadero`, `Pista atlética`→cancha, `Parque infantil`) |
| 8 | Agrupación De Vivienda Bosque De Arrayán | porteria, infantil, cancha, recreativa, salon, biosaludable, gimnasio, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/tocancipa/bosque-arrayan | alta — 13 ítems de icono+texto, ficha muy completa |
| 9 | Agrupación De Vivienda Bosque De Turpial | porteria, salon, infantil, recreativa, gimnasio, cancha, biosaludable, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/tocancipa/bosque-turpial | alta — 15 ítems de icono+texto, ficha muy completa |
| 10 | Versalles | porteria, salon, cancha, infantil, recreativa, biosaludable | https://www.colsubsidio.com/vivienda/proyectos/soacha/versalles | alta — texto literal (`Portería con lobby`, `Salón social`, `Cancha múltiple`, `Juegos infantiles`, `Zonas verdes`, `Ecogym`) |
| 11 | Villa Mercedes El Dorado | no encontrado | — | — sin microsite propio en colsubsidio.com (404 en todas las variantes de URL probadas); es proyecto conjunto Gobernación de Cundinamarca/Obras Capital, Colsubsidio solo en componente social |
| 12 | Agrupación De Vivienda Payandé | salon, recreativa, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/ricaurte/payande | media — ficha corta (`Salón social`, `Salón de juegos`, `Terraza BBQ`, `Zonas verdes`, `Parqueaderos 1:1`); sin ícono de portería explícito |
| 13 | Agrupación De Vivienda Reserva De Guayacán | salon, piscina, recreativa, infantil, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/girardot/reserva-guayacan | alta — texto literal (`Salón social`, `Piscina para adultos`, `Piscina infantil`, `Zona BBQ`, `Parque infantil`, `Parqueaderos comunales`) |
| 14 | Agrupación De Vivienda Samán | porteria, salon, piscina, infantil, recreativa, gimnasio, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/ricaurte/saman | alta — texto literal (`Portería con lobby`, `Salón social`, `Piscina para niños y adultos`, `Juegos infantiles`, `Zona BBQ`, `Gimnasio`, `Parqueaderos 1:1`) |
| 15 | Proyecto Karakalí | gimnasio, recreativa, porteria, biosaludable, salon | https://www.colsubsidio.com/vivienda/proyectos/karakali | alta — texto literal (`Gimnasio`, `Terraza BBQ`, `Portería con lobby`, `Zonas verdes`, `Máquinas biosaludable`, `Zona de reuniones`→salon) |
| 16 | ARAUCARIA | porteria, salon, gimnasio, recreativa, infantil, cancha | https://www.colsubsidio.com/vivienda/proyectos/bogota/araucaria | alta — texto literal (`Portería con lobby`, `Sala de juegos`, `Gimnasio`, `Terraza BBQ`, `Parque infantil`, `Pista de trote`→cancha) |
| 17 | Villa Fiorita | no encontrado | https://www.colsubsidio.com/vivienda/proyectos/bogota/villa-fiorita | — página cae al listado genérico `/vivienda/proyectos` (confirmado por `canonical`), sin ficha propia |
| 18 | Agrupación De Vivienda Fuentevida | no encontrado | — | — sin microsite propio (404 real; `canonical` apunta al bloque JSON:API genérico de "no encontrado") |
| 19 | Conjunto Residencial Campo Alegre El Dorado | no encontrado | — | — sin microsite propio (404 real, mismo bloque genérico que Fuentevida) |
| 20 | Conjunto Residencial Vibo Once | porteria, salon, gimnasio, recreativa, infantil | https://www.colsubsidio.com/vivienda/proyectos/bogota/vibo-once | alta — texto literal (`Portería con lobby`, `Salón comunal`, `Gimnasio`, `Terraza BBQ`, `Parque infantil`) |
| 21 | Abeto | porteria, salon, gimnasio, recreativa | https://www.colsubsidio.com/vivienda/proyectos/abeto | media-alta — ficha propia confirmada por `canonical`, pero corta (`Portería`, `Zonas sociales`→salon, `Gimnasio`, `Zonas verdes`); `og:title` de la página no está personalizado |
| 22 | Reserva Del Nogal | salon, porteria, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/bogota/reserva-nogal | media — ficha corta (`Salón social`, `Portería y lobby`, `Parqueadero`, más `Bicicleteros` sin equivalente) |
| 23 | Mirador Del Virrey II | salon, parqueadero | https://www.colsubsidio.com/vivienda/proyectos/bogota/mirador-virrey | media-baja — ficha muy corta (`Salón social`, `Parqueaderos`, más `Bicicleteros` sin equivalente); la página de Colsubsidio no distingue fase I de fase II explícitamente |
| 24 | Zarzal | porteria, salon, infantil, gimnasio, parqueadero, recreativa | https://www.colsubsidio.com/vivienda/proyectos/bogota/zarzal | alta — texto literal (`Portería con lobby`, `Salón comunal`, `Zona de juegos`, `Gimnasio`, `Parqueaderos`, `Zonas verdes`); nota: la URL usa el segmento `bogota` aunque el proyecto está en Ciudadela Maiporé, Soacha |
| 25 | Agrupación De Vivienda Jardín | no encontrado | — | — sin microsite propio (404 real, mismo bloque genérico que Fuentevida/Campo Alegre) |
| 26 | Agrupación Mompós-Ciudadela Colsubsidio Maiporé | no encontrado | — | — sin microsite propio (404 real, mismo bloque genérico que Fuentevida/Campo Alegre/Jardín) |

## Notas de mapeo al vocabulario fijo

- `salon` cubre "Salón social", "Salón comunal", "Salón de juegos", "Salón
  infantil" (cuando coexiste con "Salón social" separado), "Zona de
  reuniones", "Zonas sociales".
- `recreativa` cubre "Zona BBQ" / "Terraza BBQ", "Zonas verdes", "Zona
  recreativa".
- `biosaludable` cubre "Parque biosaludable", "Zonas biosaludables",
  "Máquinas biosaludable", "Ecogym" / "Zona para ecogym" (equipos de
  ejercicio al aire libre).
- `cancha` cubre "Cancha múltiple", "Canchas múltiples" y, con menor
  certeza, "Pista atlética" / "Pista de trote" (zona deportiva más cercana
  disponible en el vocabulario).
- Etiquetas sin equivalente razonable en el vocabulario fijo y por lo
  tanto **excluidas** de la columna de amenidades: Coworking, Bicicleteros,
  Zona/Parque para mascotas, Lavandería comunal, Senderos peatonales,
  Fogata, Mirador, Zona de yoga y meditación, Zona de lectura/descanso,
  Locales comerciales, Torres con ascensor, Ascensores, Sala de tv, Zona de
  café, Teatrino al aire libre, Sala de juntas.
- No se copió ninguna amenidad de un proyecto a otro: los 6 "no
  encontrado" quedaron sin fila de amenidades.
