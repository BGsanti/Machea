import Link from "next/link";
import { and, eq, ne, sql } from "drizzle-orm";
import type { Usuario } from "@/auth/sesion";
import { bd } from "@/db/cliente";
import { empresaActual } from "@/db/empresa";
import { tareas } from "@/db/esquema";
import { Tarjeta } from "@/ui/basicos";
import { Icono } from "@/ui/icono";
import { NumeroAnimado } from "@/ui/numero-animado";
import { enlaceRegistro } from "../apps";
import { fechaLocal, ZONA_HORARIA } from "../fechas";
import { formatoFechaHora } from "../formato";
import { perfilDe } from "../perfiles";
import { obtenerConfiguracion } from "../servidor/consultas";
import { datosMiDia } from "../servidor/panel";
import { duracionCorta } from "../ui/graficos-panel";
import { EncabezadoInicio } from "./encabezado-inicio";
import { ListaParaHoy } from "./inicio-hoy";
import { ListaPorContactar } from "./mi-dia-cliente";

const hora = (d: Date) => new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_HORARIA, hour: "numeric", minute: "2-digit", hour12: true }).format(d);

/** «Mi día»: lo único que un asesor necesita al abrir el CRM. Solo sus leads, sus tareas y sus citas. */
export async function PaginaMiDia({ usuario }: { usuario: Usuario }) {
  const db = await bd();
  const empresaId = await empresaActual();
  const config = await obtenerConfiguracion();
  const perfil = perfilDe(config.perfil);
  const hoy = fechaLocal();
  const [d, tareasHoy] = await Promise.all([
    datosMiDia(usuario.id, config.slaMinutos),
    db
      .select({ id: tareas.id, asunto: tareas.asunto, fechaVencimiento: tareas.fechaVencimiento, prioridad: tareas.prioridad })
      .from(tareas)
      .where(and(eq(tareas.empresaId, empresaId), eq(tareas.propietarioId, usuario.id), ne(tareas.estado, "completada"), sql`${tareas.fechaVencimiento} <= ${hoy}::date`))
      .orderBy(tareas.fechaVencimiento)
      .limit(30),
  ]);

  const h = Number(new Intl.DateTimeFormat("es-CO", { timeZone: ZONA_HORARIA, hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const saludo = h < 5 ? "Buenas noches" : h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const tiles = [
    { etiqueta: "Leads esta semana", valor: d.semana.recibidos, icono: "UserPlus" },
    { etiqueta: "Ya contactados", valor: d.semana.contactados, icono: "PhoneCall" },
    { etiqueta: "Citas agendadas", valor: d.semana.citas, icono: "CalendarDays" },
  ];

  return (
    <div className="space-y-6">
      <EncabezadoInicio
        saludo={saludo}
        nombre={usuario.nombre.split(" ")[0] ?? usuario.nombre}
        resumen={
          d.totalPorContactar > 0
            ? `Tienes ${d.totalPorContactar} lead${d.totalPorContactar === 1 ? "" : "s"} por contactar. Cada minuto cuenta: la meta es menos de ${d.slaMinutos} min.`
            : `Estás al día con tus leads nuevos. ${perfil.inicio.resumen}`
        }
        accesos={[
          { etiqueta: "Nuevo lead", href: "/ventas/o/candidatos?nuevo=1", icono: "UserPlus", primario: true },
          { etiqueta: "Mi calendario", href: "/ventas/p/calendario", icono: "CalendarDays" },
          { etiqueta: "Mis tareas", href: "/ventas/o/tareas?vista=mias_abiertas", icono: "ListChecks" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t, i) => (
          <div key={t.etiqueta} style={{ animationDelay: `${i * 45}ms` }} className="animate-subir rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-medium">{t.etiqueta}</span>
              <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Icono nombre={t.icono} className="size-4" />
              </span>
            </div>
            <p className="mt-2 text-3xl font-semibold text-slate-800">
              <NumeroAnimado valor={t.valor} />
            </p>
            <p className="text-xs text-slate-500">últimos 7 días</p>
          </div>
        ))}
        <div style={{ animationDelay: "135ms" }} className="animate-subir rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Tu tiempo de respuesta</span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Icono nombre="Gauge" className="size-4" />
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold text-slate-800">{duracionCorta(d.semana.medianaMin)}</p>
          <p className="text-xs text-slate-500">{d.semana.enTiempoPct === null ? "mediana de la semana" : `${d.semana.enTiempoPct}% dentro de ${d.slaMinutos} min`}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Tarjeta titulo="Contacta primero" icono={<Icono nombre="Zap" className="size-4 text-marca-700" />} sinRelleno>
            <ListaPorContactar leads={d.porContactar} total={d.totalPorContactar} sla={d.slaMinutos} />
          </Tarjeta>
          <Tarjeta titulo="Tareas y seguimientos" icono={<Icono nombre="ListChecks" className="size-4 text-marca-700" />} sinRelleno>
            <ListaParaHoy hoy={hoy} calientes={[]} tareas={tareasHoy.map((t) => ({ id: t.id, asunto: t.asunto, fechaVencimiento: t.fechaVencimiento, prioridad: t.prioridad }))} />
          </Tarjeta>
        </div>

        <div className="space-y-4">
          <Tarjeta titulo="Tus citas de hoy" icono={<Icono nombre="CalendarDays" className="size-4 text-marca-700" />} sinRelleno>
            {d.citasHoy.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No tienes citas hoy.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.citasHoy.map((c) => (
                  <li key={c.id}>
                    <Link href={enlaceRegistro("eventos", c.id)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50">
                      <span className="w-16 shrink-0 text-sm font-semibold text-marca-700">{hora(c.inicio)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">{c.asunto}</span>
                        {c.ubicacion ? <span className="block truncate text-xs text-slate-500">{c.ubicacion}</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          <Tarjeta titulo="Próximos 7 días" icono={<Icono nombre="Clock" className="size-4 text-marca-700" />} sinRelleno>
            {d.proximasCitas.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">No tienes más citas esta semana.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {d.proximasCitas.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link href={enlaceRegistro("eventos", c.id)} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50">
                      <span className="min-w-0 truncate text-sm text-slate-800">{c.asunto}</span>
                      <span className="shrink-0 text-xs text-slate-500">{formatoFechaHora(c.inicio)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          <p className="px-1 text-xs text-slate-400">Tienes {d.abiertos} leads abiertos en total.</p>
        </div>
      </div>
    </div>
  );
}
