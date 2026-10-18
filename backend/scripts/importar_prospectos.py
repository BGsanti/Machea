"""Carga una lista de empresas (CSV) como prospectos del agente de captación (Camila).

  Revisar sin enviar nada:   python scripts/importar_prospectos.py empresas.csv --solo-validar
  Enviar a la API:           CAPTACION_API_KEY=... python scripts/importar_prospectos.py empresas.csv \
                                 --api https://machea-api.onrender.com

El CSV necesita las columnas «Nombre de la empresa» y «Teléfono / WhatsApp»; usa «Tipo» y «Ciudad» si existen
(es el formato de ~/Desktop/MACHEA/SCRAPING/empresas_objetivo.csv). La clave va por variable de entorno, nunca
como argumento (quedaría en el historial del terminal). Importar NO llama a nadie.
"""

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api.captacion import e164_co_lista  # noqa: E402


def leer(ruta):
    with open(ruta, newline="", encoding="utf-8-sig") as f:
        for fila in csv.DictReader(f):
            empresa = (fila.get("Nombre de la empresa") or fila.get("empresa") or "").strip()
            tel = (fila.get("Teléfono / WhatsApp") or fila.get("telefono") or "").strip()
            if empresa and tel:
                yield {"empresa": empresa, "telefono": tel, "tipo_empresa": (fila.get("Tipo") or fila.get("tipo_empresa") or "").strip() or None,
                       "ciudad": (fila.get("Ciudad") or fila.get("ciudad") or "").strip() or None,
                       "sitio": (fila.get("Sitio") or fila.get("sitio") or "").strip() or None, "origen": "lista_frio"}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--api", default="https://machea-api.onrender.com")
    ap.add_argument("--solo-validar", action="store_true", help="no envía nada: solo cuenta cuántos teléfonos sirven")
    a = ap.parse_args()

    filas = list(leer(a.csv))
    buenos = [f for f in filas if e164_co_lista(f["telefono"], f["ciudad"])]
    print(f"{len(filas)} filas con nombre y teléfono; {len(buenos)} con teléfono colombiano válido; {len(filas) - len(buenos)} descartadas.")
    for f in filas:
        if f not in buenos:
            print(f"  descartada: {f['empresa']} · {f['telefono']}")
    if a.solo_validar:
        return 0

    clave = os.environ.get("CAPTACION_API_KEY", "")
    if len(clave) < 24:
        print("Falta CAPTACION_API_KEY (24+ caracteres) en el entorno.", file=sys.stderr)
        return 2
    total = {"nuevos": 0, "repetidos": 0, "invalidos": 0}
    for i in range(0, len(buenos), 100):
        req = urllib.request.Request(a.api.rstrip("/") + "/api/captacion/importar", method="POST",
                                     data=json.dumps({"prospectos": buenos[i:i + 100]}).encode(),
                                     headers={"Content-Type": "application/json", "X-Captacion-Key": clave})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                res = json.load(r)
        except urllib.error.HTTPError as e:
            print(f"La API respondió {e.code}: {e.read()[:200].decode('utf-8', 'replace')}", file=sys.stderr)
            return 1
        for k in total:
            total[k] += res.get(k, 0)
        almacen = res.get("almacen")
    print(f"Listo: {total['nuevos']} nuevos, {total['repetidos']} repetidos, {total['invalidos']} inválidos (almacén: {almacen}).")
    if almacen == "memoria":
        print("OJO: el almacén es EN MEMORIA; se pierde al reiniciar Render. Fija SUPABASE_URL y SUPABASE_SERVICE_KEY para que quede guardado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
