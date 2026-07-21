#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${WORK_ROOT:-/workspace/v24.2-joint-replay}"
PYTHON="${PYTHON:-/opt/mobtranslate-v24-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-$WORK_ROOT/data}"
BASE_MODEL="${BASE_MODEL:-/workspace/v24.1-lexical-calibration/base_model/merged}"
MODEL_ROOT="${MODEL_ROOT:-$WORK_ROOT/models}"
PREDICTION_ROOT="${PREDICTION_ROOT:-$WORK_ROOT/predictions}"
ANALYSIS_ROOT="${ANALYSIS_ROOT:-$WORK_ROOT/analysis}"
LOG_ROOT="${LOG_ROOT:-$WORK_ROOT/logs}"
INPUT_SHA256_FILE="${INPUT_SHA256_FILE:-$WORK_ROOT/SHA256SUMS.v24.2-inputs}"
BASE_SHA256_FILE="${BASE_SHA256_FILE:-$DATA_ROOT/base/SHA256SUMS.v21.2-base}"

SOURCE_LANG="eng_Latn"
TARGET_LANG="gvn_Latn"
DIRECTION="eng-gvn"
SEED=17
BATCH_SIZE=32
MAX_STEPS=2236
SAVE_STEPS=559
LEARNING_RATE="2e-4"
ARM="J50"

JOINT_ROOT="$DATA_ROOT/joint"
TRAIN_FILE="$JOINT_ROOT/train.eng-gvn.jsonl"
MONITOR_FILE="$JOINT_ROOT/validation.eng-gvn.jsonl"
DATASET_MANIFEST="$JOINT_ROOT/MANIFEST.json"
CURATED_EVAL="$DATA_ROOT/evaluation/curated-2724.eng-gvn.jsonl"
DEVELOPMENT_SUITE="$DATA_ROOT/evaluation/v24-development-suite.eng-gvn.jsonl"
SYNTHETIC_TRAIN="$DATA_ROOT/evaluation/synthetic-train.eng-gvn.jsonl"
BASELINE_CURATED="$DATA_ROOT/baseline/B0.curated.json"
BASELINE_RETENTION="$DATA_ROOT/baseline/B0.retention.json"
DRIVER_LOG="$LOG_ROOT/v24.2-driver.log"
RESOURCE_LOG="$LOG_ROOT/v24.2-resource.csv"

