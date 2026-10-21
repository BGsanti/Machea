import Link from "next/link";
import { and, count, desc, eq, gte, lt, ne, notInArray, sql, sum } from "drizzle-orm";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { candidatos, casos, eventos, formularios, inmuebles, oportunidades, proyectos, tareas } from "@/db/esquema";
import type { Usuario } from "@/auth/sesion";
import { Tarjeta } from "@/ui/basicos";
import { EnlaceBoton } from "@/ui/boton";
import { Icono, IconoObjeto } from "@/ui/icono";
import { NumeroAnimado } from "@/ui/numero-animado";
import { appDeObjeto, enlaceRegistro } from "../apps";
import { fechaLocal, inicioMes, ZONA_HORARIA } from "../fechas";
import { formatoFechaHora, formatoMoneda } from "../formato";
import { obtenerObjeto } from "../objetos";
import { etapasCerradas, origenesCandidato } from "../opciones";
import { perfilDe } from "../perfiles";
import { ejecutarInforme, listaInformes, obtenerConfiguracion, obtenerPreferencias } from "../servidor/consultas";
import { recientes } from "../servidor/repositorio";
import { ListaParaHoy } from "./inicio-hoy";
import { PrimerosPasos, TarjetaInformes, type InformeWidget, type PasoInicial } from "./inicio-cliente";

