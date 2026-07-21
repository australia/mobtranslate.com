#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_ROOT="${WORK_ROOT:-/workspace/v24-lexicon-screen}"
PYTHON="${PYTHON:-/opt/mobtranslate-v24-venv/bin/python}"
BASE_MODEL="${BASE_MODEL:-$WORK_ROOT/base_model/merged}"
RAW_CENSUS="${RAW_CENSUS:-$WORK_ROOT/data/training/trainable-pairs.eng-gvn.jsonl}"
CURATED_CENSUS="${CURATED_CENSUS:-$WORK_ROOT/data/curated-dictionary-census.eng-gvn.jsonl}"
RAW_METADATA="${RAW_METADATA:-$WORK_ROOT/data/raw-lexicon-provenance-crosswalk.jsonl}"
SYNTHETIC_TRAIN="${SYNTHETIC_TRAIN:-$WORK_ROOT/data/synthetic-train.eng-gvn.jsonl}"
OUT_ROOT="${OUT_ROOT:-$WORK_ROOT/analysis/expanded-lexicon-census}"

SOURCE_LANG="eng_Latn"
TARGET_LANG="gvn_Latn"
DIRECTION="eng-gvn"
LABELS=(B0 C0 L1 L2 L4)

declare -A MODELS=(
  [B0]="$BASE_MODEL"
  [C0]="$WORK_ROOT/models/C0/merged-float32"
  [L1]="$WORK_ROOT/models/L1/merged-float32"
  [L2]="$WORK_ROOT/models/L2/merged-float32"
  [L4]="$WORK_ROOT/models/L4/merged-float32"
)

for required in \
  "$PYTHON" "$BASE_MODEL" "$RAW_CENSUS" "$CURATED_CENSUS" "$RAW_METADATA" "$SYNTHETIC_TRAIN" \
  "$WORK_ROOT/analysis/screen-selection.json" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
  "$SCRIPT_DIR/analyze_v24_lexicon_errors.py"; do
  [[ -e "$required" ]] || { echo "Required expanded-census input is absent: $required" >&2; exit 2; }
done
for label in "${LABELS[@]}"; do
  [[ -d "${MODELS[$label]}" ]] || { echo "Model directory is absent for $label" >&2; exit 2; }
done
[[ ! -e "$OUT_ROOT" ]] || { echo "Refusing existing output root: $OUT_ROOT" >&2; exit 3; }
mkdir -p "$OUT_ROOT/predictions" "$OUT_ROOT/analysis" "$OUT_ROOT/logs"

check_hash() {
  local expected="$1" path="$2"
  local observed
  observed="$(sha256sum "$path" | awk '{print $1}')"
  [[ "$observed" == "$expected" ]] || {
    echo "Hash mismatch for $path: expected $expected, observed $observed" >&2
    exit 4
  }
}
check_hash "a0f997d54dac4a3f7cb9dffdb381d443a48e2ccbcfc06f84fd635623d706bffe" "$RAW_CENSUS"
check_hash "da7dc6523ea912877854ea14f0ab616f517a06c3082c696411f1245f94ecc1ed" "$CURATED_CENSUS"
check_hash "e6c8b84678a60760a9e995e0d4e33705597635078069cf6a4cb6449360d9cb70" "$RAW_METADATA"
check_hash "1945595c24b11b4d1ba4da14df38eb09e8f03891307befad8e0723c2efa4fe20" "$SYNTHETIC_TRAIN"
[[ "$(wc -l < "$RAW_CENSUS")" -eq 1220 ]] || { echo "Raw census is not 1,220 rows" >&2; exit 4; }
[[ "$(wc -l < "$CURATED_CENSUS")" -eq 2724 ]] || { echo "Curated census is not 2,724 rows" >&2; exit 4; }
[[ "$(wc -l < "$RAW_METADATA")" -eq 1220 ]] || { echo "Raw metadata is not 1,220 rows" >&2; exit 4; }

export PYTHONHASHSEED=0
export TOKENIZERS_PARALLELISM=false
export CUBLAS_WORKSPACE_CONFIG=:4096:8
export NVIDIA_TF32_OVERRIDE=0
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1

COMBINED="$OUT_ROOT/combined-census.eng-gvn.jsonl"
"$PYTHON" - "$RAW_CENSUS" "$CURATED_CENSUS" "$COMBINED" <<'PY'
import json
import sys
from pathlib import Path

raw_path, curated_path, output_path = map(Path, sys.argv[1:])
rows = []
for cohort, path in (("raw_grammar_extraction", raw_path), ("curated_dictionary", curated_path)):
    for line_number, line in enumerate(path.open(encoding="utf-8"), start=1):
        row = json.loads(line)
        row["expanded_census_cohort"] = cohort
        row["expanded_census_source_line"] = line_number
        rows.append(row)
ids = [str(row.get("id") or "") for row in rows]
if len(rows) != 3944 or len(ids) != len(set(ids)) or any(not row_id for row_id in ids):
    raise SystemExit("combined census row-count or identity contract failed")
with output_path.open("x", encoding="utf-8") as handle:
    for row in rows:
        handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
