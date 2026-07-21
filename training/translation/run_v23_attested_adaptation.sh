#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${WORK_ROOT:-/workspace/v23-attested}"
PYTHON="${PYTHON:-/opt/mobtranslate-mt-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-$WORK_ROOT/data}"
BASE_MODEL="${BASE_MODEL:-$WORK_ROOT/base_model/merged}"
OUT_ROOT="${OUT_ROOT:-$WORK_ROOT/models}"
LOG_ROOT="${LOG_ROOT:-$WORK_ROOT/logs}"
ANALYSIS_ROOT="${ANALYSIS_ROOT:-$WORK_ROOT/analysis}"
REPORT_ROOT="${REPORT_ROOT:-$WORK_ROOT/reports}"
INPUT_SHA256_FILE="${INPUT_SHA256_FILE:-$WORK_ROOT/SHA256SUMS.v23-inputs}"

SOURCE_LANG="eng_Latn"
TARGET_LANG="gvn_Latn"
DIRECTION="eng-gvn"
MAX_SOURCE_LENGTH=192
MAX_TARGET_LENGTH=208
BATCH_SIZE=8
GRADIENT_ACCUMULATION_STEPS=2
SEEDS=(17 42 73)
DECODER_NO_REPEAT=4
DECODER_REPETITION_PENALTY=1.10

TRAIN_FILE="$DATA_ROOT/train.eng-gvn.jsonl"
DEV_FILE="$DATA_ROOT/validation.eng-gvn.jsonl"
TEST_FILE="$DATA_ROOT/test.eng-gvn.jsonl"
ELDER_FILE="$DATA_ROOT/external/elder_sentence_pair_43.eng-gvn.jsonl"
USAGE_FILE="$DATA_ROOT/external/db_usage_heldout_84.eng-gvn.jsonl"
SYNTHETIC_TAGGED_FILE="$DATA_ROOT/external/synthetic_test_tagged_1606.eng-gvn.jsonl"
SYNTHETIC_UNTAGGED_FILE="$DATA_ROOT/external/synthetic_test_untagged_1606.eng-gvn.jsonl"
BIBLE_FILE="$DATA_ROOT/external/bible_direct_heldout_325.eng-gvn.jsonl"
PROBE_FILE="$DATA_ROOT/external/combined_lexicon_elder_probe.eng-gvn.jsonl"

BASELINE_EVAL="$OUT_ROOT/baseline-v21.2"
SELECTION_FILE="$ANALYSIS_ROOT/seed_selection.locked.json"
PAIRED_AUDIT="$ANALYSIS_ROOT/v21.2-v23-paired-audit.json"
LEXICON_AUDIT="$ANALYSIS_ROOT/v21.2-v23-lexicon-elder-audit.json"
PROMOTION_GATE="$ANALYSIS_ROOT/promotion_gate.json"
CPU_DEPLOYMENT_GATE="$ANALYSIS_ROOT/cpu_deployment_gate.json"
MONITOR_FILE="$LOG_ROOT/v23-resource.csv"
DRIVER_LOG="$LOG_ROOT/v23-driver.log"

required_paths=(
  "$PYTHON" "$DATA_ROOT" "$BASE_MODEL" "$INPUT_SHA256_FILE"
  "$SCRIPT_DIR/train_nllb_lora.py" "$SCRIPT_DIR/evaluate_nllb_lora.py"
  "$SCRIPT_DIR/analyze_v21_predictions.py" "$SCRIPT_DIR/analyze_kuku_version_probe.py"
  "$SCRIPT_DIR/compare_v21_models.py"
  "$SCRIPT_DIR/select_v23_seed.py" "$SCRIPT_DIR/compare_v23_predictions.py"
  "$SCRIPT_DIR/verify_v23_promotion.py" "$SCRIPT_DIR/verify_dictionary_cpu_deployment.py"
  "$SCRIPT_DIR/apply_v23_retention.py"
)
for required in "${required_paths[@]}"; do
  if [[ ! -e "$required" ]]; then
    echo "Required path does not exist: $required" >&2
    exit 2
  fi
done
if [[ -e "$OUT_ROOT" ]] || [[ -e "$ANALYSIS_ROOT" ]]; then
  echo "Refusing existing model or analysis output root" >&2
  exit 3
fi
mkdir -p "$OUT_ROOT" "$ANALYSIS_ROOT" "$REPORT_ROOT" "$LOG_ROOT" "$BASELINE_EVAL"

cd "$WORK_ROOT"
sha256sum -c "$INPUT_SHA256_FILE" | tee "$LOG_ROOT/v23-input-checksums.log"

