#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/workspace/data/kuku_yalanji_ebible_parallel_v0.1.0}"
OUT_DIR="${OUT_DIR:-/workspace/models/kuku-yalanji-nllb-lora/gvn-token-full-v0.6.0-1.3b}"

python train_nllb_lora.py \
  --base-model facebook/nllb-200-distilled-1.3B \
  --train-file "$DATA_DIR/train.eng-gvn.jsonl" \
  --validation-file "$DATA_DIR/validation.eng-gvn.jsonl" \
  --test-file "$DATA_DIR/test.eng-gvn.jsonl" \
  --output-dir "$OUT_DIR" \
  --direction eng-gvn \
  --source-lang eng_Latn \
  --target-lang gvn_Latn \
  --target-lang-init-from tpi_Latn \
  --epochs 8 \
  --batch-size 4 \
  --gradient-accumulation-steps 8 \
  --max-validation-samples 512 \
  --max-test-samples 512 \
  --learning-rate 8e-5 \
  --lora-r 32 \
  --lora-alpha 64 \
  --lora-dropout 0.05 \
  --lora-target-modules q_proj,k_proj,v_proj,out_proj,fc1,fc2 \
  --modules-to-save model.shared,lm_head \
  --eval-steps 800 \
  --save-steps 800 \
  --save-total-limit 2 \
  --logging-steps 50 \
  --gradient-checkpointing \
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
  --target-lang gvn_Latn \
  --batch-size 4 \
  --max-rows 512 \
  --num-beams 4 \
  --max-new-tokens 128 \
  --no-repeat-ngram-size 4 \
  --repetition-penalty 1.15 \
  --length-penalty 0.8
