/**
 * Zona horaria del negocio. Se fija explícitamente para que el servidor (que puede
 * estar en UTC) y el navegador calculen el mismo "hoy" y muestren las mismas horas.
 */
export const ZONA_HORARIA = process.env.NEXT_PUBLIC_ZONA_HORARIA ?? "America/Bogota";

const partes = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_HORARIA,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function enZona(d: Date): { a: number; m: number; d: number; h: number; min: number; s: number } {
  const p = Object.fromEntries(partes.formatToParts(d).map((x) => [x.type, x.value]));
  return { a: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, min: Number(p.minute), s: Number(p.second) };
}

const dos = (n: number) => String(n).padStart(2, "0");

/** Fecha AAAA-MM-DD en la zona del negocio. */
export function fechaLocal(fecha: Date = new Date()): string {
  const z = enZona(fecha);
  return `${z.a}-${dos(z.m)}-${dos(z.d)}`;
}

/** "AAAA-MM-DDTHH:mm" en la zona del negocio, el formato de un <input type="datetime-local">. */
export function aHoraLocal(fecha: Date): string {
  const z = enZona(fecha);
  return `${z.a}-${dos(z.m)}-${dos(z.d)}T${dos(z.h)}:${dos(z.min)}`;
}

/** Diferencia en milisegundos entre la hora de la zona y UTC en un instante. */
function desfase(fecha: Date): number {
  const z = enZona(fecha);
  return Date.UTC(z.a, z.m - 1, z.d, z.h, z.min, z.s) - Math.floor(fecha.getTime() / 1000) * 1000;
}

/** Interpreta "AAAA-MM-DDTHH:mm" como hora de la zona del negocio. */
export function desdeHoraLocal(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(texto);
  if (!m) return null;
  const comoUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let instante = comoUtc - desfase(new Date(comoUtc));
  const corregido = comoUtc - desfase(new Date(instante));
  if (corregido !== instante) instante = corregido;
  return new Date(instante);
}

/** Suma días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias, 12)).toISOString().slice(0, 10);
}

/** Fecha AAAA-MM-DD de hoy más `dias` días, en la zona del negocio. */
export function hoyMas(dias: number): string {
  return sumarDias(fechaLocal(), dias);
}

/** Primer día del mes actual (AAAA-MM-01) en la zona del negocio. */
export function inicioMes(): string {
  return `${fechaLocal().slice(0, 7)}-01`;
}

/** Día de la semana (0 = domingo) de una fecha AAAA-MM-DD. */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}
