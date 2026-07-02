#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${WORKDIR:-/workspace/mobtranslate-training}"
VENV="${VENV:-/workspace/venvs/mobtranslate-mt}"

mkdir -p "$WORKDIR" "$(dirname "$VENV")"
cd "$WORKDIR"

export PIP_NO_CACHE_DIR="${PIP_NO_CACHE_DIR:-1}"

python -m venv --system-site-packages "$VENV"
source "$VENV/bin/activate"
python - <<'PY'
import torch
print("base torch", torch.__version__)
print("base cuda available", torch.cuda.is_available())
if torch.cuda.is_available():
    print("base gpu", torch.cuda.get_device_name(0))
PY
python -m pip install --upgrade pip
python -m pip install --upgrade-strategy only-if-needed -r requirements.txt

python - <<'PY'
import torch
print("torch", torch.__version__)
print("cuda available", torch.cuda.is_available())
if torch.cuda.is_available():
    print("gpu", torch.cuda.get_device_name(0))
    print("capability", torch.cuda.get_device_capability(0))
PY
