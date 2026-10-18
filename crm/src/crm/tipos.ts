export type TipoCampo =
  | "texto"
  | "areaTexto"
  | "email"
  | "telefono"
  | "url"
  | "numero"
  | "moneda"
  | "porcentaje"
  | "fecha"
  | "fechaHora"
  | "casilla"
  | "lista"
  | "listaMultiple"
  | "busqueda"
  | "polimorfico"
  | "autonumero"
  | "markdown";

export interface Opcion {
  valor: string;
  etiqueta: string;
  /** Clase de Tailwind para la insignia de la opción. */
  color?: string;
}

export interface Campo {
  /** Propiedad de la tabla de Drizzle. En los polimórficos es el prefijo de `<nombre>Objeto` y `<nombre>Id`. */
  nombre: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  opciones?: Opcion[];
  /** Objeto destino de un campo de búsqueda. */
  objetoDestino?: string;
  /** Objetos que admite un campo polimórfico. */
  objetosPermitidos?: string[];
  soloLectura?: boolean;
  porDefecto?: string | number | boolean;
  /** Sugerencias para un texto libre (por ejemplo, el asunto de un evento). */
  sugerencias?: string[];
  ayuda?: string;
  /** Formato del autonúmero, por ejemplo "FAC-{0}". */
  formato?: string;
}

export interface GrupoCampos {
  grupo: string;
  campos: string[];
}

export interface Seccion {
  titulo: string;
  campos: (string | GrupoCampos)[];
}

export type OperadorCondicion =
  | "igual"
  | "distinto"
  | "en"
  | "no_en"
  | "vacio"
  | "no_vacio"
  | "antes_de_hoy"
  | "hoy"
  | "este_mes"
  | "verdadero"
  | "falso"
  | "contiene"
  | "mayor"
  | "menor";

export interface Condicion {
  campo: string;
  operador: OperadorCondicion;
  valor?: string | string[];
}

export interface VistaLista {
  id: string;
  etiqueta: string;
  condiciones?: Condicion[];
  soloMios?: boolean;
  recientes?: boolean;
  orden?: { campo: string; direccion: "asc" | "desc" };
}

export interface ListaRelacionada {
  objeto: string;
  campo: string;
  titulo: string;
  columnas: string[];
}

export interface AccionesObjeto {
  nuevo?: boolean;
  importar?: boolean;
  enviarCorreo?: boolean;
  agregarCampana?: boolean;
  cambiarPropietario?: boolean;
  editar?: boolean;
  eliminar?: boolean;
}

export interface DefObjeto {
  /** Segmento de URL y clave del objeto. */
  api: string;
  etiqueta: string;
  etiquetaPlural: string;
  /** Determina "Nuevo" o "Nueva". */
  genero: "m" | "f";
  icono: string;
  /** Clase de Tailwind para el fondo del icono. */
  color: string;
  /** Campos que forman el nombre visible del registro. */
  camposNombre: string[];
  campos: Campo[];
  secciones: Seccion[];
  columnas: string[];
  vistas: VistaLista[];
  vistaPorDefecto: string;
  busqueda: string[];
  camposResaltados: string[];
  campoRuta?: string;
  campoKanban?: string;
  campoSumaKanban?: string;
  relacionadas?: ListaRelacionada[];
  actividades?: boolean;
  acciones: AccionesObjeto;
  /** Texto del estado vacío de la lista. */
  vacio?: { titulo: string; texto: string; boton?: string };
  /** El objeto no tiene página propia: solo se ve dentro de otro registro. */
  hijo?: boolean;
}

export interface FilaRegistro {
  id: string;
  [campo: string]: unknown;
}
