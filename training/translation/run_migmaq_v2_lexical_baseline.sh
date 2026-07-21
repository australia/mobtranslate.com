#!/usr/bin/env bash
set -euo pipefail

CODE_DIR="${CODE_DIR:-/workspace/migmaq-v2/code}"
MODEL_DIR="${MODEL_DIR:-/workspace/migmaq-v2/model/migmaq-nllb-lora-1.0.0-rc1/merged}"
BENCHMARK="${BENCHMARK:-/workspace/migmaq-v2/data/benchmark-ready.eng-mic.jsonl}"
OUTPUT_DIR="${OUTPUT_DIR:-/workspace/migmaq-v2/results/v1-full-lexical-baseline}"
PYTHON_BIN="${PYTHON_BIN:-python}"

if [[ -e "$OUTPUT_DIR" && ! -f "$OUTPUT_DIR/predictions.jsonl" ]]; then
  echo "Refusing nonempty or partial output location without predictions: $OUTPUT_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
exec > >(tee -a "$OUTPUT_DIR/run.log") 2>&1

date -u +%Y-%m-%dT%H:%M:%SZ
nvidia-smi
python --version

resume=()
if [[ -s "$OUTPUT_DIR/predictions.jsonl" ]]; then
  resume=(--resume)
fi

"$PYTHON_BIN" "$CODE_DIR/evaluate_migmaq_lexical_baseline.py" \
  --model-dir "$MODEL_DIR" \
  --benchmark "$BENCHMARK" \
  --output-dir "$OUTPUT_DIR" \
  --expected-model-sha256 8df8467e96ba480e790951f86cdc30919cd1d441faf7d1c5c5521cef1c78eb01 \
  --expected-tokenizer-sha256 1cf5d259956599ef20a29f8c95e9540db0113436ab5cbb702b4967dc4b35d5ef \
  --expected-benchmark-sha256 a39a1f518d7bbaf6f087905e96759ea7385f9d85817b89202d57240ddbbdef4d \
  --expected-rows 14438 \
  --expected-target-token-id 256204 \
  --expect-output-head-alias untied \
  --input-field unconditioned_input_text \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --batch-size 32 \
  --max-source-length 192 \
  --max-new-tokens 192 \
  --num-beams 4 \
  --no-repeat-ngram-size 3 \
  --repetition-penalty 1.1 \
  --length-penalty 1.0 \
  --dtype float32 \
  --seed 0 \
  --require-cuda \
  "${resume[@]}"

date -u +%Y-%m-%dT%H:%M:%SZ
