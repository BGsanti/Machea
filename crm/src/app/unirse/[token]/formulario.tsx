"use client";

import { useState, useTransition } from "react";
import { aceptarInvitacionLocal } from "@/crm/servidor/equipo-local";
import { claseInput, Etiqueta } from "@/ui/basicos";
import { Boton } from "@/ui/boton";
import { Icono } from "@/ui/icono";

interface RespuestaError {
  detail?: { mensaje?: string; campos?: Record<string, string> };
}

export function FormularioUnirse({ token, correo, machea, destino, loginLocal }: { token: string; correo: string; machea: boolean; destino: string; loginLocal: string }) {
  const [usuario, setUsuario] = useState(correo.split("@")[0]!.toLowerCase().replace(/[^a-z0-9._-]/g, ""));
  const [clave, setClave] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [pendiente, iniciar] = useTransition();
  const [listo, setListo] = useState(false);

  const enviar = () => {
    setError(null);
    setCampos({});
    iniciar(async () => {
      if (machea) {
        // En Machea el acceso lo crea el backend de Machea (mismo dominio: www.machea.co/api/...): deja la sesión abierta.
        const r = await fetch("/api/cuentas/unirse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ token, usuario, clave }),
        }).catch(() => null);
        if (!r) return setError("No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.");
        if (r.ok) {
          setListo(true);
          window.location.assign(destino);
          return;
        }
        const cuerpo = (await r.json().catch(() => ({}))) as RespuestaError;
        setCampos(cuerpo.detail?.campos ?? {});
        setError(cuerpo.detail?.mensaje ?? "No pudimos crear tu acceso. Inténtalo de nuevo.");
        return;
      }
      const r = await aceptarInvitacionLocal(token, clave);
      if (r.ok) {
        setListo(true);
        window.location.assign(loginLocal);
      } else setError(r.mensaje ?? "No se pudo crear el acceso.");
    });
  };

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <div>
        <Etiqueta htmlFor="u-correo">Tu correo</Etiqueta>
        <input id="u-correo" value={correo} readOnly className={`${claseInput} bg-slate-50 text-slate-500`} />
      </div>
      {machea ? (
        <div>
          <Etiqueta htmlFor="u-usuario" requerido>
            Nombre de usuario
          </Etiqueta>
          <input
            id="u-usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value.toLowerCase())}
            autoComplete="username"
            required
            className={claseInput}
            aria-invalid={Boolean(campos.usuario)}
          />
          {campos.usuario ? <p className="mt-1 text-xs text-rose-600">{campos.usuario}</p> : <p className="mt-1 text-xs text-slate-500">Minúsculas, números, puntos o guiones.</p>}
        </div>
      ) : null}
      <div>
        <Etiqueta htmlFor="u-clave" requerido>
          Crea tu contraseña
        </Etiqueta>
        <div className="relative">
          <input
            id="u-clave"
            type={ver ? "text" : "password"}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="new-password"
            minLength={machea ? 10 : 8}
            required
            className={`${claseInput} pr-10`}
            aria-invalid={Boolean(campos.clave)}
          />
          <button
            type="button"
            onClick={() => setVer(!ver)}
            aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
          >
            <Icono nombre={ver ? "EyeOff" : "Eye"} className="size-4" />
          </button>
        </div>
        {campos.clave ? <p className="mt-1 text-xs text-rose-600">{campos.clave}</p> : <p className="mt-1 text-xs text-slate-500">Al menos {machea ? 10 : 8} caracteres. Una frase larga es mejor que una palabra rara.</p>}
      </div>
      {error && !campos.usuario && !campos.clave ? (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <Boton type="submit" variante="primario" className="w-full" cargando={pendiente || listo}>
        {listo ? "Entrando…" : "Crear mi acceso y entrar"}
      </Boton>
    </form>
  );
}
