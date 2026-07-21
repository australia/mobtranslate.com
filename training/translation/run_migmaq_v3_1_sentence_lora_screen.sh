#!/usr/bin/env bash
set -euo pipefail

ARM="${ARM:?Set ARM to control or glossary}"
EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:?Set EXPERIMENT_CONTRACT}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:?Set EXPECTED_EXPERIMENT_CONTRACT_SHA256}"
CODE_DIR="${CODE_DIR:-/workspace/migmaq-v3-1/code}"
BASE_DIR="${BASE_DIR:-/workspace/migmaq-v3-1/base-v1/merged}"
SOURCE_DATA_DIR="${SOURCE_DATA_DIR:-/workspace/migmaq-v3-1/data/task-separated-v0.3.0}"
SCHEDULE_DATA_DIR="${SCHEDULE_DATA_DIR:-/workspace/migmaq-v3-1/data/sentence-lora-v0.1.1}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/workspace/migmaq-v3-1/results}"
PYTHON_BIN="${PYTHON_BIN:-python}"
MAX_STEPS="${MAX_STEPS:-600}"
SEED="${SEED:-42}"
RUN_ID="${RUN_ID:-migmaq-v3-1-${ARM}-sentence-lora-seed${SEED}-steps${MAX_STEPS}-20260720}"
OUTPUT_DIR="$OUTPUT_ROOT/$RUN_ID"

if [[ "$MAX_STEPS" != "600" ]]; then
  echo "This preregistered screen requires MAX_STEPS=600" >&2
  exit 2
fi
if [[ "$SEED" != "42" ]]; then
  echo "This preregistered screen requires SEED=42" >&2
  exit 2
fi

case "$ARM" in
  control)
    TRAIN_FILE="$SCHEDULE_DATA_DIR/schedules/control-screen-600.eng-mic.jsonl"
    EXPECTED_TRAIN_SHA256="bfc5c547ddb9c1ab978faf05000a702162e911b7c90a8338f9261b4e4c768dc2"
    EXPECTED_ORDINARY_EXAMPLES=18240
    EXPECTED_GLOSSARY_EXAMPLES=0
    ;;
  glossary)
    TRAIN_FILE="$SCHEDULE_DATA_DIR/schedules/glossary-screen-600.eng-mic.jsonl"
    EXPECTED_TRAIN_SHA256="b1cbed13f6f12c967f269b3dd5392bc2ceacac53760d65843c0d93fde56c9a19"
    EXPECTED_ORDINARY_EXAMPLES=13440
    EXPECTED_GLOSSARY_EXAMPLES=4800
    ;;
  *)
    echo "Unsupported ARM: $ARM" >&2
    exit 2
    ;;
esac

SCHEDULE_MANIFEST="$SCHEDULE_DATA_DIR/manifest.json"
VALIDATION_FILE="$SOURCE_DATA_DIR/evaluation/sentence-validation.eng-mic.jsonl"
OPENED_REGRESSION_FILE="$SOURCE_DATA_DIR/evaluation/sentence-opened-regression.eng-mic.jsonl"
LEXICAL_BENCHMARK="$SOURCE_DATA_DIR/evaluation/lexical-all.eng-mic.jsonl"
GLOSSARY_CONDITIONED="$SOURCE_DATA_DIR/evaluation/glossary-validation-conditioned.eng-mic.jsonl"
GLOSSARY_UNCONDITIONED="$SOURCE_DATA_DIR/evaluation/glossary-validation-unconditioned-paired.eng-mic.jsonl"
GLOSSARY_UNEXPOSED_CONDITIONED="$SOURCE_DATA_DIR/evaluation/glossary-validation-project-unexposed-conditioned.eng-mic.jsonl"
GLOSSARY_UNEXPOSED_UNCONDITIONED="$SOURCE_DATA_DIR/evaluation/glossary-validation-project-unexposed-unconditioned-paired.eng-mic.jsonl"

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
  "$TRAIN_FILE"
  "$SCHEDULE_MANIFEST"
  "$VALIDATION_FILE"
  "$OPENED_REGRESSION_FILE"
  "$LEXICAL_BENCHMARK"
  "$GLOSSARY_CONDITIONED"
  "$GLOSSARY_UNCONDITIONED"
  "$GLOSSARY_UNEXPOSED_CONDITIONED"
  "$GLOSSARY_UNEXPOSED_UNCONDITIONED"
  "$EXPERIMENT_CONTRACT"
)
for path in "${required_files[@]}"; do
  if [[ ! -f "$path" ]]; then
    echo "Required input is absent: $path" >&2
    exit 4
  fi
