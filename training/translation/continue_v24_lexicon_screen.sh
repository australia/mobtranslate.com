#!/usr/bin/env bash
set -euo pipefail

# Protocol-amended continuation after C0 established that BF16 delta merging can
# move an argmax boundary. Training is unchanged; canonical comparisons use the
# saved adapter over the frozen base in float32.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${WORK_ROOT:-/workspace/v24-lexicon-screen}"
PYTHON="${PYTHON:-/opt/mobtranslate-v24-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-$WORK_ROOT/data}"
BASE_MODEL="${BASE_MODEL:-$WORK_ROOT/base_model/merged}"
OUT_ROOT="${OUT_ROOT:-$WORK_ROOT/models}"
ANALYSIS_ROOT="${ANALYSIS_ROOT:-$WORK_ROOT/analysis}"
LOG_ROOT="${LOG_ROOT:-$WORK_ROOT/logs}"

SOURCE_LANG="eng_Latn"
TARGET_LANG="gvn_Latn"
DIRECTION="eng-gvn"
MAX_SOURCE_LENGTH=192
MAX_TARGET_LENGTH=208
SEED=17
PLANNED_MAX_STEPS=4152
SCREEN_STOP_STEP=1384
EVAL_STEPS=4152
SAVE_STEPS=1384
LEARNING_RATE=1e-5
TOKEN_TOLERANCE=0.05
ARMS=(L1 L2 L4)

DEV_SUITE="$DATA_ROOT/development-suite.eng-gvn.jsonl"
TOKEN_AUDIT="$DATA_ROOT/token-audit.json"
DATASET_MANIFEST="$DATA_ROOT/training/MANIFEST.json"
CONTINUATION_MONITOR="$LOG_ROOT/v24-resource-continuation.csv"
CONTINUATION_LOG="$LOG_ROOT/v24-continuation.log"

for required in \
  "$PYTHON" "$BASE_MODEL" "$DEV_SUITE" "$TOKEN_AUDIT" "$DATASET_MANIFEST" \
  "$OUT_ROOT/B0.development.predictions.json" \
  "$OUT_ROOT/C0/development.merged-float32.predictions.json" \
  "$OUT_ROOT/C0/model_manifest.json" \
  "$SCRIPT_DIR/train_nllb_lora.py" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
  "$SCRIPT_DIR/merge_nllb_lora.py" "$SCRIPT_DIR/audit_nllb_language_token.py" \
  "$SCRIPT_DIR/select_v24_screen.py"; do
  [[ -e "$required" ]] || { echo "Required continuation input is absent: $required" >&2; exit 2; }
done
for arm in "${ARMS[@]}"; do
  [[ ! -e "$OUT_ROOT/$arm" ]] || { echo "Refusing pre-existing treatment output: $OUT_ROOT/$arm" >&2; exit 3; }
done

[[ "$(wc -l < "$DEV_SUITE")" -eq 2086 ]] || { echo "Wrong development-suite row count" >&2; exit 4; }
jq -e \
  --argjson planned "$PLANNED_MAX_STEPS" --argjson stop "$SCREEN_STOP_STEP" \
  '.trainer_state.global_step == $stop
   and .training_args.max_steps == $planned
   and .training_args.stop_after_steps == $stop
   and .dataset.test_file == null' \
  "$OUT_ROOT/C0/model_manifest.json" >/dev/null
"$PYTHON" - "$OUT_ROOT/B0.development.predictions.json" \
  "$OUT_ROOT/C0/development.merged-float32.predictions.json" <<'PY'
import json
import sys

for path in sys.argv[1:]:
    payload = json.load(open(path, encoding="utf-8"))
    assert payload["metrics"]["rows"] == 2086, path
    assert payload["metrics"]["empty_outputs"] == 0, path
assert json.load(open(sys.argv[2], encoding="utf-8"))["metrics"]["dtype"] == "torch.float32"
PY

export PYTHONHASHSEED=0
export TOKENIZERS_PARALLELISM=false
export CUBLAS_WORKSPACE_CONFIG=:4096:8
export NVIDIA_TF32_OVERRIDE=0
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1

