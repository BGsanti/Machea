import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { urlMachea } from "@/auth/machea";
import { modoAuth } from "@/auth/servidor";
import { usuarioActual } from "@/auth/sesion";
import { hayUsuarios } from "@/crm/servidor/consultas";
import { LogoMacheaCompleto } from "@/ui/logo-machea";
import { FormularioAcceso } from "./formulario";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function Login() {
  // Con el login de Machea, esta pantalla no existe: se entra por /acceso/ de Machea.
  if (modoAuth() === "machea") redirect(`${urlMachea()}/acceso/?volver=${encodeURIComponent("/crm/")}`);
  if (await usuarioActual()) redirect("/");
  const primeraVez = !(await hayUsuarios());
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-riel to-riel-claro px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <LogoMacheaCompleto className="h-9 w-auto" />
        </div>
        <div className="rounded-2xl bg-white p-8 shadow-2xl">
          <h1 className="text-xl font-semibold text-slate-800">{primeraVez ? "Cree la cuenta de administrador" : "Iniciar sesión"}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {primeraVez
              ? "Es la primera vez que se abre el CRM. Esta cuenta podrá crear al resto de usuarios."
              : "Escriba su correo y contraseña para continuar."}
          </p>
          <FormularioAcceso primeraVez={primeraVez} />
        </div>
      </div>
    </main>
  );
}
