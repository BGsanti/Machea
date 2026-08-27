import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MapPin, Phone, PhoneCall, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { getCatalogos, llamar, MacheaApiError, recomendar, type Apartamento, type Localidad } from "../lib/api";
import { LOCALIDADES, SALARIO_OPCIONES, ZONAS_COMUNES_POPULARES } from "../lib/catalogos";
import { Reveal } from "./Reveal";

function formatCop(value: number) {
  return `$${value.toLocaleString("es-CO")}`;
}

function OptionRow<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-navy">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
              value === opt.value
                ? "border-coral bg-coral text-white"
                : "border-navy/15 bg-white text-navy/70 hover:border-coral/40"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LiveDemo() {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipoVivienda, setTipoVivienda] = useState<0 | 1 | null>(1);
  const [salario, setSalario] = useState<1 | 2 | 3 | 4 | null>(null);
  const [personas, setPersonas] = useState<1 | 2 | 3 | 4 | null>(null);
  const [edad, setEdad] = useState("");
  const [localidad, setLocalidad] = useState<number | null>(null);
  const [habitaciones, setHabitaciones] = useState<1 | 2 | 3 | null>(null);
  const [afiliado, setAfiliado] = useState<0 | 1 | null>(null);
  const [zonas, setZonas] = useState<string[]>([]);

  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [resultados, setResultados] = useState<Apartamento[]>([]);
  const [busqueda, setBusqueda] = useState<{ tipo_vivienda: string; localidad: string } | null>(null);

  const [callStatus, setCallStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [callMsg, setCallMsg] = useState("");

  // Confirma que la API local está viva apenas alguien abre el form — evita que
  // el primer error que vea el usuario sea uno de red a mitad del formulario.
  const [apiUp, setApiUp] = useState<boolean | null>(null);
  const checkApi = () => {
    if (apiUp !== null) return;
    getCatalogos()
      .then(() => setApiUp(true))
      .catch(() => setApiUp(false));
  };

  const toggleZona = (z: string) => {
    setZonas((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));
  };

  const listo = tipoVivienda !== null && salario && personas && edad && localidad && habitaciones;

  const handleSubmit = async () => {
    if (!listo) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const respuesta = await recomendar({
        tipo_vivienda: tipoVivienda!,
        salario: salario!,
        personas_a_cargo: personas!,
        edad: Number(edad),
        Localidad: localidad!,
        numero_habitaciones: habitaciones!,
        ...(afiliado !== null ? { afiliado } : {}),
        ...(zonas.length > 0 ? { zonas_comunes: zonas } : {}),
      });
      setResultados(respuesta.apartamentos.slice(0, 3));
      setBusqueda(respuesta.usuario.busqueda);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err instanceof MacheaApiError ? err.message : "Algo salió mal. Intenta de nuevo.");
      setStatus("error");
    }
  };

  const rangoIngresoLabel = SALARIO_OPCIONES.find((o) => o.value === salario)?.label ?? "";

  const handleLlamar = async () => {
    const top = resultados[0];
    if (!top || !nombre || !telefono) return;
    setCallStatus("loading");
    setCallMsg("");
    try {
      const respuesta = await llamar({
        nombre,
        telefono,
        afiliado: afiliado === 1,
        rango_ingreso: rangoIngresoLabel,
        edad: Number(edad),
        personas_a_cargo: personas ?? 1,
        entorno_deseado: zonas.join(", "),
        apartamento: {
          nombre_proyecto: top.nombre_proyecto,
          localidad: top.localidad,
          tipo_vivienda: top.tipo_vivienda,
          precio_desde_cop: top.precio_desde_cop,
          cuota_mensual_estimada_cop: top.cuota_mensual_estimada_cop,
          zonas_comunes: top.zonas_comunes,
          zonas_en_comun: top.zonas_en_comun,
          url_ficha: top.url_ficha,
          posicion: top.posicion,
          compatibilidad: top.compatibilidad,
          compatibilidad_texto: top.compatibilidad_texto,
          direccion: top.direccion,
          area_construida_m2: top.area_construida_m2,
          habitaciones: top.habitaciones,
          cumple_habitaciones: top.cumple_habitaciones,
          aplica_subsidio_caja: top.aplica_subsidio_caja,
        },
      });
      setCallMsg(
        respuesta.status === "enviado"
          ? "¡Manuela te está llamando! Contesta en los próximos segundos."
          : respuesta.detalle ?? "Simulado — falta conectar el webhook de Dapta."
      );
      setCallStatus("done");
    } catch (err) {
      setCallMsg(err instanceof MacheaApiError ? err.message : "No pudimos iniciar la llamada.");
      setCallStatus("error");
    }
  };

  const localidadesUi: Localidad[] = LOCALIDADES;

  return (
    <section className="relative bg-beige py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-coral">Pruébalo tú mismo</p>
          <h2 className="text-4xl font-extrabold text-navy md:text-5xl">El motor real, en vivo.</h2>
          <p className="mt-4 text-lg text-navy/70">
            Llena el formulario que vería un lead y mira el Top 3 real que devuelve nuestro motor sobre los
            96 proyectos del catálogo — no una simulación.
          </p>
        </Reveal>

        <Reveal
          delay={0.1}
          className="grid gap-8 rounded-3xl border border-navy/10 bg-white p-6 shadow-soft md:p-10 lg:grid-cols-2"
        >
          <div className="space-y-6" onFocus={checkApi} onClick={checkApi}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-bold text-navy">Tu nombre</p>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. Camila"
                  className="w-full rounded-xl border border-navy/15 px-3.5 py-2 text-sm font-semibold text-navy focus:border-coral focus:outline-none"
                />
              </div>
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-navy">
                  <Phone size={14} /> Tu celular
                </p>
                <input
                  type="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej. 3125923915"
                  className="w-full rounded-xl border border-navy/15 px-3.5 py-2 text-sm font-semibold text-navy focus:border-coral focus:outline-none"
                />
              </div>
            </div>
            <p className="-mt-3 text-xs text-navy/40">
              Con esto, si quieres, Manuela te puede llamar de verdad al terminar para que sientas cómo suena.
            </p>

            <OptionRow
              label="¿Qué tipo de vivienda buscas?"
              value={tipoVivienda}
              onChange={setTipoVivienda}
              options={[
                { value: 1, label: "VIS" },
                { value: 0, label: "No VIS" },
              ]}
            />
            <OptionRow
              label="¿Cuánto ganas al mes?"
              value={salario}
              onChange={setSalario}
              options={SALARIO_OPCIONES.map((o) => ({ value: o.value as 1 | 2 | 3 | 4, label: o.label }))}
            />
            <OptionRow
              label="¿Cuántas personas viven contigo?"
              value={personas}
              onChange={setPersonas}
              options={[
                { value: 1, label: "1" },
                { value: 2, label: "2" },
                { value: 3, label: "3" },
                { value: 4, label: "4 o más" },
              ]}
            />
            <div>
              <p className="mb-2 text-sm font-bold text-navy">¿Cuántos años tienes?</p>
              <input
                type="number"
                min={18}
                max={99}
                value={edad}
                onChange={(e) => setEdad(e.target.value)}
                placeholder="Ej. 34"
                className="w-32 rounded-xl border border-navy/15 px-3.5 py-2 text-sm font-semibold text-navy focus:border-coral focus:outline-none"
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-navy">¿En qué localidad quieres vivir?</p>
              <select
                value={localidad ?? ""}
                onChange={(e) => setLocalidad(Number(e.target.value))}
                className="w-full rounded-xl border border-navy/15 bg-white px-3.5 py-2.5 text-sm font-semibold text-navy focus:border-coral focus:outline-none"
              >
                <option value="" disabled>
                  Selecciona una localidad
                </option>
                {localidadesUi.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </div>
            <OptionRow
              label="¿Cuántas habitaciones necesitas?"
              value={habitaciones}
              onChange={setHabitaciones}
              options={[
                { value: 1, label: "1" },
                { value: 2, label: "2" },
                { value: 3, label: "3 o más" },
              ]}
            />
            <OptionRow
              label="¿Estás afiliado a una caja de compensación?"
              value={afiliado}
              onChange={setAfiliado}
              options={[
                { value: 1, label: "Sí" },
                { value: 0, label: "No" },
              ]}
            />
            <div>
              <p className="mb-2 text-sm font-bold text-navy">¿Qué zonas comunes te importan?</p>
              <div className="flex flex-wrap gap-2">
                {ZONAS_COMUNES_POPULARES.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => toggleZona(z)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      zonas.includes(z)
                        ? "border-emerald bg-emerald/15 text-emerald-700"
                        : "border-navy/15 bg-white text-navy/60 hover:border-emerald/40"
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </div>

            <motion.button
              type="button"
              disabled={!listo || status === "loading"}
              onClick={handleSubmit}
              whileHover={listo ? { y: -2 } : {}}
              whileTap={listo ? { scale: 0.97 } : {}}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-coral px-6 py-3.5 text-base font-bold text-white shadow-coral disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "loading" ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Consultando el motor…
                </>
              ) : (
                <>
                  <Sparkles size={18} /> Ver mi Top 3 real
                </>
              )}
            </motion.button>

            {apiUp === false && (
              <p className="flex items-center gap-1.5 text-xs text-red-500">
                <TriangleAlert size={13} /> No detectamos la API local (uvicorn api:app --port 8000). Enciéndela
                para ver resultados en vivo.
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-navy p-6 text-white md:p-7">
            <AnimatePresence mode="wait">
              {status === "idle" && (
                <motion.div key="idle" className="flex h-full flex-col items-center justify-center text-center text-white/50">
                  <Sparkles size={28} className="mb-3" />
                  <p className="text-sm">Llena el formulario y presiona el botón para ver el Top 3 real.</p>
                </motion.div>
              )}
              {status === "loading" && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/70"
                >
                  <Loader2 size={28} className="animate-spin text-coral" />
                  <p className="text-sm">Corriendo el filtro duro + Nearest Neighbors sobre el catálogo…</p>
                </motion.div>
              )}
              {status === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex h-full flex-col items-center justify-center gap-3 text-center"
                >
                  <TriangleAlert size={28} className="text-coral" />
                  <p className="max-w-xs text-sm text-white/70">{errorMsg}</p>
                </motion.div>
              )}
              {status === "done" && (
                <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  {busqueda && (
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-white/40">
                      {busqueda.tipo_vivienda} en {busqueda.localidad}
                    </p>
                  )}
                  {resultados.map((apto, i) => (
                    <motion.a
                      key={apto.nombre_proyecto + i}
                      href={apto.url_ficha}
                      target="_blank"
                      rel="noreferrer"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      whileHover={{ y: -2 }}
                      className="block rounded-xl border border-white/10 bg-white/5 p-3.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-white">{apto.nombre_proyecto}</span>
                        <span className="shrink-0 rounded-full bg-emerald px-2 py-0.5 text-xs font-extrabold text-navy">
                          {apto.compatibilidad_texto}
                        </span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-white/60">
                        <MapPin size={12} /> {apto.localidad} · desde {formatCop(apto.precio_desde_cop)}
                      </p>
                      {apto.zonas_en_comun.length > 0 && (
                        <p className="mt-1 text-xs text-white/40">En común: {apto.zonas_en_comun.join(", ")}</p>
                      )}
                    </motion.a>
                  ))}

                  <div className="pt-2">
                    {callStatus === "idle" || callStatus === "error" ? (
                      <>
                        <motion.button
                          type="button"
                          disabled={!nombre || !telefono}
                          onClick={handleLlamar}
                          whileHover={nombre && telefono ? { y: -2 } : {}}
                          whileTap={nombre && telefono ? { scale: 0.97 } : {}}
                          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald px-6 py-3 text-sm font-extrabold text-navy disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <PhoneCall size={16} /> Llamar a mi celular ahora
                        </motion.button>
                        {(!nombre || !telefono) && (
                          <p className="mt-2 text-center text-xs text-white/40">
                            Escribe tu nombre y celular arriba para activarlo.
                          </p>
                        )}
                        {callStatus === "error" && (
                          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-red-300">
                            <TriangleAlert size={12} /> {callMsg}
                          </p>
                        )}
                      </>
                    ) : callStatus === "loading" ? (
                      <p className="flex items-center justify-center gap-2 text-sm font-semibold text-white/70">
                        <Loader2 size={16} className="animate-spin" /> Marcando…
                      </p>
                    ) : (
                      <p className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-emerald">
                        <PhoneCall size={16} /> {callMsg}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
