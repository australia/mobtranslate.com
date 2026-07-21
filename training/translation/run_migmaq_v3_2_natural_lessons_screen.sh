#!/usr/bin/env bash
set -euo pipefail

ARM="${ARM:?Set ARM to base, retention, lessons20, or lessons40}"
EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:?Set EXPERIMENT_CONTRACT}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:?Set EXPECTED_EXPERIMENT_CONTRACT_SHA256}"
CODE_DIR="${CODE_DIR:-/workspace/migmaq-v3-2/code}"
BASE_DIR="${BASE_DIR:-/workspace/migmaq-v3-2/base-v1/merged}"
DATA_DIR="${DATA_DIR:-/workspace/migmaq-v3-2/data/natural-lessons-v0.1.0}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/workspace/migmaq-v3-2/results}"
PYTHON_BIN="${PYTHON_BIN:-python}"
MAX_STEPS="${MAX_STEPS:-600}"
SEED="${SEED:-42}"
RUN_ID="${RUN_ID:-migmaq-v3-2-${ARM}-seed${SEED}-steps${MAX_STEPS}-20260721}"
OUTPUT_DIR="$OUTPUT_ROOT/$RUN_ID"

BASE_MODEL_SHA256="8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01"
BASE_TOKENIZER_SHA256="1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef"
BASE_TOKENIZER_BUNDLE_SHA256="9dabc3459cd815e67d438d9a103d80bcc1dc9338b0663198bd6f02baa227e590"
DATASET_MANIFEST_SHA256="c03786b10248e75097adf1f2da73476d97ce40473ba572f9a4712142302a815c"

if [[ "$MAX_STEPS" != "600" ]]; then
  echo "This preregistered screen requires MAX_STEPS=600" >&2
  exit 2
fi
if [[ "$SEED" != "42" ]]; then
  echo "This preregistered screen requires SEED=42" >&2
  exit 2
fi

case "$ARM" in
  base)
    TRAIN_FILE=""
    EXPECTED_TRAIN_SHA256=""
    ;;
  retention)
    TRAIN_FILE="$DATA_DIR/schedules/retention-screen-600.eng-mic.jsonl"
    EXPECTED_TRAIN_SHA256="1cadc3565e46c2aabb33b1890c4eb089dd7e0527d06f1ea047c8adf301c37037"
    ;;
  lessons20)
    TRAIN_FILE="$DATA_DIR/schedules/lessons20-screen-600.eng-mic.jsonl"
    EXPECTED_TRAIN_SHA256="49d490b32875649ac870eec3fae788f5d5336248933d0c775fc01ced585d59d4"
    ;;
  lessons40)
    TRAIN_FILE="$DATA_DIR/schedules/lessons40-screen-600.eng-mic.jsonl"
    EXPECTED_TRAIN_SHA256="9a70d249ea53e4025c6e5967efdaddca840d7536336e07b5452f194467aab2ec"
    ;;
  *)
    echo "Unsupported ARM: $ARM" >&2
    exit 2
    ;;
esac

DATASET_MANIFEST="$DATA_DIR/manifest.json"
EXISTING_VALIDATION="$DATA_DIR/evaluation/existing-validation-unprefixed.eng-mic.jsonl"
EXISTING_OPENED="$DATA_DIR/evaluation/existing-opened-regression-unprefixed.eng-mic.jsonl"
LESSON_VALIDATION="$DATA_DIR/evaluation/lesson-validation-sentences.eng-mic.jsonl"
LESSON_LEXEMES="$DATA_DIR/evaluation/lesson-validation-lexemes-plain.eng-mic.jsonl"
LEXICAL_ALL="$DATA_DIR/evaluation/lexical-all-plain.eng-mic.jsonl"

verify_sha256() {
  local expected="$1"
  local path="$2"
  local actual
  actual="$(sha256sum "$path" | cut -d ' ' -f 1)"
  if [[ "$actual" != "$expected" ]]; then
    echo "SHA-256 mismatch for $path: expected=$expected actual=$actual" >&2
    exit 3
  fi
}

required_files=(
  "$BASE_DIR/model.safetensors"
  "$BASE_DIR/tokenizer.json"
  "$DATASET_MANIFEST"
  "$EXISTING_VALIDATION"
  "$EXISTING_OPENED"
  "$LESSON_VALIDATION"
  "$LESSON_LEXEMES"
  "$LEXICAL_ALL"
  "$EXPERIMENT_CONTRACT"
)
if [[ -n "$TRAIN_FILE" ]]; then
  required_files+=("$TRAIN_FILE")
fi
for path in "${required_files[@]}"; do
  if [[ ! -f "$path" ]]; then
    echo "Required input is absent: $path" >&2
    exit 4
  fi
