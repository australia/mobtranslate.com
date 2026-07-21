#!/usr/bin/env bash
set -euo pipefail

CODE_DIR="${CODE_DIR:-/workspace/mobtranslate-migmaq/code}"
DATASET_DIR="${DATASET_DIR:-/workspace/mobtranslate-migmaq/data/migmaq-online-example-parallel-v1.0.0-20260712}"
RUN_DIR="${RUN_DIR:-/workspace/mobtranslate-migmaq/runs/migmaq-v1-rc1}"
BASE_MODEL="facebook/nllb-200-distilled-600M"
BASE_REVISION="f8d333a098d19b4fd9a8b18f94170487ad3f821d"
DATASET_ARCHIVE_SHA256="805c225aeebf0596fa4f892d89cf930a23a395e2b58c1c059cb47a7092f86368"

mkdir -p "$RUN_DIR"
exec > >(tee -a "$RUN_DIR/full.log") 2>&1
cd "$CODE_DIR"

date -u +%Y-%m-%dT%H:%M:%SZ
nvidia-smi
python --version

# This is an explicit zero-shot diagnostic, not a plausible Mi'gmaq baseline.
python evaluate_nllb_lora.py \
  --model-dir "$BASE_MODEL" \
  --model-revision "$BASE_REVISION" \
  --target-lang-init-from tpi_Latn \
  --data-file "$DATASET_DIR/training/validation.eng-mic.jsonl" \
  --output-file "$RUN_DIR/base-proxy-validation.json" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --batch-size 16 \
  --num-beams 4 \
  --max-new-tokens 128 \
  --no-repeat-ngram-size 4 \
  --repetition-penalty 1.15 \
  --length-penalty 0.8

# Deliberately omit the frozen test file. Validation selects the checkpoint.
python train_nllb_lora.py \
  --model-id mobtranslate/migmaq-nllb-lora \
  --model-version 1.0.0-rc1 \
  --run-id migmaq-v1-rc1 \
  --dataset-id migmaq-online-example-parallel-v1.0.0-20260712 \
  --dataset-release-sha256 "$DATASET_ARCHIVE_SHA256" \
  --license CC-BY-NC-4.0 \
  --base-model "$BASE_MODEL" \
  --base-model-revision "$BASE_REVISION" \
  --train-file "$DATASET_DIR/training/train.eng-mic.jsonl" \
  --validation-file "$DATASET_DIR/training/validation.eng-mic.jsonl" \
  --output-dir "$RUN_DIR/model" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --target-lang-init-from tpi_Latn \
  --epochs 8 \
  --batch-size 8 \
  --gradient-accumulation-steps 4 \
  --learning-rate 1e-4 \
  --warmup-ratio 0.08 \
  --weight-decay 0.01 \
  --lora-r 32 \
  --lora-alpha 64 \
  --lora-dropout 0.05 \
  --lora-target-modules q_proj,k_proj,v_proj,out_proj,fc1,fc2 \
  --modules-to-save model.shared,lm_head \
  --eval-steps 180 \
  --save-steps 180 \
  --save-total-limit 3 \
  --logging-steps 20 \
  --generation-num-beams 4 \
  --generation-no-repeat-ngram-size 4 \
  --generation-repetition-penalty 1.15 \
  --generation-length-penalty 0.8

python audit_nllb_lora_pipeline.py \
  --base-model "$BASE_MODEL" \
  --base-model-revision "$BASE_REVISION" \
  --merged-model-dir "$RUN_DIR/model/merged" \
  --data-file "$DATASET_DIR/training/validation.eng-mic.jsonl" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --sample-rows 12 \
  --generate \
  --output-json "$RUN_DIR/merged-model-audit.json"

python evaluate_nllb_lora.py \
  --model-dir "$RUN_DIR/model/merged" \
  --data-file "$DATASET_DIR/training/validation.eng-mic.jsonl" \
  --output-file "$RUN_DIR/validation-beam4-norepeat4.json" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --batch-size 8 \
  --num-beams 4 \
  --max-new-tokens 128 \
  --no-repeat-ngram-size 4 \
  --repetition-penalty 1.15 \
  --length-penalty 0.8

date -u +%Y-%m-%dT%H:%M:%SZ
(cd "$RUN_DIR" && find . -type f ! -name 'SHA256SUMS*' -print0 | sort -z | xargs -0 sha256sum) > "$RUN_DIR/SHA256SUMS"