required_paths=(
  "$PYTHON" "$BASE_MODEL" "$INPUT_SHA256_FILE" "$BASE_SHA256_FILE"
  "$TRAIN_FILE" "$MONITOR_FILE" "$DATASET_MANIFEST" "$CURATED_EVAL"
  "$DEVELOPMENT_SUITE" "$SYNTHETIC_TRAIN" "$BASELINE_CURATED"
  "$BASELINE_RETENTION" "$SCRIPT_DIR/train_nllb_lora.py"
  "$SCRIPT_DIR/evaluate_nllb_lora.py" "$SCRIPT_DIR/score_lexical_reconstruction.py"
  "$SCRIPT_DIR/analyze_v24_lexicon_errors.py" "$SCRIPT_DIR/select_v24_screen.py"
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
mkdir -p "$MODEL_ROOT" "$PREDICTION_ROOT" "$ANALYSIS_ROOT" "$LOG_ROOT" "$WORK_ROOT/smoke"

cd "$WORK_ROOT"
sha256sum -c "$INPUT_SHA256_FILE" | tee "$LOG_ROOT/input-checksums.log"
(
  cd "$BASE_MODEL"
  sha256sum -c "$BASE_SHA256_FILE"
) | tee "$LOG_ROOT/base-checksums.log"

[[ "$(wc -l < "$TRAIN_FILE")" -eq 71552 ]] || { echo "Training row count is not 71,552" >&2; exit 4; }
[[ "$(wc -l < "$MONITOR_FILE")" -eq 128 ]] || { echo "Monitor row count is not 128" >&2; exit 4; }
[[ "$(wc -l < "$CURATED_EVAL")" -eq 2724 ]] || { echo "Lexeme census row count is not 2,724" >&2; exit 4; }
[[ "$(wc -l < "$DEVELOPMENT_SUITE")" -eq 2086 ]] || { echo "Retention suite row count is not 2,086" >&2; exit 4; }
jq -e '
  .dataset_id == "v24.2-joint-lexeme-sentence-replay"
  and .mixture.lexeme_unique_rows == 2724
  and .mixture.lexeme_presentations == 35412
  and .mixture.sentence_unique_rows == 18070
  and .mixture.sentence_presentations == 36140
  and .mixture.train_rows == 71552
  and .mixture.bible_rows == 0
  and .monitor.rows == 128
  and .leakage_audit.sentence_train_validation_source_overlap == 0
  and .leakage_audit.sentence_train_validation_target_surface_overlap == 0
  and .contracts.deployment_authorized == false
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
    "run_id": "v24.2-joint-lexeme-sentence-replay",
    "started_at": started_at,
    "hypothesis": (
        "Joint replay of explicit lexeme records and existing non-Bible sentence records can retain "
        "closed-set lexical reconstruction without the sentence compression observed in v24.1."
    ),
    "base_model": "exact v21.2 merged weights and tokenizer",
    "arm": "J50",
    "seed": 17,
    "learning_rate": 2e-4,
    "planned_max_steps": 2236,
    "checkpoint_steps": [559, 1118, 1677, 2236],
    "micro_batch_size": 32,
    "gradient_accumulation_steps": 1,
    "train_rows": 71552,
    "planned_presentations_per_generated_row": 1,
    "row_mixture": {"lexeme": 35412, "sentence": 36140, "bible": 0},
    "task_token": {"token": "<lexeme>", "single_special_token": True, "trainable_embedding_row": True},
    "evaluation": {
        "all_lexeme_census_rows": 2724,
        "all_lexeme_census_at_every_checkpoint": True,
        "retention_rows": 2086,
        "retention_at_every_checkpoint": True,
        "qualitative_failure_taxonomy_for_every_checkpoint": True,
    },
    "selection_gate": (
        "A checkpoint must pass the Wilson-lower-bound closed-set lexical gate and every frozen "
        "sentence-retention hard check. Neither gate substitutes for the other."
    ),
    "sentence_translation_claim": False,
    "promotion_or_deployment_authority": False,
}
Path(output).write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
PY

monitor_pid=""
if [[ -x "$SCRIPT_DIR/run_resource_monitor.sh" ]]; then
  INTERVAL_SECONDS=5 "$SCRIPT_DIR/run_resource_monitor.sh" "$RESOURCE_LOG" &
  monitor_pid="$!"
fi
cleanup() {
  if [[ -n "$monitor_pid" ]]; then
    kill "$monitor_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

train_model() {
  local label="$1" train_file="$2" output_dir="$3" max_steps="$4" save_steps="$5" validation_file="$6"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] train $label lr=$LEARNING_RATE steps=$max_steps" | tee -a "$DRIVER_LOG"
  "$PYTHON" "$SCRIPT_DIR/train_nllb_lora.py" \
    --base-model "$BASE_MODEL" --train-file "$train_file" --validation-file "$validation_file" \
    --output-dir "$output_dir" --model-version "v24.2-$label" --run-id "v24.2-$label-seed$SEED" \
    --dataset-id "v24.2-joint-lexeme-sentence-replay" \
    --dataset-release-sha256 "$(sha256sum "$DATASET_MANIFEST" | awk '{print $1}')" \
    --license "research-only; source-specific rights and upstream NLLB CC-BY-NC apply" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --additional-special-token "<lexeme>" --trainable-token "<lexeme>" \
    --max-steps "$max_steps" --epochs 999 --batch-size "$BATCH_SIZE" --gradient-accumulation-steps 1 \
    --max-source-length 128 --max-target-length 128 --learning-rate "$LEARNING_RATE" \
    --warmup-ratio 0.05 --weight-decay 0.0 --lora-r 32 --lora-alpha 64 --lora-dropout 0.0 \
    --lora-target-modules "q_proj,k_proj,v_proj,out_proj,fc1,fc2" \
    --eval-steps "$save_steps" --save-steps "$save_steps" --save-total-limit 4 --logging-steps 10 \
    --generation-num-beams 1 --generation-no-repeat-ngram-size 0 \
    --generation-repetition-penalty 1.0 --generation-length-penalty 1.0 \
    --seed "$SEED" --full-determinism --no-shuffle-before-cap \
    --no-load-best-model-at-end --no-merge-full-model \
    2>&1 | tee "$LOG_ROOT/$label.train.log"
}

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

