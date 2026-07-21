#!/usr/bin/env bash
set -euo pipefail

EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:?Set EXPERIMENT_CONTRACT}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:?Set EXPECTED_EXPERIMENT_CONTRACT_SHA256}"
CODE_DIR="${CODE_DIR:-/workspace/migmaq-v3-3-sealed/code}"
BASE_DIR="${BASE_DIR:-/workspace/migmaq-v3-3-sealed/base-v1/merged}"
RETENTION_ADAPTER_DIR="${RETENTION_ADAPTER_DIR:-/workspace/migmaq-v3-3-sealed/adapters/retention-seed17}"
CANDIDATE_ADAPTER_DIR="${CANDIDATE_ADAPTER_DIR:-/workspace/migmaq-v3-3-sealed/adapters/dialog40-seed17}"
DATASET_DIR="${DATASET_DIR:-/workspace/migmaq-v3-3-sealed/data/migmaq-listuguj-lessons-parallel-v1.0.1-20260721}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/workspace/migmaq-v3-3-sealed/results}"
PYTHON_BIN="${PYTHON_BIN:-python}"
RUN_ID="${RUN_ID:-migmaq-v3-3-dialog40-seed17-sealed-recovery1-20260721}"
OUTPUT_DIR="$OUTPUT_ROOT/$RUN_ID"

BASE_MODEL_SHA256="8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01"
BASE_TOKENIZER_SHA256="1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef"
BASE_TOKENIZER_BUNDLE_SHA256="9dabc3459cd815e67d438d9a103d80bcc1dc9338b0663198bd6f02baa227e590"
RETENTION_ADAPTER_SHA256="26f46e4fb498290f16e5fa78260995b19874cb7629f4c0b8d362df9aa4c57b08"
CANDIDATE_ADAPTER_SHA256="82d4c0d18ad14b2ae7c8a3684053815ebf54a402a953dd4c7d01e9e69307b687"
DATASET_MANIFEST_SHA256="frozen-by-contract"
SEALED_TEST_SHA256="903680b3956663c33592751ab19d54fd971f18cfe88275397c127a64e10c2915"
SEALED_TEST_ROWS=133

DATASET_MANIFEST="$DATASET_DIR/manifest.json"
SEALED_TEST="$DATASET_DIR/evaluation/sealed-test.eng-mic.jsonl"
MATERIALIZER="$CODE_DIR/materialize_migmaq_sealed_lessons.py"
EVALUATOR="$CODE_DIR/evaluate_nllb_lora.py"
COMPARATOR="$CODE_DIR/compare_migmaq_v3_3_sealed_test.py"
TOKENIZER_AUDITOR="$CODE_DIR/evaluate_migmaq_lexical_baseline.py"

verify_sha256() {
  local expected="$1" path="$2" actual
  actual="$(sha256sum "$path" | cut -d ' ' -f 1)"
  if [[ "$actual" != "$expected" ]]; then
    printf 'SHA-256 mismatch for %s: expected=%s actual=%s\n' "$path" "$expected" "$actual" >&2
    exit 3
  fi
}

required_files=(
  "$EXPERIMENT_CONTRACT"
  "$BASE_DIR/model.safetensors"
  "$BASE_DIR/tokenizer.json"
  "$RETENTION_ADAPTER_DIR/adapter_model.safetensors"
  "$RETENTION_ADAPTER_DIR/tokenizer.json"
  "$CANDIDATE_ADAPTER_DIR/adapter_model.safetensors"
  "$CANDIDATE_ADAPTER_DIR/tokenizer.json"
  "$DATASET_MANIFEST"
  "$SEALED_TEST"
  "$MATERIALIZER"
  "$EVALUATOR"
  "$COMPARATOR"
  "$TOKENIZER_AUDITOR"
  "${BASH_SOURCE[0]}"
)
for path in "${required_files[@]}"; do
  [[ -f "$path" ]] || { printf 'Required input is absent: %s\n' "$path" >&2; exit 4; }
