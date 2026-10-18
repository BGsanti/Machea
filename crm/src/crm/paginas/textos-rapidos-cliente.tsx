"use client";

import { useState } from "react";
import { Boton } from "@/ui/boton";
import { FormularioRegistro } from "../ui/formulario-registro";

export function BotonesTextosRapidos({ app, carpeta }: { app: string; carpeta: { id: string; nombre: string } | null }) {
  const [abierto, setAbierto] = useState<"texto" | "carpeta" | null>(null);
  return (
    <>
      <Boton variante="primario" icono="Plus" onClick={() => setAbierto("texto")}>
        Nuevo texto rápido
      </Boton>
      <Boton icono="Folder" onClick={() => setAbierto("carpeta")}>
        Nueva carpeta
      </Boton>
      {abierto === "texto" ? (
        <FormularioRegistro
          objeto="textos-rapidos"
          app={app}
          abierto
          irAlRegistro={false}
          valoresIniciales={carpeta ? { carpetaId: carpeta.id, __nombres: { carpetaId: carpeta.nombre } } : undefined}
          alCerrar={() => setAbierto(null)}
        />
      ) : null}
      {abierto === "carpeta" ? <FormularioRegistro objeto="carpetas-texto" app={app} abierto irAlRegistro={false} alCerrar={() => setAbierto(null)} /> : null}
    </>
  );
}
