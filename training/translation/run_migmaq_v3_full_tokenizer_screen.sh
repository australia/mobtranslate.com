#!/usr/bin/env bash
set -euo pipefail

ARM="${ARM:?Set ARM to base-slow or spm4k}"
CODE_DIR="${CODE_DIR:-/workspace/migmaq-v3/code}"
BASE_DIR="${BASE_DIR:-/workspace/migmaq-v3/base-v1/merged}"
DATA_DIR="${DATA_DIR:-/workspace/migmaq-v3/data/task-separated-v0.3.0}"
TOKENIZER_EXTENSION_DIR="${TOKENIZER_EXTENSION_DIR:-/workspace/migmaq-v3/tokenizer-spm4k}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/workspace/migmaq-v3/results}"
EXPERIMENT_CONTRACT="${EXPERIMENT_CONTRACT:-/workspace/migmaq-v3/contracts/MIGMAQ-V3-FULL-TOKENIZER-SCREEN-SEED42-STEPS600.json}"
EXPECTED_EXPERIMENT_CONTRACT_SHA256="${EXPECTED_EXPERIMENT_CONTRACT_SHA256:-9b0f2813f4adf5ee0cc7c97e49140a875fe56208d896999868993bac0557ebe1}"
EVALUATION_AMENDMENT="${EVALUATION_AMENDMENT:-/workspace/migmaq-v3/contracts/MIGMAQ-V3-FULL-TOKENIZER-SCREEN-SEED42-STEPS600-EVALUATION-AMENDMENT-1.json}"
EXPECTED_EVALUATION_AMENDMENT_SHA256="${EXPECTED_EVALUATION_AMENDMENT_SHA256:-cb21bce57648de1567f2b418fce6c303dba2af4f06fb730a03c6aa8563a55243}"
PYTHON_BIN="${PYTHON_BIN:-python}"
MAX_STEPS="${MAX_STEPS:-600}"
SAVE_STEPS="${SAVE_STEPS:-$MAX_STEPS}"
EVAL_STEPS="${EVAL_STEPS:-$MAX_STEPS}"
MAX_VALIDATION_SAMPLES="${MAX_VALIDATION_SAMPLES:-}"
RUN_EVALUATIONS="${RUN_EVALUATIONS:-1}"
RUN_LABEL="${RUN_LABEL:-screen}"
RUN_ID="${RUN_ID:-migmaq-v3-full-${ARM}-seed42-steps${MAX_STEPS}-${RUN_LABEL}-20260720}"
OUTPUT_DIR="$OUTPUT_ROOT/$RUN_ID"

TRAIN_FILE="$DATA_DIR/mixtures/balanced-glossary-lexical-clean-76800.eng-mic.jsonl"
VALIDATION_FILE="$DATA_DIR/evaluation/sentence-validation.eng-mic.jsonl"
LEXICAL_BENCHMARK="$DATA_DIR/evaluation/lexical-all.eng-mic.jsonl"
GLOSSARY_CONDITIONED="$DATA_DIR/evaluation/glossary-validation-conditioned.eng-mic.jsonl"
GLOSSARY_UNCONDITIONED="$DATA_DIR/evaluation/glossary-validation-unconditioned-paired.eng-mic.jsonl"
GLOSSARY_UNEXPOSED_CONDITIONED="$DATA_DIR/evaluation/glossary-validation-project-unexposed-conditioned.eng-mic.jsonl"
GLOSSARY_UNEXPOSED_UNCONDITIONED="$DATA_DIR/evaluation/glossary-validation-project-unexposed-unconditioned-paired.eng-mic.jsonl"

verify_sha256() {
  local expected="$1"
  local path="$2"
  local observed
  observed="$(sha256sum "$path" | cut -d ' ' -f 1)"
  if [[ "$observed" != "$expected" ]]; then
    printf 'SHA-256 mismatch for %s: expected=%s observed=%s\n' "$path" "$expected" "$observed" >&2
    exit 3
  fi
}

