import type { Metadata } from "next";
import { requerirUsuario } from "@/auth/sesion";
import { obtenerObjeto } from "@/crm/objetos";
import { PaginaFicha } from "@/crm/ui/ficha/pagina-ficha";

export async function generateMetadata({ params }: { params: Promise<{ objeto: string }> }): Promise<Metadata> {
  const { objeto } = await params;
  return { title: obtenerObjeto(objeto)?.etiqueta ?? "Registro" };
}

export default async function FichaRegistro({ params }: { params: Promise<{ app: string; objeto: string; id: string }> }) {
  const [{ app, objeto, id }, usuario] = await Promise.all([params, requerirUsuario()]);
  return <PaginaFicha app={app} objeto={objeto} id={id} usuarioId={usuario.id} />;
}
