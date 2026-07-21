#!/usr/bin/env bash
set -euo pipefail

ARM="${ARM:?Set ARM to retention, lessons20, or lessons40}"
EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:?Set EXPERIMENT_CONTRACT}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:?Set EXPECTED_EXPERIMENT_CONTRACT_SHA256}"
PROTOCOL_AMENDMENT="${PROTOCOL_AMENDMENT:?Set PROTOCOL_AMENDMENT}"
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
ORIGINAL_RUNNER_SHA256="4d28cb499dbce99e0b88a8131350b7a0e69e2b3b2c0edf9eccd5739824851e7d"

case "$ARM" in
  retention) EXPECTED_TRAIN_SHA256="1cadc3565e46c2aabb33b1890c4eb089dd7e0527d06f1ea047c8adf301c37037" ;;
  lessons20) EXPECTED_TRAIN_SHA256="49d490b32875649ac870eec3fae788f5d5336248933d0c775fc01ced585d59d4" ;;
  lessons40) EXPECTED_TRAIN_SHA256="9a70d249ea53e4025c6e5967efdaddca840d7536336e07b5452f194467aab2ec" ;;
  *) echo "Unsupported continuation arm: $ARM" >&2; exit 2 ;;
esac

DATASET_MANIFEST="$DATA_DIR/manifest.json"
EXISTING_VALIDATION="$DATA_DIR/evaluation/existing-validation-unprefixed.eng-mic.jsonl"
EXISTING_OPENED="$DATA_DIR/evaluation/existing-opened-regression-unprefixed.eng-mic.jsonl"
LESSON_VALIDATION="$DATA_DIR/evaluation/lesson-validation-sentences.eng-mic.jsonl"
LESSON_LEXEMES="$DATA_DIR/evaluation/lesson-validation-lexemes-plain.eng-mic.jsonl"
LEXICAL_ALL="$DATA_DIR/evaluation/lexical-all-plain.eng-mic.jsonl"
ARTIFACT_DIR="$OUTPUT_DIR/model/adapter"
MODEL_MANIFEST="$OUTPUT_DIR/model/model_manifest.json"
ORIGINAL_RUNNER="$CODE_DIR/run_migmaq_v3_2_natural_lessons_screen.sh"
CANONICALIZER="$CODE_DIR/canonicalize_identical_tokenizer_bundle.py"

verify_sha256() {
  local expected="$1" path="$2" actual
  actual="$(sha256sum "$path" | cut -d ' ' -f 1)"
  [[ "$actual" == "$expected" ]] || {
    echo "SHA-256 mismatch for $path: $actual != $expected" >&2
    exit 3
  }
}

for path in \
  "$OUTPUT_DIR/run.log" "$MODEL_MANIFEST" "$ARTIFACT_DIR/adapter_model.safetensors" \
  "$DATASET_MANIFEST" "$EXISTING_VALIDATION" "$EXISTING_OPENED" \
  "$LESSON_VALIDATION" "$LESSON_LEXEMES" "$LEXICAL_ALL" \
  "$EXPERIMENT_CONTRACT" "$PROTOCOL_AMENDMENT" "$ORIGINAL_RUNNER" "$CANONICALIZER"; do
  [[ -f "$path" ]] || { echo "Required continuation input is absent: $path" >&2; exit 4; }
done
[[ "$MAX_STEPS" == "600" && "$SEED" == "42" ]] || {
  echo "This continuation is bound to seed 42 and 600 steps" >&2
  exit 5
}
[[ ! -e "$OUTPUT_DIR/run-manifest.json" ]] || {
  echo "Refusing to overwrite completed run manifest" >&2
  exit 6
}
[[ -z "$(find "$OUTPUT_DIR/evaluations" -type f -print -quit)" ]] || {
  echo "Refusing partially populated evaluation directory" >&2
  exit 7
}
grep -q '^LoRA-only adapter tokenizer bundle changed: ' "$OUTPUT_DIR/run.log" || {
  echo "Original runner did not stop at the recorded tokenizer serialization guard" >&2
  exit 8
}

verify_sha256 "$BASE_MODEL_SHA256" "$BASE_DIR/model.safetensors"
verify_sha256 "$BASE_TOKENIZER_SHA256" "$BASE_DIR/tokenizer.json"
verify_sha256 "$DATASET_MANIFEST_SHA256" "$DATASET_MANIFEST"
verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"
verify_sha256 "$ORIGINAL_RUNNER_SHA256" "$ORIGINAL_RUNNER"
verify_sha256 "$EXPECTED_TRAIN_SHA256" "$DATA_DIR/schedules/${ARM}-screen-600.eng-mic.jsonl"
verify_sha256 "d37fba1f464ec3fe2b7f399faca4cacb22a00fd02a7163e9f844002abf8ac95e" "$EXISTING_VALIDATION"
verify_sha256 "7f302bc158d46276b288314dd29148c86e94eba138c57cc1093b3e0900aeae0d" "$EXISTING_OPENED"
verify_sha256 "ee5e3ee09728c1577c8f3aa3255c829ef1abcb85b5db070194245dbe4e34dba2" "$LESSON_VALIDATION"
verify_sha256 "336a9df6d976b74d80afe286596a6c645bddcdd246aaaf7d29c97043e56af14d" "$LESSON_LEXEMES"
verify_sha256 "6ce12eb71b07eb77111b7ab35df178bbc66bd1f134a900c75d37bbbcbb574e49" "$LEXICAL_ALL"