check_rows() {
  local expected="$1" file="$2"
  local observed
  observed="$(wc -l < "$file")"
  if [[ "$observed" -ne "$expected" ]]; then
    echo "Row-count mismatch for $file: expected $expected, observed $observed" >&2
    exit 4
  fi
}
check_rows 2360 "$TRAIN_FILE"
check_rows 53 "$DEV_FILE"
check_rows 56 "$TEST_FILE"
check_rows 43 "$ELDER_FILE"
check_rows 84 "$USAGE_FILE"
check_rows 1606 "$SYNTHETIC_TAGGED_FILE"
check_rows 1606 "$SYNTHETIC_UNTAGGED_FILE"
check_rows 325 "$BIBLE_FILE"
check_rows 340 "$PROBE_FILE"

check_hash() {
  local expected="$1" path="$2"
  local observed
  observed="$(sha256sum "$path" | awk '{print $1}')"
  if [[ "$observed" != "$expected" ]]; then
    echo "Hash mismatch for $path: expected $expected, observed $observed" >&2
    exit 5
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
} | tee "$LOG_ROOT/v23-base-checksums.log"

export PYTHONHASHSEED=0
export TOKENIZERS_PARALLELISM=false
export CUBLAS_WORKSPACE_CONFIG=:4096:8
export NVIDIA_TF32_OVERRIDE=0

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
for package in ("transformers", "tokenizers", "datasets", "peft", "sacrebleu", "sentencepiece"):
    result["packages"][package] = metadata.version(package)
Path(sys.argv[1]).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
PY

START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DATASET_SHA="$(sha256sum "$DATA_ROOT/MANIFEST.json" | awk '{print $1}')"
"$PYTHON" - "$ANALYSIS_ROOT/run_contract.json" "$START_UTC" "$DATASET_SHA" <<'PY'
import json
import sys
from pathlib import Path

output, started_at, dataset_sha = sys.argv[1:]
contract = {
    "run_id": "v23.0-attested-narrative-adaptation",
    "started_at": started_at,
    "base_model": "v21.2-claude-balanced-replay step 4155, guarded artifact",
    "dataset_manifest_sha256": dataset_sha,
    "seeds": [17, 42, 73],
    "selection_set": "Patz Text 36, Bobby Roberts, Nyungkul, 53 clauses",
    "sealed_test": "Patz Text 3, Ivy Walker, Yalanji, 56 clauses",
    "test_available_to_trainer": False,
    "bible_training_rows": 0,
    "bible_seed_selection_weight": 0,
    "bible_role": "catastrophic-forgetting guard only",
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
  local model_dir="$1" data_file="$2" output_file="$3" metrics_file="$4"
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
    --model-dir "$model_dir" --data-file "$data_file" --output-file "$output_file" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --batch-size "$BATCH_SIZE" --max-source-length "$MAX_SOURCE_LENGTH" \
    --max-new-tokens "$MAX_TARGET_LENGTH" --num-beams 1 \
    --no-repeat-ngram-size "$DECODER_NO_REPEAT" \
    --repetition-penalty "$DECODER_REPETITION_PENALTY" --length-penalty 1.0 \
    --dtype float32 --require-cuda --deterministic --seed 0 \
    2>&1 | tee "$metrics_file"
}

analyze_eval() {
  local prediction_file="$1" output_file="$2"
  "$PYTHON" "$SCRIPT_DIR/analyze_v21_predictions.py" "$prediction_file" --output "$output_file" \
    > "${output_file%.json}.stdout.json"
}

echo "[$START_UTC] baseline development inference" | tee "$DRIVER_LOG"
run_eval "$BASE_MODEL" "$DEV_FILE" \
  "$BASELINE_EVAL/eval_natural_dev_text36.predictions.json" \
  "$BASELINE_EVAL/eval_natural_dev_text36.metrics.json"
analyze_eval "$BASELINE_EVAL/eval_natural_dev_text36.predictions.json" \
  "$BASELINE_EVAL/eval_natural_dev_text36.analysis.json"

