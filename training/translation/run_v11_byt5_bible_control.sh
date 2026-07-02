#!/usr/bin/env bash
set -euo pipefail

RUN_ID_PREFIX="${RUN_ID_PREFIX:-v11.0-byt5-bible-control}"
PYTHON="${PYTHON:-/workspace/venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-/workspace/data/kuku_yalanji_v11_byt5_bible_control}"
OUT_ROOT="${OUT_ROOT:-/workspace/models/kuku-yalanji-byt5-control}"
LOG_ROOT="${LOG_ROOT:-/workspace/logs}"
REPORT_ROOT="${REPORT_ROOT:-/workspace/reports}"
BASE_MODEL="${BASE_MODEL:-google/byt5-small}"
DIRECTION="${DIRECTION:-eng-gvn}"
GATE_SIZES="${GATE_SIZES:-32,512}"
MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-384}"
MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-384}"
BATCH_SIZE="${BATCH_SIZE:-8}"
GRADIENT_ACCUMULATION_STEPS="${GRADIENT_ACCUMULATION_STEPS:-2}"
EPOCHS="${EPOCHS:-25}"
LEARNING_RATE="${LEARNING_RATE:-3e-4}"
EVAL_STEPS="${EVAL_STEPS:-20}"
SAVE_STEPS="${SAVE_STEPS:-20}"
LOGGING_STEPS="${LOGGING_STEPS:-20}"
SEED="${SEED:-42}"
SUITE_ID="${SUITE_ID:-${RUN_ID_PREFIX}-suite}"

mkdir -p "$OUT_ROOT" "$LOG_ROOT" "$REPORT_ROOT"

SUITE_LOG="$LOG_ROOT/$SUITE_ID.driver.log"
SUITE_REPORT="$REPORT_ROOT/$SUITE_ID.md"
MONITOR_FILE="$LOG_ROOT/$SUITE_ID.resource.csv"
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

"$PYTHON" - "$DATA_ROOT" "$BASE_MODEL" "$MAX_SOURCE_LENGTH" "$MAX_TARGET_LENGTH" <<'PY' > "$OUT_ROOT/source_length_preflight.json"
import json
import statistics
import sys
from pathlib import Path

from transformers import AutoTokenizer

root = Path(sys.argv[1])
base_model = sys.argv[2]
max_source_length = int(sys.argv[3])
max_target_length = int(sys.argv[4])
tokenizer = AutoTokenizer.from_pretrained(base_model)

files = []
for path in sorted(root.glob("gates/*row/*.jsonl")):
    files.append(path.relative_to(root))
for rel in [
    Path("bible/heldout_direct_325.eng-gvn.jsonl"),
    Path("bible/heldout_ref_325.eng-gvn.jsonl"),
    Path("heldout_all_650.eng-gvn.jsonl"),
]:
    files.append(rel)

