#!/usr/bin/env bash
set -euo pipefail

EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:?Set EXPERIMENT_CONTRACT}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:?Set EXPECTED_EXPERIMENT_CONTRACT_SHA256}"
EVALUATION_RESUMPTION_RECORD="${EVALUATION_RESUMPTION_RECORD:?Set EVALUATION_RESUMPTION_RECORD}"
CODE_DIR="${CODE_DIR:-/workspace/migmaq-v3-2/code}"
BASE_DIR="${BASE_DIR:-/workspace/migmaq-v3-2/base-v1/merged}"
DATA_DIR="${DATA_DIR:-/workspace/migmaq-v3-2/data/natural-lessons-v0.1.0}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/workspace/migmaq-v3-2/results}"
PYTHON_BIN="${PYTHON_BIN:-python}"
RUN_ID="migmaq-v3-2-lessons40-seed42-steps600-20260721"
OUTPUT_DIR="$OUTPUT_ROOT/$RUN_ID"

BASE_MODEL_SHA256="8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01"
BASE_TOKENIZER_SHA256="1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef"
BASE_TOKENIZER_BUNDLE_SHA256="9dabc3459cd815e67d438d9a103d80bcc1dc9338b0663198bd6f02baa227e590"
DATASET_MANIFEST_SHA256="c03786b10248e75097adf1f2da73476d97ce40473ba572f9a4712142302a815c"
TRAIN_SHA256="9a70d249ea53e4025c6e5967efdaddca840d7536336e07b5452f194467aab2ec"
ARTIFACT_SHA256="28efb424f069802b3ea4b7e4c22a025f9a5c27f61315cae741467d92ffa0a055"
MODEL_MANIFEST_SHA256="62f779e628a13140b35f12703d5185d31f33bf26af2c5f611f9d7c0fbea0b725"
TOKENIZER_AUDIT_SHA256="70fb108323eb884da32c6a0e2986b14840cec8775caa248438ccbcbd41e00ebf"
SERIALIZATION_AMENDMENT_SHA256="6fb9074a93c1af44e746e3b0bf9b7627067e4c390dc740cf911920538334c97b"
EXISTING_VALIDATION_RESULT_SHA256="f29e546bdb927126eedb98507ff9663dc6263acdd714a912125b5f0ff2b5f478"
EXISTING_OPENED_RESULT_SHA256="7c466cada075b5b6a5f52dc7c8024833a8ca29f0100e81c917dcd4beb7d1160a"
LESSON_VALIDATION_RESULT_SHA256="3c9cf5169a356e3ac7d6fb0e0c00e67c7952e5d394969a694247bde1d13f35c5"

DATASET_MANIFEST="$DATA_DIR/manifest.json"
LESSON_LEXEMES="$DATA_DIR/evaluation/lesson-validation-lexemes-plain.eng-mic.jsonl"
LEXICAL_ALL="$DATA_DIR/evaluation/lexical-all-plain.eng-mic.jsonl"
ARTIFACT_DIR="$OUTPUT_DIR/model/adapter"
MODEL_MANIFEST="$OUTPUT_DIR/model/model_manifest.json"
PARTIAL_DIR="$OUTPUT_DIR/evaluations/lexical-all-plain"
INTERRUPTED_DIR="$OUTPUT_DIR/evaluations/interrupted-lexical-all-plain-1920rows-20260721"

verify_sha256() {
  local expected="$1" path="$2" actual
  actual="$(sha256sum "$path" | cut -d ' ' -f 1)"
  [[ "$actual" == "$expected" ]] || {
    printf 'SHA-256 mismatch for %s: %s != %s\n' "$path" "$actual" "$expected" >&2
    exit 3
  }
}