PY

for label in "${LABELS[@]}"; do
  output="$OUT_ROOT/predictions/$label.combined.predictions.json"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] expanded lexical inference $label" \
    | tee -a "$OUT_ROOT/logs/driver.log"
  "$PYTHON" "$SCRIPT_DIR/evaluate_nllb_lora.py" \
    --model-dir "${MODELS[$label]}" --data-file "$COMBINED" --output-file "$output" \
    --direction "$DIRECTION" --source-lang "$SOURCE_LANG" --target-lang "$TARGET_LANG" \
    --batch-size 32 --max-source-length 192 --max-new-tokens 208 \
    --num-beams 1 --no-repeat-ngram-size 4 --repetition-penalty 1.10 --length-penalty 1.0 \
    --dtype float32 --require-cuda --deterministic --seed 0 \
    2>&1 | tee "$OUT_ROOT/logs/$label.inference.log"
  jq -e '.metrics.rows == 3944 and .metrics.device == "cuda"
          and .metrics.dtype == "torch.float32"' "$output" >/dev/null
done

"$PYTHON" - "$OUT_ROOT" "${LABELS[@]}" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
for label in sys.argv[2:]:
    source = root / "predictions" / f"{label}.combined.predictions.json"
    payload = json.loads(source.read_text(encoding="utf-8"))
    grouped = {"raw": [], "curated": []}
    for row in payload["predictions"]:
        cohort = row.get("expanded_census_cohort")
        key = "raw" if cohort == "raw_grammar_extraction" else "curated" if cohort == "curated_dictionary" else None
        if key is None:
            raise SystemExit(f"unknown expanded census cohort: {cohort}")
        grouped[key].append(row)
    if len(grouped["raw"]) != 1220 or len(grouped["curated"]) != 2724:
        raise SystemExit(f"split count failed for {label}")
    for key, rows in grouped.items():
        output = root / "predictions" / f"{label}.{key}.predictions.json"
        with output.open("x", encoding="utf-8") as handle:
            json.dump(
                {
                    "metrics": {
                        "rows": len(rows),
                        "parent_combined_prediction_file": str(source),
                        "parent_combined_metrics": payload["metrics"],
                    },
                    "predictions": rows,
                },
                handle,
                ensure_ascii=False,
                indent=2,
            )
            handle.write("\n")
PY

raw_candidates=()
curated_candidates=()
for label in "${LABELS[@]}"; do
  raw_candidates+=(--candidate "$label=$OUT_ROOT/predictions/$label.raw.predictions.json")
  curated_candidates+=(--candidate "$label=$OUT_ROOT/predictions/$label.curated.predictions.json")
done

"$PYTHON" "$SCRIPT_DIR/analyze_v24_lexicon_errors.py" \
  "${raw_candidates[@]}" --control-label C0 --tokenizer-dir "$BASE_MODEL" \
  --synthetic-file "$SYNTHETIC_TRAIN" --row-metadata "$RAW_METADATA" \
  --sample-per-cohort 16 --seed "v24-expanded-raw-20260715" \
  --output "$OUT_ROOT/analysis/raw-summary.json" \
  --review-sample-output "$OUT_ROOT/analysis/raw-review-sample.jsonl" \
  --row-analysis-output "$OUT_ROOT/analysis/raw-row-analysis.jsonl" \
  | tee "$OUT_ROOT/logs/raw-analysis.stdout.json"

"$PYTHON" "$SCRIPT_DIR/analyze_v24_lexicon_errors.py" \
  "${curated_candidates[@]}" --control-label C0 --tokenizer-dir "$BASE_MODEL" \
  --synthetic-file "$SYNTHETIC_TRAIN" \
  --sample-per-cohort 16 --seed "v24-expanded-curated-20260715" \
  --output "$OUT_ROOT/analysis/curated-summary.json" \
  --review-sample-output "$OUT_ROOT/analysis/curated-review-sample.jsonl" \
  --row-analysis-output "$OUT_ROOT/analysis/curated-row-analysis.jsonl" \
  | tee "$OUT_ROOT/logs/curated-analysis.stdout.json"

"$PYTHON" - "$OUT_ROOT" "$SCRIPT_DIR/analyze_v24_lexicon_errors.py" "$0" <<'PY'
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root, analyzer, driver = map(Path, sys.argv[1:])
def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()
manifest = {
    "schema_version": 1,
    "completed_at": datetime.now(timezone.utc).isoformat(),
    "status": "COMPLETE",
    "interpretation": [
        "Exploratory full-resource censuses; neither is a random sample of future user queries.",
        "The raw census is stratified by provenance and cannot authorize generation from unadjudicated rows.",
        "Lexical exact match cannot authorize sentence translation.",
    ],
    "analyzer_sha256": digest(analyzer),
    "driver_sha256": digest(driver),
}
(root / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
PY
touch "$OUT_ROOT/COMPLETE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] expanded lexical census complete" \
  | tee -a "$OUT_ROOT/logs/driver.log"
(
  cd "$OUT_ROOT"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS
)
