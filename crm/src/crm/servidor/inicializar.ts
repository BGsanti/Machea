import { and, eq } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { carpetasTexto, configuracion, informes, listasPrecios, paneles } from "@/db/esquema";

/** Datos mínimos de una empresa nueva: configuración, lista estándar, informes y paneles. */
export async function inicializarOrganizacion(usuarioId: string, empresaId: string, empresa?: string): Promise<void> {
  const db = await bd();
  await db
    .insert(configuracion)
    .values({ empresaId, nombreEmpresa: empresa?.trim() || "Mi empresa" })
    .onConflictDoNothing();

  const [estandar] = await db
    .select()
    .from(listasPrecios)
    .where(and(eq(listasPrecios.empresaId, empresaId), eq(listasPrecios.estandar, true)))
    .limit(1);
  if (!estandar) {
    await db.insert(listasPrecios).values({
      empresaId,
      nombre: "Lista de precios estándar",
      estandar: true,
      activo: true,
      descripcion: "Precios por defecto de los productos.",
      propietarioId: usuarioId,
      creadoPorId: usuarioId,
    });
  }

  const existentes = await db.select({ id: informes.id }).from(informes).where(eq(informes.empresaId, empresaId)).limit(1);
  if (existentes.length === 0) {
    const base = { empresaId, propietarioId: usuarioId, creadoPorId: usuarioId };
    const creados = await db
      .insert(informes)
      .values([
        {
          ...base,
          nombre: "Mis candidatos por estado",
          objeto: "candidatos",
          agruparPor: "estado",
          agregacion: "conteo",
          filtros: [
            { campo: "propietarioId", operador: "igual", valor: "$usuario" },
            { campo: "convertido", operador: "igual", valor: "false" },
          ],
          tipoGrafico: "anillo",
          carpeta: "Ventas",
        },
        {
          ...base,
          nombre: "Mis oportunidades por etapa",
          objeto: "oportunidades",
          agruparPor: "etapa",
          agregacion: "suma",
          campoAgregado: "importe",
          filtros: [{ campo: "propietarioId", operador: "igual", valor: "$usuario" }],
          tipoGrafico: "barras",
          carpeta: "Ventas",
        },
        {
          ...base,
          nombre: "Mis contactos por cuenta",
          objeto: "contactos",
          agruparPor: "cuentaId",
          agregacion: "conteo",
          filtros: [{ campo: "propietarioId", operador: "igual", valor: "$usuario" }],
          tipoGrafico: "barras",
          carpeta: "Ventas",
        },
        {
          ...base,
          nombre: "Casos nuevos por prioridad",
          objeto: "casos",
          agruparPor: "prioridad",
          agregacion: "conteo",
          filtros: [{ campo: "estado", operador: "igual", valor: "nuevo" }],
          tipoGrafico: "anillo",
          carpeta: "Servicio",
        },
        {
          ...base,
          nombre: "Ingresos previstos por mes de cierre",
          objeto: "oportunidades",
          agruparPor: "fechaCierre",
          agregacion: "suma",
          campoAgregado: "importe",
          filtros: [],
          tipoGrafico: "linea",
          carpeta: "Ventas",
        },
        {
          ...base,
          nombre: "Casos por estado",
          objeto: "casos",
          agruparPor: "estado",
          agregacion: "conteo",
          filtros: [],
          tipoGrafico: "columnas",
          carpeta: "Servicio",
        },
      ])
      .returning({ id: informes.id, carpeta: informes.carpeta });
    const ids = (carpeta: string) => creados.filter((c) => c.carpeta === carpeta).map((c) => c.id);
    await db.insert(paneles).values([
      { ...base, nombre: "Panel de ventas", descripcion: "Embudo, ingresos previstos y candidatos.", informes: ids("Ventas") },
      { ...base, nombre: "Panel de servicio", descripcion: "Volumen y prioridad de los casos.", informes: ids("Servicio") },
    ]);
  }

  const carpetas = await db
    .select({ id: carpetasTexto.id })
    .from(carpetasTexto)
    .where(eq(carpetasTexto.empresaId, empresaId))
    .limit(1);
  if (carpetas.length === 0) {
    await db.insert(carpetasTexto).values({ empresaId, nombre: "General", propietarioId: usuarioId, creadoPorId: usuarioId });
  }
}
