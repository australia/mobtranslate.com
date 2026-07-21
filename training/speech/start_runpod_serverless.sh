#!/usr/bin/env bash
set -euo pipefail

volume_root="${MOBTRANSLATE_ASR_VOLUME_ROOT:-/runpod-volume/omnilingual-asr}"
canonical_root="/workspace/omnilingual-asr"
if [[ "$volume_root" != "$canonical_root" ]]; then
  install -d -m 0755 "$(dirname "$canonical_root")"
  ln -sfn "$volume_root" "$canonical_root"
fi

export HOME="${canonical_root}/home"
export MOBTRANSLATE_ASR_HOME="$HOME"
export MOBTRANSLATE_ASR_MODEL_CARD="${MOBTRANSLATE_ASR_MODEL_CARD:-omniASR_LLM_7B_ZS}"
export MOBTRANSLATE_ASR_BEAM_SIZE="${MOBTRANSLATE_ASR_BEAM_SIZE:-5}"

exec "${canonical_root}/venv/bin/python" -u "${canonical_root}/app/runpod_handler.py"
