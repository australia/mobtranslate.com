#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export RUN_ID="${RUN_ID:-v13.0-retrieval-context-bible-gvn-token-512row-20epoch-batch8}"
export DATA_ROOT="${DATA_ROOT:-/workspace/data/kuku_yalanji_v13_0_retrieval_context_bible}"
export TARGET_LANG="${TARGET_LANG:-gvn_Latn}"
export TARGET_LANG_INIT_FROM="${TARGET_LANG_INIT_FROM:-tpi_Latn}"
export MODULES_TO_SAVE="${MODULES_TO_SAVE:-}"
export EPOCHS="${EPOCHS:-20}"
export BATCH_SIZE="${BATCH_SIZE:-8}"
export GRADIENT_ACCUMULATION_STEPS="${GRADIENT_ACCUMULATION_STEPS:-2}"
export MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-256}"
export MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-128}"
export MAX_TRAIN_SAMPLES="${MAX_TRAIN_SAMPLES:-512}"
export MAX_VALIDATION_SAMPLES="${MAX_VALIDATION_SAMPLES:-128}"
export MAX_TEST_SAMPLES="${MAX_TEST_SAMPLES:-512}"
export EVAL_STEPS="${EVAL_STEPS:-640}"
export SAVE_STEPS="${SAVE_STEPS:-640}"
export LOGGING_STEPS="${LOGGING_STEPS:-128}"

exec "$SCRIPT_DIR/run_v9_tagged_multitask.sh"
