#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export RUN_ID="${RUN_ID:-v12.0-tagged-direct-plus-reference-bible-gvn-token-4096row-25epoch-batch16}"
export DATA_ROOT="${DATA_ROOT:-/workspace/data/kuku_yalanji_v9_7_tagged_direct_plus_reference_bible}"
export TARGET_LANG="${TARGET_LANG:-gvn_Latn}"
export TARGET_LANG_INIT_FROM="${TARGET_LANG_INIT_FROM:-tpi_Latn}"
export MODULES_TO_SAVE="${MODULES_TO_SAVE:-}"
export EPOCHS="${EPOCHS:-25}"
export BATCH_SIZE="${BATCH_SIZE:-16}"
export GRADIENT_ACCUMULATION_STEPS="${GRADIENT_ACCUMULATION_STEPS:-1}"
export MAX_SOURCE_LENGTH="${MAX_SOURCE_LENGTH:-96}"
export MAX_TARGET_LENGTH="${MAX_TARGET_LENGTH:-128}"
export EVAL_STEPS="${EVAL_STEPS:-1280}"
export SAVE_STEPS="${SAVE_STEPS:-1280}"
export LOGGING_STEPS="${LOGGING_STEPS:-256}"

exec "$SCRIPT_DIR/run_v9_tagged_multitask.sh"
