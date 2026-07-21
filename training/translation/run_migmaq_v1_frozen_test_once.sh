#!/usr/bin/env bash
set -euo pipefail

CODE_DIR="${CODE_DIR:-/workspace/mobtranslate-migmaq/code}"
DATASET_DIR="${DATASET_DIR:-/workspace/mobtranslate-migmaq/data/migmaq-online-example-parallel-v1.0.0-20260712}"
RUN_DIR="${RUN_DIR:-/workspace/mobtranslate-migmaq/runs/migmaq-v1-rc1}"
PYTHON="${PYTHON:-python}"
MODEL_DIR="$RUN_DIR/model/merged"
SELECTION="$RUN_DIR/selection/decoding-selection.json"
TEST_FILE="$DATASET_DIR/training/test.eng-mic.jsonl"
TRAIN_FILE="$DATASET_DIR/training/train.eng-mic.jsonl"
LEDGER="$RUN_DIR/frozen-test-access.json"
OUTPUT="$RUN_DIR/test-final.json"

test -f "$MODEL_DIR/model.safetensors"
test -f "$SELECTION"
test -f "$TEST_FILE"
test -f "$TRAIN_FILE"
test ! -e "$OUTPUT"

mapfile -t decoding < <("$PYTHON" - "$SELECTION" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
if payload.get("status") != "pass" or payload.get("selection_surface") != "validation only":
    raise SystemExit("validation-only decoding selection has not passed")
if payload.get("frozen_test_accessed") is not False:
    raise SystemExit("selection record does not certify an untouched frozen test")
if payload.get("validation_rows") != 686:
    raise SystemExit("selection record has the wrong validation row count")
metrics = payload["selected"]["metrics"]
for key in ("num_beams", "no_repeat_ngram_size", "repetition_penalty", "length_penalty"):
    print(metrics[key])
PY
)
test "${#decoding[@]}" -eq 4

# O_EXCL creates an immutable one-attempt boundary before the test path is read.
"$PYTHON" - "$LEDGER" "$SELECTION" "$TEST_FILE" <<'PY'
import datetime
import hashlib
import json
import os
import sys

ledger, selection, test_file = sys.argv[1:]
sha256 = lambda path: hashlib.sha256(open(path, "rb").read()).hexdigest()
payload = {
    "status": "reserved",
    "reserved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "purpose": "The single final evaluation of the validation-selected Mi'gmaq v1 candidate.",
    "selection_sha256": sha256(selection),
    "test_file_sha256": sha256(test_file),
    "expected_test_rows": 742,
}
fd = os.open(ledger, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY

mark_failed() {
  "$PYTHON" - "$LEDGER" <<'PY'
import datetime
import json
import sys
path = sys.argv[1]
payload = json.load(open(path, encoding="utf-8"))
payload["status"] = "failed_after_access_reservation"
payload["failed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
open(path, "w", encoding="utf-8").write(json.dumps(payload, indent=2) + "\n")
PY
}
trap mark_failed ERR

"$PYTHON" "$CODE_DIR/evaluate_nllb_lora.py" \
  --model-dir "$MODEL_DIR" \
  --data-file "$TEST_FILE" \
  --output-file "$OUTPUT" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --batch-size 8 \
  --num-beams "${decoding[0]}" \
  --max-new-tokens 128 \
  --no-repeat-ngram-size "${decoding[1]}" \
  --repetition-penalty "${decoding[2]}" \
  --length-penalty "${decoding[3]}"

"$PYTHON" - "$OUTPUT" <<'PY'
import json
import sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
rows = payload.get("predictions", [])
ids = [row.get("id") for row in rows]
if len(rows) != 742 or len(ids) != len(set(ids)):
    raise SystemExit("frozen-test output row count or ID uniqueness failed")
if {row.get("split") for row in rows} != {"test"}:
    raise SystemExit("frozen-test output contains a non-test row")
PY

"$PYTHON" "$CODE_DIR/analyze_migmaq_evaluation.py" \
  --evaluation "$OUTPUT" \
  --train-file "$TRAIN_FILE" \
  --bootstrap-samples 1000 \
  --seed 20260713 \
  --output "$RUN_DIR/test-final-analysis.json"

"$PYTHON" - "$LEDGER" "$OUTPUT" "$RUN_DIR/test-final-analysis.json" <<'PY'
import datetime
import hashlib
import json
import sys

ledger, output, analysis = sys.argv[1:]
sha256 = lambda path: hashlib.sha256(open(path, "rb").read()).hexdigest()
payload = json.load(open(ledger, encoding="utf-8"))
payload.update({
    "status": "complete",
    "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "evaluation_sha256": sha256(output),
    "analysis_sha256": sha256(analysis),
})
open(ledger, "w", encoding="utf-8").write(json.dumps(payload, indent=2) + "\n")
PY
trap - ERR

(
  cd "$RUN_DIR"
  sha256sum frozen-test-access.json test-final.json test-final-analysis.json > FROZEN-TEST-SHA256SUMS
)

date -u +%Y-%m-%dT%H:%M:%SZ
