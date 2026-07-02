#!/usr/bin/env bash
set -euo pipefail

RUN_ID_PREFIX="${RUN_ID_PREFIX:-v9.9B-glossary-usage}"
GATE_SIZES="${GATE_SIZES:-1,8,32}"
PYTHON="${PYTHON:-/workspace/venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-/workspace/data/kuku_yalanji_v9_9B_glossary_usage}"
OUT_ROOT="${OUT_ROOT:-/workspace/models/kuku-yalanji-nllb-lora}"
LOG_ROOT="${LOG_ROOT:-/workspace/logs}"
REPORT_ROOT="${REPORT_ROOT:-/workspace/reports}"
BASE_MODEL="${BASE_MODEL:-facebook/nllb-200-distilled-1.3B}"
SOURCE_LANG="${SOURCE_LANG:-eng_Latn}"
TARGET_LANG="${TARGET_LANG:-tpi_Latn}"
DIRECTION="${DIRECTION:-eng-gvn}"
MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-128}"
MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-96}"
LORA_TARGET_MODULES="${LORA_TARGET_MODULES:-q_proj,k_proj,v_proj,out_proj,fc1,fc2}"
LORA_R="${LORA_R:-64}"
LORA_ALPHA="${LORA_ALPHA:-128}"
LORA_DROPOUT="${LORA_DROPOUT:-0.0}"
EPOCHS="${EPOCHS:-80}"
BATCH_SIZE="${BATCH_SIZE:-16}"
GRADIENT_ACCUMULATION_STEPS="${GRADIENT_ACCUMULATION_STEPS:-1}"
LEARNING_RATE="${LEARNING_RATE:-2e-4}"
EVAL_STEPS="${EVAL_STEPS:-40}"
SAVE_STEPS="${SAVE_STEPS:-40}"
LOGGING_STEPS="${LOGGING_STEPS:-10}"
SEED="${SEED:-42}"

mkdir -p "$OUT_ROOT" "$LOG_ROOT" "$REPORT_ROOT"

SUITE_ID="${RUN_ID_PREFIX}-suite"
SUITE_LOG="$LOG_ROOT/$SUITE_ID.driver.log"
MONITOR_FILE="$LOG_ROOT/$SUITE_ID.resource.csv"
SUITE_REPORT="$REPORT_ROOT/$SUITE_ID.md"
HELDOUT_USAGE_FILE="$DATA_ROOT/heldout_usage_glossary.eng-gvn.jsonl"
START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

monitor_pid=""
if [[ -x ./run_resource_monitor.sh ]]; then
  INTERVAL_SECONDS="${INTERVAL_SECONDS:-5}" ./run_resource_monitor.sh "$MONITOR_FILE" &
  monitor_pid="$!"
fi

