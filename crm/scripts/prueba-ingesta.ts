/**
 * Prueba de la entrada de leads de Machea al CRM (fase 4), de punta a punta en PostgreSQL:
 * Machea escribe como lo hace en producción (guardar_consulta, solicitudes_llamada, resultados_llamada) con un
 * usuario administrador, los triggers de supabase/migrations/20261018130000_crm_ingesta.sql llenan la bandeja,
 * y el CRM la procesa conectado como crm_app.
 *
 * Uso (base con todas las migraciones aplicadas, ver design/crm/PUESTA_EN_MARCHA.md):
 *   DATABASE_URL=postgres://crm_app:...@.../base ADMIN_URL=postgres://postgres@.../base AUTH_MODO=machea \
 *   pnpm exec tsx scripts/prueba-ingesta.ts
 */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { asegurarEmpresaMachea } from "../src/auth/machea";
import { bd } from "../src/db/cliente";
import type { Usuario } from "../src/db/contexto";
import { bandejaLeads, candidatos, ejecucionesFlujo, eventos, tareas } from "../src/db/esquema";
import { procesarBandeja } from "../src/crm/servidor/ingesta";

const admin = new Pool({ connectionString: process.env.ADMIN_URL });
const fallos: string[] = [];
let n = 0;
const ok = (c: unknown, m: string) => {
  n++;
  if (!c) fallos.push(m);
};
const s = randomBytes(3).toString("hex");
const tel = (i: number) => `30${String(Date.now()).slice(-6)}${i}${i}`.slice(0, 10);

async function cuenta(usuario: string) {
  const r = await admin.query(
    "insert into acceso.cuentas (usuario, correo, clave_hash, estado, tipo) values ($1, $2, 'x', 'aprobada', 'constructora') returning id::text",
    [usuario, `${usuario}@prueba.example`],
  );
  const id = r.rows[0].id as string;
  return { id, usuario, correo: `${usuario}@prueba.example`, estado: "aprobada" };
}

const usuarioDe = (c: { id: string; usuario: string; correo: string }): Usuario => ({
  id: c.id, nombre: c.usuario, email: c.correo, rol: "admin", empresaId: c.id,
});

async function consulta(telefono: string, nombre: string, marca: string) {
  await admin.query(
    `select public.guardar_consulta(p_nombre => $1, p_apellido => 'Prueba', p_correo => $2, p_telefono => $3,
       p_respuestas => '{"operacion":"compra","zona":"Suba","tipo":"VIS","habitaciones":"2"}', p_resultados => '{"items":[{"id":"1"}]}',
       p_marca => $4)`,
    [nombre, `${nombre.toLowerCase()}-${s}@prueba.example`, telefono, marca],
  );
}

async function solicitud(telefono: string, marca: string, dueno: [string, string] | null, autoriza: boolean | null) {
  const r = await admin.query(
    `insert into public.solicitudes_llamada (id, telefono, telefono_digitos, nombre, marca, tipo_operacion, id_proyecto,
       nombre_proyecto, dueno_tipo, dueno_slug, dueno_nombre, autoriza_compartir, version_autorizacion)
     values (gen_random_uuid(), $1, $2, 'Nombre Solicitud', $3, 'compra', '12', 'Senderos de Fontibón', $4, $5, $6, $7, $8)
     returning id::text`,
    [`+57${telefono}`, telefono, marca, dueno?.[0] ?? null, dueno?.[1] ?? null, dueno?.[1] ?? null, autoriza, autoriza ? "compartir-v1" : null],
  );
  return r.rows[0].id as string;
}

async function bandeja(empresaId: string) {
  const r = await admin.query("select origen, origen_id, datos, procesado_en, error from crm.bandeja_leads where empresa_id = $1 order by id", [empresaId]);
  return r.rows as { origen: string; origen_id: string; datos: Record<string, unknown>; procesado_en: Date | null; error: string | null }[];
}

