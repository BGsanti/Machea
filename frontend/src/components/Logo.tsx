type LogoProps = {
  size?: number;
  variant?: "color" | "mono";
  className?: string;
};

// Isotipo de Machea (casa con check de match y flecha ascendente), el mismo
// dibujo geometrico que #logo-mark en index.html y que favicon.svg: tres trazos
// de grosor fijo y dos piezas rellenas. Se mantiene igual en las tres partes.
const VIEW_BOX = "3 3 50.5 33.7";
const ASPECT = 50.5 / 33.7;

export function LogoMark({ size = 40, variant = "color", className = "" }: LogoProps) {
  const color = variant === "mono" ? "#FFFFFF" : "#FF6259";
  return (
    <svg
      width={size * ASPECT}
      height={size}
      viewBox={VIEW_BOX}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <g fill="none" stroke={color} strokeWidth={6} strokeLinejoin="miter" strokeMiterlimit={10}>
        <path d="M6 25.6 24.4 7.2 33.6 16.4" />
        <path d="M12 19.6V36.7" />
        <path d="M20.5 23.3 26.7 29.5 47.6 11.6" />
      </g>
      <path fill={color} d="M41.25 7.9 53.3 6 51 18.75Z M40 25 45.8 20.9V36.7H40Z" />
    </svg>
  );
}

export function Logo({ size = 40, variant = "color", className = "" }: LogoProps) {
  const textColor = variant === "mono" ? "text-white" : "text-navy";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} variant={variant} />
      <span className={`font-extrabold tracking-tight ${textColor}`} style={{ fontSize: size * 0.6 }}>
        machea
      </span>
    </div>
  );
}
