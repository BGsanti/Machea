import { and, eq } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { entradasListaPrecios, flujos, listasPrecios, miembrosCampana } from "@/db/esquema";
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

  const candidatos = [
    { nombre: "Valentina", apellidos: "Ríos", compania: "Panadería La Espiga", estado: "nuevo", valoracion: "caliente", origen: "web", sector: "alimentos", ciudad: "Pereira", estadoProvincia: "Risaralda", email: "valentina@laespiga.example", telefono: "+57 312 555 1001" },
    { nombre: "Santiago", apellidos: "Herrera", compania: "AgroSur", estado: "contactado", valoracion: "tibio", origen: "feria", sector: "agricultura", ciudad: "Neiva", estadoProvincia: "Huila", email: "santiago@agrosur.example" },
    { nombre: "Mariana", apellidos: "López", compania: "EduTech Colombia", estado: "en_seguimiento", valoracion: "tibio", origen: "referencia_externa", sector: "educacion", ciudad: "Bogotá", estadoProvincia: "Cundinamarca", email: "mariana@edutech.example" },
    { nombre: "Daniel", apellidos: "Castro", compania: "Ferretería El Tornillo", estado: "nuevo", valoracion: "frio", origen: "publicidad", sector: "comercio", ciudad: "Bucaramanga", estadoProvincia: "Santander", telefono: "+57 317 555 1004" },
    { nombre: "Isabella", apellidos: "Moreno", compania: "Hotel Mar Azul", estado: "calificado", valoracion: "caliente", origen: "socio", sector: "hoteleria", ciudad: "Santa Marta", estadoProvincia: "Magdalena", email: "reservas@marazul.example" },
    { nombre: "Tomás", apellidos: "Jiménez", compania: "Energía Solar Andes", estado: "contactado", valoracion: "caliente", origen: "web", sector: "energia", ciudad: "Manizales", estadoProvincia: "Caldas", email: "tomas@solarandes.example", numeroEmpleados: 45, ingresosAnuales: 3200000000 },
    { nombre: "Sofía", apellidos: "Ramírez", compania: "Consultores Ramírez", estado: "no_calificado", valoracion: "frio", origen: "boca_a_boca", sector: "consultoria", ciudad: "Cartagena", estadoProvincia: "Bolívar" },
  ];
  for (const c of candidatos) await nuevo("candidatos", { ...c, pais: "Colombia" });

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
    nombre: "Seguimiento de candidatos calientes",
    descripcion: "Crea una tarea de llamada y avisa al propietario cuando entra un candidato con valoración Caliente.",
    objeto: "candidatos",
    disparador: "crear_o_actualizar",
    condiciones: [{ campo: "valoracion", operador: "igual", valor: "caliente" }, { campo: "valoracion", operador: "cambia" }],
    acciones: [
      { tipo: "crear_tarea", asunto: "Llamar al candidato en menos de 24 horas", diasVencimiento: 1, prioridad: "alta" },
      { tipo: "notificar", titulo: "Nuevo candidato caliente", mensaje: "Revise y contacte pronto" },
    ],
    activo: true,
    propietarioId: usuarioId,
    creadoPorId: usuarioId,
  });
  return total;
}
