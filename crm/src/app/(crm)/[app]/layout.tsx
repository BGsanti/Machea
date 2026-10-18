import { notFound } from "next/navigation";
import { requerirUsuario } from "@/auth/sesion";
import { pestanasDeApp } from "@/crm/navegacion";
import { CabeceraApp } from "@/crm/ui/shell/cabecera-app";

export default async function LayoutApp({ children, params }: { children: React.ReactNode; params: Promise<{ app: string }> }) {
  const { app: id } = await params;
  const usuario = await requerirUsuario();
  const nav = await pestanasDeApp(id, usuario.id);
  if (!nav) notFound();
  return (
    <>
      <CabeceraApp app={nav.app.id} etiqueta={nav.app.etiqueta} pestanas={nav.visibles} disponibles={nav.disponibles} />
      <main className="desplazable min-h-0 flex-1 overflow-y-auto p-4">{children}</main>
    </>
  );
}