cleanup() {
  if [[ -n "$monitor_pid" ]]; then
    kill "$monitor_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

{
  echo "# Kuku Yalanji $SUITE_ID"
  echo
  echo "Started UTC: $START_UTC"
  echo
  echo "Purpose: glossary-conditioned usage-example overfit gates."
  echo
  echo "Data root: $DATA_ROOT"
  echo "Gate sizes: $GATE_SIZES"
  echo "Heldout file: $HELDOUT_USAGE_FILE"
  echo
  echo "## Dataset Manifest"
  echo
  echo '```json'
  cat "$DATA_ROOT/glossary_usage_manifest.json"
  echo '```'
  echo
  echo "## GPU"
  echo
  echo '```text'
  nvidia-smi
  echo '```'
} > "$SUITE_REPORT"

{
  echo "START_UTC=$START_UTC"
  echo "SUITE_ID=$SUITE_ID"
  echo "DATA_ROOT=$DATA_ROOT"
  echo "GATE_SIZES=$GATE_SIZES"
  echo "HELDOUT_USAGE_FILE=$HELDOUT_USAGE_FILE"
  echo "EPOCHS=$EPOCHS"
  echo "BATCH_SIZE=$BATCH_SIZE"
  echo "GRADIENT_ACCUMULATION_STEPS=$GRADIENT_ACCUMULATION_STEPS"
  echo "LEARNING_RATE=$LEARNING_RATE"
  echo "MAX_SOURCE_LENGTH=$MAX_SOURCE_LENGTH"
  echo "MAX_TARGET_LENGTH=$MAX_TARGET_LENGTH"
  echo "LORA_R=$LORA_R"
  echo "LORA_ALPHA=$LORA_ALPHA"
  echo "LORA_DROPOUT=$LORA_DROPOUT"
  echo "LORA_TARGET_MODULES=$LORA_TARGET_MODULES"
} | tee "$SUITE_LOG"

evaluate_split() {
  local run_id="$1"
  local label="$2"
  local data_file="$3"
  local out_dir="$OUT_ROOT/$run_id"
  "$PYTHON" evaluate_nllb_lora.py \
    --model-dir "$out_dir/merged" \
    --data-file "$data_file" \
    --output-file "$out_dir/eval_${label}_predictions_greedy.json" \
    --direction "$DIRECTION" \
    --source-lang "$SOURCE_LANG" \
    --target-lang "$TARGET_LANG" \
    --batch-size "$BATCH_SIZE" \
    --max-source-length "$MAX_SOURCE_LENGTH" \
    --max-new-tokens "$MAX_TARGET_LENGTH" \
    --num-beams 1 \
    --no-repeat-ngram-size 0 \
    --repetition-penalty 1.0 \
    --length-penalty 1.0 \
    2>&1 | tee "$out_dir/eval_${label}_metrics.stdout.json"

  "$PYTHON" summarize_predictions.py "$out_dir/eval_${label}_predictions_greedy.json" \
    --samples 8 \
    > "$out_dir/eval_${label}_summary.txt"
}

analyze_run() {
  local run_id="$1"
  local out_dir="$OUT_ROOT/$run_id"
  "$PYTHON" - "$out_dir" <<'PY' > "$out_dir/post_eval_analysis.json"
import collections
import json
import statistics
import sys
from pathlib import Path

out_dir = Path(sys.argv[1])

def words(text):
    return (text or "").split()

def describe(values):
    if not values:
        return {"mean": 0.0, "median": 0.0, "min": 0.0, "max": 0.0}
    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
    }

def repeat_share(tokens):
    if not tokens:
        return 0.0
    return max(collections.Counter(tokens).values()) / len(tokens)

def analyze(filename):
    data = json.loads((out_dir / filename).read_text(encoding="utf-8"))
    rows = data.get("predictions", [])
    length_ratios = []
    repeat_shares = []
    exact = 0
    empty = 0
    headword_hits = 0
    headword_rows = 0
    token_recalls = []
    for row in rows:
        prediction = " ".join((row.get("prediction") or "").split())
        reference = " ".join((row.get("reference") or row.get("output_text") or "").split())
        if prediction == reference:
            exact += 1
        pred_words = words(prediction)
        ref_words = words(reference)
        if not pred_words:
            empty += 1
        length_ratios.append(len(pred_words) / (len(ref_words) or 1))
        repeat_shares.append(repeat_share(pred_words))
        pred_set = set(token.lower() for token in pred_words)
        token_recalls.append(sum(1 for token in ref_words if token.lower() in pred_set) / (len(ref_words) or 1))
        word = (((row.get("db_usage_example") or {}).get("word")) or "").strip().lower()
        if word:
            headword_rows += 1
            if word in prediction.lower():
                headword_hits += 1
    return {
        "metrics": data.get("metrics", {}),
        "exact": exact,
        "empty": empty,
        "length_ratio": describe(length_ratios),
        "max_token_repeat_share": describe(repeat_shares),
        "reference_token_recall": describe(token_recalls),
        "db_headword_hits": {
            "rows_with_headword": headword_rows,
            "hits": headword_hits,
            "rate": headword_hits / headword_rows if headword_rows else None,
        },
    }

analysis = {
    "eval_train": analyze("eval_train_predictions_greedy.json"),
    "heldout_usage_glossary": analyze("eval_heldout_usage_glossary_predictions_greedy.json"),
}
print(json.dumps(analysis, indent=2, ensure_ascii=False))
PY
}

