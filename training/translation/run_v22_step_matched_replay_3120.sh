#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${WORK_ROOT:-/workspace/v22-step-matched}"
RUN_ID="${RUN_ID:-v22.0-step-matched-replay-3120-gvn}"
PYTHON="${PYTHON:-/opt/mobtranslate-mt-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-$WORK_ROOT/data}"
BASE_MODEL="${BASE_MODEL:-$WORK_ROOT/base_model/merged}"
RESUME_CHECKPOINT="${RESUME_CHECKPOINT:-$WORK_ROOT/input_checkpoint/checkpoint-2770}"
OUT_ROOT="${OUT_ROOT:-$WORK_ROOT/models}"
LOG_ROOT="${LOG_ROOT:-$WORK_ROOT/logs}"
REPORT_ROOT="${REPORT_ROOT:-$WORK_ROOT/reports}"
INPUT_SHA256_FILE="${INPUT_SHA256_FILE:-$WORK_ROOT/SHA256SUMS.v22-inputs}"

SOURCE_LANG="eng_Latn"
TARGET_LANG="gvn_Latn"
DIRECTION="eng-gvn"
MAX_SOURCE_LENGTH=192
MAX_TARGET_LENGTH=208
BATCH_SIZE=8
GRADIENT_ACCUMULATION_STEPS=2
STOP_AFTER_STEPS=3120
LORA_TARGET_MODULES="q_proj,k_proj,v_proj,out_proj,fc1,fc2"
SEED=42

TRAIN_FILE="$DATA_ROOT/train.eng-gvn.jsonl"
VALIDATION_FILE="$DATA_ROOT/validation.eng-gvn.jsonl"
TEST_FILE="$DATA_ROOT/test.eng-gvn.jsonl"
TEST_UNTAGGED_FILE="$DATA_ROOT/synthetic/test_untagged_1606.eng-gvn.jsonl"
ELDER_FILE="$DATA_ROOT/external/elder_sentence_pair_43.eng-gvn.jsonl"
USAGE_FILE="$DATA_ROOT/external/db_usage_heldout_84.eng-gvn.jsonl"
BIBLE_DIRECT_FILE="$DATA_ROOT/external/bible_direct_heldout_325.eng-gvn.jsonl"
BIBLE_REF_FILE="$DATA_ROOT/external/bible_ref_heldout_325.eng-gvn.jsonl"

OUT_DIR="$OUT_ROOT/$RUN_ID"
CURVE_2770_DIR="$OUT_ROOT/${RUN_ID}-curve-step2770"
LOG_FILE="$LOG_ROOT/$RUN_ID.driver.log"
MONITOR_FILE="$LOG_ROOT/$RUN_ID.resource.csv"
REPORT_FILE="$REPORT_ROOT/$RUN_ID.md"

for required in "$PYTHON" "$BASE_MODEL" "$RESUME_CHECKPOINT" "$INPUT_SHA256_FILE" \
  "$SCRIPT_DIR/train_nllb_lora.py" "$SCRIPT_DIR/merge_nllb_lora.py" \
  "$SCRIPT_DIR/evaluate_nllb_lora.py" "$SCRIPT_DIR/analyze_v21_predictions.py" \
  "$SCRIPT_DIR/select_v22_decoding.py" "$SCRIPT_DIR/verify_v22_promotion.py"; do
  if [[ ! -e "$required" ]]; then
    echo "Required path does not exist: $required" >&2
    exit 2
  fi
done

