#!/usr/bin/env bash
# Activa los hooks del repositorio (hoy: el escáner de secretos antes de cada commit). Se corre una vez por clon.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
chmod +x scripts/seguridad/hooks/pre-commit scripts/seguridad/escanear-secretos.py
git config core.hooksPath scripts/seguridad/hooks
echo "Listo: antes de cada commit se revisan las llaves y contraseñas."
