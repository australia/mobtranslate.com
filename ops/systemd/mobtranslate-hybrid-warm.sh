#!/usr/bin/env bash
# Keep every enabled homepage adapter warm and verify its immutable identity.
set -uo pipefail

CONF=${MOBTRANSLATE_TRANSLATE_V2_CONF:-/etc/systemd/system/mobtranslate-web.service.d/translate-v2.conf}

read_conf() {
  local name=$1
  [[ -r $CONF ]] || return 0
  sed -n "s/^Environment=${name}=//p" "$CONF" | tail -1
}

read_setting() {
  local name=$1
  local value=${!name:-}
  if [[ -z $value ]]; then value=$(read_conf "$name"); fi
  printf '%s' "$value"
}

ENDPOINT=$(read_setting MOBTRANSLATE_HYBRID_SPACE_ENDPOINT)
ENDPOINT=${ENDPOINT:-https://ajaxdavis-alpha-v0-historic.hf.space/v1/translate}
SPACE_BASE=${ENDPOINT%/v1/translate}
REGISTRY_ENDPOINT=${SPACE_BASE}/v1/models

LANGUAGES=$(read_setting MOBTRANSLATE_HYBRID_WARM_LANGUAGES)
if [[ -z $LANGUAGES ]]; then
  echo "model-warm: no enabled languages configured; skipping"
  exit 0
fi

TEXT=${MOBTRANSLATE_HYBRID_WARM_TEXT:-Hello}
ATTEMPTS=${MOBTRANSLATE_HYBRID_WARM_ATTEMPTS:-6}
SLEEP=${MOBTRANSLATE_HYBRID_WARM_SLEEP:-20}
failed=0

registry_body=""
for ((i = 1; i <= ATTEMPTS; i++)); do
  registry_body=$(curl -fsS -m 30 "$REGISTRY_ENDPOINT" 2>&1) && break
  echo "model-warm: registry attempt ${i}/${ATTEMPTS} failed: ${registry_body:0:200}"
  ((i < ATTEMPTS)) && sleep "$SLEEP"
done
if [[ -z $registry_body ]]; then
  echo "model-warm: registry remained unavailable"
  exit 1
fi

IFS=',' read -r -a language_codes <<<"$LANGUAGES"
for raw_language in "${language_codes[@]}"; do
  language=$(printf '%s' "$raw_language" | xargs)
  [[ -n $language ]] || continue
  suffix=$(printf '%s' "$language" | tr '[:lower:]-' '[:upper:]_')
  enabled=$(read_setting "MOBTRANSLATE_HYBRID_${suffix}_ENABLED")
  expected_model=$(read_setting "MOBTRANSLATE_HYBRID_${suffix}_MODEL_ID")
  expected_version=$(read_setting "MOBTRANSLATE_HYBRID_${suffix}_VERSION")

  if [[ $enabled != 1 || -z $expected_model || -z $expected_version ]]; then
    echo "model-warm: ${language} lacks an enabled immutable model contract"
    failed=1
    continue
  fi

  if ! REGISTRY_BODY="$registry_body" LANGUAGE="$language" \
    EXPECTED_MODEL="$expected_model" EXPECTED_VERSION="$expected_version" \
    python3 -c 'import json,os
body=json.loads(os.environ["REGISTRY_BODY"])
models={item.get("languageCode"): item for item in body.get("models", [])}
item=models.get(os.environ["LANGUAGE"])
if not item:
    raise SystemExit("configured language is absent from the Space registry")
if item.get("modelId") != os.environ["EXPECTED_MODEL"]:
    raise SystemExit("Space registry model ID does not match configuration")
if item.get("version") != os.environ["EXPECTED_VERSION"]:
    raise SystemExit("Space registry version does not match configuration")
if "translate" not in item.get("tasks", []):
    raise SystemExit("Space registry does not advertise translation")'; then
    echo "model-warm: ${language} registry identity check failed"
    failed=1
    continue
  fi

  payload=$(LANGUAGE="$language" TEXT="$TEXT" python3 -c \
    'import json,os; print(json.dumps({"text": os.environ["TEXT"], "language": os.environ["LANGUAGE"]}))')

  warmed=0
  for ((i = 1; i <= ATTEMPTS; i++)); do
    body=$(curl -sS -m 180 -X POST "$ENDPOINT" \
      -H 'Content-Type: application/json' \
      -d "$payload" 2>&1)
    state=$(LANGUAGE="$language" EXPECTED_MODEL="$expected_model" \
      EXPECTED_VERSION="$expected_version" python3 -c 'import json,os,sys
try:
    body=json.load(sys.stdin)
except Exception:
    print("unexpected")
else:
    identity_ok=(
        body.get("languageCode") == os.environ["LANGUAGE"]
        and body.get("modelId") == os.environ["EXPECTED_MODEL"]
        and body.get("model") == os.environ["EXPECTED_VERSION"]
        and body.get("validation") == "unverified_research_preview"
    )
    if identity_ok and str(body.get("translation", "")).strip():
        print("ready")
    elif body.get("code") == "model_loading":
        print("loading")
    else:
        print("unexpected")' <<<"$body")
    case $state in
      ready)
        echo "model-warm: ${language} ${expected_model}@${expected_version} ready after ${i} attempt(s)"
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
