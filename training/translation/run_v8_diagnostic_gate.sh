#!/usr/bin/env bash
set -euo pipefail

GATE="${1:-v8.1}"

DATA_ROOT="${DATA_ROOT:-/workspace/data/kuku_yalanji_v8_diagnostic_sets}"
OUT_ROOT="${OUT_ROOT:-/workspace/models/kuku-yalanji-nllb-lora}"
LOG_ROOT="${LOG_ROOT:-/workspace/logs/kuku-yalanji-v8}"
REPORT_ROOT="${REPORT_ROOT:-/workspace/reports/kuku-yalanji-v8}"
BASE_MODEL="${BASE_MODEL:-facebook/nllb-200-distilled-1.3B}"
SOURCE_LANG="${SOURCE_LANG:-eng_Latn}"
TARGET_LANG="${TARGET_LANG:-tpi_Latn}"
DIRECTION="${DIRECTION:-eng-gvn}"
MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-192}"
MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-256}"
LORA_TARGET_MODULES="${LORA_TARGET_MODULES:-q_proj,k_proj,v_proj,out_proj,fc1,fc2}"
SEED="${SEED:-42}"

mkdir -p "$OUT_ROOT" "$LOG_ROOT" "$REPORT_ROOT"

run_id=""
subset_dir=""
epochs=""
batch_size=""
grad_accum=""
learning_rate=""
eval_steps=""
save_steps=""
logging_steps=""
lora_r="${LORA_R:-64}"
lora_alpha="${LORA_ALPHA:-128}"
lora_dropout="${LORA_DROPOUT:-0.0}"
min_chrf="${MIN_CHRF:-0}"

case "$GATE" in
  v8.0|v8.0-audit)
    run_id="v8.0-audit-tpi"
    ;;
  v8.1|v8.1-1row)
    run_id="v8.1-1row-overfit-tpi"
    subset_dir="v8_001row"
    epochs="${EPOCHS:-160}"
    batch_size="${BATCH_SIZE:-1}"
    grad_accum="${GRADIENT_ACCUMULATION_STEPS:-1}"
    learning_rate="${LEARNING_RATE:-3e-4}"
    eval_steps="${EVAL_STEPS:-10}"
    save_steps="${SAVE_STEPS:-10}"
    logging_steps="${LOGGING_STEPS:-5}"
    min_chrf="${MIN_CHRF:-80}"
    ;;
  v8.2|v8.2-8row)
    run_id="v8.2-8row-overfit-tpi"
    subset_dir="v8_008row"
    epochs="${EPOCHS:-120}"
    batch_size="${BATCH_SIZE:-2}"
    grad_accum="${GRADIENT_ACCUMULATION_STEPS:-1}"
    learning_rate="${LEARNING_RATE:-3e-4}"
    eval_steps="${EVAL_STEPS:-20}"
    save_steps="${SAVE_STEPS:-20}"
    logging_steps="${LOGGING_STEPS:-10}"
    min_chrf="${MIN_CHRF:-75}"
    ;;
  v8.3|v8.3-32row)
    run_id="v8.3-32row-overfit-tpi"
    subset_dir="v8_032row"
    epochs="${EPOCHS:-80}"
    batch_size="${BATCH_SIZE:-4}"
    grad_accum="${GRADIENT_ACCUMULATION_STEPS:-1}"
    learning_rate="${LEARNING_RATE:-2e-4}"
    eval_steps="${EVAL_STEPS:-40}"
    save_steps="${SAVE_STEPS:-40}"
    logging_steps="${LOGGING_STEPS:-10}"
    min_chrf="${MIN_CHRF:-70}"
    ;;
  v8.4|v8.4-256row)
    run_id="v8.4-256row-overfit-tpi"
    subset_dir="v8_256row"
    epochs="${EPOCHS:-40}"
    batch_size="${BATCH_SIZE:-4}"
    grad_accum="${GRADIENT_ACCUMULATION_STEPS:-2}"
    learning_rate="${LEARNING_RATE:-2e-4}"
    eval_steps="${EVAL_STEPS:-80}"
    save_steps="${SAVE_STEPS:-80}"
    logging_steps="${LOGGING_STEPS:-20}"
    min_chrf="${MIN_CHRF:-60}"
    ;;
  *)
    echo "Unknown gate: $GATE" >&2
    exit 2
    ;;
