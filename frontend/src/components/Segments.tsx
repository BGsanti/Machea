import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { segmentos } from "../lib/segments";
import { Reveal, StaggerGroup, StaggerItem } from "./Reveal";

export function Segments() {
  return (
    <section id="para-ti" className="relative overflow-hidden bg-beige py-24">
      <div className="dot-field-c pointer-events-none absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
      <div className="signal-streak pointer-events-none -z-10" style={{ left: "12%", top: "-6%", animationDelay: "3.4s" }} aria-hidden="true" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-16 max-w-2xl text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-coral">¿Cuál eres tú?</p>
          <h2 className="mb-6 text-4xl font-extrabold text-navy md:text-5xl">
            Tres formas de vender vivienda. Machea funciona para las tres.
          </h2>
          <p className="text-xl text-navy/70">
            Encuéntrate en uno de los perfiles y mira exactamente qué cambia para tu operación.
          </p>
        </Reveal>

        <StaggerGroup className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {segmentos.map((s, i) => (
            <StaggerItem key={s.id}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className={`flex h-full flex-col rounded-3xl border p-7 shadow-soft ${
                  i === 1 ? "border-coral/30 bg-white ring-4 ring-coral/10" : "border-navy/8 bg-white"
                }`}
              >
                <span
                  className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${
                    i === 1 ? "bg-coral text-white" : "bg-navy/5 text-navy"
                  }`}
                >
                  <s.icon size={22} />
                </span>

                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-coral">{s.eyebrow}</p>
                <h3 className="mb-4 text-xl font-extrabold text-navy">{s.title}</h3>

                <p className="mb-5 rounded-xl bg-beige px-4 py-3 text-sm text-navy/60">
                  <span className="font-bold text-navy/80">Hoy: </span>
                  {s.pain}
                </p>

                <ul className="mb-6 flex-1 space-y-2.5">
                  {s.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-sm text-navy/75">
                      <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald/20 text-emerald-700">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      {b}
                    </li>
                  ))}
                </ul>

                <motion.a
                  href="#demos"
                  whileHover={{ x: 3 }}
                  className={`inline-flex items-center gap-1.5 text-sm font-bold ${
                    i === 1 ? "text-coral" : "text-navy"
                  }`}
                >
                  Este soy yo — quiero verlo <ArrowRight size={15} />
                </motion.a>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
}
