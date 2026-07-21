#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_ID="${RUN_ID:-v21.2-claude-balanced-replay-gvn-3epoch-lr2e-5}"
GATE_ID="${GATE_ID:-${RUN_ID}-gate128-e100}"
PYTHON="${PYTHON:-/opt/mobtranslate-mt-venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-/workspace/v21.2-claude/data}"
BASE_MODEL="${BASE_MODEL:-/workspace/v21.2-claude/base_model/merged}"
OUT_ROOT="${OUT_ROOT:-/workspace/v21.2-claude/models}"
LOG_ROOT="${LOG_ROOT:-/workspace/v21.2-claude/logs}"
REPORT_ROOT="${REPORT_ROOT:-/workspace/v21.2-claude/reports}"

SOURCE_LANG="eng_Latn"
TARGET_LANG="gvn_Latn"
DIRECTION="eng-gvn"
MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-192}"
MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-208}"
BATCH_SIZE="${BATCH_SIZE:-8}"
GRADIENT_ACCUMULATION_STEPS="${GRADIENT_ACCUMULATION_STEPS:-2}"
LORA_R="${LORA_R:-64}"
LORA_ALPHA="${LORA_ALPHA:-128}"
LORA_DROPOUT="${LORA_DROPOUT:-0.0}"
LORA_TARGET_MODULES="q_proj,k_proj,v_proj,out_proj,fc1,fc2"
SEED="${SEED:-42}"

TRAIN_FILE="$DATA_ROOT/train.eng-gvn.jsonl"
VALIDATION_FILE="$DATA_ROOT/validation.eng-gvn.jsonl"
TEST_FILE="$DATA_ROOT/test.eng-gvn.jsonl"
TRAIN_SAMPLE_FILE="$DATA_ROOT/synthetic/train_sample_1024.eng-gvn.jsonl"
TEST_UNTAGGED_FILE="$DATA_ROOT/synthetic/test_untagged_1606.eng-gvn.jsonl"
GATE_TRAIN_FILE="$DATA_ROOT/gate/train_128.eng-gvn.jsonl"
GATE_VALIDATION_FILE="$DATA_ROOT/gate/validation_128.eng-gvn.jsonl"
GATE_TEST_FILE="$DATA_ROOT/gate/test_128.eng-gvn.jsonl"
ELDER_FILE="$DATA_ROOT/external/elder_sentence_pair_43.eng-gvn.jsonl"
USAGE_FILE="$DATA_ROOT/external/db_usage_heldout_84.eng-gvn.jsonl"
BIBLE_DIRECT_FILE="$DATA_ROOT/external/bible_direct_heldout_325.eng-gvn.jsonl"
BIBLE_REF_FILE="$DATA_ROOT/external/bible_ref_heldout_325.eng-gvn.jsonl"

OUT_DIR="$OUT_ROOT/$RUN_ID"
GATE_DIR="$OUT_ROOT/$GATE_ID"
LOG_FILE="$LOG_ROOT/$RUN_ID.driver.log"
MONITOR_FILE="$LOG_ROOT/$RUN_ID.resource.csv"
REPORT_FILE="$REPORT_ROOT/$RUN_ID.md"
RUN_CONTRACT="$OUT_DIR/run_contract.json"

mkdir -p "$OUT_ROOT" "$LOG_ROOT" "$REPORT_ROOT" "$OUT_DIR"

for required in "$PYTHON" "$BASE_MODEL" "$DATA_ROOT" "$SCRIPT_DIR/train_nllb_lora.py" \
  "$SCRIPT_DIR/evaluate_nllb_lora.py" "$SCRIPT_DIR/analyze_v21_predictions.py"; do
  if [[ ! -e "$required" ]]; then
    echo "Required path does not exist: $required" >&2
    exit 2
  fi
done

cd "$DATA_ROOT"
sha256sum -c SHA256SUMS.v21.2 | tee "$LOG_ROOT/$RUN_ID.data-checksums.log"

check_base_hash() {
  local expected="$1" filename="$2"
  local actual
  actual="$(sha256sum "$BASE_MODEL/$filename" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    echo "Base-model hash mismatch for $filename: $actual" >&2
    exit 3
  fi
  printf '%s  %s\n' "$actual" "$filename"
}
{
  check_base_hash "26bb5fc5ca75eca215081699e5d8a1dc64f69153431a4e78d6e87ebaee131a0f" "model.safetensors"
  check_base_hash "357daed13ffd789678235cb2e8e25a1e57800f569fa59b99339e165e8860db0e" "tokenizer.json"
  check_base_hash "846f3f6eeed33aeb5c6260fb0a1316cc19b9888ae6c3a8da5ec61c9239ff1534" "config.json"
} | tee "$LOG_ROOT/$RUN_ID.base-checksums.log"