export async function PaginaInicio({ usuario, app }: { usuario: Usuario; app: string }) {
  const db = await bd();
  const empresaId = await empresaActual();
  const ahora = new Date();
  const hace7 = new Date(ahora.getTime() - 7 * 864e5);
  const en7 = new Date(ahora.getTime() + 7 * 864e5);
  const hoy = fechaLocal();

  const [prefs, config, vistos, todos] = await Promise.all([
    obtenerPreferencias(usuario.id),
    obtenerConfiguracion(),
    recientes(usuario.id, 8),
    listaInformes(),
  ]);

  const perfil = perfilDe(config.perfil);
  const tablaCatalogo = perfil.catalogo?.objeto === "proyectos" ? proyectos : perfil.catalogo?.objeto === "inmuebles" ? inmuebles : null;
  const abiertosDeLaEmpresa = and(eq(candidatos.empresaId, empresaId), eq(candidatos.convertido, false));
  const [[abiertos], [nuevos], [calientesTotal], [pipeline], [conLeads], [conLlamadas], [conEventos], [conTareas], [conFormularios], [conCatalogo], tareasHoy, calientes, citas] = await Promise.all([
    db.select({ n: count() }).from(candidatos).where(abiertosDeLaEmpresa),
    db.select({ n: count() }).from(candidatos).where(and(eq(candidatos.empresaId, empresaId), gte(candidatos.creadoEn, hace7))),
    db.select({ n: count() }).from(candidatos).where(and(abiertosDeLaEmpresa, eq(candidatos.valoracion, "caliente"))),
    db
      .select({ total: sum(oportunidades.importe), n: count() })
      .from(oportunidades)
      .where(and(eq(oportunidades.empresaId, empresaId), notInArray(oportunidades.etapa, etapasCerradas))),
    db.select({ n: count() }).from(candidatos).where(eq(candidatos.empresaId, empresaId)),
    db.select({ n: count() }).from(tareas).where(and(eq(tareas.empresaId, empresaId), eq(tareas.tipo, "llamada"))),
    db.select({ n: count() }).from(eventos).where(eq(eventos.empresaId, empresaId)),
    db.select({ n: count() }).from(tareas).where(eq(tareas.empresaId, empresaId)),
    db.select({ n: count() }).from(formularios).where(eq(formularios.empresaId, empresaId)),
    tablaCatalogo ? db.select({ n: count() }).from(tablaCatalogo).where(eq(tablaCatalogo.empresaId, empresaId)) : Promise.resolve([{ n: 0 }]),
    db
      .select({ id: tareas.id, asunto: tareas.asunto, fechaVencimiento: tareas.fechaVencimiento, prioridad: tareas.prioridad })
      .from(tareas)
      .where(
        and(
          eq(tareas.empresaId, empresaId),
          eq(tareas.propietarioId, usuario.id),
          ne(tareas.estado, "completada"),
          sql`${tareas.fechaVencimiento} <= ${hoy}::date`,
        ),
      )
      .orderBy(tareas.fechaVencimiento)
      .limit(50),
    // Calientes sin llamar: los que ya tienen una llamada registrada a mano hoy no se vuelven a pedir.
    db
      .select({ id: candidatos.id, nombre: candidatos.nombre, apellidos: candidatos.apellidos, telefono: candidatos.telefono, origen: candidatos.origen, ciudad: candidatos.ciudad })
      .from(candidatos)
      .where(
        and(
          abiertosDeLaEmpresa,
          eq(candidatos.valoracion, "caliente"),
          sql`not exists (select 1 from ${tareas} t where t.quien_id = ${candidatos.id} and t.tipo = 'llamada' and t.estado = 'completada' and t.origen_externo is null and t.fecha_vencimiento >= ${hoy}::date)`,
        ),
      )
      .orderBy(desc(candidatos.creadoEn))
      .limit(6),
    db
      .select({ id: eventos.id, asunto: eventos.asunto, inicio: eventos.inicio })
      .from(eventos)
      .where(and(eq(eventos.empresaId, empresaId), eq(eventos.propietarioId, usuario.id), gte(eventos.fin, ahora), lt(eventos.inicio, en7)))
      .orderBy(eventos.inicio)
      .limit(50),
  ]);

  const paso = {
    formulario: { id: "formulario", titulo: perfil.id === "machea" ? "Cree el formulario de demo" : "Cree su primer formulario", texto: "Arme las preguntas, ponga su marca y publíquelo.", href: "/formularios", icono: "ClipboardList", hecho: (conFormularios?.n ?? 0) > 0 },
    catalogo: perfil.catalogo
      ? {
          id: "catalogo",
          titulo: perfil.catalogo.objeto === "proyectos" ? "Cargue sus proyectos" : "Cargue sus inmuebles",
          texto: "Los leads y los formularios pueden preguntar por uno.",
          href: `/ventas/o/${perfil.catalogo.objeto}?nuevo=1`,
          icono: perfil.catalogo.icono,
          hecho: (conCatalogo?.n ?? 0) > 0,
        }
      : null,
    leads: { id: "leads", titulo: perfil.id === "machea" ? "Agregue sus primeros prospectos" : "Agregue sus primeros leads", texto: "Cree uno o importe una lista en CSV.", href: "/ventas/o/candidatos?importar=1", icono: "UserPlus", hecho: (conLeads?.n ?? 0) > 0 },
    llamada: { id: "llamada", titulo: "Registre una llamada", texto: "Con un clic deja el resultado y el seguimiento.", href: "/ventas/o/candidatos", icono: "PhoneCall", hecho: (conLlamadas?.n ?? 0) > 0 },
    cita: { id: "cita", titulo: perfil.id === "machea" ? "Agende una demo" : perfil.id === "constructora" ? "Agende una visita" : "Agende una visita", texto: "Aparece en el calendario y en «Mis citas».", href: "/ventas/p/calendario", icono: "CalendarPlus", hecho: (conEventos?.n ?? 0) > 0 },
    tarea: { id: "tarea", titulo: "Cree una tarea de seguimiento", texto: "Le aparece aquí el día que toca.", href: "/ventas/o/tareas?nuevo=1", icono: "ListChecks", hecho: (conTareas?.n ?? 0) > 0 },
  };
  const pasos: PasoInicial[] = (perfil.id === "machea"
    ? [paso.formulario, paso.leads, paso.llamada, paso.cita, paso.tarea]
    : [paso.formulario, paso.catalogo, paso.leads, paso.llamada, paso.cita]
  ).filter((p): p is PasoInicial => p !== null);
  const completos = pasos.every((p) => p.hecho);
  const primerosPasosOcultos = prefs.sugerenciasOcultas.includes("primeros-pasos");

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
  const nombreCompleto = (c: { nombre: string | null; apellidos: string }) => [c.nombre, c.apellidos].filter(Boolean).join(" ");
  const etiquetaOrigen = (valor: string | null) => origenesCandidato.find((o) => o.valor === valor)?.etiqueta ?? null;

  const kpis: { etiqueta: string; valor: number | string; detalle: string; icono: string; href: string }[] = [
    { etiqueta: "Leads abiertos", valor: abiertos?.n ?? 0, detalle: `${nuevos?.n ?? 0} nuevos en 7 días`, icono: "UserPlus", href: "/ventas/o/candidatos" },
    { etiqueta: "Leads calientes", valor: calientesTotal?.n ?? 0, detalle: "para llamar primero", icono: "Flame", href: "/ventas/o/candidatos?vista=calientes" },
    { etiqueta: "Mis citas", valor: citas.length, detalle: "en los próximos 7 días", icono: "CalendarDays", href: "/ventas/p/calendario" },
    { etiqueta: "Mis tareas para hoy", valor: tareasHoy.length, detalle: "incluye vencidas", icono: "ListChecks", href: "/ventas/o/tareas?vista=vencidas" },
    { etiqueta: perfil.inicio.etiquetaNegocios, valor: formatoMoneda(Number(pipeline?.total ?? 0), config.moneda), detalle: `${pipeline?.n ?? 0} oportunidades`, icono: "Crown", href: "/ventas/o/oportunidades" },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-800">
            {saludo}, {usuario.nombre.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {config.nombreEmpresa}: {perfil.inicio.resumen}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {perfil.inicio.acciones.map((a) => (
            <EnlaceBoton key={a.href + a.etiqueta} href={a.href} variante={a.primario ? "primario" : "secundario"} icono={a.icono}>
              {a.etiqueta}
            </EnlaceBoton>
          ))}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k, i) => (
          <Link
            key={k.etiqueta}
            href={k.href}
            style={{ animationDelay: `${i * 45}ms` }}
            className={`animate-subir group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-marca-500 hover:shadow-md ${i === kpis.length - 1 ? "sm:max-xl:col-span-2" : ""}`}
          >
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">{k.etiqueta}</span>
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-marca-50 group-hover:text-marca-700">
                <Icono nombre={k.icono} className="size-4" />
              </span>
            </div>
            <p className="mt-2 truncate text-2xl font-semibold text-slate-800">{typeof k.valor === "number" ? <NumeroAnimado valor={k.valor} /> : k.valor}</p>
            <p className="text-xs text-slate-500">{k.detalle}</p>
          </Link>
        ))}
      </div>

      {completos ? null : <PrimerosPasos pasos={pasos} esAdmin={usuario.rol === "admin"} sinLeads={(conLeads?.n ?? 0) === 0} oculto={primerosPasosOcultos} />}

      <div className="grid gap-4 xl:grid-cols-3">
        <Tarjeta titulo="Para hacer hoy" icono={<Icono nombre="ListChecks" className="size-4 text-marca-700" />} className="xl:col-span-2" sinRelleno>
          <ListaParaHoy
            hoy={hoy}
            calientes={calientes.map((c) => ({
              id: c.id,
              nombre: nombreCompleto(c),
              detalle: [etiquetaOrigen(c.origen), c.ciudad].filter(Boolean).join(" · ") || null,
              telefono: c.telefono,
            }))}
            tareas={tareasHoy.map((t) => ({ id: t.id, asunto: t.asunto, fechaVencimiento: t.fechaVencimiento, prioridad: t.prioridad }))}
          />
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
                {citas.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    <Link href={enlaceRegistro("eventos", e.id)} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50">
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
                      <Link href={`/${appDeObjeto(v.objeto)}/o/${v.objeto}/${v.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50">
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

      <section aria-label="Informes" className="space-y-3">
        <h2 className="text-base font-semibold text-slate-800">Sus informes</h2>
        <div className="grid gap-4 lg:grid-cols-2">
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
