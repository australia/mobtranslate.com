#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 7 ]]; then
  echo "usage: $0 CONFIRMATION_OUTPUT KIT_DIR BASE_DIR CPU_OUTPUT PYTHON EVALUATOR VERIFIER" >&2
  exit 64
fi

confirmation_output=$1
kit_dir=$2
base_dir=$3
cpu_output=$4
python=$5
evaluator=$6
verifier=$7
runtime_token_extension="$(dirname "$evaluator")/nllb_runtime_token_extension.py"

if [[ ! -s "$runtime_token_extension" ]]; then
  echo "missing deterministic runtime token-extension module: $runtime_token_extension" >&2
  exit 1
fi

result_path="$confirmation_output/RESULT.json"
complete_path="$confirmation_output/RUN-COMPLETE.json"
manifest_path="$confirmation_output/RESULT-MANIFEST.json"
deadline=$(( $(date +%s) + 7200 ))

while [[ ! -s "$result_path" || ! -s "$complete_path" || ! -s "$manifest_path" ]]; do
  if (( $(date +%s) >= deadline )); then
    echo "confirmation did not complete before the parity deadline" >&2
    exit 1
  fi
  sleep 15
done

read -r winning_seed adapter_sha256 < <(
  "$python" -c '
import json, sys
result = json.load(open(sys.argv[1], encoding="utf-8"))
if result.get("confirmation_pass") is not True:
    raise SystemExit("confirmation did not pass; CPU parity will not run")
if result.get("controlled_route_candidate") is not True:
    raise SystemExit("result did not authorize a controlled-route candidate")
if result.get("free_form_sentence_generation_authorized") is not False:
    raise SystemExit("result improperly authorizes free-form generation")
diversity = result.get("seed_diversity_gates", {})
if not diversity or not all(diversity.values()):
    raise SystemExit("seed-diversity gate did not pass")
print(result["winning_seed"], result["winning_adapter_weight_sha256"])
' "$result_path"
)

adapter_dir="$confirmation_output/selected-adapters/seed-$winning_seed"
gpu_dir="$confirmation_output/seeds/$winning_seed/selected-forced-route"
observed_adapter_sha256=$(sha256sum "$adapter_dir/adapter_model.safetensors" | cut -d' ' -f1)
if [[ "$observed_adapter_sha256" != "$adapter_sha256" ]]; then
  echo "winning adapter bytes do not match RESULT.json" >&2
  exit 1
fi

expected_base_sha256=41ea844f30d6af1f2761d71126eb66a6d47c84c3294538bb1851afcd5043fe0e
observed_base_sha256=$(sha256sum "$base_dir/model.safetensors" | cut -d' ' -f1)
if [[ "$observed_base_sha256" != "$expected_base_sha256" ]]; then
  echo "CPU parity base model hash changed" >&2
  exit 1
fi
if [[ -e "$cpu_output" ]]; then
  echo "refusing existing CPU parity output: $cpu_output" >&2
  exit 1
fi
mkdir -p "$cpu_output/cpu-evaluation"

"$python" "$evaluator" \
  --base-dir "$base_dir" \
  --adapter-dir "$adapter_dir" \
  --evaluation-file "$kit_dir/payload/data/DEVELOPMENT-SCREEN.jsonl" \
  --expected-rows 140 \
  --output-dir "$cpu_output/cpu-evaluation/run" \
  --label "M8-seed-$winning_seed-cpu-float32" \
  --batch-sizes 1,16 \
  --device cpu \
  --dtype float32 \
  --seed "$winning_seed" \
  --force-slot-after-target-lang \
  --include-endpoint slot_composition_masked \
  --include-endpoint slot_held_masked \
  --additional-special-token '<copy>' \
  --expected-additional-special-token-id 256208

"$python" "$verifier" \
  --gpu-dir "$gpu_dir" \
  --cpu-dir "$cpu_output/cpu-evaluation/run" \
  --expected-adapter-sha256 "$adapter_sha256" \
  --expected-rows 35 \
  --output "$cpu_output/CPU-FLOAT32-PARITY.json"

"$python" -c '
import datetime, hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1])
run_id = sys.argv[2]
adapter = sys.argv[3]
files = {}
for path in sorted(p for p in root.rglob("*") if p.is_file()):
    if path.name in {"RESULT-MANIFEST.json", "RUN-COMPLETE.json"}:
        continue
    data = path.read_bytes()
    files[path.relative_to(root).as_posix()] = {
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
complete = {
    "schema_version": 1,
    "run_id": run_id,
    "completed_at_utc": now,
    "status": "PASS_CPU_FLOAT32_PARITY",
    "adapter_weight_sha256": adapter,
}
(root / "RUN-COMPLETE.json").write_text(
    json.dumps(complete, indent=2, sort_keys=True) + "\n", encoding="utf-8"
)
complete_data = (root / "RUN-COMPLETE.json").read_bytes()
files["RUN-COMPLETE.json"] = {
    "bytes": len(complete_data),
    "sha256": hashlib.sha256(complete_data).hexdigest(),
}
manifest = {
    "schema_version": 1,
    "run_id": run_id,
    "created_at_utc": now,
    "files": files,
}
(root / "RESULT-MANIFEST.json").write_text(
    json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
)
' "${cpu_output}" "$(basename "$confirmation_output")-cpu-parity" "$adapter_sha256"

echo "CPU float32 parity passed for seed $winning_seed adapter $adapter_sha256"