for path in \
  "$BASE_DIR/model.safetensors" \
  "$BASE_DIR/tokenizer.json" \
  "$TRAIN_FILE" \
  "$VALIDATION_FILE" \
  "$LEXICAL_BENCHMARK" \
  "$GLOSSARY_CONDITIONED" \
  "$GLOSSARY_UNCONDITIONED" \
  "$GLOSSARY_UNEXPOSED_CONDITIONED" \
  "$GLOSSARY_UNEXPOSED_UNCONDITIONED" \
  "$EXPERIMENT_CONTRACT" \
  "$EVALUATION_AMENDMENT"; do
  if [[ ! -f "$path" ]]; then
    echo "Required input is absent: $path" >&2
    exit 4
  fi
done

verify_sha256 8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01 "$BASE_DIR/model.safetensors"
verify_sha256 1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef "$BASE_DIR/tokenizer.json"
verify_sha256 831beb8955b474506525d9679ea51c80a41f528631cf3b87d7ae08ba0d5ff910 "$TRAIN_FILE"
verify_sha256 567545b6c04aa49d48dfc89ff2dcaa4cdda4dae43a3c4a2caf33168e800239f5 "$VALIDATION_FILE"
verify_sha256 86f5e7eb88f7bef412bb7e7a2cb34fe4516a5df4ca8df1d6e4ecffcc225d8595 "$LEXICAL_BENCHMARK"
verify_sha256 731284cd17da22044b08d17223fb2fe6e49007b23f8b41b6f97cb35198b8f3a9 "$GLOSSARY_CONDITIONED"
verify_sha256 0307023bb79f26bb208a605425f03033600852acd3feb903db295bf721924751 "$GLOSSARY_UNCONDITIONED"
verify_sha256 31a2a22cf87876992a8c9fa762267e10385e482f3a84fdaf785c6e81705bf912 "$GLOSSARY_UNEXPOSED_CONDITIONED"
verify_sha256 b0f5de52cadc8bdc540277ed72c3430df3460543c3c34c5c4a2eee420cc14e5f "$GLOSSARY_UNEXPOSED_UNCONDITIONED"
verify_sha256 "$EXPECTED_EXPERIMENT_CONTRACT_SHA256" "$EXPERIMENT_CONTRACT"
verify_sha256 "$EXPECTED_EVALUATION_AMENDMENT_SHA256" "$EVALUATION_AMENDMENT"
verify_sha256 e20684bfbbd9efa0cf79891fe9bb6d4ae8dee2c9b52fb1e8f44ef3913d398600 "$CODE_DIR/train_nllb_lora.py"
verify_sha256 fc4ff496c4f510158b7d301f0e27357185e26a99a9498b75ae8d1525e0c7bdd7 "$CODE_DIR/nllb_tokenizer_remap.py"
verify_sha256 461c7654c6b80968f404d6b3739aaeb27fa48db0bdedded934c74dce7f209f61 "$CODE_DIR/evaluate_migmaq_lexical_baseline.py"
verify_sha256 22b639f899015edd2b245891a13ec8ed823b273acdbdc00e401ae25f436a9b23 "$CODE_DIR/evaluate_nllb_lora.py"
verify_sha256 4f6dae11d4023646192c06519c8bf4e52aa9c158669f9675c4016037698045c4 "$CODE_DIR/score_migmaq_glossary_uptake.py"

if [[ -e "$OUTPUT_DIR" ]]; then
  echo "Refusing to overwrite existing run directory: $OUTPUT_DIR" >&2
  exit 5
fi

