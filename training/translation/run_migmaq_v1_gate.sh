#!/usr/bin/env bash
set -euo pipefail

CODE_DIR="${CODE_DIR:-/workspace/mobtranslate-migmaq/code}"
DATASET_DIR="${DATASET_DIR:-/workspace/mobtranslate-migmaq/data/migmaq-online-example-parallel-v1.0.0-20260712}"
RUN_DIR="${RUN_DIR:-/workspace/mobtranslate-migmaq/runs/migmaq-v1-plumbing-gate}"
BASE_MODEL="facebook/nllb-200-distilled-600M"
BASE_REVISION="f8d333a098d19b4fd9a8b18f94170487ad3f821d"
DATASET_ARCHIVE_SHA256="805c225aeebf0596fa4f892d89cf930a23a395e2b58c1c059cb47a7092f86368"

mkdir -p "$RUN_DIR"
exec > >(tee -a "$RUN_DIR/gate.log") 2>&1
cd "$CODE_DIR"

date -u +%Y-%m-%dT%H:%M:%SZ
nvidia-smi
python --version

python audit_nllb_lora_pipeline.py \
  --base-model "$BASE_MODEL" \
  --base-model-revision "$BASE_REVISION" \
  --data-file "$DATASET_DIR/training/gates/overfit-128.eng-mic.jsonl" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --target-lang-init-from tpi_Latn \
  --sample-rows 8 \
  --output-json "$RUN_DIR/preflight-audit.json"

python train_nllb_lora.py \
  --model-id mobtranslate/migmaq-nllb-lora \
  --model-version 1.0.0-gate \
  --run-id migmaq-v1-plumbing-gate \
  --dataset-id migmaq-online-example-parallel-v1.0.0-20260712 \
  --dataset-release-sha256 "$DATASET_ARCHIVE_SHA256" \
  --license CC-BY-NC-4.0 \
  --base-model "$BASE_MODEL" \
  --base-model-revision "$BASE_REVISION" \
  --train-file "$DATASET_DIR/training/gates/overfit-128.eng-mic.jsonl" \
  --validation-file "$DATASET_DIR/training/gates/overfit-128.eng-mic.jsonl" \
  --output-dir "$RUN_DIR/model" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --target-lang-init-from tpi_Latn \
  --epochs 30 \
  --batch-size 8 \
  --gradient-accumulation-steps 1 \
  --learning-rate 2e-4 \
  --warmup-ratio 0.05 \
  --lora-r 32 \
  --lora-alpha 64 \
  --lora-dropout 0.05 \
  --lora-target-modules q_proj,k_proj,v_proj,out_proj,fc1,fc2 \
  --modules-to-save model.shared,lm_head \
  --eval-steps 80 \
  --save-steps 80 \
  --save-total-limit 2 \
  --logging-steps 10 \
  --generation-num-beams 1 \
  --generation-no-repeat-ngram-size 0 \
  --generation-repetition-penalty 1.0 \
  --generation-length-penalty 1.0 \
  --no-shuffle-before-cap

python evaluate_nllb_lora.py \
  --model-dir "$RUN_DIR/model/merged" \
  --data-file "$DATASET_DIR/training/gates/overfit-128.eng-mic.jsonl" \
  --output-file "$RUN_DIR/overfit-evaluation.json" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --batch-size 8 \
  --num-beams 1 \
  --max-new-tokens 128

python evaluate_nllb_lora.py \
  --model-dir "$RUN_DIR/model/merged" \
  --data-file "$DATASET_DIR/training/gates/sanity-64.eng-mic.jsonl" \
  --output-file "$RUN_DIR/sanity-evaluation.json" \
  --direction eng-mic \
  --source-lang eng_Latn \
  --target-lang mic_Latn \
  --batch-size 8 \
  --num-beams 1 \
  --max-new-tokens 128

python verify_migmaq_gate.py \
  --run-dir "$RUN_DIR" \
  --output "$RUN_DIR/gate-verdict.json"

(cd "$RUN_DIR" && find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum) > "$RUN_DIR/SHA256SUMS"
date -u +%Y-%m-%dT%H:%M:%SZ