required_files=(
  "$BASE_DIR/model.safetensors"
  "$BASE_DIR/tokenizer.json"
  "$DATASET_MANIFEST"
  "$LESSON_LEXEMES"
  "$LEXICAL_ALL"
  "$EXPERIMENT_CONTRACT"
  "$EVALUATION_RESUMPTION_RECORD"
  "$OUTPUT_DIR/input-experiment-contract.json"
  "$OUTPUT_DIR/input-protocol-amendment.json"
  "$OUTPUT_DIR/tokenizer-serialization-amendment.json"
  "$OUTPUT_DIR/run.log"
  "$OUTPUT_DIR/continuation.log"
  "$MODEL_MANIFEST"
  "$ARTIFACT_DIR/adapter_model.safetensors"
  "$OUTPUT_DIR/evaluations/existing-validation.json"
  "$OUTPUT_DIR/evaluations/existing-opened-regression.json"
  "$OUTPUT_DIR/evaluations/lesson-validation-sentences.json"
)
for path in "${required_files[@]}"; do
  [[ -f "$path" ]] || { printf 'Required input is absent: %s\n' "$path" >&2; exit 4; }
done
[[ ! -e "$OUTPUT_DIR/run-manifest.json" ]] || {
  echo "Refusing to overwrite a completed run manifest" >&2
  exit 5
}
[[ ! -e "$OUTPUT_DIR/evaluations/lesson-validation-lexemes-plain" ]] || {
  echo "Refusing to overwrite lesson lexical evaluation" >&2
  exit 6
}

verify_sha256 "$BASE_MODEL_SHA256" "$BASE_DIR/model.safetensors"
verify_sha256 "$BASE_TOKENIZER_SHA256" "$BASE_DIR/tokenizer.json"
verify_sha256 "$DATASET_MANIFEST_SHA256" "$DATASET_MANIFEST"
verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"
verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$OUTPUT_DIR/input-experiment-contract.json"
verify_sha256 "$TRAIN_SHA256" "$DATA_DIR/schedules/lessons40-screen-600.eng-mic.jsonl"
verify_sha256 "336a9df6d976b74d80afe286596a6c645bddcdd246aaaf7d29c97043e56af14d" "$LESSON_LEXEMES"
verify_sha256 "6ce12eb71b07eb77111b7ab35df178bbc66bd1f134a900c75d37bbbcbb574e49" "$LEXICAL_ALL"
verify_sha256 "$ARTIFACT_SHA256" "$ARTIFACT_DIR/adapter_model.safetensors"
verify_sha256 "$MODEL_MANIFEST_SHA256" "$MODEL_MANIFEST"
verify_sha256 "$TOKENIZER_AUDIT_SHA256" "$OUTPUT_DIR/tokenizer-serialization-amendment.json"
verify_sha256 "$SERIALIZATION_AMENDMENT_SHA256" "$OUTPUT_DIR/input-protocol-amendment.json"
verify_sha256 "$EXISTING_VALIDATION_RESULT_SHA256" "$OUTPUT_DIR/evaluations/existing-validation.json"
verify_sha256 "$EXISTING_OPENED_RESULT_SHA256" "$OUTPUT_DIR/evaluations/existing-opened-regression.json"
verify_sha256 "$LESSON_VALIDATION_RESULT_SHA256" "$OUTPUT_DIR/evaluations/lesson-validation-sentences.json"

CURRENT_SCRIPT_SHA256="$(sha256sum "$0" | cut -d ' ' -f 1)"
"$PYTHON_BIN" - "$EVALUATION_RESUMPTION_RECORD" "$CURRENT_SCRIPT_SHA256" \
  "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" <<'PY'
import json
import sys

path, script_sha256, contract_sha256 = sys.argv[1:]
record = json.load(open(path, encoding="utf-8"))
checks = {
    "status": record.get("status") == "adopted_before_evaluation_resumption",
    "training_unchanged": record.get("training_changed") is False,
    "decoder_unchanged": record.get("decoder_changed") is False,
    "contract": record.get("original_contract_sha256") == contract_sha256,
    "script": record.get("code", {}).get("resumption_script_sha256") == script_sha256,
}
if not all(checks.values()):
    raise SystemExit(f"evaluation resumption identity failed: {checks}")