START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DATASET_SHA="$(sha256sum "$DATASET_MANIFEST" | awk '{print $1}')"
BASE_SHA="$(sha256sum "$BASE_MODEL/model.safetensors" | awk '{print $1}')"
SCRIPT_SHA="$(sha256sum "$0" | awk '{print $1}')"
"$PYTHON" - "$ANALYSIS_ROOT/protocol-amendment-adapter-float32.json" \
  "$START_UTC" "$DATASET_SHA" "$BASE_SHA" "$SCRIPT_SHA" <<'PY'
import json
import sys
from pathlib import Path

output, started, dataset_sha, base_sha, script_sha = sys.argv[1:]
record = {
    "schema_version": 1,
    "started_at": started,
    "reason": (
        "C0 showed one decoded disagreement in 16 rows when a float32 adapter path was compared "
        "with a BF16 in-memory merge. The adapter stores float32 deltas while the frozen base and "
        "training merge store BF16 weights; applying the delta before versus after BF16 rounding "
        "is not numerically identical near an argmax boundary."
    ),
    "timing": "adopted before any L1, L2, or L4 weights or predictions existed",
    "unchanged": [
        "base weights", "training rows", "row order", "seed", "optimizer", "learning-rate schedule",
        "planned and observed update counts", "batching", "decoder", "development endpoints", "selection rule"
    ],
    "canonical_candidate_path": (
        "frozen BF16 base expanded to float32 plus saved float32 LoRA adapter, serialized as a "
        "float32 merge after parity verification"
    ),
    "packaging_rule": (
        "A selected adapter may be merged only in float32; adapter and reloaded float32 merge must "
        "produce identical text on the parity sample and subsequently on every published evaluation set."
    ),
    "original_bf16_merge_retained_as_evidence": True,
    "dataset_manifest_sha256": dataset_sha,
    "base_model_safetensors_sha256": base_sha,
    "continuation_script_sha256": script_sha,
}
Path(output).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
PY

monitor_pid=""
if [[ -x "$SCRIPT_DIR/run_resource_monitor.sh" ]]; then
  INTERVAL_SECONDS=5 "$SCRIPT_DIR/run_resource_monitor.sh" "$CONTINUATION_MONITOR" &
  monitor_pid="$!"
