#!/usr/bin/env bash
set -euo pipefail

ARM="${ARM:?Set ARM to retention, dialog20, or dialog40}"
EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:?Set EXPERIMENT_CONTRACT}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:?Set EXPECTED_EXPERIMENT_CONTRACT_SHA256}"
CODE_DIR="${CODE_DIR:-/workspace/migmaq-v3-3/code}"
BASE_DIR="${BASE_DIR:-/workspace/migmaq-v3-3/base-v1/merged}"
DATA_DIR="${DATA_DIR:-/workspace/migmaq-v3-3/data/natural-dialog-v0.1.0}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/workspace/migmaq-v3-3/results}"
PYTHON_BIN="${PYTHON_BIN:-python}"
MAX_STEPS="${MAX_STEPS:-600}"
SEED="${SEED:-42}"
STUDY_PHASE="${STUDY_PHASE:-screen}"
RUN_ID="${RUN_ID:-migmaq-v3-3-${STUDY_PHASE}-${ARM}-seed${SEED}-steps${MAX_STEPS}-20260721}"
OUTPUT_DIR="$OUTPUT_ROOT/$RUN_ID"

BASE_MODEL_SHA256="8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01"
BASE_TOKENIZER_SHA256="1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef"
BASE_TOKENIZER_BUNDLE_SHA256="9dabc3459cd815e67d438d9a103d80bcc1dc9338b0663198bd6f02baa227e590"
DATASET_MANIFEST_SHA256="7bbc35cc33c918d647c498e7ea7258fa6d4202a023c216e2d900b9009ce1d4b6"

if [[ "$MAX_STEPS" != "600" ]]; then
  echo "The v3.3 dialog study requires exactly 600 optimizer updates" >&2
  exit 2
fi

case "$STUDY_PHASE" in
  screen)
    [[ "$SEED" == "42" ]] || {
      echo "The preregistered screen requires seed 42" >&2
      exit 2
    }
    CLAIM_LIMIT="Single-seed development screen; cannot authorize publication or sentence deployment."
    ;;
  confirmation)
    [[ "$ARM" == "retention" || "$ARM" == "dialog40" ]] || {
      echo "Confirmation permits only retention and dialog40" >&2
      exit 2
    }
    [[ "$SEED" == "17" || "$SEED" == "73" ]] || {
      echo "Confirmation permits only seeds 17 and 73" >&2
      exit 2
    }
    CLAIM_LIMIT="Multi-seed development confirmation run; cannot authorize publication, sealed-test success, or sentence deployment."
    ;;
  *)
    echo "Unsupported STUDY_PHASE: $STUDY_PHASE" >&2
    exit 2
    ;;
esac

case "$ARM" in
  retention) EXPECTED_TRAIN_SHA256="7cfa501305992c561781a18ff72816d2721fbd53d387b6b8751af488bb969aee" ;;
  dialog20) EXPECTED_TRAIN_SHA256="9ac0d31e4423985e3907fb598bcd87effd9a0b423e935554d4abd8e6b38e6861" ;;
  dialog40) EXPECTED_TRAIN_SHA256="26f46486c0901dfb24223579a6e4ba32edb5e16ca60335ee7271c6083610536e" ;;
  *) echo "Unsupported ARM: $ARM" >&2; exit 2 ;;
esac

TRAIN_FILE="$DATA_DIR/schedules/${ARM}-screen-600.eng-mic.jsonl"
DATASET_MANIFEST="$DATA_DIR/manifest.json"
EXISTING_VALIDATION="$DATA_DIR/evaluation/existing-validation-unprefixed.eng-mic.jsonl"
EXISTING_OPENED="$DATA_DIR/evaluation/existing-opened-regression-unprefixed.eng-mic.jsonl"
LESSON_VALIDATION="$DATA_DIR/evaluation/lesson-validation-all.eng-mic.jsonl"
LESSON_LEXEMES="$DATA_DIR/evaluation/lesson-validation-lexemes-plain.eng-mic.jsonl"
LEXICAL_ALL="$DATA_DIR/evaluation/lexical-all-plain.eng-mic.jsonl"
CANONICALIZER="$CODE_DIR/canonicalize_identical_tokenizer_bundle.py"

