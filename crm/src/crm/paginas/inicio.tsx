import Link from "next/link";
import { and, count, eq, gte, lt, ne, notInArray, sql, sum } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { candidatos, casos, eventos, oportunidades, tareas } from "@/db/esquema";
import type { Usuario } from "@/auth/sesion";
import { Tarjeta } from "@/ui/basicos";
import { Icono, IconoObjeto } from "@/ui/icono";
import { appDeObjeto } from "../apps";
import { fechaLocal, inicioMes } from "../fechas";
import { formatoFechaHora, formatoMoneda } from "../formato";
import { obtenerObjeto } from "../objetos";
import { etapasCerradas } from "../opciones";
import { ejecutarInforme, listaInformes, obtenerConfiguracion, obtenerPreferencias } from "../servidor/consultas";
import { recientes } from "../servidor/repositorio";
import { Bienvenida, TarjetaInformes, type InformeWidget, type Sugerencia } from "./inicio-cliente";

export async function PaginaInicio({ usuario, app }: { usuario: Usuario; app: string }) {
  const [prefs, config, vistos, todos] = await Promise.all([
    obtenerPreferencias(usuario.id),
    obtenerConfiguracion(),
    recientes(usuario.id, 8),
    listaInformes(),
  ]);

  const sugerencias: Sugerencia[] = [
    { id: "contacto", titulo: "Crear su primer contacto", texto: "Hacer crecer sus ventas empieza con los contactos. Le mostramos cómo.", href: "/contactos/o/contactos?nuevo=1", icono: "Contact" },
    { id: "candidato", titulo: "Crear su primer candidato", texto: "Vea lo fácil que es convertir candidatos en contactos, cuentas y oportunidades.", href: "/ventas/o/candidatos?nuevo=1", icono: "UserPlus" },
    { id: "marketing", titulo: "Activar las funciones de marketing", texto: "Lleve sus mensajes a nuevas audiencias con campañas y correos de lista.", href: "/marketing/p/marketing", icono: "Megaphone" },
    ...(usuario.rol === "admin"
      ? [{ id: "ejemplos", titulo: "Probar con datos de ejemplo", texto: "Cargue cuentas, contactos y oportunidades de demostración para explorar el CRM.", href: "/configuracion", icono: "Sparkles" }]
      : []),
  ].filter((s) => !prefs.sugerenciasOcultas.includes(s.id));

  const widgets = async (objeto: string): Promise<InformeWidget[]> =>
    Promise.all(
      todos
        .filter((i) => i.objeto === objeto)
        .slice(0, 6)
        .map(async (i) => ({ id: i.id, nombre: i.nombre, tipoGrafico: i.tipoGrafico, resultado: await ejecutarInforme(i, usuario.id) })),
    );
  const [deCandidatos, deOportunidades, deContactos, deCasos] = await Promise.all([
    widgets("candidatos"),
    widgets("oportunidades"),
    widgets("contactos"),
    widgets("casos"),
  ]);

  return (
    <div className="space-y-4">
      <Bienvenida nombre={usuario.nombre} sugerencias={sugerencias} ocultas={prefs.sugerenciasOcultas.length} />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="grid gap-4 md:grid-cols-2 xl:col-span-2">
          <TarjetaInformes objeto="candidatos" informes={deCandidatos} moneda={config.moneda} app={app} />
          <TarjetaInformes objeto="oportunidades" informes={deOportunidades} moneda={config.moneda} app={app} />
          <TarjetaInformes objeto="contactos" informes={deContactos} moneda={config.moneda} app={app} />
          <TarjetaInformes objeto="casos" informes={deCasos} moneda={config.moneda} app={app} />
        </div>
        <div className="space-y-4">
          <Tarjeta titulo="Registros recientes" icono={<Icono nombre="Clock" className="size-4 text-slate-500" />} sinRelleno>
            {vistos.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">Los registros que abra aparecerán aquí.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {vistos.map((v) => {
                  const d = obtenerObjeto(v.objeto);
                  return (
                    <li key={`${v.objeto}-${v.id}`}>
                      <Link href={`/${appDeObjeto(v.objeto)}/o/${v.objeto}/${v.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                        {d ? <IconoObjeto icono={d.icono} color={d.color} tamano="sm" /> : null}
                        <span className="min-w-0 flex-1 truncate text-sm text-marca-700">{v.nombre}</span>
                        <span className="text-xs text-slate-400">{d?.etiqueta}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
          <Tarjeta titulo="Hágala su página de inicio" icono={<Icono nombre="Lightbulb" className="size-4 text-amber-500" />}>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>Cambie el informe de cada tarjeta con su selector.</li>
              <li>
                Cree sus propios informes en{" "}
                <Link href="/ventas/p/analisis" className="text-marca-700 hover:underline">
                  Análisis
                </Link>
                : aparecerán aquí automáticamente.
              </li>
              <li>Ordene las pestañas de cada app con el lápiz de la barra de navegación.</li>
            </ul>
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}

export async function PaginaInformacionGeneral({ usuario, app }: { usuario: Usuario; app: string }) {
  const db = await bd();
  const config = await obtenerConfiguracion();
  const hoy = new Date();
  const primeroMes = inicioMes();
  const finSemana = new Date(hoy.getTime() + 7 * 864e5);

  const [[pipeline], [ganado], [abiertos], [casosAbiertos], [paraHoy], proximos, mejores] = await Promise.all([
    db.select({ total: sum(oportunidades.importe), n: count() }).from(oportunidades).where(notInArray(oportunidades.etapa, etapasCerradas)),
    db
      .select({ total: sum(oportunidades.importe), n: count() })
      .from(oportunidades)
      .where(and(eq(oportunidades.etapa, "cerrada_ganada"), gte(oportunidades.fechaCierre, primeroMes))),
    db.select({ n: count() }).from(candidatos).where(eq(candidatos.convertido, false)),
    db.select({ n: count() }).from(casos).where(ne(casos.estado, "cerrado")),
    db
      .select({ n: count() })
      .from(tareas)
      .where(and(eq(tareas.propietarioId, usuario.id), ne(tareas.estado, "completada"), sql`${tareas.fechaVencimiento} <= ${fechaLocal()}::date`)),
    db
      .select()
      .from(eventos)
      .where(and(eq(eventos.propietarioId, usuario.id), gte(eventos.fin, hoy), lt(eventos.inicio, finSemana)))
      .orderBy(eventos.inicio)
      .limit(6),
    db
      .select()
      .from(oportunidades)
      .where(notInArray(oportunidades.etapa, etapasCerradas))
      .orderBy(sql`${oportunidades.importe} desc nulls last`)
      .limit(6),
  ]);

  const kpis = [
    { etiqueta: "Pipeline abierto", valor: formatoMoneda(Number(pipeline?.total ?? 0), config.moneda), detalle: `${pipeline?.n ?? 0} oportunidades`, icono: "Crown", href: "/ventas/o/oportunidades?vista=abiertas" },
    { etiqueta: "Ganado este mes", valor: formatoMoneda(Number(ganado?.total ?? 0), config.moneda), detalle: `${ganado?.n ?? 0} cerradas`, icono: "CircleCheck", href: "/ventas/o/oportunidades?vista=ganadas" },
    { etiqueta: "Candidatos abiertos", valor: String(abiertos?.n ?? 0), detalle: "sin convertir", icono: "UserPlus", href: "/ventas/o/candidatos" },
    { etiqueta: "Casos abiertos", valor: String(casosAbiertos?.n ?? 0), detalle: "por resolver", icono: "Briefcase", href: "/servicio/o/casos" },
    { etiqueta: "Mis tareas para hoy", valor: String(paraHoy?.n ?? 0), detalle: "incluye vencidas", icono: "ListChecks", href: "/ventas/o/tareas?vista=vencidas" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => (
          <Link key={k.etiqueta} href={k.href} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-marca-600">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">{k.etiqueta}</span>
              <Icono nombre={k.icono} className="size-4" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-800">{k.valor}</p>
            <p className="text-xs text-slate-500">{k.detalle}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Mis próximos eventos (7 días)" icono={<IconoObjeto icono="CalendarDays" color="bg-pink-500" tamano="sm" />} sinRelleno>
          {proximos.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No tiene eventos esta semana.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {proximos.map((e) => (
                <li key={e.id} className="flex items-center justify-between px-4 py-2.5">
                  <Link href={`/${app}/o/eventos/${e.id}`} className="text-sm text-marca-700 hover:underline">
                    {e.asunto}
                  </Link>
                  <span className="text-xs text-slate-500">{formatoFechaHora(e.inicio)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
        <Tarjeta titulo="Oportunidades abiertas más grandes" icono={<IconoObjeto icono="Crown" color="bg-amber-500" tamano="sm" />} sinRelleno>
          {mejores.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">No hay oportunidades abiertas.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {mejores.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link href={`/ventas/o/oportunidades/${o.id}`} className="truncate text-sm text-marca-700 hover:underline">
                    {o.nombre}
                  </Link>
                  <span className="shrink-0 text-sm font-medium text-slate-700">{formatoMoneda(o.importe, config.moneda)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
