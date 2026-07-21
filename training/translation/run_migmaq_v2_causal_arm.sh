#!/usr/bin/env bash
set -euo pipefail

ARM="${ARM:?Set ARM to retention-control or lexical-clean}"
TASK_TOKEN_MODE="${TASK_TOKEN_MODE:-ordinary}"
CANONICAL_EVAL_MODE="${CANONICAL_EVAL_MODE:-merged}"
EVAL_DTYPE="${EVAL_DTYPE:-float32}"
EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:-}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:-}"
CODE_DIR="${CODE_DIR:-/workspace/migmaq-v2/code}"
BASE_DIR="${BASE_DIR:-/workspace/migmaq-v2/base-v1/merged}"
DATA_DIR="${DATA_DIR:-/workspace/migmaq-v2/data/task-separated-v0.2.0}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/workspace/migmaq-v2/results}"
PYTHON_BIN="${PYTHON_BIN:-python}"
MAX_STEPS="${MAX_STEPS:-600}"
DEFAULT_RUN_ID="migmaq-v2-${ARM}-seed42-steps${MAX_STEPS}-v02"
if [[ "$TASK_TOKEN_MODE" == "registered" ]]; then
  DEFAULT_RUN_ID="migmaq-v2-${ARM}-registered-tasks-seed42-steps${MAX_STEPS}-v02"
fi
RUN_ID="${RUN_ID:-$DEFAULT_RUN_ID}"
MODEL_VERSION="${MODEL_VERSION:-2.0.0-screen-${ARM}-steps${MAX_STEPS}-v02}"
DATASET_ID="${DATASET_ID:-migmaq-v2-task-separated-v0.2.0-20260720}"
DATASET_RELEASE_SHA256="${DATASET_RELEASE_SHA256:-5f95c6fd0d9acc7823ce2b759e20b7653510726dae7f5cb805317c06b26c975d}"
STOP_AFTER_STEPS="${STOP_AFTER_STEPS:-0}"
MAX_TRAIN_SAMPLES="${MAX_TRAIN_SAMPLES:-}"
MAX_VALIDATION_SAMPLES="${MAX_VALIDATION_SAMPLES:-}"
MAX_TEST_SAMPLES="${MAX_TEST_SAMPLES:-}"
EVAL_MAX_ROWS="${EVAL_MAX_ROWS:-}"
SAVE_STEPS="${SAVE_STEPS:-300}"
EVAL_STEPS="${EVAL_STEPS:-300}"
OUTPUT_DIR="$OUTPUT_ROOT/$RUN_ID"

case "$ARM" in
  retention-control)
    TRAIN_FILE="$DATA_DIR/mixtures/retention-control.eng-mic.jsonl"
    EXPECTED_TRAIN_SHA256="9fd5d705a2953b561e5879aa134c6d412804bb7072bf8c986af560d4f2bf4a7c"
    ;;
  lexical-clean)
    TRAIN_FILE="$DATA_DIR/mixtures/lexical-clean.eng-mic.jsonl"
    EXPECTED_TRAIN_SHA256="4af5fc0c8736c121f234d7f64e68194ab27ac5604ec6cb3f27a135b2c1e1c326"
    ;;
  *)
    echo "Unsupported ARM: $ARM" >&2
    exit 2
    ;;
esac

task_token_args=()
case "$TASK_TOKEN_MODE" in
  ordinary)
    task_token_args+=(
      --audited-control-string '<translate>'
      --audited-control-string '<lexeme>'
      --audited-control-string '<pos>'
    )
    ;;
  registered)
    for token in '<translate>' '<lexeme>' '<pos>'; do
      task_token_args+=(
        --additional-special-token "$token"
        --trainable-token "$token"
        --audited-control-string "$token"
      )
    done
    ;;
  *)
    echo "Unsupported TASK_TOKEN_MODE: $TASK_TOKEN_MODE" >&2
    exit 2
    ;;
esac

VALIDATION_FILE="$DATA_DIR/evaluation/sentence-validation.eng-mic.jsonl"
TEST_FILE="$DATA_DIR/evaluation/sentence-opened-regression.eng-mic.jsonl"
LEXICAL_BENCHMARK="$DATA_DIR/evaluation/lexical-all.eng-mic.jsonl"

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

