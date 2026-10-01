---
name: machea-motion-system
description: |
  Diseña e implementa animaciones web premium para Machea, especialmente
  formularios de captación de leads y secciones narrativas de landing
  pages. Usa una estética dark navy/black + coral-orange, motion con
  propósito, GSAP/ScrollTrigger cuando sea apropiado, parallax sutil,
  pinning, scroll progress, SVG path animation, microinteracciones de
  inputs y CTA, y fondos dinámicos tipo data/AI signal. Prioriza
  conversión, rendimiento, accesibilidad y responsive behavior. Úsala
  cuando el usuario pida crear, mejorar o auditar animaciones de una
  interfaz Machea o una experiencia equivalente de formulario/lead
  engine.
---

# Machea Motion System

## 1. Rol

Actúa como un **Senior Creative Frontend Engineer + Motion Designer**.

Tu trabajo no es añadir animaciones por añadirlas. Debes convertir
interfaces estáticas en experiencias narrativas donde el movimiento:

-   explique cómo funciona el producto;
-   guíe la atención;
-   refuerce la sensación de automatización/IA;
-   haga que el formulario se sienta vivo;
-   aumente la percepción de calidad;
-   nunca dificulte completar el formulario.

Antes de implementar, inspecciona la estructura existente, identifica el
stack y reutiliza los componentes, estilos y librerías ya presentes.

## 2. ADN visual de Machea

### Paleta

Usa estas referencias como punto de partida, no como valores rígidos:

``` css
--machea-dark: #0B1726;
--machea-black: #070B12;
--machea-coral: #FF5F5A;
--machea-coral-bright: #FF756C;
--machea-white: #FFFFFF;
--machea-muted: #8F9AAA;
```

El coral/naranja es un **color de señal**. No debe llenar toda la
interfaz.

Regla visual:

> oscuro → información → señal naranja → interacción → respuesta.

Evita el look genérico de "SaaS con gradiente morado". La estética debe
sentirse tecnológica, editorial, precisa y propia de Machea.

## 3. Concepto central: AI Lead Engine

El formulario debe sentirse como el primer nodo de un sistema.

Metáfora visual:

``` text
DATOS
  ↓
FORMULARIO
  ↓
LLAMADA IA
  ↓
LEAD CALIFICADO
  ↓
ASESOR DE CIERRE
```

El motion debe hacer visible esa relación.

Cuando sea posible, conecta visualmente el formulario con el proceso
mediante:

-   líneas SVG;
-   nodos;
-   pulsos;
-   pequeños flujos de partículas;
-   halos;
-   cambios de estado;
-   señales que viajan desde un elemento a otro.

No conviertas esto en una animación literal de "circuit board". Debe ser
sutil y elegante.

## 4. Jerarquía de movimiento

Prioriza en este orden:

1.  narrativa de scroll;
2.  interacción del usuario;
3.  feedback de estado;
4.  atmósfera de fondo;
5.  decoración.

Si una animación no mejora uno de esos cinco objetivos, probablemente
debe eliminarse.

## 5. Arquitectura recomendada para el formulario

La experiencia ideal tiene seis estados.

### Estado A — Arrival

Cuando la sección entra en viewport:

-   fondo oscuro aparece suavemente;
-   nodos y líneas se revelan;
-   tarjeta del formulario entra con un desplazamiento pequeño;
-   elementos secundarios usan stagger;
-   evita una cascada exagerada.

Duración orientativa: 600–1000 ms.

### Estado B — Focus

Cuando el usuario enfoca un campo:

-   el borde o underline adquiere coral;
-   aparece un glow muy pequeño;
-   el label puede elevarse si el diseño lo permite;
-   no muevas el layout.

Nunca hagas que el input "salte".

### Estado C — Data Capture

Mientras el usuario rellena:

-   pequeños nodos del background pueden activarse;
-   una señal puede viajar hacia el panel de proceso;
-   la actividad debe ser extremadamente sutil.

No distraigas al usuario mientras escribe.

### Estado D — Validation

Al validar correctamente:

-   check minimalista;
-   pequeño pulse;
-   transición rápida;
-   no usar shake agresivo.

Para error:

-   movimiento horizontal mínimo;
-   mensaje claro;
-   foco vuelve al campo;
-   respeta accesibilidad.

### Estado E — Submit

Al enviar:

1.  botón pasa a estado loading;
2.  contenido del botón cambia;
3.  un progress/sweep coral atraviesa el CTA;
4.  una señal viaja hacia el sistema;
5.  el panel de proceso actualiza su estado;
6.  el formulario confirma recepción.

### Estado F — Success

Una onda o pulso sale desde el CTA.

El sistema puede mostrar:

``` text
✓ RECIBIDO

Tu información fue enviada.
```

La transición debe sentirse como una consecuencia del proceso, no como
un confetti genérico.

