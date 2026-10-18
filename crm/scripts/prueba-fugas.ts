/**
 * Prueba de fugas entre empresas (modo AUTH_MODO=machea, PostgreSQL real con el esquema `acceso`).
 *
 * 1. Siembra dos cuentas aprobadas de Machea (A y B) y una pendiente (C), con sesiones conocidas.
 * 2. Llena la empresa A con datos de ejemplo y registros marcados con "FUGA-A-…".
 * 3. Como B, recorre por HTTP todas las apps, pestañas, vistas, búsquedas y páginas especiales, y abre
 *    las fichas, informes, paneles y flujos de A. Nada de A puede aparecer, y las fichas dan 404.
 * 4. Como B, llama todas las server actions con ids de A. Las filas de A no pueden cambiar y ninguna
 *    fila de B puede apuntar a un id de A.
 * 5. Comprueba que toda tabla del esquema tenga empresaId (salvo las de autenticación y de usuario).
 *
 * Uso (con el CRM corriendo en CRM_URL con las mismas variables):
 *   DATABASE_URL=postgres://…/crm_prueba AUTH_MODO=machea MACHEA_URL=http://machea.prueba \
 *   CRM_URL=http://localhost:3123 pnpm exec tsx scripts/prueba-fugas.ts
 */
import { createHash, randomBytes } from "node:crypto";
import { getTableColumns, is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as esquema from "../src/db/esquema";
import { bd } from "../src/db/cliente";
import { conEmpresa, type Usuario } from "../src/db/contexto";
import { asegurarEmpresaMachea } from "../src/auth/machea";
import { apps } from "../src/crm/apps";
import { objetos } from "../src/crm/objetos";
import { cargarDatosEjemplo } from "../src/crm/servidor/datos-ejemplo";
import * as repo from "../src/crm/servidor/repositorio";
import * as acciones from "../src/crm/servidor/acciones";
import * as especiales from "../src/crm/servidor/especiales";
import * as sistema from "../src/crm/servidor/sistema";

const CRM_URL = (process.env.CRM_URL ?? "http://localhost:3123").replace(/\/+$/, "");
const BASE = process.env.CRM_BASE_PATH ?? "";
const fallos: string[] = [];
let comprobaciones = 0;

function comprobar(condicion: boolean, mensaje: string) {
  comprobaciones++;
  if (!condicion) fallos.push(mensaje);
}

const sufijo = randomBytes(3).toString("hex");
const MARCA = `FUGA-A-${sufijo}`;

// ---------------------------------------------------------------------------
// 1. Cuentas y sesiones de Machea
// ---------------------------------------------------------------------------

async function cuentaMachea(usuario: string, estado: string, tipo: string | null) {
  const db = await bd();
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const r = await db.execute<{ id: string }>(sql`
    insert into acceso.cuentas (usuario, correo, clave_hash, estado, tipo)
    values (${usuario}, ${`${usuario}@prueba.example`}, 'no-se-usa', ${estado}, ${tipo})
    returning id::text as id`);
  const id = r.rows[0]!.id;
  await db.execute(sql`
    insert into acceso.sesiones (hash, cuenta_id, expira) values (${hash}, ${id}::uuid, now() + interval '1 hour')`);
  return { id, usuario, correo: `${usuario}@prueba.example`, estado, token };
}

function usuarioDe(c: { id: string; usuario: string; correo: string }): Usuario {
  return { id: c.id, nombre: c.usuario, email: c.correo, rol: "admin", empresaId: c.id };
}

// ---------------------------------------------------------------------------
// Utilidades sobre la base
// ---------------------------------------------------------------------------

function tablas(): PgTable[] {
  return (Object.values(esquema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
}

function tablasConEmpresa(): { nombre: string; tabla: PgTable }[] {
  return tablas()
    .filter((t) => "empresaId" in getTableColumns(t))
    .map((t) => ({ nombre: getTableConfig(t).name, tabla: t }));
}

/** Huella de todas las filas de una empresa, para saber si algo cambió. */
async function huella(empresaId: string): Promise<Record<string, string>> {
  const db = await bd();
  const salida: Record<string, string> = {};
  for (const { nombre } of tablasConEmpresa()) {
    const r = await db.execute<{ h: string | null }>(
      sql.raw(
        `select md5(coalesce(string_agg(row_to_json(t)::text, '|' order by row_to_json(t)::text), '')) as h from crm."${nombre}" t where empresa_id = '${empresaId}'`,
      ),
    );
    salida[nombre] = r.rows[0]?.h ?? "";
  }
  return salida;
}

/** Todos los ids de las filas de una empresa (y su usuario). */
async function idsDe(empresaId: string): Promise<Set<string>> {
  const db = await bd();
  const ids = new Set<string>([empresaId]);
  for (const { nombre } of tablasConEmpresa()) {
    const columnas = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_schema = 'crm' and table_name = ${nombre} and column_name = 'id'`,
    );
    if (columnas.rows.length === 0) continue;
    const r = await db.execute<{ id: string }>(sql.raw(`select id::text as id from crm."${nombre}" where empresa_id = '${empresaId}'`));
    for (const f of r.rows) ids.add(f.id);
  }
  return ids;
}

/** Filas de B que mencionan algún id de A. */
async function referenciasCruzadas(empresaB: string, idsA: Set<string>): Promise<string[]> {
  const db = await bd();
  const encontradas: string[] = [];
  for (const { nombre } of tablasConEmpresa()) {
    const r = await db.execute<{ fila: string }>(sql.raw(`select row_to_json(t)::text as fila from crm."${nombre}" t where empresa_id = '${empresaB}'`));
    for (const { fila } of r.rows) {
      for (const id of idsA) if (fila.includes(id)) encontradas.push(`${nombre}: ${id}`);
    }
  }
  return encontradas;
}

async function primero(tabla: string, empresaId: string, donde = "true"): Promise<string> {
  const db = await bd();
  const r = await db.execute<{ id: string }>(
    sql.raw(`select id::text as id from crm."${tabla}" where empresa_id = '${empresaId}' and ${donde} order by id limit 1`),
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error(`No hay filas de ${tabla} para la empresa.`);
  return id;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function pedir(ruta: string, token?: string, init: RequestInit = {}) {
  const r = await fetch(`${CRM_URL}${BASE}${ruta}`, {
    redirect: "manual",
    ...init,
    headers: { ...(token ? { cookie: `machea_sesion=${token}` } : {}), ...(init.headers ?? {}) },
  });
  return { estado: r.status, ubicacion: r.headers.get("location"), cuerpo: await r.text() };
}

function rutasDeRecorrido(idsA: Record<string, string>): string[] {
  // La búsqueda repite el texto buscado en la página: se busca un trozo de la marca, no la marca entera.
  const rutas = new Set<string>(["/", "/configuracion", `/buscar?q=A-${sufijo}`, "/buscar?q=Andino"]);
  for (const app of apps) {
    rutas.add(`/${app.id}`);
    for (const p of app.pestanas) {
      if (p.tipo === "pagina") {
        rutas.add(`/${app.id}/p/${p.id}`);
        continue;
      }
      const def = objetos[p.id];
      rutas.add(`/${app.id}/o/${p.id}`);
      rutas.add(`/${app.id}/o/${p.id}?q=FUGA`);
      for (const v of def?.vistas ?? []) rutas.add(`/${app.id}/o/${p.id}?vista=${v.id}`);
    }
  }
  rutas.add("/marketing/o/campanas");
  rutas.add("/ventas/p/calendario?vista=mes&todos=1");
  rutas.add(`/servicio/p/textos-rapidos?filtro=todos&carpeta=${idsA.carpeta}`);
  rutas.add("/automatizacion/p/integraciones?conector=webhook");
  rutas.add(`/ventas/p/analisis?informe=${idsA.informe}`);
  rutas.add(`/ventas/p/analisis?editar=${idsA.informe}`);
  rutas.add(`/ventas/p/analisis?panel=${idsA.panel}`);
  rutas.add(`/ventas/p/analisis?editarPanel=${idsA.panel}`);
  rutas.add(`/automatizacion/p/flujo?id=${idsA.flujo}`);
  return [...rutas];
}

// ---------------------------------------------------------------------------
// Prueba
// ---------------------------------------------------------------------------

async function intentar(nombre: string, fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (e) {
    // revalidatePath no tiene contexto fuera de Next: si falla después de escribir, la huella lo detecta.
    return { error: e instanceof Error ? e.message : String(e), nombre };
  }
}

async function main() {
  const A = await cuentaMachea(`prueba-a-${sufijo}`, "aprobada", "constructora");
  const B = await cuentaMachea(`prueba-b-${sufijo}`, "aprobada", "inmobiliaria");
  const C = await cuentaMachea(`prueba-c-${sufijo}`, "pendiente", null);
  const usuarioA = usuarioDe(A);
  const usuarioB = usuarioDe(B);

  // 2. Empresa A con datos de ejemplo y marcas.
  await asegurarEmpresaMachea(A);
  await conEmpresa(
    A.id,
    async () => {
      await cargarDatosEjemplo(usuarioA.id);
      await repo.crear("cuentas", { nombre: `${MARCA} Cuenta` }, usuarioA.id);
      await repo.crear("candidatos", { apellidos: MARCA, compania: `${MARCA} SAS`, valoracion: "caliente", estado: "nuevo" }, usuarioA.id);
      await repo.crear("conexiones", { nombre: `${MARCA} Webhook`, conector: "webhook", url: "https://example.com/gancho" }, usuarioA.id);
      await repo.crear("carpetas-texto", { nombre: `${MARCA} Carpeta` }, usuarioA.id);
      await intentar("guardarInforme", () =>
        sistema.guardarInforme(null, { nombre: `${MARCA} Informe`, objeto: "candidatos", agregacion: "conteo", tipoGrafico: "barras", filtros: [] }),
      );
    },
    usuarioA,
  );

  const idsA = {
    candidato: await primero("candidatos", A.id, `apellidos = '${MARCA}'`),
    cuenta: await primero("cuentas", A.id),
    contacto: await primero("contactos", A.id),
    oportunidad: await primero("oportunidades", A.id),
    producto: await primero("productos", A.id),
    campana: await primero("campanas", A.id),
    miembro: await primero("miembros_campana", A.id),
    articulo: await primero("articulos", A.id),
    tarea: await primero("tareas", A.id),
    informe: await primero("informes", A.id, `nombre = '${MARCA} Informe'`),
    panel: await primero("paneles", A.id),
    flujo: await primero("flujos", A.id),
    carpeta: await primero("carpetas_texto", A.id, `nombre = '${MARCA} Carpeta'`),
  };
  const todosIdsA = await idsDe(A.id);
  const textosA = [MARCA, "Café Andino", "Textiles del Valle", A.usuario];

  // 3a. Sesión: sin cookie, cuenta pendiente y registro de Better Auth.
  const sinSesion = await pedir("/ventas/o/candidatos");
  comprobar(sinSesion.estado >= 300 && sinSesion.estado < 400 && (sinSesion.ubicacion ?? "").includes("/acceso/"), "Sin sesión no redirige a /acceso/ de Machea.");
  const pendiente = await pedir("/ventas/o/candidatos", C.token);
  comprobar(pendiente.estado >= 300 && pendiente.estado < 400 && (pendiente.ubicacion ?? "").includes("/acceso/"), "Una cuenta pendiente entra al CRM.");
  const registro = await pedir("/api/auth/sign-up/email", undefined, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x", email: `x-${sufijo}@prueba.example`, password: "clave-segura-123" }),
  });
  comprobar(registro.estado === 404, `El registro de Better Auth responde ${registro.estado} (debe ser 404).`);

  // 3b. Control: como A se ven sus marcas.
  const deA = await pedir(`/ventas/o/candidatos?q=${MARCA}`, A.token);
  comprobar(deA.estado === 200 && deA.cuerpo.includes(MARCA), "Como A no se ve su propio candidato: el recorrido no sirve.");

  // 3c. Como B no se ve nada de A.
  const idsEnRutas = new Set(Object.values(idsA));
  for (const ruta of rutasDeRecorrido(idsA)) {
    const r = await pedir(ruta, B.token);
    // Next repite la URL dentro de la página: si la ruta lleva un id de A, ese id no cuenta.
    const conIdDeA = [...idsEnRutas].some((id) => ruta.includes(id));
    if (r.estado >= 300 && r.estado < 400) {
      comprobar(!(r.ubicacion ?? "").includes("/acceso/"), `${ruta}: B, con sesión, es mandado al login.`);
    } else {
      comprobar(r.estado === 200 || (conIdDeA && r.estado === 404), `${ruta}: estado ${r.estado}.`);
    }
    for (const t of textosA) comprobar(!r.cuerpo.includes(t), `${ruta}: aparece «${t}» de la empresa A.`);
    for (const id of todosIdsA) {
      if (!(conIdDeA && ruta.includes(id)) && r.cuerpo.includes(id)) comprobar(false, `${ruta}: aparece el id ${id} de A.`);
    }
  }
  for (const [objeto, id] of [
    ["candidatos", idsA.candidato],
    ["cuentas", idsA.cuenta],
    ["contactos", idsA.contacto],
    ["oportunidades", idsA.oportunidad],
    ["productos", idsA.producto],
    ["campanas", idsA.campana],
    ["articulos", idsA.articulo],
    ["tareas", idsA.tarea],
    ["flujos", idsA.flujo],
  ] as const) {
    const app = apps.find((a) => a.pestanas.some((p) => p.tipo === "objeto" && p.id === objeto))?.id ?? "ventas";
    let r = await pedir(`/${app}/o/${objeto}/${id}`, B.token);
    // La ficha de un flujo manda siempre a su editor (/p/flujo?id=…), que es el que comprueba la empresa.
    if (objeto === "flujos" && r.estado >= 300 && r.estado < 400 && r.ubicacion?.includes(`/p/flujo?id=${id}`)) {
      r = await pedir(new URL(r.ubicacion, CRM_URL).pathname.replace(BASE, "") + new URL(r.ubicacion, CRM_URL).search, B.token);
    }
    comprobar(r.estado === 404, `La ficha ${objeto}/${id} de A responde ${r.estado} a B (debe ser 404).`);
  }

  // 4. Acciones de B con ids de A.
  const antes = await huella(A.id);
  const resultados: Record<string, unknown> = {};
  await conEmpresa(
    B.id,
    async () => {
      const candidatoB = await repo.crear("candidatos", { apellidos: "Propio", compania: "B SAS" }, usuarioB.id);
      const campanaB = await repo.crear("campanas", { nombre: "Campaña de B" }, usuarioB.id);
      const fd = (datos: Record<string, string>) => {
        const f = new FormData();
        for (const [k, v] of Object.entries(datos)) f.set(k, v);
        return f;
      };
      const r = resultados;
      r.guardarAjeno = await intentar("guardarRegistro", () => acciones.guardarRegistro("candidatos", idsA.candidato, fd({ apellidos: "X", compania: "X", estado: "nuevo" })));
      r.colgarDeAjeno = await intentar("guardarRegistro", () => acciones.guardarRegistro("contactos", null, fd({ apellidos: "Y", cuentaId: idsA.cuenta })));
      r.actualizarCampo = await intentar("actualizarCampo", () => acciones.actualizarCampo("candidatos", idsA.candidato, "estado", "contactado"));
      r.eliminar = await intentar("eliminarRegistros", () => acciones.eliminarRegistros("cuentas", [idsA.cuenta]));
      r.propietarioAjeno = await intentar("cambiarPropietario", () => acciones.cambiarPropietario("candidatos", [idsA.candidato], usuarioB.id));
      r.darseUsuarioAjeno = await intentar("cambiarPropietario", () => acciones.cambiarPropietario("candidatos", [candidatoB], usuarioA.id));
      r.buscarCuentas = await intentar("buscarOpciones", () => acciones.buscarOpciones("cuentas", ""));
      r.buscarUsuarios = await intentar("buscarOpciones", () => acciones.buscarOpciones("usuarios", ""));
      r.importar = await intentar("importarRegistros", () => acciones.importarRegistros("contactos", [{ apellidos: "Z", cuentaId: "Café Andino S.A.S." }]));
      r.importarId = await intentar("importarRegistros", () => acciones.importarRegistros("contactos", [{ apellidos: "Z2", cuentaId: idsA.cuenta }]));
      r.convertir = await intentar("convertirCandidato", () => especiales.convertirCandidato(idsA.candidato, fd({ crearOportunidad: "on" })));
      r.convertirConCuentaAjena = await intentar("convertirCandidato", () =>
        especiales.convertirCandidato(candidatoB, fd({ modoCuenta: "existente", cuentaId: idsA.cuenta })),
      );
      r.precio = await intentar("precioProducto", () => especiales.precioProducto(idsA.producto, idsA.oportunidad));
      r.factura = await intentar("generarFactura", () => especiales.generarFactura(idsA.oportunidad));
      r.aCampanaAjena = await intentar("agregarACampana", () => especiales.agregarACampana("candidatos", [candidatoB], idsA.campana));
      r.ajenosACampana = await intentar("agregarACampana", () => especiales.agregarACampana("candidatos", [idsA.candidato], campanaB));
      r.quitarMiembro = await intentar("quitarDeCampana", () => especiales.quitarDeCampana(idsA.miembro));
      r.correo = await intentar("enviarCorreoLista", () => especiales.enviarCorreoLista("contactos", [idsA.contacto], "Hola", "Texto"));
      r.articulos = await intentar("cambiarEstadoArticulos", () => especiales.cambiarEstadoArticulos([idsA.articulo], "archivar"));
      r.completar = await intentar("completarTarea", () => especiales.completarTarea(idsA.tarea, true));
      r.informe = await intentar("guardarInforme", () =>
        sistema.guardarInforme(idsA.informe, { nombre: "Cambiado", objeto: "candidatos", agregacion: "conteo", tipoGrafico: "barras", filtros: [] }),
      );
      r.favorito = await intentar("alternarFavorito", () => sistema.alternarFavorito("informe", idsA.informe, true));
      r.eliminarInforme = await intentar("eliminarInforme", () => sistema.eliminarInforme(idsA.informe));
      r.panel = await intentar("guardarPanel", () => sistema.guardarPanel(idsA.panel, "Cambiado", "", []));
      r.panelConInformeAjeno = await intentar("guardarPanel", () => sistema.guardarPanel(null, "Panel B", "", [idsA.informe]));
      r.eliminarPanel = await intentar("eliminarPanel", () => sistema.eliminarPanel(idsA.panel));
      r.flujo = await intentar("guardarFlujo", () =>
        sistema.guardarFlujo(idsA.flujo, {
          nombre: "Cambiado",
          objeto: "candidatos",
          disparador: "crear",
          activo: false,
          condiciones: [],
          acciones: [{ tipo: "notificar", titulo: "x" }],
        }),
      );
      r.marketing = await intentar("activarMarketing", () => sistema.activarMarketing(true));
      // Un candidato caliente en B dispara solo los flujos de B (B no tiene).
      await repo.crear("candidatos", { apellidos: "Caliente", compania: "B", valoracion: "caliente" }, usuarioB.id);
    },
    usuarioB,
  );
  const despues = await huella(A.id);
  for (const tabla of Object.keys(antes)) comprobar(antes[tabla] === despues[tabla], `Las acciones de B cambiaron filas de A en crm.${tabla}.`);
  const cruzadas = await referenciasCruzadas(B.id, todosIdsA);
  comprobar(cruzadas.length === 0, `Filas de B que apuntan a A: ${cruzadas.slice(0, 10).join(", ")}`);
  const opciones = [resultados.buscarCuentas, resultados.buscarUsuarios].flatMap((r) => (Array.isArray(r) ? r : []));
  comprobar(opciones.every((o: { id: string }) => !todosIdsA.has(o.id) && o.id !== A.id), "buscarOpciones devuelve registros o usuarios de A.");
  const precio = resultados.precio;
  comprobar(precio === null || (typeof precio === "object" && precio !== null && "error" in precio), `precioProducto devuelve el precio de A: ${String(precio)}.`);

  // 5. Toda tabla lleva empresaId, salvo las de autenticación y las de un usuario.
  const sinEmpresa = new Set(["usuarios", "sesiones", "cuentas_auth", "verificaciones", "empresas", "notificaciones", "vistos_recientemente", "preferencias_usuario"]);
  for (const t of tablas()) {
    const nombre = getTableConfig(t).name;
    comprobar(sinEmpresa.has(nombre) || "empresaId" in getTableColumns(t), `crm.${nombre} no tiene empresaId.`);
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos.length} fallos.`);
  for (const f of fallos) console.log(`  ✗ ${f}`);
  if (process.env.PRUEBA_DETALLE) console.log(JSON.stringify(resultados, null, 2));
  process.exit(fallos.length ? 1 : 0);
}

await main();
