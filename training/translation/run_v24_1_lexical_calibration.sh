#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${WORK_ROOT:-/workspace/v24.1-lexical-calibration}"
PYTHON="${PYTHON:-/opt/mobtranslate-v24-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-$WORK_ROOT/data}"
BASE_MODEL="${BASE_MODEL:-$WORK_ROOT/base_model/merged}"
MODEL_ROOT="${MODEL_ROOT:-$WORK_ROOT/models}"
PREDICTION_ROOT="${PREDICTION_ROOT:-$WORK_ROOT/predictions}"
ANALYSIS_ROOT="${ANALYSIS_ROOT:-$WORK_ROOT/analysis}"
LOG_ROOT="${LOG_ROOT:-$WORK_ROOT/logs}"
INPUT_SHA256_FILE="${INPUT_SHA256_FILE:-$WORK_ROOT/SHA256SUMS.v24.1-inputs}"

SOURCE_LANG="eng_Latn"
TARGET_LANG="gvn_Latn"
DIRECTION="eng-gvn"
SEED=17
BATCH_SIZE=32
H297_MAX_STEPS=200
H297_SAVE_STEPS=20
C2724_MAX_STEPS=1720
C2724_SAVE_STEPS=172
PILOT_LRS=("5e-5" "2e-4")

H297_TRAIN="$DATA_ROOT/arms/H297/train.eng-gvn.jsonl"
H297_MONITOR="$DATA_ROOT/arms/H297/monitor.eng-gvn.jsonl"
C2724_TRAIN="$DATA_ROOT/arms/C2724/train.eng-gvn.jsonl"
C2724_MONITOR="$DATA_ROOT/arms/C2724/monitor.eng-gvn.jsonl"
HISTORICAL_EVAL="$DATA_ROOT/evaluation/historical-297.eng-gvn.jsonl"
CURATED_EVAL="$DATA_ROOT/evaluation/curated-2724.eng-gvn.jsonl"
DEVELOPMENT_SUITE="$DATA_ROOT/evaluation/v24-development-suite.eng-gvn.jsonl"
SYNTHETIC_TRAIN="$DATA_ROOT/synthetic-train.eng-gvn.jsonl"
DATASET_MANIFEST="$DATA_ROOT/MANIFEST.json"
DRIVER_LOG="$LOG_ROOT/v24.1-driver.log"
MONITOR_FILE="$LOG_ROOT/v24.1-resource.csv"

required_paths=(
  "$PYTHON" "$BASE_MODEL" "$INPUT_SHA256_FILE" "$DATASET_MANIFEST"
  "$H297_TRAIN" "$H297_MONITOR" "$C2724_TRAIN" "$C2724_MONITOR"
  "$HISTORICAL_EVAL" "$CURATED_EVAL" "$DEVELOPMENT_SUITE"
  "$SYNTHETIC_TRAIN"
  "$SCRIPT_DIR/train_nllb_lora.py" "$SCRIPT_DIR/evaluate_nllb_lora.py"
  "$SCRIPT_DIR/score_lexical_reconstruction.py" "$SCRIPT_DIR/analyze_v24_lexicon_errors.py"
  "$SCRIPT_DIR/select_v24_screen.py"
)
for required in "${required_paths[@]}"; do
  [[ -e "$required" ]] || { echo "Required path does not exist: $required" >&2; exit 2; }
done
for command in jq sha256sum nvidia-smi; do
  command -v "$command" >/dev/null || { echo "Required command is unavailable: $command" >&2; exit 2; }
done
if [[ -e "$MODEL_ROOT" ]] || [[ -e "$PREDICTION_ROOT" ]] || [[ -e "$ANALYSIS_ROOT" ]]; then
  echo "Refusing existing model, prediction, or analysis output root" >&2
  exit 3
fi
mkdir -p "$MODEL_ROOT" "$PREDICTION_ROOT" "$ANALYSIS_ROOT" "$LOG_ROOT"