# A single mixed, long-example update tests CUDA, memory, schema, task accounting,
# special-token persistence, and adapter serialization before the paid run.
"$PYTHON" - "$TRAIN_FILE" "$WORK_ROOT/smoke/train.eng-gvn.jsonl" <<'PY'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
output = Path(sys.argv[2])
lexemes = []
sentences = []
with source.open(encoding="utf-8") as handle:
    for line in handle:
        row = json.loads(line)
        score = len(row["input_text"]) + len(row["output_text"])
        destination = lexemes if row.get("pair_kind") == "dictionary_lexeme" else sentences
        destination.append((score, row["id"], row))
selected = [row for _, _, row in sorted(lexemes, reverse=True)[:16]]
selected += [row for _, _, row in sorted(sentences, reverse=True)[:16]]
if len(selected) != 32:
    raise SystemExit("could not construct a 16+16 smoke batch")
with output.open("w", encoding="utf-8") as handle:
    for row in selected:
        handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
PY

train_model "smoke" "$WORK_ROOT/smoke/train.eng-gvn.jsonl" "$MODEL_ROOT/smoke" 1 1 "$MONITOR_FILE"
jq -e '
  .trainer_state.global_step == 1
  and .trainer_state.actual_training_exposure.examples == 32
  and .trainer_state.actual_training_exposure.unique_rows_seen == 32
  and .trainer_state.actual_training_exposure.by_task.dictionary_lexeme.examples == 16
  and .token_adaptation.unselected_audit_rows_unchanged == true
  and .artifacts.merged_dir == null
' "$MODEL_ROOT/smoke/model_manifest.json" >/dev/null
cp "$MODEL_ROOT/smoke/model_manifest.json" "$ANALYSIS_ROOT/smoke-model-manifest.json"
rm -rf "$MODEL_ROOT/smoke"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] smoke verified; starting full arm" | tee -a "$DRIVER_LOG"

train_model "$ARM" "$TRAIN_FILE" "$MODEL_ROOT/$ARM" "$MAX_STEPS" "$SAVE_STEPS" "$MONITOR_FILE"
jq -e \
  --argjson steps "$MAX_STEPS" --argjson batch "$BATCH_SIZE" \
  '.trainer_state.global_step == $steps
   and .training_args.max_steps == $steps
   and .training_args.batch_size == $batch
   and .training_args.gradient_accumulation_steps == 1
   and .dataset.split_rows.train == 71552
   and .dataset.split_rows.validation == 128
   and .trainer_state.actual_training_exposure.examples == 71552
   and .trainer_state.actual_training_exposure.unique_rows_seen == 71552
   and .trainer_state.actual_training_exposure.presentations_per_seen_row.minimum == 1
   and .trainer_state.actual_training_exposure.presentations_per_seen_row.maximum == 1
   and .trainer_state.actual_training_exposure.by_task.dictionary_lexeme.examples == 35412
   and .training_args.additional_special_tokens == ["<lexeme>"]
   and (.training_args.trainable_tokens | length) == 1
   and .training_args.trainable_tokens[0].token == "<lexeme>"
   and .token_adaptation.unselected_audit_rows_unchanged == true
   and .artifacts.merged_dir == null' "$MODEL_ROOT/$ARM/model_manifest.json" >/dev/null

