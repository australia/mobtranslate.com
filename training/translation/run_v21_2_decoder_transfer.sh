#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${WORK_ROOT:-/workspace/v22-step-matched}"
RUN_ID="${RUN_ID:-v21.2-final-locked-decoder-transfer}"
PYTHON="${PYTHON:-/opt/mobtranslate-mt-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-$WORK_ROOT/data}"
BASE_MODEL="${BASE_MODEL:-$WORK_ROOT/base_model/merged}"
ADAPTER_DIR="${ADAPTER_DIR:-$WORK_ROOT/v21.2-transfer-input/adapter}"
EXACT_MODEL_DIR="${EXACT_MODEL_DIR:-}"
PROTOCOL="${PROTOCOL:-$WORK_ROOT/v21.2-transfer-input/V22-SECONDARY-DECODER-TRANSFER-PROTOCOL.md}"
INPUT_SHA256_FILE="${INPUT_SHA256_FILE:-$WORK_ROOT/SHA256SUMS.v22-inputs}"
OUT_DIR="${OUT_DIR:-$WORK_ROOT/models/$RUN_ID}"
LOG_ROOT="${LOG_ROOT:-$WORK_ROOT/logs}"
REPORT_ROOT="${REPORT_ROOT:-$WORK_ROOT/reports}"

EXPECTED_ADAPTER_SHA256="aaf155997d3c7b9ccea53d477a59a93f0460dd8d26226b50831233a42db9e5e6"
EXPECTED_MERGED_SHA256="7f9d0fe325e9e4568e45f13179adb336b93bbd53e83ddab2826e999eba3c76f7"
SOURCE_LANG="eng_Latn"
TARGET_LANG="gvn_Latn"
DIRECTION="eng-gvn"
MAX_SOURCE_LENGTH=192
MAX_TARGET_LENGTH=208
BATCH_SIZE=8
NO_REPEAT_NGRAM_SIZE=4
REPETITION_PENALTY=1.10

declare -a EVALUATIONS=(
  "synthetic_dev_1609|$DATA_ROOT/validation.eng-gvn.jsonl"
  "synthetic_test_tagged_1606|$DATA_ROOT/test.eng-gvn.jsonl"
  "synthetic_test_untagged_1606|$DATA_ROOT/synthetic/test_untagged_1606.eng-gvn.jsonl"
  "elder_sentence_pair_43|$DATA_ROOT/external/elder_sentence_pair_43.eng-gvn.jsonl"
  "db_usage_heldout_84|$DATA_ROOT/external/db_usage_heldout_84.eng-gvn.jsonl"
  "bible_direct_heldout_325|$DATA_ROOT/external/bible_direct_heldout_325.eng-gvn.jsonl"
  "bible_ref_heldout_325|$DATA_ROOT/external/bible_ref_heldout_325.eng-gvn.jsonl"
)

for required in "$PYTHON" "$PROTOCOL" "$INPUT_SHA256_FILE" \
  "$SCRIPT_DIR/merge_nllb_lora.py" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
  "$SCRIPT_DIR/analyze_v21_predictions.py" "$SCRIPT_DIR/verify_v21_2_decoder_transfer.py"; do
  if [[ ! -e "$required" ]]; then
    echo "Required path does not exist: $required" >&2
    exit 2
  fi
done
if [[ -n "$EXACT_MODEL_DIR" ]]; then
  if [[ ! -f "$EXACT_MODEL_DIR/model.safetensors" ]]; then
    echo "Exact model is missing model.safetensors: $EXACT_MODEL_DIR" >&2
    exit 2
  fi
else
  for required in "$BASE_MODEL" "$ADAPTER_DIR"; do
    if [[ ! -e "$required" ]]; then
      echo "Required reconstruction path does not exist: $required" >&2
      exit 2
    fi
  done
fi