"$PYTHON" - "$BASE_MODEL" "$DATA_ROOT" "$MAX_SOURCE_LENGTH" "$MAX_TARGET_LENGTH" <<'PY' \
  > "$OUT_DIR/source_length_preflight.json"
import json
import statistics
import sys
from pathlib import Path
from transformers import AutoTokenizer

base_model = Path(sys.argv[1])
root = Path(sys.argv[2])
max_source = int(sys.argv[3])
max_target = int(sys.argv[4])
tokenizer = AutoTokenizer.from_pretrained(str(base_model), src_lang="eng_Latn", tgt_lang="gvn_Latn")
files = [
    "train.eng-gvn.jsonl",
    "validation.eng-gvn.jsonl",
    "test.eng-gvn.jsonl",
    "synthetic/train_sample_1024.eng-gvn.jsonl",
    "synthetic/test_untagged_1606.eng-gvn.jsonl",
    "gate/train_128.eng-gvn.jsonl",
    "external/elder_sentence_pair_43.eng-gvn.jsonl",
    "external/db_usage_heldout_84.eng-gvn.jsonl",
    "external/bible_direct_heldout_325.eng-gvn.jsonl",
    "external/bible_ref_heldout_325.eng-gvn.jsonl",
]
results = []
failed = False
for relative in files:
    source_lengths = []
    target_lengths = []
    with (root / relative).open(encoding="utf-8") as handle:
        for line in handle:
            row = json.loads(line)
            source_lengths.append(len(tokenizer(" ".join(row["input_text"].split()), truncation=False).input_ids))
            target_lengths.append(len(tokenizer(text_target=" ".join(row["output_text"].split()), truncation=False).input_ids))
    source_over = sum(length > max_source for length in source_lengths)
    target_over = sum(length > max_target for length in target_lengths)
    failed = failed or source_over > 0 or target_over > 0
    results.append({
        "file": relative,
        "rows": len(source_lengths),
        "source": {
            "min": min(source_lengths), "max": max(source_lengths),
            "mean": statistics.mean(source_lengths), "over_limit": source_over,
        },
        "target": {
            "min": min(target_lengths), "max": max(target_lengths),
            "mean": statistics.mean(target_lengths), "over_limit": target_over,
        },
    })
print(json.dumps({"status": "FAIL" if failed else "PASS", "files": results}, indent=2))
if failed:
    raise SystemExit(1)
PY

"$PYTHON" - "$RUN_ID" "$DATA_ROOT" "$BASE_MODEL" "$MAX_SOURCE_LENGTH" "$MAX_TARGET_LENGTH" <<'PY' \
  > "$RUN_CONTRACT"
import datetime as dt
import json
import sys
print(json.dumps({
    "run_id": sys.argv[1],
    "owner": "claude",
    "lane": "v21.2-claude-balanced-replay",
    "started_at": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    "data_root": sys.argv[2],
    "base_model": sys.argv[3],
    "max_source_length": int(sys.argv[4]),
    "max_target_length": int(sys.argv[5]),
    "train_rows": 22164,
    "validation_rows": 1609,
    "test_rows": 1606,
    "seed": 42,
    "rights": "project_approved_synthetic_pending_elder_verification",
    "promotion_eligible": False,
}, indent=2))
PY

START_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "# Kuku Yalanji $RUN_ID"
  echo
  echo "Owner: Claude"
  echo
  echo "Started UTC: $START_UTC"
  echo
  echo "Treatment: balanced replay — 16,642 source-disjoint synthetic rows + 2,047 Bible direct + 2,047 Bible reference-conditioned + 357x4=1,428 DB-usage replay rows (effective 22,164 of canonical 22,198 after the documented deterministic replay quarantine); no elder rows."
  echo
  echo "## Frozen Run Contract"
  echo
  echo '```json'
  cat "$RUN_CONTRACT"
  echo '```'
  echo
  echo "## Source-Length Preflight"
  echo
  echo '```json'
  cat "$OUT_DIR/source_length_preflight.json"
  echo '```'
} > "$REPORT_FILE"

monitor_pid=""
if [[ -x "$SCRIPT_DIR/run_resource_monitor.sh" ]]; then
  INTERVAL_SECONDS="${INTERVAL_SECONDS:-5}" "$SCRIPT_DIR/run_resource_monitor.sh" "$MONITOR_FILE" &
  monitor_pid="$!"