done

verify_sha256 "8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01" "$BASE_DIR/model.safetensors"
verify_sha256 "1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef" "$BASE_DIR/tokenizer.json"
verify_sha256 "$EXPECTED_TRAIN_SHA256" "$TRAIN_FILE"
verify_sha256 "5937901655edb12d28eb51e2ff92d1b6dd2af5331b3ee4c4863a6c4363b0b9ce" "$SCHEDULE_MANIFEST"
verify_sha256 "567545b6c04aa49d48dfc89ff2dcaa4cdda4dae43a3c4a2caf33168e800239f5" "$VALIDATION_FILE"
verify_sha256 "47c45578db3b41cede5c56afed2f220ea93a97fd781bcff523c335a1291eb751" "$OPENED_REGRESSION_FILE"
verify_sha256 "86f5e7eb88f7bef412bb7e7a2cb34fe4516a5df4ca8df1d6e4ecffcc225d8595" "$LEXICAL_BENCHMARK"
verify_sha256 "731284cd17da22044b08d17223fb2fe6e49007b23f8b41b6f97cb35198b8f3a9" "$GLOSSARY_CONDITIONED"
verify_sha256 "0307023bb79f26bb208a605425f03033600852acd3feb903db295bf721924751" "$GLOSSARY_UNCONDITIONED"
verify_sha256 "31a2a22cf87876992a8c9fa762267e10385e482f3a84fdaf785c6e81705bf912" "$GLOSSARY_UNEXPOSED_CONDITIONED"
verify_sha256 "b0f5de52cadc8bdc540277ed72c3430df3460543c3c34c5c4a2eee420cc14e5f" "$GLOSSARY_UNEXPOSED_UNCONDITIONED"
verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "Refusing to overwrite existing run directory: $OUTPUT_DIR" >&2
  exit 5
fi
mkdir -p "$OUTPUT_DIR"
install -m 0644 "$EXPERIMENT_CONTRACT" "$OUTPUT_DIR/input-experiment-contract.json"

exec 3>&1 4>&2
exec > >(tee -a "$OUTPUT_DIR/run.log") 2>&1
TEE_PID=$!

export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTHONHASHSEED="$SEED"
export TOKENIZERS_PARALLELISM=false
export PYTHONPATH="$CODE_DIR${PYTHONPATH:+:$PYTHONPATH}"

date -u +%Y-%m-%dT%H:%M:%SZ
printf 'arm=%s run_id=%s max_steps=%s seed=%s\n' "$ARM" "$RUN_ID" "$MAX_STEPS" "$SEED"
nvidia-smi
df -h /workspace
"$PYTHON_BIN" --version

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

token_args=()
for token in '<translate>' '<lexeme>' '<pos>' '<glossary>'; do
  token_args+=(--additional-special-token "$token")
  token_args+=(--audited-control-string "$token")
done
for token in '<translate>' '<lexeme>' '<pos>'; do
  token_args+=(--trainable-token "$token")
done