mapfile -t checkpoints < <(find "$MODEL_ROOT/$ARM" -maxdepth 1 -type d -name 'checkpoint-*' | sort -V)
expected_steps=(559 1118 1677 2236)
[[ "${#checkpoints[@]}" -eq "${#expected_steps[@]}" ]] || {
  echo "Expected four checkpoints; found ${#checkpoints[@]}" >&2
  exit 5
}

cp "$BASELINE_CURATED" "$PREDICTION_ROOT/B0.curated.json"
cp "$BASELINE_RETENTION" "$PREDICTION_ROOT/B0.retention.json"
curated_candidates=(--candidate "B0=$PREDICTION_ROOT/B0.curated.json")
retention_candidates=(--candidate "B0=$PREDICTION_ROOT/B0.retention.json")
qualitative_candidates=(--candidate "B0=$PREDICTION_ROOT/B0.curated.json")

for index in "${!checkpoints[@]}"; do
  checkpoint="${checkpoints[$index]}"
  step="${checkpoint##*-}"
  [[ "$step" -eq "${expected_steps[$index]}" ]] || {
    echo "Unexpected checkpoint sequence at index $index: $step" >&2
    exit 5
  }
  label="${ARM}_s$(printf '%04d' "$step")"
  curated_output="$PREDICTION_ROOT/$label.curated.json"
  retention_output="$PREDICTION_ROOT/$label.retention.json"
  run_eval "$label-curated" "$CURATED_EVAL" "$curated_output" "$checkpoint"
  run_eval "$label-retention" "$DEVELOPMENT_SUITE" "$retention_output" "$checkpoint"
  curated_candidates+=(--candidate "$label=$curated_output")
  retention_candidates+=(--candidate "$label=$retention_output")
  qualitative_candidates+=(--candidate "$label=$curated_output")
done

"$PYTHON" "$SCRIPT_DIR/score_lexical_reconstruction.py" \
  "${curated_candidates[@]}" --gate-lower-bound 0.80 \
  --output "$ANALYSIS_ROOT/all-checkpoint-curated-scores.json" \
  | tee "$LOG_ROOT/all-checkpoint-curated-scores.stdout.json"

"$PYTHON" "$SCRIPT_DIR/select_v24_screen.py" \
  "${retention_candidates[@]}" --baseline-label B0 --control-label B0 \
  --lexical-endpoint lexicon_closed_set \
  --retention-endpoint synthetic_dev --retention-endpoint natural_dev_text36 \
  --retention-endpoint usage_diagnostic --retention-endpoint elder_diagnostic \
  --minimum-exact-gain-over-control 1 --chrf-noninferiority-margin 1.0 \
  --bootstrap-samples 10000 --seed v24.2-joint-replay-retention \
  --output "$ANALYSIS_ROOT/all-checkpoint-retention.json" \
  | tee "$LOG_ROOT/all-checkpoint-retention.stdout.json"

"$PYTHON" "$SCRIPT_DIR/analyze_v24_lexicon_errors.py" \
  "${qualitative_candidates[@]}" --control-label B0 --tokenizer-dir "$BASE_MODEL" \
  --synthetic-file "$SYNTHETIC_TRAIN" --sample-per-cohort 16 \
  --seed v24.2-joint-replay-all-lexeme-census \
  --output "$ANALYSIS_ROOT/all-checkpoint-qualitative-summary.json" \
  --review-sample-output "$ANALYSIS_ROOT/all-checkpoint-review-sample.jsonl" \
  --row-analysis-output "$ANALYSIS_ROOT/all-checkpoint-row-analysis.jsonl" \
  | tee "$LOG_ROOT/all-checkpoint-qualitative.stdout.json"

"$PYTHON" - \
  "$ANALYSIS_ROOT/all-checkpoint-row-analysis.jsonl" \
  "$ANALYSIS_ROOT/all-checkpoint-failures.jsonl" <<'PY'
import json
import sys
from pathlib import Path

