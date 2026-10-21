import * as op from "./opciones";
import type { Campo, DefObjeto, VistaLista } from "./tipos";

const propietario: Campo = { nombre: "propietarioId", etiqueta: "Propietario", tipo: "busqueda", objetoDestino: "usuarios" };
const creadoEn: Campo = { nombre: "creadoEn", etiqueta: "Fecha de creación", tipo: "fechaHora", soloLectura: true };
const actualizadoEn: Campo = {
  nombre: "actualizadoEn",
  etiqueta: "Última modificación",
  tipo: "fechaHora",
  soloLectura: true,
};
const sistema = [propietario, creadoEn, actualizadoEn];

const recientes: VistaLista = { id: "recientes", etiqueta: "Vistos recientemente", recientes: true };
const todos = (etiqueta: string): VistaLista => ({ id: "todos", etiqueta });
const mios = (etiqueta: string): VistaLista => ({ id: "mios", etiqueta, soloMios: true });

const direccion = (prefijo: string, etiqueta: string, campos: Campo[]) => {
  const nombres = ["Pais", "Calle", "Ciudad", "Estado", "CodigoPostal"];
  const etiquetas = ["País", "Calle", "Ciudad", "Estado o provincia", "Código postal"];
  nombres.forEach((n, i) =>
    campos.push({ nombre: `${prefijo}${n}`, etiqueta: `${etiquetas[i]} de ${etiqueta}`, tipo: "texto" }),
  );
  return { grupo: `Dirección de ${etiqueta}`, campos: nombres.map((n) => `${prefijo}${n}`) };
};

// ---------------------------------------------------------------------------

