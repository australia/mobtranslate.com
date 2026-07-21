#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${RUN_ID:-v17.0-usage-continuation-from-v10-tpi-10epoch-lr5e-5}"
PYTHON="${PYTHON:-/opt/mobtranslate-mt-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-/workspace/data/kuku_yalanji_v10_0_bible_glossary_usage}"
OUT_ROOT="${OUT_ROOT:-/workspace/models/kuku-yalanji-nllb-lora}"
LOG_ROOT="${LOG_ROOT:-/workspace/logs}"
REPORT_ROOT="${REPORT_ROOT:-/workspace/reports}"
BASE_MODEL="${BASE_MODEL:-/workspace/base_models/v10.0-tagged-bible-plus-glossary-usage-tpi-20epoch-batch16/merged}"
SOURCE_LANG="${SOURCE_LANG:-eng_Latn}"
TARGET_LANG="${TARGET_LANG:-tpi_Latn}"
DIRECTION="${DIRECTION:-eng-gvn}"
MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-160}"
MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-128}"
LORA_TARGET_MODULES="${LORA_TARGET_MODULES:-q_proj,k_proj,v_proj,out_proj,fc1,fc2}"
LORA_R="${LORA_R:-64}"
LORA_ALPHA="${LORA_ALPHA:-128}"
LORA_DROPOUT="${LORA_DROPOUT:-0.0}"
EPOCHS="${EPOCHS:-10}"
BATCH_SIZE="${BATCH_SIZE:-16}"
GRADIENT_ACCUMULATION_STEPS="${GRADIENT_ACCUMULATION_STEPS:-1}"
LEARNING_RATE="${LEARNING_RATE:-5e-5}"
EVAL_STEPS="${EVAL_STEPS:-920}"
SAVE_STEPS="${SAVE_STEPS:-920}"
LOGGING_STEPS="${LOGGING_STEPS:-184}"
SEED="${SEED:-42}"

TRAIN_USAGE_FILE="${TRAIN_USAGE_FILE:-$DATA_ROOT/db_usage/train_usage_oversampled.eng-gvn.jsonl}"
EVAL_TRAIN_USAGE_FILE="${EVAL_TRAIN_USAGE_FILE:-$DATA_ROOT/db_usage/train_usage.eng-gvn.jsonl}"
HELDOUT_USAGE_FILE="${HELDOUT_USAGE_FILE:-$DATA_ROOT/db_usage/heldout_usage.eng-gvn.jsonl}"
HELDOUT_ALL_FILE="${HELDOUT_ALL_FILE:-$DATA_ROOT/heldout_all.eng-gvn.jsonl}"
HELDOUT_BIBLE_DIRECT_FILE="${HELDOUT_BIBLE_DIRECT_FILE:-$DATA_ROOT/bible/heldout_direct_325.eng-gvn.jsonl}"
HELDOUT_BIBLE_REF_FILE="${HELDOUT_BIBLE_REF_FILE:-$DATA_ROOT/bible/heldout_ref_325.eng-gvn.jsonl}"
OUT_DIR="$OUT_ROOT/$RUN_ID"
LOG_FILE="$LOG_ROOT/$RUN_ID.driver.log"
MONITOR_FILE="$LOG_ROOT/$RUN_ID.resource.csv"
REPORT_FILE="$REPORT_ROOT/$RUN_ID.md"

mkdir -p "$OUT_DIR" "$LOG_ROOT" "$REPORT_ROOT"

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

if [[ ! -d "$BASE_MODEL" ]]; then
  echo "BASE_MODEL directory does not exist: $BASE_MODEL" >&2
  exit 2
fi

"$PYTHON" - "$BASE_MODEL" "$DATA_ROOT" "$MAX_SOURCE_LENGTH" <<'PY' > "$OUT_DIR/source_length_preflight.json"
import json
import statistics
import sys
from pathlib import Path

from transformers import AutoTokenizer

base_model = Path(sys.argv[1])
root = Path(sys.argv[2])
max_source_length = int(sys.argv[3])
tokenizer = AutoTokenizer.from_pretrained(
    str(base_model),
    src_lang="eng_Latn",
    tgt_lang="tpi_Latn",
)

files = [
    "db_usage/train_usage_oversampled.eng-gvn.jsonl",
    "db_usage/train_usage.eng-gvn.jsonl",
    "db_usage/heldout_usage.eng-gvn.jsonl",
    "bible/heldout_direct_325.eng-gvn.jsonl",
    "bible/heldout_ref_325.eng-gvn.jsonl",
    "heldout_all.eng-gvn.jsonl",
]

results = []
for rel in files:
    lens = []
    over = []
    with (root / rel).open(encoding="utf-8") as handle:
        for index, line in enumerate(handle, 1):
            row = json.loads(line)
            text = " ".join(row["input_text"].split())
            length = len(tokenizer(text, truncation=False).input_ids)
            lens.append(length)
            if length > max_source_length:
                over.append({"index": index, "id": row.get("id"), "tokens": length})
    sorted_lens = sorted(lens)
    p95 = sorted_lens[int(len(sorted_lens) * 0.95) - 1] if sorted_lens else 0
    results.append(
        {
            "file": rel,
            "rows": len(lens),
            "min": min(lens) if lens else 0,
            "max": max(lens) if lens else 0,
            "mean": statistics.mean(lens) if lens else 0,
            "median": statistics.median(lens) if lens else 0,
            "p95": p95,
            "max_source_length": max_source_length,
            "over_max_source_length": len(over),
            "first_over_max_source_length": over[:8],
        }
    )
