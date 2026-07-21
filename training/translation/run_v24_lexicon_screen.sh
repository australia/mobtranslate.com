#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${WORK_ROOT:-/workspace/v24-lexicon-screen}"
PYTHON="${PYTHON:-/opt/mobtranslate-v24-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-$WORK_ROOT/data}"
BASE_MODEL="${BASE_MODEL:-$WORK_ROOT/base_model/merged}"
OUT_ROOT="${OUT_ROOT:-$WORK_ROOT/models}"
ANALYSIS_ROOT="${ANALYSIS_ROOT:-$WORK_ROOT/analysis}"
LOG_ROOT="${LOG_ROOT:-$WORK_ROOT/logs}"
INPUT_SHA256_FILE="${INPUT_SHA256_FILE:-$WORK_ROOT/SHA256SUMS.v24-inputs}"

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
DECODER_NO_REPEAT=4
DECODER_REPETITION_PENALTY=1.10
TOKEN_TOLERANCE=0.05
ARMS=(C0 L1 L2 L4)

DEV_SUITE="$DATA_ROOT/development-suite.eng-gvn.jsonl"
TOKEN_AUDIT="$DATA_ROOT/token-audit.json"
DATASET_MANIFEST="$DATA_ROOT/training/MANIFEST.json"
MONITOR_FILE="$LOG_ROOT/v24-resource.csv"
DRIVER_LOG="$LOG_ROOT/v24-driver.log"

required_paths=(
  "$PYTHON" "$DATA_ROOT" "$BASE_MODEL" "$INPUT_SHA256_FILE"
  "$DEV_SUITE" "$TOKEN_AUDIT" "$DATASET_MANIFEST"
  "$SCRIPT_DIR/train_nllb_lora.py" "$SCRIPT_DIR/evaluate_nllb_lora.py"
  "$SCRIPT_DIR/audit_nllb_language_token.py" "$SCRIPT_DIR/select_v24_screen.py"
)
for required in "${required_paths[@]}"; do
  if [[ ! -e "$required" ]]; then
    echo "Required path does not exist: $required" >&2
    exit 2
  fi
done
for command in jq sha256sum nvidia-smi; do
  if ! command -v "$command" >/dev/null; then
    echo "Required command is unavailable: $command" >&2
    exit 2
  fi
done
if [[ -e "$OUT_ROOT" ]] || [[ -e "$ANALYSIS_ROOT" ]]; then
  echo "Refusing existing model or analysis output root" >&2
  exit 3
fi
mkdir -p "$OUT_ROOT" "$ANALYSIS_ROOT" "$LOG_ROOT"

cd "$WORK_ROOT"
sha256sum -c "$INPUT_SHA256_FILE" | tee "$LOG_ROOT/input-checksums.log"

check_hash() {
  local expected="$1" path="$2"
  local observed
  observed="$(sha256sum "$path" | awk '{print $1}')"
  if [[ "$observed" != "$expected" ]]; then
    echo "Hash mismatch for $path: expected $expected, observed $observed" >&2
    exit 4
  fi
  printf '%s  %s\n' "$observed" "$path"
}
{
  check_hash "7f9d0fe325e9e4568e45f13179adb336b93bbd53e83ddab2826e999eba3c76f7" \
    "$BASE_MODEL/model.safetensors"
  check_hash "8b1ff7577221948cb9b9ffd9e2e64dda4e19be42c1465fe1d4b23f3a7e3e5f00" \
    "$BASE_MODEL/config.json"
  check_hash "9041375d4d92d6b87628b57b64103d0ce1974559b7ccf146e871656b754fc8ed" \
    "$BASE_MODEL/tokenizer.json"
  check_hash "56869e2f435f78b97bb8d57b47da2ebd922de3770707cc79ec9aa66e8dfdf060" \
    "$BASE_MODEL/generation_config.json"
} | tee "$LOG_ROOT/base-checksums.log"

for arm in "${ARMS[@]}"; do
  train_file="$DATA_ROOT/training/arms/$arm/train.eng-gvn.jsonl"
  [[ -f "$train_file" ]] || { echo "Missing arm: $train_file" >&2; exit 5; }
  [[ "$(wc -l < "$train_file")" -eq 22164 ]] || { echo "Wrong row count: $arm" >&2; exit 5; }
done
[[ "$(wc -l < "$DEV_SUITE")" -eq 2086 ]] || { echo "Wrong development-suite row count" >&2; exit 5; }
jq -e \
  --argjson planned "$PLANNED_MAX_STEPS" \
  --argjson stop "$SCREEN_STOP_STEP" \
  '.status == "PASS"
   and .matched_update_schedule.planned_max_steps == $planned
   and .matched_update_schedule.screen_stop_step == $stop
   and ([.matched_update_schedule.arms[].within_relative_tolerance] | all)' \
  "$TOKEN_AUDIT" >/dev/null