done

verify_sha256 "$BASE_MODEL_SHA256" "$BASE_DIR/model.safetensors"
verify_sha256 "$BASE_TOKENIZER_SHA256" "$BASE_DIR/tokenizer.json"
verify_sha256 "$DATASET_MANIFEST_SHA256" "$DATASET_MANIFEST"
verify_sha256 "d37fba1f464ec3fe2b7f399faca4cacb22a00fd02a7163e9f844002abf8ac95e" "$EXISTING_VALIDATION"
verify_sha256 "7f302bc158d46276b288314dd29148c86e94eba138c57cc1093b3e0900aeae0d" "$EXISTING_OPENED"
verify_sha256 "ee5e3ee09728c1577c8f3aa3255c829ef1abcb85b5db070194245dbe4e34dba2" "$LESSON_VALIDATION"
verify_sha256 "336a9df6d976b74d80afe286596a6c645bddcdd246aaaf7d29c97043e56af14d" "$LESSON_LEXEMES"
verify_sha256 "6ce12eb71b07eb77111b7ab35df178bbc66bd1f134a900c75d37bbbcbb574e49" "$LEXICAL_ALL"
verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"
if [[ -n "$TRAIN_FILE" ]]; then
  verify_sha256 "$EXPECTED_TRAIN_SHA256" "$TRAIN_FILE"
fi

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "Refusing to overwrite existing run directory: $OUTPUT_DIR" >&2
  exit 5
fi
mkdir -p "$OUTPUT_DIR/evaluations"
install -m 0644 "$EXPERIMENT_CONTRACT" "$OUTPUT_DIR/input-experiment-contract.json"

exec > >(tee -a "$OUTPUT_DIR/run.log") 2>&1

export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTHONHASHSEED="$SEED"
export TOKENIZERS_PARALLELISM=false
export PYTHONPATH="$CODE_DIR${PYTHONPATH:+:$PYTHONPATH}"

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'started_at=%s arm=%s run_id=%s max_steps=%s seed=%s\n' \
  "$STARTED_AT" "$ARM" "$RUN_ID" "$MAX_STEPS" "$SEED"
nvidia-smi
df -h /workspace
"$PYTHON_BIN" --version

"$PYTHON_BIN" - "$OUTPUT_DIR/environment-manifest.json" <<'PY'
import importlib.metadata
import json
import platform
import sys

packages = ("torch", "transformers", "peft", "datasets", "tokenizers", "sentencepiece", "sacrebleu", "regex")
out = {
    "python": sys.version,
    "platform": platform.platform(),
    "packages": {},
}
for package in packages:
    try:
        out["packages"][package] = importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        out["packages"][package] = None
