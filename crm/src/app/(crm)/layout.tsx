import { urlMachea } from "@/auth/machea";
import { modoAuth } from "@/auth/servidor";
import { requerirUsuario } from "@/auth/sesion";
import { notificacionesDe, obtenerConfiguracion, tareasAbiertas } from "@/crm/servidor/consultas";
import { BarraApps } from "@/crm/ui/shell/barra-apps";
import { BarraUtilidades } from "@/crm/ui/shell/barra-utilidades";
import { Cabecera } from "@/crm/ui/shell/cabecera";

export default async function LayoutCrm({ children }: { children: React.ReactNode }) {
  const usuario = await requerirUsuario();
  const [config, notificaciones, tareas] = await Promise.all([
    obtenerConfiguracion(),
    notificacionesDe(usuario.id),
    tareasAbiertas(usuario.id),
  ]);
  return (
    <div className="flex h-screen overflow-hidden">
      <BarraApps />
      <div className="flex min-w-0 flex-1 flex-col">
        <Cabecera
          usuario={usuario}
          empresa={config.nombreEmpresa}
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