"$PYTHON_BIN" "$CODE_DIR/train_nllb_lora.py" \
  --train-file "$TRAIN_FILE" \
  --validation-file "$VALIDATION_FILE" \
  --test-file "$OPENED_REGRESSION_FILE" \
  --output-dir "$OUTPUT_DIR/model" \
  --model-id mobtranslate/migmaq-listuguj-nllb-600m-v3 \
  --model-version "3.1.0-screen-${ARM}-seed${SEED}-steps${MAX_STEPS}" \
  --run-id "$RUN_ID" \
  --dataset-id migmaq-v3-sentence-lora-schedules-v0.1.1-20260720 \
  --dataset-release-sha256 5937901655edb12d28eb51e2ff92d1b6dd2af5331b3ee4c4863a6c4363b0b9ce \
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
  --modules-to-save lm_head \
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
  "${token_args[@]}"

MODEL_MANIFEST="$OUTPUT_DIR/model/model_manifest.json"
ADAPTER_DIR="$OUTPUT_DIR/model/adapter"
ADAPTER_SHA256="$(sha256sum "$ADAPTER_DIR/adapter_model.safetensors" | cut -d ' ' -f 1)"
TOKENIZER_BUNDLE_SHA256="$($PYTHON_BIN -c 'from pathlib import Path; import sys; from evaluate_migmaq_lexical_baseline import tokenizer_bundle_identity; print(tokenizer_bundle_identity(Path(sys.argv[1]))["sha256"])' "$ADAPTER_DIR")"

"$PYTHON_BIN" - "$MODEL_MANIFEST" "$ARM" "$EXPECTED_ORDINARY_EXAMPLES" "$EXPECTED_GLOSSARY_EXAMPLES" <<'PY'
import json
import sys

path, arm, expected_ordinary, expected_glossary = sys.argv[1:]
manifest = json.load(open(path, encoding="utf-8"))
exposure = manifest["trainer_state"]["actual_training_exposure"]
if manifest["trainer_state"]["global_step"] != 600:
    raise SystemExit("global step is not 600")
expected = {
    "examples": 19200,
    "unique_rows_seen": 19200,
    "minimum": 1,
    "maximum": 1,
}
observed = {
    "examples": exposure["examples"],
    "unique_rows_seen": exposure["unique_rows_seen"],
    "minimum": exposure["presentations_per_seen_row"]["minimum"],
    "maximum": exposure["presentations_per_seen_row"]["maximum"],
}
if observed != expected:
    raise SystemExit(f"exposure contract failed: observed={observed}, expected={expected}")
by_task = exposure["by_task"]
counts = {
    "ordinary": by_task.get("attested_dictionary_example_translation", {}).get("examples", 0),
    "glossary": by_task.get("attested_glossary_conditioned_translation", {}).get("examples", 0),
    "lexical": by_task.get("source_dictionary_lexical_reconstruction", {}).get("examples", 0),
}
expected_counts = {
    "ordinary": int(expected_ordinary),
    "glossary": int(expected_glossary),
    "lexical": 960,
}
if counts != expected_counts:
    raise SystemExit(f"task exposure contract failed for {arm}: {counts} != {expected_counts}")
tokens = manifest["token_adaptation"]
registered = {row["token"]: row["token_id"] for row in tokens["additional_special_tokens"]}
if registered != {"<translate>": 256205, "<lexeme>": 256206, "<pos>": 256207, "<glossary>": 256208}:
    raise SystemExit(f"registered task-token IDs changed: {registered}")
trained = {row["token"] for row in tokens["trainable_tokens"]}
if trained != {"<translate>", "<lexeme>", "<pos>"}:
    raise SystemExit(f"selectively trainable controls changed: {trained}")
if not tokens["selective_token_gradient_audit"]["all_selected_rows_received_nonzero_gradient"]:
    raise SystemExit("a selected control received no gradient")
if not tokens["unselected_audit_rows_unchanged"]:
    raise SystemExit("an unselected input-embedding audit row changed")
print(json.dumps({"exposure": observed, "task_counts": counts, "registered": registered}, indent=2))
PY

mkdir -p "$OUTPUT_DIR/evaluations"
artifact_args=(
  --base-model "$BASE_DIR"
  --adapter-dir "$ADAPTER_DIR"
  --task-token '<translate>'
  --task-token '<lexeme>'
  --task-token '<pos>'
  --task-token '<glossary>'
)

