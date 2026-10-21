import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { firmarToken, formularioPorSlug } from "@/crm/formularios/datos";
import { FormularioPublico } from "@/crm/formularios/ui/formulario-publico";

// Cada visita firma su propia hora de apertura (anti-robots): nunca se guarda en caché.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const f = await formularioPorSlug(slug).catch(() => null);
  return { title: { absolute: f?.config.textos.titulo ?? "Formulario" }, robots: { index: false, follow: false } };
}

/**
 * Página pública de un formulario de una empresa: sin sesión, sin barra del CRM. Se puede abrir directamente o
 * incrustar con un iframe en el sitio de la empresa (la cabecera de /f/* lo permite en next.config.ts).
 */
export default async function PaginaPublicaFormulario({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = await formularioPorSlug(slug);
  if (!f) notFound();

  if (f.estado !== "activo") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fcfaf8] px-4">
        <div className="max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-800">Este formulario no está disponible</h1>
          <p className="mt-2 text-sm text-slate-600">Por ahora no está recibiendo respuestas. Si necesitas ayuda, comunícate directamente con {f.nombreEmpresa || "la empresa"}.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-[#fcfaf8] px-4 py-8 sm:py-12">
      <div className="w-full max-w-xl">
        <div className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(45,59,78,.05),0_12px_32px_-16px_rgba(45,59,78,.18)] sm:p-8">
          <FormularioPublico config={f.config} catalogo={f.catalogo} slug={slug} token={firmarToken(slug)} nombreEmpresa={f.nombreEmpresa} />
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">Formulario creado con Machea</p>
      </div>
    </main>
  );
}
