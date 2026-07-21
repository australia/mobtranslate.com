#!/usr/bin/env bash
# Keep the Kuku Yalanji research-model Space warm.
#
# The homepage hybrid path (draft -> review) calls the Hugging Face Space on the
# critical path of a user request. A cold Space answers
#   503 {"code":"model_loading","phase":"loading"}
# and the first user after an idle period sees "translation unavailable".
# A cheap periodic request keeps the model resident.
set -uo pipefail

CONF=${MOBTRANSLATE_TRANSLATE_V2_CONF:-/etc/systemd/system/mobtranslate-web.service.d/translate-v2.conf}
ENDPOINT=${MOBTRANSLATE_TRANSLATE_V2_ENDPOINT:-}
if [[ -z $ENDPOINT && -r $CONF ]]; then
  ENDPOINT=$(sed -n 's/^Environment=MOBTRANSLATE_TRANSLATE_V2_ENDPOINT=//p' "$CONF" | tail -1)
fi
ENDPOINT=${ENDPOINT:-https://ajaxdavis-alpha-v0-historic.hf.space/v1/translate}

# Only warm when the homepage actually uses the model.
ENABLED=${MOBTRANSLATE_HOMEPAGE_KUKU_MODEL_ENABLED:-}
if [[ -z $ENABLED && -r $CONF ]]; then
  ENABLED=$(sed -n 's/^Environment=MOBTRANSLATE_HOMEPAGE_KUKU_MODEL_ENABLED=//p' "$CONF" | tail -1)
fi
if [[ ${ENABLED:-0} != 1 ]]; then
  echo "kuku-warm: homepage model disabled (ENABLED=${ENABLED:-unset}); skipping"
  exit 0
fi

TEXT=${MOBTRANSLATE_KUKU_WARM_TEXT:-water}
ATTEMPTS=${MOBTRANSLATE_KUKU_WARM_ATTEMPTS:-6}
SLEEP=${MOBTRANSLATE_KUKU_WARM_SLEEP:-20}

for ((i = 1; i <= ATTEMPTS; i++)); do
  body=$(curl -sS -m 120 -X POST "$ENDPOINT" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":$(printf '%s' "$TEXT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}" 2>&1)
  case $body in
    *'"translation"'*)
      echo "kuku-warm: warm after ${i} attempt(s)"
      exit 0
      ;;
    *model_loading*)
      echo "kuku-warm: attempt ${i}/${ATTEMPTS} — still loading"
      ;;
    *)
      echo "kuku-warm: attempt ${i}/${ATTEMPTS} — unexpected: ${body:0:200}"
      ;;
  esac
  ((i < ATTEMPTS)) && sleep "$SLEEP"
done

echo "kuku-warm: still cold after ${ATTEMPTS} attempts"
exit 1
