# MobTranslate Translation Training

This folder is the RunPod-ready training harness for Kuku Yalanji translation models.

The first supported run is a conservative NLLB-200 distilled 600M LoRA fine-tune on the approved eBible Kuku Yalanji parallel corpus. The dataset export lives outside the repo on the data disk:

`/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30/datasets/kuku_yalanji_ebible_parallel_v0.1.0`

## Local Export

From the repo root:

```bash
cd /mnt/donto-data/workspace/mobtranslate.com/apps/web
pnpm tsx scripts/export-translation-training-dataset.ts
```

The exporter reads `parallel_corpus_pairs` and emits deterministic train/validation/test JSONL splits grouped by Bible reference. It exports both `eng-gvn` and `gvn-eng`, but the first model run should train `eng-gvn`.

## RunPod Setup

Recommended first GPU: A40 48 GB, RTX A6000 48 GB, RTX 6000 Ada 48 GB, L40S 48 GB, or A100 80 GB. A 24 GB GPU may work with smaller batch size, but the larger cards make the first run less fragile.

On a RunPod PyTorch pod with a network volume mounted at `/workspace`:

```bash
cd /workspace
git clone https://github.com/thomasdavis/mobtranslate.com.git mobtranslate.com
cd /workspace/mobtranslate.com/training/translation
bash runpod-bootstrap.sh
```

Copy or sync the dataset directory to:

`/workspace/data/kuku_yalanji_ebible_parallel_v0.1.0`

Also copy the smoke dataset to:

`/workspace/data/kuku_yalanji_ebible_parallel_smoke_v0.1.0`

## Smoke Run First

Run this before spending on a real model:

```bash
source /workspace/venvs/mobtranslate-mt/bin/activate
bash run_smoke_eng_gvn.sh
```

The smoke run uses 256 train rows and one epoch. It is not supposed to produce a useful translator; it proves CUDA, dependency install, `gvn_Latn` token handling, LoRA training, merge, manifest generation, and decoding.

## Pilot Run

After smoke passes, run the capped mini-pilot on the real high-confidence dataset:

```bash
source /workspace/venvs/mobtranslate-mt/bin/activate
bash run_mini_pilot_eng_gvn.sh
```

This uses 2,048 train rows, 128 validation rows, and 128 test rows. It is the current budget-safe default for proving the model project without paying for the full baseline.

After the mini-pilot looks healthy, run a 2-epoch pilot on the full high-confidence dataset:

```bash
source /workspace/venvs/mobtranslate-mt/bin/activate
bash run_pilot_eng_gvn.sh
```

This is the first run that can produce useful metric movement. Treat it as a budget check and training-curve check, not the final publishable model.

## First Baseline Run

After the pilot looks healthy, train English to Kuku Yalanji on the high-confidence dataset:

```bash
source /workspace/venvs/mobtranslate-mt/bin/activate
bash run_baseline_eng_gvn.sh
```

The script trains, merges, and evaluates the model. The lower-level commands are in `run_baseline_eng_gvn.sh`.

## Translate v2 Test Bench

The web app route `/translate/v2` is the model test bench. It reads `apps/web/public/models/registry.json`, lets you choose a registered model version, and sends translation requests to `/api/translate/v2`.

The Next.js API does not load safetensors itself. It proxies to a small model server through:

```bash
MOBTRANSLATE_TRANSLATE_V2_ENDPOINT=http://127.0.0.1:8765/translate
```

Start a merged model server with:

```bash
source /workspace/venvs/mobtranslate-mt/bin/activate
python training/translation/serve_nllb_lora.py \
  --model-dir /workspace/models/kuku-yalanji-nllb-lora/mini-pilot-v0.1.0/merged \
  --host 0.0.0.0 \
  --port 8765
```

Health check:

```bash
curl http://127.0.0.1:8765/health
```

Direct translation check:

```bash
curl -s http://127.0.0.1:8765/translate \
  -H 'content-type: application/json' \
  -d '{"text":"God made the water.","sourceLang":"eng_Latn","targetLang":"gvn_Latn","numBeams":4,"maxNewTokens":192}'
```

When no endpoint is configured, `/translate/v2` should show an honest setup state instead of pretending translation succeeded.

## Budget Guardrails

- Stop the pod when the script exits. Network volumes persist; running pods keep billing.
- Start with A40 or RTX A6000 before paying A100/H100 prices.
- Keep the first smoke run under one hour including setup. If dependency install or model download eats the hour, stop and reuse the same volume for the next attempt.
- Publish only after a baseline run writes `model_manifest.json`, `merged/`, and `test_predictions.json`.

## Publishing

Each trained run must publish:

- `model_manifest.json`
- `adapter/`
- `merged/`
- `test_predictions.json`
- a model card with dataset version, rights status, metrics, base model, and intended use

The public web page reads `apps/web/public/models/registry.json`. Add a release there only after the artifact exists and has a stable download URL.