IFS=',' read -r -a gate_sizes <<< "$GATE_SIZES"
completed_runs=()
for raw_size in "${gate_sizes[@]}"; do
  size="$(echo "$raw_size" | xargs)"
  [[ -n "$size" ]] || continue
  run_id="${RUN_ID_PREFIX}-${size}row-tpi-${EPOCHS}epoch-batch${BATCH_SIZE}"
  out_dir="$OUT_ROOT/$run_id"
  train_file="$DATA_ROOT/gates/${size}row/train.eng-gvn.jsonl"
  validation_file="$DATA_ROOT/gates/${size}row/validation.eng-gvn.jsonl"
  eval_train_file="$DATA_ROOT/gates/${size}row/eval_train.eng-gvn.jsonl"
  log_file="$LOG_ROOT/$run_id.driver.log"

  mkdir -p "$out_dir"
  {
    echo
    echo "## $run_id"
    echo
    echo "Train file: $train_file"
    echo "Validation file: $validation_file"
    echo "Eval train file: $eval_train_file"
  } >> "$SUITE_REPORT"

  {
    echo "RUN_ID=$run_id"
    echo "TRAIN_FILE=$train_file"
    echo "VALIDATION_FILE=$validation_file"
    echo "EVAL_TRAIN_FILE=$eval_train_file"
  } | tee "$log_file" | tee -a "$SUITE_LOG"

  "$PYTHON" train_nllb_lora.py \
    --base-model "$BASE_MODEL" \
    --train-file "$train_file" \
    --validation-file "$validation_file" \
    --test-file "$eval_train_file" \
    --output-dir "$out_dir" \
    --direction "$DIRECTION" \
    --source-lang "$SOURCE_LANG" \
    --target-lang "$TARGET_LANG" \
    --epochs "$EPOCHS" \
    --batch-size "$BATCH_SIZE" \
    --gradient-accumulation-steps "$GRADIENT_ACCUMULATION_STEPS" \
    --max-source-length "$MAX_SOURCE_LENGTH" \
    --max-target-length "$MAX_TARGET_LENGTH" \
    --max-validation-samples 64 \
    --learning-rate "$LEARNING_RATE" \
    --warmup-ratio 0.0 \
    --weight-decay 0.0 \
    --lora-r "$LORA_R" \
    --lora-alpha "$LORA_ALPHA" \
    --lora-dropout "$LORA_DROPOUT" \
    --lora-target-modules "$LORA_TARGET_MODULES" \
    --eval-steps "$EVAL_STEPS" \
    --save-steps "$SAVE_STEPS" \
    --save-total-limit 2 \
    --logging-steps "$LOGGING_STEPS" \
    --generation-num-beams 1 \
    --generation-no-repeat-ngram-size 0 \
    --generation-repetition-penalty 1.0 \
    --generation-length-penalty 1.0 \
    --seed "$SEED" \
    --no-shuffle-before-cap \
    2>&1 | tee -a "$log_file" | tee -a "$SUITE_LOG"

  evaluate_split "$run_id" "train" "$eval_train_file"
  evaluate_split "$run_id" "heldout_usage_glossary" "$HELDOUT_USAGE_FILE"
  analyze_run "$run_id"
  completed_runs+=("$run_id")

  {
    echo
    echo "### Standalone Metrics"
    echo
    echo '```json'
    cat "$out_dir/post_eval_analysis.json"
    echo '```'
  } >> "$SUITE_REPORT"
done

"$PYTHON" - "$MONITOR_FILE" <<'PY' > "$OUT_ROOT/$SUITE_ID.resource_summary.json"
import csv
import json
import statistics
import sys
from pathlib import Path

path = Path(sys.argv[1])
rows = list(csv.DictReader(path.open(encoding="utf-8"))) if path.exists() else []

def floats(key):
    values = []
    for row in rows:
        try:
            values.append(float(row[key]))
        except Exception:
            pass
    return values

summary = {"samples": len(rows)}
if rows:
    summary["start"] = rows[0]["timestamp"]
    summary["end"] = rows[-1]["timestamp"]
for key, out_key in [
    ("gpu_util_pct", "gpu_util_pct"),
    ("gpu_mem_used_mib", "gpu_mem_used_mib"),
    ("gpu_power_w", "gpu_power_w"),
    ("python_cpu_pct", "python_cpu_pct"),
    ("python_rss_mib", "python_rss_mib"),
]:
    values = floats(key)
    if values:
        summary[f"mean_{out_key}"] = statistics.mean(values)
        summary[f"max_{out_key}"] = max(values)
print(json.dumps(summary, indent=2))
PY

{
  echo
  echo "## Completed Runs"
  echo
  printf '%s\n' "${completed_runs[@]}"
  echo
  echo "## Resource Summary"
  echo
  echo '```json'
  cat "$OUT_ROOT/$SUITE_ID.resource_summary.json"
  echo '```'
  echo
  echo "Ended UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$SUITE_REPORT"

sha256sum "$SUITE_REPORT" > "$SUITE_REPORT.sha256"

echo "END_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "DONE"