esac

out_dir="$OUT_ROOT/$run_id"
log_file="$LOG_ROOT/$run_id.driver.log"
monitor_file="$LOG_ROOT/$run_id.resource.csv"
report_file="$REPORT_ROOT/$run_id.md"
audit_file="$out_dir/gate0_audit.json"

write_report_header() {
  {
    echo "# Kuku Yalanji $run_id"
    echo
    echo "Started UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo
    echo "Gate: \`$GATE\`"
    echo
    echo "Base model: \`$BASE_MODEL\`"
    echo
    echo "Direction: \`$SOURCE_LANG -> $TARGET_LANG\`"
    echo
    echo "Decode for overfit proof:"
    echo
    echo '```text'
    echo "num_beams=1"
    echo "no_repeat_ngram_size=0"
    echo "repetition_penalty=1.0"
    echo "length_penalty=1.0"
    echo "max_new_tokens=$MAX_TARGET_LENGTH"
    echo '```'
  } > "$report_file"
}

append_command_block() {
  local title="$1"
  local file="$2"
  {
    echo
    echo "## $title"
    echo
    echo '```text'
    sed -n '1,220p' "$file" || true
    echo '```'
  } >> "$report_file"
}

write_report_header
mkdir -p "$out_dir"

if command -v nvidia-smi >/dev/null 2>&1; then
  {
    echo
    echo "## GPU"
    echo
    echo '```text'
    nvidia-smi
    echo '```'
  } >> "$report_file"
fi

if [[ "$run_id" == "v8.0-audit-tpi" ]]; then
  python audit_nllb_lora_pipeline.py \
    --base-model "$BASE_MODEL" \
    --data-file "$DATA_ROOT/v8_001row/train.eng-gvn.jsonl" \
    --direction "$DIRECTION" \
    --source-lang "$SOURCE_LANG" \
    --target-lang "$TARGET_LANG" \
    --max-source-length "$MAX_SOURCE_LENGTH" \
    --max-target-length "$MAX_TARGET_LENGTH" \
    --sample-rows 1 \
    --lora-target-modules "$LORA_TARGET_MODULES" \
    --output-json "$audit_file" \
    > "$LOG_ROOT/$run_id.audit.stdout.json" 2>&1
  append_command_block "Audit JSON" "$audit_file"
  echo >> "$report_file"
  echo "Completed UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$report_file"
  echo "$report_file"
  exit 0
fi

train_file="$DATA_ROOT/$subset_dir/train.eng-gvn.jsonl"
eval_file="$DATA_ROOT/$subset_dir/eval_train.eng-gvn.jsonl"

if [[ ! -s "$train_file" || ! -s "$eval_file" ]]; then
  echo "Missing gate data under $DATA_ROOT/$subset_dir" >&2
  exit 3
fi

monitor_pid=""
if [[ -x ./run_resource_monitor.sh ]]; then
  INTERVAL_SECONDS="${INTERVAL_SECONDS:-5}" ./run_resource_monitor.sh "$monitor_file" &
  monitor_pid="$!"