results = []
for rel in files:
    source_lengths = []
    target_lengths = []
    with (root / rel).open(encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            source_lengths.append(len(tokenizer(" ".join(row["input_text"].split()), truncation=False).input_ids))
            target_lengths.append(len(tokenizer(" ".join(row["output_text"].split()), truncation=False).input_ids))
    results.append(
        {
            "file": str(rel),
            "rows": len(source_lengths),
            "source_max": max(source_lengths) if source_lengths else 0,
            "source_mean": statistics.mean(source_lengths) if source_lengths else 0,
            "source_over_max": sum(1 for length in source_lengths if length > max_source_length),
            "target_max": max(target_lengths) if target_lengths else 0,
            "target_mean": statistics.mean(target_lengths) if target_lengths else 0,
            "target_over_max": sum(1 for length in target_lengths if length > max_target_length),
        }
    )
print(json.dumps(results, indent=2, ensure_ascii=False))
PY

{
  echo "# Kuku Yalanji $SUITE_ID"
  echo
  echo "Started UTC: $START_UTC"
  echo
  echo "Purpose: byte-level ByT5 Bible-control gates against the v9.7 tagged Bible data."
  echo
  echo "Base model: $BASE_MODEL"
  echo "Gate sizes: $GATE_SIZES"
  echo "Decode: greedy, no anti-repeat constraints."
  echo
  echo "## Dataset Manifest"
  echo
  echo '```json'
  cat "$DATA_ROOT/byt5_bible_control_manifest.json"
  echo '```'
  echo
  echo "## Source-Length Preflight"
  echo
  echo '```json'
  cat "$OUT_ROOT/source_length_preflight.json"
  echo '```'
  echo
  echo "## GPU"
  echo
  echo '```text'
  nvidia-smi
  echo '```'
} > "$SUITE_REPORT"

echo "START_UTC=$START_UTC" | tee "$SUITE_LOG"
echo "SUITE_ID=$SUITE_ID" | tee -a "$SUITE_LOG"

IFS=',' read -r -a gate_sizes <<< "$GATE_SIZES"
completed_runs=()

evaluate_split() {
  local out_dir="$1"
  local label="$2"
  local data_file="$3"
  "$PYTHON" evaluate_seq2seq.py \
    --model-dir "$out_dir/merged" \
    --data-file "$data_file" \
    --output-file "$out_dir/eval_${label}_predictions_greedy.json" \
    --direction "$DIRECTION" \
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

for gate_size_raw in "${gate_sizes[@]}"; do
  gate_size="$(echo "$gate_size_raw" | xargs)"
  [[ -n "$gate_size" ]] || continue
  run_id="${RUN_ID_PREFIX}-${gate_size}row-${BASE_MODEL##*/}-fullfinetune"
  out_dir="$OUT_ROOT/$run_id"
  train_file="$DATA_ROOT/gates/${gate_size}row/train.eng-gvn.jsonl"
  validation_file="$DATA_ROOT/gates/${gate_size}row/validation.eng-gvn.jsonl"
  eval_train_file="$DATA_ROOT/gates/${gate_size}row/eval_train.eng-gvn.jsonl"

  mkdir -p "$out_dir"
  {
    echo
    echo "## $run_id"
    echo
    echo "Train file: $train_file"
    echo "Validation file: $validation_file"
    echo "Eval train file: $eval_train_file"
  } >> "$SUITE_REPORT"

  "$PYTHON" train_seq2seq.py \
    --base-model "$BASE_MODEL" \
    --model-id "mobtranslate/kuku-yalanji-byt5-control" \
    --train-file "$train_file" \
    --validation-file "$validation_file" \
    --test-file "$eval_train_file" \
    --output-dir "$out_dir" \
    --direction "$DIRECTION" \
    --epochs "$EPOCHS" \
    --batch-size "$BATCH_SIZE" \
    --gradient-accumulation-steps "$GRADIENT_ACCUMULATION_STEPS" \
    --max-source-length "$MAX_SOURCE_LENGTH" \
    --max-target-length "$MAX_TARGET_LENGTH" \
    --learning-rate "$LEARNING_RATE" \
    --warmup-ratio 0.0 \
    --weight-decay 0.0 \
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
    2>&1 | tee "$out_dir/train.driver.log"

  evaluate_split "$out_dir" "eval_train" "$eval_train_file"
  evaluate_split "$out_dir" "heldout_bible_direct325" "$DATA_ROOT/bible/heldout_direct_325.eng-gvn.jsonl"
  evaluate_split "$out_dir" "heldout_bible_ref325" "$DATA_ROOT/bible/heldout_ref_325.eng-gvn.jsonl"
  evaluate_split "$out_dir" "heldout_all650" "$DATA_ROOT/heldout_all_650.eng-gvn.jsonl"

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
    return {
        "metrics": data.get("metrics", {}),
        "exact": exact,
        "empty": empty,
        "length_ratio": describe(length_ratios),
        "max_token_repeat_share": describe(repeat_shares),
    }

analysis = {
    "eval_train": analyze("eval_eval_train_predictions_greedy.json"),
    "heldout_bible_direct325": analyze("eval_heldout_bible_direct325_predictions_greedy.json"),
    "heldout_bible_ref325": analyze("eval_heldout_bible_ref325_predictions_greedy.json"),
    "heldout_all650": analyze("eval_heldout_all650_predictions_greedy.json"),
}
print(json.dumps(analysis, indent=2, ensure_ascii=False))
PY

  {
    echo
    echo "### Standalone Metrics"
    echo
    echo '```json'
    cat "$out_dir/post_eval_analysis.json"
    echo '```'
  } >> "$SUITE_REPORT"
  completed_runs+=("$run_id")
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

echo "END_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$SUITE_LOG"
echo "DONE" | tee -a "$SUITE_LOG"
