const data = params?.trigger?.body || {};
const raw = String(data.telefono || '').replace(/[\s\-]/g, '');
const valido = /^\+573[0-9]{9}$/.test(raw);

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIA_MS = 86400000;

function pascua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, mes - 1, dia);
}
// Ley Emiliani: el festivo pasa al lunes siguiente (el mismo día si ya es lunes)
function lunes(t) { const w = new Date(t).getUTCDay(); return t + ((8 - w) % 7) * DIA_MS; }
function festivos(y) {
  const p = pascua(y), s = new Set();
  [Date.UTC(y, 0, 1), Date.UTC(y, 4, 1), Date.UTC(y, 6, 20), Date.UTC(y, 7, 7), Date.UTC(y, 11, 8), Date.UTC(y, 11, 25), p - 3 * DIA_MS, p - 2 * DIA_MS].forEach((t) => s.add(t));
  [Date.UTC(y, 0, 6), Date.UTC(y, 2, 19), Date.UTC(y, 5, 29), Date.UTC(y, 7, 15), Date.UTC(y, 9, 12), Date.UTC(y, 10, 1), Date.UTC(y, 10, 11),
    p + 39 * DIA_MS, p + 60 * DIA_MS, p + 68 * DIA_MS].forEach((t) => s.add(lunes(t)));
  return s;
}

// current_time llega en hora de Colombia: AAAA-MM-DD HH:MM
let calendario = '';
const m = String(data.current_time || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
if (m) {
  const base = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const cache = {};
  const partes = [];
  for (let i = 0; i < 10; i++) {
    const t = base + i * DIA_MS, d = new Date(t), y = d.getUTCFullYear();
    cache[y] = cache[y] || festivos(y);
    const w = d.getUTCDay();
    let etiqueta = i === 0 ? 'hoy ' : i === 1 ? 'mañana ' : '';
    let txt = `${etiqueta}${DIAS[w]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
    if (cache[y].has(t)) txt += ' (festivo: no se agenda)';
    else if (w === 0) txt += ' (domingo: no se agenda)';
    partes.push(txt);
  }
  calendario = partes.join('; ');
}

// El prompt de Manuela lee {{current_time}} como su reloj y calcula con él el día de la semana (y a veces se equivoca).
// Se le entrega la hora junto con el calendario ya calculado, sin tocar su prompt.
const hora = String(data.current_time || '');
const reloj = calendario
  ? `${hora}. Calendario ya calculado (usa estos días de la semana tal cual, no los calcules; los domingos y festivos no se agenda): ${calendario}`
  : hora;

module.exports = { telefono_valido: valido, telefono: raw, calendario: calendario, reloj: reloj };
