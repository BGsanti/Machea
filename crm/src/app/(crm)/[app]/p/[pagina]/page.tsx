import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requerirUsuario } from "@/auth/sesion";
import { obtenerApp } from "@/crm/apps";
import { PaginaAnalisis } from "@/crm/paginas/analisis";
import { PaginaCalendario } from "@/crm/paginas/calendario";
import { PaginaFlujo } from "@/crm/paginas/flujo";
import { PaginaInformacionGeneral, PaginaInicio } from "@/crm/paginas/inicio";
import { PaginaTextosRapidos } from "@/crm/paginas/textos-rapidos";
import {
  PaginaAutomatizacion,
  PaginaCentroAccion,
  PaginaIntegraciones,
  PaginaMarketing,
  PaginaSuCuenta,
  PaginaSupervisar,
} from "@/crm/paginas/varias";

const titulos: Record<string, string> = {
  inicio: "Inicio",
  "informacion-general": "Información general",
  calendario: "Calendario",
  analisis: "Análisis",
  "textos-rapidos": "Textos rápidos",
  marketing: "Marketing",
  "su-cuenta": "Su cuenta",
  automatizacion: "Automatización",
  integraciones: "Integraciones",
  supervisar: "Supervisar",
  "centro-accion": "Centro de acción",
  flujo: "Flujo",
};

export async function generateMetadata({ params }: { params: Promise<{ pagina: string }> }): Promise<Metadata> {
  const { pagina } = await params;
  return { title: titulos[pagina] ?? "Machea" };
}

export default async function PaginaEspecial({
  params,
  searchParams,
}: {
  params: Promise<{ app: string; pagina: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ app, pagina }, parametros, usuario] = await Promise.all([params, searchParams, requerirUsuario()]);
  if (!obtenerApp(app)) notFound();

  switch (pagina) {
    case "inicio":
      return <PaginaInicio usuario={usuario} app={app} parametros={parametros} />;
    case "informacion-general":
      return <PaginaInformacionGeneral usuario={usuario} app={app} />;
    case "calendario":
      return <PaginaCalendario usuario={usuario} app={app} parametros={parametros} />;
    case "analisis":
      return <PaginaAnalisis usuario={usuario} app={app} parametros={parametros} />;
    case "textos-rapidos":
      return <PaginaTextosRapidos usuario={usuario} app={app} parametros={parametros} />;
    case "marketing":
      return <PaginaMarketing usuario={usuario} app={app} />;
    case "su-cuenta":
      return <PaginaSuCuenta usuario={usuario} />;
    case "automatizacion":
      return <PaginaAutomatizacion usuario={usuario} app={app} />;
    case "integraciones":
      return <PaginaIntegraciones usuario={usuario} app={app} parametros={parametros} />;
    case "supervisar":
      return <PaginaSupervisar />;
    case "centro-accion":
      return <PaginaCentroAccion />;
    case "flujo":
      return <PaginaFlujo app={app} parametros={parametros} />;
    default:
      notFound();
  }
}