const camposCuenta: Campo[] = [
  { nombre: "nombre", etiqueta: "Nombre de la cuenta", tipo: "texto", requerido: true },
  { nombre: "sitioWeb", etiqueta: "Sitio web", tipo: "url" },
  { nombre: "tipo", etiqueta: "Tipo", tipo: "lista", opciones: op.tiposCuenta },
  { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
  { nombre: "cuentaPrincipalId", etiqueta: "Cuenta principal", tipo: "busqueda", objetoDestino: "cuentas" },
  { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono" },
  ...sistema,
];
const facturacion = direccion("facturacion", "facturación", camposCuenta);
const envio = direccion("envio", "envío", camposCuenta);

const cuentas: DefObjeto = {
  api: "cuentas",
  etiqueta: "Cuenta",
  etiquetaPlural: "Cuentas",
  genero: "f",
  icono: "Building",
  color: "bg-indigo-500",
  camposNombre: ["nombre"],
  campos: camposCuenta,
  secciones: [
    { titulo: "Información", campos: ["nombre", "sitioWeb", "tipo", "descripcion", "cuentaPrincipalId"] },
    { titulo: "Contacto", campos: ["telefono", facturacion, envio] },
  ],
  columnas: ["nombre", "telefono", "sitioWeb", "facturacionCiudad", "facturacionEstado", "propietarioId"],
  vistas: [todos("Todas las cuentas"), mios("Mis cuentas"), recientes],
  vistaPorDefecto: "todos",
  busqueda: ["nombre", "telefono", "sitioWeb", "facturacionCiudad"],
  camposResaltados: ["tipo", "telefono", "sitioWeb", "propietarioId"],
  relacionadas: [
    { objeto: "contactos", campo: "cuentaId", titulo: "Contactos", columnas: ["nombre", "cargo", "email", "telefono"] },
    { objeto: "oportunidades", campo: "cuentaId", titulo: "Oportunidades", columnas: ["nombre", "etapa", "importe", "fechaCierre"] },
    { objeto: "casos", campo: "cuentaId", titulo: "Casos", columnas: ["numero", "asunto", "estado", "prioridad"] },
    { objeto: "facturas", campo: "cuentaId", titulo: "Facturas", columnas: ["numero", "estado", "total", "fechaEmision"] },
    { objeto: "cuentas", campo: "cuentaPrincipalId", titulo: "Cuentas dependientes", columnas: ["nombre", "tipo", "telefono"] },
  ],
  actividades: true,
  acciones: { nuevo: true, importar: true, cambiarPropietario: true },
  vacio: {
    titulo: "Las cuentas muestran dónde trabajan sus contactos",
    texto: "Agrupe contactos, oportunidades y casos por empresa para seguir mejor cada relación.",
    boton: "Agregar una cuenta",
  },
};

// ---------------------------------------------------------------------------

const camposContacto: Campo[] = [
  { nombre: "tratamiento", etiqueta: "Tratamiento", tipo: "lista", opciones: op.tratamientos },
  { nombre: "nombre", etiqueta: "Nombre", tipo: "texto" },
  { nombre: "apellidos", etiqueta: "Apellidos", tipo: "texto", requerido: true },
  { nombre: "cuentaId", etiqueta: "Cuenta", tipo: "busqueda", objetoDestino: "cuentas", requerido: true },
  { nombre: "cargo", etiqueta: "Cargo", tipo: "texto" },
  { nombre: "supervisorId", etiqueta: "Supervisor", tipo: "busqueda", objetoDestino: "contactos" },
  { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
  { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono" },
  { nombre: "email", etiqueta: "Correo electrónico", tipo: "email" },
  ...sistema,
];
const correo = direccion("correo", "correo", camposContacto);

const contactos: DefObjeto = {
  api: "contactos",
  etiqueta: "Contacto",
  etiquetaPlural: "Contactos",
  genero: "m",
  icono: "Contact",
  color: "bg-fuchsia-500",
  camposNombre: ["nombre", "apellidos"],
  campos: camposContacto,
  secciones: [
    {
      titulo: "Información",
      campos: [{ grupo: "Nombre completo", campos: ["tratamiento", "nombre", "apellidos"] }, "cuentaId", "cargo", "supervisorId", "descripcion"],
    },
    { titulo: "Contacto", campos: ["telefono", "email", correo] },
  ],
  columnas: ["nombre", "cuentaId", "cargo", "telefono", "email", "propietarioId"],
  vistas: [todos("Todos los contactos"), mios("Mis contactos"), recientes],
  vistaPorDefecto: "todos",
  busqueda: ["nombre", "apellidos", "email", "telefono", "cargo"],
  camposResaltados: ["cuentaId", "cargo", "telefono", "email"],
  relacionadas: [
    { objeto: "casos", campo: "contactoId", titulo: "Casos", columnas: ["numero", "asunto", "estado", "prioridad"] },
    { objeto: "sesiones-mensajeria", campo: "contactoId", titulo: "Sesiones de mensajería", columnas: ["canal", "estado", "inicio"] },
    { objeto: "contactos", campo: "supervisorId", titulo: "Le reportan", columnas: ["nombre", "cargo", "email"] },
  ],
  actividades: true,
  acciones: { nuevo: true, importar: true, enviarCorreo: true, agregarCampana: true, cambiarPropietario: true },
  vacio: {
    titulo: "Los mejores vendedores empiezan por sus contactos",
    texto: "Es la forma más rápida de cerrar más acuerdos.",
    boton: "Agregar un contacto",
  },
};

// ---------------------------------------------------------------------------

const camposCandidato: Campo[] = [
  { nombre: "estado", etiqueta: "Estado del lead", tipo: "lista", opciones: op.estadosCandidato, requerido: true, porDefecto: "nuevo" },
  { nombre: "tratamiento", etiqueta: "Tratamiento", tipo: "lista", opciones: op.tratamientos },
  { nombre: "nombre", etiqueta: "Nombre", tipo: "texto" },
  { nombre: "apellidos", etiqueta: "Apellidos", tipo: "texto", requerido: true },
  { nombre: "compania", etiqueta: "Compañía", tipo: "texto", requerido: true },
  { nombre: "cargo", etiqueta: "Cargo", tipo: "texto" },
  { nombre: "sitioWeb", etiqueta: "Sitio web", tipo: "url" },
  { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
  { nombre: "valoracion", etiqueta: "Valoración", tipo: "lista", opciones: op.valoraciones },
  { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono" },
  { nombre: "email", etiqueta: "Correo electrónico", tipo: "email" },
  { nombre: "pais", etiqueta: "País", tipo: "texto" },
  { nombre: "calle", etiqueta: "Calle", tipo: "texto" },
  { nombre: "ciudad", etiqueta: "Ciudad", tipo: "texto" },
  { nombre: "estadoProvincia", etiqueta: "Estado o provincia", tipo: "texto" },
  { nombre: "codigoPostal", etiqueta: "Código postal", tipo: "texto" },
  { nombre: "numeroEmpleados", etiqueta: "Número de empleados", tipo: "numero" },
  { nombre: "ingresosAnuales", etiqueta: "Ingresos anuales", tipo: "moneda" },
  { nombre: "origen", etiqueta: "Origen del lead", tipo: "lista", opciones: op.origenesCandidato },
  { nombre: "sector", etiqueta: "Sector", tipo: "lista", opciones: op.sectores },
  { nombre: "convertido", etiqueta: "Convertido", tipo: "casilla", soloLectura: true },
  { nombre: "convertidoEn", etiqueta: "Fecha de conversión", tipo: "fechaHora", soloLectura: true },
  { nombre: "cuentaConvertidaId", etiqueta: "Cuenta convertida", tipo: "busqueda", objetoDestino: "cuentas", soloLectura: true },
  { nombre: "contactoConvertidoId", etiqueta: "Contacto convertido", tipo: "busqueda", objetoDestino: "contactos", soloLectura: true },
  { nombre: "oportunidadConvertidaId", etiqueta: "Oportunidad convertida", tipo: "busqueda", objetoDestino: "oportunidades", soloLectura: true },
  ...sistema,
];

const candidatos: DefObjeto = {
  api: "candidatos",
  etiqueta: "Lead",
  etiquetaPlural: "Leads",
  genero: "m",
  icono: "UserPlus",
  color: "bg-orange-500",
  camposNombre: ["nombre", "apellidos"],
  campos: camposCandidato,
  secciones: [
    {
      titulo: "Información",
      campos: ["estado", { grupo: "Nombre completo", campos: ["tratamiento", "nombre", "apellidos"] }, "compania", "cargo", "sitioWeb", "descripcion", "valoracion"],
    },
    {
      titulo: "Contacto",
      campos: ["telefono", "email", { grupo: "Dirección", campos: ["pais", "calle", "ciudad", "estadoProvincia", "codigoPostal"] }],
    },
    { titulo: "Segmento", campos: ["numeroEmpleados", "ingresosAnuales", "origen", "sector"] },
    { titulo: "Conversión", campos: ["convertido", "convertidoEn", "cuentaConvertidaId", "contactoConvertidoId", "oportunidadConvertidaId"] },
  ],
  columnas: ["nombre", "compania", "estadoProvincia", "telefono", "email", "estado", "creadoEn", "propietarioId"],
  vistas: [
    { id: "abiertos", etiqueta: "Todos los leads abiertos", condiciones: [{ campo: "convertido", operador: "falso" }] },
    { id: "mios", etiqueta: "Mis leads", soloMios: true, condiciones: [{ campo: "convertido", operador: "falso" }] },
    { id: "convertidos", etiqueta: "Leads convertidos", condiciones: [{ campo: "convertido", operador: "verdadero" }] },
    todos("Todos los leads"),
    recientes,
  ],
  vistaPorDefecto: "abiertos",
  busqueda: ["nombre", "apellidos", "compania", "email", "telefono"],
  camposResaltados: ["compania", "cargo", "telefono", "email"],
  campoRuta: "estado",
  campoKanban: "estado",
  actividades: true,
  acciones: { nuevo: true, importar: true, agregarCampana: true, enviarCorreo: true, cambiarPropietario: true },
  vacio: {
    titulo: "Céntrese en los leads correctos",
    texto: "Los leads son personas interesadas en comprar. Siga su progreso y vea cuáles tienen más probabilidades de cerrarse.",
    boton: "Agregar un lead",
  },
};

// ---------------------------------------------------------------------------

const oportunidades: DefObjeto = {
  api: "oportunidades",
  etiqueta: "Oportunidad",
  etiquetaPlural: "Oportunidades",
  genero: "f",
  icono: "Crown",
  color: "bg-amber-500",
  camposNombre: ["nombre"],
  campos: [
    { nombre: "nombre", etiqueta: "Nombre de la oportunidad", tipo: "texto", requerido: true },
    { nombre: "cuentaId", etiqueta: "Cuenta", tipo: "busqueda", objetoDestino: "cuentas" },
    { nombre: "fechaCierre", etiqueta: "Fecha de cierre", tipo: "fecha", requerido: true },
    { nombre: "importe", etiqueta: "Importe", tipo: "moneda" },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
    { nombre: "etapa", etiqueta: "Etapa", tipo: "lista", opciones: op.etapasOportunidad, requerido: true, porDefecto: "calificar" },
    { nombre: "probabilidad", etiqueta: "Probabilidad (%)", tipo: "porcentaje" },
    { nombre: "categoriaPrevision", etiqueta: "Categoría de previsión", tipo: "lista", opciones: op.categoriasPrevision, requerido: true, porDefecto: "pipeline" },
    { nombre: "siguientePaso", etiqueta: "Siguiente paso", tipo: "texto" },
    { nombre: "origen", etiqueta: "Origen", tipo: "lista", opciones: op.origenesCandidato },
    { nombre: "listaPreciosId", etiqueta: "Lista de precios", tipo: "busqueda", objetoDestino: "listas-precios" },
    ...sistema,
  ],
  secciones: [
    { titulo: "Información", campos: ["nombre", "cuentaId", "fechaCierre", "importe", "descripcion", "origen"] },
    { titulo: "Estado", campos: ["etapa", "probabilidad", "categoriaPrevision", "siguientePaso"] },
  ],
  columnas: ["nombre", "cuentaId", "importe", "fechaCierre", "etapa", "propietarioId"],
  vistas: [
    todos("Todas las oportunidades"),
    mios("Mis oportunidades"),
    { id: "abiertas", etiqueta: "Oportunidades abiertas", condiciones: [{ campo: "etapa", operador: "no_en", valor: op.etapasCerradas }] },
    { id: "este_mes", etiqueta: "Cierran este mes", condiciones: [{ campo: "fechaCierre", operador: "este_mes" }] },
    { id: "ganadas", etiqueta: "Ganadas", condiciones: [{ campo: "etapa", operador: "igual", valor: "cerrada_ganada" }] },
    recientes,
  ],
  vistaPorDefecto: "todos",
  busqueda: ["nombre", "siguientePaso"],
  camposResaltados: ["cuentaId", "fechaCierre", "importe", "propietarioId"],
  campoRuta: "etapa",
  campoKanban: "etapa",
  campoSumaKanban: "importe",
  relacionadas: [
    { objeto: "productos-oportunidad", campo: "oportunidadId", titulo: "Productos", columnas: ["productoId", "cantidad", "precioUnitario", "descuento"] },
    { objeto: "facturas", campo: "oportunidadId", titulo: "Facturas", columnas: ["numero", "estado", "total", "fechaEmision"] },
  ],
  actividades: true,
  acciones: { nuevo: true, importar: true, cambiarPropietario: true },
  vacio: { titulo: "Nada que ver aquí", texto: "Registre sus acuerdos en curso para prever ingresos y no perder ninguna venta." },
};

// ---------------------------------------------------------------------------

const productos: DefObjeto = {
  api: "productos",
  etiqueta: "Producto",
  etiquetaPlural: "Productos",
  genero: "m",
  icono: "Package",
  color: "bg-emerald-600",
  camposNombre: ["nombre"],
  campos: [
    { nombre: "nombre", etiqueta: "Nombre del producto", tipo: "texto", requerido: true },
    { nombre: "familia", etiqueta: "Familia de productos", tipo: "lista", opciones: op.familiasProducto },
    { nombre: "codigo", etiqueta: "Código de producto", tipo: "texto" },
    { nombre: "sku", etiqueta: "SKU", tipo: "texto" },
    { nombre: "activo", etiqueta: "Activo", tipo: "casilla", porDefecto: true },
    { nombre: "descripcion", etiqueta: "Descripción del producto", tipo: "areaTexto" },
    ...sistema,
  ],
  secciones: [{ titulo: "Información del producto", campos: ["nombre", "familia", "codigo", "sku", "activo", "descripcion"] }],
  columnas: ["nombre", "codigo", "familia", "activo", "propietarioId"],
  vistas: [todos("Todos los productos"), { id: "activos", etiqueta: "Productos activos", condiciones: [{ campo: "activo", operador: "verdadero" }] }, recientes],
  vistaPorDefecto: "todos",
  busqueda: ["nombre", "codigo", "sku"],
  camposResaltados: ["codigo", "familia", "activo"],
  relacionadas: [
    { objeto: "entradas-lista-precios", campo: "productoId", titulo: "Precios", columnas: ["listaPreciosId", "precio", "activo"] },
  ],
  acciones: { nuevo: true, importar: true },
  vacio: { titulo: "Nada que ver aquí", texto: "Cree su catálogo para agregar productos a oportunidades y facturas." },
};

const listasPrecios: DefObjeto = {
  api: "listas-precios",
  etiqueta: "Lista de precios",
  etiquetaPlural: "Listas de precios",
  genero: "f",
  icono: "BookOpen",
  color: "bg-teal-600",
  camposNombre: ["nombre"],
  campos: [
    { nombre: "nombre", etiqueta: "Nombre de la lista de precios", tipo: "texto", requerido: true },
    { nombre: "activo", etiqueta: "Activa", tipo: "casilla", porDefecto: true },
    { nombre: "estandar", etiqueta: "Lista estándar", tipo: "casilla", soloLectura: true },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
    { nombre: "validoDesde", etiqueta: "Válida desde", tipo: "fechaHora" },
    { nombre: "validoHasta", etiqueta: "Válida hasta", tipo: "fechaHora" },
    ...sistema,
  ],
  secciones: [{ titulo: "Información", campos: ["nombre", "activo", "descripcion", "validoDesde", "validoHasta"] }],
  columnas: ["nombre", "activo", "estandar", "validoDesde", "validoHasta"],
  vistas: [todos("Todas las listas de precios"), recientes],
  vistaPorDefecto: "todos",
  busqueda: ["nombre"],
  camposResaltados: ["activo", "validoDesde", "validoHasta"],
  relacionadas: [
    { objeto: "entradas-lista-precios", campo: "listaPreciosId", titulo: "Productos de la lista", columnas: ["productoId", "precio", "activo"] },
  ],
  acciones: { nuevo: true },
};

const entradasListaPrecios: DefObjeto = {
  api: "entradas-lista-precios",
  etiqueta: "Precio de producto",
  etiquetaPlural: "Precios de productos",
  genero: "m",
  icono: "Tag",
  color: "bg-teal-600",
  camposNombre: ["productoId"],
  campos: [
    { nombre: "listaPreciosId", etiqueta: "Lista de precios", tipo: "busqueda", objetoDestino: "listas-precios", requerido: true },
    { nombre: "productoId", etiqueta: "Producto", tipo: "busqueda", objetoDestino: "productos", requerido: true },
    { nombre: "precio", etiqueta: "Precio", tipo: "moneda", requerido: true },
    { nombre: "activo", etiqueta: "Activo", tipo: "casilla", porDefecto: true },
    ...sistema,
  ],
  secciones: [{ titulo: "Precio", campos: ["listaPreciosId", "productoId", "precio", "activo"] }],
  columnas: ["productoId", "listaPreciosId", "precio", "activo"],
  vistas: [todos("Todos los precios")],
  vistaPorDefecto: "todos",
  busqueda: [],
  camposResaltados: ["precio", "activo"],
  acciones: { nuevo: true },
  hijo: true,
};

const productosOportunidad: DefObjeto = {
  api: "productos-oportunidad",
  etiqueta: "Producto de oportunidad",
  etiquetaPlural: "Productos de oportunidad",
  genero: "m",
  icono: "Package",
  color: "bg-emerald-600",
  camposNombre: ["productoId"],
  campos: [
    { nombre: "oportunidadId", etiqueta: "Oportunidad", tipo: "busqueda", objetoDestino: "oportunidades", requerido: true },
    { nombre: "productoId", etiqueta: "Producto", tipo: "busqueda", objetoDestino: "productos", requerido: true },
    { nombre: "cantidad", etiqueta: "Cantidad", tipo: "numero", requerido: true, porDefecto: 1 },
    { nombre: "precioUnitario", etiqueta: "Precio unitario", tipo: "moneda", requerido: true },
    { nombre: "descuento", etiqueta: "Descuento (%)", tipo: "porcentaje" },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "texto" },
    ...sistema,
  ],
  secciones: [{ titulo: "Producto", campos: ["oportunidadId", "productoId", "cantidad", "precioUnitario", "descuento", "descripcion"] }],
  columnas: ["productoId", "cantidad", "precioUnitario", "descuento"],
  vistas: [todos("Todos")],
  vistaPorDefecto: "todos",
  busqueda: [],
  camposResaltados: ["cantidad", "precioUnitario"],
  acciones: { nuevo: true },
  hijo: true,
};

// ---------------------------------------------------------------------------

const camposActividad = (incluirNombre: boolean): Campo[] => [
  ...(incluirNombre
    ? [{ nombre: "quien", etiqueta: "Nombre", tipo: "polimorfico", objetosPermitidos: ["contactos", "candidatos"] } satisfies Campo]
    : []),
  {
    nombre: "relacionado",
    etiqueta: "Relacionado con",
    tipo: "polimorfico",
    objetosPermitidos: ["cuentas", "oportunidades", "casos", "campanas", "productos"],
  },
];

const eventos: DefObjeto = {
  api: "eventos",
  etiqueta: "Evento",
  etiquetaPlural: "Eventos",
  genero: "m",
  icono: "CalendarDays",
  color: "bg-pink-500",
  camposNombre: ["asunto"],
  campos: [
    { nombre: "asunto", etiqueta: "Asunto", tipo: "texto", requerido: true, sugerencias: op.asuntosEvento },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
    { nombre: "inicio", etiqueta: "Inicio", tipo: "fechaHora", requerido: true },
    { nombre: "fin", etiqueta: "Fin", tipo: "fechaHora", requerido: true },
    ...camposActividad(true),
    { nombre: "ubicacion", etiqueta: "Ubicación", tipo: "texto" },
    { nombre: "todoElDia", etiqueta: "Evento de todo el día", tipo: "casilla" },
    { nombre: "privado", etiqueta: "Privado", tipo: "casilla" },
    ...sistema,
  ],
  secciones: [
    { titulo: "Evento", campos: ["asunto", "descripcion", "inicio", "fin"] },
    { titulo: "Registros relacionados", campos: ["quien", "relacionado"] },
    { titulo: "Información adicional", campos: ["ubicacion", "todoElDia", "privado"] },
  ],
  columnas: ["asunto", "inicio", "fin", "ubicacion", "propietarioId"],
  vistas: [mios("Mis eventos"), todos("Todos los eventos"), recientes],
  vistaPorDefecto: "mios",
  busqueda: ["asunto", "ubicacion"],
  camposResaltados: ["inicio", "fin", "ubicacion"],
  acciones: { nuevo: true },
};

const tareas: DefObjeto = {
  api: "tareas",
  etiqueta: "Tarea",
  etiquetaPlural: "Tareas",
  genero: "f",
  icono: "ListChecks",
  color: "bg-lime-600",
  camposNombre: ["asunto"],
  campos: [
    { nombre: "asunto", etiqueta: "Asunto", tipo: "texto", requerido: true, sugerencias: ["Llamar", "Enviar correo", "Enviar presupuesto", "Hacer seguimiento", "Otro"] },
    { nombre: "tipo", etiqueta: "Tipo", tipo: "lista", opciones: op.tiposTarea, porDefecto: "tarea" },
    { nombre: "fechaVencimiento", etiqueta: "Fecha de vencimiento", tipo: "fecha" },
    { nombre: "comentarios", etiqueta: "Comentarios", tipo: "areaTexto" },
    ...camposActividad(true),
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosTarea, requerido: true, porDefecto: "no_iniciada" },
    { nombre: "prioridad", etiqueta: "Prioridad", tipo: "lista", opciones: op.prioridadesTarea, requerido: true, porDefecto: "normal" },
    { nombre: "completadaEn", etiqueta: "Completada el", tipo: "fechaHora", soloLectura: true },
    ...sistema,
  ],
  secciones: [
    { titulo: "Información de la tarea", campos: ["relacionado", "asunto", "quien", "fechaVencimiento", "comentarios"] },
    { titulo: "Información adicional", campos: ["estado", "prioridad", "tipo"] },
  ],
  columnas: ["asunto", "fechaVencimiento", "estado", "prioridad", "propietarioId"],
  vistas: [
    { id: "mias_abiertas", etiqueta: "Mis tareas abiertas", soloMios: true, condiciones: [{ campo: "estado", operador: "distinto", valor: "completada" }] },
    { id: "vencidas", etiqueta: "Vencidas", soloMios: true, condiciones: [{ campo: "fechaVencimiento", operador: "antes_de_hoy" }, { campo: "estado", operador: "distinto", valor: "completada" }] },
    { id: "hoy", etiqueta: "Para hoy", soloMios: true, condiciones: [{ campo: "fechaVencimiento", operador: "hoy" }] },
    { id: "completadas", etiqueta: "Completadas", soloMios: true, condiciones: [{ campo: "estado", operador: "igual", valor: "completada" }] },
    todos("Todas las tareas"),
  ],
  vistaPorDefecto: "mias_abiertas",
  busqueda: ["asunto", "comentarios"],
  camposResaltados: ["fechaVencimiento", "estado", "prioridad"],
  campoKanban: "estado",
  acciones: { nuevo: true, cambiarPropietario: true },
};

// ---------------------------------------------------------------------------

const facturas: DefObjeto = {
  api: "facturas",
  etiqueta: "Factura",
  etiquetaPlural: "Facturas",
  genero: "f",
  icono: "Receipt",
  color: "bg-cyan-600",
  camposNombre: ["numero"],
  campos: [
    { nombre: "numero", etiqueta: "Número", tipo: "autonumero", formato: "FAC-{0}", soloLectura: true },
    { nombre: "cuentaId", etiqueta: "Cuenta", tipo: "busqueda", objetoDestino: "cuentas" },
    { nombre: "oportunidadId", etiqueta: "Oportunidad", tipo: "busqueda", objetoDestino: "oportunidades", soloLectura: true },
    { nombre: "fechaEmision", etiqueta: "Fecha de emisión", tipo: "fecha", requerido: true },
    { nombre: "fechaVencimiento", etiqueta: "Fecha de vencimiento", tipo: "fecha" },
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosFactura, requerido: true, porDefecto: "borrador" },
    { nombre: "subtotal", etiqueta: "Subtotal", tipo: "moneda", soloLectura: true },
    { nombre: "impuestos", etiqueta: "Impuestos", tipo: "moneda", soloLectura: true },
    { nombre: "total", etiqueta: "Total", tipo: "moneda", soloLectura: true },
    { nombre: "notas", etiqueta: "Notas", tipo: "areaTexto" },
    ...sistema,
  ],
  secciones: [
    { titulo: "Factura", campos: ["numero", "cuentaId", "oportunidadId", "fechaEmision", "fechaVencimiento", "estado"] },
    { titulo: "Importes", campos: ["subtotal", "impuestos", "total"] },
    { titulo: "Notas", campos: ["notas"] },
  ],
  columnas: ["numero", "cuentaId", "fechaEmision", "fechaVencimiento", "estado", "total"],
  vistas: [todos("Todas las facturas"), { id: "pendientes", etiqueta: "Pendientes de pago", condiciones: [{ campo: "estado", operador: "en", valor: ["emitida", "vencida"] }] }, recientes],
  vistaPorDefecto: "todos",
  busqueda: [],
  camposResaltados: ["cuentaId", "estado", "total", "fechaVencimiento"],
  campoRuta: "estado",
  acciones: { editar: true },
  vacio: { titulo: "Nada que ver aquí", texto: "Las facturas se generan desde una oportunidad con productos." },
};

const videollamadas: DefObjeto = {
  api: "videollamadas",
  etiqueta: "Videollamada",
  etiquetaPlural: "Videollamadas",
  genero: "f",
  icono: "Video",
  color: "bg-blue-600",
  camposNombre: ["asunto"],
  campos: [
    { nombre: "asunto", etiqueta: "Asunto", tipo: "texto", requerido: true },
    { nombre: "inicio", etiqueta: "Inicio", tipo: "fechaHora", requerido: true },
    { nombre: "duracionMinutos", etiqueta: "Duración (minutos)", tipo: "numero", porDefecto: 30 },
    { nombre: "enlace", etiqueta: "Enlace de la reunión", tipo: "url" },
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosVideollamada, porDefecto: "programada" },
    {
      nombre: "relacionado",
      etiqueta: "Relacionado con",
      tipo: "polimorfico",
      objetosPermitidos: ["contactos", "candidatos", "cuentas", "oportunidades", "casos"],
    },
    { nombre: "notas", etiqueta: "Notas", tipo: "areaTexto" },
    ...sistema,
  ],
  secciones: [{ titulo: "Videollamada", campos: ["asunto", "inicio", "duracionMinutos", "enlace", "estado", "relacionado", "notas"] }],
  columnas: ["asunto", "inicio", "duracionMinutos", "estado", "propietarioId"],
  vistas: [todos("Todas las videollamadas"), mios("Mis videollamadas"), recientes],
  vistaPorDefecto: "todos",
  busqueda: ["asunto"],
  camposResaltados: ["inicio", "duracionMinutos", "estado", "enlace"],
  acciones: { nuevo: true },
};

// ---------------------------------------------------------------------------

const casos: DefObjeto = {
  api: "casos",
  etiqueta: "Caso",
  etiquetaPlural: "Casos",
  genero: "m",
  icono: "Briefcase",
  color: "bg-rose-500",
  camposNombre: ["numero"],
  campos: [
    { nombre: "numero", etiqueta: "Número de caso", tipo: "autonumero", formato: "{0}", soloLectura: true },
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosCaso, requerido: true, porDefecto: "nuevo" },
    { nombre: "origen", etiqueta: "Origen del caso", tipo: "lista", opciones: op.origenesCaso },
    { nombre: "prioridad", etiqueta: "Prioridad", tipo: "lista", opciones: op.prioridadesCaso, requerido: true, porDefecto: "media" },
    { nombre: "contactoId", etiqueta: "Contacto", tipo: "busqueda", objetoDestino: "contactos" },
    { nombre: "cuentaId", etiqueta: "Cuenta", tipo: "busqueda", objetoDestino: "cuentas" },
    { nombre: "asunto", etiqueta: "Asunto", tipo: "texto" },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
    { nombre: "notificarContacto", etiqueta: "Enviar correo de notificación al contacto", tipo: "casilla" },
    { nombre: "cerradoEn", etiqueta: "Fecha de cierre", tipo: "fechaHora", soloLectura: true },
    ...sistema,
  ],
  secciones: [
    { titulo: "Información del caso", campos: ["estado", "origen", "prioridad"] },
    { titulo: "Información del contacto", campos: ["contactoId", "cuentaId"] },
    { titulo: "Descripción", campos: ["asunto", "descripcion", "notificarContacto"] },
  ],
  columnas: ["numero", "asunto", "contactoId", "estado", "prioridad", "creadoEn", "propietarioId"],
  vistas: [
    { id: "abiertos", etiqueta: "Casos abiertos", condiciones: [{ campo: "estado", operador: "distinto", valor: "cerrado" }] },
    { id: "mios", etiqueta: "Mis casos abiertos", soloMios: true, condiciones: [{ campo: "estado", operador: "distinto", valor: "cerrado" }] },
    { id: "cerrados", etiqueta: "Casos cerrados", condiciones: [{ campo: "estado", operador: "igual", valor: "cerrado" }] },
    todos("Todos los casos"),
    recientes,
  ],
  vistaPorDefecto: "abiertos",
  busqueda: ["asunto", "descripcion"],
  camposResaltados: ["prioridad", "estado", "contactoId", "cuentaId"],
  campoRuta: "estado",
  campoKanban: "estado",
  actividades: true,
  acciones: { nuevo: true, cambiarPropietario: true },
  vacio: { titulo: "Nada que ver aquí", texto: "Registre las solicitudes de sus clientes para darles seguimiento hasta resolverlas." },
};

const textosRapidos: DefObjeto = {
  api: "textos-rapidos",
  etiqueta: "Texto rápido",
  etiquetaPlural: "Textos rápidos",
  genero: "m",
  icono: "MessageSquareText",
  color: "bg-sky-600",
  camposNombre: ["nombre"],
  campos: [
    { nombre: "nombre", etiqueta: "Nombre del texto rápido", tipo: "texto", requerido: true },
    { nombre: "mensaje", etiqueta: "Mensaje", tipo: "areaTexto", requerido: true, ayuda: "Puede insertar campos como {{Contacto.Nombre}}." },
    { nombre: "carpetaId", etiqueta: "Carpeta", tipo: "busqueda", objetoDestino: "carpetas-texto" },
    { nombre: "categoria", etiqueta: "Categoría", tipo: "lista", opciones: op.categoriasTexto },
    { nombre: "canales", etiqueta: "Canales", tipo: "listaMultiple", opciones: op.canalesTexto.map((c) => ({ valor: c, etiqueta: c })) },
    { nombre: "favorito", etiqueta: "Favorito", tipo: "casilla" },
    ...sistema,
  ],
  secciones: [{ titulo: "Texto rápido", campos: ["nombre", "mensaje", "carpetaId", "categoria", "canales", "favorito"] }],
  columnas: ["nombre", "categoria", "carpetaId", "propietarioId"],
  vistas: [todos("Todos los textos rápidos"), mios("Creados por mí"), recientes],
  vistaPorDefecto: "todos",
  busqueda: ["nombre", "mensaje"],
  camposResaltados: ["categoria", "carpetaId"],
  acciones: { nuevo: true },
};

const carpetasTexto: DefObjeto = {
  api: "carpetas-texto",
  etiqueta: "Carpeta",
  etiquetaPlural: "Carpetas",
  genero: "f",
  icono: "Folder",
  color: "bg-sky-600",
  camposNombre: ["nombre"],
  campos: [{ nombre: "nombre", etiqueta: "Nombre de la carpeta", tipo: "texto", requerido: true }, ...sistema],
  secciones: [{ titulo: "Carpeta", campos: ["nombre"] }],
  columnas: ["nombre", "propietarioId"],
  vistas: [todos("Todas las carpetas")],
  vistaPorDefecto: "todos",
  busqueda: ["nombre"],
  camposResaltados: [],
  acciones: { nuevo: true },
  hijo: true,
};

const articulos: DefObjeto = {
  api: "articulos",
  etiqueta: "Artículo",
  etiquetaPlural: "Knowledge",
  genero: "m",
  icono: "BookmarkCheck",
  color: "bg-violet-600",
  camposNombre: ["titulo"],
  campos: [
    { nombre: "titulo", etiqueta: "Título", tipo: "texto", requerido: true },
    { nombre: "nombreUrl", etiqueta: "Nombre de URL", tipo: "texto", ayuda: "Se genera a partir del título si lo deja vacío." },
    { nombre: "contenido", etiqueta: "Contenido", tipo: "markdown" },
    { nombre: "visibleCliente", etiqueta: "Visible para el cliente", tipo: "casilla" },
    { nombre: "estado", etiqueta: "Estado de publicación", tipo: "lista", opciones: op.estadosArticulo, soloLectura: true },
    { nombre: "version", etiqueta: "Versión", tipo: "numero", soloLectura: true },
    { nombre: "publicadoEn", etiqueta: "Fecha de publicación", tipo: "fechaHora", soloLectura: true },
    { nombre: "asignadoAId", etiqueta: "Asignado a", tipo: "busqueda", objetoDestino: "usuarios" },
    { nombre: "vistas", etiqueta: "Vistas", tipo: "numero", soloLectura: true },
    ...sistema,
  ],
  secciones: [
    { titulo: "Información", campos: ["titulo", "nombreUrl", "contenido"] },
    { titulo: "Visibilidad", campos: ["visibleCliente"] },
    { titulo: "Detalles", campos: ["estado", "version", "publicadoEn", "asignadoAId", "vistas"] },
  ],
  columnas: ["titulo", "estado", "version", "publicadoEn", "visibleCliente", "propietarioId"],
  vistas: [
    { id: "borradores", etiqueta: "Artículos en borrador", condiciones: [{ campo: "estado", operador: "igual", valor: "borrador" }] },
    { id: "publicados", etiqueta: "Artículos publicados", condiciones: [{ campo: "estado", operador: "igual", valor: "publicado" }] },
    { id: "archivados", etiqueta: "Artículos archivados", condiciones: [{ campo: "estado", operador: "igual", valor: "archivado" }] },
    todos("Todos los artículos"),
    recientes,
  ],
  vistaPorDefecto: "todos",
  busqueda: ["titulo", "contenido"],
  camposResaltados: ["estado", "version", "publicadoEn", "visibleCliente"],
  campoRuta: "estado",
  acciones: { nuevo: true },
  vacio: { titulo: "Su base de conocimiento está vacía", texto: "Escriba artículos con respuestas a las preguntas frecuentes de sus clientes." },
};

const sesionesMensajeria: DefObjeto = {
  api: "sesiones-mensajeria",
  etiqueta: "Sesión de mensajería",
  etiquetaPlural: "Sesiones de mensajería",
  genero: "f",
  icono: "MessagesSquare",
  color: "bg-green-600",
  camposNombre: ["canal"],
  campos: [
    { nombre: "canal", etiqueta: "Canal", tipo: "lista", opciones: op.canalesMensajeria, requerido: true, porDefecto: "whatsapp" },
    { nombre: "contactoId", etiqueta: "Contacto", tipo: "busqueda", objetoDestino: "contactos" },
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosSesion, requerido: true, porDefecto: "activa" },
    { nombre: "inicio", etiqueta: "Inicio", tipo: "fechaHora" },
    { nombre: "fin", etiqueta: "Fin", tipo: "fechaHora" },
    { nombre: "resumen", etiqueta: "Resumen de la conversación", tipo: "areaTexto" },
    ...sistema,
  ],
  secciones: [{ titulo: "Sesión", campos: ["canal", "contactoId", "estado", "inicio", "fin", "resumen"] }],
  columnas: ["canal", "contactoId", "estado", "inicio", "fin", "propietarioId"],
  vistas: [todos("Todas las sesiones"), { id: "activas", etiqueta: "Sesiones activas", condiciones: [{ campo: "estado", operador: "igual", valor: "activa" }] }, recientes],
  vistaPorDefecto: "todos",
  busqueda: ["resumen"],
  camposResaltados: ["contactoId", "estado", "inicio"],
  acciones: { nuevo: true },
};