async function main() {
  // Empresas: A recibe su formulario con marca (amarilo); B, sus proyectos (constructora bolivar).
  const A = await cuenta(`ingesta-a-${s}`);
  const B = await cuenta(`ingesta-b-${s}`);
  for (const c of [A, B]) await admin.query("insert into crm.empresas (id, nombre) values ($1, $2)", [c.id, c.usuario]);
  // Las fuentes son únicas por (tipo, slug): se limpian las de corridas anteriores.
  await admin.query("delete from crm.empresa_fuentes where (tipo, slug) in (('marca','amarilo'), ('constructora','bolivar'))");
  await admin.query("insert into crm.empresa_fuentes (empresa_id, tipo, slug) values ($1, 'marca', 'amarilo'), ($2, 'constructora', 'bolivar')", [A.id, B.id]);
  // El CRM las inicializa al entrar (como crm_app), aunque /admin las haya creado antes.
  await asegurarEmpresaMachea(A);
  await asegurarEmpresaMachea(B);
  const inicial = await admin.query("select count(*)::int as n from crm.informes where empresa_id = $1", [B.id]);
  ok(inicial.rows[0].n > 0, "La empresa creada por /admin no recibió sus informes iniciales.");
  // Un flujo de B: candidato caliente → tarea. Debe correr cuando el lead llega con temperatura.
  await admin.query(
    `insert into crm.flujos (empresa_id, nombre, objeto, disparador, condiciones, acciones, activo)
     values ($1, 'Calientes', 'candidatos', 'crear_o_actualizar', '[{"campo":"valoracion","operador":"igual","valor":"caliente"}]',
       '[{"tipo":"crear_tarea","asunto":"Llamar ya al candidato caliente","prioridad":"alta"}]', true)`,
    [B.id],
  );

  const p1 = tel(1), p2 = tel(2), p3 = tel(3);
  await consulta(p1, "Paula", "amarilo"); // formulario de Amarilo → A
  await consulta(p2, "Pedro", "machea"); // formulario de Machea → nadie por la marca
  await consulta(p3, "Pilar", "machea");
  const s1 = await solicitud(p1, "amarilo", ["constructora", "amarilo"], null); // marca → A
  const s2 = await solicitud(p2, "machea", ["constructora", "bolivar"], true); // proyecto, autorizado → B
  await solicitud(p2, "machea", ["constructora", "cusezar"], true); // dueño sin empresa → nadie
  await solicitud(p3, "machea", ["constructora", "bolivar"], null); // sin autorización → nadie
  void s1;

  // Resultado de la llamada de p2: caliente, con cita a las 16:00 de Bogotá.
  await admin.query(
    `insert into public.resultados_llamada (call_id, solicitud_id, telefono, temperatura_lead, resumen_llamada, recomendacion_asesor,
       cita_agendada, fecha_hora_cita, canal_cita)
     values ($1, $2, $3, 'caliente', 'Quiere visitar el sábado con su pareja.', 'Llevar simulación de crédito.', true, '2026-10-21 16:00', 'visita_sala')`,
    [`c-${s}`, s2, `+57${p2}`],
  );

  const bA = await bandeja(A.id);
  const bB = await bandeja(B.id);
  ok(bA.length === 2 && bA.every((f) => f.datos.regla === "marca"), `Bandeja de A: ${JSON.stringify(bA.map((f) => [f.origen, f.datos.regla]))}`);
  ok(bB.length === 2 && bB.some((f) => f.origen === "solicitud" && f.datos.regla === "proyecto") && bB.some((f) => f.origen === "resultado"),
    `Bandeja de B: ${JSON.stringify(bB.map((f) => [f.origen, f.datos.regla]))}`);
  ok(![...bA, ...bB].some((f) => f.datos.telefono_digitos === p3), "Llegó un lead sin autorización.");
  ok(!bA.some((f) => f.datos.telefono_digitos === p2), "A recibió un lead de B.");

  // Procesar: B dos veces a la vez (no debe duplicar), y A.
  const [h1, h2] = await Promise.all([procesarBandeja(usuarioDe(B)), procesarBandeja(usuarioDe(B))]);
  ok(h1 + h2 === 2, `Filas de B procesadas: ${h1} + ${h2}.`);
  ok((await procesarBandeja(usuarioDe(A))) === 2, "Filas de A sin procesar.");
  ok((await procesarBandeja(usuarioDe(B))) === 0, "Volver a procesar hizo algo.");

  const db = await bd();
  const candB = await db.select().from(candidatos).where(eq(candidatos.empresaId, B.id));
  ok(candB.length === 1, `Candidatos de B: ${candB.length}.`);
  const c = candB[0];
  ok(c && c.nombre === "Pedro" && c.apellidos === "Prueba" && c.email?.startsWith("pedro-") && c.origen === "proyecto_machea",
    `Candidato de B: ${JSON.stringify(c && { n: c.nombre, a: c.apellidos, e: c.email, o: c.origen })}`);
  ok(c?.valoracion === "caliente", "La temperatura no llegó como valoración.");
  ok(c?.descripcion?.includes("Senderos de Fontibón") && c?.descripcion?.includes("Suba"), "La descripción no trae el proyecto y las respuestas.");
  const tareasB = await db.select().from(tareas).where(eq(tareas.empresaId, B.id));
  const llamada = tareasB.find((t) => t.origenExterno === `llamada:c-${s}`);
  ok(llamada && llamada.tipo === "llamada" && llamada.estado === "completada" && llamada.comentarios?.includes("visitar el sábado")
     && llamada.quienId === c?.id, "La llamada de Manuela no quedó como tarea completada del candidato.");
  ok(tareasB.some((t) => t.asunto === "Llamar ya al candidato caliente"), "El flujo de B no corrió con el lead caliente.");
  const ejec = await db.select().from(ejecucionesFlujo).where(eq(ejecucionesFlujo.empresaId, B.id));
  ok(ejec.length >= 1 && ejec.every((e) => e.estado === "completada"), "El flujo no dejó su ejecución.");
  const citas = await db.select().from(eventos).where(and(eq(eventos.empresaId, B.id), eq(eventos.origenExterno, `cita:c-${s}`)));
  ok(citas.length === 1 && citas[0]!.inicio.toISOString() === "2026-10-21T21:00:00.000Z", `Cita: ${citas[0]?.inicio.toISOString()} (16:00 Bogotá = 21:00 UTC).`);

  const candA = await db.select().from(candidatos).where(eq(candidatos.empresaId, A.id));
  ok(candA.length === 1 && candA[0]!.nombre === "Paula" && candA[0]!.origen === "formulario_marca", `Candidatos de A: ${candA.map((x) => x.nombre)}`);

  // Dapta manda otro evento de la misma llamada: se cambia la cita a las 17:00 y se reprocesa sin duplicar.
  await admin.query("update public.resultados_llamada set fecha_hora_cita = '2026-10-21 17:00' where call_id = $1", [`c-${s}`]);
  ok((await procesarBandeja(usuarioDe(B))) === 1, "El resultado actualizado no se reprocesó.");
  const citas2 = await db.select().from(eventos).where(and(eq(eventos.empresaId, B.id), eq(eventos.origenExterno, `cita:c-${s}`)));
  ok(citas2.length === 1 && citas2[0]!.inicio.toISOString() === "2026-10-21T22:00:00.000Z", "La cita no se actualizó (o se duplicó).");
  const llamadas2 = (await db.select().from(tareas).where(eq(tareas.empresaId, B.id))).filter((t) => t.origenExterno === `llamada:c-${s}`);
  ok(llamadas2.length === 1, "La llamada se duplicó al reprocesar.");

  const pendientes = await db.select().from(bandejaLeads).where(eq(bandejaLeads.empresaId, B.id));
  ok(pendientes.every((f) => f.procesadoEn && !f.error), "Quedaron filas de B sin procesar o con error.");

  // Un trigger que falla no rompe el guardado del lead en Machea.
  await admin.query("alter table crm.bandeja_leads rename to bandeja_leads_x");
  try {
    await consulta(tel(4), "Sofia", "amarilo");
    ok(true, "");
  } catch (e) {
    ok(false, `Con la bandeja rota, guardar_consulta falló: ${e instanceof Error ? e.message : e}`);
  } finally {
    await admin.query("alter table crm.bandeja_leads_x rename to bandeja_leads");
  }

  console.log(`${n} comprobaciones, ${fallos.length} fallos.`);
  for (const f of fallos) console.log(`  ✗ ${f}`);
  await admin.end();
  process.exit(fallos.length ? 1 : 0);
}

await main();
