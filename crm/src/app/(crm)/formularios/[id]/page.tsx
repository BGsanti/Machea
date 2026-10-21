import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirUsuario } from "@/auth/sesion";
import { obtenerFormulario, opcionesDeCatalogo, ultimosEnvios } from "@/crm/formularios/datos";
import { EditorFormulario } from "./editor";

export const metadata: Metadata = { title: "Editar formulario" };

export default async function PaginaEditorFormulario({ params }: { params: Promise<{ id: string }> }) {
  await requerirUsuario();
  const { id } = await params;
  const f = await obtenerFormulario(id);
  if (!f) notFound();
  if (!f.config) {
    return (
      <main className="p-6">
        <p className="text-sm text-slate-600">
          La configuración de este formulario no es válida.{" "}
          <Link href="/formularios" className="text-marca-700 hover:underline">
            Volver a los formularios
          </Link>
        </p>
      </main>
    );
  }
  const [catalogo, envios] = await Promise.all([opcionesDeCatalogo(), ultimosEnvios(id)]);
  return (
    <main className="desplazable min-h-0 flex-1 overflow-y-auto p-4">
      <div className="animate-subir mx-auto max-w-7xl">
        <EditorFormulario
          formulario={{ id: f.id, nombre: f.nombre, slug: f.slug, estado: f.estado }}
          configInicial={f.config}
          catalogo={catalogo}
          envios={envios.map((e) => ({ id: e.id, creadoEn: e.creadoEn.toISOString(), candidatoId: e.candidatoId, nombre: [e.nombre, e.apellidos].filter((x) => x && x !== "(sin apellido)").join(" ") || "Sin nombre" }))}
        />
      </div>
    </main>
  );
}
