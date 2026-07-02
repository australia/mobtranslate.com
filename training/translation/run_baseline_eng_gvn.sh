#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/workspace/data/kuku_yalanji_ebible_parallel_v0.1.0}"
OUT_DIR="${OUT_DIR:-/workspace/models/kuku-yalanji-nllb-lora/v0.1.0}"

python train_nllb_lora.py \
  --train-file "$DATA_DIR/train.eng-gvn.jsonl" \
  --validation-file "$DATA_DIR/validation.eng-gvn.jsonl" \
  --test-file "$DATA_DIR/test.eng-gvn.jsonl" \
  --output-dir "$OUT_DIR" \
  --direction eng-gvn \
  --source-lang eng_Latn \
  --target-lang gvn_Latn \
  --epochs 8 \
  --batch-size 8 \
  --gradient-accumulation-steps 4 \
  --eval-steps 100 \
  --save-steps 200 \
  --logging-steps 20

python evaluate_nllb_lora.py \
  --model-dir "$OUT_DIR/merged" \
  --data-file "$DATA_DIR/test.eng-gvn.jsonl" \
  --output-file "$OUT_DIR/test_predictions.json" \
  --direction eng-gvn \
  --source-lang eng_Latn \
  --target-lang gvn_Latn \
  --batch-size 8