candidate_args=()
for seed in "${SEEDS[@]}"; do
  label="seed${seed}"
  output_dir="$OUT_ROOT/$label"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] training $label" | tee -a "$DRIVER_LOG"
  "$PYTHON" "$SCRIPT_DIR/train_nllb_lora.py" \
    --base-model "$BASE_MODEL" --train-file "$TRAIN_FILE" --validation-file "$DEV_FILE" \
    --output-dir "$output_dir" --model-version "v23.0-$label" --run-id "v23.0-$label" \
    --dataset-id "v23.0-attested-narrative-adaptation" \
    --dataset-release-sha256 "$DATASET_SHA" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --epochs 6 --batch-size "$BATCH_SIZE" \
    --gradient-accumulation-steps "$GRADIENT_ACCUMULATION_STEPS" \
    --max-source-length "$MAX_SOURCE_LENGTH" --max-target-length "$MAX_TARGET_LENGTH" \
    --learning-rate 1e-5 --warmup-ratio 0.05 --weight-decay 0.01 \
    --lora-r 32 --lora-alpha 64 --lora-dropout 0.05 \
    --lora-target-modules "q_proj,k_proj,v_proj,out_proj,fc1,fc2" \
    --eval-steps 148 --save-steps 148 --save-total-limit 2 --logging-steps 20 \
    --generation-num-beams 1 --generation-no-repeat-ngram-size "$DECODER_NO_REPEAT" \
    --generation-repetition-penalty "$DECODER_REPETITION_PENALTY" \
    --generation-length-penalty 1.0 --seed "$seed" --full-determinism \
    2>&1 | tee "$LOG_ROOT/$label.train.log"
  jq -e '.dataset.test_file == null and .training_args.full_determinism == true' \
    "$output_dir/model_manifest.json" >/dev/null
  run_eval "$output_dir/merged" "$DEV_FILE" \
    "$output_dir/eval_natural_dev_text36.predictions.json" \
    "$output_dir/eval_natural_dev_text36.metrics.json"
  analyze_eval "$output_dir/eval_natural_dev_text36.predictions.json" \
    "$output_dir/eval_natural_dev_text36.analysis.json"
  candidate_args+=(--candidate "$label=$output_dir/eval_natural_dev_text36.predictions.json")
done

if find "$OUT_ROOT" "$BASELINE_EVAL" -name '*natural_test*' -print -quit | grep -q .; then
  echo "Natural test prediction exists before seed selection" >&2
  exit 6
fi
"$PYTHON" "$SCRIPT_DIR/select_v23_seed.py" \
  --baseline "$BASELINE_EVAL/eval_natural_dev_text36.predictions.json" \
  "${candidate_args[@]}" --output "$SELECTION_FILE" | tee "$LOG_ROOT/seed-selection.stdout.json"
SELECTED_LABEL="$(jq -r '.selected.label' "$SELECTION_FILE")"
SELECTED_MODEL="$OUT_ROOT/$SELECTED_LABEL/merged"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] selection locked: $SELECTED_LABEL; test unlocked" \
  | tee -a "$DRIVER_LOG"

declare -a EVALUATIONS=(
  "natural_test_text3|$TEST_FILE"
  "elder_sentence_pair_43|$ELDER_FILE"
  "db_usage_heldout_84|$USAGE_FILE"
  "synthetic_test_tagged_1606|$SYNTHETIC_TAGGED_FILE"
  "synthetic_test_untagged_1606|$SYNTHETIC_UNTAGGED_FILE"
  "bible_direct_heldout_325|$BIBLE_FILE"
)

for item in "${EVALUATIONS[@]}"; do
  IFS='|' read -r label data_file <<< "$item"
  for model_label in baseline candidate; do
    if [[ "$model_label" == "baseline" ]]; then
      model_dir="$BASE_MODEL"
      output_dir="$BASELINE_EVAL"
    else
      model_dir="$SELECTED_MODEL"
      output_dir="$OUT_ROOT/$SELECTED_LABEL"
    fi
    run_eval "$model_dir" "$data_file" "$output_dir/eval_${label}.predictions.json" \
      "$output_dir/eval_${label}.metrics.json"
    analyze_eval "$output_dir/eval_${label}.predictions.json" \
      "$output_dir/eval_${label}.analysis.json"
  done
done

cp "$OUT_ROOT/$SELECTED_LABEL/eval_natural_dev_text36.predictions.json" \
  "$OUT_ROOT/$SELECTED_LABEL/eval_natural_dev_text36.selected.predictions.json"

for model_label in baseline candidate; do
  if [[ "$model_label" == "baseline" ]]; then
    model_dir="$BASE_MODEL"
    output_dir="$BASELINE_EVAL"
  else
    model_dir="$SELECTED_MODEL"
    output_dir="$OUT_ROOT/$SELECTED_LABEL"
  fi
  run_eval "$model_dir" "$PROBE_FILE" "$output_dir/eval_lexicon_elder_probe.predictions.json" \
    "$output_dir/eval_lexicon_elder_probe.metrics.json"
