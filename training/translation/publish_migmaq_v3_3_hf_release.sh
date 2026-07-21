#!/usr/bin/env bash
set -euo pipefail

RELEASE_DIR="${1:-/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/releases/mobtranslate-migmaq-listuguj-v3.3-hf-20260721}"
PYTHON_BIN="${PYTHON_BIN:-/tmp/migmaq-release-venv-20260721/bin/python}"
CODE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLICATION_REPORT="$RELEASE_DIR/hugging-face-publication.json"

BASE_REPO="ajaxdavis/mobtranslate-migmaq-listuguj-v1-base"
MODEL_REPO="ajaxdavis/mobtranslate-migmaq-listuguj-v3-3"
DATASET_REPO="ajaxdavis/mobtranslate-migmaq-listuguj-v3-3-data"

"$PYTHON_BIN" - <<'PY'
from huggingface_hub import HfApi

identity = HfApi().whoami()
name = identity.get("name") or identity.get("fullname")
if name != "ajaxdavis":
    raise SystemExit(f"Expected Hugging Face account ajaxdavis, found {name!r}")
print(f"Authenticated as {name}")
PY

jq -e '
  .deployment.research_hugging_face_publication == true and
  .deployment.homepage_sentence_routing == false and
  .deployment.production_api == false and
  .merged_model_published == false
' "$RELEASE_DIR/release-manifest.json" >/dev/null
jq -e '.passed == true and .checks.load_smoke.passed == true' \
  "$RELEASE_DIR/model-repo/evaluation/staged-adapter-load-smoke.json" >/dev/null

for directory in "$RELEASE_DIR" "$RELEASE_DIR/base-repo" "$RELEASE_DIR/model-repo" "$RELEASE_DIR/dataset-repo"; do
  [[ -f "$directory/SHA256SUMS" ]] || {
    printf 'Missing checksum manifest: %s\n' "$directory/SHA256SUMS" >&2
    exit 2
  }
  (cd "$directory" && sha256sum -c SHA256SUMS)
done

hf repos create "$BASE_REPO" --repo-type model --public --exist-ok
hf repos create "$MODEL_REPO" --repo-type model --public --exist-ok
hf repos create "$DATASET_REPO" --repo-type dataset --public --exist-ok

export HF_XET_HIGH_PERFORMANCE=1
hf upload "$BASE_REPO" "$RELEASE_DIR/base-repo" . \
  --repo-type model \
  --commit-message "Publish immutable Mi'kmaq Listuguj v1 adapter base"
hf upload "$MODEL_REPO" "$RELEASE_DIR/model-repo" . \
  --repo-type model \
  --commit-message "Publish evaluated Mi'kmaq Listuguj v3.3 LoRA"
hf upload "$DATASET_REPO" "$RELEASE_DIR/dataset-repo" . \
  --repo-type dataset \
  --commit-message "Publish Mi'kmaq Listuguj v3.3 research data"

"$PYTHON_BIN" "$CODE_DIR/verify_migmaq_hf_publication.py" \
  --release-dir "$RELEASE_DIR" \
  --output-json "$PUBLICATION_REPORT" \
  --expected-user ajaxdavis \
  --create-tags

sha256sum "$PUBLICATION_REPORT" > "$PUBLICATION_REPORT.sha256"
printf 'Verified Hugging Face publication: %s\n' "$PUBLICATION_REPORT"