PY

if [[ -d "$PARTIAL_DIR" ]]; then
  [[ ! -e "$PARTIAL_DIR/metric-report.json" ]] || {
    echo "Partial lexical directory unexpectedly contains a metric report" >&2
    exit 7
  }
  [[ ! -e "$INTERRUPTED_DIR" ]] || {
    echo "Interrupted-attempt archive already exists" >&2
    exit 8
  }
  PARTIAL_ROWS="$(wc -l < "$PARTIAL_DIR/predictions.jsonl")"
  [[ "$PARTIAL_ROWS" == "1920" ]] || {
    printf 'Interrupted lexical row count is %s, expected 1920\n' "$PARTIAL_ROWS" >&2
    exit 9
  }
  mv "$PARTIAL_DIR" "$INTERRUPTED_DIR"
elif [[ ! -d "$INTERRUPTED_DIR" ]]; then
  echo "Neither the interrupted lexical attempt nor its archive exists" >&2
  exit 10
fi

[[ ! -e "$OUTPUT_DIR/input-evaluation-resumption-record.json" ]] || {
  echo "Refusing to overwrite copied evaluation resumption record" >&2
  exit 11
}
install -m 0644 "$EVALUATION_RESUMPTION_RECORD" \
  "$OUTPUT_DIR/input-evaluation-resumption-record.json"

exec > >(tee -a "$OUTPUT_DIR/evaluation-resumption.log") 2>&1
export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTHONHASHSEED=42
export TOKENIZERS_PARALLELISM=false
export PYTHONPATH="$CODE_DIR${PYTHONPATH:+:$PYTHONPATH}"

RESUMED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'evaluation_resumed_at=%s run_id=%s\n' "$RESUMED_AT" "$RUN_ID"

TOKENIZER_BUNDLE_SHA256="$($PYTHON_BIN -c 'from pathlib import Path; import sys; from evaluate_migmaq_lexical_baseline import tokenizer_bundle_identity; print(tokenizer_bundle_identity(Path(sys.argv[1]))["sha256"])' "$ARTIFACT_DIR")"
[[ "$TOKENIZER_BUNDLE_SHA256" == "$BASE_TOKENIZER_BUNDLE_SHA256" ]] || {
  printf 'Adapter tokenizer bundle differs: %s\n' "$TOKENIZER_BUNDLE_SHA256" >&2
  exit 12
}

"$PYTHON_BIN" - "$MODEL_MANIFEST" "$DATASET_MANIFEST" <<'PY'
import json
import sys

model = json.load(open(sys.argv[1], encoding="utf-8"))
dataset = json.load(open(sys.argv[2], encoding="utf-8"))
if model["trainer_state"]["global_step"] != 600:
    raise SystemExit("global step is not 600")
exposure = model["trainer_state"]["actual_training_exposure"]
expected = dataset["token_accounting"]["schedule_audit"]["arms"]["lessons40"]
for key in ("examples", "source_tokens", "target_tokens", "non_padding_tokens"):
    if exposure[key] != expected[key]:
        raise SystemExit(f"{key} exposure mismatch: {exposure[key]} != {expected[key]}")
if exposure["unique_rows_seen"] != 19200:
    raise SystemExit("unique row exposure mismatch")
if model["training_args"]["modules_to_save"]:
    raise SystemExit("adapter unexpectedly saves full modules")
if model["training_args"]["ensure_weight_tying"]:
    raise SystemExit("v1 untied output-head contract was not preserved")
PY

"$PYTHON_BIN" - "$INTERRUPTED_DIR" "$OUTPUT_DIR/interrupted-evaluation-record.json" <<'PY'
import hashlib
import json
from pathlib import Path
import sys