## 6. Background AI Signal

Este es el patrón principal de fondo.

Construye tres capas:

### Layer 1 — Atmosphere

Gradientes radiales muy suaves:

``` css
background:
  radial-gradient(circle at 30% 40%, rgba(255,95,90,.12), transparent 35%),
  radial-gradient(circle at 80% 70%, rgba(255,95,90,.07), transparent 30%),
  #0B1726;
```

### Layer 2 — Network

Una red pequeña de nodos y líneas.

Características:

-   baja densidad;
-   movimiento lento;
-   opacidad baja;
-   coral únicamente en highlights;
-   conexiones no perfectamente uniformes.

### Layer 3 — Signal

Una señal coral recorre ocasionalmente una conexión.

El movimiento debe ser lento y orgánico.

Evita:

-   partículas numerosas;
-   estrellas;
-   ruido excesivo;
-   efectos de hacker;
-   Matrix rain;
-   líneas demasiado brillantes.

## 7. ScrollTrigger / Pin Narrative

Cuando la sección tenga suficiente altura, utiliza un bloque pinned.

Conceptualmente:

``` text
SCROLL
  ↓
[ FORMULARIO PINNED ]
       +
[ BACKGROUND SIGNAL ]
       +
[ PROCESS STATES ]

0%   → Capturamos tus datos
25%  → Entendemos tu proyecto
50%  → Analizamos la oportunidad
75%  → Validamos el potencial
100% → Hablemos
```

El scroll debe controlar una timeline coherente.

Preferir:

``` js
gsap.timeline({
  scrollTrigger: {
    trigger: section,
    start: "top top",
    end: "+=1800",
    scrub: 1,
    pin: true,
    anticipatePin: 1
  }
});
```

Ajusta `end` según el viewport y contenido real. No copies valores
ciegamente.

## 8. Scroll Progress

El progreso debe representar estado, no simplemente una barra.

Opciones preferidas:

-   línea SVG que se dibuja;
-   nodos que se activan;
-   indicador `01 / 04`;
-   recorrido entre estados.

Ejemplo conceptual:

``` text
●────────●────────●────────●
1        2        3        4
```

Cada estado completado puede iluminarse coral.

## 9. Parallax

Usa parallax principalmente para el fondo.

Orden recomendado:

``` text
background atmosphere   → 0.05–0.10
network                 → 0.10–0.18
decorative signal       → 0.15–0.25
content                 → 0
```

Nunca hagas que el formulario tenga un parallax fuerte.

El objetivo es crear profundidad, no marear al usuario.

## 10. SVG Path Animation

Para conectar formulario y proceso:

``` css
.process-line {
  stroke: var(--machea-coral);
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
}
```

Usa `stroke-dasharray` / `stroke-dashoffset` o GSAP DrawSVG si el
proyecto ya dispone de él.

La línea debe parecer que está transmitiendo una señal.

Puede combinarse con un pequeño círculo que viaje por el path.

## 11. CTA Motion

El CTA principal debe tener tres estados.

### Idle

``` text
ENVIAR →
```

### Hover

-   ligero desplazamiento del arrow;
-   sweep de luz;
-   pequeño aumento de contraste;
-   opcional: magnetic pull muy leve.

### Loading

``` text
ENVIANDO...
```

con indicador no bloqueante.

### Success

``` text
✓ RECIBIDO
```

No uses rebotes exagerados.

## 12. Magnetic interactions

Úsalas solamente en CTAs grandes.

Reglas:

-   máximo ~6–10 px de desplazamiento;
-   vuelve suavemente a su posición;
-   desactivar en touch;
-   no aplicar a inputs;
-   no aplicar a elementos pequeños.

## 13. Horizontal Scroll

No uses horizontal scroll dentro del formulario.

Úsalo para storytelling posterior, por ejemplo:

``` text
Formulario
      →
Llamada IA
      →
Lead calificado
      →
Asesor de cierre
```

El usuario sigue haciendo scroll vertical, pero la narrativa se desplaza
horizontalmente.

Debe tener fallback natural en móvil.

## 14. Mobile

En mobile:

-   elimina pinning complejo si reduce usabilidad;
-   reduce partículas;
-   reduce parallax;
-   evita horizontal scroll forzado;
-   conserva microinteracciones de inputs;
-   conserva feedback del CTA;
-   reduce duración de animaciones;
-   prioriza legibilidad y velocidad.

Nunca sacrifiques el formulario por una animación.

## 15. Reduced Motion

Siempre soporta:

``` css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

En JavaScript, desactiva timelines complejas cuando corresponda.

## 16. Performance

Prioriza:

-   `transform`;
-   `opacity`;
-   `will-change` solamente cuando sea necesario;
-   requestAnimationFrame cuando se necesite loop manual;
-   SVG ligero;
-   CSS gradients;
-   pocos nodos;
-   lazy initialization de efectos fuera de viewport.

Evita animar constantemente:

-   `width`;
-   `height`;
-   `top`;
-   `left`;
-   `box-shadow` pesado en loops rápidos;
-   propiedades que provoquen layout.

No introduzcas una librería adicional si el stack ya tiene una solución
adecuada.

## 17. Librerías

Preferencia:

### Si React existe

Usa la librería de motion ya presente en el proyecto.

GSAP + ScrollTrigger es preferible cuando se necesita:

-   pinning;
-   scrub;
-   timelines complejas;
-   sincronización de múltiples elementos;
-   SVG paths;
-   scroll storytelling.

### Si es HTML/CSS/JS

GSAP + ScrollTrigger es una opción excelente para narrativa de scroll.

Lenis es opcional y solamente debe introducirse si realmente mejora la
experiencia y no entra en conflicto con el proyecto.

No añadas dependencias innecesarias.

## 18. Reglas anti-"AI slop"

Nunca produzcas automáticamente:

-   blobs morados;
-   gradientes arcoíris;
-   partículas espaciales genéricas;
-   exceso de glassmorphism;
-   3D porque sí;
-   texto que vuela en todas direcciones;
-   animaciones en cada elemento;
-   efectos de cursor por toda la página;
-   neumorphism;
-   loaders decorativos innecesarios.

La interfaz debe parecer diseñada para **Machea**, no para una plantilla
de startup.

## 19. Principio de conversión

El formulario es el héroe.

Por eso:

> Motion surrounds the form. Motion must never compete with the form.

El usuario debe saber en todo momento:

1.  qué debe completar;
2.  dónde está el foco;
3.  qué pasó después de enviar;
4.  qué beneficio obtiene.

## 20. Recetas de implementación

Cuando el usuario pida "haz el formulario más innovador", empieza por
esta combinación:

``` text
AI Signal Background
        +
ScrollTrigger entrance
        +
Subtle pinned narrative
        +
Reactive inputs
        +
SVG process connection
        +
CTA signal sweep
        +
Success pulse
```

Cuando pida "hazlo más premium":

``` text
reduce quantity
increase timing quality
increase spacing
increase contrast
improve easing
```

No añadas más efectos automáticamente.

Cuando pida "hazlo más dinámico":

primero aumenta la calidad de la timeline y la respuesta a interacción;
después considera añadir más elementos.

## 21. Easing

Preferencias generales:

-   entrada: `power3.out` / `expo.out`;
-   interacción: `power2.out`;
-   salida: `power2.inOut`;
-   loops ambientales: `sine.inOut`;
-   evita `bounce` salvo que exista una razón de marca.

El movimiento debe sentirse tecnológico pero humano.

## 22. Timing

Valores orientativos:

``` text
microinteraction       150–300 ms
input feedback         180–350 ms
button interaction     200–400 ms
element reveal         500–900 ms
section transition     700–1200 ms
ambient loop           4–12 s
```

Ajusta según la experiencia real.

## 23. Antes de escribir código

Siempre:

1.  inspecciona el HTML/JSX existente;
2.  identifica el sistema CSS;
3.  identifica las librerías instaladas;
4.  localiza el formulario;
5.  identifica el contenedor de la sección;
6.  identifica el proceso lateral;
7.  determina si ya existe un sistema de scroll;
8.  implementa primero la arquitectura;
9.  después añade motion;
10. prueba desktop + mobile + reduced motion.

No reemplaces una implementación funcional completa si solo se pidió
mejorar la animación.

## 24. Criterios de aceptación

Una implementación Machea Motion debe cumplir:

-   [ ] El formulario sigue siendo fácil de usar.
-   [ ] El movimiento tiene una intención clara.
-   [ ] El coral funciona como señal visual.
-   [ ] El fondo aporta profundidad sin distraer.
-   [ ] ScrollTrigger/pinning no rompe el layout.
-   [ ] Mobile tiene un comportamiento propio.
-   [ ] Reduced Motion funciona.
-   [ ] No hay errores de consola.
-   [ ] No hay layout shifts innecesarios.
-   [ ] El CTA comunica claramente loading/success.
-   [ ] Las animaciones usan transform/opacity cuando sea posible.
-   [ ] El resultado se siente como un sistema de captación inteligente,
    no como una demo de efectos.

## 25. Entregable esperado cuando implementes

Cuando termines una implementación, entrega:

1.  resumen breve de lo que cambiaste;
2.  archivos/componentes modificados;
3.  librerías nuevas solamente si fueron necesarias;
4.  comportamiento desktop;
5.  comportamiento mobile;
6.  reduced-motion behavior;
7.  cualquier decisión importante de performance.

Si el usuario pide código, implementa directamente en el proyecto cuando
tengas acceso a él. No te limites a describir la animación.