control_tokens=(
  '<translate>'
  '<lexeme>'
  '<pos>'
  '<glossary>'
  '<inflect>'
  '<gloss>'
  '<features>'
)
tokenizer_args=(--no-use-fast-tokenizer)
expected_target_id=256204
case "$ARM" in
  base-slow)
    for token in "${control_tokens[@]}"; do
      tokenizer_args+=(--additional-special-token "$token")
      tokenizer_args+=(--audited-control-string "$token")
    done
    ;;
  spm4k)
    for path in \
      "$TOKENIZER_EXTENSION_DIR/tokenizer/tokenizer_config.json" \
      "$TOKENIZER_EXTENSION_DIR/tokenizer/sentencepiece.bpe.model" \
      "$TOKENIZER_EXTENSION_DIR/token-id-remap.jsonl" \
      "$TOKENIZER_EXTENSION_DIR/new-piece-map.jsonl" \
      "$TOKENIZER_EXTENSION_DIR/tokenizer-extension-manifest.json"; do
      if [[ ! -f "$path" ]]; then
        echo "Tokenizer-extension input is absent: $path" >&2
        exit 6
      fi
    done
    verify_sha256 71d1cbd31e2be6b5d05eaa41bbcf1ff441ff1005bcc86e4ac4d31957122c6b41 "$TOKENIZER_EXTENSION_DIR/tokenizer-extension-manifest.json"
    verify_sha256 fc4dc572bc6620614010a283ab7d5452ad861cff541f018db025b35fdc601412 "$TOKENIZER_EXTENSION_DIR/token-id-remap.jsonl"
    verify_sha256 43c3039ed0f75a0a9fcdc6c6fd19d9efc8dd6c3a507efb1fcaab03240715c5ba "$TOKENIZER_EXTENSION_DIR/new-piece-map.jsonl"
    verify_sha256 787f2cb18ca9efaca0c5f92daf81d444657d4ea958bd84b7ce5bd97e58395ead "$TOKENIZER_EXTENSION_DIR/tokenizer/sentencepiece.bpe.model"
    tokenizer_args+=(
      --tokenizer-path "$TOKENIZER_EXTENSION_DIR/tokenizer"
      --token-id-remap "$TOKENIZER_EXTENSION_DIR/token-id-remap.jsonl"
      --new-piece-map "$TOKENIZER_EXTENSION_DIR/new-piece-map.jsonl"
      --tokenizer-extension-manifest "$TOKENIZER_EXTENSION_DIR/tokenizer-extension-manifest.json"
      --expected-tokenizer-extension-manifest-sha256 71d1cbd31e2be6b5d05eaa41bbcf1ff441ff1005bcc86e4ac4d31957122c6b41
    )
    for token in "${control_tokens[@]}"; do
      tokenizer_args+=(--extension-control-token "$token")
      tokenizer_args+=(--audited-control-string "$token")
    done
    expected_target_id=259692
    ;;
  *)
    echo "Unsupported ARM: $ARM" >&2
    exit 2
    ;;
esac

mkdir -p "$OUTPUT_DIR"
install -m 0644 "$EXPERIMENT_CONTRACT" "$OUTPUT_DIR/input-experiment-contract.json"
install -m 0644 "$EVALUATION_AMENDMENT" "$OUTPUT_DIR/input-evaluation-amendment-1.json"
exec 3>&1 4>&2
exec > >(tee -a "$OUTPUT_DIR/run.log") 2>&1
TEE_PID=$!

export CUBLAS_WORKSPACE_CONFIG="${CUBLAS_WORKSPACE_CONFIG:-:4096:8}"
export PYTHONHASHSEED=42
export TOKENIZERS_PARALLELISM=false
export PYTHONPATH="$CODE_DIR${PYTHONPATH:+:$PYTHONPATH}"

date -u +%Y-%m-%dT%H:%M:%SZ
printf 'arm=%s run_id=%s max_steps=%s run_evaluations=%s\n' "$ARM" "$RUN_ID" "$MAX_STEPS" "$RUN_EVALUATIONS"
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

sample_caps=()
if [[ -n "$MAX_VALIDATION_SAMPLES" ]]; then
  sample_caps+=(--max-validation-samples "$MAX_VALIDATION_SAMPLES")
fi

