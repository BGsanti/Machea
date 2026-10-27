import type { Metadata } from "next";
import { ETIQUETA_ROL, rolDe } from "@/auth/permisos";
import { modoAuth } from "@/auth/servidor";
import { invitacionPorToken } from "@/crm/servidor/equipo-invitaciones";
import { LogoMacheaCompleto } from "@/ui/logo-machea";
import { FormularioUnirse } from "./formulario";

export const metadata: Metadata = { title: "Únete al equipo", robots: { index: false, follow: false } };

export default async function Unirse({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await invitacionPorToken(token);
  const machea = modoAuth() === "machea";
  const base = process.env.CRM_BASE_PATH ?? "";
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-riel to-riel-claro px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center text-white">
          <LogoMacheaCompleto className="h-9 w-auto" />
        </div>
        <div className="animate-subir rounded-2xl bg-white p-8 shadow-2xl">
          {inv ? (
            <>
              <p className="text-xs font-semibold tracking-wide text-marca-700 uppercase">Te invitaron</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-800">Hola, {inv.nombre.split(" ")[0]}</h1>
              <p className="mt-2 text-sm text-slate-600">
                <strong>{inv.empresa}</strong> te sumó a su equipo en Machea como <strong>{ETIQUETA_ROL[rolDe(inv.rol)].toLowerCase()}</strong>. Elige cómo vas a entrar.
              </p>
              <FormularioUnirse token={token} correo={inv.correo} machea={machea} destino={`${base}/inicio`} loginLocal={`${base}/login`} />
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-slate-800">Esta invitación ya no sirve</h1>
              <p className="mt-2 text-sm text-slate-600">
                El enlace venció, ya se usó o fue cancelado. Pídele a quien te invitó que cree uno nuevo desde <strong>Equipo</strong> en el CRM.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
