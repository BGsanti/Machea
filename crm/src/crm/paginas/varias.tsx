import Link from "next/link";
import type { Usuario } from "@/auth/sesion";
import { Insignia, Tarjeta } from "@/ui/basicos";
import { clasesBoton } from "@/ui/boton";
import { Icono, IconoObjeto } from "@/ui/icono";
import { formatoFechaHora, formatoNumero } from "../formato";
import { obtenerObjeto } from "../objetos";
import { conectores } from "../opciones";
import { contarRegistros, ejecucionesRecientes, listaUsuarios, obtenerConfiguracion } from "../servidor/consultas";
import { catalogoAcciones } from "../servidor/flujos";
import { listar } from "../servidor/repositorio";
import { BotonActivarMarketing, BotonNuevaConexion, FiltroAcciones } from "./varias-cliente";

// ---------------------------------------------------------------------------
// Marketing
// ---------------------------------------------------------------------------

export async function PaginaMarketing({ usuario, app }: { usuario: Usuario; app: string }) {
  const config = await obtenerConfiguracion();
  const funciones = [
    { titulo: "Campañas", texto: "Organice sus acciones de marketing, agregue contactos y leads como miembros y mida los resultados.", icono: "Megaphone" },
    { titulo: "Correos de lista", texto: "Escriba un mensaje y regístrelo para una lista de contactos o leads, con campos de combinación.", icono: "Mails" },
    { titulo: "Construcción de audiencia", texto: "Use vistas de lista y filtros para elegir exactamente a quién dirigirse.", icono: "Users" },
    { titulo: "Análisis preconstruidos", texto: "Mida leads por origen y oportunidades por campaña desde Análisis.", icono: "ChartPie" },
  ];
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-8 py-10">
          <h1 className="max-w-2xl text-2xl font-semibold text-slate-800">Active potentes herramientas de marketing e impulse sus ventas</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Acelere la generación de candidatos con campañas y use los análisis para perfeccionar su estrategia. Estas herramientas no tienen coste adicional: solo hay que activarlas.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {config.marketingActivado ? (
              <>
                <Insignia color="bg-emerald-100 text-emerald-800">Marketing activado</Insignia>
                <Link href={`/${app}/o/campanas`} className={clasesBoton("primario")}>
                  Ir a Campañas
                </Link>
              </>
            ) : null}
            {usuario.rol === "admin" ? (
              <BotonActivarMarketing activado={config.marketingActivado} />
            ) : config.marketingActivado ? null : (
              <p className="text-sm text-slate-500">Pida a un administrador que active las herramientas de marketing.</p>
            )}
          </div>
        </div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800">Envíe correos a sus listas con facilidad</h2>
            <p className="mt-1 text-sm text-slate-600">
              Su equipo ya puede escribir{" "}
              <Link href={`/${app}/o/correos-lista`} className="text-marca-700 hover:underline">
                correos de lista
              </Link>{" "}
              para candidatos y contactos: selecciónelos en su lista y pulse «Enviar correo electrónico».
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800">Convierta sus motores de crecimiento</h2>
            <p className="mt-1 text-sm text-slate-600">Al activar marketing aparece la pestaña Campañas en esta app y la acción «Agregar a campaña» en contactos y candidatos.</p>
          </div>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {funciones.map((f) => (
          <div key={f.titulo} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
              <Icono nombre={f.icono} className="size-5" />
            </span>
            <h3 className="mt-3 font-semibold text-slate-800">{f.titulo}</h3>
            <p className="mt-1 text-sm text-slate-600">{f.texto}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Su cuenta
// ---------------------------------------------------------------------------

export async function PaginaSuCuenta({ usuario }: { usuario: Usuario }) {
  const [config, usuarios, registros] = await Promise.all([obtenerConfiguracion(), listaUsuarios(), contarRegistros()]);
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Tarjeta titulo="Plan" icono={<Icono nombre="CreditCard" className="size-4 text-slate-500" />} className="lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold text-slate-800">Machea · Panel de leads</p>
            <p className="text-sm text-slate-600">Incluido con su cuenta de Machea.</p>
          </div>
          <Insignia color="bg-emerald-100 text-emerald-800">Activo</Insignia>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">Empresa</dt>
            <dd className="text-sm font-medium text-slate-800">{config.nombreEmpresa}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">Usuarios activos</dt>
            <dd className="text-sm font-medium text-slate-800">{usuarios.length}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-4">
            <dt className="text-xs text-slate-500">Moneda</dt>
            <dd className="text-sm font-medium text-slate-800">{config.moneda}</dd>
          </div>
        </dl>
        {usuario.rol === "admin" ? (
          <Link href="/configuracion" className={clasesBoton("secundario", "md", "mt-5")}>
            <Icono nombre="Settings" /> Gestionar empresa y usuarios
          </Link>
        ) : null}
      </Tarjeta>
      <Tarjeta titulo="Uso de datos" icono={<Icono nombre="ChartNoAxesCombined" className="size-4 text-slate-500" />}>
        <ul className="space-y-2">
          {registros.map((r) => {
            const d = obtenerObjeto(r.objeto);
            return (
              <li key={r.objeto} className="flex items-center gap-2 text-sm">
                {d ? <IconoObjeto icono={d.icono} color={d.color} tamano="sm" /> : null}
                <span className="flex-1 text-slate-700">{d?.etiquetaPlural}</span>
                <span className="font-medium text-slate-800">{formatoNumero(r.total)}</span>
              </li>
            );
          })}
        </ul>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automatización
// ---------------------------------------------------------------------------

const destacados = ["hubspot", "quickbooks", "jira", "zendesk", "google_sheets"];

export async function PaginaAutomatizacion({ usuario, app }: { usuario: Usuario; app: string }) {
  const [flujos, ejecuciones] = await Promise.all([listar("flujos", { usuarioId: usuario.id, vista: "todos", porPagina: 5 }), ejecucionesRecientes(5)]);
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-indigo-50 to-sky-50 px-8 py-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-800">Acelere su productividad con automatizaciones e integraciones</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Cree flujos que reaccionan cuando se crean o cambian registros: crean tareas, actualizan campos, avisan al responsable o envían los datos a otras aplicaciones mediante webhooks.
        </p>
        <div className="mt-5 flex gap-2">
          <Link href={`/${app}/p/flujo`} className={clasesBoton("primario")}>
            <Icono nombre="Plus" /> Nuevo flujo
          </Link>
          <Link href={`/${app}/p/integraciones`} className={clasesBoton("secundario")}>
            <Icono nombre="Plug" /> Ver integraciones
          </Link>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Integraciones principales</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {conectores
            .filter((c) => destacados.includes(c.valor))
            .map((c) => (
              <Link key={c.valor} href={`/${app}/p/integraciones?conector=${c.valor}`} className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 p-4 text-sm text-slate-700 hover:border-marca-600">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-base font-bold text-slate-600">{c.etiqueta[0]}</span>
                {c.etiqueta}
              </Link>
            ))}
        </div>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Flujos recientes" icono={<IconoObjeto icono="Workflow" color="bg-indigo-600" tamano="sm" />} sinRelleno>
          {flujos.filas.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Aún no hay flujos.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {flujos.filas.map((f) => (
                <li key={f.id} className="flex items-center justify-between px-4 py-2.5">
                  <Link href={`/${app}/p/flujo?id=${f.id}`} className="text-sm text-marca-700 hover:underline">
                    {String(f.nombre)}
                  </Link>
                  <Insignia color={f.activo ? "bg-emerald-100 text-emerald-800" : undefined}>{f.activo ? "Activo" : "Inactivo"}</Insignia>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Últimas ejecuciones" icono={<Icono nombre="Clock" className="size-4 text-slate-500" />} sinRelleno>
          {ejecuciones.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Todavía no se ha ejecutado ningún flujo.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {ejecuciones.map((e) => (
                <li key={e.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-800">{e.nombreFlujo}</span>
                    <Insignia color={e.estado === "error" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}>{e.estado === "error" ? "Error" : "Completada"}</Insignia>
                  </div>
                  <p className="text-xs text-slate-500">{formatoFechaHora(e.creadoEn)}</p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}

export async function PaginaIntegraciones({
  usuario,
  app,
  parametros,
}: {
  usuario: Usuario;
  app: string;
  parametros: Record<string, string | string[] | undefined>;
}) {
  const conexiones = await listar("conexiones", { usuarioId: usuario.id, vista: "todos", porPagina: 100 });
  const def = obtenerObjeto("conexiones")!;
  const conector = typeof parametros.conector === "string" ? parametros.conector : null;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Empezar a trabajar con conectores</h2>
        <p className="mt-1 text-sm text-slate-600">
          El conector <strong>Webhook</strong> funciona ya: los flujos envían el registro en JSON a la URL que indique. Los demás conectores quedan registrados para documentar la integración; necesitan desarrollo a medida para sincronizar datos.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {conectores.map((c) => (
            <div key={c.valor} className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-center text-sm ${conector === c.valor ? "border-marca-600 bg-marca-50" : "border-slate-200"}`}>
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-slate-100 text-base font-bold text-slate-600">{c.etiqueta[0]}</span>
              <span className="text-slate-700">{c.etiqueta}</span>
              {c.valor === "webhook" ? <Insignia color="bg-emerald-100 text-emerald-800">Disponible</Insignia> : <Insignia>Solo registro</Insignia>}
              <BotonNuevaConexion app={app} conector={c.valor} etiqueta={c.etiqueta} />
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <p className="text-xs text-slate-500">Automatización</p>
            <h2 className="text-base font-semibold text-slate-800">Todas las conexiones ({conexiones.total})</h2>
          </div>
          <BotonNuevaConexion app={app} conector="webhook" etiqueta="Nueva conexión" principal />
        </header>
        {conexiones.filas.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No hay conexiones. Cree una para usarla en sus flujos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Conector</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">URL</th>
              </tr>
            </thead>
            <tbody>
              {conexiones.filas.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link href={`/${app}/o/conexiones/${c.id}`} className="font-medium text-marca-700 hover:underline">
                      {String(c.nombre)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{conectores.find((x) => x.valor === c.conector)?.etiqueta}</td>
                  <td className="px-4 py-2">
                    {(() => {
                      const op = def.campos.find((f) => f.nombre === "estado")?.opciones?.find((o) => o.valor === c.estado);
                      return <Insignia color={op?.color}>{op?.etiqueta ?? String(c.estado)}</Insignia>;
                    })()}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-slate-500">{c.url ? String(c.url) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export async function PaginaSupervisar() {
  const ejecuciones = await ejecucionesRecientes(200);
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <p className="text-xs text-slate-500">Supervisar</p>
        <h1 className="text-xl font-semibold text-slate-800">Ejecuciones de flujos</h1>
        <p className="text-xs text-slate-500">{ejecuciones.length} elementos · Ordenado por fecha, más recientes primero</p>
      </header>
      {ejecuciones.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-slate-500">No hay elementos para mostrar. Cuando un flujo activo se ejecute, aparecerá aquí.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-600">
              <tr>
                <th className="px-4 py-2">Flujo</th>
                <th className="px-4 py-2">Objeto</th>
                <th className="px-4 py-2">Registro</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Detalle</th>
                <th className="px-4 py-2 text-right">Duración</th>
                <th className="px-4 py-2">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {ejecuciones.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2 font-medium text-slate-800">{e.nombreFlujo}</td>
                  <td className="px-4 py-2 text-slate-600">{obtenerObjeto(e.objeto)?.etiquetaPlural ?? e.objeto}</td>
                  <td className="px-4 py-2">
                    {e.registroId ? (
                      <Link href={`/automatizacion/o/${e.objeto}/${e.registroId}`} className="text-marca-700 hover:underline">
                        Abrir
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <Insignia color={e.estado === "error" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}>{e.estado === "error" ? "Error" : "Completada"}</Insignia>
                  </td>
                  <td className="max-w-md px-4 py-2 text-xs text-slate-600">{e.detalle}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{e.duracionMs ?? 0} ms</td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500">{formatoFechaHora(e.creadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PaginaCentroAccion() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h1 className="text-xl font-semibold text-slate-800">Centro de acción</h1>
        <p className="mt-1 text-sm text-slate-600">Estas son las acciones que pueden ejecutar sus flujos. Se usan desde el editor de flujos.</p>
      </header>
      <FiltroAcciones acciones={catalogoAcciones.map((a) => ({ ...a }))} />
    </section>
  );
}
