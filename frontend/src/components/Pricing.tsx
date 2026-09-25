import { motion } from "framer-motion";
import { Check, Minus } from "lucide-react";
import { macheaOffer } from "../lib/offerConfig";
import { planes } from "../lib/pricing";
import { Reveal, StaggerGroup, StaggerItem } from "./Reveal";

export function Pricing() {
  return (
    <section id="precios" className="relative overflow-hidden bg-navy py-24">
      <div className="star-field pointer-events-none absolute inset-0 -z-10 opacity-40" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.06)_0%,_transparent_60%)]" aria-hidden="true" />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 top-10 -z-10 h-96 w-96 rounded-full bg-coral/15 blur-3xl"
        animate={{ x: [0, -22, 0], y: [0, 18, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-coral">Precios</p>
          <h2 className="mb-6 text-4xl font-extrabold text-white md:text-5xl">
            Un plan que crece con tu operación.
          </h2>
          <p className="text-xl text-white/70">
            Sin contratos eternos. Empiezas con una auditoría y un piloto sin costo — el resto se cotiza según
            cuántos leads maneja tu operación.
          </p>
        </Reveal>

        <StaggerGroup className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
          {planes.map((plan) => (
            <StaggerItem key={plan.id}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className={`relative flex h-full flex-col rounded-3xl border p-8 ${
                  plan.destacado
                    ? "border-coral bg-white shadow-[0_30px_70px_-20px_rgba(255,98,89,0.45)] lg:-mt-4 lg:mb-4"
                    : "border-white/10 bg-white/5 backdrop-blur-sm"
                }`}
              >
                {plan.destacado && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-coral px-4 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-coral">
                    Más popular
                  </span>
                )}

                <h3 className={`text-lg font-extrabold ${plan.destacado ? "text-navy" : "text-white"}`}>
                  {plan.nombre}
                </h3>
                <p className={`mt-2 text-sm ${plan.destacado ? "text-navy/60" : "text-white/60"}`}>{plan.tagline}</p>

                <div className="mt-6 mb-1">
                  <span className={`text-4xl font-extrabold ${plan.destacado ? "text-navy" : "text-white"}`}>
                    {plan.precio}
                  </span>
                </div>
                <p className={`mb-7 text-xs font-semibold uppercase tracking-wide ${plan.destacado ? "text-coral" : "text-emerald"}`}>
                  {plan.precioNota}
                </p>

                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f.text}
                      className={`flex items-start gap-2.5 text-sm ${
                        f.incluido
                          ? plan.destacado
                            ? "text-navy/80"
                            : "text-white/80"
                          : plan.destacado
                            ? "text-navy/35"
                            : "text-white/35"
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full ${
                          f.incluido ? "bg-emerald/20 text-emerald-600" : "bg-white/5 text-white/30"
                        }`}
                      >
                        {f.incluido ? <Check size={11} strokeWidth={3} /> : <Minus size={11} strokeWidth={3} />}
                      </span>
                      {f.text}
                    </li>
                  ))}
                </ul>

                <motion.a
                  href="#oferta"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 350, damping: 20 }}
                  className={`block rounded-full px-6 py-3.5 text-center text-sm font-extrabold ${
                    plan.destacado
                      ? "bg-coral text-white shadow-coral"
                      : "border border-white/20 text-white hover:bg-white/10"
                  }`}
                >
                  {plan.ctaText}
                </motion.a>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>

        <Reveal delay={0.15} className="mx-auto mt-10 max-w-2xl text-center text-sm text-white/40">
          {macheaOffer.guarantee.text}
        </Reveal>
      </div>
    </section>
  );
}
