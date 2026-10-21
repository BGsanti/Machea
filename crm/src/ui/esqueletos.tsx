import clsx from "clsx";

/** Barra gris que parpadea mientras carga lo que va en su lugar. */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-brillo rounded-md bg-slate-200/80", className)} />;
}

function TarjetaEsqueleto({ className, filas = 3 }: { className?: string; filas?: number }) {
  return (
    <div className={clsx("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>
      <Esqueleto className="h-4 w-1/3" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: filas }, (_, i) => (
          <Esqueleto key={i} className={clsx("h-3.5", i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-5/6" : "w-2/3")} />
        ))}
      </div>
    </div>
  );
}

/** Mientras carga una página de inicio o de análisis. */
export function EsqueletoPagina() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-6">
      <div className="space-y-2">
        <Esqueleto className="h-7 w-64" />
        <Esqueleto className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Esqueleto className="h-3 w-1/2" />
            <Esqueleto className="mt-3 h-7 w-1/3" />
            <Esqueleto className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <TarjetaEsqueleto className="xl:col-span-2" filas={5} />
        <TarjetaEsqueleto filas={4} />
      </div>
    </div>
  );
}

/** Mientras carga una lista de registros. */
export function EsqueletoLista() {
  return (
    <div role="status" aria-label="Cargando" className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
        <div className="space-y-2">
          <Esqueleto className="h-3 w-16" />
          <Esqueleto className="h-6 w-56" />
        </div>
        <div className="flex gap-2">
          <Esqueleto className="h-9 w-24" />
          <Esqueleto className="h-9 w-20" />
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Esqueleto className="size-4" />
            <Esqueleto className="h-3.5 w-40" />
            <Esqueleto className="h-3.5 w-32" />
            <Esqueleto className="hidden h-3.5 w-28 md:block" />
            <Esqueleto className="hidden h-3.5 w-36 lg:block" />
            <Esqueleto className="ml-auto h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mientras carga la ficha de un registro. */
export function EsqueletoFicha() {
  return (
    <div role="status" aria-label="Cargando" className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <Esqueleto className="size-11" />
          <div className="space-y-2">
            <Esqueleto className="h-3 w-16" />
            <Esqueleto className="h-6 w-60" />
          </div>
          <div className="ml-auto flex gap-2">
            <Esqueleto className="h-9 w-24" />
            <Esqueleto className="h-9 w-28" />
          </div>
        </div>
        <div className="mt-5 flex gap-10">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Esqueleto className="h-3 w-16" />
              <Esqueleto className="h-4 w-28" />
            </div>
          ))}
        </div>
        <Esqueleto className="mt-5 h-9 w-full rounded-full" />
      </div>
      <TarjetaEsqueleto filas={6} />
    </div>
  );
}
