import { urlMachea } from "@/auth/machea";
import { puede, soloVeLoSuyo } from "@/auth/permisos";
import { modoAuth } from "@/auth/servidor";
import { requerirUsuario } from "@/auth/sesion";
import { esEsquemaIncompleto } from "@/db/esquema-listo";
import { Actualizando } from "@/ui/actualizando";
import { notificacionesDe, obtenerConfiguracion, tareasAbiertas } from "@/crm/servidor/consultas";
import { cuantasPersonas } from "@/crm/servidor/equipo-consultas";
import { procesarBandeja } from "@/crm/servidor/ingesta";
import { medidorRespuesta } from "@/crm/servidor/panel";
import { BarraApps } from "@/crm/ui/shell/barra-apps";
import { AvisosEnVivo } from "@/crm/ui/shell/avisos-en-vivo";
import { BarraUtilidades } from "@/crm/ui/shell/barra-utilidades";
import { CuentaMenu } from "@/crm/ui/shell/cuenta-menu";
import { TarjetaMedidor } from "@/crm/ui/shell/medidor-respuesta";
import { TarjetaInvitar } from "@/crm/ui/shell/tarjeta-invitar";
import { PaletaComandos } from "@/crm/ui/shell/paleta-comandos";
import { Cabecera } from "@/crm/ui/shell/cabecera";

export default async function LayoutCrm({ children }: { children: React.ReactNode }) {
  let usuario;
  try {
    usuario = await requerirUsuario();
  } catch (e) {
    // La migración de la base no está aplicada todavía: pantalla clara en vez de un error. (Las redirecciones pasan de largo.)
    if (esEsquemaIncompleto(e)) return <Actualizando error={e} />;
    throw e;
  }
  // Leads nuevos de Machea (ingesta.ts): se procesan al entrar, en lotes cortos. Un fallo no tumba la página.
  if (modoAuth() === "machea") {
    await procesarBandeja(usuario).catch((e) => console.error("[crm] bandeja de leads:", e));
  }
  const [config, notificaciones, tareas] = await Promise.all([
    obtenerConfiguracion(),
    notificacionesDe(usuario.id),
    tareasAbiertas(usuario.id),
  ]);
  // Lo que acompaña abajo de la barra lateral. Si algo falla, la barra sale sin esas tarjetas: nunca tumba la página.
  const [medidor, personas] = await Promise.all([
    medidorRespuesta(soloVeLoSuyo(usuario.rol) ? usuario.id : null, config.slaMinutos).catch(() => null),
    puede(usuario.rol, "equipo") ? cuantasPersonas().catch(() => 2) : Promise.resolve(2),
  ]);
  const enMachea = modoAuth() === "machea";
  return (
    <div className="flex h-screen overflow-hidden">
      <BarraApps
        empresa={config.nombreEmpresa}
        perfil={config.perfil}
        rol={usuario.rol}
        pie={
          <>
            {personas <= 1 ? <TarjetaInvitar /> : null}
            {medidor ? <TarjetaMedidor m={medidor} /> : null}
          </>
        }
        cuenta={<CuentaMenu usuario={{ nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }} urlMachea={enMachea ? urlMachea() : undefined} />}
      />
      <AvisosEnVivo />
      <PaletaComandos rol={usuario.rol} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Cabecera perfil={config.perfil} notificaciones={notificaciones.lista} sinLeer={notificaciones.sinLeer} />
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <BarraUtilidades
          tareas={tareas.map((t) => ({ id: t.id, asunto: t.asunto, fechaVencimiento: t.fechaVencimiento, prioridad: t.prioridad }))}
        />
      </div>
    </div>
  );
}
