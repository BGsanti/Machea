import clsx from "clsx";
import Link from "next/link";
import { ETIQUETA_ROL, rolDe } from "@/auth/permisos";
import { Tarjeta } from "@/ui/basicos";
import { Icono } from "@/ui/icono";
import { NumeroAnimado } from "@/ui/numero-animado";
import { enlaceRegistro } from "../apps";
import { formatoMonedaCorto } from "../formato";
import { estadosCandidato, origenesCandidato } from "../opciones";
import { PERIODOS, type Periodo, type ResumenPanel } from "../servidor/panel";
import { AccionesContacto } from "../ui/acciones-contacto";
import { Anillo, BarraValor, duracionCorta, Sparkline, Variacion } from "../ui/graficos-panel";

const COLOR_ESTADO: Record<string, string> = {
  nuevo: "bg-sky-500",
  contactado: "bg-violet-500",
  en_seguimiento: "bg-amber-500",
  calificado: "bg-emerald-500",
  no_calificado: "bg-rose-400",
};

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

/** El panel del gerente: cómo está atendiendo el equipo los leads. Se calcula en el servidor, sin que el navegador pida nada. */
export function PanelGerente({ r, moneda, etiquetaNegocios, dias }: { r: ResumenPanel; moneda: string; etiquetaNegocios: string; dias: Periodo }) {
  const maxAsignados = Math.max(1, ...r.porAsesor.map((a) => a.asignados));
  const maxFuente = Math.max(1, ...r.porFuente.map((f) => f.total));
  const totalEmbudo = r.embudo.reduce((s, e) => s + e.total, 0);
  const maxEmbudo = Math.max(1, ...r.embudo.map((e) => e.total));
  const colorPct = r.pctEnTiempo === null ? "var(--color-slate-300)" : r.pctEnTiempo >= 80 ? "var(--color-emerald-500)" : r.pctEnTiempo >= 50 ? "var(--color-amber-500)" : "var(--color-rose-500)";

  return (
    <section aria-label="Panel del equipo" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-800">Cómo va el equipo</h2>
        <nav aria-label="Periodo" className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={`?dias=${p}`}
              replace
              scroll={false}
              aria-current={p === dias ? "true" : undefined}
              className={clsx("rounded-md px-3 py-1 text-xs font-medium transition-colors duration-150", p === dias ? "bg-riel text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}
            >
              {p} días
            </Link>
          ))}
        </nav>
      </div>

      {r.totalAtrasados > 0 || r.sinAsignar > 0 ? (
        <div role="status" className="animate-subir flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span className="animate-alerta inline-flex size-2.5 shrink-0 rounded-full bg-rose-600" aria-hidden />
          <p className="min-w-0 flex-1">
            {r.totalAtrasados > 0 ? (
              <>
                <strong>
                  {r.totalAtrasados} lead{r.totalAtrasados === 1 ? "" : "s"} nuevo{r.totalAtrasados === 1 ? "" : "s"}
                </strong>{" "}
                {r.totalAtrasados === 1 ? "lleva" : "llevan"} más de {r.slaMinutos} min sin contactar.
              </>
            ) : null}{" "}
            {r.sinAsignar > 0 ? (
              <>
                <strong>{r.sinAsignar}</strong> sin asesor asignado.
              </>
            ) : null}
          </p>
          <Link href="/ventas/o/candidatos" className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-700">
            Ver leads
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Tile etiqueta="Leads nuevos" icono="UserPlus" href="/ventas/o/candidatos" indice={0}>
          <p className="text-3xl font-semibold text-slate-800">
            <NumeroAnimado valor={r.nuevos} />
          </p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <Variacion actual={r.nuevos} antes={r.nuevosAntes} />
            <Sparkline valores={r.serie.map((s) => s.total)} className="h-9 w-24" />
          </div>
          <p className="mt-1 text-xs text-slate-500">en {dias} días · {r.calientesAbiertos} calientes abiertos</p>
        </Tile>

        <Tile etiqueta="Contactados a tiempo" icono="Timer" href="/ventas/o/candidatos" indice={1}>
          <div className="flex items-center gap-3">
            <Anillo pct={r.pctEnTiempo} color={colorPct}>
              {r.pctEnTiempo === null ? "—" : `${r.pctEnTiempo}%`}
            </Anillo>
            <div className="min-w-0">
              <Variacion actual={r.pctEnTiempo} antes={r.pctEnTiempoAntes} puntos />
              <p className="mt-1 text-xs text-slate-500">en menos de {r.slaMinutos} min</p>
            </div>
          </div>
        </Tile>

        <Tile etiqueta="Tiempo de respuesta" icono="Gauge" href="/ventas/o/candidatos" indice={2}>
          <p className="text-3xl font-semibold text-slate-800">{duracionCorta(r.medianaMin)}</p>
          <div className="mt-1">
            <Variacion actual={r.medianaMin} antes={r.medianaMinAntes} mejorSiSube={false} />
          </div>
          <p className="mt-1 text-xs text-slate-500">mediana, del lead al primer contacto</p>
        </Tile>

        <Tile etiqueta="Citas agendadas" icono="CalendarDays" href="/ventas/p/calendario" indice={3}>
          <p className="text-3xl font-semibold text-slate-800">
            <NumeroAnimado valor={r.citas} />
          </p>
          <div className="mt-1">
            <Variacion actual={r.citas} antes={r.citasAntes} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{r.nuevos > 0 ? `${Math.round((r.citas / r.nuevos) * 100)} por cada 100 leads` : "en el periodo"}</p>
        </Tile>

        <Tile etiqueta={etiquetaNegocios} icono="Crown" href="/ventas/o/oportunidades" indice={4}>
          <p className="truncate text-3xl font-semibold text-slate-800">{formatoMonedaCorto(r.pipeline.total, moneda)}</p>
          <p className="mt-1 text-xs text-slate-500">{r.pipeline.n} abiertos</p>
        </Tile>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Tarjeta titulo="Equipo" icono={<Icono nombre="Users" className="size-4 text-marca-700" />} className="xl:col-span-2" sinRelleno acciones={<Link href="/equipo" className="text-xs text-marca-700 hover:underline">Administrar equipo</Link>}>
          {r.porAsesor.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Todavía no hay asesores recibiendo leads.{" "}
              <Link href="/equipo" className="font-medium text-marca-700 hover:underline">
                Invita a tu equipo
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2 font-medium">Persona</th>
                    <th className="px-2 py-2 font-medium">Leads</th>
                    <th className="px-2 py-2 font-medium">Contactados</th>
                    <th className="px-2 py-2 font-medium">A tiempo</th>
                    <th className="px-2 py-2 font-medium">Respuesta</th>
                    <th className="px-2 py-2 font-medium">Citas</th>
                    <th className="px-4 py-2 font-medium">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {r.porAsesor.map((a, i) => {
                    const pctContactados = a.asignados > 0 ? Math.round((a.contactados / a.asignados) * 100) : null;
                    const pctTiempo = a.asignados > 0 ? Math.round((a.enTiempo / a.asignados) * 100) : null;
                    return (
                      <tr key={a.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-subir border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{iniciales(a.nombre)}</span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-800">{a.nombre}</p>
                              <p className="text-[11px] text-slate-400">{ETIQUETA_ROL[rolDe(a.rol)]}</p>
                            </div>
                          </div>
                        </td>
                        <td className="w-36 px-2 py-2.5">
                          <span className="font-semibold tabular-nums text-slate-800">{a.asignados}</span>
                          <BarraValor valor={a.asignados} max={maxAsignados} className="mt-1" />
                        </td>
                        <td className="px-2 py-2.5 tabular-nums text-slate-700">{pctContactados === null ? "—" : `${pctContactados}%`}</td>
                        <td className={clsx("px-2 py-2.5 font-medium tabular-nums", pctTiempo === null ? "text-slate-400" : pctTiempo >= 80 ? "text-emerald-700" : pctTiempo >= 50 ? "text-amber-700" : "text-rose-700")}>
                          {pctTiempo === null ? "—" : `${pctTiempo}%`}
                        </td>
                        <td className="px-2 py-2.5 tabular-nums text-slate-700">{duracionCorta(a.medianaMin)}</td>
                        <td className="px-2 py-2.5 tabular-nums text-slate-700">{a.citas}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {a.atrasados > 0 ? <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700">{a.atrasados} atrasado{a.atrasados === 1 ? "" : "s"}</span> : null}
                            {a.tareasVencidas > 0 ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">{a.tareasVencidas} vencida{a.tareasVencidas === 1 ? "" : "s"}</span> : null}
                            {a.atrasados === 0 && a.tareasVencidas === 0 ? <span className="text-xs text-slate-400">Al día</span> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>

        <div className="space-y-4">
          <Tarjeta titulo="Embudo de leads" icono={<Icono nombre="Funnel" className="size-4 text-marca-700" />}>
            {totalEmbudo === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Aún no hay leads abiertos.</p>
            ) : (
              <ul className="space-y-2.5">
                {estadosCandidato.map((e) => {
                  const n = r.embudo.find((x) => x.estado === e.valor)?.total ?? 0;
                  return (
                    <li key={e.valor}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="font-medium text-slate-700">{e.etiqueta}</span>
                        <span className="tabular-nums text-slate-500">
                          {n} · {Math.round((n / totalEmbudo) * 100)}%
                        </span>
                      </div>
                      <BarraValor valor={n} max={maxEmbudo} color={COLOR_ESTADO[e.valor] ?? "bg-slate-400"} className="mt-1" />
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta titulo="De dónde llegan" icono={<Icono nombre="Target" className="size-4 text-marca-700" />}>
            {r.porFuente.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">Sin leads en este periodo.</p>
            ) : (
              <ul className="space-y-2.5">
                {r.porFuente.map((f) => (
                  <li key={f.origen ?? "—"}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="truncate font-medium text-slate-700">{origenesCandidato.find((o) => o.valor === f.origen)?.etiqueta ?? (f.origen ? f.origen.replace(/_/g, " ") : "Sin origen")}</span>
                      <span className="shrink-0 tabular-nums text-slate-500">
                        {f.total}
                        {f.calientes > 0 ? ` · ${Math.round((f.calientes / f.total) * 100)}% calientes` : ""}
                      </span>
                    </div>
                    <BarraValor valor={f.total} max={maxFuente} className="mt-1" />
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>

      <Tarjeta
        titulo="Leads esperando respuesta"
        icono={<Icono nombre="AlarmClock" className={clsx("size-4", r.totalAtrasados > 0 ? "text-rose-600" : "text-emerald-600")} />}
        sinRelleno
        acciones={r.totalAtrasados > 8 ? <span className="text-xs text-slate-500">Los 8 más viejos de {r.totalAtrasados}</span> : undefined}
      >
        {r.atrasados.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-6">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Icono nombre="CircleCheck" className="size-5" />
            </span>
            <p className="text-sm text-slate-600">
              <strong className="text-slate-800">Nadie está esperando.</strong> Todos los leads nuevos se contactaron dentro de {r.slaMinutos} min.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {r.atrasados.map((l) => (
              <li key={l.id} className="animate-aparecer flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="animate-alerta inline-flex size-2.5 shrink-0 rounded-full bg-rose-600" aria-hidden />
                <Link href={enlaceRegistro("candidatos", l.id)} className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm font-medium text-slate-800 hover:text-marca-700">{l.nombre}</span>
                  <span className="block truncate text-xs text-slate-500">{[l.interes, l.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}</span>
                </Link>
                <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Espera {duracionCorta(l.minutos)}</span>
                {l.asesor ? <span className="text-xs text-slate-500">{l.asesor}</span> : <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Sin asesor</span>}
                <AccionesContacto telefono={l.telefono} nombre={l.nombre} />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </section>
  );
}

function Tile({ etiqueta, icono, href, indice, children }: { etiqueta: string; icono: string; href: string; indice: number; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{ animationDelay: `${indice * 45}ms` }}
      className="animate-subir group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-marca-500 hover:shadow-md"
    >
      <div className="mb-2 flex items-center justify-between text-slate-500">
        <span className="text-xs font-medium">{etiqueta}</span>
        <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-marca-50 group-hover:text-marca-700">
          <Icono nombre={icono} className="size-4" />
        </span>
      </div>
      {children}
    </Link>
  );
}