fi
cleanup() {
  [[ -z "$monitor_pid" ]] || kill "$monitor_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

run_eval() {
  local model_dir="$1" output_file="$2" max_rows="${3:-}" adapter_dir="${4:-}"
  local args=(
    --model-dir "$model_dir" --data-file "$DEV_SUITE" --output-file "$output_file"
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG"
    --batch-size 8 --max-source-length "$MAX_SOURCE_LENGTH" --max-new-tokens "$MAX_TARGET_LENGTH"
    --num-beams 1 --no-repeat-ngram-size 4 --repetition-penalty 1.10 --length-penalty 1.0
    --dtype float32 --require-cuda --deterministic --seed 0
  )
  [[ -z "$max_rows" ]] || args+=(--max-rows "$max_rows")
  [[ -z "$adapter_dir" ]] || args+=(--adapter-dir "$adapter_dir")
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
    "${args[@]}" \
    2>&1 | tee "${output_file%.json}.metrics.log"
}

merge_and_evaluate() {
  local output_dir="$1"
  "$PYTHON" "$SCRIPT_DIR/merge_nllb_lora.py" \
    --base-model "$BASE_MODEL" --adapter-dir "$output_dir/adapter" \
    --output-dir "$output_dir/merged-float32" \
    --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" --dtype float32 \
    --num-beams 1 --no-repeat-ngram-size 4 --repetition-penalty 1.10 --length-penalty 1.0 \
    2>&1 | tee "$output_dir/merge-float32.log"
  (
    cd "$output_dir/merged-float32"
    sha256sum *.safetensors model.safetensors.index.json > ../merged-float32.sha256
  )
  run_eval "$BASE_MODEL" "$output_dir/parity.adapter-float32.predictions.json" 16 "$output_dir/adapter"
  run_eval "$output_dir/merged-float32" "$output_dir/development.merged-float32.predictions.json"
  "$PYTHON" - \
    "$output_dir/parity.adapter-float32.predictions.json" \
    "$output_dir/development.merged-float32.predictions.json" \
    "$output_dir/adapter-merge-float32-parity.json" <<'PY'
import json
import sys
from pathlib import Path

adapter_path, merged_path, output_path = map(Path, sys.argv[1:])
adapter = json.loads(adapter_path.read_text(encoding="utf-8"))["predictions"]
merged = json.loads(merged_path.read_text(encoding="utf-8"))["predictions"][: len(adapter)]
adapter_rows = [(row["id"], row["prediction"]) for row in adapter]
merged_rows = [(row["id"], row["prediction"]) for row in merged]
differences = [
    {"id": left[0], "adapter": left[1], "merged": right[1]}
    for left, right in zip(adapter_rows, merged_rows, strict=True)
    if left != right
]
result = {
    "status": "PASS" if not differences else "FAIL",
    "rows": len(adapter_rows),
    "adapter_equals_reloaded_float32_merge": not differences,
    "differences": differences,
}
output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
if differences:
    raise SystemExit("adapter/reloaded-float32-merge predictions differ")
PY
}

candidate_args=(
  --candidate "B0=$OUT_ROOT/B0.development.predictions.json"
  --candidate "C0=$OUT_ROOT/C0/development.merged-float32.predictions.json"
)

for arm in "${ARMS[@]}"; do
  batch_size="$(jq -r --arg arm "$arm" '.matched_update_schedule.arms[$arm].micro_batch_size' "$TOKEN_AUDIT")"
  gradient_accumulation="$(jq -r --arg arm "$arm" '.matched_update_schedule.arms[$arm].gradient_accumulation_steps' "$TOKEN_AUDIT")"
  train_file="$DATA_ROOT/training/arms/$arm/train.eng-gvn.jsonl"
  validation_file="$DATA_ROOT/training/arms/$arm/validation.eng-gvn.jsonl"
  output_dir="$OUT_ROOT/$arm"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] training $arm batch=$batch_size accum=$gradient_accumulation" \
    | tee -a "$CONTINUATION_LOG"
  "$PYTHON" "$SCRIPT_DIR/train_nllb_lora.py" \
    --base-model "$BASE_MODEL" --train-file "$train_file" --validation-file "$validation_file" \
    --output-dir "$output_dir" --model-version "v24.0-screen-$arm-seed$SEED-step$SCREEN_STOP_STEP" \
    --run-id "v24.0-screen-$arm-seed$SEED-step$SCREEN_STOP_STEP" \
    --dataset-id "v24.0-lexicon-grounded-screen-$arm" \
    --dataset-release-sha256 "$DATASET_SHA" \
    --license "research-only; source-specific rights and upstream NLLB CC-BY-NC apply" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --max-steps "$PLANNED_MAX_STEPS" --stop-after-steps "$SCREEN_STOP_STEP" \
    --epochs 999 --batch-size "$batch_size" --gradient-accumulation-steps "$gradient_accumulation" \
    --max-source-length "$MAX_SOURCE_LENGTH" --max-target-length "$MAX_TARGET_LENGTH" \
    --learning-rate "$LEARNING_RATE" --warmup-ratio 0.05 --weight-decay 0.01 \
    --lora-r 32 --lora-alpha 64 --lora-dropout 0.05 \
    --lora-target-modules "q_proj,k_proj,v_proj,out_proj,fc1,fc2" \
    --eval-steps "$EVAL_STEPS" --save-steps "$SAVE_STEPS" \
    --save-total-limit 5 --logging-steps 20 \
    --generation-num-beams 1 --generation-no-repeat-ngram-size 4 \
    --generation-repetition-penalty 1.10 --generation-length-penalty 1.0 \
    --seed "$SEED" --full-determinism --no-shuffle-before-cap --no-load-best-model-at-end \
    2>&1 | tee "$LOG_ROOT/$arm.train.log"

  jq -e \
    --argjson max_steps "$PLANNED_MAX_STEPS" --argjson stop "$SCREEN_STOP_STEP" \
    --argjson batch "$batch_size" --argjson accum "$gradient_accumulation" \
    '.dataset.test_file == null
     and .trainer_state.global_step == $stop
     and .training_args.max_steps == $max_steps
     and .training_args.stop_after_steps == $stop
     and .training_args.batch_size == $batch
     and .training_args.gradient_accumulation_steps == $accum
     and .training_args.full_determinism == true
     and .training_args.load_best_model_at_end == false' \
    "$output_dir/model_manifest.json" >/dev/null

  "$PYTHON" "$SCRIPT_DIR/audit_nllb_language_token.py" \
    --model-dir "$output_dir/merged" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --output "$output_dir/language-token-audit.json" --require-cuda \
    > "$LOG_ROOT/$arm-language-token-audit.stdout.json"
  merge_and_evaluate "$output_dir"
  candidate_args+=(--candidate "$arm=$output_dir/development.merged-float32.predictions.json")