for path in \
  "$BASE_DIR/model.safetensors" \
  "$BASE_DIR/tokenizer.json" \
  "$TRAIN_FILE" \
  "$VALIDATION_FILE" \
  "$TEST_FILE" \
  "$LEXICAL_BENCHMARK"; do
  if [[ ! -f "$path" ]]; then
    echo "Required input is absent: $path" >&2
    exit 4
  fi
done

verify_sha256 "8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01" "$BASE_DIR/model.safetensors"
verify_sha256 "1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef" "$BASE_DIR/tokenizer.json"
verify_sha256 "$EXPECTED_TRAIN_SHA256" "$TRAIN_FILE"
verify_sha256 "567545b6c04aa49d48dfc89ff2dcaa4cdda4dae43a3c4a2caf33168e800239f5" "$VALIDATION_FILE"
verify_sha256 "47c45578db3b41cede5c56afed2f220ea93a97fd781bcff523c335a1291eb751" "$TEST_FILE"
verify_sha256 "86f5e7eb88f7bef412bb7e7a2cb34fe4516a5df4ca8df1d6e4ecffcc225d8595" "$LEXICAL_BENCHMARK"
if [[ -n "$EXPERIMENT_CONTRACT" || -n "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" ]]; then
  if [[ -z "$EXPERIMENT_CONTRACT" || -z "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" ]]; then
    echo "EXPERIMENT_CONTRACT and EXPECTED_EXPERIMENT_CONTRACT_SHA256 must be set together" >&2
    exit 7
  fi
  if [[ ! -f "$EXPERIMENT_CONTRACT" ]]; then
    echo "Experiment contract is absent: $EXPERIMENT_CONTRACT" >&2
    exit 8
  fi
  verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"
fi

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "Refusing to overwrite existing run directory: $OUTPUT_DIR" >&2
  exit 5
fi
mkdir -p "$OUTPUT_DIR"
if [[ -n "$EXPERIMENT_CONTRACT" ]]; then
  install -m 0644 "$EXPERIMENT_CONTRACT" "$OUTPUT_DIR/input-experiment-contract.json"
fi
exec > >(tee -a "$OUTPUT_DIR/run.log") 2>&1

export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTHONHASHSEED=42
export TOKENIZERS_PARALLELISM=false

date -u +%Y-%m-%dT%H:%M:%SZ
printf 'task_token_mode=%s\n' "$TASK_TOKEN_MODE"
nvidia-smi
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

caps=()
if [[ -n "$MAX_TRAIN_SAMPLES" ]]; then
  caps+=(--max-train-samples "$MAX_TRAIN_SAMPLES")
fi
if [[ -n "$MAX_VALIDATION_SAMPLES" ]]; then
  caps+=(--max-validation-samples "$MAX_VALIDATION_SAMPLES")
fi
if [[ -n "$MAX_TEST_SAMPLES" ]]; then
  caps+=(--max-test-samples "$MAX_TEST_SAMPLES")
fi

"$PYTHON_BIN" "$CODE_DIR/train_nllb_lora.py" \
  --train-file "$TRAIN_FILE" \
  --validation-file "$VALIDATION_FILE" \
  --test-file "$TEST_FILE" \
  --output-dir "$OUTPUT_DIR/model" \
  --model-id mobtranslate/migmaq-listuguj-nllb-600m-v2 \
  --model-version "$MODEL_VERSION" \
  --run-id "$RUN_ID" \
  --dataset-id "$DATASET_ID" \
  --dataset-release-sha256 "$DATASET_RELEASE_SHA256" \
  --license cc-by-nc-4.0 \
  --base-model "$BASE_DIR" \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --direction eng-mic \
  --audited-control-string '<glossary>' \
  --audited-control-string '<inflect>' \
  --audited-control-string '<gloss>' \
  --audited-control-string '<features>' \
  --max-source-length 192 \
  --max-target-length 192 \
  --learning-rate 5e-5 \
  --max-steps "$MAX_STEPS" \
  --stop-after-steps "$STOP_AFTER_STEPS" \
  --batch-size 8 \
  --gradient-accumulation-steps 4 \
  --warmup-ratio 0.08 \
  --weight-decay 0.01 \
  --lora-r 32 \
  --lora-alpha 64 \
  --lora-dropout 0.05 \
  --lora-target-modules q_proj,k_proj,v_proj,out_proj,fc1,fc2 \
  --modules-to-save lm_head \
  --save-steps "$SAVE_STEPS" \
  --save-total-limit 2 \
  --eval-steps "$EVAL_STEPS" \
  --logging-steps 10 \
  --generation-num-beams 1 \
  --generation-no-repeat-ngram-size 3 \
  --generation-repetition-penalty 1.1 \
  --generation-length-penalty 1.0 \
  --seed 42 \
  --full-determinism \
  --no-load-best-model-at-end \
  "${task_token_args[@]}" \
  "${caps[@]}"

