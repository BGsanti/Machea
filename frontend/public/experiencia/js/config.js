// Configuración de entorno para este front vanilla (sin build step, sin
// bundler => sin process.env ni import.meta.env nativos). Es el único sitio
// donde se edita a mano a dónde apunta la app.
//
// Se carga ANTES que js/machea.js en index.html.
window.GDF_CONFIG = {
  // El servicio del modelo de recomendación: backend/api/app.py, YA
  // desplegado en Render (ver render.yaml) y con CORS abierto a propósito.
  // Expone /api/recomendar y agrega las fotos de cada proyecto (relativas a
  // ESTE MISMO front, no al backend — ver el comentario de _fotos_de() en
  // app.py y de urlDeFoto() en recommender.js).
  //
  // Si el modelo no está levantado, integracion/fake_machea.py habla el mismo
  // contrato y recomienda sobre el MISMO catálogo real (los 96 proyectos de
  // Bogotá) con sus fotos. No es el modelo —son reglas— y lo dice en el campo
  // `motor` de cada respuesta, que sale por consola:
  //   python integracion/fake_machea.py     -> escucha en el mismo puerto
  MACHEA_BASE: 'https://machea-api.onrender.com/api',

  // De dónde salen los proyectos recomendados (ver js/recommender.js):
  //   'machea' -> las 7 respuestas viajan al modelo, que devuelve el Top 6 con
  //               su compatibilidad y las fotos de cada proyecto.
  //   'local'  -> solo el motor de reglas de js/matching.js, sin tocar la red.
  //               Es el respaldo cuando el servicio no responde, y se marca
  //               siempre como aproximado para no engañar a nadie.
  RECOMMENDER: 'machea',

  // MODO DEMO SIN RED. En true la app no llama al modelo en ningún momento y
  // las recomendaciones salen del motor local. Existe para la versión de UN
  // SOLO ARCHIVO (tools/empaquetar_demo.py), pensada para compartir por link:
  // ahí la política de seguridad del visor bloquea cualquier petición externa.
  // El plan gratuito de Render duerme el servicio tras un rato sin uso: la
  // primera consulta del día puede tardar ~20 s en despertar (se ve como
  // "Calculando tu match..." un rato largo, no como un error).
  SIN_BACKEND: false,

  // El backend de Machea (api.py, ver el repo de la landing), NO el mismo
  // servicio que MACHEA_BASE. Este SÍ corre siempre, incluso con
  // SIN_BACKEND:true — ese flag solo apaga el cálculo de recomendaciones, no
  // la llamada de Manuela, que no puede hacerse desde el navegador porque
  // necesita la API key de Dapta, y esa nunca puede viajar al cliente.
  DAPTA_LLAMADA_BASE: 'https://machea-api.onrender.com',

  // El número al que escribe el botón "WhatsApp" de la tarjeta elegida, en
  // formato internacional y sin "+" (57 + celular de 10 dígitos). Vacío, el
  // enlace abre WhatsApp con el mensaje listo y la persona elige el contacto.
  WHATSAPP_NUMERO: '',

  // Base de datos persistente de leads (ver js/datos.js y
  // supabase/migrations/). SIEMPRE la clave PUBLICABLE/anon -- nunca la
  // service_role -- porque viaja al navegador. Es segura de exponer: las
  // tablas están cerradas (RLS sin políticas) y esta clave solo puede
  // ejecutar las 4 funciones SECURITY DEFINER de la migración. Vacías, la
  // app funciona igual: js/datos.js nunca bloquea el formulario si no hay
  // configuración o si Supabase no responde.
  SUPABASE_URL: 'https://ndfsrstnzttbmcxukixw.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kZnNyc3RuenR0Ym1jeHVraXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMDU2NzcsImV4cCI6MjEwNjg4MTY3N30.rs6s2sgh6a7v6PiNqlcmpyATmf9_byjK_ilshg6qBGQ',
};
