import Link from "next/link";
import { and, count, desc, eq, gte, lt, ne, notInArray, sql, sum } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { candidatos, casos, eventos, oportunidades, tareas } from "@/db/esquema";
import type { Usuario } from "@/auth/sesion";
import { Insignia, Tarjeta } from "@/ui/basicos";
import { EnlaceBoton } from "@/ui/boton";
import { Icono, IconoObjeto } from "@/ui/icono";
import { appDeObjeto, enlaceRegistro } from "../apps";
import { fechaLocal, inicioMes, ZONA_HORARIA } from "../fechas";
import { formatoFecha, formatoFechaHora, formatoMoneda } from "../formato";
import { obtenerObjeto } from "../objetos";
import { etapasCerradas } from "../opciones";
import { ejecutarInforme, listaInformes, obtenerConfiguracion, obtenerPreferencias } from "../servidor/consultas";
import { recientes } from "../servidor/repositorio";
import { Bienvenida, TarjetaInformes, type InformeWidget, type Sugerencia } from "./inicio-cliente";

export async function PaginaInicio({ usuario, app }: { usuario: Usuario; app: string }) {
  const db = await bd();
  const empresaId = await empresaActual();
  const ahora = new Date();
  const hace7 = new Date(ahora.getTime() - 7 * 864e5);
  const en7 = new Date(ahora.getTime() + 7 * 864e5);

  const [prefs, config, vistos, todos] = await Promise.all([
    obtenerPreferencias(usuario.id),
    obtenerConfiguracion(),
    recientes(usuario.id, 8),
    listaInformes(),
  ]);

  const [[abiertos], [nuevos], [pipeline], tareasHoy, calientes, citas] = await Promise.all([
    db.select({ n: count() }).from(candidatos).where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.convertido, false))),
    db.select({ n: count() }).from(candidatos).where(and(eq(candidatos.empresaId, empresaId), gte(candidatos.creadoEn, hace7))),
    db
      .select({ total: sum(oportunidades.importe), n: count() })
      .from(oportunidades)
      .where(and(eq(oportunidades.empresaId, empresaId), notInArray(oportunidades.etapa, etapasCerradas))),
    db
      .select({ id: tareas.id, asunto: tareas.asunto, fechaVencimiento: tareas.fechaVencimiento, prioridad: tareas.prioridad })
      .from(tareas)
      .where(
        and(
          eq(tareas.empresaId, empresaId),
          eq(tareas.propietarioId, usuario.id),
          ne(tareas.estado, "completada"),
          sql`${tareas.fechaVencimiento} <= ${fechaLocal()}::date`,
        ),
      )
      .orderBy(tareas.fechaVencimiento)
      .limit(50),
    db
      .select({ id: candidatos.id, nombre: candidatos.nombre, apellidos: candidatos.apellidos, compania: candidatos.compania, telefono: candidatos.telefono })
      .from(candidatos)
      .where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.convertido, false), eq(candidatos.valoracion, "caliente")))
      .orderBy(desc(candidatos.creadoEn))
      .limit(5),
    db
      .select({ id: eventos.id, asunto: eventos.asunto, inicio: eventos.inicio })
      .from(eventos)
      .where(and(eq(eventos.empresaId, empresaId), eq(eventos.propietarioId, usuario.id), gte(eventos.fin, ahora), lt(eventos.inicio, en7)))
      .orderBy(eventos.inicio)
      .limit(5),
  ]);

  const sugerencias: Sugerencia[] = [
    { id: "contacto", titulo: "Crear su primer contacto", texto: "Hacer crecer sus ventas empieza con los contactos. Le mostramos cómo.", href: "/contactos/o/contactos?nuevo=1", icono: "Contact" },
    { id: "candidato", titulo: "Crear su primer lead", texto: "Vea lo fácil que es convertir leads en contactos, cuentas y oportunidades.", href: "/ventas/o/candidatos?nuevo=1", icono: "UserPlus" },
    { id: "marketing", titulo: "Activar las funciones de marketing", texto: "Lleve sus mensajes a nuevas audiencias con campañas y correos de lista.", href: "/marketing/p/marketing", icono: "Megaphone" },
    ...(usuario.rol === "admin"
      ? [{ id: "ejemplos", titulo: "Probar con datos de ejemplo", texto: "Cargue cuentas, contactos y oportunidades de demostración para explorar el panel.", href: "/configuracion", icono: "Sparkles" }]
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

  const hora = Number(new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_HORARIA, hour: "numeric", hourCycle: "h23" }).format(ahora));
  const saludo = hora < 5 ? "Buenas noches" : hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const hoy = fechaLocal();
  const nombreCompleto = (c: { nombre: string | null; apellidos: string }) => [c.nombre, c.apellidos].filter(Boolean).join(" ");

  const kpis = [
    { etiqueta: "Leads abiertos", valor: String(abiertos?.n ?? 0), detalle: "sin convertir", icono: "UserPlus", href: "/ventas/o/candidatos" },
    { etiqueta: "Leads nuevos", valor: String(nuevos?.n ?? 0), detalle: "en los últimos 7 días", icono: "Sparkles", href: "/ventas/o/candidatos" },
    { etiqueta: "Mis citas", valor: String(citas.length), detalle: "en los próximos 7 días", icono: "CalendarDays", href: "/ventas/p/calendario" },
    { etiqueta: "Mis tareas para hoy", valor: String(tareasHoy.length), detalle: "incluye vencidas", icono: "ListChecks", href: "/ventas/o/tareas?vista=vencidas" },
    { etiqueta: "Negocios abiertos", valor: formatoMoneda(Number(pipeline?.total ?? 0), config.moneda), detalle: `${pipeline?.n ?? 0} oportunidades`, icono: "Crown", href: "/ventas/o/oportunidades" },
  ];
  const hayPendientes = tareasHoy.length > 0 || calientes.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">
            {saludo}, {usuario.nombre.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">Esto es lo que pasa hoy en {config.nombreEmpresa}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <EnlaceBoton href="/ventas/o/candidatos?nuevo=1" variante="primario" icono="UserPlus">
            Nuevo lead
          </EnlaceBoton>
          <EnlaceBoton href="/ventas/o/candidatos?importar=1" icono="Upload">
            Importar leads
          </EnlaceBoton>
          <EnlaceBoton href="/contactos/o/contactos?nuevo=1" icono="Contact">
            Nuevo contacto
          </EnlaceBoton>
          <EnlaceBoton href="/ventas/p/calendario" icono="CalendarDays">
            Ver citas
          </EnlaceBoton>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k, i) => (
          <Link
            key={k.etiqueta}
            href={k.href}
            className={`group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-marca-500 ${i === kpis.length - 1 ? "sm:max-xl:col-span-2" : ""}`}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">{k.etiqueta}</span>
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-marca-50 group-hover:text-marca-700">
                <Icono nombre={k.icono} className="size-4" />
              </span>
            </div>
            <p className="mt-2 truncate text-2xl font-semibold text-slate-800">{k.valor}</p>
            <p className="text-xs text-slate-500">{k.detalle}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Tarjeta titulo="Para hacer hoy" icono={<Icono nombre="ListChecks" className="size-4 text-marca-700" />} className="xl:col-span-2" sinRelleno>
          {hayPendientes ? (
            <ul className="divide-y divide-slate-100">
              {calientes.map((c) => (
                <li key={c.id}>
                  <Link href={enlaceRegistro("candidatos", c.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-marca-50 text-marca-700">
                      <Icono nombre="PhoneCall" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">Contactar a {nombreCompleto(c)}</span>
                      <span className="block truncate text-xs text-slate-500">{[c.compania, c.telefono].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Insignia color="bg-rose-100 text-rose-700">Lead caliente</Insignia>
                  </Link>
                </li>
              ))}
              {tareasHoy.slice(0, 6).map((t) => {
                const vencida = t.fechaVencimiento !== null && t.fechaVencimiento < hoy;
                return (
                  <li key={t.id}>
                    <Link href={enlaceRegistro("tareas", t.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                        <Icono nombre="ListChecks" className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{t.asunto}</span>
                        <span className={`block text-xs ${vencida ? "font-medium text-rose-600" : "text-slate-500"}`}>
                          {vencida ? "Vencida · " : "Para hoy · "}
                          {t.fechaVencimiento ? formatoFecha(t.fechaVencimiento) : ""}
                        </span>
                      </span>
                      {t.prioridad === "alta" ? <Insignia color="bg-rose-100 text-rose-700">Alta</Insignia> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Icono nombre="CircleCheck" className="size-6" />
              </span>
              <p className="mt-3 text-sm font-medium text-slate-800">Todo al día</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">No tiene tareas para hoy ni leads calientes sin atender. Cuando entre uno nuevo, aparecerá aquí.</p>
            </div>
          )}
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta
            titulo="Próximas citas"
            icono={<Icono nombre="CalendarDays" className="size-4 text-marca-700" />}
            acciones={
              <Link href="/ventas/p/calendario" className="text-xs text-marca-700 hover:underline">
                Ver calendario
              </Link>
            }
            sinRelleno
          >
            {citas.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No tiene citas en los próximos 7 días.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {citas.map((e) => (
                  <li key={e.id}>
                    <Link href={enlaceRegistro("eventos", e.id)} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0 truncate text-sm text-slate-800">{e.asunto}</span>
                      <span className="shrink-0 text-xs text-slate-500">{formatoFechaHora(e.inicio)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="Actividad reciente" icono={<Icono nombre="Clock" className="size-4 text-marca-700" />} sinRelleno>
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
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{v.nombre}</span>
                        <span className="text-xs text-slate-400">{d?.etiqueta}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>

      {sugerencias.length > 0 || prefs.sugerenciasOcultas.length > 0 ? (
        <Bienvenida sugerencias={sugerencias} ocultas={prefs.sugerenciasOcultas.length} />
      ) : null}

      <section aria-label="Informes" className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">Sus informes</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <TarjetaInformes objeto="candidatos" informes={deCandidatos} moneda={config.moneda} app={app} />
          <TarjetaInformes objeto="oportunidades" informes={deOportunidades} moneda={config.moneda} app={app} />
          <TarjetaInformes objeto="contactos" informes={deContactos} moneda={config.moneda} app={app} />
          <TarjetaInformes objeto="casos" informes={deCasos} moneda={config.moneda} app={app} />
        </div>
        <p className="text-sm text-slate-500">
          Cree sus propios informes en{" "}
          <Link href="/ventas/p/analisis" className="text-marca-700 hover:underline">
            Análisis
          </Link>
          : aparecerán aquí automáticamente.
        </p>
      </section>
    </div>
  );
}

export async function PaginaInformacionGeneral({ usuario, app }: { usuario: Usuario; app: string }) {
  const db = await bd();
  const empresaId = await empresaActual();
  const config = await obtenerConfiguracion();
  const hoy = new Date();
  const primeroMes = inicioMes();
  const finSemana = new Date(hoy.getTime() + 7 * 864e5);

  const [[pipeline], [ganado], [abiertos], [casosAbiertos], [paraHoy], proximos, mejores] = await Promise.all([
    db
      .select({ total: sum(oportunidades.importe), n: count() })
      .from(oportunidades)
      .where(and(eq(oportunidades.empresaId, empresaId), notInArray(oportunidades.etapa, etapasCerradas))),
    db
      .select({ total: sum(oportunidades.importe), n: count() })
      .from(oportunidades)
      .where(and(eq(oportunidades.empresaId, empresaId), eq(oportunidades.etapa, "cerrada_ganada"), gte(oportunidades.fechaCierre, primeroMes))),
    db.select({ n: count() }).from(candidatos).where(and(eq(candidatos.empresaId, empresaId), eq(candidatos.convertido, false))),
    db.select({ n: count() }).from(casos).where(and(eq(casos.empresaId, empresaId), ne(casos.estado, "cerrado"))),
    db
      .select({ n: count() })
      .from(tareas)
      .where(and(eq(tareas.empresaId, empresaId), eq(tareas.propietarioId, usuario.id), ne(tareas.estado, "completada"), sql`${tareas.fechaVencimiento} <= ${fechaLocal()}::date`)),
    db
      .select()
      .from(eventos)
      .where(and(eq(eventos.empresaId, empresaId), eq(eventos.propietarioId, usuario.id), gte(eventos.fin, hoy), lt(eventos.inicio, finSemana)))
      .orderBy(eventos.inicio)
      .limit(6),
    db
      .select()
      .from(oportunidades)
      .where(and(eq(oportunidades.empresaId, empresaId), notInArray(oportunidades.etapa, etapasCerradas)))
      .orderBy(sql`${oportunidades.importe} desc nulls last`)
      .limit(6),
  ]);

  const kpis = [
    { etiqueta: "Pipeline abierto", valor: formatoMoneda(Number(pipeline?.total ?? 0), config.moneda), detalle: `${pipeline?.n ?? 0} oportunidades`, icono: "Crown", href: "/ventas/o/oportunidades?vista=abiertas" },
    { etiqueta: "Ganado este mes", valor: formatoMoneda(Number(ganado?.total ?? 0), config.moneda), detalle: `${ganado?.n ?? 0} cerradas`, icono: "CircleCheck", href: "/ventas/o/oportunidades?vista=ganadas" },
    { etiqueta: "Leads abiertos", valor: String(abiertos?.n ?? 0), detalle: "sin convertir", icono: "UserPlus", href: "/ventas/o/candidatos" },
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