verify_sha256() {
  local expected="$1" path="$2" actual
  actual="$(sha256sum "$path" | cut -d ' ' -f 1)"
  if [[ "$actual" != "$expected" ]]; then
    printf 'SHA-256 mismatch for %s: expected=%s actual=%s\n' "$path" "$expected" "$actual" >&2
    exit 3
  fi
}

required_files=(
  "$BASE_DIR/model.safetensors"
  "$BASE_DIR/tokenizer.json"
  "$DATASET_MANIFEST"
  "$TRAIN_FILE"
  "$EXISTING_VALIDATION"
  "$EXISTING_OPENED"
  "$LESSON_VALIDATION"
  "$LESSON_LEXEMES"
  "$LEXICAL_ALL"
  "$EXPERIMENT_CONTRACT"
  "$CANONICALIZER"
)
for path in "${required_files[@]}"; do
  [[ -f "$path" ]] || { printf 'Required input is absent: %s\n' "$path" >&2; exit 4; }
done

verify_sha256 "$BASE_MODEL_SHA256" "$BASE_DIR/model.safetensors"
verify_sha256 "$BASE_TOKENIZER_SHA256" "$BASE_DIR/tokenizer.json"
verify_sha256 "$DATASET_MANIFEST_SHA256" "$DATASET_MANIFEST"
verify_sha256 "$EXPECTED_TRAIN_SHA256" "$TRAIN_FILE"
verify_sha256 "d37fba1f464ec3fe2b7f399faca4cacb22a00fd02a7163e9f844002abf8ac95e" "$EXISTING_VALIDATION"
verify_sha256 "7f302bc158d46276b288314dd29148c86e94eba138c57cc1093b3e0900aeae0d" "$EXISTING_OPENED"
verify_sha256 "ee5e3ee09728c1577c8f3aa3255c829ef1abcb85b5db070194245dbe4e34dba2" "$LESSON_VALIDATION"
verify_sha256 "336a9df6d976b74d80afe286596a6c645bddcdd246aaaf7d29c97043e56af14d" "$LESSON_LEXEMES"
verify_sha256 "6ce12eb71b07eb77111b7ab35df178bbc66bd1f134a900c75d37bbbcbb574e49" "$LEXICAL_ALL"
verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "Refusing to overwrite existing run directory: $OUTPUT_DIR" >&2
  exit 5
fi
mkdir -p "$OUTPUT_DIR/evaluations"
install -m 0644 "$EXPERIMENT_CONTRACT" "$OUTPUT_DIR/input-experiment-contract.json"

exec 3>&1 4>&2
exec > >(tee -a "$OUTPUT_DIR/run.log") 2>&1
LOG_TEE_PID="$!"
export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTHONHASHSEED="$SEED"
export TOKENIZERS_PARALLELISM=false
export PYTHONPATH="$CODE_DIR${PYTHONPATH:+:$PYTHONPATH}"

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'started_at=%s phase=%s arm=%s run_id=%s max_steps=%s seed=%s\n' \
  "$STARTED_AT" "$STUDY_PHASE" "$ARM" "$RUN_ID" "$MAX_STEPS" "$SEED"
nvidia-smi
df -h /workspace
"$PYTHON_BIN" --version

"$PYTHON_BIN" - "$OUTPUT_DIR/environment-manifest.json" <<'PY'
import importlib.metadata
import json
import platform
import sys

packages = (
    "torch", "transformers", "peft", "datasets", "tokenizers",
    "sentencepiece", "sacrebleu", "regex",
)
out = {"python": sys.version, "platform": platform.platform(), "packages": {}}
for package in packages:
    try:
        out["packages"][package] = importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        out["packages"][package] = None
