#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if [[ "$#" -lt 3 || "$#" -gt 4 ]]; then
  echo "usage: $0 UPSTREAM_CHECKOUT GOVERNED_DATASET RUN_OUTPUT [SEED]" >&2
  exit 2
fi

UPSTREAM="$(realpath "$1")"
DATASET="$(realpath "$2")"
RUN_OUTPUT="$(realpath -m "$3")"
SEED="${4:-17}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v nvidia-smi >/dev/null
command -v python >/dev/null
python -c 'import fairseq2, omnilingual_asr, torch, yaml'
nvidia-smi --query-gpu=name,uuid,memory.total,driver_version --format=csv,noheader

python "$SCRIPT_DIR/prepare_omnilingual_ctc_run.py" \
  --upstream "$UPSTREAM" \
  --dataset "$DATASET" \
  --output "$RUN_OUTPUT" \
  --seed "$SEED"

python -m pip freeze > "$RUN_OUTPUT/python-freeze.txt"
nvidia-smi -q > "$RUN_OUTPUT/gpu-before.txt"

cd "$UPSTREAM"
set -o pipefail
python -m workflows.recipes.wav2vec2.asr \
  "$RUN_OUTPUT/artifacts" \
  --config-file "$RUN_OUTPUT/ctc-finetune.yaml" \
  2>&1 | tee "$RUN_OUTPUT/training.log"

find "$RUN_OUTPUT" -type f -print0 \
  | sort -z \
  | xargs -0 sha256sum > "$RUN_OUTPUT/artifact-sha256.txt"
nvidia-smi -q > "$RUN_OUTPUT/gpu-after.txt"
