#!/usr/bin/env bash
# Keep each enabled homepage research model warm in the shared Space.
#
# The homepage hybrid path (draft -> review) calls the Hugging Face Space on the
# critical path of a user request. A cold Space answers
#   503 {"code":"model_loading","phase":"loading"}
# and the first user after an idle period sees "translation unavailable". The
# language list is configuration, so adding a registry entry does not require a
# new timer or language-specific warm script.
set -uo pipefail

CONF=${MOBTRANSLATE_TRANSLATE_V2_CONF:-/etc/systemd/system/mobtranslate-web.service.d/translate-v2.conf}

read_conf() {
  local name=$1
  [[ -r $CONF ]] || return 0
  sed -n "s/^Environment=${name}=//p" "$CONF" | tail -1
}

ENDPOINT=${MOBTRANSLATE_HYBRID_SPACE_ENDPOINT:-}
if [[ -z $ENDPOINT && -r $CONF ]]; then
  ENDPOINT=$(read_conf MOBTRANSLATE_HYBRID_SPACE_ENDPOINT)
fi
ENDPOINT=${ENDPOINT:-https://ajaxdavis-alpha-v0-historic.hf.space/v1/translate}

LANGUAGES=${MOBTRANSLATE_HYBRID_WARM_LANGUAGES:-}
if [[ -z $LANGUAGES && -r $CONF ]]; then
  LANGUAGES=$(read_conf MOBTRANSLATE_HYBRID_WARM_LANGUAGES)
fi
if [[ -z $LANGUAGES ]]; then
  echo "model-warm: no enabled languages configured; skipping"
  exit 0
fi

TEXT=${MOBTRANSLATE_HYBRID_WARM_TEXT:-Hello}
ATTEMPTS=${MOBTRANSLATE_HYBRID_WARM_ATTEMPTS:-6}
SLEEP=${MOBTRANSLATE_HYBRID_WARM_SLEEP:-20}
failed=0

IFS=',' read -r -a language_codes <<<"$LANGUAGES"
for raw_language in "${language_codes[@]}"; do
  language=$(printf '%s' "$raw_language" | xargs)
  [[ -n $language ]] || continue
  payload=$(LANGUAGE="$language" TEXT="$TEXT" python3 -c \
    'import json,os; print(json.dumps({"text": os.environ["TEXT"], "language": os.environ["LANGUAGE"]}))')

  warmed=0
  for ((i = 1; i <= ATTEMPTS; i++)); do
    body=$(curl -sS -m 180 -X POST "$ENDPOINT" \
      -H 'Content-Type: application/json' \
      -d "$payload" 2>&1)
    state=$(LANGUAGE="$language" python3 -c \
      'import json,os,sys
try:
    body=json.load(sys.stdin)
except Exception:
    print("unexpected")
else:
    if body.get("languageCode") == os.environ["LANGUAGE"] and str(body.get("translation", "")).strip():
        print("ready")
    elif body.get("code") == "model_loading":
        print("loading")
    else:
        print("unexpected")' <<<"$body")
    case $state in
      ready)
        echo "model-warm: ${language} ready after ${i} attempt(s)"
        warmed=1
        break
        ;;
      loading)
        echo "model-warm: ${language} attempt ${i}/${ATTEMPTS}: still loading"
        ;;
      *)
        echo "model-warm: ${language} attempt ${i}/${ATTEMPTS}: unexpected: ${body:0:200}"
        ;;
    esac
    ((i < ATTEMPTS)) && sleep "$SLEEP"
  done

  if ((warmed == 0)); then
    echo "model-warm: ${language} still unavailable after ${ATTEMPTS} attempts"
    failed=1
  fi
done

exit "$failed"