fi
cleanup() {
  if [[ -n "$monitor_pid" ]]; then
    kill "$monitor_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] starting mandatory gate $GATE_ID" | tee "$LOG_FILE"
"$PYTHON" "$SCRIPT_DIR/train_nllb_lora.py" \
  --base-model "$BASE_MODEL" \
  --train-file "$GATE_TRAIN_FILE" \
  --validation-file "$GATE_VALIDATION_FILE" \
  --test-file "$GATE_TEST_FILE" \
  --output-dir "$GATE_DIR" \
  --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
  --epochs 100 --batch-size "$BATCH_SIZE" --gradient-accumulation-steps "$GRADIENT_ACCUMULATION_STEPS" \
  --max-source-length "$MAX_SOURCE_LENGTH" --max-target-length "$MAX_TARGET_LENGTH" \
  --learning-rate 1e-4 --warmup-ratio 0.0 --weight-decay 0.0 \
  --lora-r "$LORA_R" --lora-alpha "$LORA_ALPHA" --lora-dropout "$LORA_DROPOUT" \
  --lora-target-modules "$LORA_TARGET_MODULES" \
  --eval-steps 200 --save-steps 200 --save-total-limit 2 --logging-steps 40 \
  --generation-num-beams 1 --generation-no-repeat-ngram-size 0 \
  --generation-repetition-penalty 1.0 --generation-length-penalty 1.0 \
  --seed "$SEED" --no-shuffle-before-cap \
  2>&1 | tee -a "$LOG_FILE"

"$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
  --model-dir "$GATE_DIR/merged" --data-file "$GATE_TEST_FILE" \
  --output-file "$GATE_DIR/eval_gate_predictions_greedy.json" \
  --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
  --batch-size "$BATCH_SIZE" --max-source-length "$MAX_SOURCE_LENGTH" \
  --max-new-tokens "$MAX_TARGET_LENGTH" --num-beams 1 --no-repeat-ngram-size 0 \
  --repetition-penalty 1.0 --length-penalty 1.0 \
  2>&1 | tee "$GATE_DIR/eval_gate_metrics.stdout.json"

"$PYTHON" "$SCRIPT_DIR/analyze_v21_predictions.py" \
  "$GATE_DIR/eval_gate_predictions_greedy.json" --output "$GATE_DIR/gate_analysis.json" \
  > "$GATE_DIR/gate_analysis.stdout.json"

"$PYTHON" - "$GATE_DIR/gate_analysis.json" "$GATE_DIR/gate_result.json" <<'PY'
import json
import sys
from pathlib import Path
analysis = json.loads(Path(sys.argv[1]).read_text())
metric = analysis["aggregate"]
ratio = metric["length_ratio"]["mean"]
checks = {
    "rows_128": metric["rows"] == 128,
    "empty_zero": metric["empty"] == 0,
    "exact_at_least_115": metric["exact"] >= 115,
    "chrf_at_least_97": metric["chrf"] >= 97.0,
    "mean_length_ratio_0_90_to_1_10": ratio is not None and 0.90 <= ratio <= 1.10,
}
result = {"status": "PASS" if all(checks.values()) else "FAIL", "checks": checks, "aggregate": metric}
Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
if result["status"] != "PASS":
    raise SystemExit(20)
PY

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] gate passed; starting full $RUN_ID" | tee -a "$LOG_FILE"
"$PYTHON" "$SCRIPT_DIR/train_nllb_lora.py" \
  --base-model "$BASE_MODEL" \
  --train-file "$TRAIN_FILE" --validation-file "$VALIDATION_FILE" --test-file "$TEST_FILE" \
  --output-dir "$OUT_DIR" \
  --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
  --epochs 3 --batch-size "$BATCH_SIZE" --gradient-accumulation-steps "$GRADIENT_ACCUMULATION_STEPS" \
  --max-source-length "$MAX_SOURCE_LENGTH" --max-target-length "$MAX_TARGET_LENGTH" \
  --learning-rate 2e-5 --warmup-ratio 0.0 --weight-decay 0.0 \
  --lora-r "$LORA_R" --lora-alpha "$LORA_ALPHA" --lora-dropout "$LORA_DROPOUT" \
  --lora-target-modules "$LORA_TARGET_MODULES" \
  --eval-steps 1385 --save-steps 1385 --save-total-limit 2 --logging-steps 100 \
  --generation-num-beams 1 --generation-no-repeat-ngram-size 0 \
  --generation-repetition-penalty 1.0 --generation-length-penalty 1.0 \
  --seed "$SEED" --no-shuffle-before-cap \
  2>&1 | tee -a "$LOG_FILE"

