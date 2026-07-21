#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT="$ROOT/mobtranslate-hybrid-warm.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

CONF="$TMP/translate-v2.conf"
printf '%s\n' \
  'Environment=MOBTRANSLATE_HYBRID_SPACE_ENDPOINT=https://space.test/v1/translate' \
  'Environment=MOBTRANSLATE_HYBRID_WARM_LANGUAGES=kuku_yalanji,migmaq' \
  'Environment=MOBTRANSLATE_HYBRID_KUKU_YALANJI_ENABLED=1' \
  'Environment=MOBTRANSLATE_HYBRID_KUKU_YALANJI_MODEL_ID=kuku-yalanji-nllb-lora' \
  'Environment=MOBTRANSLATE_HYBRID_KUKU_YALANJI_VERSION=v24.3' \
  'Environment=MOBTRANSLATE_HYBRID_MIGMAQ_ENABLED=1' \
  'Environment=MOBTRANSLATE_HYBRID_MIGMAQ_MODEL_ID=migmaq-listuguj-nllb-lora' \
  'Environment=MOBTRANSLATE_HYBRID_MIGMAQ_VERSION=v3.3.0' >"$CONF"

curl() {
  local args="$*"
  if [[ $args == *'/v1/models'* ]]; then
    if [[ ${FAKE_REGISTRY_MISMATCH:-0} == 1 ]]; then
      printf '%s\n' '{"models":[{"languageCode":"kuku_yalanji","modelId":"kuku-yalanji-nllb-lora","version":"wrong","tasks":["translate"]},{"languageCode":"migmaq","modelId":"migmaq-listuguj-nllb-lora","version":"v3.3.0","tasks":["translate"]}]}'
    else
      printf '%s\n' '{"models":[{"languageCode":"kuku_yalanji","modelId":"kuku-yalanji-nllb-lora","version":"v24.3","tasks":["translate"]},{"languageCode":"migmaq","modelId":"migmaq-listuguj-nllb-lora","version":"v3.3.0","tasks":["translate"]}]}'
    fi
  elif [[ $args == *'migmaq'* ]]; then
    printf '%s\n' '{"languageCode":"migmaq","modelId":"migmaq-listuguj-nllb-lora","model":"v3.3.0","validation":"unverified_research_preview","translation":"output"}'
  else
    printf '%s\n' '{"languageCode":"kuku_yalanji","modelId":"kuku-yalanji-nllb-lora","model":"v24.3","validation":"unverified_research_preview","translation":"output"}'
  fi
}
export -f curl

success_output=$(MOBTRANSLATE_TRANSLATE_V2_CONF="$CONF" \
  MOBTRANSLATE_HYBRID_WARM_ATTEMPTS=1 \
  MOBTRANSLATE_HYBRID_WARM_SLEEP=0 \
  bash "$SCRIPT")
grep -q 'kuku_yalanji kuku-yalanji-nllb-lora@v24.3 ready' <<<"$success_output"
grep -q 'migmaq migmaq-listuguj-nllb-lora@v3.3.0 ready' <<<"$success_output"

if FAKE_REGISTRY_MISMATCH=1 \
  MOBTRANSLATE_TRANSLATE_V2_CONF="$CONF" \
  MOBTRANSLATE_HYBRID_WARM_ATTEMPTS=1 \
  MOBTRANSLATE_HYBRID_WARM_SLEEP=0 \
  bash "$SCRIPT" >"$TMP/mismatch.log" 2>&1; then
  echo "Expected a registry version mismatch to fail." >&2
  exit 1
fi
grep -q 'kuku_yalanji registry identity check failed' "$TMP/mismatch.log"

echo "hybrid model warm tests passed"
