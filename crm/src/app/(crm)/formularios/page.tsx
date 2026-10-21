import type { Metadata } from "next";
import { requerirUsuario } from "@/auth/sesion";
import { listarFormularios } from "@/crm/formularios/datos";
import { perfilDe } from "@/crm/perfiles";
import { obtenerConfiguracion } from "@/crm/servidor/consultas";
import { ListaFormularios } from "./lista";

export const metadata: Metadata = { title: "Formularios" };

export default async function PaginaFormularios() {
  await requerirUsuario();
  const [config, filas] = await Promise.all([obtenerConfiguracion(), listarFormularios()]);
  const perfil = perfilDe(config.perfil);
  return (
    <main className="desplazable min-h-0 flex-1 overflow-y-auto p-4">
      <div className="animate-subir mx-auto max-w-5xl space-y-4">
        <ListaFormularios
          formularios={filas.map((f) => ({ ...f, actualizadoEn: f.actualizadoEn.toISOString() }))}
          plantillaInicial={perfil.formulario.plantillaInicial}
          perfil={perfil.id}
        />
      </div>
    </main>
  );
}
