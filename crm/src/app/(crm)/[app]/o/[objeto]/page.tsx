import type { Metadata } from "next";
import { requerirUsuario } from "@/auth/sesion";
import { obtenerObjeto } from "@/crm/objetos";
import { PaginaLista } from "@/crm/ui/lista/pagina-lista";

export async function generateMetadata({ params }: { params: Promise<{ objeto: string }> }): Promise<Metadata> {
  const { objeto } = await params;
  return { title: obtenerObjeto(objeto)?.etiquetaPlural ?? "Lista" };
}

export default async function ListaObjeto({
  params,
  searchParams,
}: {
  params: Promise<{ app: string; objeto: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ app, objeto }, parametros, usuario] = await Promise.all([params, searchParams, requerirUsuario()]);
  return <PaginaLista app={app} objeto={objeto} parametros={parametros} usuarioId={usuario.id} />;
}
