#!/usr/bin/env bash
set -euo pipefail

KIT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
OUTPUT_DIR=${1:-/workspace/wbv-v3-mixed-replay-screen-preflight-a1-output}
VENV=${WBV_VENV:-/workspace/wbv-v3-mixed-replay-screen-venv}
MINIMUM_FREE_KIB=$((20 * 1024 * 1024))

cd "$KIT_DIR"
sha256sum -c SHA256SUMS.kit

python3 - "$KIT_DIR/CONTRACT.json" <<'PY'
import json
import pathlib
import sys

contract = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if contract["runpod"]["paid_compute_authorized_by_user"] is not True:
    raise SystemExit("Paid GPU execution is not authorized by this immutable contract")
PY

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "NVIDIA runtime is unavailable" >&2
  exit 1
fi
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "Refusing existing output directory: $OUTPUT_DIR" >&2
  exit 1
fi
mkdir -p "$(dirname -- "$OUTPUT_DIR")"
AVAILABLE_KIB=$(df -Pk "$(dirname -- "$OUTPUT_DIR")" | awk 'NR == 2 {print $4}')
if (( AVAILABLE_KIB < MINIMUM_FREE_KIB )); then
  echo "Insufficient free disk: ${AVAILABLE_KIB} KiB available, ${MINIMUM_FREE_KIB} KiB required" >&2
  exit 1
fi

if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv --system-site-packages "$VENV"
  "$VENV/bin/pip" install --upgrade pip
  "$VENV/bin/pip" install -r requirements.lock
fi

"$VENV/bin/python" - <<'PY'
import torch

assert torch.cuda.is_available(), "PyTorch cannot see CUDA"
assert torch.__version__.split("+")[0] == "2.8.0", torch.__version__
assert torch.version.cuda == "12.8", torch.version.cuda
assert "A40" in torch.cuda.get_device_name(0), torch.cuda.get_device_name(0)
print(torch.cuda.get_device_name(0), torch.__version__, torch.version.cuda)
PY

export TOKENIZERS_PARALLELISM=false
export HF_HUB_DISABLE_XET=1
export PYTHONPATH="$KIT_DIR/code${PYTHONPATH:+:$PYTHONPATH}"

"$VENV/bin/python" "$KIT_DIR/code/run_experiment.py" \
  --kit-dir "$KIT_DIR" \
  --output-dir "$OUTPUT_DIR"

test -s "$OUTPUT_DIR/RUN-COMPLETE.json"
test -s "$OUTPUT_DIR/RESULT-MANIFEST.json"