with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump(out, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

nvidia-smi \
  --query-gpu=timestamp,index,name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu \
  --format=csv \
  --loop=5 > "$OUTPUT_DIR/resource-monitor.csv" &
MONITOR_PID=$!
stop_monitor() {
  kill "$MONITOR_PID" 2>/dev/null || true
  wait "$MONITOR_PID" 2>/dev/null || true
}
trap stop_monitor EXIT

ARTIFACT_DIR="$BASE_DIR"
ARTIFACT_SHA256="$BASE_MODEL_SHA256"
TOKENIZER_BUNDLE_SHA256="$BASE_TOKENIZER_BUNDLE_SHA256"
ADAPTER_ARGS=()

if [[ "$ARM" != "base" ]]; then
  "$PYTHON_BIN" "$CODE_DIR/train_nllb_lora.py" \
    --train-file "$TRAIN_FILE" \
    --validation-file "$EXISTING_VALIDATION" \
    --test-file "$EXISTING_OPENED" \
    --output-dir "$OUTPUT_DIR/model" \
    --model-id mobtranslate/migmaq-listuguj-nllb-600m-v3 \
    --model-version "3.2.0-screen-${ARM}-seed${SEED}-steps${MAX_STEPS}" \
    --run-id "$RUN_ID" \
    --dataset-id migmaq-v3.2-natural-lessons-schedules-v0.1.0-20260721 \
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
  TOKENIZER_BUNDLE_SHA256="$($PYTHON_BIN -c 'from pathlib import Path; import sys; from evaluate_migmaq_lexical_baseline import tokenizer_bundle_identity; print(tokenizer_bundle_identity(Path(sys.argv[1]))["sha256"])' "$ARTIFACT_DIR")"
  if [[ "$TOKENIZER_BUNDLE_SHA256" != "$BASE_TOKENIZER_BUNDLE_SHA256" ]]; then
    echo "LoRA-only adapter tokenizer bundle changed: $TOKENIZER_BUNDLE_SHA256" >&2
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
    raise SystemExit(f"unique exposure mismatch: {exposure['unique_rows_seen']}")
presentations = exposure["presentations_per_seen_row"]
if presentations["minimum"] != 1 or presentations["maximum"] != 1:
    raise SystemExit(f"row presentation mismatch: {presentations}")
if model["training_args"]["modules_to_save"]:
    raise SystemExit("sentence-only compact adapter unexpectedly saves full modules")
if model["training_args"]["ensure_weight_tying"]:
    raise SystemExit("v1 untied output-head contract was not preserved")
print(json.dumps({"arm": arm, "exposure": exposure, "expected": expected}, indent=2))
PY
  ADAPTER_ARGS=(--adapter-dir "$ARTIFACT_DIR")
fi

evaluate_sentence() {
  local label="$1"
  local data_file="$2"
  "$PYTHON_BIN" "$CODE_DIR/evaluate_nllb_lora.py" \
    --model-dir "$BASE_DIR" \
    "${ADAPTER_ARGS[@]}" \
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
  local label="$1"
  local data_file="$2"
  local expected_hash="$3"
  local expected_rows="$4"
  local mode_args=()
  if [[ "$ARM" != "base" ]]; then
    mode_args=(
      --base-model "$BASE_DIR"
      --adapter-dir "$ARTIFACT_DIR"
      --expected-base-model-sha256 "$BASE_MODEL_SHA256"
      --expected-base-tokenizer-sha256 "$BASE_TOKENIZER_SHA256"
    )
  fi
  "$PYTHON_BIN" "$CODE_DIR/evaluate_migmaq_lexical_baseline.py" \
    --model-dir "$ARTIFACT_DIR" \
    "${mode_args[@]}" \
    --benchmark "$data_file" \
    --output-dir "$OUTPUT_DIR/evaluations/$label" \
    --expected-model-sha256 "$ARTIFACT_SHA256" \
    --expected-tokenizer-bundle-sha256 "$TOKENIZER_BUNDLE_SHA256" \
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
evaluate_sentence lesson-validation-sentences "$LESSON_VALIDATION"
evaluate_lexical lexical-all-plain "$LEXICAL_ALL" \
  "6ce12eb71b07eb77111b7ab35df178bbc66bd1f134a900c75d37bbbcbb574e49" 14438
evaluate_lexical lesson-validation-lexemes-plain "$LESSON_LEXEMES" \
  "336a9df6d976b74d80afe286596a6c645bddcdd246aaaf7d29c97043e56af14d" 103

COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"$PYTHON_BIN" - "$OUTPUT_DIR/run-manifest.json" <<PY
import json

manifest = {
    "schema_version": 1,
    "run_id": "$RUN_ID",
    "arm": "$ARM",
    "started_at": "$STARTED_AT",
    "completed_at": "$COMPLETED_AT",
    "seed": $SEED,
    "max_steps": $MAX_STEPS,
    "base_model_sha256": "$BASE_MODEL_SHA256",
    "base_tokenizer_sha256": "$BASE_TOKENIZER_SHA256",
    "base_tokenizer_bundle_sha256": "$BASE_TOKENIZER_BUNDLE_SHA256",
    "dataset_manifest_sha256": "$DATASET_MANIFEST_SHA256",
    "train_file_sha256": "$EXPECTED_TRAIN_SHA256" or None,
    "artifact_kind": "merged_v1_baseline" if "$ARM" == "base" else "compact_lora_only_adapter",
    "artifact_safetensors_sha256": "$ARTIFACT_SHA256",
    "artifact_tokenizer_bundle_sha256": "$TOKENIZER_BUNDLE_SHA256",
    "decoder": {
        "num_beams": 4,
        "no_repeat_ngram_size": 3,
        "repetition_penalty": 1.1,
        "length_penalty": 1.0,
        "do_sample": False,
    },
    "claim_limit": "Single-seed development screen; cannot authorize publication or sentence deployment.",
}
with open("$OUTPUT_DIR/run-manifest.json", "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

stop_monitor
trap - EXIT
find "$OUTPUT_DIR" -type f ! -name RUN-SHA256SUMS -printf '%P\n' \
  | sort \
  | while IFS= read -r relative; do sha256sum "$OUTPUT_DIR/$relative"; done \
  | sed "s#  $OUTPUT_DIR/#  ./#" > "$OUTPUT_DIR/RUN-SHA256SUMS"
sha256sum -c "$OUTPUT_DIR/RUN-SHA256SUMS"
printf 'completed_at=%s arm=%s artifact_sha256=%s\n' "$COMPLETED_AT" "$ARM" "$ARTIFACT_SHA256"
