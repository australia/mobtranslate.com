#!/usr/bin/env bash
set -euo pipefail

KIT_ROOT="${KIT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
VENV="${VENV:-$KIT_ROOT/.venv}"

if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv --system-site-packages "$VENV"
fi
"$VENV/bin/python" -m pip install --disable-pip-version-check --no-cache-dir \
  -r "$KIT_ROOT/requirements.lock"

export KIT_ROOT
export PYTHON="$VENV/bin/python"
exec "$KIT_ROOT/run_benchmark.sh" "$@"
