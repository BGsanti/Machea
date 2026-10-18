"use client";

import { useActionState } from "react";
import { crearAdministrador, iniciarSesion, type EstadoLogin } from "@/auth/acciones";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { Boton } from "@/ui/boton";

export function FormularioAcceso({ primeraVez }: { primeraVez: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(primeraVez ? crearAdministrador : iniciarSesion, {});
  return (
    <form action={accion} className="mt-6 space-y-4">
      {estado.error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{estado.error}</p> : null}
      {primeraVez ? (
        <>
          <div>
            <Etiqueta htmlFor="nombre" requerido>
              Su nombre
            </Etiqueta>
            <input id="nombre" name="nombre" required autoComplete="name" className={claseInput} />
          </div>
          <div>
            <Etiqueta htmlFor="empresa">Nombre de la empresa</Etiqueta>
            <input id="empresa" name="empresa" autoComplete="organization" className={claseInput} />
          </div>
        </>
      ) : null}
      <div>
        <Etiqueta htmlFor="email" requerido>
          Correo electrónico
        </Etiqueta>
        <input id="email" name="email" type="email" required autoComplete="email" className={claseInput} />
      </div>
      <div>
        <Etiqueta htmlFor="password" requerido>
          Contraseña
        </Etiqueta>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={primeraVez ? 8 : undefined}
          autoComplete={primeraVez ? "new-password" : "current-password"}
          className={claseInput}
        />
        {primeraVez ? <p className="mt-1 text-xs text-slate-500">Al menos 8 caracteres.</p> : null}
      </div>
      <Boton type="submit" variante="primario" cargando={pendiente} className="w-full">
        {primeraVez ? "Crear cuenta y entrar" : "Iniciar sesión"}
      </Boton>
    </form>
  );
}
