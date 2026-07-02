#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/workspace/data/kuku_yalanji_ebible_parallel_v0.1.0}"
OUT_DIR="${OUT_DIR:-/workspace/models/kuku-yalanji-nllb-lora/mini-pilot-v0.1.0}"

python train_nllb_lora.py \
  --train-file "$DATA_DIR/train.eng-gvn.jsonl" \
  --validation-file "$DATA_DIR/validation.eng-gvn.jsonl" \
  --test-file "$DATA_DIR/test.eng-gvn.jsonl" \
  --output-dir "$OUT_DIR" \
  --direction eng-gvn \
  --source-lang eng_Latn \
  --target-lang gvn_Latn \
  --max-train-samples 2048 \
  --max-validation-samples 128 \
  --max-test-samples 128 \
  --epochs 1 \
  --batch-size 16 \
  --gradient-accumulation-steps 2 \
  --eval-steps 50 \
  --save-steps 50 \
  --logging-steps 10

python evaluate_nllb_lora.py \
  --model-dir "$OUT_DIR/merged" \
  --data-file "$DATA_DIR/test.eng-gvn.jsonl" \
  --output-file "$OUT_DIR/test_predictions.json" \
  --direction eng-gvn \
  --source-lang eng_Latn \
  --target-lang gvn_Latn \
  --batch-size 16 \
  --max-rows 128
