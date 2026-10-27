import type { Metadata } from "next";
import { puede } from "@/auth/permisos";
import { requerirPagina } from "@/auth/sesion";
import { obtenerConfiguracion } from "@/crm/servidor/consultas";
import { equipoConCarga, invitacionesPendientes } from "@/crm/servidor/equipo-consultas";
import { EncabezadoEquipo, InvitacionesPendientes, ListaEquipo, ResumenEquipo, TarjetaReparto } from "./cliente";

export const metadata: Metadata = { title: "Equipo" };

export default async function PaginaEquipo() {
  const usuario = await requerirPagina("equipo");
  const [equipo, pendientes, config] = await Promise.all([equipoConCarga(), invitacionesPendientes(), obtenerConfiguracion()]);
  const miembros = equipo.map((m) => ({ ...m, ultimoAcceso: m.ultimoAcceso?.toISOString() ?? null, creadoEn: m.creadoEn.toISOString() }));
  const soyDueno = usuario.rol === "admin";

  return (
    <main className="desplazable min-h-0 flex-1 overflow-y-auto p-4">
      <div className="animate-subir mx-auto max-w-5xl space-y-4">
        <EncabezadoEquipo puedeInvitarGerentes={soyDueno} />
        <ResumenEquipo miembros={miembros} />
        <ListaEquipo miembros={miembros} yoId={usuario.id} yoRol={usuario.rol} puedeRepartir={puede(usuario.rol, "repartir")} slaMinutos={config.slaMinutos} />
        <InvitacionesPendientes
          invitaciones={pendientes.map((i) => ({ ...i, expira: i.expira.toISOString(), creadaEn: i.creadaEn.toISOString() }))}
          puedeInvitarGerentes={soyDueno}
        />
        <TarjetaReparto
          reparto={config.reparto}
          slaMinutos={config.slaMinutos}
          enElReparto={miembros.filter((m) => m.activo && m.recibeLeads).map((m) => m.nombre)}
          puedeRepartir={puede(usuario.rol, "repartir")}
        />
      </div>
    </main>
  );
}
