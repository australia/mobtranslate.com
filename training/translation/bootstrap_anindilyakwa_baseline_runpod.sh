#!/usr/bin/env bash
set -euo pipefail

KIT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
OUTPUT_DIR=${1:-/workspace/anindilyakwa-baseline-v0.1.0-output}
VENV=${AOI_BASELINE_VENV:-/workspace/anindilyakwa-baseline-venv}
BASE_DIR=${AOI_BASE_DIR:-/workspace/anindilyakwa-nllb-base}
CONTROL_DIR=${AOI_CONTROL_DIR:-/workspace/anindilyakwa-nllb-control-v0.1.0}
MINIMUM_FREE_KIB=$((35 * 1024 * 1024))

cd "$KIT_DIR"
sha256sum -c SHA256SUMS.kit

python3 - "$KIT_DIR/CONTRACT.json" <<'PY'
import json
import pathlib
import sys

contract = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if contract["runpod"]["paid_compute_authorized_by_user"] is not True:
    raise SystemExit("Paid GPU execution is not authorized by this immutable contract")
if contract["training"]["private_research_only"] is not True:
    raise SystemExit("The baseline must remain private research")
if contract["training"]["training_exposed_rows_before_run"] != 0:
    raise SystemExit("The exposure baseline is not zero")
if contract["tokenizer_readiness"]["status"] != "PASS":
    raise SystemExit("Tokenizer readiness is not PASS")
PY

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "NVIDIA runtime is unavailable" >&2
  exit 1
fi
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

if [[ -e "$OUTPUT_DIR" || -e "$CONTROL_DIR" ]]; then
  echo "Refusing an existing output/control directory" >&2
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
fi
"$VENV/bin/pip" install -r "$KIT_DIR/requirements.lock"

"$VENV/bin/python" - "$KIT_DIR/CONTRACT.json" <<'PY'
import json
import pathlib
import sys
import torch

contract = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert torch.cuda.is_available(), "PyTorch cannot see CUDA"
memory_mib = torch.cuda.get_device_properties(0).total_memory // (1024 * 1024)
assert memory_mib >= contract["runpod"]["minimum_gpu_memory_mib"], memory_mib
print(torch.cuda.get_device_name(0), memory_mib, torch.__version__, torch.version.cuda)
PY

"$VENV/bin/python" - "$KIT_DIR/CONTRACT.json" "$BASE_DIR" <<'PY'
import hashlib
import json
import pathlib
import sys
from huggingface_hub import snapshot_download

contract = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
destination = pathlib.Path(sys.argv[2])
base = contract["base_model"]
snapshot_download(
    repo_id=base["model_id"],
    revision=base["revision"],
    local_dir=destination,
    allow_patterns=sorted(base["files"]),
)
for name, expected in sorted(base["files"].items()):
    digest_state = hashlib.sha256()
    with (destination / name).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest_state.update(chunk)
    digest = digest_state.hexdigest()
    if digest != expected:
        raise SystemExit(f"base-model hash mismatch for {name}: {digest} != {expected}")
print(destination)
PY

"$VENV/bin/python" "$KIT_DIR/code/materialize_nllb_control_model.py" \
  --base-model "$BASE_DIR" \
  --tokenizer-contract "$KIT_DIR/payload/control-tokenizer" \
  --expected-tokenizer-contract-sha256 "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["tokenizer_readiness"]["control_manifest_sha256"])' "$KIT_DIR/CONTRACT.json")" \
  --output-dir "$CONTROL_DIR" \
  --artifact-id anindilyakwa-nllb-control-v0.1.0 \
  --probe 'I see water.' \
  --probe 'The woman is here.' \
  --max-new-tokens 12

export TOKENIZERS_PARALLELISM=false
export HF_HUB_DISABLE_XET=1
export PYTHONPATH="$KIT_DIR/code${PYTHONPATH:+:$PYTHONPATH}"

"$VENV/bin/python" - "$KIT_DIR/CONTRACT.json" "$KIT_DIR" "$OUTPUT_DIR" "$CONTROL_DIR" "$VENV/bin/python" <<'PY'
import json
import os
import pathlib
import sys

contract = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
replacements = {
    "{KIT_DIR}": sys.argv[2],
    "{OUTPUT_DIR}": sys.argv[3],
    "{CONTROL_MODEL}": sys.argv[4],
}
arguments = []
for raw in contract["training"]["cli"]:
    value = str(raw)
    for marker, replacement in replacements.items():
        value = value.replace(marker, replacement)
    arguments.append(value)
command = [sys.argv[5], str(pathlib.Path(sys.argv[2]) / "code/train_nllb_lora.py"), *arguments]
os.execv(command[0], command)
PY

test -s "$OUTPUT_DIR/model_manifest.json"
test -s "$OUTPUT_DIR/exposure-row-presentations.jsonl"
test -s "$OUTPUT_DIR/adapter/adapter_model.safetensors"
test -s "$OUTPUT_DIR/merged/model.safetensors"
sha256sum "$OUTPUT_DIR/model_manifest.json" "$OUTPUT_DIR/adapter/adapter_model.safetensors" "$OUTPUT_DIR/merged/model.safetensors"