print(json.dumps(results, indent=2, ensure_ascii=False))
PY

{
  echo "# Kuku Yalanji $RUN_ID"
  echo
  echo "Started UTC: $START_UTC"
  echo
  echo "Purpose: domain-separated usage draft continuation from v10.0 merged model."
  echo
  echo "Base model: $BASE_MODEL"
  echo "Training file: $TRAIN_USAGE_FILE"
  echo "Eval train file: $EVAL_TRAIN_USAGE_FILE"
  echo "Heldout usage file: $HELDOUT_USAGE_FILE"
  echo "Decode: greedy, no anti-repeat constraints."
  echo "Batch: $BATCH_SIZE; grad accumulation: $GRADIENT_ACCUMULATION_STEPS; epochs: $EPOCHS; lr: $LEARNING_RATE."
  echo
  echo "## Dataset Manifest"
  echo
  echo '```json'
  cat "$DATA_ROOT/tagged_bible_db_manifest.json"
  echo '```'
  echo
  echo "## Source-Length Preflight"
  echo
  echo '```json'
  cat "$OUT_DIR/source_length_preflight.json"
  echo '```'
  echo
  echo "## GPU"
  echo
  echo '```text'
  nvidia-smi
  echo '```'
} > "$REPORT_FILE"

{
  echo "START_UTC=$START_UTC"
  echo "RUN_ID=$RUN_ID"
  echo "BASE_MODEL=$BASE_MODEL"
  echo "TRAIN_USAGE_FILE=$TRAIN_USAGE_FILE"
  echo "EVAL_TRAIN_USAGE_FILE=$EVAL_TRAIN_USAGE_FILE"
  echo "HELDOUT_USAGE_FILE=$HELDOUT_USAGE_FILE"
  echo "OUT_DIR=$OUT_DIR"
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
} | tee "$LOG_FILE"

"$PYTHON" train_nllb_lora.py \
  --base-model "$BASE_MODEL" \
  --train-file "$TRAIN_USAGE_FILE" \
  --validation-file "$EVAL_TRAIN_USAGE_FILE" \
  --test-file "$EVAL_TRAIN_USAGE_FILE" \
  --output-dir "$OUT_DIR" \
  --direction "$DIRECTION" \
  --source-lang "$SOURCE_LANG" \
  --target-lang "$TARGET_LANG" \
  --epochs "$EPOCHS" \
  --batch-size "$BATCH_SIZE" \
  --gradient-accumulation-steps "$GRADIENT_ACCUMULATION_STEPS" \
  --max-source-length "$MAX_SOURCE_LENGTH" \
  --max-target-length "$MAX_TARGET_LENGTH" \
  --max-validation-samples 128 \
  --max-test-samples 365 \
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
  2>&1 | tee -a "$LOG_FILE"

evaluate_split() {
  local label="$1"
  local data_file="$2"
  "$PYTHON" evaluate_nllb_lora.py \
    --model-dir "$OUT_DIR/merged" \
    --data-file "$data_file" \
    --output-file "$OUT_DIR/eval_${label}_predictions_greedy.json" \
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
    2>&1 | tee "$OUT_DIR/eval_${label}_metrics.stdout.json"

  "$PYTHON" summarize_predictions.py "$OUT_DIR/eval_${label}_predictions_greedy.json" \
    --samples 8 \
    > "$OUT_DIR/eval_${label}_summary.txt"
}

evaluate_split "train_usage" "$EVAL_TRAIN_USAGE_FILE"
evaluate_split "heldout_usage" "$HELDOUT_USAGE_FILE"
evaluate_split "heldout_all" "$HELDOUT_ALL_FILE"
evaluate_split "heldout_bible_direct325" "$HELDOUT_BIBLE_DIRECT_FILE"
evaluate_split "heldout_bible_ref325" "$HELDOUT_BIBLE_REF_FILE"

"$PYTHON" - "$OUT_DIR" <<'PY' > "$OUT_DIR/post_eval_analysis.json"
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
    "train_usage": analyze("eval_train_usage_predictions_greedy.json"),
    "heldout_usage": analyze("eval_heldout_usage_predictions_greedy.json"),
    "heldout_all": analyze("eval_heldout_all_predictions_greedy.json"),
    "heldout_bible_direct325": analyze("eval_heldout_bible_direct325_predictions_greedy.json"),
    "heldout_bible_ref325": analyze("eval_heldout_bible_ref325_predictions_greedy.json"),
}
print(json.dumps(analysis, indent=2, ensure_ascii=False))
PY

"$PYTHON" - "$MONITOR_FILE" <<'PY' > "$OUT_DIR/resource_summary.json"
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
  echo "## Model Manifest"
  echo
  echo '```json'
  cat "$OUT_DIR/model_manifest.json"
  echo '```'
  echo
  echo "## Standalone Metrics"
  echo
  echo '```json'
  cat "$OUT_DIR/post_eval_analysis.json"
  echo '```'
  echo
  echo "## Resource Summary"
  echo
  echo '```json'
  cat "$OUT_DIR/resource_summary.json"
  echo '```'
  echo
  echo "Ended UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$REPORT_FILE"

echo "V17_USAGE_CONTINUATION_DONE"
