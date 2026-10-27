import { and, eq, or } from "drizzle-orm";
import { usuarioActual } from "@/auth/sesion";
import { puede } from "@/auth/permisos";
import { bd } from "@/db/cliente";
import { conEmpresa } from "@/db/contexto";
import { bandejaLeads, enviosFormulario, empresas, leadsMachea } from "@/db/esquema";
import { actividadesDe, obtener } from "@/crm/servidor/repositorio";

export const dynamic = "force-dynamic";

const OBJETOS = ["candidatos", "contactos"];

/**
 * Todos los datos que la empresa tiene de UNA persona (lead o contacto), en un archivo JSON: lo que se le entrega cuando
 * pide conocer sus datos (Habeas Data, Ley 1581 de 2012). Solo quien puede ver a esa persona lo descarga: un asesor, la
 * suya; el gerente, el dueño y quien consulta, la de cualquiera de la empresa. El borrado es el botón «Eliminar» de la ficha.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ objeto: string; id: string }> }) {
  const usuario = await usuarioActual();
  if (!usuario) return new Response("Inicie sesión.", { status: 401 });
  const { objeto, id } = await params;
  if (!OBJETOS.includes(objeto) || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("No encontrado.", { status: 404 });
  if (!puede(usuario.rol, "ver_todo") && !puede(usuario.rol, "escribir")) return new Response("Sin permiso.", { status: 403 });

  const datos = await conEmpresa(
    usuario.empresaId,
    async () => {
      const persona = await obtener(objeto, id); // un asesor solo la obtiene si es suya
      if (!persona) return null;
      const db = await bd();
      const { pendientes, pasadas } = await actividadesDe(id);
      const envios = await db
        .select({ creadoEn: enviosFormulario.creadoEn, respuestas: enviosFormulario.respuestas, consentimiento: enviosFormulario.consentimiento })
        .from(enviosFormulario)
        .where(and(eq(enviosFormulario.empresaId, usuario.empresaId), eq(enviosFormulario.candidatoId, id)));
      // Las llamadas de Manuela o Camila se unen a la persona por su teléfono.
      const [enlace] = await db.select({ digitos: leadsMachea.telefonoDigitos }).from(leadsMachea).where(and(eq(leadsMachea.empresaId, usuario.empresaId), eq(leadsMachea.candidatoId, id)));
      const llamadas = enlace
        ? (await db.select({ origen: bandejaLeads.origen, origenId: bandejaLeads.origenId, datos: bandejaLeads.datos, creadoEn: bandejaLeads.creadoEn }).from(bandejaLeads).where(and(eq(bandejaLeads.empresaId, usuario.empresaId), or(eq(bandejaLeads.origen, "resultado"), eq(bandejaLeads.origen, "llamada_captacion"))))).filter(
            (f) => f.datos?.telefono_digitos === enlace.digitos,
          )
        : [];
      const [empresa] = await db.select({ nombre: empresas.nombre }).from(empresas).where(eq(empresas.id, usuario.empresaId));
      const { __nombres: _n, ...limpia } = persona;
      void _n;
      return {
        generadoEn: new Date().toISOString(),
        responsable: empresa?.nombre ?? null,
        solicitadoPor: usuario.email,
        tipo: objeto === "candidatos" ? "lead" : "contacto",
        datos: limpia,
        tareasYCitasPendientes: pendientes,
        historial: pasadas,
        formulariosLlenados: envios,
        llamadas: llamadas.map((l) => ({ tipo: l.origen, id: l.origenId, fecha: l.creadoEn, ...l.datos, grabacion_url: undefined })),
      };
    },
    usuario,
  );
  if (!datos) return new Response("No encontrado.", { status: 404 });
  console.info(`[crm] datos exportados: ${objeto}/${id} por ${usuario.id}`);
  return new Response(JSON.stringify(datos, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="datos-${objeto === "candidatos" ? "lead" : "contacto"}-${id.slice(0, 8)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
