import { and, eq } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { bandejaLeads, entradasListaPrecios, flujos, listasPrecios, miembrosCampana } from "@/db/esquema";
import { desdeHoraLocal, hoyMas } from "../fechas";
import { crear } from "./repositorio";

const dia = hoyMas;

function hora(desplazamientoDias: number, h: number, m = 0): Date {
  return desdeHoraLocal(`${hoyMas(desplazamientoDias)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)!;
}

/** Carga un conjunto de datos de demostración. Se puede ejecutar varias veces. */
export async function cargarDatosEjemplo(usuarioId: string): Promise<number> {
  const db = await bd();
  const empresaId = await empresaActual();
  let total = 0;
  const nuevo = async (objeto: string, datos: Record<string, unknown>) => {
    total++;
    return crear(objeto, datos, usuarioId);
  };

  const cuentas = {
    cafe: await nuevo("cuentas", {
      nombre: "Café Andino S.A.S.",
      tipo: "cliente",
      telefono: "+57 604 444 1020",
      sitioWeb: "https://cafeandino.example",
      facturacionCiudad: "Medellín",
      facturacionEstado: "Antioquia",
      facturacionPais: "Colombia",
      descripcion: "Tostadora y exportadora de café especial.",
    }),
    textiles: await nuevo("cuentas", {
      nombre: "Textiles del Valle",
      tipo: "prospecto",
      telefono: "+57 602 380 5500",
      sitioWeb: "https://textilesdelvalle.example",
      facturacionCiudad: "Cali",
      facturacionEstado: "Valle del Cauca",
      facturacionPais: "Colombia",
    }),
    horizonte: await nuevo("cuentas", {
      nombre: "Constructora Horizonte",
      tipo: "cliente",
      telefono: "+57 601 742 9000",
      sitioWeb: "https://horizonte.example",
      facturacionCiudad: "Bogotá",
      facturacionEstado: "Cundinamarca",
      facturacionPais: "Colombia",
    }),
    clinica: await nuevo("cuentas", {
      nombre: "Clínica Santa Fe",
      tipo: "socio",
      telefono: "+57 601 603 0303",
      facturacionCiudad: "Bogotá",
      facturacionEstado: "Cundinamarca",
      facturacionPais: "Colombia",
    }),
    logistica: await nuevo("cuentas", {
      nombre: "Logística Express del Caribe",
      tipo: "revendedor",
      telefono: "+57 605 330 1122",
      facturacionCiudad: "Barranquilla",
      facturacionEstado: "Atlántico",
      facturacionPais: "Colombia",
    }),
  };

  const contactos = {
    laura: await nuevo("contactos", { tratamiento: "Sra.", nombre: "Laura", apellidos: "Restrepo", cuentaId: cuentas.cafe, cargo: "Gerente de compras", email: "laura.restrepo@cafeandino.example", telefono: "+57 310 555 0101" }),
    andres: await nuevo("contactos", { tratamiento: "Sr.", nombre: "Andrés", apellidos: "Gómez", cuentaId: cuentas.cafe, cargo: "Director financiero", email: "andres.gomez@cafeandino.example", telefono: "+57 310 555 0102" }),
    diana: await nuevo("contactos", { tratamiento: "Sra.", nombre: "Diana", apellidos: "Cárdenas", cuentaId: cuentas.textiles, cargo: "Jefa de operaciones", email: "diana@textilesdelvalle.example", telefono: "+57 315 555 0201" }),
    felipe: await nuevo("contactos", { tratamiento: "Sr.", nombre: "Felipe", apellidos: "Ortiz", cuentaId: cuentas.horizonte, cargo: "Gerente de proyectos", email: "felipe.ortiz@horizonte.example", telefono: "+57 320 555 0301" }),
    camila: await nuevo("contactos", { tratamiento: "Dra.", nombre: "Camila", apellidos: "Vargas", cuentaId: cuentas.clinica, cargo: "Directora médica", email: "cvargas@clinicasantafe.example", telefono: "+57 300 555 0401" }),
    jorge: await nuevo("contactos", { tratamiento: "Sr.", nombre: "Jorge", apellidos: "Mendoza", cuentaId: cuentas.logistica, cargo: "Coordinador logístico", email: "jorge@logisticaexpress.example", telefono: "+57 301 555 0501" }),
  };

  // Leads de compradores, como los que entran por el formulario de Machea: la persona es el cliente.
  const compradores = [
    { nombre: "Valentina", apellidos: "Ríos", estado: "nuevo", valoracion: "caliente", origen: "formulario_marca", ciudad: "Bogotá", estadoProvincia: "Cundinamarca", email: "valentina.rios@correo.example", telefono: "+57 312 555 1001", proyecto: "Torres de Chapinero" },
    { nombre: "Santiago", apellidos: "Herrera", estado: "contactado", valoracion: "tibio", origen: "proyecto_machea", ciudad: "Medellín", estadoProvincia: "Antioquia", email: "santiago.herrera@correo.example", telefono: "+57 315 555 1002", proyecto: "Altos del Poblado" },
    { nombre: "Mariana", apellidos: "López", estado: "en_seguimiento", valoracion: "tibio", origen: "web", ciudad: "Bogotá", estadoProvincia: "Cundinamarca", email: "mariana.lopez@correo.example", telefono: "+57 300 555 1003", proyecto: "Parque Fontibón" },
    { nombre: "Daniel", apellidos: "Castro", estado: "nuevo", valoracion: "frio", origen: "publicidad", ciudad: "Soacha", estadoProvincia: "Cundinamarca", email: "daniel.castro@correo.example", telefono: "+57 320 555 1004", proyecto: "Ciudadela Sol" },
    { nombre: "Isabella", apellidos: "Moreno", estado: "calificado", valoracion: "caliente", origen: "formulario_marca", ciudad: "Bogotá", estadoProvincia: "Cundinamarca", email: "isabella.moreno@correo.example", telefono: "+57 311 555 1005", proyecto: "Torres de Chapinero" },
    { nombre: "Tomás", apellidos: "Jiménez", estado: "contactado", valoracion: "caliente", origen: "proyecto_machea", ciudad: "Medellín", estadoProvincia: "Antioquia", email: "tomas.jimenez@correo.example", telefono: "+57 318 555 1006", proyecto: "Altos del Poblado" },
    { nombre: "Sofía", apellidos: "Ramírez", estado: "no_calificado", valoracion: "frio", origen: "web", ciudad: "Bogotá", estadoProvincia: "Cundinamarca", email: "sofia.ramirez@correo.example", telefono: "+57 301 555 1007", proyecto: "Parque Fontibón" },
  ];
  const idsCompradores: string[] = [];
  for (const { proyecto, ...c } of compradores) {
    idsCompradores.push(await nuevo("candidatos", { ...c, pais: "Colombia", descripcion: `Pidió hablar con un asesor sobre **${proyecto}**.` }));
  }

  const [estandar] = await db
    .select()
    .from(listasPrecios)
    .where(and(eq(listasPrecios.empresaId, empresaId), eq(listasPrecios.estandar, true)))
    .limit(1);
  const catalogo = [
    { nombre: "Licencia CRM anual", codigo: "LIC-CRM-12", familia: "software", precio: 1200000 },
    { nombre: "Implementación estándar", codigo: "SRV-IMP", familia: "servicios", precio: 4500000 },
    { nombre: "Capacitación (por sesión)", codigo: "SRV-CAP", familia: "servicios", precio: 650000 },
    { nombre: "Soporte premium mensual", codigo: "SUS-SOP", familia: "suscripciones", precio: 380000 },
    { nombre: "Lector de código de barras", codigo: "HW-LCB", familia: "productos", precio: 290000 },
    { nombre: "Integración a medida", codigo: "SRV-INT", familia: "servicios", precio: 7800000 },
  ];
  const productos: Record<string, { id: string; precio: number }> = {};
  for (const p of catalogo) {
    const id = await nuevo("productos", { nombre: p.nombre, codigo: p.codigo, familia: p.familia, activo: true });
    productos[p.codigo] = { id, precio: p.precio };
    if (estandar) {
      await db
        .insert(entradasListaPrecios)
        .values({ empresaId, listaPreciosId: estandar.id, productoId: id, precio: p.precio, propietarioId: usuarioId, creadoPorId: usuarioId })
        .onConflictDoNothing();
    }
  }

  const oportunidades = [
    { nombre: "Café Andino - Renovación de licencias", cuentaId: cuentas.cafe, etapa: "negociar", fechaCierre: dia(12), lineas: [["LIC-CRM-12", 25], ["SUS-SOP", 12]] },
    { nombre: "Textiles del Valle - Implementación", cuentaId: cuentas.textiles, etapa: "proponer", fechaCierre: dia(25), lineas: [["SRV-IMP", 1], ["LIC-CRM-12", 15], ["SRV-CAP", 4]] },
    { nombre: "Horizonte - Integración ERP", cuentaId: cuentas.horizonte, etapa: "reunion_presentacion", fechaCierre: dia(40), lineas: [["SRV-INT", 1]] },
    { nombre: "Clínica Santa Fe - Piloto", cuentaId: cuentas.clinica, etapa: "calificar", fechaCierre: dia(60), importe: 9000000 },
    { nombre: "Logística Express - Lectores", cuentaId: cuentas.logistica, etapa: "cerrada_ganada", fechaCierre: dia(-10), lineas: [["HW-LCB", 30]] },
    { nombre: "Café Andino - Capacitación", cuentaId: cuentas.cafe, etapa: "cerrada_perdida", fechaCierre: dia(-20), importe: 2600000 },
    { nombre: "Horizonte - Soporte anual", cuentaId: cuentas.horizonte, etapa: "proponer", fechaCierre: dia(8), lineas: [["SUS-SOP", 12]] },
  ] as const;
  for (const o of oportunidades) {
    const id = await nuevo("oportunidades", {
      nombre: o.nombre,
      cuentaId: o.cuentaId,
      etapa: o.etapa,
      fechaCierre: o.fechaCierre,
      importe: "importe" in o ? o.importe : null,
      listaPreciosId: estandar?.id ?? null,
    });
    if ("lineas" in o) {
      for (const [codigo, cantidad] of o.lineas) {
        const p = productos[codigo];
        if (p) await nuevo("productos-oportunidad", { oportunidadId: id, productoId: p.id, cantidad, precioUnitario: p.precio });
      }
    }
  }

  const casos = [
    { asunto: "No puedo exportar el informe mensual", estado: "nuevo", prioridad: "alta", origen: "email", contactoId: contactos.laura, cuentaId: cuentas.cafe },
    { asunto: "Solicitud de usuario adicional", estado: "en_curso", prioridad: "media", origen: "telefono", contactoId: contactos.diana, cuentaId: cuentas.textiles },
    { asunto: "Error al sincronizar inventario", estado: "escalado", prioridad: "alta", origen: "web", contactoId: contactos.jorge, cuentaId: cuentas.logistica },
    { asunto: "Duda sobre la factura de septiembre", estado: "esperando_cliente", prioridad: "baja", origen: "email", contactoId: contactos.andres, cuentaId: cuentas.cafe },
    { asunto: "Capacitación para nuevo personal", estado: "nuevo", prioridad: "media", origen: "telefono", contactoId: contactos.camila, cuentaId: cuentas.clinica },
    { asunto: "Cambio de contraseña", estado: "cerrado", prioridad: "baja", origen: "web", contactoId: contactos.felipe, cuentaId: cuentas.horizonte },
  ];
  for (const c of casos) await nuevo("casos", c);

  const eventos = [
    { asunto: "Reunión", descripcion: "Revisión de la propuesta de implementación.", inicio: hora(1, 9), fin: hora(1, 10), ubicacion: "Oficina Cali", quienObjeto: "contactos", quienId: contactos.diana, relacionadoObjeto: "cuentas", relacionadoId: cuentas.textiles },
    { asunto: "Llamada", descripcion: "Seguimiento de la renovación.", inicio: hora(0, 15), fin: hora(0, 15, 30), quienObjeto: "contactos", quienId: contactos.laura, relacionadoObjeto: "cuentas", relacionadoId: cuentas.cafe },
    { asunto: "Reunión", descripcion: "Demostración de la integración.", inicio: hora(3, 11), fin: hora(3, 12, 30), ubicacion: "Videollamada", quienObjeto: "contactos", quienId: contactos.felipe },
    { asunto: "Enviar carta o presupuesto", inicio: hora(2, 8), fin: hora(2, 8, 30), quienObjeto: "contactos", quienId: contactos.camila },
  ];
  for (const e of eventos) await nuevo("eventos", e);

  const tareas = [
    { asunto: "Enviar propuesta revisada", fechaVencimiento: dia(1), prioridad: "alta", relacionadoObjeto: "cuentas", relacionadoId: cuentas.textiles },
    { asunto: "Llamar para confirmar la renovación", fechaVencimiento: dia(0), prioridad: "normal", quienObjeto: "contactos", quienId: contactos.laura },
    { asunto: "Preparar demostración", fechaVencimiento: dia(2), prioridad: "normal", relacionadoObjeto: "cuentas", relacionadoId: cuentas.horizonte },
    { asunto: "Actualizar datos de facturación", fechaVencimiento: dia(-1), prioridad: "baja", quienObjeto: "contactos", quienId: contactos.andres },
  ];
  for (const t of tareas) await nuevo("tareas", t);

  // La conversación de cada llamada vive en la bandeja (como la guarda la base de Machea): [{r: a|u, t: texto, s: segundo}].
  const conversaciones: Record<number, { s: number; r: "a" | "u"; t: string }[]> = {
    0: [
      { s: 1.5, r: "a", t: "Hola Valentina, te habla Manuela de Machea, por tu solicitud de información sobre Torres de Chapinero." },
      { s: 8.2, r: "u", t: "Hola, sí, claro." },
      { s: 10.1, r: "a", t: "Perfecto. Te llamo para confirmar tu interés y dejarte una cita con un asesor. ¿Tienes un minuto?" },
      { s: 17.0, r: "u", t: "Sí, dime." },
      { s: 18.4, r: "a", t: "¿Buscas el apartamento para vivir o para invertir?" },
      { s: 22.9, r: "u", t: "Para vivir con mi pareja. Ya tenemos la cuota inicial y queremos saber si aplica el subsidio Mi Casa Ya." },
      { s: 31.3, r: "a", t: "Buenísimo. Eso lo revisa mejor el asesor con tus ingresos. ¿Te sirve visitar la sala de ventas el sábado en la mañana?" },
      { s: 39.8, r: "u", t: "Me gustaría, pero primero quiero confirmar que entregan a tiempo." },
      { s: 44.0, r: "a", t: "Claro, el asesor te muestra el avance de obra y la fecha de entrega. Te escribo por WhatsApp para coordinar la hora." },
    ],
    4: [
      { s: 1.4, r: "a", t: "Hola Isabella, te habla Manuela de Machea. ¿Sigues interesada en Torres de Chapinero?" },
      { s: 7.0, r: "u", t: "Sí, ya conozco el proyecto y quiero ver el apartamento modelo." },
      { s: 12.2, r: "a", t: "Perfecto. ¿Tienes definido el presupuesto y decides tú sola?" },
      { s: 17.5, r: "u", t: "Sí, el presupuesto está confirmado y la decisión es mía." },
      { s: 22.0, r: "a", t: "Entonces te dejo una cita el jueves a las diez y media en la sala de ventas. ¿Te funciona?" },
      { s: 28.6, r: "u", t: "Perfecto, ahí estoy." },
    ],
    5: [
      { s: 1.6, r: "a", t: "Hola Tomás, te habla Manuela de Machea, por tu solicitud sobre Altos del Poblado." },
      { s: 7.4, r: "u", t: "Hola. Estoy comparando dos proyectos de la zona." },
      { s: 11.0, r: "a", t: "Entiendo. ¿Qué te gustaría resolver antes de decidir: precio, ubicación o algo del proyecto?" },
      { s: 17.2, r: "u", t: "El precio, el otro está más barato. Necesito apartamento de tres alcobas con doble parqueadero." },
      { s: 25.0, r: "a", t: "Claro. El asesor te envía la ficha con los precios y te llama mañana para resolver tus dudas." },
    ],
  };

  // Llamadas de Manuela de ejemplo, con la forma que les deja la ingesta (ingesta.ts). Si ya se cargaron, no se repiten.
  const llamadasManuela = [
    {
      i: 0,
      proyecto: "Torres de Chapinero",
      temp: "caliente",
      resumen: "Valentina busca un apartamento de 2 alcobas para vivir con su pareja y tiene la cuota inicial lista. Preguntó por el subsidio Mi Casa Ya y por el tiempo de entrega.",
      recomendacion: "Llámela hoy y ofrezca visitar la sala de ventas el sábado. Tenga a mano el valor de la cuota mensual y los requisitos del subsidio.",
      objecion: "Quiere confirmar que el proyecto entrega a tiempo.",
      cita: null as Date | null,
    },
    {
      i: 4,
      proyecto: "Torres de Chapinero",
      temp: "caliente",
      resumen: "Isabella ya conoce el proyecto y quiere ver el apartamento modelo. Confirmó presupuesto y que decide ella sola.",
      recomendacion: "Confirme la visita un día antes y lleve la simulación del crédito.",
      objecion: null as string | null,
      cita: hora(2, 10, 30),
    },
    {
      i: 5,
      proyecto: "Altos del Poblado",
      temp: "caliente",
      resumen: "Tomás pide un apartamento de 3 alcobas con parqueadero doble. Comparó dos proyectos y espera una respuesta esta semana.",
      recomendacion: "Envíe hoy la ficha con los precios y proponga una llamada corta mañana para resolver dudas.",
      objecion: "El precio frente a otro proyecto de la zona.",
      cita: null as Date | null,
    },
  ];
  for (const l of llamadasManuela) {
    const persona = idsCompradores[l.i];
    if (!persona) continue;
    try {
      await nuevo("tareas", {
        asunto: `Llamada de Manuela – ${l.proyecto}`,
        tipo: "llamada",
        estado: "completada",
        fechaVencimiento: dia(0),
        prioridad: "alta",
        comentarios: [l.resumen, `Recomendación para el asesor: ${l.recomendacion}`, l.objecion ? `Objeción principal: ${l.objecion}` : null, `Temperatura: ${l.temp}`].filter(Boolean).join("\n\n"),
        quienObjeto: "candidatos",
        quienId: persona,
        origenExterno: `llamada:ejemplo-${l.i}`,
      });
      await db
        .insert(bandejaLeads)
        .values({
          empresaId,
          origen: "resultado",
          origenId: `ejemplo-${l.i}`,
          procesadoEn: new Date(),
          datos: {
            duracion_ms: 48000,
            transcripcion: conversaciones[l.i] ?? [],
            // Solo para probar el reproductor en desarrollo (un archivo servido desde su propia máquina).
            ...(process.env.CRM_DEMO_AUDIO_URL && l.i === 0 ? { grabacion_url: process.env.CRM_DEMO_AUDIO_URL } : {}),
          },
        })
        .onConflictDoNothing();
      if (l.cita) {
        await nuevo("eventos", {
          asunto: `Cita – ${l.proyecto}`,
          descripcion: "Agendada por Manuela.",
          inicio: l.cita,
          fin: new Date(l.cita.getTime() + 3600000),
          ubicacion: "Sala de ventas",
          quienObjeto: "candidatos",
          quienId: persona,
          origenExterno: `cita:ejemplo-${l.i}`,
        });
      }
    } catch {
      // Ya estaban cargadas (origen externo repetido).
    }
  }

  await nuevo("articulos", {
    titulo: "Cómo exportar un informe a Excel",
    contenido: "## Pasos\n\n1. Abra el informe en **Análisis**.\n2. Pulse **Exportar**.\n3. Elija el formato CSV y ábralo con Excel.\n\n> Si el archivo sale con caracteres extraños, ábralo desde *Datos > Desde texto* y elija UTF-8.",
    visibleCliente: true,
    estado: "publicado",
    publicadoEn: new Date(),
  });
  await nuevo("articulos", {
    titulo: "Restablecer la contraseña de un usuario",
    contenido: "Un administrador puede crear usuarios desde **Configuración > Usuarios**. Para restablecer una contraseña, cree una nueva y compártala por un canal seguro.",
    estado: "borrador",
  });

  await nuevo("textos-rapidos", { nombre: "Saludo inicial", mensaje: "Hola {{Contacto.Nombre}}, gracias por escribirnos. ¿En qué podemos ayudarle hoy?", categoria: "saludos", canales: ["Correo electrónico", "Chat", "WhatsApp"] });
  await nuevo("textos-rapidos", { nombre: "Caso resuelto", mensaje: "Hemos resuelto su solicitud {{Caso.Numero}}. Si necesita algo más, responda a este mensaje.", categoria: "despedidas", canales: ["Correo electrónico"] });

  const campana = await nuevo("campanas", { nombre: "Feria de tecnología 2026", tipo: "evento", estado: "en_curso", fechaInicio: dia(-5), fechaFin: dia(20), presupuesto: 15000000, activa: true });
  await db
    .insert(miembrosCampana)
    .values([
      { empresaId, campanaId: campana, objeto: "contactos", registroId: contactos.laura },
      { empresaId, campanaId: campana, objeto: "contactos", registroId: contactos.diana },
    ])
    .onConflictDoNothing();

  await nuevo("sesiones-mensajeria", { canal: "whatsapp", contactoId: contactos.jorge, estado: "finalizada", inicio: hora(-1, 10), fin: hora(-1, 10, 20), resumen: "Consulta sobre el estado del caso de sincronización." });
  await nuevo("videollamadas", { asunto: "Kickoff de implementación", inicio: hora(4, 14), duracionMinutos: 45, enlace: "https://meet.example/kickoff", relacionadoObjeto: "cuentas", relacionadoId: cuentas.textiles });

  await db.insert(flujos).values({
    empresaId,
    nombre: "Seguimiento de leads calientes",
    descripcion: "Crea una tarea de llamada y avisa al propietario cuando entra un lead con temperatura Caliente.",
    objeto: "candidatos",
    disparador: "crear_o_actualizar",
    condiciones: [{ campo: "valoracion", operador: "igual", valor: "caliente" }, { campo: "valoracion", operador: "cambia" }],
    acciones: [
      { tipo: "crear_tarea", asunto: "Llamar al lead en menos de 24 horas", diasVencimiento: 1, prioridad: "alta" },
      { tipo: "notificar", titulo: "Nuevo lead caliente", mensaje: "Revise y contacte pronto" },
    ],
    activo: true,
    propietarioId: usuarioId,
    creadoPorId: usuarioId,
  });
  return total;
}