// ---------------------------------------------------------------------------

const campanas: DefObjeto = {
  api: "campanas",
  etiqueta: "Campaña",
  etiquetaPlural: "Campañas",
  genero: "f",
  icono: "Megaphone",
  color: "bg-orange-600",
  camposNombre: ["nombre"],
  campos: [
    { nombre: "nombre", etiqueta: "Nombre de la campaña", tipo: "texto", requerido: true },
    { nombre: "tipo", etiqueta: "Tipo", tipo: "lista", opciones: op.tiposCampana },
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosCampana, requerido: true, porDefecto: "planificada" },
    { nombre: "fechaInicio", etiqueta: "Fecha de inicio", tipo: "fecha" },
    { nombre: "fechaFin", etiqueta: "Fecha de fin", tipo: "fecha" },
    { nombre: "presupuesto", etiqueta: "Presupuesto", tipo: "moneda" },
    { nombre: "activa", etiqueta: "Activa", tipo: "casilla", porDefecto: true },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
    ...sistema,
  ],
  secciones: [{ titulo: "Campaña", campos: ["nombre", "tipo", "estado", "fechaInicio", "fechaFin", "presupuesto", "activa", "descripcion"] }],
  columnas: ["nombre", "tipo", "estado", "fechaInicio", "fechaFin", "propietarioId"],
  vistas: [todos("Todas las campañas"), { id: "activas", etiqueta: "Campañas activas", condiciones: [{ campo: "activa", operador: "verdadero" }] }, recientes],
  vistaPorDefecto: "todos",
  busqueda: ["nombre"],
  camposResaltados: ["tipo", "estado", "fechaInicio", "presupuesto"],
  campoRuta: "estado",
  actividades: true,
  acciones: { nuevo: true },
};