CURRENT_CONTINUATION_SHA256="$(sha256sum "$0" | cut -d ' ' -f 1)"
CURRENT_CANONICALIZER_SHA256="$(sha256sum "$CANONICALIZER" | cut -d ' ' -f 1)"
"$PYTHON_BIN" - "$PROTOCOL_AMENDMENT" "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" \
  "$CURRENT_CONTINUATION_SHA256" "$CURRENT_CANONICALIZER_SHA256" <<'PY'
import json
import sys

path, contract_sha, continuation_sha, canonicalizer_sha = sys.argv[1:]
record = json.load(open(path, encoding="utf-8"))
checks = {
    "status": record.get("status") == "adopted_before_treatment_training",
    "contract": record.get("original_contract_sha256") == contract_sha,
    "continuation": record.get("code", {}).get("continuation_script_sha256") == continuation_sha,
    "canonicalizer": record.get("code", {}).get("canonicalizer_sha256") == canonicalizer_sha,
}
if not all(checks.values()):
    raise SystemExit(f"protocol amendment identity failed: {checks}")
PY
[[ ! -e "$OUTPUT_DIR/input-protocol-amendment.json" ]] || {
  echo "Refusing to overwrite copied protocol amendment" >&2
  exit 10
}
install -m 0644 "$PROTOCOL_AMENDMENT" "$OUTPUT_DIR/input-protocol-amendment.json"

exec > >(tee -a "$OUTPUT_DIR/continuation.log") 2>&1
export TOKENIZERS_PARALLELISM=false
export PYTHONPATH="$CODE_DIR${PYTHONPATH:+:$PYTHONPATH}"
CONTINUATION_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'continuation_started_at=%s arm=%s run_id=%s\n' \
  "$CONTINUATION_STARTED_AT" "$ARM" "$RUN_ID"

"$PYTHON_BIN" "$CANONICALIZER" \
  --base-dir "$BASE_DIR" \
  --adapter-dir "$ARTIFACT_DIR" \
  --data-file "$EXISTING_VALIDATION" \
  --data-file "$EXISTING_OPENED" \
  --data-file "$LESSON_VALIDATION" \
  --data-file "$LESSON_LEXEMES" \
  --data-file "$LEXICAL_ALL" \
  --output "$OUTPUT_DIR/tokenizer-serialization-amendment.json" \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --max-length 192 \
  --expected-base-bundle-sha256 "$BASE_TOKENIZER_BUNDLE_SHA256"

TOKENIZER_BUNDLE_SHA256="$($PYTHON_BIN -c 'from pathlib import Path; import sys; from evaluate_migmaq_lexical_baseline import tokenizer_bundle_identity; print(tokenizer_bundle_identity(Path(sys.argv[1]))["sha256"])' "$ARTIFACT_DIR")"
[[ "$TOKENIZER_BUNDLE_SHA256" == "$BASE_TOKENIZER_BUNDLE_SHA256" ]] || {
  echo "Canonicalized tokenizer bundle still differs" >&2
  exit 9
}

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
    raise SystemExit("unique row exposure mismatch")
presentations = exposure["presentations_per_seen_row"]
if presentations["minimum"] != 1 or presentations["maximum"] != 1:
    raise SystemExit(f"row presentation mismatch: {presentations}")
if model["training_args"]["modules_to_save"]:
    raise SystemExit("adapter unexpectedly saves full modules")
if model["training_args"]["ensure_weight_tying"]:
    raise SystemExit("v1 untied output-head contract was not preserved")
print(json.dumps({"arm": arm, "exposure": exposure, "expected": expected}, indent=2))
PY

ARTIFACT_SHA256="$(sha256sum "$ARTIFACT_DIR/adapter_model.safetensors" | cut -d ' ' -f 1)"
monitor_pid=""
nvidia-smi \
  --query-gpu=timestamp,index,name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu \
  --format=csv \
  --loop=5 > "$OUTPUT_DIR/continuation-resource-monitor.csv" &