done

verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"
verify_sha256 "$BASE_MODEL_SHA256" "$BASE_DIR/model.safetensors"
verify_sha256 "$BASE_TOKENIZER_SHA256" "$BASE_DIR/tokenizer.json"
verify_sha256 "$RETENTION_ADAPTER_SHA256" "$RETENTION_ADAPTER_DIR/adapter_model.safetensors"
verify_sha256 "$CANDIDATE_ADAPTER_SHA256" "$CANDIDATE_ADAPTER_DIR/adapter_model.safetensors"

export PYTHONPATH="$CODE_DIR${PYTHONPATH:+:$PYTHONPATH}"
"$PYTHON_BIN" - "$EXPERIMENT_CONTRACT" "$CODE_DIR" "${BASH_SOURCE[0]}" <<'PY'
import hashlib
import json
from pathlib import Path
import sys

contract_path = Path(sys.argv[1]).resolve()
code_dir = Path(sys.argv[2]).resolve()
runner = Path(sys.argv[3]).resolve()
contract = json.loads(contract_path.read_text(encoding="utf-8"))
for name, expected in contract["code_artifacts"].items():
    path = runner if name == runner.name else code_dir / name
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise SystemExit(f"code identity changed: {name} {actual} != {expected}")
PY

tokenizer_bundle_sha256() {
  "$PYTHON_BIN" -c \
    'from pathlib import Path; import sys; from evaluate_migmaq_lexical_baseline import tokenizer_bundle_identity; print(tokenizer_bundle_identity(Path(sys.argv[1]))["sha256"])' \
    "$1"
}
for tokenizer_dir in "$BASE_DIR" "$RETENTION_ADAPTER_DIR" "$CANDIDATE_ADAPTER_DIR"; do
  actual_bundle="$(tokenizer_bundle_sha256 "$tokenizer_dir")"
  if [[ "$actual_bundle" != "$BASE_TOKENIZER_BUNDLE_SHA256" ]]; then
    printf 'Tokenizer bundle identity changed: %s %s\n' "$tokenizer_dir" "$actual_bundle" >&2
    exit 5
  fi
done

if [[ "$DATASET_MANIFEST_SHA256" == "frozen-by-contract" ]]; then
  DATASET_MANIFEST_SHA256="$($PYTHON_BIN - "$EXPERIMENT_CONTRACT" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["sealed_dataset"]["manifest_sha256"])
PY
)"
fi
verify_sha256 "$DATASET_MANIFEST_SHA256" "$DATASET_MANIFEST"

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "Refusing to overwrite existing sealed-test run directory: $OUTPUT_DIR" >&2
  exit 6
fi
mkdir -p "$OUTPUT_DIR/evaluations"
install -m 0644 "$EXPERIMENT_CONTRACT" "$OUTPUT_DIR/input-experiment-contract.json"

exec 3>&1 4>&2
exec > >(tee -a "$OUTPUT_DIR/run.log") 2>&1
LOG_TEE_PID="$!"
export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTHONHASHSEED=0
export TOKENIZERS_PARALLELISM=false

STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
ACCESS_LEDGER="$OUTPUT_DIR/sealed-test-access.json"
# Reserve the only allowed access before hashing or parsing the sealed rows.
"$PYTHON_BIN" - "$ACCESS_LEDGER" "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$SEALED_TEST_SHA256" <<'PY'
import datetime
import json
import os
import sys

