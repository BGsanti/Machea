"""Pruebas del horario de la Ley 2300.   Desde backend/:  python -m unittest tests.test_horario -v"""

import os
import sys
import unittest
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import horario  # noqa: E402

TZ = horario.TZ


def dt(y, mes, d, h=10, mi=0):
    return datetime(y, mes, d, h, mi, tzinfo=TZ)


class TestLey2300(unittest.TestCase):
    def test_ventana(self):
        v = horario.ventana_permitida
        self.assertEqual(v(dt(2026, 11, 10, 7, 0)), (True, "ok"))             # martes 7:00 abre
        self.assertEqual(v(dt(2026, 11, 10, 6, 59)), (False, "antes_de_hora"))
        self.assertEqual(v(dt(2026, 11, 10, 18, 59)), (True, "ok"))
        self.assertEqual(v(dt(2026, 11, 10, 19, 0)), (False, "despues_de_hora"))  # 7:00 p. m. ya cerró
        self.assertEqual(v(dt(2026, 11, 14, 8, 0)), (True, "ok"))              # sábado 8:00
        self.assertEqual(v(dt(2026, 11, 14, 15, 0)), (False, "despues_de_hora"))  # sábado 3:00 p. m.
        self.assertEqual(v(dt(2026, 11, 15, 10, 0)), (False, "domingo"))
        self.assertEqual(v(dt(2026, 11, 16, 10, 0)), (False, "festivo"))       # lunes 16: Independencia de Cartagena

    def test_proxima_ventana(self):
        p = horario.proxima_ventana
        self.assertEqual(p(dt(2026, 11, 10, 21)), dt(2026, 11, 11, 7))        # martes de noche -> miércoles 7:00
        self.assertEqual(p(dt(2026, 11, 14, 16)), dt(2026, 11, 17, 7))        # sábado tarde -> salta domingo y festivo
        self.assertEqual(p(dt(2026, 11, 10, 11)), dt(2026, 11, 10, 11))       # dentro: es ahora mismo
        self.assertEqual(p(dt(2026, 11, 10, 21), pausa_min=5), dt(2026, 11, 11, 7, 5))

    def test_camila_sigue_con_su_horario(self):
        v = horario.ventana_permitida
        self.assertEqual(v(dt(2026, 11, 10, 7, 30), horario.VENTANAS_CAMILA), (False, "antes_de_hora"))
        self.assertEqual(v(dt(2026, 11, 14, 12, 30), horario.VENTANAS_CAMILA), (False, "despues_de_hora"))

    def test_festivos_2026(self):
        self.assertIn(date(2026, 11, 2), horario.festivos_colombia(2026))      # Todos los Santos, al lunes
        self.assertIn(date(2026, 11, 16), horario.festivos_colombia(2026))

    def test_describir(self):
        self.assertEqual(horario.describir(dt(2026, 11, 11, 7)), "el miércoles 11 de noviembre a las 7:00 a. m.")
        self.assertEqual(horario.describir(dt(2026, 11, 14, 14, 30)), "el sábado 14 de noviembre a las 2:30 p. m.")


if __name__ == "__main__":
    unittest.main()
