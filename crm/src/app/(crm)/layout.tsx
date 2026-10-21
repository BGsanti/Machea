import { urlMachea } from "@/auth/machea";
import { modoAuth } from "@/auth/servidor";
import { requerirUsuario } from "@/auth/sesion";
import { notificacionesDe, obtenerConfiguracion, tareasAbiertas } from "@/crm/servidor/consultas";
import { procesarBandeja } from "@/crm/servidor/ingesta";
import { BarraApps } from "@/crm/ui/shell/barra-apps";
import { AvisosEnVivo } from "@/crm/ui/shell/avisos-en-vivo";
import { BarraUtilidades } from "@/crm/ui/shell/barra-utilidades";
import { Cabecera } from "@/crm/ui/shell/cabecera";

export default async function LayoutCrm({ children }: { children: React.ReactNode }) {
  const usuario = await requerirUsuario();
  // Leads nuevos de Machea (ingesta.ts): se procesan al entrar, en lotes cortos. Un fallo no tumba la página.
  if (modoAuth() === "machea") {
    await procesarBandeja(usuario).catch((e) => console.error("[crm] bandeja de leads:", e));
  }
  const [config, notificaciones, tareas] = await Promise.all([
    obtenerConfiguracion(),
    notificacionesDe(usuario.id),
    tareasAbiertas(usuario.id),
  ]);
  return (
    <div className="flex h-screen overflow-hidden">
      <BarraApps empresa={config.nombreEmpresa} />
      <AvisosEnVivo />
      <div className="flex min-w-0 flex-1 flex-col">
        <Cabecera
          usuario={usuario}
          notificaciones={notificaciones.lista}
          sinLeer={notificaciones.sinLeer}
          urlMachea={modoAuth() === "machea" ? urlMachea() : undefined}
        />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <BarraUtilidades
          tareas={tareas.map((t) => ({ id: t.id, asunto: t.asunto, fechaVencimiento: t.fechaVencimiento, prioridad: t.prioridad }))}
        />
      </div>
    </div>
  );
}