export PYTHONHASHSEED=0
export TOKENIZERS_PARALLELISM=false
export CUBLAS_WORKSPACE_CONFIG=:4096:8
export NVIDIA_TF32_OVERRIDE=0
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1

"$PYTHON" - "$ANALYSIS_ROOT/environment.json" <<'PY'
import importlib.metadata as metadata
import json
import platform
import subprocess
import sys
from pathlib import Path
import torch

if not torch.cuda.is_available():
    raise SystemExit("CUDA is unavailable")
result = {
    "python": platform.python_version(),
    "platform": platform.platform(),
    "torch": torch.__version__,
    "cuda": torch.version.cuda,
    "gpu": torch.cuda.get_device_name(0),
    "gpu_capability": list(torch.cuda.get_device_capability(0)),
    "nvidia_smi": subprocess.check_output(["nvidia-smi", "-L"], text=True).strip(),
    "packages": {},
}
for package in (
    "accelerate", "datasets", "evaluate", "peft", "sacrebleu", "sentencepiece",
    "tensorboard", "tokenizers", "transformers",
):
    result["packages"][package] = metadata.version(package)
expected = {
    "accelerate": "1.14.0", "datasets": "4.8.5", "evaluate": "0.4.6",
    "peft": "0.19.1", "sacrebleu": "2.6.0", "sentencepiece": "0.2.2",
    "tensorboard": "2.21.0", "tokenizers": "0.21.4", "transformers": "4.48.3",
}
if result["packages"] != expected:
    raise SystemExit(f"Package lock mismatch: {result['packages']!r}")
Path(sys.argv[1]).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
PY

START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DATASET_SHA="$(sha256sum "$DATASET_MANIFEST" | awk '{print $1}')"
"$PYTHON" - "$ANALYSIS_ROOT/run_contract.json" "$START_UTC" "$DATASET_SHA" <<'PY'
import json
import sys
from pathlib import Path

output, started_at, dataset_sha = sys.argv[1:]
contract = {
    "schema_version": 1,
    "run_id": "v24.0-lexicon-grounded-one-seed-screen",
    "started_at": started_at,
    "stage": "development-only screen",
    "base_model": "exact v21.2 merged guarded bundle",
    "dataset_manifest_sha256": dataset_sha,
    "seed": 17,
    "arms": ["B0", "C0", "L1", "L2", "L4"],
    "planned_max_steps": 4152,
    "screen_stop_step": 1384,
    "evaluation_steps": 4152,
    "save_steps": 1384,
    "validation_passes_before_screen_selection": "one post-training pass per arm",
    "load_best_model_at_end": False,
    "learning_rate": 1e-5,
    "weight_comparison_decoder": {
        "num_beams": 1,
        "no_repeat_ngram_size": 4,
        "repetition_penalty": 1.10,
        "length_penalty": 1.0,
    },
    "final_test_opened": False,
    "bible_rows_in_training": 0,
    "promotion_or_deployment_authority": False,
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

run_eval() {
  local model_dir="$1" output_file="$2" max_rows="${3:-}" adapter_dir="${4:-}"
  local args=(
    --model-dir "$model_dir" --data-file "$DEV_SUITE" --output-file "$output_file"
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG"
    --batch-size 8 --max-source-length "$MAX_SOURCE_LENGTH" --max-new-tokens "$MAX_TARGET_LENGTH"
    --num-beams 1 --no-repeat-ngram-size "$DECODER_NO_REPEAT"
    --repetition-penalty "$DECODER_REPETITION_PENALTY" --length-penalty 1.0
    --dtype float32 --require-cuda --deterministic --seed 0
  )
  [[ -z "$max_rows" ]] || args+=(--max-rows "$max_rows")
  [[ -z "$adapter_dir" ]] || args+=(--adapter-dir "$adapter_dir")
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" "${args[@]}" \
    2>&1 | tee "${output_file%.json}.metrics.log"
}

echo "[$START_UTC] base language-token audit and B0 inference" | tee "$DRIVER_LOG"
"$PYTHON" "$SCRIPT_DIR/audit_nllb_language_token.py" \
  --model-dir "$BASE_MODEL" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
  --output "$ANALYSIS_ROOT/B0-language-token-audit.json" --require-cuda \
  > "$LOG_ROOT/B0-language-token-audit.stdout.json"
run_eval "$BASE_MODEL" "$OUT_ROOT/B0.development.predictions.json"

candidate_args=(--candidate "B0=$OUT_ROOT/B0.development.predictions.json")
for arm in "${ARMS[@]}"; do
  batch_size="$(jq -r --arg arm "$arm" '.matched_update_schedule.arms[$arm].micro_batch_size' "$TOKEN_AUDIT")"
  gradient_accumulation="$(jq -r --arg arm "$arm" '.matched_update_schedule.arms[$arm].gradient_accumulation_steps' "$TOKEN_AUDIT")"
  train_file="$DATA_ROOT/training/arms/$arm/train.eng-gvn.jsonl"
  validation_file="$DATA_ROOT/training/arms/$arm/validation.eng-gvn.jsonl"
  output_dir="$OUT_ROOT/$arm"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] training $arm batch=$batch_size accum=$gradient_accumulation" \
    | tee -a "$DRIVER_LOG"
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
    --generation-num-beams 1 --generation-no-repeat-ngram-size "$DECODER_NO_REPEAT" \
    --generation-repetition-penalty "$DECODER_REPETITION_PENALTY" \
    --generation-length-penalty 1.0 --seed "$SEED" --full-determinism \
    --no-shuffle-before-cap --no-load-best-model-at-end \
    2>&1 | tee "$LOG_ROOT/$arm.train.log"

  jq -e \
    --argjson max_steps "$PLANNED_MAX_STEPS" \
    --argjson stop "$SCREEN_STOP_STEP" \
    --argjson batch "$batch_size" \
    --argjson accum "$gradient_accumulation" \
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
  run_eval "$output_dir/merged" "$output_dir/development.predictions.json"
  run_eval "$BASE_MODEL" "$output_dir/parity.adapter.predictions.json" 16 "$output_dir/adapter"
  run_eval "$output_dir/merged" "$output_dir/parity.merged.predictions.json" 16
  "$PYTHON" - \
    "$output_dir/parity.adapter.predictions.json" \
    "$output_dir/parity.merged.predictions.json" \
    "$output_dir/adapter-merge-parity.json" <<'PY'
