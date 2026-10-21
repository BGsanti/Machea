"use client";

import Link from "next/link";
import { useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { Tarjeta } from "@/ui/basicos";
import { Icono, IconoObjeto } from "@/ui/icono";
import { quitarDeCampana } from "../../servidor/especiales";

interface Miembro {
  id: string;
  objeto: string;
  registroId: string;
  nombre: string;
  email: string | null;
  estado: string;
}

export function MiembrosCampana({ miembros, app }: { miembros: Miembro[]; app: string }) {
  const [, iniciar] = useTransition();
  return (
    <Tarjeta titulo={`Miembros de la campaña (${miembros.length})`} icono={<IconoObjeto icono="Users" color="bg-orange-600" tamano="sm" />} sinRelleno>
      {miembros.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-500">Agregue contactos o candidatos con «Agregar miembros» o desde sus listas.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {miembros.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/${app}/o/${m.objeto}/${m.registroId}`} className="text-sm font-medium text-marca-700 hover:underline">
                  {m.nombre}
                </Link>
                <p className="text-xs text-slate-500">
                  {m.objeto === "contactos" ? "Contacto" : "Lead"}
                  {m.email ? ` · ${m.email}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  iniciar(async () => {
                    const r = await quitarDeCampana(m.id);
                    avisar(r.mensaje ?? "");
                  })
                }
                className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                aria-label={`Quitar a ${m.nombre}`}
              >
                <Icono nombre="X" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
