#!/usr/bin/env bash
set -euo pipefail

CODE_DIR="${CODE_DIR:-/workspace/mobtranslate-migmaq/code}"
DATASET_DIR="${DATASET_DIR:-/workspace/mobtranslate-migmaq/data/migmaq-online-example-parallel-v1.0.0-20260712}"
RUN_DIR="${RUN_DIR:-/workspace/mobtranslate-migmaq/runs/migmaq-v1-rc1}"
PYTHON="${PYTHON:-python}"
MODEL_DIR="$RUN_DIR/model/merged"
VALIDATION_FILE="$DATASET_DIR/training/validation.eng-mic.jsonl"
TRAIN_FILE="$DATASET_DIR/training/train.eng-mic.jsonl"

mkdir -p "$RUN_DIR/selection"
test -f "$MODEL_DIR/model.safetensors"
test -f "$VALIDATION_FILE"
test -f "$TRAIN_FILE"
test ! -e "$RUN_DIR/test-final.json"
test ! -e "$RUN_DIR/frozen-test-access.json"

evaluate() {
  local output="$1" no_repeat="$2" repetition="$3" length="$4"
  "$PYTHON" "$CODE_DIR/evaluate_nllb_lora.py" \
    --model-dir "$MODEL_DIR" \
    --data-file "$VALIDATION_FILE" \
    --output-file "$output" \
    --direction eng-mic \
    --source-lang eng_Latn \
    --target-lang mic_Latn \
    --batch-size 8 \
    --num-beams 4 \
    --max-new-tokens 128 \
    --no-repeat-ngram-size "$no_repeat" \
    --repetition-penalty "$repetition" \
    --length-penalty "$length"
}

evaluate "$RUN_DIR/selection/validation-default.json" 4 1.15 0.8
evaluate "$RUN_DIR/selection/validation-balanced.json" 3 1.10 1.0
evaluate "$RUN_DIR/selection/validation-unconstrained.json" 0 1.0 1.0

"$PYTHON" "$CODE_DIR/select_migmaq_decoding.py" \
  --candidate "default=$RUN_DIR/selection/validation-default.json" \
  --candidate "balanced=$RUN_DIR/selection/validation-balanced.json" \
  --candidate "unconstrained=$RUN_DIR/selection/validation-unconstrained.json" \
  --expected-split validation \
  --expected-rows 686 \
  --output "$RUN_DIR/selection/decoding-selection.json"

selected_file="$($PYTHON - "$RUN_DIR/selection/decoding-selection.json" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["selected"]["file"])
PY
)"

"$PYTHON" "$CODE_DIR/analyze_migmaq_evaluation.py" \
  --evaluation "$selected_file" \
  --baseline-evaluation "$RUN_DIR/base-proxy-validation.json" \
  --train-file "$TRAIN_FILE" \
  --bootstrap-samples 1000 \
  --seed 20260712 \
  --output "$RUN_DIR/selection/validation-analysis.json"

(
  cd "$RUN_DIR"
  sha256sum \
    base-proxy-validation.json \
    selection/validation-default.json \
    selection/validation-balanced.json \
    selection/validation-unconstrained.json \
    selection/decoding-selection.json \
    selection/validation-analysis.json \
    > selection/SHA256SUMS
)

date -u +%Y-%m-%dT%H:%M:%SZ