source = Path(sys.argv[1])
output = Path(sys.argv[2])
predictions = source / "predictions.jsonl"
digest = hashlib.sha256(predictions.read_bytes()).hexdigest()
rows = sum(1 for line in predictions.open(encoding="utf-8") if line.strip())
record = {
    "schema_version": 1,
    "status": "interrupted_not_scored",
    "rows_generated": rows,
    "expected_rows": 14438,
    "predictions_sha256": digest,
    "reason": "The first pod was manually deleted after securing trained weights and sentence outputs; the exhaustive lexical evaluator had not completed.",
    "interpretation": "These partial predictions are provenance evidence only and must not be scored as the exhaustive benchmark.",
}
if rows != 1920:
    raise SystemExit(f"interrupted row count changed: {rows}")
with output.open("x", encoding="utf-8") as handle:
    json.dump(record, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

monitor_pid=""
nvidia-smi \
  --query-gpu=timestamp,index,name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu \
  --format=csv \
  --loop=5 > "$OUTPUT_DIR/evaluation-resumption-resource-monitor.csv" &
monitor_pid="$!"
cleanup() {
  [[ -z "$monitor_pid" ]] || kill "$monitor_pid" >/dev/null 2>&1 || true
  [[ -z "$monitor_pid" ]] || wait "$monitor_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

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

evaluate_lexical lexical-all-plain "$LEXICAL_ALL" \
  "6ce12eb71b07eb77111b7ab35df178bbc66bd1f134a900c75d37bbbcbb574e49" 14438
evaluate_lexical lesson-validation-lexemes-plain "$LESSON_LEXEMES" \
  "336a9df6d976b74d80afe286596a6c645bddcdd246aaaf7d29c97043e56af14d" 103

cleanup
trap - EXIT
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ORIGINAL_STARTED_AT="$(sed -n 's/^started_at=\([^ ]*\).*/\1/p' "$OUTPUT_DIR/run.log" | head -1)"
CONTINUATION_STARTED_AT="$(sed -n 's/^continuation_started_at=\([^ ]*\).*/\1/p' "$OUTPUT_DIR/continuation.log" | head -1)"
RESUMPTION_RECORD_SHA256="$(sha256sum "$EVALUATION_RESUMPTION_RECORD" | cut -d ' ' -f 1)"

"$PYTHON_BIN" - "$OUTPUT_DIR/run-manifest.json" <<PY
import json

manifest = {
    "schema_version": 1,
    "run_id": "$RUN_ID",
    "arm": "lessons40",
    "started_at": "$ORIGINAL_STARTED_AT",
    "continuation_started_at": "$CONTINUATION_STARTED_AT",
    "evaluation_resumed_at": "$RESUMED_AT",
    "completed_at": "$COMPLETED_AT",
    "seed": 42,
    "max_steps": 600,
    "base_model_sha256": "$BASE_MODEL_SHA256",
    "base_tokenizer_sha256": "$BASE_TOKENIZER_SHA256",
    "base_tokenizer_bundle_sha256": "$BASE_TOKENIZER_BUNDLE_SHA256",
    "dataset_manifest_sha256": "$DATASET_MANIFEST_SHA256",
    "train_file_sha256": "$TRAIN_SHA256",
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
        "record_sha256": "$SERIALIZATION_AMENDMENT_SHA256",
    },
    "evaluation_resumption": {
        "reason": "The first pod was manually deleted after all sentence outputs and the compact adapter were secured, while exhaustive lexical generation was incomplete.",
        "training_changed": False,
        "decoder_changed": False,
        "completed_sentence_results_reused_after_exact_hash_verification": True,
        "exhaustive_lexical_evaluations_restarted_from_row_zero": True,
        "partial_attempt_record": "interrupted-evaluation-record.json",
        "resumption_script_sha256": "$CURRENT_SCRIPT_SHA256",
        "record_sha256": "$RESUMPTION_RECORD_SHA256",
    },
    "claim_limit": "Single-seed development screen; cannot authorize publication or sentence deployment.",
}
with open("$OUTPUT_DIR/run-manifest.json", "x", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

printf 'evaluation_completed_at=%s run_id=%s artifact_sha256=%s\n' \
  "$COMPLETED_AT" "$RUN_ID" "$ARTIFACT_SHA256"