cd "$WORK_ROOT"
sha256sum -c "$INPUT_SHA256_FILE" | tee "$LOG_ROOT/input-checksums.log"
[[ "$(wc -l < "$H297_TRAIN")" -eq 297 ]] || { echo "H297 training row count is not 297" >&2; exit 4; }
[[ "$(wc -l < "$C2724_TRAIN")" -eq 2724 ]] || { echo "C2724 training row count is not 2724" >&2; exit 4; }
[[ "$(wc -l < "$H297_MONITOR")" -eq 128 ]] || { echo "H297 monitor row count is not 128" >&2; exit 4; }
[[ "$(wc -l < "$C2724_MONITOR")" -eq 128 ]] || { echo "C2724 monitor row count is not 128" >&2; exit 4; }
jq -e '
  .dataset_id == "v24.1-kuku-yalanji-closed-set-lexical-calibration"
  and .status == "built_not_trained"
  and .sources.H297.rows == 297
  and .sources.C2724.rows == 2724
  and .cross_resource_overlap.prompt_overlap == 208
  and .cross_resource_overlap.overlap_with_shared_accepted_form == 95
  and .cross_resource_overlap.overlap_without_shared_accepted_form == 113
  and .cross_resource_overlap.historical_prompts_absent_from_curated == 89
' "$DATASET_MANIFEST" >/dev/null

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
"$PYTHON" - "$ANALYSIS_ROOT/run_contract.json" "$START_UTC" <<'PY'
import json
import sys
from pathlib import Path

output, started_at = sys.argv[1:]
contract = {
    "schema_version": 1,
    "run_id": "v24.1-closed-set-lexical-calibration",
    "started_at": started_at,
    "purpose": "Calibrate explicit training-record reconstruction before another sentence experiment.",
    "base_model": "exact v21.2 merged weights and tokenizer",
    "seed": 17,
    "micro_batch_size": 32,
    "gradient_accumulation_steps": 1,
    "pilot": {
        "cohort": "H297",
        "learning_rates": [5e-5, 2e-4],
        "max_steps": 200,
        "approximate_presentations": 200 * 32 / 297,
    },
    "scale_run": {
        "cohort": "C2724",
        "learning_rate": "selected from H297 pilot",
        "max_steps": 1720,
        "approximate_presentations": 1720 * 32 / 2724,
    },
    "task_token": {"token": "<lexeme>", "single_special_token": True, "trainable_embedding_row": True},
    "lexical_decoder": {"num_beams": 1, "no_repeat_ngram_size": 0, "repetition_penalty": 1.0},
    "all_lexical_evaluation_rows_seen_in_corresponding_training_cohort": True,
    "sentence_translation_claim": False,
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
  local label="$1" data_file="$2" output_file="$3" adapter_dir="${4:-}"
  local args=(
    --model-dir "$BASE_MODEL" --data-file "$data_file" --output-file "$output_file"
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG"
    --batch-size 64 --max-source-length 64 --max-new-tokens 32
    --num-beams 1 --no-repeat-ngram-size 0 --repetition-penalty 1.0 --length-penalty 1.0
    --dtype float32 --require-cuda --deterministic --seed 0
  )
  [[ -z "$adapter_dir" ]] || args+=(--adapter-dir "$adapter_dir")
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] evaluate $label on $(basename "$data_file")" | tee -a "$DRIVER_LOG"
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" "${args[@]}" \
    2>&1 | tee "${output_file%.json}.metrics.log"
}

train_arm() {
  local label="$1" train_file="$2" monitor_file="$3" max_steps="$4" save_steps="$5" learning_rate="$6"
  local output_dir="$MODEL_ROOT/$label"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] train $label lr=$learning_rate steps=$max_steps" | tee -a "$DRIVER_LOG"
  "$PYTHON" "$SCRIPT_DIR/train_nllb_lora.py" \
    --base-model "$BASE_MODEL" --train-file "$train_file" --validation-file "$monitor_file" \
    --output-dir "$output_dir" --model-version "v24.1-$label" --run-id "v24.1-$label-seed$SEED" \
    --dataset-id "v24.1-closed-set-$label" --dataset-release-sha256 "$(sha256sum "$DATASET_MANIFEST" | awk '{print $1}')" \
    --license "research-only; source-specific rights and upstream NLLB CC-BY-NC apply" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --additional-special-token "<lexeme>" --trainable-token "<lexeme>" \
    --max-steps "$max_steps" --epochs 999 --batch-size "$BATCH_SIZE" --gradient-accumulation-steps 1 \
    --max-source-length 64 --max-target-length 32 --learning-rate "$learning_rate" \
    --warmup-ratio 0.05 --weight-decay 0.0 --lora-r 32 --lora-alpha 64 --lora-dropout 0.0 \
    --lora-target-modules "q_proj,k_proj,v_proj,out_proj,fc1,fc2" \
    --eval-steps "$save_steps" --save-steps "$save_steps" --save-total-limit 12 --logging-steps 10 \
    --generation-num-beams 1 --generation-no-repeat-ngram-size 0 \
    --generation-repetition-penalty 1.0 --generation-length-penalty 1.0 \
    --seed "$SEED" --full-determinism --no-shuffle-before-cap \
    --no-load-best-model-at-end --no-merge-full-model \
    2>&1 | tee "$LOG_ROOT/$label.train.log"
  jq -e \
    --argjson steps "$max_steps" --argjson batch "$BATCH_SIZE" \
    '.trainer_state.global_step == $steps
     and .training_args.max_steps == $steps
     and .training_args.batch_size == $batch
     and .training_args.gradient_accumulation_steps == 1
     and .training_args.additional_special_tokens == ["<lexeme>"]
     and (.training_args.trainable_tokens | length) == 1
     and .training_args.trainable_tokens[0].token == "<lexeme>"
     and .token_adaptation.unselected_audit_rows_unchanged == true
     and .artifacts.merged_dir == null' "$output_dir/model_manifest.json" >/dev/null
}