const correosLista: DefObjeto = {
  api: "correos-lista",
  etiqueta: "Correo de lista",
  etiquetaPlural: "Correos electrónicos de listas",
  genero: "m",
  icono: "Mails",
  color: "bg-red-500",
  camposNombre: ["asunto"],
  campos: [
    { nombre: "asunto", etiqueta: "Asunto", tipo: "texto", requerido: true },
    { nombre: "cuerpo", etiqueta: "Mensaje", tipo: "areaTexto", requerido: true },
    { nombre: "objetoDestinatarios", etiqueta: "Destinatarios de", tipo: "texto", soloLectura: true },
    { nombre: "destinatarios", etiqueta: "Número de destinatarios", tipo: "numero", soloLectura: true },
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosCorreoLista, soloLectura: true },
    { nombre: "enviadoEn", etiqueta: "Fecha de envío", tipo: "fechaHora", soloLectura: true },
    ...sistema,
  ],
  secciones: [{ titulo: "Correo", campos: ["asunto", "cuerpo", "objetoDestinatarios", "destinatarios", "estado", "enviadoEn"] }],
  columnas: ["asunto", "destinatarios", "estado", "enviadoEn", "propietarioId"],
  vistas: [todos("Todos los correos de listas"), mios("Mis correos de listas"), recientes],
  vistaPorDefecto: "todos",
  busqueda: ["asunto"],
  camposResaltados: ["destinatarios", "estado", "enviadoEn"],
  acciones: {},
  vacio: { titulo: "Nada que ver aquí", texto: "Seleccione contactos o leads en su lista y use «Enviar correo electrónico»." },
};

