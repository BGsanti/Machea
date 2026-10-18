import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Todas las tablas viven en el esquema `crm`: así el CRM puede compartir la base de datos de Machea
 * sin chocar con sus tablas y sin quedar expuesto por PostgREST (que solo publica `public`).
 */
export const crm = pgSchema("crm");

const marcaTiempo = () => timestamp({ withTimezone: true, mode: "date" });
const moneda = () => numeric({ precision: 16, scale: 2, mode: "number" });

// ---------------------------------------------------------------------------
// Empresas. Cada constructora o inmobiliaria con cuenta en Machea es una empresa, y todos sus
// datos llevan su `empresaId`. Con el login de Machea, el id es el de su cuenta (acceso.cuentas.id).
// ---------------------------------------------------------------------------

export const empresas = crm.table("empresas", {
  id: uuid().primaryKey().defaultRandom(),
  nombre: text().notNull(),
  creadaEn: timestamp({ withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

const empresa = () =>
  uuid()
    .notNull()
    .references(() => empresas.id, { onDelete: "cascade" });

/** Numeración propia de cada empresa (facturas, casos): FAC-1 empieza en 1 para todas. */
export const contadores = crm.table(
  "contadores",
  {
    empresaId: empresa(),
    objeto: text().notNull(),
    valor: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.objeto] })],
);

// ---------------------------------------------------------------------------
// Autenticación (Better Auth). Los nombres de las propiedades los fija Better Auth.
// ---------------------------------------------------------------------------

export const usuarios = crm.table("usuarios", {
  id: text().primaryKey(),
  // Opcional solo para que Better Auth pueda crear el usuario antes de asignarle la empresa;
  // la sesión rechaza a cualquier usuario sin empresa.
  empresaId: uuid().references(() => empresas.id, { onDelete: "cascade" }),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  rol: text().notNull().default("usuario"),
  alias: text(),
  createdAt: marcaTiempo().notNull().defaultNow(),
  updatedAt: marcaTiempo().notNull().defaultNow(),
});

export const sesiones = crm.table("sesiones", {
  id: text().primaryKey(),
  expiresAt: marcaTiempo().notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text()
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  createdAt: marcaTiempo().notNull().defaultNow(),
  updatedAt: marcaTiempo().notNull().defaultNow(),
});

export const cuentasAuth = crm.table("cuentas_auth", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text()
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: marcaTiempo(),
  refreshTokenExpiresAt: marcaTiempo(),
  scope: text(),
  password: text(),
  createdAt: marcaTiempo().notNull().defaultNow(),
  updatedAt: marcaTiempo().notNull().defaultNow(),
});