score_checkpoints() {
  local arm="$1" data_file="$2" prefix="$3" score_output="$4"
  local candidate_args=(--candidate "B0=$PREDICTION_ROOT/B0.$prefix.json")
  local checkpoint step label output
  while IFS= read -r checkpoint; do
    step="${checkpoint##*-}"
    label="${arm}_s$(printf '%04d' "$step")"
    output="$PREDICTION_ROOT/$label.$prefix.json"
    run_eval "$label" "$data_file" "$output" "$checkpoint"
    candidate_args+=(--candidate "$label=$output")
  done < <(find "$MODEL_ROOT/$arm" -maxdepth 1 -type d -name 'checkpoint-*' | sort -V)
  "$PYTHON" "$SCRIPT_DIR/score_lexical_reconstruction.py" \
    "${candidate_args[@]}" --gate-lower-bound 0.80 --output "$score_output" \
    | tee "${score_output%.json}.stdout.json"
}

echo "[$START_UTC] baseline inference" | tee "$DRIVER_LOG"
run_eval "B0-historical" "$HISTORICAL_EVAL" "$PREDICTION_ROOT/B0.historical.json"
run_eval "B0-curated" "$CURATED_EVAL" "$PREDICTION_ROOT/B0.curated.json"

for learning_rate in "${PILOT_LRS[@]}"; do
  lr_label="$(sed 's/e-/_e/g; s/-/m/g; s/\./p/g' <<<"$learning_rate")"
  arm="H297_lr$lr_label"
  train_arm "$arm" "$H297_TRAIN" "$H297_MONITOR" "$H297_MAX_STEPS" "$H297_SAVE_STEPS" "$learning_rate"
  score_checkpoints "$arm" "$HISTORICAL_EVAL" "historical" "$ANALYSIS_ROOT/$arm.historical-scores.json"
done

# Every completed experimental arm gets a comparable full-curated-lexicon census.
declare -A PILOT_CURATED_FILES=()
pilot_curated_candidates=(--candidate "B0=$PREDICTION_ROOT/B0.curated.json")
for pilot_arm in H297_lr5_e5 H297_lr2_e4; do
  pilot_label="$(jq -r '
    .models | to_entries | map(select(.key != "B0"))
    | sort_by(-.value.accepted_exact_count, -.value.wilson_95.low, .key) | .[0].key
  ' "$ANALYSIS_ROOT/$pilot_arm.historical-scores.json")"
  pilot_step="$((10#${pilot_label##*_s}))"
  pilot_output="$PREDICTION_ROOT/$pilot_label.curated-transfer.json"
  run_eval "$pilot_label-curated-transfer" "$CURATED_EVAL" "$pilot_output" \
    "$MODEL_ROOT/$pilot_arm/checkpoint-$pilot_step"
  PILOT_CURATED_FILES["$pilot_arm"]="$pilot_output"
  pilot_curated_candidates+=(--candidate "$pilot_arm=$pilot_output")
done
"$PYTHON" "$SCRIPT_DIR/score_lexical_reconstruction.py" \
  "${pilot_curated_candidates[@]}" --gate-lower-bound 0.80 \
  --output "$ANALYSIS_ROOT/H297-pilot-curated-transfer-scores.json" \
  | tee "$ANALYSIS_ROOT/H297-pilot-curated-transfer-scores.stdout.json"

