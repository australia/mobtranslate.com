#!/usr/bin/env bash
set -euo pipefail

KIT_ROOT="${KIT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
MANIFEST="${MANIFEST:-$KIT_ROOT/benchmark_manifest.json}"
MODELS_ROOT="${MODELS_ROOT:-$KIT_ROOT/models}"
PYTHON="${PYTHON:-python3}"
RUN_ID="${RUN_ID:-kuku-version-benchmark-$(date -u +%Y%m%dT%H%M%SZ)}"
OUTPUT_ROOT="${OUTPUT_ROOT:-$KIT_ROOT/runs/$RUN_ID}"
CODE_ROOT="${CODE_ROOT:-$KIT_ROOT/code}"
BASELINE_ROOT="${BASELINE_ROOT:-$KIT_ROOT/baseline}"

for required in sha256sum nvidia-smi "$PYTHON"; do
  if ! command -v "$required" >/dev/null 2>&1 && [[ ! -x "$required" ]]; then
    echo "Missing required command: $required" >&2
    exit 2
  fi
done
if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing benchmark manifest: $MANIFEST" >&2
  exit 2
fi

json_value() {
  "$PYTHON" - "$MANIFEST" "$1" <<'PY'
import json
import sys
from pathlib import Path

value = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for key in sys.argv[2].split("."):
    value = value[key]
if isinstance(value, bool):
    print(str(value).lower())
else:
    print(value)
PY
}

model_directory() {
  "$PYTHON" - "$MANIFEST" "$1" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
matches = [model["directory"] for model in manifest["models"] if model["label"] == sys.argv[2]]
if len(matches) != 1:
    raise SystemExit(f"expected one model directory for {sys.argv[2]!r}, observed {len(matches)}")
print(matches[0])
PY
}

DATA_FILE="$KIT_ROOT/$(json_value data.relative_path)"
mapfile -t labels < <("$PYTHON" - "$MANIFEST" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for model in manifest["models"]:
    print(model["label"])
PY
)
if [[ "${#labels[@]}" -eq 0 ]]; then
  echo "The benchmark manifest does not define any models" >&2
  exit 2
fi

direction="$(json_value direction)"
source_lang="$(json_value source_lang)"
target_lang="$(json_value target_lang)"
batch_size="$(json_value decoder.batch_size)"
max_source_length="$(json_value decoder.max_source_length)"
max_new_tokens="$(json_value decoder.max_new_tokens)"
num_beams="$(json_value decoder.num_beams)"
no_repeat_ngram_size="$(json_value decoder.no_repeat_ngram_size)"
repetition_penalty="$(json_value decoder.repetition_penalty)"
length_penalty="$(json_value decoder.length_penalty)"
dtype="$(json_value decoder.dtype)"
do_sample="$(json_value decoder.do_sample)"
deterministic="$(json_value decoder.deterministic)"
seed="$(json_value decoder.seed)"
allow_tf32="$(json_value decoder.allow_tf32)"
bootstrap_samples="$(json_value statistics.paired_bootstrap_samples)"
bootstrap_seed="$(json_value statistics.seed)"

export PYTHONHASHSEED=0
export TOKENIZERS_PARALLELISM=false
export CUBLAS_WORKSPACE_CONFIG=:4096:8
export NVIDIA_TF32_OVERRIDE=0

if [[ "$do_sample" != "false" || "$deterministic" != "true" || "$allow_tf32" != "false" ]]; then
  echo "This sealed benchmark requires no sampling, deterministic algorithms, and TF32 disabled" >&2
  exit 4
fi

for required in "$MANIFEST" "$DATA_FILE" "$KIT_ROOT/SHA256SUMS.kit" \
  "$KIT_ROOT/requirements.lock" "$CODE_ROOT/evaluate_nllb_lora.py" \
  "$CODE_ROOT/analyze_kuku_version_probe.py" "$CODE_ROOT/verify_kuku_benchmark_inputs.py" \
  "$CODE_ROOT/compare_kuku_benchmark_runs.py" "$CODE_ROOT/measure_command.py"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing required benchmark file: $required" >&2
    exit 2
  fi
done
for label in "${labels[@]}"; do
  if [[ ! -f "$BASELINE_ROOT/${label}.predictions.json" ]]; then
    echo "Missing frozen local baseline for $label" >&2
    exit 2
  fi
done
if [[ -e "$OUTPUT_ROOT" ]]; then
  echo "Refusing existing output path: $OUTPUT_ROOT" >&2
  exit 3
fi
mkdir -p "$OUTPUT_ROOT/predictions" "$OUTPUT_ROOT/logs"
cp "$MANIFEST" "$OUTPUT_ROOT/benchmark_manifest.json"
cp "$KIT_ROOT/requirements.lock" "$OUTPUT_ROOT/requirements.lock"
cp "$KIT_ROOT/SHA256SUMS.kit" "$OUTPUT_ROOT/SHA256SUMS.kit"

