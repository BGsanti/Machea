"""
api/horario.py
==============
Cuándo se puede llamar o escribir a una persona en Colombia. Lo usan Camila (api/captacion.py), Manuela
(/api/llamar) y el seguimiento por WhatsApp (api/seguimiento.py).

LEY 2300 DE 2023 (design/legal/LLAMADAS_LEY_2300.md): lunes a viernes de 7:00 a.m. a 7:00 p.m., sábados de 8:00 a.m. a
3:00 p.m. y nunca domingos ni festivos. Aplica también a llamadas y mensajes comerciales (art. 5, par. 3). Camila usa
un horario más estricto a propósito (VENTANAS_CAMILA).

Funciones puras: no leen variables de entorno ni tocan la red, así que se prueban con fechas fijas.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Dict, Optional, Tuple

TZ = timezone(timedelta(hours=-5))          # Colombia no tiene horario de verano

# (hora_inicio, hora_fin) en horas decimales, por día de la semana (0 = lunes). Domingo no aparece: no se llama.
VENTANAS_LEY_2300: Dict[int, Tuple[float, float]] = {
    0: (7.0, 19.0), 1: (7.0, 19.0), 2: (7.0, 19.0), 3: (7.0, 19.0), 4: (7.0, 19.0), 5: (8.0, 15.0)}
VENTANAS_CAMILA: Dict[int, Tuple[float, float]] = {
    0: (8.0, 18.0), 1: (8.0, 18.0), 2: (8.0, 18.0), 3: (8.0, 18.0), 4: (8.0, 18.0), 5: (9.0, 12.0)}

_DIAS = ("lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo")
_MESES = ("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
          "noviembre", "diciembre")


def _pascua(año: int) -> date:
    """Domingo de Pascua (algoritmo gregoriano anónimo)."""
    a, b, c = año % 19, año // 100, año % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = (h + l - 7 * m + 114) % 31 + 1
    return date(año, mes, dia)


def _lunes(d: date) -> date:
    """Ley Emiliani: el festivo pasa al lunes siguiente (el mismo día si ya es lunes)."""
    return d + timedelta(days=(7 - d.weekday()) % 7)


def festivos_colombia(año: int) -> set:
    p = _pascua(año)
    fijos = {date(año, 1, 1), date(año, 5, 1), date(año, 7, 20), date(año, 8, 7), date(año, 12, 8), date(año, 12, 25),
             p - timedelta(days=3), p - timedelta(days=2)}                                   # Jueves y Viernes Santo
    moviles = [date(año, 1, 6), date(año, 3, 19), date(año, 6, 29), date(año, 8, 15), date(año, 10, 12),
               date(año, 11, 1), date(año, 11, 11),
               p + timedelta(days=39), p + timedelta(days=60), p + timedelta(days=68)]      # Ascensión, Corpus, Sagrado Corazón
    return fijos | {_lunes(x) for x in moviles}


def es_festivo(d: date) -> bool:
    return d in festivos_colombia(d.year)


def ventana_permitida(ahora: Optional[datetime] = None,
                      ventanas: Dict[int, Tuple[float, float]] = VENTANAS_LEY_2300) -> Tuple[bool, str]:
    ahora = (ahora or datetime.now(TZ)).astimezone(TZ)
    if es_festivo(ahora.date()):
        return False, "festivo"
    v = ventanas.get(ahora.weekday())
    if not v:
        return False, "domingo"
    h = ahora.hour + ahora.minute / 60
    if h < v[0]:
        return False, "antes_de_hora"
    if h >= v[1]:
        return False, "despues_de_hora"
    return True, "ok"


def proxima_ventana(ahora: Optional[datetime] = None, ventanas: Dict[int, Tuple[float, float]] = VENTANAS_LEY_2300,
                    pausa_min: int = 0) -> datetime:
    """El primer instante dentro del horario a partir de `ahora`, con `pausa_min` minutos de margen al abrir."""
    ahora = (ahora or datetime.now(TZ)).astimezone(TZ)
    ok, _ = ventana_permitida(ahora, ventanas)
    if ok:
        return ahora
    for dias in range(0, 10):
        d = (ahora + timedelta(days=dias)).date()
        v = ventanas.get(d.weekday())
        if not v or es_festivo(d):
            continue
        apertura = datetime(d.year, d.month, d.day, int(v[0]), int((v[0] % 1) * 60), tzinfo=TZ) + timedelta(minutes=pausa_min)
        if apertura > ahora:
            return apertura
    return ahora + timedelta(days=1)


def describir(momento: datetime) -> str:
    """'el lunes 10 de noviembre a las 7:00 a. m.', para decírselo a la persona."""
    m = momento.astimezone(TZ)
    hora = m.hour % 12 or 12
    return (f"el {_DIAS[m.weekday()]} {m.day} de {_MESES[m.month - 1]} a las {hora}:{m.minute:02d} "
            f"{'a. m.' if m.hour < 12 else 'p. m.'}")