done

"$PYTHON" - "$OUT_ROOT" "$TOKEN_TOLERANCE" "$ANALYSIS_ROOT/actual-token-exposure-gate.json" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
tolerance = float(sys.argv[2])
output = Path(sys.argv[3])
arms = ["C0", "L1", "L2", "L4"]
records = {}
for arm in arms:
    manifest = json.loads((root / arm / "model_manifest.json").read_text(encoding="utf-8"))
    exposure = manifest["trainer_state"]["actual_training_exposure"]
    steps = manifest["trainer_state"]["global_step"]
    records[arm] = {
        "global_step": steps,
        "examples": exposure["examples"],
        "non_padding_tokens": exposure["non_padding_tokens"],
        "non_padding_tokens_per_update": exposure["non_padding_tokens"] / steps,
        "by_task": exposure["by_task"],
    }
reference = records["C0"]["non_padding_tokens_per_update"]
checks = {}
for arm, record in records.items():
    relative = (record["non_padding_tokens_per_update"] - reference) / reference
    record["relative_difference_from_C0"] = relative
    checks[f"{arm}_global_step_1384"] = record["global_step"] == 1384
    checks[f"{arm}_tokens_within_tolerance"] = abs(relative) <= tolerance
checks["C0_has_no_lexical_forwards"] = "dictionary_lexeme" not in records["C0"]["by_task"]
for arm in ("L1", "L2", "L4"):
    checks[f"{arm}_has_lexical_forwards"] = records[arm]["by_task"].get("dictionary_lexeme", {}).get("examples", 0) > 0
result = {
    "status": "PASS" if all(checks.values()) else "FAIL",
    "relative_tolerance": tolerance,
    "records": records,
    "checks": checks,
}
output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
if result["status"] != "PASS":
    raise SystemExit("actual token-exposure contract failed")
PY

"$PYTHON" "$SCRIPT_DIR/select_v24_screen.py" "${candidate_args[@]}" \
  --baseline-label B0 --control-label C0 --lexical-endpoint lexicon_closed_set \
  --retention-endpoint synthetic_dev --retention-endpoint natural_dev_text36 \
  --retention-endpoint usage_diagnostic --retention-endpoint elder_diagnostic \
  --minimum-exact-gain-over-control 10 --chrf-noninferiority-margin 1.0 \
  --bootstrap-samples 10000 --seed "v24-screen-seed17-step1384" \
  --output "$ANALYSIS_ROOT/screen-selection.json" \
  | tee "$LOG_ROOT/screen-selection.stdout.json"

cleanup
trap - EXIT
FINISHED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DECISION="$(jq -r '.decision.status' "$ANALYSIS_ROOT/screen-selection.json")"
SELECTED="$(jq -r '.decision.selected_label // "none"' "$ANALYSIS_ROOT/screen-selection.json")"
echo "[$FINISHED_UTC] continuation complete decision=$DECISION selected=$SELECTED" \
  | tee -a "$CONTINUATION_LOG"
printf '{"status":"%s","selected":"%s","finished_at":"%s"}\n' \
  "$DECISION" "$SELECTED" "$FINISHED_UTC"