fi
cleanup() {
  if [[ -n "$monitor_pid" ]]; then
    kill "$monitor_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

{
  echo "RUN_ID=$run_id"
  echo "TRAIN_FILE=$train_file"
  echo "EVAL_FILE=$eval_file"
  echo "OUT_DIR=$out_dir"
  echo "EPOCHS=$epochs"
  echo "BATCH_SIZE=$batch_size"
  echo "GRADIENT_ACCUMULATION_STEPS=$grad_accum"
  echo "LEARNING_RATE=$learning_rate"
  echo "LORA_R=$lora_r"
  echo "LORA_ALPHA=$lora_alpha"
  echo "LORA_DROPOUT=$lora_dropout"
  echo "LORA_TARGET_MODULES=$LORA_TARGET_MODULES"
} >> "$log_file"

python train_nllb_lora.py \
  --base-model "$BASE_MODEL" \
  --train-file "$train_file" \
  --validation-file "$eval_file" \
  --test-file "$eval_file" \
  --output-dir "$out_dir" \
  --direction "$DIRECTION" \
  --source-lang "$SOURCE_LANG" \
  --target-lang "$TARGET_LANG" \
  --epochs "$epochs" \
  --batch-size "$batch_size" \
  --gradient-accumulation-steps "$grad_accum" \
  --max-source-length "$MAX_SOURCE_LENGTH" \
  --max-target-length "$MAX_TARGET_LENGTH" \
  --learning-rate "$learning_rate" \
  --warmup-ratio 0.0 \
  --weight-decay 0.0 \
  --lora-r "$lora_r" \
  --lora-alpha "$lora_alpha" \
  --lora-dropout "$lora_dropout" \
  --lora-target-modules "$LORA_TARGET_MODULES" \
  --eval-steps "$eval_steps" \
  --save-steps "$save_steps" \
  --save-total-limit 2 \
  --logging-steps "$logging_steps" \
  --generation-num-beams 1 \
  --generation-no-repeat-ngram-size 0 \
  --generation-repetition-penalty 1.0 \
  --generation-length-penalty 1.0 \
  --seed "$SEED" \
  --no-shuffle-before-cap \
  2>&1 | tee -a "$log_file"

python evaluate_nllb_lora.py \
  --model-dir "$out_dir/merged" \
  --data-file "$eval_file" \
  --output-file "$out_dir/eval_train_predictions_greedy.json" \
  --direction "$DIRECTION" \
  --source-lang "$SOURCE_LANG" \
  --target-lang "$TARGET_LANG" \
  --batch-size "$batch_size" \
  --num-beams 1 \
  --max-new-tokens "$MAX_TARGET_LENGTH" \
  --no-repeat-ngram-size 0 \
  --repetition-penalty 1.0 \
  --length-penalty 1.0 \
  2>&1 | tee "$out_dir/eval_train_metrics.stdout.json"

python summarize_predictions.py "$out_dir/eval_train_predictions_greedy.json" \
  --samples 8 \
  > "$out_dir/eval_train_summary.txt"

append_command_block "Training Log Head" "$log_file"
{
  echo
  echo "## Train Reproduction Metrics"
  echo
  echo '```json'
  cat "$out_dir/eval_train_metrics.stdout.json"
  echo '```'
  echo
  echo "## Train Reproduction Summary"
  echo
  echo '```text'
  cat "$out_dir/eval_train_summary.txt"
  echo '```'
  echo
  echo "## Resource Monitor Tail"
  echo
  echo '```csv'
  tail -n 40 "$monitor_file" || true
  echo '```'
  echo
  echo "Completed UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >> "$report_file"

python - "$out_dir/eval_train_predictions_greedy.json" "$min_chrf" <<'PY'
import json
import sys
path = sys.argv[1]
min_chrf = float(sys.argv[2])
data = json.load(open(path, encoding="utf-8"))
metrics = data.get("metrics", {})
chrf = float(metrics.get("chrf") or 0.0)
rows = int(metrics.get("rows") or 0)
if rows <= 0:
    raise SystemExit("gate failed: no evaluation rows")
if chrf < min_chrf:
    raise SystemExit(f"gate failed: chrF {chrf:.2f} < required {min_chrf:.2f}")
print(f"gate passed: chrF {chrf:.2f} >= required {min_chrf:.2f}")
PY

echo "$report_file"