const establecimientos: DefObjeto = {
  api: "establecimientos",
  etiqueta: "Establecimiento",
  etiquetaPlural: "Establecimientos",
  genero: "m",
  icono: "Store",
  color: "bg-emerald-500",
  camposNombre: ["nombre"],
  campos: [
    { nombre: "nombre", etiqueta: "Nombre del establecimiento", tipo: "texto", requerido: true },
    { nombre: "slug", etiqueta: "Dirección web (slug)", tipo: "texto", ayuda: "Ejemplo: mi-tienda" },
    { nombre: "moneda", etiqueta: "Moneda", tipo: "lista", opciones: op.monedas, requerido: true, porDefecto: "COP" },
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosEstablecimiento, requerido: true, porDefecto: "borrador" },
    { nombre: "listaPreciosId", etiqueta: "Lista de precios", tipo: "busqueda", objetoDestino: "listas-precios" },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
    ...sistema,
  ],
  secciones: [{ titulo: "Establecimiento", campos: ["nombre", "slug", "moneda", "estado", "listaPreciosId", "descripcion"] }],
  columnas: ["nombre", "slug", "moneda", "estado", "propietarioId"],
  vistas: [todos("Todos los establecimientos")],
  vistaPorDefecto: "todos",
  busqueda: ["nombre", "slug"],
  camposResaltados: ["moneda", "estado", "listaPreciosId"],
  acciones: { nuevo: true },
  vacio: {
    titulo: "¡Aún no tiene ningún establecimiento!",
    texto: "Antes de empezar a vender, cree un establecimiento. Ahí se reúnen sus productos, precios y pedidos.",
    boton: "Crear establecimiento",
  },
};

