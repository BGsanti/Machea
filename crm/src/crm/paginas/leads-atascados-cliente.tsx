"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { avisar } from "@/ui/avisos";
import { Boton } from "@/ui/boton";
import { reintentarLeadAtascado } from "../servidor/atascados-acciones";

export function BotonReintentar({ id }: { id: number }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();

  return (
    <Boton
      variante="primario"
      tamano="sm"
      icono="RefreshCw"
      cargando={pendiente}
      onClick={() =>
        iniciar(async () => {
          try {
            const r = await reintentarLeadAtascado(id);
            avisar(r.mensaje ?? (r.ok ? "Hecho." : "Error"), r.ok ? "exito" : "error");
          } catch {
            avisar("No se pudo reintentar. Pruebe de nuevo en un momento.", "error");
          }
          router.refresh();
        })
      }
    >
      Reintentar
    </Boton>
  );
}