import json
import sys
from pathlib import Path

adapter_path, merged_path, output_path = map(Path, sys.argv[1:])
adapter = json.loads(adapter_path.read_text(encoding="utf-8"))["predictions"]
merged = json.loads(merged_path.read_text(encoding="utf-8"))["predictions"]
adapter_rows = [(row["id"], row["prediction"]) for row in adapter]
merged_rows = [(row["id"], row["prediction"]) for row in merged]
result = {
    "status": "PASS" if adapter_rows == merged_rows else "FAIL",
    "rows": len(adapter_rows),
    "adapter_equals_reloaded_merge": adapter_rows == merged_rows,
}
output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
if result["status"] != "PASS":
    raise SystemExit("adapter/reloaded-merge predictions differ")
PY
  candidate_args+=(--candidate "$arm=$output_dir/development.predictions.json")
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
checks["C0_has_no_lexical_forward"] = "dictionary_lexeme" not in records["C0"]["by_task"]
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
"$PYTHON" - "$MONITOR_FILE" "$ANALYSIS_ROOT/resource-summary.json" <<'PY'
import csv
import json
import statistics
import sys
from pathlib import Path

source, output = map(Path, sys.argv[1:])
rows = list(csv.DictReader(source.open(encoding="utf-8"))) if source.exists() else []
result = {"samples": len(rows)}
for key in (
    "gpu_util_pct", "gpu_mem_used_mib", "gpu_power_w", "python_cpu_pct",
    "python_rss_mib", "ram_used_mib", "workspace_used_pct",
):
    values = []
    for row in rows:
        try:
            values.append(float(row[key]))
        except (KeyError, TypeError, ValueError):
            pass
    if values:
        result[f"mean_{key}"] = statistics.fmean(values)
        result[f"max_{key}"] = max(values)
if result.get("max_gpu_util_pct", 0) <= 0 or result.get("max_gpu_mem_used_mib", 0) < 1000:
    raise SystemExit("resource monitor did not observe real GPU work")
output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
PY

FINISHED_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DECISION="$(jq -r '.decision.status' "$ANALYSIS_ROOT/screen-selection.json")"
SELECTED="$(jq -r '.decision.selected_label // "none"' "$ANALYSIS_ROOT/screen-selection.json")"
echo "[$FINISHED_UTC] v24 screen complete decision=$DECISION selected=$SELECTED" | tee -a "$DRIVER_LOG"
jq \
  --arg finished "$FINISHED_UTC" --arg decision "$DECISION" --arg selected "$SELECTED" \
  '. + {finished_at:$finished, decision:$decision, selected_arm:$selected}' \
  "$ANALYSIS_ROOT/run_contract.json" > "$ANALYSIS_ROOT/run_contract.complete.json"
mv "$ANALYSIS_ROOT/run_contract.complete.json" "$ANALYSIS_ROOT/run_contract.json"

(
  cd "$WORK_ROOT"
  find analysis logs models -type f \
    ! -name '*.safetensors' \
    ! -path '*/adapter/*' \
    ! -path '*/merged/*' \
    ! -path '*/checkpoint-*/*' \
    ! -path '*/runs/*' \
    ! -name 'COMPACT_SHA256SUMS' \
    -print0 | sort -z | xargs -0 sha256sum > analysis/COMPACT_SHA256SUMS
  sha256sum -c analysis/COMPACT_SHA256SUMS
)
touch "$ANALYSIS_ROOT/RUN_COMPLETE"
printf '{"status":"%s","selected":"%s","finished_at":"%s"}\n' \
  "$DECISION" "$SELECTED" "$FINISHED_UTC"