"$PYTHON_BIN" "$CODE_DIR/evaluate_migmaq_lexical_baseline.py" \
  --model-dir "$ADAPTER_DIR" \
  --benchmark "$LEXICAL_BENCHMARK" \
  --output-dir "$OUTPUT_DIR/evaluations/lexical-full" \
  --expected-model-sha256 "$ADAPTER_SHA256" \
  --expected-tokenizer-bundle-sha256 "$TOKENIZER_BUNDLE_SHA256" \
  --expected-base-model-sha256 8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01 \
  --expected-base-tokenizer-sha256 1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef \
  --expected-benchmark-sha256 86f5e7eb88f7bef412bb7e7a2cb34fe4516a5df4ca8df1d6e4ecffcc225d8595 \
  --expected-rows 14438 \
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
  --require-cuda \
  "${artifact_args[@]}"

evaluate_sentence_set() {
  local data_file="$1"
  local output_file="$2"
  "$PYTHON_BIN" "$CODE_DIR/evaluate_seq2seq.py" \
    --model-dir "$ADAPTER_DIR" \
    --data-file "$data_file" \
    --output-file "$output_file" \
    --direction eng-mic \
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
    "${artifact_args[@]}"
}

evaluate_sentence_set "$VALIDATION_FILE" "$OUTPUT_DIR/evaluations/sentence-validation.json"
evaluate_sentence_set "$OPENED_REGRESSION_FILE" "$OUTPUT_DIR/evaluations/sentence-opened-regression.json"
evaluate_sentence_set "$GLOSSARY_CONDITIONED" "$OUTPUT_DIR/evaluations/glossary-validation-conditioned.json"
evaluate_sentence_set "$GLOSSARY_UNCONDITIONED" "$OUTPUT_DIR/evaluations/glossary-validation-unconditioned.json"
evaluate_sentence_set "$GLOSSARY_UNEXPOSED_CONDITIONED" "$OUTPUT_DIR/evaluations/glossary-validation-project-unexposed-conditioned.json"
evaluate_sentence_set "$GLOSSARY_UNEXPOSED_UNCONDITIONED" "$OUTPUT_DIR/evaluations/glossary-validation-project-unexposed-unconditioned.json"

"$PYTHON_BIN" "$CODE_DIR/score_migmaq_glossary_uptake.py" \
  --conditioned "$OUTPUT_DIR/evaluations/glossary-validation-conditioned.json" \
  --unconditioned "$OUTPUT_DIR/evaluations/glossary-validation-unconditioned.json" \
  --output "$OUTPUT_DIR/evaluations/glossary-uptake.json" \
  --row-output "$OUTPUT_DIR/evaluations/glossary-uptake-rows.jsonl"
"$PYTHON_BIN" "$CODE_DIR/score_migmaq_glossary_uptake.py" \
  --conditioned "$OUTPUT_DIR/evaluations/glossary-validation-project-unexposed-conditioned.json" \
  --unconditioned "$OUTPUT_DIR/evaluations/glossary-validation-project-unexposed-unconditioned.json" \
  --output "$OUTPUT_DIR/evaluations/glossary-project-unexposed-uptake.json" \
  --row-output "$OUTPUT_DIR/evaluations/glossary-project-unexposed-uptake-rows.jsonl"

find "$OUTPUT_DIR/model" -maxdepth 1 -type d -name 'checkpoint-*' -printf '%f\n' \
  > "$OUTPUT_DIR/deleted-checkpoints.txt"
find "$OUTPUT_DIR/model" -maxdepth 1 -type d -name 'checkpoint-*' -exec rm -rf {} +

stop_monitor
trap - EXIT
date -u +%Y-%m-%dT%H:%M:%SZ
echo "Completed $RUN_ID"
exec 1>&3 2>&4
wait "$TEE_PID"
(
  cd "$OUTPUT_DIR"
  find . -type f ! -name RUN-SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > RUN-SHA256SUMS
)
