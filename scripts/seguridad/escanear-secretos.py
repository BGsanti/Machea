#!/usr/bin/env python3
"""Busca llaves, contraseñas y tokens en el repositorio sin imprimir nunca el valor completo.

    python3 scripts/seguridad/escanear-secretos.py                # archivos versionados
    python3 scripts/seguridad/escanear-secretos.py --historial    # además, TODO el historial de git (todas las ramas)
    python3 scripts/seguridad/escanear-secretos.py --staged       # solo lo que está por confirmarse (lo usa el hook pre-commit)

Termina con código 1 si encuentra algo CRÍTICO (llave service_role, llave privada, token de GitHub/AWS/Slack/Stripe,
dirección de base de datos con contraseña real). Lo demás se muestra como aviso. Para permitir una línea a propósito
(un ejemplo, una prueba), agregue en ella el texto «seguridad: permitido».

Importante: si algo CRÍTICO ya estuvo en el historial, borrarlo del código NO basta: el repositorio es público y esa
llave ya se debe dar por vista. Se cambia la llave (ver docs/seguridad.md, «Si se filtra una llave»).
"""
import base64
import json
import re
import subprocess
import sys

RAIZ = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True).stdout.strip() or "."

# (nombre, expresión, crítico)
PATRONES = [
    ("JWT", r"eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}", False),
    ("llave sk-/sb_secret", r"\b(sk-[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]{16,})", True),
    ("dirección de base con contraseña", r"postgres(?:ql)?(?:\+\w+)?://[^\s:'\"@/]+:[^\s'\"@]{3,}@[^\s'\"]+", True),
    ("token de GitHub", r"\b(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|gho_[A-Za-z0-9]{30,}|ghs_[A-Za-z0-9]{30,})", True),
    ("llave de AWS", r"\bAKIA[0-9A-Z]{16}\b", True),
    ("token de Slack", r"\bxox[baprs]-[A-Za-z0-9-]{10,}", True),
    ("llave de Google", r"\bAIza[0-9A-Za-z_-]{35}\b", True),
    ("llave privada", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----", True),
    ("llave de Stripe", r"\b(sk|rk)_live_[A-Za-z0-9]{16,}", True),
    ("asignación sospechosa", r"(?i)\b(api[_-]?key|secret|passw(?:or)?d|token|clave)\b['\"]?\s*[:=]\s*['\"][A-Za-z0-9_\-+/=.]{20,}['\"]", False),
    ("secreto en una URL (?k=, ?key=…)", r"[?&](k|key|token|secret)=[A-Za-z0-9_\-]{20,}", False),
    ("Bearer", r"(?i)\bbearer\s+[A-Za-z0-9._\-]{25,}", False),
]
COMPILADOS = [(n, re.compile(rx), c) for n, rx, c in PATRONES]
RUIDO = re.compile(r"(example|ejemplo|tu[-_ ]?clave|your[-_ ]|xxxx|\*\*\*|<[^>]+>|\$\{|process\.env|os\.environ|placeholder|changeme|dummy|prueba|test[-_]?key|solo-para|no-usar|desarrollo|seguridad: permitido)", re.I)
PALABRA_DE_EJEMPLO = re.compile(r"(clave|contrase(ñ|n)a|password|pass|secret|secreto|tu_?clave|\*+|\.{3,}|x{3,}|<.*>)", re.I)
BINARIO = re.compile(r"\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|pdf|zip|mp4|svg)$", re.I)
SALTAR = ("pnpm-lock", "package-lock", "yarn.lock")


def mascara(s):
    return f"{s[:4]}…({len(s)} car.)"


def clasificar(nombre, valor):
    if nombre != "JWT":
        return nombre, None
    try:
        carga = valor.split(".")[1]
        carga += "=" * (-len(carga) % 4)
        rol = json.loads(base64.urlsafe_b64decode(carga)).get("role", "?")
    except Exception:
        return "JWT (no se pudo leer)", None
    if rol == "service_role":
        return "JWT rol=service_role", True
    return f"JWT rol={rol} (la anon es pública por diseño)", False


def revisar(linea, ubic, hallazgos):
    if "seguridad: permitido" in linea:
        return
    for nombre, rx, critico in COMPILADOS:
        for m in rx.finditer(linea):
            valor = m.group(0)
            if RUIDO.search(valor) or RUIDO.search(linea[:200]):
                continue
            if nombre == "dirección de base con contraseña":
                clave = valor.split("://", 1)[1].split("@", 1)[0].split(":", 1)[-1]
                if len(clave) < 8 or PALABRA_DE_EJEMPLO.fullmatch(clave):
                    continue                       # «usuario:clave@localhost»: un ejemplo, no una clave
            etiqueta, critico_jwt = clasificar(nombre, valor)
            hallazgos.setdefault((etiqueta, valor, critico if critico_jwt is None else critico_jwt), []).append(ubic)


def escanear_arbol(hallazgos, solo_staged):
    if solo_staged:
        diff = subprocess.run(["git", "diff", "--cached", "-U0", "--no-color", "--text"], capture_output=True, text=True, errors="ignore", cwd=RAIZ).stdout
        archivo = "?"
        for linea in diff.splitlines():
            if linea.startswith("+++ b/"):
                archivo = linea[6:]
            elif linea.startswith("+") and not linea.startswith("+++") and not BINARIO.search(archivo) and not archivo.endswith(SALTAR):
                revisar(linea[1:], f"(por confirmar) {archivo}", hallazgos)
        return
    for f in subprocess.run(["git", "ls-files"], capture_output=True, text=True, cwd=RAIZ).stdout.splitlines():
        if BINARIO.search(f) or f.endswith(SALTAR) or f.startswith("scripts/seguridad/"):
            continue
        try:
            texto = open(f"{RAIZ}/{f}", encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        if len(texto) > 3_000_000:
            continue
        for n, linea in enumerate(texto.splitlines(), 1):
            if len(linea) <= 4000:
                revisar(linea, f"{f}:{n}", hallazgos)


def escanear_historial(hallazgos):
    p = subprocess.Popen(
        ["git", "log", "--all", "-p", "-U0", "--no-color", "--text", "--format=@@COMMIT %h"],
        stdout=subprocess.PIPE, text=True, errors="ignore", cwd=RAIZ, stderr=subprocess.DEVNULL,
    )
    commit, archivo = "?", "?"
    for linea in p.stdout:
        if linea.startswith("@@COMMIT "):
            commit = linea.split()[1]
        elif linea.startswith("+++ b/"):
            archivo = linea[6:].strip()
        elif linea.startswith("+") and not linea.startswith("+++") and len(linea) <= 4000:
            if BINARIO.search(archivo) or archivo.endswith(SALTAR) or archivo.startswith("scripts/seguridad/"):
                continue
            revisar(linea[1:], f"{commit}:{archivo}", hallazgos)


def informe(titulo, hallazgos):
    criticos = {k: v for k, v in hallazgos.items() if k[2]}
    print(f"\n== {titulo}: {len(hallazgos)} hallazgos ({len(criticos)} críticos) ==")
    for (etiqueta, valor, critico), ubics in sorted(hallazgos.items(), key=lambda kv: (not kv[0][2], kv[0][0])):
        u = sorted(set(ubics))
        print(f"  {'CRÍTICO' if critico else 'aviso  '} [{etiqueta}] {mascara(valor)} · {len(u)} sitio(s), p. ej. {u[0]}")
    return len(criticos)


def main():
    args = set(sys.argv[1:])
    arbol = {}
    escanear_arbol(arbol, "--staged" in args)
    malos = informe("Archivos" if "--staged" not in args else "Por confirmar", arbol)
    if "--historial" in args:
        historial = {}
        escanear_historial(historial)
        malos += informe("Historial completo", historial)
    if malos:
        print("\nHay hallazgos CRÍTICOS. No continúe: cambie la llave y lea docs/seguridad.md.")
        sys.exit(1)
    print("\nSin hallazgos críticos.")


if __name__ == "__main__":
    main()