if [[ -d "$OUT_DIR" ]] && [[ -n "$(find "$OUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Refusing nonempty output directory: $OUT_DIR" >&2
  exit 3
fi
mkdir -p "$OUT_DIR" "$CURVE_2770_DIR" "$LOG_ROOT" "$REPORT_ROOT"

cd "$WORK_ROOT"
sha256sum -c "$INPUT_SHA256_FILE" | tee "$LOG_ROOT/$RUN_ID.input-checksums.log"
jq -e '.global_step == 2770' "$RESUME_CHECKPOINT/trainer_state.json" >/dev/null

check_rows() {
  local expected="$1" file="$2"
  local observed
  observed="$(wc -l < "$file")"
  if [[ "$observed" -ne "$expected" ]]; then
    echo "Row-count mismatch for $file: expected $expected, observed $observed" >&2
    exit 4
  fi
}
check_rows 22164 "$TRAIN_FILE"
check_rows 1609 "$VALIDATION_FILE"
check_rows 1606 "$TEST_FILE"
check_rows 1606 "$TEST_UNTAGGED_FILE"
check_rows 43 "$ELDER_FILE"
check_rows 84 "$USAGE_FILE"
check_rows 325 "$BIBLE_DIRECT_FILE"
check_rows 325 "$BIBLE_REF_FILE"

START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"$PYTHON" - "$OUT_DIR/run_contract.json" "$RUN_ID" "$START_UTC" "$DATA_ROOT" "$BASE_MODEL" "$RESUME_CHECKPOINT" <<'PY'
import json
import sys
from pathlib import Path

output, run_id, started_at, data_root, base_model, checkpoint = sys.argv[1:]
contract = {
    "run_id": run_id,
    "owner": "codex",
    "experiment": "v22.0 step-matched balanced-replay continuation",
    "started_at": started_at,
    "data_root": data_root,
    "base_model": base_model,
    "resume_checkpoint": checkpoint,
    "resume_global_step": 2770,
    "stop_global_step": 3120,
    "scheduled_horizon_steps": 4155,
    "train_rows": 22164,
    "validation_rows": 1609,
    "training_receives_test": False,
    "seed": 42,
    "promotion_eligible_before_results": False,
    "speaker_certified": False,
}
Path(output).write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
PY

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

echo "[$START_UTC] resuming sealed step-2770 trajectory to exact step $STOP_AFTER_STEPS" | tee "$LOG_FILE"
"$PYTHON" "$SCRIPT_DIR/train_nllb_lora.py" \
  --base-model "$BASE_MODEL" \
  --train-file "$TRAIN_FILE" --validation-file "$VALIDATION_FILE" \
  --output-dir "$OUT_DIR" \
  --model-version "v22.0-step-matched-replay-3120" --run-id "$RUN_ID" \
  --dataset-id "v21.2-claude-balanced-replay-byte-identical" \
  --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
  --epochs 3 --batch-size "$BATCH_SIZE" --gradient-accumulation-steps "$GRADIENT_ACCUMULATION_STEPS" \
  --max-source-length "$MAX_SOURCE_LENGTH" --max-target-length "$MAX_TARGET_LENGTH" \
  --learning-rate 2e-5 --warmup-ratio 0.0 --weight-decay 0.0 \
  --lora-r 64 --lora-alpha 128 --lora-dropout 0.0 \
  --lora-target-modules "$LORA_TARGET_MODULES" \
  --eval-steps 1385 --save-steps 1385 --save-total-limit 2 --logging-steps 50 \
  --generation-num-beams 1 --generation-no-repeat-ngram-size 0 \
  --generation-repetition-penalty 1.0 --generation-length-penalty 1.0 \
  --seed "$SEED" --no-shuffle-before-cap \
  --resume-from-checkpoint "$RESUME_CHECKPOINT" --stop-after-steps "$STOP_AFTER_STEPS" \
  --no-load-best-model-at-end \
  2>&1 | tee -a "$LOG_FILE"

jq -e '.trainer_state.global_step == 3120 and .training_args.stop_after_steps == 3120 and (.dataset.test_file == null)' \
  "$OUT_DIR/model_manifest.json" >/dev/null
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] exact step and test-isolation checks passed" | tee -a "$LOG_FILE"

run_eval() {
  local model_dir="$1" data_file="$2" prediction_file="$3" metrics_file="$4"
  local no_repeat="$5" repetition_penalty="$6"
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
    --model-dir "$model_dir" --data-file "$data_file" --output-file "$prediction_file" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --batch-size "$BATCH_SIZE" --max-source-length "$MAX_SOURCE_LENGTH" \
    --max-new-tokens "$MAX_TARGET_LENGTH" --num-beams 1 --no-repeat-ngram-size "$no_repeat" \
    --repetition-penalty "$repetition_penalty" --length-penalty 1.0 \
    2>&1 | tee "$metrics_file"
}

analyze_eval() {
  local prediction_file="$1" analysis_file="$2"
  "$PYTHON" "$SCRIPT_DIR/analyze_v21_predictions.py" "$prediction_file" --output "$analysis_file" \
    > "${analysis_file%.json}.stdout.json"
}

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] development-only decoder selection begins" | tee -a "$LOG_FILE"
for spec in "greedy:0:1.0" "nr4:4:1.0" "rp110:0:1.10" "nr4-rp110:4:1.10"; do
  IFS=: read -r decoder_id no_repeat repetition_penalty <<< "$spec"
  prediction="$OUT_DIR/eval_synthetic_dev_1609_predictions_decoder-${decoder_id}.json"
  run_eval "$OUT_DIR/merged" "$VALIDATION_FILE" "$prediction" \
    "$OUT_DIR/eval_synthetic_dev_1609_metrics_decoder-${decoder_id}.stdout.json" \
    "$no_repeat" "$repetition_penalty"
  analyze_eval "$prediction" "$OUT_DIR/eval_synthetic_dev_1609_analysis_decoder-${decoder_id}.json"