evaluate_split() {
  local label="$1" data_file="$2"
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
    --model-dir "$OUT_DIR/merged" --data-file "$data_file" \
    --output-file "$OUT_DIR/eval_${label}_predictions_greedy.json" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --batch-size "$BATCH_SIZE" --max-source-length "$MAX_SOURCE_LENGTH" \
    --max-new-tokens "$MAX_TARGET_LENGTH" --num-beams 1 --no-repeat-ngram-size 0 \
    --repetition-penalty 1.0 --length-penalty 1.0 \
    2>&1 | tee "$OUT_DIR/eval_${label}_metrics.stdout.json"
  "$PYTHON" "$SCRIPT_DIR/summarize_predictions.py" \
    "$OUT_DIR/eval_${label}_predictions_greedy.json" --samples 8 \
    > "$OUT_DIR/eval_${label}_summary.txt"
  "$PYTHON" "$SCRIPT_DIR/analyze_v21_predictions.py" \
    "$OUT_DIR/eval_${label}_predictions_greedy.json" \
    --output "$OUT_DIR/eval_${label}_analysis.json" \
    > "$OUT_DIR/eval_${label}_analysis.stdout.json"
}

evaluate_split "train_sample_1024" "$TRAIN_SAMPLE_FILE"
evaluate_split "synthetic_dev_1609" "$VALIDATION_FILE"
evaluate_split "synthetic_test_tagged_1606" "$TEST_FILE"
evaluate_split "synthetic_test_untagged_1606" "$TEST_UNTAGGED_FILE"
evaluate_split "elder_sentence_pair_43" "$ELDER_FILE"
evaluate_split "db_usage_heldout_84" "$USAGE_FILE"
evaluate_split "bible_direct_heldout_325" "$BIBLE_DIRECT_FILE"
evaluate_split "bible_ref_heldout_325" "$BIBLE_REF_FILE"

"$PYTHON" - "$MONITOR_FILE" <<'PY' > "$OUT_DIR/resource_summary.json"
import csv
import json
import statistics
import sys
from pathlib import Path
path = Path(sys.argv[1])
rows = list(csv.DictReader(path.open(encoding="utf-8"))) if path.exists() else []
def values(key):
    out = []
    for row in rows:
        try: out.append(float(row[key]))
        except (KeyError, TypeError, ValueError): pass
    return out
result = {"samples": len(rows), "start": rows[0]["timestamp"] if rows else None, "end": rows[-1]["timestamp"] if rows else None}
for source, target in [
    ("gpu_util_pct", "gpu_util_pct"), ("gpu_mem_used_mib", "gpu_mem_used_mib"),
    ("gpu_power_w", "gpu_power_w"), ("python_cpu_pct", "python_cpu_pct"),
    ("python_rss_mib", "python_rss_mib"), ("ram_used_mib", "ram_used_mib"),
    ("workspace_used_pct", "workspace_used_pct"),
]:
    data = values(source)
    if data:
        result[f"mean_{target}"] = statistics.mean(data)
        result[f"max_{target}"] = max(data)
print(json.dumps(result, indent=2))
PY

END_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo
  echo "Finished UTC: $END_UTC"
  echo
  echo "## Gate Result"
  echo
  echo '```json'
  cat "$GATE_DIR/gate_result.json"
  echo '```'
  echo
  echo "## Training Manifest"
  echo
  echo '```json'
  cat "$OUT_DIR/model_manifest.json"
  echo '```'
  echo
  echo "## Evaluation Vector"
  echo
  for analysis in "$OUT_DIR"/eval_*_analysis.json; do
    echo "### $(basename "$analysis" _analysis.json)"
    echo
    echo '```json'
    "$PYTHON" - "$analysis" <<'PY'
import json,sys
print(json.dumps(json.load(open(sys.argv[1]))["aggregate"], indent=2))
PY
    echo '```'
  done
  echo
  echo "## Resource Summary"
  echo
  echo '```json'
  cat "$OUT_DIR/resource_summary.json"
  echo '```'
} >> "$REPORT_FILE"

touch "$OUT_DIR/RUN_COMPLETE"
echo "[$END_UTC] $RUN_ID complete; artifacts must be fetched and verified before pod shutdown." | tee -a "$LOG_FILE"