export const verificaciones = crm.table("verificaciones", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: marcaTiempo().notNull(),
  createdAt: marcaTiempo().notNull().defaultNow(),
  updatedAt: marcaTiempo().notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Columnas comunes de los objetos del CRM
// ---------------------------------------------------------------------------

const comunes = () => ({
  id: uuid().primaryKey().defaultRandom(),
  empresaId: empresa(),
  propietarioId: text().references(() => usuarios.id, { onDelete: "set null" }),
  creadoPorId: text().references(() => usuarios.id, { onDelete: "set null" }),
  creadoEn: marcaTiempo().notNull().defaultNow(),
  actualizadoEn: marcaTiempo().notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

export const cuentas = crm.table(
  "cuentas",
  {
    ...comunes(),
    nombre: text().notNull(),
    sitioWeb: text(),
    tipo: text(),
    descripcion: text(),
    cuentaPrincipalId: uuid(),
    telefono: text(),
    facturacionPais: text(),
    facturacionCalle: text(),
    facturacionCiudad: text(),
    facturacionEstado: text(),
    facturacionCodigoPostal: text(),
    envioPais: text(),
    envioCalle: text(),
    envioCiudad: text(),
    envioEstado: text(),
    envioCodigoPostal: text(),
  },
  (t) => [index().on(t.nombre)],
);

export const contactos = crm.table(
  "contactos",
  {
    ...comunes(),
    tratamiento: text(),
    nombre: text(),
    apellidos: text().notNull(),
    cuentaId: uuid().references(() => cuentas.id, { onDelete: "set null" }),
    cargo: text(),
    supervisorId: uuid(),
    descripcion: text(),
    telefono: text(),
    email: text(),
    correoPais: text(),
    correoCalle: text(),
    correoCiudad: text(),
    correoEstado: text(),
    correoCodigoPostal: text(),
  },
  (t) => [index().on(t.apellidos), index().on(t.cuentaId)],
);

export const candidatos = crm.table(
  "candidatos",
  {
    ...comunes(),
    estado: text().notNull().default("nuevo"),
    tratamiento: text(),
    nombre: text(),
    apellidos: text().notNull(),
    compania: text().notNull(),
    cargo: text(),
    sitioWeb: text(),
    descripcion: text(),
    valoracion: text(),
    telefono: text(),
    email: text(),
    pais: text(),
    calle: text(),
    ciudad: text(),
    estadoProvincia: text(),
    codigoPostal: text(),
    numeroEmpleados: integer(),
    ingresosAnuales: moneda(),
    origen: text(),
    sector: text(),
    convertido: boolean().notNull().default(false),
    convertidoEn: marcaTiempo(),
    cuentaConvertidaId: uuid(),
    contactoConvertidoId: uuid(),
    oportunidadConvertidaId: uuid(),
  },
  (t) => [index().on(t.apellidos), index().on(t.estado)],
);

export const listasPrecios = crm.table("listas_precios", {
  ...comunes(),
  nombre: text().notNull(),
  activo: boolean().notNull().default(true),
  estandar: boolean().notNull().default(false),
  descripcion: text(),
  validoDesde: marcaTiempo(),
  validoHasta: marcaTiempo(),
});

export const oportunidades = crm.table(
  "oportunidades",
  {
    ...comunes(),
    nombre: text().notNull(),
    cuentaId: uuid().references(() => cuentas.id, { onDelete: "set null" }),
    fechaCierre: date({ mode: "string" }).notNull(),
    importe: moneda(),
    descripcion: text(),
    etapa: text().notNull().default("calificar"),
    probabilidad: integer(),
    categoriaPrevision: text().notNull().default("pipeline"),
    siguientePaso: text(),
    listaPreciosId: uuid().references(() => listasPrecios.id, { onDelete: "set null" }),
    origen: text(),
  },
  (t) => [index().on(t.etapa), index().on(t.cuentaId)],
);

export const productos = crm.table("productos", {
  ...comunes(),
  nombre: text().notNull(),
  familia: text(),
  codigo: text(),
  sku: text(),
  activo: boolean().notNull().default(true),
  descripcion: text(),
});

export const entradasListaPrecios = crm.table(
  "entradas_lista_precios",
  {
    ...comunes(),
    listaPreciosId: uuid()
      .notNull()
      .references(() => listasPrecios.id, { onDelete: "cascade" }),
    productoId: uuid()
      .notNull()
      .references(() => productos.id, { onDelete: "cascade" }),
    precio: moneda().notNull(),
    activo: boolean().notNull().default(true),
  },
  (t) => [uniqueIndex().on(t.listaPreciosId, t.productoId)],
);

export const productosOportunidad = crm.table("productos_oportunidad", {
  ...comunes(),
  oportunidadId: uuid()
    .notNull()
    .references(() => oportunidades.id, { onDelete: "cascade" }),
  productoId: uuid()
    .notNull()
    .references(() => productos.id, { onDelete: "restrict" }),
  cantidad: numeric({ precision: 14, scale: 2, mode: "number" }).notNull().default(1),
  precioUnitario: moneda().notNull(),
  descuento: numeric({ precision: 5, scale: 2, mode: "number" }),
  descripcion: text(),
});

export const facturas = crm.table("facturas", {
  ...comunes(),
  // Lo asigna repositorio.crear con crm.contadores, por empresa.
  numero: integer().notNull(),
  oportunidadId: uuid().references(() => oportunidades.id, { onDelete: "set null" }),
  cuentaId: uuid().references(() => cuentas.id, { onDelete: "set null" }),
  fechaEmision: date({ mode: "string" }).notNull(),
  fechaVencimiento: date({ mode: "string" }),
  estado: text().notNull().default("borrador"),
  subtotal: moneda().notNull().default(0),
  impuestos: moneda().notNull().default(0),
  total: moneda().notNull().default(0),
  notas: text(),
}, (t) => [uniqueIndex().on(t.empresaId, t.numero)]);

export const lineasFactura = crm.table("lineas_factura", {
  id: uuid().primaryKey().defaultRandom(),
  empresaId: empresa(),
  facturaId: uuid()
    .notNull()
    .references(() => facturas.id, { onDelete: "cascade" }),
  descripcion: text().notNull(),
  cantidad: numeric({ precision: 14, scale: 2, mode: "number" }).notNull(),
  precioUnitario: moneda().notNull(),
  total: moneda().notNull(),
});

export const videollamadas = crm.table("videollamadas", {
  ...comunes(),
  asunto: text().notNull(),
  inicio: marcaTiempo().notNull(),
  duracionMinutos: integer().notNull().default(30),
  enlace: text(),
  estado: text().notNull().default("programada"),
  relacionadoObjeto: text(),
  relacionadoId: uuid(),
  notas: text(),
});

// ---------------------------------------------------------------------------
// Actividades
// ---------------------------------------------------------------------------

export const eventos = crm.table(
  "eventos",
  {
    ...comunes(),
    asunto: text().notNull(),
    descripcion: text(),
    inicio: marcaTiempo().notNull(),
    fin: marcaTiempo().notNull(),
    todoElDia: boolean().notNull().default(false),
    privado: boolean().notNull().default(false),
    ubicacion: text(),
    quienObjeto: text(),
    quienId: uuid(),
    relacionadoObjeto: text(),
    relacionadoId: uuid(),
  },
  (t) => [index().on(t.inicio), index().on(t.relacionadoId), index().on(t.quienId)],
);

export const tareas = crm.table(
  "tareas",
  {
    ...comunes(),
    asunto: text().notNull(),
    tipo: text().notNull().default("tarea"),
    fechaVencimiento: date({ mode: "string" }),
    comentarios: text(),
    estado: text().notNull().default("no_iniciada"),
    prioridad: text().notNull().default("normal"),
    quienObjeto: text(),
    quienId: uuid(),
    relacionadoObjeto: text(),
    relacionadoId: uuid(),
    completadaEn: marcaTiempo(),
  },
  (t) => [index().on(t.relacionadoId), index().on(t.quienId), index().on(t.propietarioId)],
);

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

export const casos = crm.table(
  "casos",
  {
    ...comunes(),
    // Lo asigna repositorio.crear con crm.contadores, por empresa.
    numero: integer().notNull(),
    estado: text().notNull().default("nuevo"),
    origen: text(),
    prioridad: text().notNull().default("media"),
    contactoId: uuid().references(() => contactos.id, { onDelete: "set null" }),
    cuentaId: uuid().references(() => cuentas.id, { onDelete: "set null" }),
    asunto: text(),
    descripcion: text(),
    notificarContacto: boolean().notNull().default(false),
    cerradoEn: marcaTiempo(),
  },
  (t) => [index().on(t.estado), uniqueIndex().on(t.empresaId, t.numero)],
);

export const carpetasTexto = crm.table("carpetas_texto", {
  ...comunes(),
  nombre: text().notNull(),
});

export const textosRapidos = crm.table("textos_rapidos", {
  ...comunes(),
  nombre: text().notNull(),
  mensaje: text().notNull(),
  carpetaId: uuid().references(() => carpetasTexto.id, { onDelete: "set null" }),
  categoria: text(),
  canales: text().array().notNull().default(sql`'{}'::text[]`),
  favorito: boolean().notNull().default(false),
});

export const articulos = crm.table("articulos", {
  ...comunes(),
  titulo: text().notNull(),
  nombreUrl: text(),
  contenido: text(),
  visibleCliente: boolean().notNull().default(false),
  estado: text().notNull().default("borrador"),
  version: integer().notNull().default(1),
  publicadoEn: marcaTiempo(),
  asignadoAId: text().references(() => usuarios.id, { onDelete: "set null" }),
  vistas: integer().notNull().default(0),
});

export const sesionesMensajeria = crm.table("sesiones_mensajeria", {
  ...comunes(),
  canal: text().notNull().default("whatsapp"),
  contactoId: uuid().references(() => contactos.id, { onDelete: "set null" }),
  estado: text().notNull().default("activa"),
  inicio: marcaTiempo().notNull().defaultNow(),
  fin: marcaTiempo(),
  resumen: text(),
});

// ---------------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------------

export const campanas = crm.table("campanas", {
  ...comunes(),
  nombre: text().notNull(),
  tipo: text(),
  estado: text().notNull().default("planificada"),
  fechaInicio: date({ mode: "string" }),
  fechaFin: date({ mode: "string" }),
  presupuesto: moneda(),
  activa: boolean().notNull().default(true),
  descripcion: text(),
});

export const miembrosCampana = crm.table(
  "miembros_campana",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: empresa(),
    campanaId: uuid()
      .notNull()
      .references(() => campanas.id, { onDelete: "cascade" }),
    objeto: text().notNull(),
    registroId: uuid().notNull(),
    estado: text().notNull().default("enviado"),
    agregadoEn: marcaTiempo().notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.campanaId, t.objeto, t.registroId)],
);

export const correosLista = crm.table("correos_lista", {
  ...comunes(),
  asunto: text().notNull(),
  cuerpo: text().notNull(),
  objetoDestinatarios: text().notNull(),
  destinatarios: integer().notNull().default(0),
  estado: text().notNull().default("enviado"),
  enviadoEn: marcaTiempo(),
});

export const destinatariosCorreo = crm.table("destinatarios_correo", {
  id: uuid().primaryKey().defaultRandom(),
  empresaId: empresa(),
  correoId: uuid()
    .notNull()
    .references(() => correosLista.id, { onDelete: "cascade" }),
  objeto: text().notNull(),
  registroId: uuid().notNull(),
  email: text(),
  estado: text().notNull().default("registrado"),
});

// ---------------------------------------------------------------------------
// Comercio
// ---------------------------------------------------------------------------

export const establecimientos = crm.table("establecimientos", {
  ...comunes(),
  nombre: text().notNull(),
  slug: text(),
  moneda: text().notNull().default("COP"),
  estado: text().notNull().default("borrador"),
  listaPreciosId: uuid().references(() => listasPrecios.id, { onDelete: "set null" }),
  descripcion: text(),
});

// ---------------------------------------------------------------------------
// Automatización
// ---------------------------------------------------------------------------

export interface CondicionFlujo {
  campo: string;
  operador: "igual" | "distinto" | "contiene" | "mayor" | "menor" | "vacio" | "no_vacio" | "cambia";
  valor?: string;
}

export type AccionFlujo =
  | { tipo: "crear_tarea"; asunto: string; diasVencimiento?: number; prioridad?: "alta" | "normal" | "baja" }
  | { tipo: "actualizar_campo"; campo: string; valor: string }
  | { tipo: "notificar"; titulo: string; mensaje?: string }
  | { tipo: "llamar_webhook"; conexionId: string };

export const flujos = crm.table("flujos", {
  ...comunes(),
  nombre: text().notNull(),
  descripcion: text(),
  objeto: text().notNull(),
  disparador: text().notNull().default("crear"),
  condiciones: jsonb().$type<CondicionFlujo[]>().notNull().default([]),
  acciones: jsonb().$type<AccionFlujo[]>().notNull().default([]),
  activo: boolean().notNull().default(false),
  version: integer().notNull().default(1),
});

export const ejecucionesFlujo = crm.table(
  "ejecuciones_flujo",
  {
    id: uuid().primaryKey().defaultRandom(),
    empresaId: empresa(),
    flujoId: uuid().references(() => flujos.id, { onDelete: "cascade" }),
    nombreFlujo: text().notNull(),
    objeto: text().notNull(),
    registroId: uuid(),
    estado: text().notNull(),
    detalle: text(),
    duracionMs: integer(),
    creadoEn: marcaTiempo().notNull().defaultNow(),
  },
  (t) => [index().on(t.empresaId, t.creadoEn)],
);

export const conexiones = crm.table("conexiones", {
  ...comunes(),
  nombre: text().notNull(),
  conector: text().notNull(),
  url: text(),
  estado: text().notNull().default("sin_configurar"),
  descripcion: text(),
});

// ---------------------------------------------------------------------------
// Análisis
// ---------------------------------------------------------------------------

export interface FiltroInforme {
  campo: string;
  operador: "igual" | "distinto" | "contiene" | "mayor" | "menor";
  valor: string;
}

export const informes = crm.table("informes", {
  ...comunes(),
  nombre: text().notNull(),
  descripcion: text(),
  objeto: text().notNull(),
  agruparPor: text(),
  agregacion: text().notNull().default("conteo"),
  campoAgregado: text(),
  filtros: jsonb().$type<FiltroInforme[]>().notNull().default([]),
  tipoGrafico: text().notNull().default("barras"),
  carpeta: text(),
  favorito: boolean().notNull().default(false),
});

export const paneles = crm.table("paneles", {
  ...comunes(),
  nombre: text().notNull(),
  descripcion: text(),
  informes: jsonb().$type<string[]>().notNull().default([]),
  favorito: boolean().notNull().default(false),
});

// ---------------------------------------------------------------------------
// Sistema. Notificaciones, recientes y preferencias son de un usuario, y cada usuario es de una
// sola empresa: no necesitan `empresaId`.
// ---------------------------------------------------------------------------

export const notificaciones = crm.table(
  "notificaciones",
  {
    id: uuid().primaryKey().defaultRandom(),
    usuarioId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    titulo: text().notNull(),
    cuerpo: text(),
    enlace: text(),
    leida: boolean().notNull().default(false),
    creadoEn: marcaTiempo().notNull().defaultNow(),
  },
  (t) => [index().on(t.usuarioId, t.leida)],
);

export const vistosRecientemente = crm.table(
  "vistos_recientemente",
  {
    id: uuid().primaryKey().defaultRandom(),
    usuarioId: text()
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    objeto: text().notNull(),
    registroId: uuid().notNull(),
    vistoEn: marcaTiempo().notNull().defaultNow(),
  },
  (t) => [uniqueIndex().on(t.usuarioId, t.objeto, t.registroId), index().on(t.usuarioId, t.vistoEn)],
);

export interface PreferenciasNavegacion {
  [app: string]: string[];
}

export const preferenciasUsuario = crm.table("preferencias_usuario", {
  usuarioId: text()
    .primaryKey()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  sugerenciasOcultas: jsonb().$type<string[]>().notNull().default([]),
  navegacion: jsonb().$type<PreferenciasNavegacion>().notNull().default({}),
});

export const configuracion = crm.table("configuracion", {
  empresaId: uuid()
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  nombreEmpresa: text().notNull().default("Mi empresa"),
  moneda: text().notNull().default("COP"),
  pais: text().default("Colombia"),
  marketingActivado: boolean().notNull().default(false),
  impuestoPorcentaje: numeric({ precision: 5, scale: 2, mode: "number" }).notNull().default(19),
  actualizadoEn: marcaTiempo().notNull().defaultNow(),
});
