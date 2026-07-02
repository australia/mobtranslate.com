#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export RUN_ID="${RUN_ID:-v10.0-tagged-bible-plus-glossary-usage-tpi-20epoch-batch16}"
export DATA_ROOT="${DATA_ROOT:-/workspace/data/kuku_yalanji_v10_0_bible_glossary_usage}"
export EPOCHS="${EPOCHS:-20}"
export BATCH_SIZE="${BATCH_SIZE:-16}"
export GRADIENT_ACCUMULATION_STEPS="${GRADIENT_ACCUMULATION_STEPS:-1}"
export MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-160}"
export MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-128}"
export EVAL_STEPS="${EVAL_STEPS:-1400}"
export SAVE_STEPS="${SAVE_STEPS:-1400}"
export LOGGING_STEPS="${LOGGING_STEPS:-280}"

exec "$SCRIPT_DIR/run_v9_bible_db_multitask.sh"