// ---------------------------------------------------------------------------

const flujos: DefObjeto = {
  api: "flujos",
  etiqueta: "Flujo",
  etiquetaPlural: "Flujos",
  genero: "m",
  icono: "Workflow",
  color: "bg-indigo-600",
  camposNombre: ["nombre"],
  campos: [
    { nombre: "nombre", etiqueta: "Nombre del flujo", tipo: "texto", requerido: true },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
    { nombre: "objeto", etiqueta: "Objeto", tipo: "texto", requerido: true },
    { nombre: "disparador", etiqueta: "Se ejecuta", tipo: "lista", opciones: op.disparadoresFlujo, requerido: true },
    { nombre: "activo", etiqueta: "Activo", tipo: "casilla" },
    { nombre: "version", etiqueta: "Versión", tipo: "numero", soloLectura: true },
    ...sistema,
  ],
  secciones: [{ titulo: "Flujo", campos: ["nombre", "descripcion", "objeto", "disparador", "activo"] }],
  columnas: ["nombre", "objeto", "disparador", "activo", "version", "actualizadoEn"],
  vistas: [todos("Todos los flujos"), { id: "activos", etiqueta: "Flujos activos", condiciones: [{ campo: "activo", operador: "verdadero" }] }, recientes],
  vistaPorDefecto: "todos",
  busqueda: ["nombre"],
  camposResaltados: ["objeto", "disparador", "activo"],
  acciones: { nuevo: true },
  vacio: { titulo: "Nada que ver aquí", texto: "Automatice tareas repetitivas: cree un flujo que reaccione cuando se crean o cambian registros." },
};