with open(sys.argv[1], "x", encoding="utf-8") as handle:
    json.dump(out, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

monitor_pid=""
nvidia-smi \
  --query-gpu=timestamp,index,name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu \
  --format=csv \
  --loop=5 > "$OUTPUT_DIR/resource-monitor.csv" &
monitor_pid="$!"
cleanup() {
  [[ -z "$monitor_pid" ]] || kill "$monitor_pid" >/dev/null 2>&1 || true
  [[ -z "$monitor_pid" ]] || wait "$monitor_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"$PYTHON_BIN" "$CODE_DIR/train_nllb_lora.py" \
  --train-file "$TRAIN_FILE" \
  --validation-file "$EXISTING_VALIDATION" \
  --test-file "$EXISTING_OPENED" \
  --output-dir "$OUTPUT_DIR/model" \
  --model-id mobtranslate/migmaq-listuguj-nllb-600m-v3 \
  --model-version "3.3.0-${STUDY_PHASE}-${ARM}-seed${SEED}-steps${MAX_STEPS}" \
  --run-id "$RUN_ID" \
  --dataset-id migmaq-v3.3-natural-dialog-schedules-v0.1.0-20260721 \
  --dataset-release-sha256 "$DATASET_MANIFEST_SHA256" \
  --license cc-by-nc-4.0 \
  --base-model "$BASE_DIR" \
  --training-mode lora \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --direction eng-mic \
  --max-source-length 192 \
  --max-target-length 192 \
  --learning-rate 5e-5 \
  --max-steps "$MAX_STEPS" \
  --batch-size 8 \
  --gradient-accumulation-steps 4 \
  --optimizer adamw_torch \
  --lr-scheduler-type linear \
  --warmup-ratio 0 \
  --warmup-steps 48 \
  --weight-decay 0.01 \
  --label-smoothing-factor 0 \
  --max-grad-norm 1.0 \
  --lora-r 32 \
  --lora-alpha 64 \
  --lora-dropout 0.05 \
  --lora-target-modules q_proj,k_proj,v_proj,out_proj,fc1,fc2 \
  --modules-to-save '' \
  --save-steps 600 \
  --save-total-limit 1 \
  --eval-steps 600 \
  --logging-steps 10 \
  --generation-num-beams 1 \
  --generation-no-repeat-ngram-size 0 \
  --generation-repetition-penalty 1.0 \
  --generation-length-penalty 1.0 \
  --seed "$SEED" \
  --no-shuffle-before-cap \
  --full-determinism \
  --no-load-best-model-at-end \
  --no-merge-full-model \
  --no-ensure-weight-tying

MODEL_MANIFEST="$OUTPUT_DIR/model/model_manifest.json"
ARTIFACT_DIR="$OUTPUT_DIR/model/adapter"
ARTIFACT_SHA256="$(sha256sum "$ARTIFACT_DIR/adapter_model.safetensors" | cut -d ' ' -f 1)"

# Transformers rewrites tokenizer metadata while saving an adapter. Prove semantic
# identity on every frozen input, then restore the exact immutable base bytes.
"$PYTHON_BIN" "$CANONICALIZER" \
  --base-dir "$BASE_DIR" \
  --adapter-dir "$ARTIFACT_DIR" \
  --data-file "$EXISTING_VALIDATION" \
  --data-file "$EXISTING_OPENED" \
  --data-file "$LESSON_VALIDATION" \
  --data-file "$LESSON_LEXEMES" \
  --data-file "$LEXICAL_ALL" \
  --output "$OUTPUT_DIR/tokenizer-canonicalization-audit.json" \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --max-length 192 \
  --expected-base-bundle-sha256 "$BASE_TOKENIZER_BUNDLE_SHA256"

TOKENIZER_BUNDLE_SHA256="$($PYTHON_BIN -c 'from pathlib import Path; import sys; from evaluate_migmaq_lexical_baseline import tokenizer_bundle_identity; print(tokenizer_bundle_identity(Path(sys.argv[1]))["sha256"])' "$ARTIFACT_DIR")"
if [[ "$TOKENIZER_BUNDLE_SHA256" != "$BASE_TOKENIZER_BUNDLE_SHA256" ]]; then
  echo "Canonicalized adapter tokenizer bundle differs from the immutable base" >&2
  exit 6
fi

"$PYTHON_BIN" - "$MODEL_MANIFEST" "$DATASET_MANIFEST" "$ARM" <<'PY'
import json
import sys

model_path, dataset_path, arm = sys.argv[1:]
model = json.load(open(model_path, encoding="utf-8"))
dataset = json.load(open(dataset_path, encoding="utf-8"))
if model["trainer_state"]["global_step"] != 600:
    raise SystemExit("global step is not 600")
exposure = model["trainer_state"]["actual_training_exposure"]
expected = dataset["token_accounting"]["schedule_audit"]["arms"][arm]
for key in ("examples", "source_tokens", "target_tokens", "non_padding_tokens"):
    if exposure[key] != expected[key]:
        raise SystemExit(f"{key} exposure mismatch: {exposure[key]} != {expected[key]}")
if exposure["unique_rows_seen"] != 19200:
    raise SystemExit("unique row exposure is not 19,200")
presentations = exposure["presentations_per_seen_row"]
if presentations["minimum"] != 1 or presentations["maximum"] != 1:
    raise SystemExit(f"row presentation mismatch: {presentations}")
if model["training_args"]["modules_to_save"]:
    raise SystemExit("sentence-only compact adapter unexpectedly saves full modules")
if model["training_args"]["ensure_weight_tying"]:
    raise SystemExit("v1 untied output-head contract was not preserved")
print(json.dumps({"arm": arm, "exposure": exposure, "expected": expected}, indent=2))
PY

evaluate_sentence() {
  local label="$1" data_file="$2"
  "$PYTHON_BIN" "$CODE_DIR/evaluate_nllb_lora.py" \
    --model-dir "$BASE_DIR" \
    --adapter-dir "$ARTIFACT_DIR" \
    --data-file "$data_file" \
    --output-file "$OUTPUT_DIR/evaluations/${label}.json" \
    --source-lang eng_Latn \
    --target-lang mic_Latn \
    --direction eng-mic \
    --max-source-length 192 \
    --max-new-tokens 192 \
    --batch-size 32 \
    --num-beams 4 \
    --no-repeat-ngram-size 3 \
    --repetition-penalty 1.1 \
    --length-penalty 1.0 \
    --dtype bfloat16 \
    --require-cuda \
    --deterministic \
    --seed 0
}

evaluate_lexical() {
  local label="$1" data_file="$2" expected_hash="$3" expected_rows="$4"
  "$PYTHON_BIN" "$CODE_DIR/evaluate_migmaq_lexical_baseline.py" \
    --model-dir "$ARTIFACT_DIR" \
    --base-model "$BASE_DIR" \
    --adapter-dir "$ARTIFACT_DIR" \
    --benchmark "$data_file" \
    --output-dir "$OUTPUT_DIR/evaluations/$label" \
    --expected-model-sha256 "$ARTIFACT_SHA256" \
    --expected-tokenizer-bundle-sha256 "$TOKENIZER_BUNDLE_SHA256" \
    --expected-base-model-sha256 "$BASE_MODEL_SHA256" \
    --expected-base-tokenizer-sha256 "$BASE_TOKENIZER_SHA256" \
    --expected-benchmark-sha256 "$expected_hash" \
    --expected-rows "$expected_rows" \
    --expected-target-token-id 256204 \
    --expect-output-head-alias untied \
    --input-field input_text \
    --source-lang eng_Latn \
    --target-lang mic_Latn \
    --batch-size 32 \
    --max-source-length 192 \
    --max-new-tokens 192 \
    --num-beams 4 \
    --no-repeat-ngram-size 3 \
    --repetition-penalty 1.1 \
    --length-penalty 1.0 \
    --dtype bfloat16 \
    --seed 0 \
    --require-cuda
}

evaluate_sentence existing-validation "$EXISTING_VALIDATION"
evaluate_sentence existing-opened-regression "$EXISTING_OPENED"
evaluate_sentence lesson-validation-all "$LESSON_VALIDATION"
evaluate_lexical lexical-all-plain "$LEXICAL_ALL" \
  "6ce12eb71b07eb77111b7ab35df178bbc66bd1f134a900c75d37bbbcbb574e49" 14438
evaluate_lexical lesson-validation-lexemes-plain "$LESSON_LEXEMES" \
  "336a9df6d976b74d80afe286596a6c645bddcdd246aaaf7d29c97043e56af14d" 103

cleanup
trap - EXIT
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
CANONICALIZER_SHA256="$(sha256sum "$CANONICALIZER" | cut -d ' ' -f 1)"
CANONICALIZATION_AUDIT_SHA256="$(sha256sum "$OUTPUT_DIR/tokenizer-canonicalization-audit.json" | cut -d ' ' -f 1)"
"$PYTHON_BIN" - "$OUTPUT_DIR/run-manifest.json" <<PY
import json

manifest = {
    "schema_version": 1,
    "run_id": "$RUN_ID",
    "arm": "$ARM",
    "study_phase": "$STUDY_PHASE",
    "started_at": "$STARTED_AT",
    "completed_at": "$COMPLETED_AT",
    "seed": $SEED,
    "max_steps": $MAX_STEPS,
    "base_model_sha256": "$BASE_MODEL_SHA256",
    "base_tokenizer_sha256": "$BASE_TOKENIZER_SHA256",
    "base_tokenizer_bundle_sha256": "$BASE_TOKENIZER_BUNDLE_SHA256",
    "dataset_manifest_sha256": "$DATASET_MANIFEST_SHA256",
    "train_file_sha256": "$EXPECTED_TRAIN_SHA256",
    "artifact_kind": "compact_lora_only_adapter",
    "artifact_safetensors_sha256": "$ARTIFACT_SHA256",
    "artifact_tokenizer_bundle_sha256": "$TOKENIZER_BUNDLE_SHA256",
    "tokenizer_canonicalization": {
        "semantic_identity_required": True,
        "base_bytes_restored_before_evaluation": True,
        "audit": "tokenizer-canonicalization-audit.json",
        "audit_sha256": "$CANONICALIZATION_AUDIT_SHA256",
        "canonicalizer_sha256": "$CANONICALIZER_SHA256",
        "model_tensors_changed": False,
    },
    "decoder": {
        "num_beams": 4,
        "no_repeat_ngram_size": 3,
        "repetition_penalty": 1.1,
        "length_penalty": 1.0,
        "do_sample": False,
    },
    "claim_limit": "$CLAIM_LIMIT",
}
with open("$OUTPUT_DIR/run-manifest.json", "x", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

printf 'completed_at=%s phase=%s arm=%s artifact_sha256=%s\n' \
  "$COMPLETED_AT" "$STUDY_PHASE" "$ARM" "$ARTIFACT_SHA256"
find "$OUTPUT_DIR" -type f \
  ! -name RUN-SHA256SUMS ! -name run.log ! -name run-log.sha256 \
  -printf '%P\n' \
  | sort \
  | while IFS= read -r relative; do sha256sum "$OUTPUT_DIR/$relative"; done \
  | sed "s#  $OUTPUT_DIR/#  ./#" > "$OUTPUT_DIR/RUN-SHA256SUMS"
(
  cd "$OUTPUT_DIR"
  sha256sum -c RUN-SHA256SUMS
)
exec 1>&3 2>&4
wait "$LOG_TEE_PID"
(
  cd "$OUTPUT_DIR"
  sha256sum run.log > run-log.sha256
)
