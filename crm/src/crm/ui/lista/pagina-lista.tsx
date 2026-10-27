import { notFound } from "next/navigation";
import { puede } from "@/auth/permisos";
import { usuarioActual } from "@/auth/sesion";
import { campoDe, obtenerObjeto } from "../../objetos";
import { leerEstadoLista, type ParametrosUrl } from "../../parametros";
import { perfilDe } from "../../perfiles";
import { obtenerConfiguracion } from "../../servidor/consultas";
import { agruparPor, listar, type Grupo } from "../../servidor/repositorio";
import { etiquetaOpcion } from "../../formato";
import { ListaInteractiva } from "./lista-interactiva";

export async function PaginaLista({
  app,
  objeto,
  parametros,
  usuarioId,
}: {
  app: string;
  objeto: string;
  parametros: ParametrosUrl;
  usuarioId: string;
}) {
  const def = obtenerObjeto(objeto);
  if (!def || objeto === "usuarios") notFound();
  const estado = leerEstadoLista(def, parametros);
  const opciones = {
    vista: estado.vista,
    q: estado.q,
    orden: estado.orden,
    direccion: estado.direccion,
    pagina: estado.pagina,
    filtros: estado.filtros,
    usuarioId,
    porPagina: estado.modo === "kanban" ? 200 : 50,
  };
  const [datos, config, usuario] = await Promise.all([listar(objeto, opciones), obtenerConfiguracion(), usuarioActual()]);

  const campoGrafico = def.campoKanban ?? def.columnas.find((c) => campoDe(def, c)?.tipo === "lista");
  let grafico: { campo: string; etiqueta: string; grupos: { etiqueta: string; total: number; suma: number }[] } | null = null;
  if (estado.graficos && campoGrafico) {
    const campo = campoDe(def, campoGrafico)!;
    const grupos: Grupo[] = await agruparPor(objeto, campoGrafico, opciones, def.campoSumaKanban);
    grafico = {
      campo: campoGrafico,
      etiqueta: campo.etiqueta,
      grupos: grupos.map((g) => ({ etiqueta: etiquetaOpcion(campo, g.valor) || "(vacío)", total: g.total, suma: g.suma })),
    };
  }

  return (
    <ListaInteractiva
      objeto={objeto}
      app={app}
      estado={estado}
      filas={datos.filas}
      total={datos.total}
      porPagina={datos.porPagina}
      ordenActual={datos.orden}
      direccionActual={datos.direccion}
      moneda={config.moneda}
      grafico={grafico}
      campoGrafico={campoGrafico ?? null}
      columnas={objeto === "candidatos" ? perfilDe(config.perfil).leads.columnas : undefined}
      abrirNuevo={parametros.nuevo === "1" && Boolean(def.acciones.nuevo)}
      abrirImportar={parametros.importar === "1" && Boolean(def.acciones.importar) && puede(usuario?.rol, "importar")}
      permisos={{ eliminar: puede(usuario?.rol, "eliminar"), repartir: puede(usuario?.rol, "repartir"), importar: puede(usuario?.rol, "importar"), escribir: puede(usuario?.rol, "escribir") }}
    />
  );
}
