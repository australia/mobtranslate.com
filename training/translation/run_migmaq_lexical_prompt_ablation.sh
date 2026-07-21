#!/usr/bin/env bash
set -euo pipefail

EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:?Set EXPERIMENT_CONTRACT}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:?Set EXPECTED_EXPERIMENT_CONTRACT_SHA256}"
CODE_DIR="${CODE_DIR:-/workspace/migmaq-prompt-ablation/code}"
BASE_DIR="${BASE_DIR:-/workspace/migmaq-prompt-ablation/base-v1/merged}"
DATA_DIR="${DATA_DIR:-/workspace/migmaq-prompt-ablation/data}"
ADAPTER_ROOT="${ADAPTER_ROOT:-/workspace/migmaq-prompt-ablation/adapters}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/workspace/migmaq-prompt-ablation/results}"
RUN_ID="${RUN_ID:-migmaq-lexical-prompt-ablation-20260721}"
OUTPUT_DIR="$OUTPUT_ROOT/$RUN_ID"
BENCHMARK="$DATA_DIR/evaluation/lexical-prompt-ablation.eng-mic.jsonl"

verify_sha256() {
  local expected="$1"
  local path="$2"
  local actual
  actual="$(sha256sum "$path" | cut -d ' ' -f 1)"
  if [[ "$actual" != "$expected" ]]; then
    echo "SHA-256 mismatch for $path: expected=$expected actual=$actual" >&2
    exit 3
  fi
}

required_files=(
  "$BASE_DIR/model.safetensors"
  "$BASE_DIR/tokenizer.json"
  "$BENCHMARK"
  "$EXPERIMENT_CONTRACT"
  "$CODE_DIR/evaluate_migmaq_lexical_baseline.py"
  "$CODE_DIR/analyze_migmaq_lexical_prompt_ablation.py"
)
for label in control600 glossary600 prior2400; do
  required_files+=("$ADAPTER_ROOT/$label/adapter_model.safetensors")
done
for path in "${required_files[@]}"; do
  if [[ ! -f "$path" ]]; then
    echo "Required input is absent: $path" >&2
    exit 4
  fi
done

verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"
verify_sha256 "8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01" "$BASE_DIR/model.safetensors"
verify_sha256 "1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef" "$BASE_DIR/tokenizer.json"
verify_sha256 "317d36df9fdb53ad2e70970f16f8629e10040964627bf093e247bd6b4de3d537" "$BENCHMARK"

declare -A ADAPTER_SHA256=(
  [control600]="7e2781cde358a0f2e1bf2b1392bd37dc68dd2c69aeb2782f72b7b91e49daaef3"
  [glossary600]="1255f32ea4a05e7fcf8240505a475aeaa07476f31dc0a9a5b0f311a7143ba583"
  [prior2400]="167feb790e5c5d1a8411501162d36fb79b02506ca93982bfca8b7bbd629e2dac"
)
declare -A TOKENIZER_BUNDLE_SHA256=(
  [control600]="97ca407ee8532fd808d9f51532eefde3715094749f1b111c18d85202604c8932"
  [glossary600]="97ca407ee8532fd808d9f51532eefde3715094749f1b111c18d85202604c8932"
  [prior2400]="c5d3a849d20739a8e8eb266d2a6b92236658c387102c09d6711e56b9e251290d"
)

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "Refusing to overwrite existing run directory: $OUTPUT_DIR" >&2
  exit 5
fi
mkdir -p "$OUTPUT_DIR/evaluations"
install -m 0644 "$EXPERIMENT_CONTRACT" "$OUTPUT_DIR/input-experiment-contract.json"

exec 3>&1 4>&2
exec > >(tee -a "$OUTPUT_DIR/run.log") 2>&1
TEE_PID=$!
export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTHONHASHSEED=0
export TOKENIZERS_PARALLELISM=false
export PYTHONPATH="$CODE_DIR${PYTHONPATH:+:$PYTHONPATH}"

date -u +%Y-%m-%dT%H:%M:%SZ
printf 'run_id=%s benchmark=%s\n' "$RUN_ID" "$BENCHMARK"
nvidia-smi
df -h /workspace
python --version

nvidia-smi \
  --query-gpu=timestamp,index,name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu \
  --format=csv \
  --loop=5 > "$OUTPUT_DIR/resource-monitor.csv" &
MONITOR_PID=$!
stop_monitor() {
  kill "$MONITOR_PID" 2>/dev/null || true
  wait "$MONITOR_PID" 2>/dev/null || true
}
trap stop_monitor EXIT

for label in control600 glossary600 prior2400; do
  adapter="$ADAPTER_ROOT/$label"
  verify_sha256 "${ADAPTER_SHA256[$label]}" "$adapter/adapter_model.safetensors"
  observed_bundle="$(python -c 'from pathlib import Path; import sys; from evaluate_migmaq_lexical_baseline import tokenizer_bundle_identity; print(tokenizer_bundle_identity(Path(sys.argv[1]))["sha256"])' "$adapter")"
  if [[ "$observed_bundle" != "${TOKENIZER_BUNDLE_SHA256[$label]}" ]]; then
    echo "Tokenizer bundle mismatch for $label: $observed_bundle" >&2
    exit 6
  fi
  task_args=(
    --task-token '<translate>'
    --task-token '<lexeme>'
    --task-token '<pos>'
  )
  if [[ "$label" != "prior2400" ]]; then
    task_args+=(--task-token '<glossary>')
  fi
  python "$CODE_DIR/evaluate_migmaq_lexical_baseline.py" \
    --model-dir "$adapter" \
    --base-model "$BASE_DIR" \
    --adapter-dir "$adapter" \
    --benchmark "$BENCHMARK" \
    --output-dir "$OUTPUT_DIR/evaluations/$label" \
    --expected-model-sha256 "${ADAPTER_SHA256[$label]}" \
    --expected-tokenizer-bundle-sha256 "${TOKENIZER_BUNDLE_SHA256[$label]}" \
    --expected-base-model-sha256 8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01 \
    --expected-base-tokenizer-sha256 1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef \
    --expected-benchmark-sha256 317d36df9fdb53ad2e70970f16f8629e10040964627bf093e247bd6b4de3d537 \
    --expected-rows 4800 \
    --expected-target-token-id 256204 \
    --expect-output-head-alias untied \
    --input-field input_text \
    --source-lang eng_Latn \
    --target-lang mic_Latn \
    --batch-size 32 \
    --max-source-length 192 \
    --max-new-tokens 192 \
    --num-beams 4 \
    --no-repeat-ngram-size 3 \
    --repetition-penalty 1.1 \
    --length-penalty 1.0 \
    --dtype bfloat16 \
    --seed 0 \
    --require-cuda \
    "${task_args[@]}"
done

python "$CODE_DIR/analyze_migmaq_lexical_prompt_ablation.py" \
  --benchmark "$BENCHMARK" \
  --model "control600=$OUTPUT_DIR/evaluations/control600/predictions.jsonl" \
  --model "glossary600=$OUTPUT_DIR/evaluations/glossary600/predictions.jsonl" \
  --model "prior2400=$OUTPUT_DIR/evaluations/prior2400/predictions.jsonl" \
  --expected-anchors 960 \
  --output-dir "$OUTPUT_DIR/analysis"

stop_monitor
trap - EXIT
date -u +%Y-%m-%dT%H:%M:%SZ
echo "Completed $RUN_ID"
exec 1>&3 2>&4
wait "$TEE_PID"
(
  cd "$OUTPUT_DIR"
  find . -type f ! -name RUN-SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > RUN-SHA256SUMS
)
