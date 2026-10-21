"use server";

import { and, eq } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { conEmpresa } from "@/db/contexto";
import { candidatos, enviosFormulario, leadsMachea, notificaciones, usuarios } from "@/db/esquema";
import { fechaLocal } from "../fechas";
import * as repo from "../servidor/repositorio";
import { contarEnvios, edadDelToken, formularioPorSlug, huellaDeIp, type FormularioPublico } from "./datos";
import { validarEnvio, type EnvioValido } from "./validar";

export interface ResultadoEnvio {
  ok: boolean;
  mensaje?: string;
  errores?: Record<string, string>;
}

const HORA = 3_600_000;
const POR_IP_POR_HORA = 6;
const POR_FORMULARIO_POR_DIA = 400;

/**
 * Recibe lo que una persona llenó en la página pública de un formulario y lo convierte en un lead de la empresa dueña.
 * Se defiende de lo que pueda mandar cualquiera: valida todo contra la configuración guardada, rechaza robots
 * (campo trampa y envío demasiado rápido), limita los envíos por persona y por formulario, y exige la autorización de datos.
 */
export async function enviarFormulario(
  slug: string,
  token: string,
  valores: Record<string, string>,
  autoriza: boolean,
  trampa: string,
): Promise<ResultadoEnvio> {
  // Un robot llena el campo escondido: se le responde que todo salió bien y no se guarda nada.
  if (trampa) return { ok: true };

  const edad = edadDelToken(slug, token);
  if (edad === null || edad > 6 * HORA) return { ok: false, mensaje: "La página estuvo abierta mucho tiempo. Recárguela e inténtelo de nuevo." };
  if (edad < 2500) return { ok: false, mensaje: "Un momento: revise sus respuestas y envíe de nuevo." };

  const form = await formularioPorSlug(slug);
  if (!form || form.estado !== "activo") return { ok: false, mensaje: "Este formulario no está disponible." };

  const ipHash = await huellaDeIp();
  const ahora = Date.now();
  if ((await contarEnvios(form.id, new Date(ahora - HORA), ipHash)) >= POR_IP_POR_HORA) return { ok: false, mensaje: "Ya enviaste varias solicitudes. Intenta de nuevo más tarde." };
  if ((await contarEnvios(form.id, new Date(ahora - 24 * HORA))) >= POR_FORMULARIO_POR_DIA) return { ok: false, mensaje: "Estamos recibiendo muchas solicitudes. Intenta de nuevo en unas horas." };

  const r = validarEnvio(form.config, valores, autoriza);
  if (r.errores) return { ok: false, mensaje: "Revise las preguntas marcadas.", errores: r.errores };

  try {
    await conEmpresa(form.empresaId, () => registrar(form, r.envio, ipHash, autoriza));
  } catch (e) {
    console.error("[formularios] no se pudo guardar un envío:", e);
    return { ok: false, mensaje: "No pudimos guardar tus datos. Intenta de nuevo en un momento." };
  }
  return { ok: true };
}

async function registrar(form: FormularioPublico, envio: EnvioValido, ipHash: string, autoriza: boolean) {
  const db = await bd();
  const empresaId = form.empresaId;
  const admins = await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.rol, "admin")));
  const responsable = admins[0]?.id ?? (await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.empresaId, empresaId)).limit(1))[0]?.id;
  if (!responsable) throw new Error("La empresa no tiene usuarios.");

  const { lead, digitos, respuestas } = envio;
  const nombreVisible = [lead.nombre, lead.apellidos].filter((x) => x && x !== "(sin apellido)").join(" ") || "Alguien";
  const origenExterno = `tel:${digitos}`;

  // ¿La misma persona ya es un lead de la empresa (por un formulario de Machea o por este)?
  let candidatoId: string | null = null;
  const [enlace] = await db.select({ id: leadsMachea.candidatoId }).from(leadsMachea).where(and(eq(leadsMachea.empresaId, empresaId), eq(leadsMachea.telefonoDigitos, digitos)));
  if (enlace && (await repo.obtener("candidatos", enlace.id))) candidatoId = enlace.id;
  if (!candidatoId) {
    const [previo] = await db.select({ id: candidatos.id }).from(candidatos).where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.origenExterno, origenExterno)));
    candidatoId = previo?.id ?? null;
  }

  const descripcion = `Llenó el formulario **${form.nombre}**.${lead.interes ? ` Le interesa **${lead.interes}**.` : ""}`;
  let nuevo = false;
  if (candidatoId) {
    const actual = await repo.obtener("candidatos", candidatoId);
    await repo.actualizar(
      "candidatos",
      candidatoId,
      { respuestas, ...(lead.interes ? { interes: lead.interes } : {}), ...(lead.email && !actual?.email ? { email: lead.email } : {}) },
      responsable,
    );
    await repo.crear("tareas", { asunto: `Volvió a llenar «${form.nombre}»`, tipo: "llamada", fechaVencimiento: fechaLocal(), prioridad: "alta", quienObjeto: "candidatos", quienId: candidatoId }, responsable);
  } else {
    try {
      candidatoId = await repo.crear(
        "candidatos",
        {
          nombre: lead.nombre,
          apellidos: lead.apellidos,
          compania: lead.compania,
          cargo: lead.cargo,
          telefono: lead.telefono,
          email: lead.email,
          ciudad: lead.ciudad,
          pais: "Colombia",
          interes: lead.interes,
          estado: "nuevo",
          origen: "formulario_empresa",
          descripcion,
          respuestas,
          origenExterno,
        },
        responsable,
      );
      nuevo = true;
    } catch (e) {
      // Otro envío de la misma persona entró a la vez: se usa ese lead.
      const [ya] = await db.select({ id: candidatos.id }).from(candidatos).where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.origenExterno, origenExterno)));
      if (!ya) throw e;
      candidatoId = ya.id;
    }
    await db.insert(leadsMachea).values({ empresaId, telefonoDigitos: digitos, candidatoId }).onConflictDoNothing();
    await repo.crear("tareas", { asunto: `Contactar a ${nombreVisible} (${form.nombre})`, tipo: "llamada", fechaVencimiento: fechaLocal(), prioridad: "alta", quienObjeto: "candidatos", quienId: candidatoId }, responsable);
  }

  await db.insert(enviosFormulario).values({
    empresaId,
    formularioId: form.id,
    candidatoId,
    respuestas,
    consentimiento: autoriza ? { version: form.config.consentimiento.version, texto: form.config.consentimiento.texto, aceptadaEn: new Date().toISOString() } : null,
    ipHash,
  });

  for (const a of admins.length ? admins : [{ id: responsable }]) {
    await db.insert(notificaciones).values({
      usuarioId: a.id,
      titulo: nuevo ? `Nuevo lead: ${nombreVisible}` : `${nombreVisible} volvió a escribir`,
      cuerpo: `Por el formulario «${form.nombre}»${lead.interes ? ` · ${lead.interes}` : ""}`,
      enlace: `/ventas/o/candidatos/${candidatoId}`,
    });
  }
}