monitor_pid="$!"
cleanup() {
  [[ -z "$monitor_pid" ]] || kill "$monitor_pid" >/dev/null 2>&1 || true
  [[ -z "$monitor_pid" ]] || wait "$monitor_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

evaluate_sentence() {
  local label="$1" data_file="$2"
  "$PYTHON_BIN" "$CODE_DIR/evaluate_nllb_lora.py" \
    --model-dir "$BASE_DIR" --adapter-dir "$ARTIFACT_DIR" \
    --data-file "$data_file" --output-file "$OUTPUT_DIR/evaluations/${label}.json" \
    --source-lang eng_Latn --target-lang mic_Latn --direction eng-mic \
    --max-source-length 192 --max-new-tokens 192 --batch-size 32 \
    --num-beams 4 --no-repeat-ngram-size 3 --repetition-penalty 1.1 \
    --length-penalty 1.0 --dtype bfloat16 --require-cuda --deterministic --seed 0
}

evaluate_lexical() {
  local label="$1" data_file="$2" expected_hash="$3" expected_rows="$4"
  "$PYTHON_BIN" "$CODE_DIR/evaluate_migmaq_lexical_baseline.py" \
    --model-dir "$ARTIFACT_DIR" --base-model "$BASE_DIR" --adapter-dir "$ARTIFACT_DIR" \
    --benchmark "$data_file" --output-dir "$OUTPUT_DIR/evaluations/$label" \
    --expected-model-sha256 "$ARTIFACT_SHA256" \
    --expected-tokenizer-bundle-sha256 "$TOKENIZER_BUNDLE_SHA256" \
    --expected-base-model-sha256 "$BASE_MODEL_SHA256" \
    --expected-base-tokenizer-sha256 "$BASE_TOKENIZER_SHA256" \
    --expected-benchmark-sha256 "$expected_hash" --expected-rows "$expected_rows" \
    --expected-target-token-id 256204 --expect-output-head-alias untied \
    --input-field input_text --source-lang eng_Latn --target-lang mic_Latn \
    --batch-size 32 --max-source-length 192 --max-new-tokens 192 \
    --num-beams 4 --no-repeat-ngram-size 3 --repetition-penalty 1.1 \
    --length-penalty 1.0 --dtype bfloat16 --seed 0 --require-cuda
}

evaluate_sentence existing-validation "$EXISTING_VALIDATION"
evaluate_sentence existing-opened-regression "$EXISTING_OPENED"
evaluate_sentence lesson-validation-sentences "$LESSON_VALIDATION"
evaluate_lexical lexical-all-plain "$LEXICAL_ALL" \
  "6ce12eb71b07eb77111b7ab35df178bbc66bd1f134a900c75d37bbbcbb574e49" 14438
evaluate_lexical lesson-validation-lexemes-plain "$LESSON_LEXEMES" \
  "336a9df6d976b74d80afe286596a6c645bddcdd246aaaf7d29c97043e56af14d" 103

cleanup
trap - EXIT
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ORIGINAL_STARTED_AT="$(sed -n 's/^started_at=\([^ ]*\).*/\1/p' "$OUTPUT_DIR/run.log" | head -1)"
CANONICALIZER_SHA256="$CURRENT_CANONICALIZER_SHA256"
CONTINUATION_SHA256="$CURRENT_CONTINUATION_SHA256"
PROTOCOL_AMENDMENT_SHA256="$(sha256sum "$PROTOCOL_AMENDMENT" | cut -d ' ' -f 1)"
"$PYTHON_BIN" - "$OUTPUT_DIR/run-manifest.json" <<PY
import json

manifest = {
    "schema_version": 1,
    "run_id": "$RUN_ID",
    "arm": "$ARM",
    "started_at": "$ORIGINAL_STARTED_AT",
    "continuation_started_at": "$CONTINUATION_STARTED_AT",
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
    "decoder": {
        "num_beams": 4,
        "no_repeat_ngram_size": 3,
        "repetition_penalty": 1.1,
        "length_penalty": 1.0,
        "do_sample": False,
    },
    "protocol_amendment": {
        "reason": "Transformers serialization-only tokenizer metadata drift triggered the preregistered fail-closed guard after training and before independent evaluation.",
        "training_changed": False,
        "evaluation_changed": False,
        "model_tensors_changed": False,
        "semantic_tokenizer_identity_audit": "tokenizer-serialization-amendment.json",
        "original_runner_sha256": "$ORIGINAL_RUNNER_SHA256",
        "continuation_script_sha256": "$CONTINUATION_SHA256",
        "canonicalizer_sha256": "$CANONICALIZER_SHA256",
        "record_sha256": "$PROTOCOL_AMENDMENT_SHA256",
    },
    "claim_limit": "Single-seed development screen; cannot authorize publication or sentence deployment.",
}
with open("$OUTPUT_DIR/run-manifest.json", "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY
printf 'completed_at=%s arm=%s artifact_sha256=%s\n' \
  "$COMPLETED_AT" "$ARM" "$ARTIFACT_SHA256"