const conexiones: DefObjeto = {
  api: "conexiones",
  etiqueta: "Conexión",
  etiquetaPlural: "Conexiones",
  genero: "f",
  icono: "Plug",
  color: "bg-slate-600",
  camposNombre: ["nombre"],
  campos: [
    { nombre: "nombre", etiqueta: "Nombre de la conexión", tipo: "texto", requerido: true },
    { nombre: "conector", etiqueta: "Conector", tipo: "lista", opciones: op.conectores, requerido: true, porDefecto: "webhook" },
    { nombre: "url", etiqueta: "URL del webhook", tipo: "url", ayuda: "Los flujos envían aquí los datos del registro en formato JSON." },
    { nombre: "estado", etiqueta: "Estado", tipo: "lista", opciones: op.estadosConexion, porDefecto: "sin_configurar" },
    { nombre: "descripcion", etiqueta: "Descripción", tipo: "areaTexto" },
    ...sistema,
  ],
  secciones: [{ titulo: "Conexión", campos: ["nombre", "conector", "url", "estado", "descripcion"] }],
  columnas: ["nombre", "conector", "estado", "actualizadoEn"],
  vistas: [todos("Todas las conexiones")],
  vistaPorDefecto: "todos",
  busqueda: ["nombre"],
  camposResaltados: ["conector", "estado", "url"],
  acciones: { nuevo: true },
  hijo: true,
};

