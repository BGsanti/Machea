import type { Metadata } from "next";
import { urlMachea } from "@/auth/machea";
import { LogoMacheaCompleto } from "@/ui/logo-machea";

export const metadata: Metadata = { title: "Acceso desactivado", robots: { index: false, follow: false } };

export default function SinAcceso() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-riel to-riel-claro px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center text-white">
          <LogoMacheaCompleto className="h-9 w-auto" />
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-slate-800">Tu acceso a este CRM está desactivado</h1>
          <p className="mt-2 text-sm text-slate-600">
            Quien administra el equipo de tu empresa desactivó tu acceso. Si crees que es un error, escríbele para que lo reactive.
          </p>
          <a href={`${urlMachea()}/`} className="mt-5 inline-flex h-9 items-center rounded-md border border-slate-300 px-3.5 text-sm font-medium text-marca-800 hover:bg-slate-50">
            Ir a machea.co
          </a>
        </div>
      </div>
    </main>
  );
}
