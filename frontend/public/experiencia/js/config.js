// Configuración de entorno para este front vanilla (sin build step, sin
// bundler => sin process.env ni import.meta.env nativos). Es el único sitio
// donde se edita a mano a dónde apunta la app.
//
// Se carga ANTES que js/machea.js en index.html.
window.GDF_CONFIG = {
  // El servicio del modelo de recomendación (Machea). Ver
  // integracion/servicio_machea.py: envuelve `recomendar()` en HTTP y además
  // resuelve las fotos de cada proyecto por su `id_proyecto`.
  //
  // Si el modelo no está levantado, integracion/fake_machea.py habla el mismo
  // contrato y recomienda sobre el MISMO catálogo real (los 96 proyectos de
  // Bogotá) con sus fotos. No es el modelo —son reglas— y lo dice en el campo
  // `motor` de cada respuesta, que sale por consola:
  //   python integracion/fake_machea.py     -> escucha en el mismo puerto
  //
  // SE RESUELVE SOLO SEGÚN DÓNDE CORRA, igual que DAPTA_LLAMADA_BASE más
  // abajo: en localhost (npm run dev) sigue apuntando al servicio local de
  // siempre, y publicado (Vercel) apunta al backend real en Render. Escrito
  // así, no hay que volver a tocar este archivo para pasar de local a
  // producción ni al revés.
  MACHEA_BASE:
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'http://localhost:8100'
      : 'https://machea.onrender.com',

  // De dónde salen los proyectos recomendados (ver js/recommender.js):
  //   'machea' -> las 7 respuestas viajan al modelo, que devuelve el Top 6 con
  //               su compatibilidad y las fotos de cada proyecto.
  //   'local'  -> solo el motor de reglas de js/matching.js, sin tocar la red.
  //               Es el respaldo cuando el servicio no responde, y se marca
  //               siempre como aproximado para no engañar a nadie.
  RECOMMENDER: 'machea',

  // MODO DEMO SIN RED, apagado: publicado (Vercel) SÍ llama al modelo real
  // en Render — ver MACHEA_BASE arriba. El servicio gratuito de Render se
  // duerme tras un rato sin uso: la primera visita del día puede tardar
  // 30–60 segundos en responder mientras despierta. No es un error, es la
  // condición del plan gratuito; el motor local de respaldo (RECOMMENDER
  // 'local') sigue existiendo como red de seguridad si el servicio no
  // responde en absoluto, no como modo por defecto.
  SIN_BACKEND: false,

  // El backend de Machea (api.py, ver el repo de la landing), NO el mismo
  // servicio que MACHEA_BASE. Este SÍ corre siempre, incluso con
  // SIN_BACKEND:true — ese flag solo apaga el cálculo de recomendaciones, no
  // la llamada de Manuela, que no puede hacerse desde el navegador porque
  // necesita la API key de Dapta, y esa nunca puede viajar al cliente.
  DAPTA_LLAMADA_BASE: 'https://machea.onrender.com',

  // El número al que escribe el botón "WhatsApp" de la tarjeta elegida, en
  // formato internacional y sin "+" (57 + celular de 10 dígitos). Vacío, el
  // enlace abre WhatsApp con el mensaje listo y la persona elige el contacto.
  WHATSAPP_NUMERO: '',
};
