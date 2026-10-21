import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EnlaceBoton } from "@/ui/boton";
import { Tarjeta } from "@/ui/basicos";
import { Icono, IconoObjeto } from "@/ui/icono";
import { formatoMoneda, formatoNumero, nombreVisible, type FilaConNombres } from "../../formato";
import { markdownSeguro } from "../../markdown";
import { campoDe, obtenerObjeto } from "../../objetos";
import { lineasDe, miembrosDe, obtenerConfiguracion } from "../../servidor/consultas";
import { detalleDeLlamada } from "../../servidor/grabaciones";
import { actividadesDe, obtener, registrarVisto, relacionados, ultimaLlamadaManuela } from "../../servidor/repositorio";
import type { DefObjeto } from "../../tipos";
import { ValorCampo } from "../valor-campo";
import { AccionesContacto } from "../acciones-contacto";
import { ResultadoLlamadaBoton } from "../resultado-llamada";
import { AccionesFicha } from "./acciones-ficha";
import { NuevoRelacionado, PanelActividad } from "./actividad";
import { TarjetaLlamadaManuela } from "./llamada-manuela";
import { MiembrosCampana } from "./miembros";
import { Pestanas } from "./pestanas";
import { Ruta } from "./ruta";

const configRuta: Record<string, { finales: string[]; negativos: string[] }> = {
  oportunidades: { finales: ["cerrada_ganada", "cerrada_perdida"], negativos: ["cerrada_perdida"] },
  candidatos: { finales: ["calificado", "no_calificado"], negativos: ["no_calificado"] },
  casos: { finales: ["cerrado"], negativos: [] },
  facturas: { finales: ["pagada", "anulada"], negativos: ["anulada", "vencida"] },
  campanas: { finales: ["completada", "cancelada"], negativos: ["cancelada"] },
};

const personas = ["contactos", "candidatos"];
const relacionables = ["cuentas", "oportunidades", "casos", "campanas", "productos"];

/** Valores con los que se rellenan las actividades creadas desde un registro. */
function prefijoActividad(objeto: string, fila: FilaConNombres, nombre: string): Partial<FilaConNombres> {
  if (personas.includes(objeto)) {
    const conCuenta = objeto === "contactos" && typeof fila.cuentaId === "string";
    return {
      quienObjeto: objeto,
      quienId: fila.id,
      relacionadoObjeto: conCuenta ? "cuentas" : null,
      relacionadoId: conCuenta ? (fila.cuentaId as string) : null,
      __nombres: { quien: nombre, relacionado: conCuenta ? (fila.__nombres?.cuentaId ?? null) : null },
    };
  }
  if (relacionables.includes(objeto)) {
    return { relacionadoObjeto: objeto, relacionadoId: fila.id, __nombres: { relacionado: nombre } };
  }
  return {};
}

function Detalles({ def, fila, app, moneda }: { def: DefObjeto; fila: FilaConNombres; app: string; moneda: string }) {
  const sistema = ["propietarioId", "creadoEn", "actualizadoEn"];
  const enSecciones = new Set(def.secciones.flatMap((s) => s.campos.flatMap((c) => (typeof c === "string" ? [c] : c.campos))));
  const item = (nombre: string) => {
    const campo = campoDe(def, nombre);
    if (!campo || campo.tipo === "markdown") return null;
    return (
      <div key={nombre} className="border-b border-slate-100 py-2">
        <dt className="text-xs text-slate-500">{campo.etiqueta}</dt>
        <dd className="mt-0.5 min-h-5 text-sm text-slate-800">
          <ValorCampo campo={campo} fila={fila} app={app} moneda={moneda} />
        </dd>
      </div>
    );
  };
  return (
    <div className="space-y-6">
      {def.secciones.map((s) => (
        <section key={s.titulo}>
          <h3 className="mb-2 rounded bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">{s.titulo}</h3>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            {s.campos.map((c) =>
              typeof c === "string" ? (
                item(c)
              ) : (
                <div key={c.grupo} className="border-b border-slate-100 py-2 sm:col-span-2">
                  <dt className="text-xs text-slate-500">{c.grupo}</dt>
                  <dd className="mt-0.5 text-sm text-slate-800">
                    {c.campos
                      .map((n) => fila[n])
                      .filter((v) => v !== null && v !== undefined && v !== "")
                      .join(c.grupo === "Nombre completo" ? " " : ", ") || <span className="text-slate-400">—</span>}
                  </dd>
                </div>
              ),
            )}
          </dl>
        </section>
      ))}
      <section>
        <h3 className="mb-2 rounded bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">Información del sistema</h3>
        <dl className="grid gap-x-8 sm:grid-cols-2">{sistema.filter((n) => !enSecciones.has(n)).map(item)}</dl>
      </section>
    </div>
  );
}