"$PYTHON_BIN" "$CODE_DIR/train_nllb_lora.py" \
  --train-file "$TRAIN_FILE" \
  --validation-file "$VALIDATION_FILE" \
  --output-dir "$OUTPUT_DIR/model" \
  --model-id mobtranslate/migmaq-listuguj-nllb-600m-v3 \
  --model-version "3.0.0-${RUN_LABEL}-${ARM}-steps${MAX_STEPS}" \
  --run-id "$RUN_ID" \
  --dataset-id migmaq-v2-task-separated-v0.3.0-20260720 \
  --dataset-release-sha256 ae309fe1959c427fccd536d99c91dcf2839188148db3b7e114fe0dfcce331fd4 \
  --license cc-by-nc-4.0 \
  --base-model "$BASE_DIR" \
  --training-mode full \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --direction eng-mic \
  --max-source-length 192 \
  --max-target-length 192 \
  --learning-rate 2e-5 \
  --max-steps "$MAX_STEPS" \
  --batch-size 8 \
  --gradient-accumulation-steps 4 \
  --optimizer adafactor \
  --lr-scheduler-type constant_with_warmup \
  --warmup-ratio 0 \
  --warmup-steps 60 \
  --weight-decay 0.001 \
  --label-smoothing-factor 0.1 \
  --max-grad-norm 1.0 \
  --save-steps "$SAVE_STEPS" \
  --save-total-limit 1 \
  --eval-steps "$EVAL_STEPS" \
  --logging-steps 10 \
  --generation-num-beams 1 \
  --generation-no-repeat-ngram-size 0 \
  --generation-repetition-penalty 1.0 \
  --generation-length-penalty 1.0 \
  --seed 42 \
  --no-shuffle-before-cap \
  --full-determinism \
  --load-best-model-at-end \
  "${tokenizer_args[@]}" \
  "${sample_caps[@]}"

MODEL_DIR="$OUTPUT_DIR/model/merged"
MODEL_SHA256="$(sha256sum "$MODEL_DIR/model.safetensors" | cut -d ' ' -f 1)"
TOKENIZER_BUNDLE_SHA256="$($PYTHON_BIN -c 'from pathlib import Path; import sys; from evaluate_migmaq_lexical_baseline import tokenizer_bundle_identity; print(tokenizer_bundle_identity(Path(sys.argv[1]))["sha256"])' "$MODEL_DIR")"
observed_step="$($PYTHON_BIN -c 'import json, sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["trainer_state"]["global_step"])' "$OUTPUT_DIR/model/model_manifest.json")"
if [[ "$observed_step" != "$MAX_STEPS" ]]; then
  echo "Global-step mismatch: expected=$MAX_STEPS observed=$observed_step" >&2
  exit 7
fi

if [[ "$RUN_EVALUATIONS" == "1" ]]; then
  mkdir -p "$OUTPUT_DIR/evaluations"
  "$PYTHON_BIN" "$CODE_DIR/evaluate_migmaq_lexical_baseline.py" \
    --model-dir "$MODEL_DIR" \
    --benchmark "$LEXICAL_BENCHMARK" \
    --output-dir "$OUTPUT_DIR/evaluations/lexical-full" \
    --expected-model-sha256 "$MODEL_SHA256" \
    --expected-tokenizer-bundle-sha256 "$TOKENIZER_BUNDLE_SHA256" \
    --expected-benchmark-sha256 86f5e7eb88f7bef412bb7e7a2cb34fe4516a5df4ca8df1d6e4ecffcc225d8595 \
    --expected-rows 14438 \
    --expected-target-token-id "$expected_target_id" \
    --expect-output-head-alias untied \
    --input-field input_text \
    --source-lang eng_Latn \
    --target-lang mic_Latn \
    --no-use-fast-tokenizer \
    --batch-size 64 \
    --max-source-length 192 \
    --max-new-tokens 24 \
    --num-beams 1 \
    --no-repeat-ngram-size 0 \
    --repetition-penalty 1.0 \
    --length-penalty 1.0 \
    --dtype bfloat16 \
    --seed 42 \
    --require-cuda

  evaluate_sentence_set() {
    local data_file="$1"
    local output_file="$2"
    "$PYTHON_BIN" "$CODE_DIR/evaluate_nllb_lora.py" \
      --model-dir "$MODEL_DIR" \
      --data-file "$data_file" \
      --output-file "$output_file" \
      --source-lang eng_Latn \
      --target-lang mic_Latn \
      --direction eng-mic \
      --no-use-fast-tokenizer \
      --max-source-length 192 \
      --max-new-tokens 192 \
      --batch-size 64 \
      --num-beams 1 \
      --no-repeat-ngram-size 0 \
      --repetition-penalty 1.0 \
      --length-penalty 1.0 \
      --dtype bfloat16 \
      --require-cuda \
      --deterministic \
      --seed 42
  }

  evaluate_sentence_set "$VALIDATION_FILE" "$OUTPUT_DIR/evaluations/sentence-validation.json"
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
fi

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