done

pair_args=(
  --pair "natural_dev_text36=$BASELINE_EVAL/eval_natural_dev_text36.predictions.json,$OUT_ROOT/$SELECTED_LABEL/eval_natural_dev_text36.predictions.json"
)
for item in "${EVALUATIONS[@]}"; do
  IFS='|' read -r label _ <<< "$item"
  pair_args+=(--pair "$label=$BASELINE_EVAL/eval_${label}.predictions.json,$OUT_ROOT/$SELECTED_LABEL/eval_${label}.predictions.json")
done
"$PYTHON" "$SCRIPT_DIR/compare_v23_predictions.py" "${pair_args[@]}" \
  --output "$PAIRED_AUDIT" --bootstrap-replicates 50000 --seed 2300 \
  | tee "$LOG_ROOT/paired-audit.stdout.log"

"$PYTHON" "$SCRIPT_DIR/analyze_kuku_version_probe.py" \
  --lexicon-prediction "baseline=$BASELINE_EVAL/eval_lexicon_elder_probe.predictions.json" \
  --elder-prediction "baseline=$BASELINE_EVAL/eval_lexicon_elder_probe.predictions.json" \
  --lexicon-prediction "candidate=$OUT_ROOT/$SELECTED_LABEL/eval_lexicon_elder_probe.predictions.json" \
  --elder-prediction "candidate=$OUT_ROOT/$SELECTED_LABEL/eval_lexicon_elder_probe.predictions.json" \
  --output-json "$LEXICON_AUDIT" --output-md "$REPORT_ROOT/LEXICON-ELDER-RESULTS.md" \
  --bootstrap-samples 50000 --seed "v23-lexicon-elder" \
  > "$LOG_ROOT/lexicon-audit.stdout.json"

"$PYTHON" "$SCRIPT_DIR/verify_dictionary_cpu_deployment.py" \
  --lexicon-audit "$LEXICON_AUDIT" --model-label candidate \
  --model-id "v23.0-$SELECTED_LABEL" \
  --model-sha256 "$(sha256sum "$SELECTED_MODEL/model.safetensors" | awk '{print $1}')" \
  --output "$CPU_DEPLOYMENT_GATE" \
  | tee "$LOG_ROOT/cpu-deployment-gate.stdout.json"

"$PYTHON" "$SCRIPT_DIR/verify_v23_promotion.py" \
  --seed-selection "$SELECTION_FILE" --paired-audit "$PAIRED_AUDIT" \
  --lexicon-audit "$LEXICON_AUDIT" --output "$PROMOTION_GATE" \
  | tee "$LOG_ROOT/promotion-gate.stdout.json"

"$PYTHON" "$SCRIPT_DIR/apply_v23_retention.py" \
  --models-root "$OUT_ROOT" --seed-selection "$SELECTION_FILE" \
  --promotion-gate "$PROMOTION_GATE" --output "$ANALYSIS_ROOT/artifact_retention.json" \
  --apply | tee "$LOG_ROOT/artifact-retention.stdout.json"

cleanup
trap - EXIT
"$PYTHON" - "$MONITOR_FILE" "$ANALYSIS_ROOT/resource_summary.json" <<'PY'
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
if result.get("max_gpu_util_pct", 0) <= 0 or result.get("max_gpu_mem_used_mib", 0) < 1000:
    raise SystemExit("resource monitor did not observe real GPU work")
output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
PY

jq --arg finished "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg selected "$SELECTED_LABEL" \
  '. + {finished_at:$finished, selected_seed:$selected}' "$ANALYSIS_ROOT/run_contract.json" \
  > "$ANALYSIS_ROOT/run_contract.complete.json"
mv "$ANALYSIS_ROOT/run_contract.complete.json" "$ANALYSIS_ROOT/run_contract.json"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] v23 complete; gate=$(jq -r .status "$PROMOTION_GATE")" \
  | tee -a "$DRIVER_LOG"
(
  cd "$WORK_ROOT"
  find analysis logs reports models -type f \
    ! -name OUTPUT_SHA256SUMS ! -name RUN_COMPLETE \
    ! -path 'logs/launcher.log' ! -path 'logs/launcher.pid' -print0 \
    | sort -z | xargs -0 sha256sum > "$ANALYSIS_ROOT/OUTPUT_SHA256SUMS"
  sha256sum -c "$ANALYSIS_ROOT/OUTPUT_SHA256SUMS" >/dev/null
)
touch "$ANALYSIS_ROOT/RUN_COMPLETE"