ledger, contract_sha, sealed_sha = sys.argv[1:]
payload = {
    "schema_version": 1,
    "status": "reserved",
    "reserved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "purpose": "Recovery evaluation after attempt 1 stopped before inference because the sealed split has no lexeme stratum.",
    "experiment_contract_sha256": contract_sha,
    "expected_sealed_test_sha256": sealed_sha,
    "expected_sealed_test_rows": 133,
}
fd = os.open(ledger, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

monitor_pid=""
cleanup_monitor() {
  [[ -z "$monitor_pid" ]] || kill "$monitor_pid" >/dev/null 2>&1 || true
  [[ -z "$monitor_pid" ]] || wait "$monitor_pid" >/dev/null 2>&1 || true
}
mark_failed() {
  "$PYTHON_BIN" - "$ACCESS_LEDGER" <<'PY'
import datetime
import json
import os
import sys
import tempfile

path = sys.argv[1]
payload = json.load(open(path, encoding="utf-8"))
if payload.get("status") == "reserved":
    payload["status"] = "failed_after_access_reservation"
    payload["failed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    fd, temporary = tempfile.mkstemp(prefix=".sealed-access.", dir=os.path.dirname(path), text=True)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
    os.replace(temporary, path)
PY
}
trap mark_failed ERR
trap cleanup_monitor EXIT

printf 'started_at=%s run_id=%s sealed_access=reserved\n' "$STARTED_AT" "$RUN_ID"
verify_sha256 "$SEALED_TEST_SHA256" "$SEALED_TEST"
nvidia-smi
df -h /workspace
"$PYTHON_BIN" --version

"$PYTHON_BIN" - "$OUTPUT_DIR/environment-manifest.json" <<'PY'
import importlib.metadata
import json
import platform
import sys

packages = ("torch", "transformers", "peft", "tokenizers", "sentencepiece", "sacrebleu")
payload = {"python": sys.version, "platform": platform.platform(), "packages": {}}
for package in packages:
    try:
        payload["packages"][package] = importlib.metadata.version(package)
    except importlib.metadata.PackageNotFoundError:
        payload["packages"][package] = None
with open(sys.argv[1], "x", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

nvidia-smi \
  --query-gpu=timestamp,index,name,utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu \
  --format=csv \
  --loop=5 > "$OUTPUT_DIR/resource-monitor.csv" &
monitor_pid="$!"

OPENED_DIR="$OUTPUT_DIR/opened-sealed-data"
"$PYTHON_BIN" "$MATERIALIZER" \
  --sealed-file "$SEALED_TEST" \
  --expected-sha256 "$SEALED_TEST_SHA256" \
  --expected-rows "$SEALED_TEST_ROWS" \
  --output-dir "$OPENED_DIR"
(
  cd "$OPENED_DIR"
  sha256sum -c SHA256SUMS
)

SENTENCE_FILE="$OPENED_DIR/sentence-unprefixed.eng-mic.jsonl"
LEXEME_FILE="$OPENED_DIR/lexeme-plain.eng-mic.jsonl"
read -r SENTENCE_ROWS LEXEME_ROWS < <("$PYTHON_BIN" - "$OPENED_DIR/manifest.json" <<'PY'
import json
import sys

counts = json.load(open(sys.argv[1], encoding="utf-8"))["counts"]["task"]
print(counts.get("translate", 0), counts.get("lexeme", 0))
PY
)
if [[ "$SENTENCE_ROWS" -lt 1 || $((SENTENCE_ROWS + LEXEME_ROWS)) -ne "$SEALED_TEST_ROWS" ]]; then
  echo "Materialized sealed task counts are invalid" >&2
  exit 7
fi

evaluate_arm() {
  local arm="$1" adapter_dir="$2" task="$3" data_file="$4"
  local output_file="$OUTPUT_DIR/evaluations/${arm}-${task}.json"
  local adapter_args=()
  if [[ -n "$adapter_dir" ]]; then
    adapter_args=(--adapter-dir "$adapter_dir")
  fi
  "$PYTHON_BIN" "$EVALUATOR" \
    --model-dir "$BASE_DIR" \
    "${adapter_args[@]}" \
    --data-file "$data_file" \
    --output-file "$output_file" \
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

evaluate_arm base "" sentence "$SENTENCE_FILE"
evaluate_arm retention "$RETENTION_ADAPTER_DIR" sentence "$SENTENCE_FILE"
evaluate_arm candidate "$CANDIDATE_ADAPTER_DIR" sentence "$SENTENCE_FILE"
lexeme_args=()
if [[ "$LEXEME_ROWS" -gt 0 ]]; then
  evaluate_arm base "" lexeme "$LEXEME_FILE"
  evaluate_arm retention "$RETENTION_ADAPTER_DIR" lexeme "$LEXEME_FILE"
  evaluate_arm candidate "$CANDIDATE_ADAPTER_DIR" lexeme "$LEXEME_FILE"
  lexeme_args=(
    --base-lexeme "$OUTPUT_DIR/evaluations/base-lexeme.json"
    --retention-lexeme "$OUTPUT_DIR/evaluations/retention-lexeme.json"
    --candidate-lexeme "$OUTPUT_DIR/evaluations/candidate-lexeme.json"
  )
fi

"$PYTHON_BIN" "$COMPARATOR" \
  --base-sentence "$OUTPUT_DIR/evaluations/base-sentence.json" \
  --retention-sentence "$OUTPUT_DIR/evaluations/retention-sentence.json" \
  --candidate-sentence "$OUTPUT_DIR/evaluations/candidate-sentence.json" \
  "${lexeme_args[@]}" \
  --materialization-manifest "$OPENED_DIR/manifest.json" \
  --contract "$EXPERIMENT_CONTRACT" \
  --expected-contract-sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" \
  --expected-sealed-sha256 "$SEALED_TEST_SHA256" \
  --expected-total-rows "$SEALED_TEST_ROWS" \
  --bootstrap-samples 5000 \
  --bootstrap-seed 20260723 \
  --output-dir "$OUTPUT_DIR/analysis"

cleanup_monitor
monitor_pid=""
COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"$PYTHON_BIN" - "$ACCESS_LEDGER" "$OUTPUT_DIR/analysis/comparison.json" <<'PY'
import datetime
import hashlib
import json
import os
import sys
import tempfile

ledger, comparison = sys.argv[1:]
sha256 = lambda path: hashlib.sha256(open(path, "rb").read()).hexdigest()
payload = json.load(open(ledger, encoding="utf-8"))
payload.update({
    "status": "complete",
    "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "comparison_sha256": sha256(comparison),
})
fd, temporary = tempfile.mkstemp(prefix=".sealed-access.", dir=os.path.dirname(ledger), text=True)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
os.replace(temporary, ledger)
PY
trap - ERR

"$PYTHON_BIN" - "$OUTPUT_DIR/run-manifest.json" <<PY
import json

manifest = {
    "schema_version": 1,
    "run_id": "$RUN_ID",
    "started_at": "$STARTED_AT",
    "completed_at": "$COMPLETED_AT",
    "operation": "evaluation_only_one_shot_sealed_test",
    "base_model_sha256": "$BASE_MODEL_SHA256",
    "base_tokenizer_sha256": "$BASE_TOKENIZER_SHA256",
    "base_tokenizer_bundle_sha256": "$BASE_TOKENIZER_BUNDLE_SHA256",
    "retention_adapter_sha256": "$RETENTION_ADAPTER_SHA256",
    "candidate_adapter_sha256": "$CANDIDATE_ADAPTER_SHA256",
    "sealed_test_sha256": "$SEALED_TEST_SHA256",
    "sealed_test_rows": $SEALED_TEST_ROWS,
    "decoder": {
        "num_beams": 4,
        "no_repeat_ngram_size": 3,
        "repetition_penalty": 1.1,
        "length_penalty": 1.0,
        "do_sample": False,
    },
    "writes_model_weights": False,
    "claim_limit": "One pedagogical-source sealed test; no publication or deployment authorization.",
}
with open("$OUTPUT_DIR/run-manifest.json", "x", encoding="utf-8") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY

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
printf 'completed_at=%s run_id=%s sealed_access=complete\n' "$COMPLETED_AT" "$RUN_ID"

exec 1>&3 2>&4
wait "$LOG_TEE_PID"
(
  cd "$OUTPUT_DIR"
  sha256sum run.log > run-log.sha256
)
trap - EXIT