if [[ -d "$OUT_DIR" ]] && [[ -n "$(find "$OUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Refusing nonempty output directory: $OUT_DIR" >&2
  exit 3
fi
mkdir -p "$OUT_DIR" "$LOG_ROOT" "$REPORT_ROOT"

cd "$WORK_ROOT"
sha256sum -c "$INPUT_SHA256_FILE" > "$LOG_ROOT/$RUN_ID.primary-input-checksums.log"
observed_adapter_sha256="not-remerged"
if [[ -z "$EXACT_MODEL_DIR" ]]; then
  observed_adapter_sha256="$(sha256sum "$ADAPTER_DIR/adapter_model.safetensors" | awk '{print $1}')"
  if [[ "$observed_adapter_sha256" != "$EXPECTED_ADAPTER_SHA256" ]]; then
    echo "v21.2 adapter SHA-256 mismatch: $observed_adapter_sha256" >&2
    exit 4
  fi
fi

START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MONITOR_FILE="$LOG_ROOT/$RUN_ID.resource.csv"
monitor_pid=""
if [[ -x "$SCRIPT_DIR/run_resource_monitor.sh" ]]; then
  INTERVAL_SECONDS=5 "$SCRIPT_DIR/run_resource_monitor.sh" "$MONITOR_FILE" &
  monitor_pid="$!"
fi
cleanup() {
  if [[ -n "$monitor_pid" ]]; then
    kill "$monitor_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ -n "$EXACT_MODEL_DIR" ]]; then
  MODEL_DIR="$EXACT_MODEL_DIR"
  printf 'Using exact pre-merged model: %s\n' "$MODEL_DIR" | tee "$OUT_DIR/model-source.log"
else
  MODEL_DIR="$OUT_DIR/merged"
  "$PYTHON" "$SCRIPT_DIR/merge_nllb_lora.py" \
    --base-model "$BASE_MODEL" --adapter-dir "$ADAPTER_DIR" --output-dir "$MODEL_DIR" \
    --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" --num-beams 1 \
    --no-repeat-ngram-size "$NO_REPEAT_NGRAM_SIZE" --repetition-penalty "$REPETITION_PENALTY" \
    --length-penalty 1.0 2>&1 | tee "$OUT_DIR/merge.stdout.log"
fi

observed_merged_sha256="$(sha256sum "$MODEL_DIR/model.safetensors" | awk '{print $1}')"
if [[ "$observed_merged_sha256" != "$EXPECTED_MERGED_SHA256" ]]; then
  echo "v21.2 merged-model SHA-256 mismatch: $observed_merged_sha256" >&2
  exit 5
fi

for item in "${EVALUATIONS[@]}"; do
  IFS='|' read -r label data_file <<< "$item"
  prediction="$OUT_DIR/eval_${label}_predictions_locked.json"
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
    --model-dir "$MODEL_DIR" --data-file "$data_file" --output-file "$prediction" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --batch-size "$BATCH_SIZE" --max-source-length "$MAX_SOURCE_LENGTH" \
    --max-new-tokens "$MAX_TARGET_LENGTH" --num-beams 1 \
    --no-repeat-ngram-size "$NO_REPEAT_NGRAM_SIZE" --repetition-penalty "$REPETITION_PENALTY" \
    --length-penalty 1.0 2>&1 | tee "$OUT_DIR/eval_${label}_metrics_locked.stdout.json"
  "$PYTHON" "$SCRIPT_DIR/analyze_v21_predictions.py" "$prediction" \
    --output "$OUT_DIR/eval_${label}_analysis_locked.json" \
    > "$OUT_DIR/eval_${label}_analysis_locked.stdout.json"
done

"$PYTHON" "$SCRIPT_DIR/verify_v21_2_decoder_transfer.py" \
  --model-dir "$OUT_DIR" --output "$OUT_DIR/transfer_gate.json" \
  | tee "$OUT_DIR/transfer_gate.stdout.json"

END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  printf '# %s\n\n' "$RUN_ID"
  printf 'Started UTC: %s\n\n' "$START_UTC"
  printf 'Finished UTC: %s\n\n' "$END_UTC"
  printf 'Transfer gate: %s\n\n' "$(jq -r '.status' "$OUT_DIR/transfer_gate.json")"
  printf 'Adapter SHA-256: `%s`\n\n' "$observed_adapter_sha256"
  printf 'Merged SHA-256: `%s`\n\n' "$observed_merged_sha256"
  printf 'This result changes only a decoding recipe and is not speaker certification.\n'
} > "$REPORT_ROOT/$RUN_ID.md"

touch "$OUT_DIR/RUN_COMPLETE"
printf '[%s] %s complete\n' "$END_UTC" "$RUN_ID"
