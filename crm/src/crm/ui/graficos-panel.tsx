import clsx from "clsx";
import { Icono } from "@/ui/icono";

// Gráficos pequeños en SVG para el panel: sin librerías, sin JavaScript en el navegador (se dibujan en el servidor).

/** Línea con relleno suave y un punto en el último valor. */
export function Sparkline({ valores, className, color = "var(--color-marca-600)" }: { valores: number[]; className?: string; color?: string }) {
  const ancho = 120;
  const alto = 36;
  if (valores.length < 2) return <svg aria-hidden viewBox={`0 0 ${ancho} ${alto}`} className={className} />;
  const max = Math.max(1, ...valores);
  const paso = ancho / (valores.length - 1);
  const puntos = valores.map((v, i) => [i * paso, alto - 4 - (v / max) * (alto - 10)] as const);
  const linea = puntos.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${linea} L${ancho},${alto} L0,${alto} Z`;
  const [ux, uy] = puntos[puntos.length - 1]!;
  const id = `sp-${valores.length}-${Math.round(max)}-${Math.round(valores[valores.length - 1]!)}`;
  return (
    <svg aria-hidden viewBox={`0 0 ${ancho} ${alto}`} className={className} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={linea} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ux} cy={uy} r="2.6" fill={color} />
    </svg>
  );
}

/** Anillo de porcentaje (0–100) con el valor al centro. */
export function Anillo({ pct, tamano = 64, color = "var(--color-marca-600)", children }: { pct: number | null; tamano?: number; color?: string; children?: React.ReactNode }) {
  const grosor = 7;
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const valor = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} aria-hidden className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="currentColor" strokeWidth={grosor} className="text-slate-100" />
        <circle
          cx={tamano / 2}
          cy={tamano / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={grosor}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - valor / 100)}
          className="anillo-relleno"
          style={{ ["--anillo-largo" as string]: c }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-800">{children}</div>
    </div>
  );
}

/**
 * Cuánto cambió respecto al periodo anterior. `mejorSiSube`: false para cosas donde bajar es bueno (el tiempo de
 * respuesta). Sin dato anterior no muestra nada.
 */
export function Variacion({ actual, antes, mejorSiSube = true, puntos = false }: { actual: number | null; antes: number | null; mejorSiSube?: boolean; puntos?: boolean }) {
  // Sin periodo anterior con qué comparar (empresa nueva) no se inventa una tendencia.
  if (actual === null || antes === null || (antes === 0 && !puntos)) return null;
  const dif = actual - antes;
  if (Math.abs(dif) < 0.5 && !puntos) return <span className="text-[11px] text-slate-400">igual que antes</span>;
  const sube = dif > 0;
  const bueno = sube === mejorSiSube;
  let texto: string;
  if (puntos) texto = `${sube ? "+" : ""}${Math.round(dif)} pts`;
  else texto = `${sube ? "+" : ""}${Math.round((dif / antes) * 100)}%`;
  if (puntos && Math.abs(dif) < 0.5) return <span className="text-[11px] text-slate-400">igual que antes</span>;
  return (
    <span className={clsx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold", bueno ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
      <Icono nombre={sube ? "TrendingUp" : "TrendingDown"} className="size-3" />
      {texto}
    </span>
  );
}

/** Minutos como texto corto: «<1 min», «12 min», «2 h 5 min», «3 d». */
export function duracionCorta(min: number | null): string {
  if (min === null) return "—";
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 24 * 60) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${Math.round(min / 1440)} d`;
}

/** Barra horizontal con su valor; `max` es el valor que llena la barra. */
export function BarraValor({ valor, max, color = "bg-marca-500", className }: { valor: number; max: number; color?: string; className?: string }) {
  return (
    <div aria-hidden className={clsx("h-1.5 overflow-hidden rounded-full bg-slate-100", className)}>
      <div className={clsx("h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0}%` }} />
    </div>
  );
}