done

"$PYTHON" "$SCRIPT_DIR/select_v22_decoding.py" \
  --candidate "greedy=$OUT_DIR/eval_synthetic_dev_1609_predictions_decoder-greedy.json" \
  --candidate "nr4=$OUT_DIR/eval_synthetic_dev_1609_predictions_decoder-nr4.json" \
  --candidate "rp110=$OUT_DIR/eval_synthetic_dev_1609_predictions_decoder-rp110.json" \
  --candidate "nr4-rp110=$OUT_DIR/eval_synthetic_dev_1609_predictions_decoder-nr4-rp110.json" \
  --chrf-noninferiority-margin 1.0 --output "$OUT_DIR/decoder_selection.json" \
  | tee "$OUT_DIR/decoder_selection.stdout.json"

SELECTED_ID="$(jq -r '.selected.id' "$OUT_DIR/decoder_selection.json")"
SELECTED_NO_REPEAT="$(jq -r '.selected.decode.no_repeat_ngram_size' "$OUT_DIR/decoder_selection.json")"
SELECTED_REPETITION_PENALTY="$(jq -r '.selected.decode.repetition_penalty' "$OUT_DIR/decoder_selection.json")"
SELECTION_LOCKED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
jq --arg locked "$SELECTION_LOCKED_UTC" '. + {locked_before_test_at: $locked}' \
  "$OUT_DIR/decoder_selection.json" > "$OUT_DIR/decoder_selection.locked.json"
mv "$OUT_DIR/decoder_selection.locked.json" "$OUT_DIR/decoder_selection.json"
echo "[$SELECTION_LOCKED_UTC] selected decoder $SELECTED_ID; frozen test inference now unlocked" | tee -a "$LOG_FILE"

declare -a EVALUATIONS=(
  "synthetic_dev_1609|$VALIDATION_FILE"
  "synthetic_test_tagged_1606|$TEST_FILE"
  "synthetic_test_untagged_1606|$TEST_UNTAGGED_FILE"
  "elder_sentence_pair_43|$ELDER_FILE"
  "db_usage_heldout_84|$USAGE_FILE"
  "bible_direct_heldout_325|$BIBLE_DIRECT_FILE"
  "bible_ref_heldout_325|$BIBLE_REF_FILE"
)