MODEL_SHA256="$(sha256sum "$OUTPUT_DIR/model/merged/model.safetensors" | cut -d ' ' -f 1)"
ADAPTER_SHA256="$(sha256sum "$OUTPUT_DIR/model/adapter/adapter_model.safetensors" | cut -d ' ' -f 1)"

artifact_args=()
sentence_artifact_args=()
case "$CANONICAL_EVAL_MODE" in
  merged)
    EVAL_MODEL_DIR="$OUTPUT_DIR/model/merged"
    EVAL_MODEL_SHA256="$MODEL_SHA256"
    ;;
  adapter)
    EVAL_MODEL_DIR="$OUTPUT_DIR/model/adapter"
    EVAL_MODEL_SHA256="$ADAPTER_SHA256"
    artifact_args+=(
      --base-model "$BASE_DIR"
      --adapter-dir "$EVAL_MODEL_DIR"
      --expected-base-model-sha256 8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01
      --expected-base-tokenizer-sha256 1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef
    )
    sentence_artifact_args+=(
      --base-model "$BASE_DIR"
      --adapter-dir "$EVAL_MODEL_DIR"
    )
    if [[ "$TASK_TOKEN_MODE" == "registered" ]]; then
      for token in '<translate>' '<lexeme>' '<pos>'; do
        artifact_args+=(--task-token "$token")
        sentence_artifact_args+=(--task-token "$token")
      done
    fi
    ;;
  *)
    echo "Unsupported CANONICAL_EVAL_MODE: $CANONICAL_EVAL_MODE" >&2
    exit 6
    ;;
esac
TOKENIZER_SHA256="$(sha256sum "$EVAL_MODEL_DIR/tokenizer.json" | cut -d ' ' -f 1)"

eval_cap=()
sentence_eval_cap=()
if [[ -n "$EVAL_MAX_ROWS" ]]; then
  eval_cap+=(--max-rows "$EVAL_MAX_ROWS")
  sentence_eval_cap+=(--max-rows "$EVAL_MAX_ROWS")
fi

"$PYTHON_BIN" "$CODE_DIR/evaluate_migmaq_lexical_baseline.py" \
  --model-dir "$EVAL_MODEL_DIR" \
  --benchmark "$LEXICAL_BENCHMARK" \
  --output-dir "$OUTPUT_DIR/evaluations/lexical-full" \
  --expected-model-sha256 "$EVAL_MODEL_SHA256" \
  --expected-tokenizer-sha256 "$TOKENIZER_SHA256" \
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
  --dtype "$EVAL_DTYPE" \
  --seed 0 \
  --require-cuda \
  "${artifact_args[@]}" \
  "${eval_cap[@]}"

"$PYTHON_BIN" "$CODE_DIR/evaluate_seq2seq.py" \
  --model-dir "$EVAL_MODEL_DIR" \
  --data-file "$VALIDATION_FILE" \
  --output-file "$OUTPUT_DIR/evaluations/sentence-validation.json" \
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
  --dtype "$EVAL_DTYPE" \
  "${sentence_artifact_args[@]}" \
  "${sentence_eval_cap[@]}"

"$PYTHON_BIN" "$CODE_DIR/evaluate_seq2seq.py" \
  --model-dir "$EVAL_MODEL_DIR" \
  --data-file "$TEST_FILE" \
  --output-file "$OUTPUT_DIR/evaluations/sentence-opened-regression.json" \
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
  --dtype "$EVAL_DTYPE" \
  "${sentence_artifact_args[@]}" \
  "${sentence_eval_cap[@]}"

date -u +%Y-%m-%dT%H:%M:%SZ
echo "Completed $RUN_ID"

stop_monitor
trap - EXIT

(
  cd "$OUTPUT_DIR"
  find . -type f ! -name RUN-SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > RUN-SHA256SUMS
)