(cd "$KIT_ROOT" && sha256sum -c SHA256SUMS.kit) | tee "$OUTPUT_ROOT/logs/kit-checksums.log"

"$PYTHON" "$CODE_ROOT/verify_kuku_benchmark_inputs.py" \
  --manifest "$MANIFEST" --kit-root "$KIT_ROOT" --models-root "$MODELS_ROOT" \
  --output "$OUTPUT_ROOT/preflight.json" | tee "$OUTPUT_ROOT/logs/preflight.stdout.json"

"$PYTHON" - "$MANIFEST" "$OUTPUT_ROOT/environment.json" <<'PY'
import importlib.metadata as metadata
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

import torch

if not torch.cuda.is_available():
    raise SystemExit("CUDA is required for the RunPod benchmark")
manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
expected = manifest["runtime"]
result = {
    "python": platform.python_version(),
    "platform": platform.platform(),
    "torch": torch.__version__,
    "cuda": torch.version.cuda,
    "gpu": torch.cuda.get_device_name(0),
    "gpu_capability": list(torch.cuda.get_device_capability(0)),
    "cublas_workspace_config": os.environ.get("CUBLAS_WORKSPACE_CONFIG"),
    "nvidia_tf32_override": os.environ.get("NVIDIA_TF32_OVERRIDE"),
    "packages": {},
    "nvidia_smi": subprocess.check_output(["nvidia-smi", "-L"], text=True).strip(),
}
for package in ("transformers", "tokenizers", "sacrebleu", "sentencepiece", "safetensors"):
    result["packages"][package] = metadata.version(package)
for key in ("python", "torch", "cuda", "gpu"):
    if result[key] != expected[key]:
        raise SystemExit(f"runtime {key} mismatch: expected {expected[key]!r}, observed {result[key]!r}")
for package, version in expected["packages"].items():
    if result["packages"].get(package) != version:
        raise SystemExit(
            f"runtime package mismatch for {package}: expected {version!r}, "
            f"observed {result['packages'].get(package)!r}"
        )
if result["cublas_workspace_config"] != ":4096:8" or result["nvidia_tf32_override"] != "0":
    raise SystemExit("deterministic CUDA environment variables are not locked")
Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
PY

monitor() {
  while true; do
    printf '%s,' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,power.draw,temperature.gpu \
      --format=csv,noheader,nounits
    sleep 5
  done
}
printf 'timestamp,gpu_util_pct,memory_used_mib,memory_total_mib,power_w,temperature_c\n' \
  > "$OUTPUT_ROOT/logs/gpu-resource.csv"
monitor >> "$OUTPUT_ROOT/logs/gpu-resource.csv" &
monitor_pid=$!
cleanup() {
  kill "$monitor_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for label in "${labels[@]}"; do
  directory="$(model_directory "$label")"
  model_dir="$MODELS_ROOT/$directory"
  output="$OUTPUT_ROOT/predictions/${label}.predictions.json"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] evaluating $label" | tee -a "$OUTPUT_ROOT/logs/run.log"
  "$PYTHON" "$CODE_ROOT/measure_command.py" \
    --output "$OUTPUT_ROOT/logs/${label}.resource.json" \
    --stdout "$OUTPUT_ROOT/logs/${label}.stdout.json" \
    --stderr "$OUTPUT_ROOT/logs/${label}.stderr.log" -- \
    "$PYTHON" "$CODE_ROOT/evaluate_nllb_lora.py" \
    --model-dir "$model_dir" --data-file "$DATA_FILE" --output-file "$output" \
    --direction "$direction" --source-lang "$source_lang" --target-lang "$target_lang" \
    --batch-size "$batch_size" --max-source-length "$max_source_length" \
    --max-new-tokens "$max_new_tokens" --num-beams "$num_beams" \
    --no-repeat-ngram-size "$no_repeat_ngram_size" \
    --repetition-penalty "$repetition_penalty" --length-penalty "$length_penalty" \
    --dtype "$dtype" --require-cuda --deterministic --seed "$seed" \
    > "$OUTPUT_ROOT/logs/${label}.resource.stdout.json"
  "$PYTHON" - "$MANIFEST" "$output" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
report = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
metrics = report["metrics"]
decoder = manifest["decoder"]
expected = {
    "rows": manifest["data"]["rows"],
    "direction": manifest["direction"],
    "source_lang": manifest["source_lang"],
    "target_lang": manifest["target_lang"],
    "batch_size": decoder["batch_size"],
    "max_source_length": decoder["max_source_length"],
    "max_new_tokens": decoder["max_new_tokens"],
    "num_beams": decoder["num_beams"],
    "no_repeat_ngram_size": decoder["no_repeat_ngram_size"],
    "repetition_penalty": decoder["repetition_penalty"],
    "length_penalty": decoder["length_penalty"],
    "do_sample": decoder["do_sample"],
    "deterministic_algorithms": decoder["deterministic"],
    "seed": decoder["seed"],
    "cuda_matmul_allow_tf32": decoder["allow_tf32"],
    "cudnn_allow_tf32": decoder["allow_tf32"],
    "device": "cuda",
    "dtype": "torch.float32",
    "torch_version": manifest["runtime"]["torch"],
    "transformers_version": manifest["runtime"]["packages"]["transformers"],
    "cuda_version": manifest["runtime"]["cuda"],
    "gpu_name": manifest["runtime"]["gpu"],
}
differences = {key: (expected_value, metrics.get(key)) for key, expected_value in expected.items() if metrics.get(key) != expected_value}
if differences:
    raise SystemExit(f"prediction report contract mismatch: {differences}")
if metrics.get("empty_outputs") != 0:
    raise SystemExit(f"prediction report has {metrics.get('empty_outputs')} empty outputs")
if len(report.get("predictions", [])) != manifest["data"]["rows"]:
    raise SystemExit("prediction row payload is incomplete")
PY
done

analysis_args=()
parity_args=()
for label in "${labels[@]}"; do
  output="$OUTPUT_ROOT/predictions/${label}.predictions.json"
  analysis_args+=(--lexicon-prediction "$label=$output" --elder-prediction "$label=$output")
  if [[ -f "$BASELINE_ROOT/${label}.predictions.json" ]]; then
    parity_args+=(--baseline "$label=$BASELINE_ROOT/${label}.predictions.json" --candidate "$label=$output")
  fi
done
"$PYTHON" "$CODE_ROOT/analyze_kuku_version_probe.py" "${analysis_args[@]}" \
  --output-json "$OUTPUT_ROOT/version_probe_analysis.json" \
  --output-md "$OUTPUT_ROOT/VERSION-PROBE-RESULTS.md" \
  --bootstrap-samples "$bootstrap_samples" --seed "$bootstrap_seed" \
  > "$OUTPUT_ROOT/logs/analysis.stdout.json"

expected_parity_args="$(( ${#labels[@]} * 4 ))"
if [[ "${#parity_args[@]}" -ne "$expected_parity_args" ]]; then
  echo "Internal error: incomplete parity argument set" >&2
  exit 5
fi
"$PYTHON" "$CODE_ROOT/compare_kuku_benchmark_runs.py" "${parity_args[@]}" \
  --output "$OUTPUT_ROOT/gpu-local-parity.json" \
  > "$OUTPUT_ROOT/logs/gpu-local-parity.stdout.json"

cleanup
trap - EXIT
"$PYTHON" - "$OUTPUT_ROOT/logs/gpu-resource.csv" "$OUTPUT_ROOT/resource_summary.json" <<'PY'
import csv
import json
import statistics
import sys
from pathlib import Path

source, output = map(Path, sys.argv[1:])
rows = list(csv.DictReader(source.open(encoding="utf-8")))
result = {"samples": len(rows), "start": rows[0]["timestamp"] if rows else None, "end": rows[-1]["timestamp"] if rows else None}
for key in ("gpu_util_pct", "memory_used_mib", "memory_total_mib", "power_w", "temperature_c"):
    values = [float(row[key]) for row in rows if row.get(key)]
    if values:
        result[f"mean_{key}"] = statistics.mean(values)
        result[f"max_{key}"] = max(values)
output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
PY
"$PYTHON" - "$OUTPUT_ROOT/resource_summary.json" <<'PY'
import json
import sys
from pathlib import Path

summary = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if summary.get("samples", 0) < 2:
    raise SystemExit("insufficient GPU monitor samples")
if summary.get("max_gpu_util_pct", 0) <= 0:
    raise SystemExit("no measured GPU utilization")
if summary.get("max_memory_used_mib", 0) < 1000:
    raise SystemExit("GPU memory use never exceeded 1000 MiB")
PY
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] inference and analysis complete; sealing outputs" \
  | tee -a "$OUTPUT_ROOT/logs/run.log"
(
  cd "$OUTPUT_ROOT"
  find . -type f ! -name OUTPUT_SHA256SUMS ! -name RUN_COMPLETE -print0 \
    | sort -z | xargs -0 sha256sum > OUTPUT_SHA256SUMS
  sha256sum -c OUTPUT_SHA256SUMS >/dev/null
)
touch "$OUTPUT_ROOT/RUN_COMPLETE"
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] benchmark complete: $OUTPUT_ROOT"