"$PYTHON" - "$ANALYSIS_ROOT" "$ANALYSIS_ROOT/H297-pilot-selection.json" <<'PY'
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
output = Path(sys.argv[2])
records = []
for path in sorted(root.glob("H297_lr*.historical-scores.json")):
    payload = json.loads(path.read_text(encoding="utf-8"))
    for label, metrics in payload["models"].items():
        if label == "B0":
            continue
        step_match = re.search(r"_s(\d+)$", label)
        if not step_match:
            raise SystemExit(f"cannot parse checkpoint step from {label}")
        records.append({"label": label, "step": int(step_match.group(1)), **metrics})
records.sort(
    key=lambda row: (
        -row["accepted_exact_count"],
        -row["wilson_95"]["low"],
        row["step"],
        row["label"],
    )
)
passing = [row for row in records if row["passes_confidence_adjusted_gate"]]
earliest_passing = min(passing, key=lambda row: (row["step"], -row["accepted_exact_count"], row["label"])) if passing else None
result = {
    "schema_version": 1,
    "selection_basis": "highest accepted exact, then Wilson lower bound, then earliest checkpoint",
    "selected": records[0],
    "earliest_confidence_adjusted_gate_pass": earliest_passing,
    "candidate_count": len(records),
    "interpretation": "All 297 records were training examples; this selects a memorization recipe only.",
}
output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
PY

PILOT_LABEL="$(jq -r '.selected.label' "$ANALYSIS_ROOT/H297-pilot-selection.json")"
if [[ "$PILOT_LABEL" == H297_lr5_e5_* ]]; then
  SELECTED_LR="5e-5"
elif [[ "$PILOT_LABEL" == H297_lr2_e4_* ]]; then
  SELECTED_LR="2e-4"
else
  echo "Cannot infer selected learning rate from $PILOT_LABEL" >&2
  exit 5
fi

train_arm "C2724" "$C2724_TRAIN" "$C2724_MONITOR" "$C2724_MAX_STEPS" "$C2724_SAVE_STEPS" "$SELECTED_LR"
score_checkpoints "C2724" "$CURATED_EVAL" "curated" "$ANALYSIS_ROOT/C2724.curated-scores.json"
cp "$PREDICTION_ROOT/B0.historical.json" "$PREDICTION_ROOT/B0.historical-transfer.json"
score_checkpoints "C2724" "$HISTORICAL_EVAL" "historical-transfer" "$ANALYSIS_ROOT/C2724.historical-transfer-scores.json"

BEST_H297_LABEL="$(jq -r '.selected.label' "$ANALYSIS_ROOT/H297-pilot-selection.json")"
BEST_H297_ARM="${BEST_H297_LABEL%_s*}"
BEST_H297_STEP="$((10#${BEST_H297_LABEL##*_s}))"
BEST_H297_ADAPTER="$MODEL_ROOT/$BEST_H297_ARM/checkpoint-$BEST_H297_STEP"
BEST_C2724_LABEL="$(jq -r '
  .models | to_entries | map(select(.key != "B0"))
  | sort_by(-.value.accepted_exact_count, -.value.wilson_95.low, .key) | .[0].key
' "$ANALYSIS_ROOT/C2724.curated-scores.json")"
BEST_C2724_STEP="$((10#${BEST_C2724_LABEL##*_s}))"
BEST_C2724_ADAPTER="$MODEL_ROOT/C2724/checkpoint-$BEST_C2724_STEP"

"$PYTHON" "$SCRIPT_DIR/analyze_v24_lexicon_errors.py" \
  --candidate "B0=$PREDICTION_ROOT/B0.curated.json" \
  --candidate "H297_lr5_e5=${PILOT_CURATED_FILES[H297_lr5_e5]}" \
  --candidate "H297_lr2_e4=${PILOT_CURATED_FILES[H297_lr2_e4]}" \
  --candidate "C2724=$PREDICTION_ROOT/$BEST_C2724_LABEL.curated.json" \
  --control-label B0 --tokenizer-dir "$BASE_MODEL" --synthetic-file "$SYNTHETIC_TRAIN" \
  --sample-per-cohort 16 --seed "v24.1-all-lexeme-census" \
  --output "$ANALYSIS_ROOT/all-arm-curated-qualitative-summary.json" \
  --review-sample-output "$ANALYSIS_ROOT/all-arm-curated-review-sample.jsonl" \
  --row-analysis-output "$ANALYSIS_ROOT/all-arm-curated-row-analysis.jsonl" \
  | tee "$LOG_ROOT/all-arm-curated-qualitative.stdout.json"

