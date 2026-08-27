import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Bolt, Clock, MapPin } from "lucide-react";
import { useState } from "react";
import { demos } from "../lib/content";
import { Reveal, StaggerGroup, StaggerItem } from "./Reveal";

function formatCop(value: number) {
  return `$${value.toLocaleString("es-CO")}`;
}

export function Demos() {
  const [activeId, setActiveId] = useState(demos[0].id);
  const active = demos.find((d) => d.id === activeId) ?? demos[0];

  return (
    <section id="como-funciona" className="relative overflow-hidden bg-white py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--color-beige)_0%,_white_55%)]" aria-hidden="true" />
      <div className="dot-field-c pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
      <div className="signal-streak pointer-events-none -z-10" style={{ left: "70%", top: "-8%", animationDelay: "6.8s" }} aria-hidden="true" />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-10 -z-10 h-96 w-96 rounded-full bg-coral/[0.06] blur-3xl"
        animate={{ x: [0, 26, 0], y: [0, -18, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 bottom-0 -z-10 h-[28rem] w-[28rem] rounded-full bg-emerald/[0.07] blur-3xl"
        animate={{ x: [0, -22, 0], y: [0, 16, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-16 max-w-3xl text-center">
          <h2 className="mb-6 text-4xl font-extrabold text-navy md:text-5xl">
            El fin de los formularios muertos.
          </h2>
          <p className="text-xl text-navy/70">
            Transformamos el tráfico de tu catálogo de proyectos en conversaciones reales, perfiladas al instante —
            sin pedirte que reconstruyas tu sitio ni migres tu CRM.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mx-auto mb-20 max-w-4xl">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="flex flex-col items-center gap-8 rounded-3xl border border-navy/10 bg-beige p-4 text-left shadow-soft md:flex-row md:p-8"
          >
            <div className="flex-1 space-y-3">
              <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-600">
                Proceso tradicional
              </span>
              <p className="flex items-start gap-2 text-navy/60">
                <Clock size={18} className="mt-0.5 shrink-0" />
                Formulario genérico + 24 horas de espera + llamada fría al lead equivocado.
              </p>
            </div>
            <div className="hidden h-24 w-px bg-navy/10 md:block" />
            <div className="flex-1 space-y-3">
              <span className="inline-block rounded-full bg-emerald/20 px-3 py-1 text-xs font-bold text-emerald-700">
                Con Machea
              </span>
              <p className="flex items-start gap-2 font-semibold text-navy">
                <Bolt size={18} className="mt-0.5 shrink-0 text-coral" />
                Perfilamiento interactivo + llamada de IA en 30s + asesor recibe lead calificado.
              </p>
            </div>
          </motion.div>
        </Reveal>

        <div id="demos" className="mt-16 scroll-mt-24">
          <Reveal className="mb-2 flex items-center justify-between">
            <h3 className="text-2xl font-bold text-navy">Explora las 5 demos de GO FEST</h3>
            <motion.span
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="hidden rounded-full bg-coral/10 px-3 py-1 text-sm font-semibold text-coral sm:inline-block"
            >
              Interactivo
            </motion.span>
          </Reveal>
          <Reveal delay={0.05} className="mb-8">
            <p className="text-sm text-navy/50">
              Tres de las rutas muestran un match real de nuestro motor de recomendación sobre 96 proyectos
              de Amarilo, Cusezar, Constructora Bolívar y Colsubsidio en Bogotá — no es texto de ejemplo.
            </p>
          </Reveal>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
            <StaggerGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {demos.map((demo) => {
                const Icon = demo.icon;
                const isActive = demo.id === activeId;
                return (
                  <StaggerItem key={demo.id}>
                    <motion.button
                      type="button"
                      onClick={() => setActiveId(demo.id)}
                      whileHover={{ y: -3, scale: 1.015 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 350, damping: 22 }}
                      className={`group w-full rounded-2xl border p-5 text-left transition-colors duration-200 ${
                        isActive
                          ? "border-coral/30 bg-coral/5 shadow-soft ring-2 ring-coral/15"
                          : "border-navy/10 bg-beige hover:border-coral/20 hover:shadow-soft"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <motion.span
                          animate={isActive ? { rotate: [0, -8, 8, 0] } : {}}
                          transition={{ duration: 0.5 }}
                          className={`grid h-11 w-11 place-items-center rounded-xl text-lg ${
                            isActive ? "bg-coral text-white" : "bg-coral/10 text-coral"
                          }`}
                        >
                          <Icon size={20} />
                        </motion.span>
                        <ArrowUpRight
                          size={16}
                          className={`mt-1 transition-transform duration-200 ${
                            isActive ? "text-coral" : "text-navy/30 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                          }`}
                        />
                      </div>
                      <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-navy/40">
                        {demo.route}
                      </p>
                      <h4 className="mt-1 text-base font-extrabold text-navy">{demo.title}</h4>
                    </motion.button>
                  </StaggerItem>
                );
              })}
            </StaggerGroup>

            <Reveal delay={0.2}>
              <div className="relative h-full overflow-hidden rounded-3xl bg-navy p-8 text-white md:p-10">
                <motion.div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-coral/20 blur-3xl"
                  animate={{ x: [0, -18, 0], y: [0, 14, 0] }}
                  transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                />
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="relative flex h-full flex-col"
                  >
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-coral text-white shadow-coral">
                      <active.icon size={26} />
                    </span>
                    <p className="mt-6 text-xs font-bold uppercase tracking-[0.15em] text-white/50">
                      {active.route} · {active.signal}
                    </p>
                    <h4 className="mt-2 text-2xl font-extrabold md:text-3xl">{active.title}</h4>
                    <p className="mt-4 max-w-md text-white/70">{active.description}</p>

                    {active.match && (
                      <motion.a
                        href={active.match.urlFicha}
                        target="_blank"
                        rel="noreferrer"
                        whileHover={{ y: -2 }}
                        className="mt-6 block max-w-md rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald">
                            Match real del modelo
                          </span>
                          <span className="rounded-full bg-emerald px-2.5 py-0.5 text-xs font-extrabold text-navy">
                            {active.match.compatibilidad}
                          </span>
                        </div>
                        <p className="mt-2 font-bold text-white">{active.match.proyecto}</p>
                        <p className="flex items-center gap-1.5 text-sm text-white/60">
                          <MapPin size={13} /> {active.match.localidad} · desde {formatCop(active.match.precioDesdeCop)}
                        </p>
                        <p className="mt-2 text-xs text-white/50">
                          Zonas en común: {active.match.zonasEnComun.join(", ")}
                        </p>
                      </motion.a>
                    )}

                    <div className="mt-auto flex items-center gap-3 pt-8 text-sm font-semibold text-emerald">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald" />
                      Manuela adapta la conversación a esta ruta en tiempo real.
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
