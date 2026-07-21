#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export RUN_ID="${RUN_ID:-v15.0-soft-lexical-hint-bible-gvn-token-2048row-15epoch-batch16}"
export DATA_ROOT="${DATA_ROOT:-/workspace/data/kuku_yalanji_v15_lexical_hint_bible}"
export TARGET_LANG="${TARGET_LANG:-gvn_Latn}"
export TARGET_LANG_INIT_FROM="${TARGET_LANG_INIT_FROM:-tpi_Latn}"
export MODULES_TO_SAVE="${MODULES_TO_SAVE:-}"
export EPOCHS="${EPOCHS:-15}"
export BATCH_SIZE="${BATCH_SIZE:-16}"
export GRADIENT_ACCUMULATION_STEPS="${GRADIENT_ACCUMULATION_STEPS:-1}"
export MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-128}"
export MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-128}"
export MAX_TRAIN_SAMPLES="${MAX_TRAIN_SAMPLES:-2048}"
export MAX_VALIDATION_SAMPLES="${MAX_VALIDATION_SAMPLES:-256}"
export MAX_TEST_SAMPLES="${MAX_TEST_SAMPLES:-256}"
export EVAL_STEPS="${EVAL_STEPS:-512}"
export SAVE_STEPS="${SAVE_STEPS:-512}"
export LOGGING_STEPS="${LOGGING_STEPS:-128}"

"$SCRIPT_DIR/run_v9_tagged_multitask.sh"

OUT_DIR="${OUT_ROOT:-/workspace/models/kuku-yalanji-nllb-lora}/$RUN_ID"
PYTHON="${PYTHON:-/workspace/venv/bin/python}"
DIRECTION="${DIRECTION:-eng-gvn}"
SOURCE_LANG="${SOURCE_LANG:-eng_Latn}"
TARGET_LANG="${TARGET_LANG:-gvn_Latn}"

evaluate_extra_split() {
  local label="$1"
  local data_file="$2"
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
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

  "$PYTHON" "$SCRIPT_DIR/summarize_predictions.py" "$OUT_DIR/eval_${label}_predictions_greedy.json" \
    --samples 8 \
    > "$OUT_DIR/eval_${label}_summary.txt"
}

evaluate_extra_split "nohint_train_direct2048" "$DATA_ROOT/nohint/eval_train_direct.eng-gvn.jsonl"
evaluate_extra_split "nohint_train_ref2048" "$DATA_ROOT/nohint/eval_train_ref.eng-gvn.jsonl"
evaluate_extra_split "nohint_heldout_direct325" "$DATA_ROOT/nohint/heldout_direct_325.eng-gvn.jsonl"
evaluate_extra_split "nohint_heldout_ref325" "$DATA_ROOT/nohint/heldout_ref_325.eng-gvn.jsonl"

"$PYTHON" - "$OUT_DIR" <<'PY' > "$OUT_DIR/v15_nohint_extra_eval_analysis.json"
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
    return {"mean": statistics.mean(values), "median": statistics.median(values), "min": min(values), "max": max(values)}

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
    "nohint_train_direct2048": analyze("eval_nohint_train_direct2048_predictions_greedy.json"),
    "nohint_train_ref2048": analyze("eval_nohint_train_ref2048_predictions_greedy.json"),
    "nohint_heldout_direct325": analyze("eval_nohint_heldout_direct325_predictions_greedy.json"),
    "nohint_heldout_ref325": analyze("eval_nohint_heldout_ref325_predictions_greedy.json"),
}
print(json.dumps(analysis, indent=2, ensure_ascii=False))
PY

REPORT_FILE="${REPORT_ROOT:-/workspace/reports}/$RUN_ID.md"
{
  echo
  echo "## v15 No-Hint Extra Evaluation"
  echo
  echo '```json'
  cat "$OUT_DIR/v15_nohint_extra_eval_analysis.json"
  echo '```'
} >> "$REPORT_FILE"

echo "V15_EXTRA_EVAL_DONE"