const usuarios: DefObjeto = {
  api: "usuarios",
  etiqueta: "Usuario",
  etiquetaPlural: "Usuarios",
  genero: "m",
  icono: "User",
  color: "bg-slate-500",
  camposNombre: ["name"],
  campos: [
    { nombre: "name", etiqueta: "Nombre", tipo: "texto", requerido: true },
    { nombre: "email", etiqueta: "Correo electrónico", tipo: "email", requerido: true },
    { nombre: "alias", etiqueta: "Alias", tipo: "texto" },
    { nombre: "rol", etiqueta: "Rol", tipo: "texto" },
  ],
  secciones: [],
  columnas: ["name", "email", "rol"],
  vistas: [todos("Todos los usuarios")],
  vistaPorDefecto: "todos",
  busqueda: ["name", "email"],
  camposResaltados: [],
  acciones: {},
  hijo: true,
};

export const objetos: Record<string, DefObjeto> = Object.fromEntries(
  [
    cuentas,
    contactos,
    candidatos,
    oportunidades,
    productos,
    listasPrecios,
    entradasListaPrecios,
    productosOportunidad,
    eventos,
    tareas,
    facturas,
    videollamadas,
    casos,
    textosRapidos,
    carpetasTexto,
    articulos,
    sesionesMensajeria,
    campanas,
    correosLista,
    establecimientos,
    flujos,
    conexiones,
    usuarios,
  ].map((o) => [o.api, o]),
);

export function obtenerObjeto(api: string): DefObjeto | undefined {
  return objetos[api];
}

export function campoDe(def: DefObjeto, nombre: string): Campo | undefined {
  return def.campos.find((c) => c.nombre === nombre);
}
