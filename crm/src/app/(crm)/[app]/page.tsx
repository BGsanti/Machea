import { notFound, redirect } from "next/navigation";
import { requerirUsuario } from "@/auth/sesion";
import { primeraPestana } from "@/crm/navegacion";

export default async function PaginaApp({ params }: { params: Promise<{ app: string }> }) {
  const { app } = await params;
  const usuario = await requerirUsuario();
  const destino = await primeraPestana(app, usuario.id);
  if (!destino) notFound();
  redirect(destino);
}
