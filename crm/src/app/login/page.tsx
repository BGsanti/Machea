import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/auth/sesion";
import { hayUsuarios } from "@/crm/servidor/consultas";
import { FormularioAcceso } from "./formulario";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function Login() {
  if (await usuarioActual()) redirect("/");
  const primeraVez = !(await hayUsuarios());
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-riel via-riel-claro to-marca-800 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-white/15 text-xl font-bold">R</span>
          <span className="text-2xl font-semibold">REA CRM</span>
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
