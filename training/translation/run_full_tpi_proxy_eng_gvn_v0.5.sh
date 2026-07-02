#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/workspace/data/kuku_yalanji_ebible_parallel_v0.1.0}"
OUT_DIR="${OUT_DIR:-/workspace/models/kuku-yalanji-nllb-lora/tpi-proxy-full-v0.5.0}"

python train_nllb_lora.py \
  --train-file "$DATA_DIR/train.eng-gvn.jsonl" \
  --validation-file "$DATA_DIR/validation.eng-gvn.jsonl" \
  --test-file "$DATA_DIR/test.eng-gvn.jsonl" \
  --output-dir "$OUT_DIR" \
  --direction eng-gvn \
  --source-lang eng_Latn \
  --target-lang tpi_Latn \
  --epochs 8 \
  --batch-size 8 \
  --gradient-accumulation-steps 4 \
  --max-validation-samples 512 \
  --max-test-samples 512 \
  --learning-rate 1e-4 \
  --lora-r 32 \
  --lora-alpha 64 \
  --lora-dropout 0.05 \
  --lora-target-modules q_proj,k_proj,v_proj,out_proj,fc1,fc2 \
  --eval-steps 800 \
  --save-steps 800 \
  --logging-steps 50 \
  --generation-num-beams 4 \
  --generation-no-repeat-ngram-size 4 \
  --generation-repetition-penalty 1.15 \
  --generation-length-penalty 0.8

python evaluate_nllb_lora.py \
  --model-dir "$OUT_DIR/merged" \
  --data-file "$DATA_DIR/test.eng-gvn.jsonl" \
  --output-file "$OUT_DIR/test_predictions_norepeat.json" \
  --direction eng-gvn \
  --source-lang eng_Latn \
  --target-lang tpi_Latn \
  --batch-size 8 \
  --max-rows 512 \
  --num-beams 4 \
  --max-new-tokens 192 \
  --no-repeat-ngram-size 4 \
  --repetition-penalty 1.15 \
  --length-penalty 0.8