for item in "${EVALUATIONS[@]}"; do
  IFS='|' read -r label data_file <<< "$item"
  if [[ "$label" == "synthetic_dev_1609" ]]; then
    cp "$OUT_DIR/eval_${label}_predictions_decoder-greedy.json" "$OUT_DIR/eval_${label}_predictions_greedy.json"
    cp "$OUT_DIR/eval_${label}_metrics_decoder-greedy.stdout.json" "$OUT_DIR/eval_${label}_metrics.stdout.json"
  else
    run_eval "$OUT_DIR/merged" "$data_file" "$OUT_DIR/eval_${label}_predictions_greedy.json" \
      "$OUT_DIR/eval_${label}_metrics.stdout.json" 0 1.0
  fi
  analyze_eval "$OUT_DIR/eval_${label}_predictions_greedy.json" "$OUT_DIR/eval_${label}_analysis.json"

  if [[ "$label" == "synthetic_dev_1609" ]]; then
    cp "$OUT_DIR/eval_${label}_predictions_decoder-${SELECTED_ID}.json" \
      "$OUT_DIR/eval_${label}_predictions_selected-${SELECTED_ID}.json"
  else
    run_eval "$OUT_DIR/merged" "$data_file" \
      "$OUT_DIR/eval_${label}_predictions_selected-${SELECTED_ID}.json" \
      "$OUT_DIR/eval_${label}_metrics_selected-${SELECTED_ID}.stdout.json" \
      "$SELECTED_NO_REPEAT" "$SELECTED_REPETITION_PENALTY"
  fi
  analyze_eval "$OUT_DIR/eval_${label}_predictions_selected-${SELECTED_ID}.json" \
    "$OUT_DIR/eval_${label}_analysis_selected-${SELECTED_ID}.json"
done

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] deriving step-2770 baseline curve point" | tee -a "$LOG_FILE"
"$PYTHON" "$SCRIPT_DIR/merge_nllb_lora.py" \
  --base-model "$BASE_MODEL" --adapter-dir "$RESUME_CHECKPOINT" --output-dir "$CURVE_2770_DIR/merged" \
  --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" --num-beams 1 \
  --no-repeat-ngram-size 0 --repetition-penalty 1.0 --length-penalty 1.0 \
  2>&1 | tee "$CURVE_2770_DIR/merge.stdout.log"
for item in "${EVALUATIONS[@]}"; do
  IFS='|' read -r label data_file <<< "$item"
  run_eval "$CURVE_2770_DIR/merged" "$data_file" "$CURVE_2770_DIR/eval_${label}_predictions_greedy.json" \
    "$CURVE_2770_DIR/eval_${label}_metrics.stdout.json" 0 1.0
  analyze_eval "$CURVE_2770_DIR/eval_${label}_predictions_greedy.json" \
    "$CURVE_2770_DIR/eval_${label}_analysis.json"
done

"$PYTHON" "$SCRIPT_DIR/verify_v22_promotion.py" --model-dir "$OUT_DIR" \
  --selected-id "$SELECTED_ID" --output "$OUT_DIR/promotion_gate.json" \
  | tee "$OUT_DIR/promotion_gate.stdout.json"

"$PYTHON" - "$MONITOR_FILE" "$OUT_DIR/resource_summary.json" <<'PY'
import csv
import json
import statistics
import sys
from pathlib import Path

source, output = map(Path, sys.argv[1:])
rows = list(csv.DictReader(source.open(encoding="utf-8"))) if source.exists() else []
result = {"samples": len(rows), "start": rows[0]["timestamp"] if rows else None, "end": rows[-1]["timestamp"] if rows else None}
for key in ("gpu_util_pct", "gpu_mem_used_mib", "gpu_power_w", "python_cpu_pct", "python_rss_mib", "ram_used_mib", "workspace_used_pct"):
    values = []
    for row in rows:
        try:
            values.append(float(row[key]))
        except (KeyError, TypeError, ValueError):
            pass
    if values:
        result[f"mean_{key}"] = statistics.mean(values)
        result[f"max_{key}"] = max(values)
output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
PY

END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "# $RUN_ID"
  echo
  echo "Started UTC: $START_UTC"
  echo
  echo "Finished UTC: $END_UTC"
  echo
  echo "Selected decoder: $SELECTED_ID"
  echo
  echo "Promotion gate: $(jq -r '.status' "$OUT_DIR/promotion_gate.json")"
  echo
  echo "Final global step: $(jq -r '.trainer_state.global_step' "$OUT_DIR/model_manifest.json")"
  echo
  echo "This automatic result is not speaker certification."
} > "$REPORT_FILE"

touch "$OUT_DIR/RUN_COMPLETE"
echo "[$END_UTC] $RUN_ID complete; fetch and verify all artifacts before deleting the pod" | tee -a "$LOG_FILE"