export async function PaginaFicha({ app, objeto, id, usuarioId }: { app: string; objeto: string; id: string; usuarioId: string }) {
  const def = obtenerObjeto(objeto);
  if (!def || objeto === "usuarios" || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (objeto === "flujos") redirect(`/${app}/p/flujo?id=${id}`);
  const fila = await obtener(objeto, id);
  if (!fila) notFound();
  await registrarVisto(usuarioId, objeto, id);
  const config = await obtenerConfiguracion();
  const moneda = config.moneda;
  const nombre = nombreVisible(def, fila);

  const listas = await Promise.all(
    (def.relacionadas ?? []).map(async (r) => ({ ...r, datos: await relacionados(r.objeto, r.campo, id, usuarioId) })),
  );
  const actividades = def.actividades ? await actividadesDe(id) : null;
  const lineas = objeto === "facturas" ? await lineasDe(id) : [];
  const miembros = objeto === "campanas" ? await miembrosDe(id) : [];
  const llamadaManuela = personas.includes(objeto) ? await ultimaLlamadaManuela(id) : null;
  const detalleLlamada = llamadaManuela ? await detalleDeLlamada(llamadaManuela.llamadaId).catch(() => null) : null;
  const campoRuta = def.campoRuta ? campoDe(def, def.campoRuta) : undefined;

  const panelRelacionado =
    listas.length || objeto === "campanas" ? (
      <div className="grid gap-4 lg:grid-cols-2">
        {objeto === "campanas" ? <MiembrosCampana miembros={miembros} app={app} /> : null}
        {listas.map((l) => {
          const dr = obtenerObjeto(l.objeto)!;
          const cols = l.columnas.map((c) => campoDe(dr, c)).filter((c) => c !== undefined);
          const verTodo = `/${app}/o/${l.objeto}?vista=${dr.vistas.some((v) => v.id === "todos") ? "todos" : dr.vistaPorDefecto}&f=${encodeURIComponent(JSON.stringify([{ campo: l.campo, operador: "igual", valor: id }]))}`;
          return (
            <Tarjeta
              key={`${l.objeto}-${l.campo}`}
              titulo={`${l.titulo} (${l.datos.total})`}
              icono={<IconoObjeto icono={dr.icono} color={dr.color} tamano="sm" />}
              acciones={dr.acciones.nuevo ? <NuevoRelacionado objeto={l.objeto} app={app} campo={l.campo} id={id} nombre={nombre} /> : undefined}
              sinRelleno
            >
              {l.datos.filas.length === 0 ? (
                <p className="px-4 py-4 text-sm text-slate-500">Sin registros.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {l.datos.filas.map((f) => (
                    <li key={f.id} className="px-4 py-2.5">
                      <Link href={`/${app}/o/${l.objeto}/${f.id}`} className="text-sm font-medium text-marca-700 hover:underline">
                        {nombreVisible(dr, f)}
                      </Link>
                      <dl className="mt-0.5 grid grid-cols-2 gap-x-3 text-xs text-slate-600">
                        {cols.slice(1).map((c) => (
                          <div key={c.nombre} className="flex gap-1 truncate">
                            <dt className="text-slate-400">{c.etiqueta}:</dt>
                            <dd className="truncate">
                              <ValorCampo campo={c} fila={f} app={app} moneda={moneda} />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
              )}
              {l.datos.total > l.datos.filas.length ? (
                <Link href={verTodo} className="block border-t border-slate-100 px-4 py-2 text-center text-sm text-marca-700 hover:bg-slate-50">
                  Ver todo
                </Link>
              ) : null}
            </Tarjeta>
          );
        })}
      </div>
    ) : null;

  const contenidoArticulo =
    objeto === "articulos" && typeof fila.contenido === "string" && fila.contenido ? (
      <div className="contenido-articulo mb-6 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-800" dangerouslySetInnerHTML={{ __html: markdownSeguro(fila.contenido) }} />
    ) : null;

  const tablaLineas =
    objeto === "facturas" ? (
      <div className="mb-6 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">Descripción</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right">Precio unitario</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{l.descripcion}</td>
                <td className="px-3 py-2 text-right">{formatoNumero(l.cantidad)}</td>
                <td className="px-3 py-2 text-right">{formatoMoneda(l.precioUnitario, moneda)}</td>
                <td className="px-3 py-2 text-right">{formatoMoneda(l.total, moneda)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 text-sm">
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">
                Subtotal
              </td>
              <td className="px-3 py-1.5 text-right">{formatoMoneda(fila.subtotal, moneda)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">
                Impuestos ({formatoNumero(config.impuestoPorcentaje)} %)
              </td>
              <td className="px-3 py-1.5 text-right">{formatoMoneda(fila.impuestos, moneda)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={3} className="px-3 py-2 text-right">
                Total
              </td>
              <td className="px-3 py-2 text-right">{formatoMoneda(fila.total, moneda)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    ) : null;

  const pestanas = [
    ...(actividades
      ? [
          {
            id: "actividad",
            etiqueta: "Actividad",
            contenido: <PanelActividad app={app} prefijo={prefijoActividad(objeto, fila, nombre)} pendientes={actividades.pendientes} pasadas={actividades.pasadas} />,
          },
        ]
      : []),
    {
      id: "detalles",
      etiqueta: "Detalles",
      contenido: (
        <>
          {contenidoArticulo}
          {tablaLineas}
          <Detalles def={def} fila={fila} app={app} moneda={moneda} />
        </>
      ),
    },
    ...(panelRelacionado ? [{ id: "relacionado", etiqueta: "Relacionado", contenido: panelRelacionado }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <IconoObjeto icono={def.icono} color={def.color} tamano="lg" />
            <div className="min-w-0">
              <p className="text-xs text-slate-500">{def.etiqueta}</p>
              <h1 className="truncate text-xl font-semibold text-slate-800">{nombre}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {personas.includes(objeto) && fila.telefono ? <AccionesContacto telefono={fila.telefono} nombre={nombre} tamano="md" /> : null}
            {personas.includes(objeto) && !fila.convertido ? <ResultadoLlamadaBoton objeto={objeto} id={id} /> : null}
            <AccionesFicha objeto={objeto} app={app} fila={fila} nombre={nombre} />
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-10 gap-y-2 px-5 pb-4">
          {def.camposResaltados.map((n) => {
            const c = campoDe(def, n);
            return c ? (
              <div key={n} className="min-w-0">
                <dt className="text-xs text-slate-500">{c.etiqueta}</dt>
                <dd className="text-sm text-slate-800">
                  <ValorCampo campo={c} fila={fila} app={app} moneda={moneda} />
                </dd>
              </div>
            ) : null;
          })}
        </dl>
        {campoRuta?.opciones && !campoRuta.soloLectura ? (
          <Ruta
            objeto={objeto}
            id={id}
            campo={campoRuta.nombre}
            etiquetaCampo={campoRuta.etiqueta}
            opciones={campoRuta.opciones}
            actual={typeof fila[campoRuta.nombre] === "string" ? (fila[campoRuta.nombre] as string) : null}
            finales={configRuta[objeto]?.finales}
            finalesNegativos={configRuta[objeto]?.negativos}
          />
        ) : null}
        {objeto === "candidatos" && fila.convertido ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
            <Icono nombre="CircleCheck" className="size-4" /> Lead convertido.
            {typeof fila.cuentaConvertidaId === "string" ? (
              <EnlaceBoton href={`/${app}/o/cuentas/${fila.cuentaConvertidaId}`} tamano="sm" variante="enlace">
                Ver cuenta
              </EnlaceBoton>
            ) : null}
            {typeof fila.contactoConvertidoId === "string" ? (
              <EnlaceBoton href={`/${app}/o/contactos/${fila.contactoConvertidoId}`} tamano="sm" variante="enlace">
                Ver contacto
              </EnlaceBoton>
            ) : null}
            {typeof fila.oportunidadConvertidaId === "string" ? (
              <EnlaceBoton href={`/${app}/o/oportunidades/${fila.oportunidadConvertidaId}`} tamano="sm" variante="enlace">
                Ver oportunidad
              </EnlaceBoton>
            ) : null}
          </div>
        ) : null}
        {objeto === "articulos" ? (
          <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-2 text-xs text-slate-500">
            <Icono nombre="Info" className="size-3.5" /> Versión {String(fila.version ?? 1)}.
            {fila.estado !== "borrador" ? " Para cambiar el contenido, use «Modificar como borrador»." : " Publique el artículo cuando esté listo."}
          </div>
        ) : null}
      </div>
      {llamadaManuela ? <TarjetaLlamadaManuela llamada={llamadaManuela} detalle={detalleLlamada} /> : null}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <Pestanas pestanas={pestanas} inicial={actividades ? "detalles" : undefined} />
      </div>
    </div>
  );
}
