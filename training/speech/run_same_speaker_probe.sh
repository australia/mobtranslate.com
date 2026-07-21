#!/usr/bin/env bash
set -euo pipefail

probe_mode="${MOBTRANSLATE_PROBE_MODE:-direct}"
if [[ -z "${MOBTRANSLATE_ASR_ENDPOINT:-}" ]]; then
  echo "Set MOBTRANSLATE_ASR_ENDPOINT." >&2
  exit 2
fi
if [[ "$probe_mode" == "direct" && -z "${MOBTRANSLATE_ASR_TOKEN:-}" ]]; then
  echo "Set MOBTRANSLATE_ASR_TOKEN for a direct-provider probe." >&2
  exit 2
fi
if [[ "$probe_mode" != "direct" && "$probe_mode" != "web" ]]; then
  echo "MOBTRANSLATE_PROBE_MODE must be direct or web." >&2
  exit 2
fi

output_dir="${1:?usage: run_same_speaker_probe.sh OUTPUT_DIR}"
tts_base="${MOBTRANSLATE_TTS_BASE:-https://mobtranslate.com/api/tts}"
mkdir -p "$output_dir"

if [[ -n "${MOBTRANSLATE_PROBE_CONTEXT_TEXTS:-}" ]]; then
  IFS='|' read -r -a context_texts <<< "$MOBTRANSLATE_PROBE_CONTEXT_TEXTS"
else
  IFS='|' read -r -a context_texts <<< "${MOBTRANSLATE_PROBE_CONTEXT_WORDS:-dingkar jalbu karrkay|nyulu wulbuman bama|bayan balibali bana walalarrku|wungaraba dayirr bajaku balban|babingka jija kujin-kujil|kaykay-kaykayangka wulngku bangka-bangkangan|ngayu baduriji dungaka yinya bubu babanka|nganka balkajinda|baya dalngarri-bunga|ngayu kurriyala bijarrin}"
fi
target_text="${MOBTRANSLATE_PROBE_TARGET_TEXT:-ngayu binal bama}"
request_args=(
  --fail-with-body
  --silent
  --show-error
  --max-time 180
  --form "target=@${output_dir}/target.wav;type=audio/wav"
)
if [[ -n "${MOBTRANSLATE_ASR_TOKEN:-}" ]]; then
  request_args+=(--header "Authorization: Bearer ${MOBTRANSLATE_ASR_TOKEN}")
fi

for index in "${!context_texts[@]}"; do
  context_text="${context_texts[$index]}"
  context_file="context-$((index + 1))"
  curl \
    --fail \
    --silent \
    --show-error \
    --get \
    --data-urlencode "text=${context_text}" \
    --data-urlencode "lang=kuku_yalanji" \
    "$tts_base" \
    --output "${output_dir}/${context_file}.audio"
  ffmpeg -hide_banner -loglevel error -y \
    -i "${output_dir}/${context_file}.audio" \
    -ac 1 -ar 16000 -c:a pcm_s16le \
    "${output_dir}/${context_file}.wav"
  if [[ "$probe_mode" == "web" ]]; then
    request_args+=(
      --form "contextId=line-$((index + 1))"
      --form "contextAudio=@${output_dir}/${context_file}.wav;type=audio/wav"
    )
  else
    request_args+=(
      --form "context_audio=@${output_dir}/${context_file}.wav;type=audio/wav"
      --form "context_text=${context_text}"
    )
  fi
done

curl \
  --fail \
  --silent \
  --show-error \
  --get \
  --data-urlencode "text=${target_text}" \
  --data-urlencode "lang=kuku_yalanji" \
  "$tts_base" \
  --output "${output_dir}/target.audio"
ffmpeg -hide_banner -loglevel error -y \
  -i "${output_dir}/target.audio" \
  -ac 1 -ar 16000 -c:a pcm_s16le \
  "${output_dir}/target.wav"

printf '%s\n' "$target_text" > "${output_dir}/expected.txt"
curl "${request_args[@]}" \
  "$MOBTRANSLATE_ASR_ENDPOINT" \
  --output "${output_dir}/result.json"

if [[ "$probe_mode" == "web" ]] && jq -e '.status == "pending"' "${output_dir}/result.json" >/dev/null; then
  cp "${output_dir}/result.json" "${output_dir}/submission.json"
  poll_token="$(jq -r '.pollToken' "${output_dir}/result.json")"
  deadline=$((SECONDS + 600))
  while (( SECONDS < deadline )); do
    retry_ms="$(jq -r '.retryAfterMs // 3000' "${output_dir}/result.json")"
    sleep "$(( (retry_ms + 999) / 1000 ))"
    jq -n --arg pollToken "$poll_token" '{pollToken: $pollToken}' \
      > "${output_dir}/status-request.json"
    curl \
      --fail-with-body \
      --silent \
      --show-error \
      --max-time 45 \
      --header 'Content-Type: application/json' \
      --data-binary "@${output_dir}/status-request.json" \
      "${MOBTRANSLATE_ASR_ENDPOINT%/}/status" \
      --output "${output_dir}/result.next.json"
    mv "${output_dir}/result.next.json" "${output_dir}/result.json"
    if ! jq -e '.status == "pending"' "${output_dir}/result.json" >/dev/null; then
      break
    fi
  done
  if jq -e '.status == "pending"' "${output_dir}/result.json" >/dev/null; then
    echo "The asynchronous speech probe did not finish within ten minutes." >&2
    exit 1
  fi
fi
jq . "${output_dir}/result.json"
