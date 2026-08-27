import { motion } from "framer-motion";
import {
  Bot,
  CalendarCheck,
  ClipboardList,
  MessageCircle,
  Sparkles,
  UserCheck,
  UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Reveal } from "./Reveal";

const W = 1000;
const H = 460;

type Node = {
  id: string;
  x: number;
  y: number;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  accent: "coral" | "navy" | "emerald" | "whatsapp";
};

const nodes: Node[] = [
  { id: "form", x: 90, y: 230, icon: ClipboardList, title: "Formulario inteligente", subtitle: "Toma de datos", accent: "navy" },
  { id: "match", x: 330, y: 230, icon: Sparkles, title: "Clustering · Match", subtitle: "Como Tinder", accent: "coral" },
  { id: "call", x: 570, y: 230, icon: Bot, title: "Llamada IA — Manuela", subtitle: "Instantánea", accent: "coral" },
  { id: "answers", x: 790, y: 110, icon: CalendarCheck, title: "Contesta", subtitle: "Califica y agenda", accent: "emerald" },
  { id: "whatsapp", x: 790, y: 350, icon: MessageCircle, title: "No contesta", subtitle: "Sigue por WhatsApp", accent: "whatsapp" },
  { id: "afiliado", x: 960, y: 60, icon: UserCheck, title: "Afiliado", subtitle: "", accent: "emerald" },
  { id: "no-afiliado", x: 960, y: 160, icon: UserX, title: "No afiliado", subtitle: "", accent: "navy" },
];

const edges: { id: string; d: string; color: string; delay: number }[] = [
  { id: "e1", d: `M90,230 L330,230`, color: "#FF6259", delay: 0 },
  { id: "e2", d: `M330,230 L570,230`, color: "#FF6259", delay: 0.5 },
  { id: "e3", d: `M570,230 C660,230 700,110 790,110`, color: "#2DD4A7", delay: 1 },
  { id: "e4", d: `M570,230 C660,230 700,350 790,350`, color: "#25D366", delay: 1 },
  { id: "e5", d: `M790,110 C860,110 890,60 960,60`, color: "#2DD4A7", delay: 1.6 },
  { id: "e6", d: `M790,110 C860,110 890,160 960,160`, color: "#2D3B4E", delay: 1.6 },
];

const accentClasses: Record<Node["accent"], string> = {
  coral: "border-coral/30 bg-white text-coral",
  navy: "border-navy/15 bg-white text-navy",
  emerald: "border-emerald/30 bg-white text-emerald-700",
  whatsapp: "border-[#25D366]/30 bg-white text-[#25D366]",
};

const iconBg: Record<Node["accent"], string> = {
  coral: "bg-coral text-white",
  navy: "bg-navy text-white",
  emerald: "bg-emerald text-navy",
  whatsapp: "bg-[#25D366] text-white",
};

export function FlowDiagram() {
  return (
    <section className="relative overflow-hidden bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto mb-14 max-w-2xl text-center">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-coral">De principio a fin</p>
          <h2 className="text-4xl font-extrabold text-navy md:text-5xl">Así fluye cada lead.</h2>
          <p className="mt-4 text-lg text-navy/70">
            Un solo flujo, sin intervención manual: del formulario al asesor, con la ruta correcta según cada
            respuesta.
          </p>
        </Reveal>

        <Reveal delay={0.1} className="overflow-x-auto">
          <div className="relative mx-auto min-w-[900px] max-w-5xl" style={{ aspectRatio: `${W} / ${H}` }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" fill="none">
              {edges.map((e) => (
                <g key={e.id}>
                  <path d={e.d} stroke={e.color} strokeOpacity={0.25} strokeWidth={2.5} />
                  <circle r={5} fill={e.color}>
                    <animateMotion dur="2.6s" begin={`${e.delay}s`} repeatCount="indefinite" path={e.d} />
                  </circle>
                </g>
              ))}
            </svg>

            {nodes.map((n, i) => {
              const Icon = n.icon;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, scale: 0.7 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: i * 0.12, type: "spring", stiffness: 260, damping: 18 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%` }}
                >
                  <div
                    className={`flex w-[168px] flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 text-center shadow-soft ${accentClasses[n.accent]}`}
                  >
                    <span className={`grid h-10 w-10 place-items-center rounded-xl ${iconBg[n.accent]}`}>
                      <Icon size={19} />
                    </span>
                    <div>
                      <p className="text-sm font-extrabold leading-tight text-navy">{n.title}</p>
                      {n.subtitle && <p className="mt-0.5 text-[11px] font-medium text-navy/50">{n.subtitle}</p>}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={0.2} className="mx-auto mt-8 max-w-2xl text-center text-sm text-navy/40">
          Desliza para ver el flujo completo en pantallas pequeñas.
        </Reveal>
      </div>
    </section>
  );
}