source = Path(sys.argv[1])
output = Path(sys.argv[2])
failures = 0
with source.open(encoding="utf-8") as reader, output.open("w", encoding="utf-8") as writer:
    for line in reader:
        row = json.loads(line)
        if not row["analysis"]["exact_accepted"]:
            writer.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            failures += 1
if failures == 0:
    raise SystemExit("failure ledger unexpectedly empty")
print(json.dumps({"failure_rows": failures, "output": str(output)}))
PY

"$PYTHON" - \
  "$ANALYSIS_ROOT/all-checkpoint-curated-scores.json" \
  "$ANALYSIS_ROOT/all-checkpoint-retention.json" \
  "$ANALYSIS_ROOT/all-checkpoint-qualitative-summary.json" \
  "$MODEL_ROOT/$ARM/model_manifest.json" \
  "$ANALYSIS_ROOT/final-decision.json" <<'PY'
import json
import re
import sys
from pathlib import Path

lexical_path, retention_path, qualitative_path, manifest_path, output_path = sys.argv[1:]
lexical = json.loads(Path(lexical_path).read_text(encoding="utf-8"))
retention = json.loads(Path(retention_path).read_text(encoding="utf-8"))
qualitative = json.loads(Path(qualitative_path).read_text(encoding="utf-8"))
manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))

assessments = retention["decision"]["assessments"]
records = []
for label, metrics in lexical["models"].items():
    if label == "B0":
        continue
    retention_metrics = assessments[label]
    qualitative_metrics = qualitative["models"][label]
    step_match = re.search(r"_s(\d+)$", label)
    if not step_match:
        raise SystemExit(f"cannot parse checkpoint step from {label}")
    records.append({
        "label": label,
        "step": int(step_match.group(1)),
        "all_2724_lexemes_scored": metrics["rows"] == 2724,
        "lexical": metrics,
        "retention": retention_metrics,
        "failure_categories": qualitative_metrics["error_categories"],
        "lexical_gate_pass": metrics["passes_confidence_adjusted_gate"],
        "sentence_retention_gate_pass": retention_metrics["eligible"],
        "joint_gate_pass": (
            metrics["passes_confidence_adjusted_gate"]
            and retention_metrics["eligible"]
            and metrics["rows"] == 2724
        ),
    })
eligible = [record for record in records if record["joint_gate_pass"]]
eligible.sort(key=lambda record: (
    -record["lexical"]["accepted_exact_count"],
    -record["lexical"]["wilson_95"]["low"],
    -record["retention"]["minimum_retention_chrf_delta"],
    record["step"],
))
result = {
    "schema_version": 1,
    "status": "ADVANCE" if eligible else "NO_ADVANCE",
    "selected_label": eligible[0]["label"] if eligible else None,
    "checkpoint_assessments": records,
    "observed_global_step": manifest["trainer_state"]["global_step"],
    "actual_training_exposure": manifest["trainer_state"]["actual_training_exposure"],
    "interpretation": (
        "Closed-set lexical reconstruction uses training-overlapping dictionary records. Passing it does not "
        "establish unseen lexical generalization or sentence translation reliability."
    ),
    "promotion_or_deployment_authorized": False,
}
Path(output_path).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
PY

cleanup
trap - EXIT
END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '%s\n' "$END_UTC" > "$WORK_ROOT/COMPLETE"
echo "[$END_UTC] v24.2 joint replay complete; finalizing checksum ledger" | tee -a "$DRIVER_LOG"
find "$WORK_ROOT" -type f \
  ! -path '*/checkpoint-*/optimizer.pt' \
  ! -path '*/checkpoint-*/rng_state.pth' \
  ! -path '*/checkpoint-*/scheduler.pt' \
  ! -path '*/logs/final-checksums.verify.log' \
  ! -name 'SHA256SUMS.final' \
  -printf '%P\0' | sort -z | xargs -0 sha256sum > "$WORK_ROOT/SHA256SUMS.final"
sha256sum -c "$WORK_ROOT/SHA256SUMS.final" > "$LOG_ROOT/final-checksums.verify.log"