run_eval "B0-retention" "$DEVELOPMENT_SUITE" "$PREDICTION_ROOT/B0.retention.json"
run_eval "H297-retention" "$DEVELOPMENT_SUITE" "$PREDICTION_ROOT/H297.retention.json" "$BEST_H297_ADAPTER"
run_eval "C2724-retention" "$DEVELOPMENT_SUITE" "$PREDICTION_ROOT/C2724.retention.json" "$BEST_C2724_ADAPTER"
"$PYTHON" "$SCRIPT_DIR/select_v24_screen.py" \
  --candidate "B0=$PREDICTION_ROOT/B0.retention.json" \
  --candidate "H297=$PREDICTION_ROOT/H297.retention.json" \
  --candidate "C2724=$PREDICTION_ROOT/C2724.retention.json" \
  --baseline-label B0 --control-label B0 --lexical-endpoint lexicon_closed_set \
  --retention-endpoint synthetic_dev --retention-endpoint natural_dev_text36 \
  --retention-endpoint usage_diagnostic --retention-endpoint elder_diagnostic \
  --minimum-exact-gain-over-control 1 --chrf-noninferiority-margin 1.0 \
  --bootstrap-samples 10000 --seed v24.1-lexical-calibration-retention \
  --output "$ANALYSIS_ROOT/sentence-retention-diagnostic.json" \
  | tee "$LOG_ROOT/sentence-retention-diagnostic.stdout.json"

"$PYTHON" - \
  "$ANALYSIS_ROOT/H297-pilot-selection.json" \
  "$ANALYSIS_ROOT/H297-pilot-curated-transfer-scores.json" \
  "$ANALYSIS_ROOT/C2724.curated-scores.json" \
  "$ANALYSIS_ROOT/C2724.historical-transfer-scores.json" \
  "$ANALYSIS_ROOT/all-arm-curated-qualitative-summary.json" \
  "$ANALYSIS_ROOT/sentence-retention-diagnostic.json" \
  "$ANALYSIS_ROOT/final-decision.json" "$SELECTED_LR" <<'PY'
import json
import sys
from pathlib import Path

(
    pilot_path,
    pilot_curated_path,
    curated_path,
    transfer_path,
    qualitative_path,
    retention_path,
    output_path,
    selected_lr,
) = sys.argv[1:]
pilot = json.loads(Path(pilot_path).read_text(encoding="utf-8"))
pilot_curated = json.loads(Path(pilot_curated_path).read_text(encoding="utf-8"))
curated = json.loads(Path(curated_path).read_text(encoding="utf-8"))
transfer = json.loads(Path(transfer_path).read_text(encoding="utf-8"))
qualitative = json.loads(Path(qualitative_path).read_text(encoding="utf-8"))
retention = json.loads(Path(retention_path).read_text(encoding="utf-8"))
result = {
    "schema_version": 1,
    "status": "CALIBRATION_COMPLETE",
    "selected_learning_rate": selected_lr,
    "historical_297": pilot,
    "historical_pilots_on_curated_2724": pilot_curated,
    "curated_2724": {
        "selected_label": curated["selected_label"],
        "metrics": curated["models"][curated["selected_label"]],
    },
    "curated_model_on_historical_297": {
        "selected_label": transfer["selected_label"],
        "metrics": transfer["models"][transfer["selected_label"]],
    },
    "all_arm_curated_failure_census": qualitative,
    "sentence_retention": retention,
    "promotion_or_deployment_authorized": False,
    "next_decision": (
        "Use these results to distinguish optimization/capacity failure from missing sentence evidence. "
        "Do not mount either calibration adapter as a sentence translator."
    ),
}
Path(output_path).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
PY

cleanup
trap - EXIT
END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s\n' "$END_UTC" > "$WORK_ROOT/COMPLETE"
echo "[$END_UTC] v24.1 calibration complete; finalizing checksum ledger" | tee -a "$DRIVER_LOG"
find "$WORK_ROOT" -type f \
  ! -path '*/checkpoint-*/optimizer.pt' \
  ! -path '*/checkpoint-*/rng_state.pth' \
  ! -path '*/checkpoint-*/scheduler.pt' \
  ! -path '*/logs/final-checksums.verify.log' \
  ! -name 'SHA256SUMS.final' \
  -printf '%P\0' | sort -z | xargs -0 sha256sum > "$WORK_ROOT/SHA256SUMS.final"
sha256sum -c "$WORK_ROOT/SHA256SUMS.final" > "$LOG_ROOT/final-checksums.verify.log"
