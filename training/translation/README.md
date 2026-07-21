# MobTranslate Translation Training

This folder is the RunPod-ready training harness for Kuku Yalanji translation models.

## Current Program State: v21.2 Weights, Guarded Decoder

The current product-generation label is **Kuku Yalanji translation model v2 candidate**. The candidate of record is
`v21.2-claude-balanced-replay-gvn-3epoch-lr2e-5`; `v21.1-codex-synthetic-direct-gvn-3epoch-lr2e-5` is retained as
the synthetic-only ablation. The independent, checksum-audited comparison found synthetic parity while v21.2
recovered 12.74 corpus chrF on dictionary usage and about 15 chrF on both Bible controls.

The preregistered v22.0 step-matched continuation stopped the same trajectory at optimizer step 3,120. It failed
its model-promotion gate: greedy tagged-test repetition remained 37 rows, above the frozen maximum of 25. The v22
checkpoint is archived as negative evidence and is not a public model release. A separately frozen transfer test
then applied the decoder selected only on v22 development data to the exact published v21.2 weights. That test
passed all 14 gates. The serving recipe of record is now:

```text
num_beams=1
no_repeat_ngram_size=4
repetition_penalty=1.10
length_penalty=1.0
```

On the unchanged v21.2 model, tagged-test chrF rose from 53.8374 to 55.7097 and rows with a segment repeated at
least ten times fell from 37 to 2. The untagged score rose from 53.8142 to 55.7278 with 2 such rows. Bible controls
changed by less than 0.08 chrF, and the elder diagnostic remained effectively unchanged. This is an inference
policy improvement, not a new trained model or evidence of speaker certification. See
`/docs/kuku-v22-experiment.html` for the full preregistration, negative result, paired statistics, and archive.

The result remains research-only. Both models score 0/43 exact on the elder sentence-pair control, under-translate
natural multi-clause material, and exhibit unresolved degeneration failures. v21.2 remains downloadable for
reproduction but is not authorized to back a sentence route. Exact approved resources remain lookup-first.

The later v23 three-seed attested-narrative adaptation also failed. Its held-out natural-test corpus chrF++ delta
was +0.6414 against a preregistered +1.0 floor, the paired interval crossed zero, untagged repetition worsened, and
closed-set lexical reconstruction was 46/297. Its weights were deleted after compact evidence was verified; the
negative result is registered and documented at `/docs/kuku-v23-attested-adaptation.html`.

Read the current handoff before starting another RunPod job:

```text
/mnt/donto-data/donto-resources/research/translation-training/
kuku-yalanji-runpod-2026-06-30/docs/
KUKU-YALANJI-V2-MODEL-TRAINING-HANDOFF-2026-07-10.md
```

Every candidate should now run through the sealed version benchmark before any checkpoint is downloaded or
published. The portable kit freezes 297 isolated dictionary-headword prompts and 43 rights-cleared elder sentence
pairs, verifies all behavior-affecting files and runtime settings, requires a real CUDA run, rejects empty output,
compares every prediction with frozen baselines, measures resources, and seals its own output checksums.

The exact A40 reproduction on 2026-07-14 evaluated steps 2,770, 3,120, and 4,155 twice. All 1,020 predictions in
the final GPU run matched the local baselines, and all 1,020 matched the independent A40 run. The linguistic ruling
therefore remains unchanged: step 4,155 leads the lexical probe at 48/297, step 3,120 remains a rejected 43/297,
and all three checkpoints remain 0/43 exact on elder sentences. Read the living protocol at
`/docs/kuku-runpod-evaluation-loop.html`.

The 297-prompt rule is now explicitly the **model lexical-reconstruction gate**. It is a conservative acceptance
rule on that frozen constructed benchmark, not a population estimate, and it cannot authorize sentence generation.
Every sentence service also requires an independent model-bound `model_sentence_generation` gate. All current Kuku
models are `FAIL` on both model gates.

For v24, use a positive `--max-steps` value frozen in the preregistration rather than relying on epoch count. The
trainer fails when the observed optimizer step differs from the exact horizon and records actual examples plus
post-truncation source, target, and total non-padding tokens consumed by declared task. `--stop-after-steps` remains
available only for an exact intermediate stop within a separately frozen learning-rate horizon.

On a matching RunPod image with the three model directories already present:

```bash
tar -xzf kuku-yalanji-runpod-evaluation-kit-v1.tar.gz
cd runpod-evaluation-kit-v1
bash bootstrap_and_run.sh \
  /workspace/models/v21.2-step2770/merged \
  /workspace/models/v22-step3120/merged \
  /workspace/models/v21.2-step4155/merged \
  kuku-candidate-a40-$(date -u +%Y%m%dT%H%M%SZ)
```

With weights already on the pod, a single new checkpoint takes roughly one to two minutes to score. Download the
small sealed result first; only download or publish multi-gigabyte weights after the candidate clears the frozen
linguistic and safety gates. The public kit and completed A40 result bundle are versioned model-registry artifacts.

The locked v21 entry points are:

```text
build_v21_1_codex_synthetic_direct.py
run_v21_1_codex_synthetic_direct.sh
build_v21_2_claude_balanced_replay.py
run_v21_2_claude_balanced_replay.sh
analyze_v21_predictions.py
compare_v21_models.py
run_v22_step_matched_replay_3120.sh
select_v22_decoding.py
verify_v22_promotion.py
run_v21_2_decoder_transfer.sh
verify_v21_2_decoder_transfer.py
compare_v21_2_decoder_transfer.py
evaluate_nllb_lora.py
verify_kuku_benchmark_inputs.py
analyze_kuku_version_probe.py
compare_kuku_benchmark_runs.py
measure_command.py
bootstrap_kuku_version_benchmark.sh
run_kuku_version_benchmark.sh
```

The older instructions below remain as the historical bootstrap and baseline path. They are not the current v2
experiment contract.

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

## Translate v2 Research Surface

The public route `/translate/v2` is a model research and evaluation surface. No custom endpoint is currently
configured, so it must return an honest `not_configured`/503 state rather than generate a sentence. The detailed
model-selection and evaluation bench remains available at the versioned route:

```text
/translate/v2/kuku-yalanji-nllb-lora/v21.2-claude-balanced-replay-v2-candidate
```

Both surfaces send requests through `/api/translate/v2`. The Next.js process does not load safetensors itself; it
proxies to the local model server through:

```bash
MOBTRANSLATE_TRANSLATE_V2_ENDPOINT=http://127.0.0.1:7955/translate
```

For an ad hoc RunPod or development session, start a merged model server with:

```bash
source /workspace/venvs/mobtranslate-mt/bin/activate
python training/translation/serve_v2_infer.py \
  --model-dir /workspace/models/v21.2-claude-balanced-replay-gvn-3epoch-lr2e-5/merged \
  --model-id v21.2-claude-balanced-replay \
  --host 127.0.0.1 \
  --port 7955 \
  --num-beams 1 --no-repeat-ngram-size 4 \
  --repetition-penalty 1.10 --length-penalty 1
```

Health check:

```bash
curl http://127.0.0.1:7955/health
```

Direct translation check:

```bash
curl -s http://127.0.0.1:7955/translate \
  -H 'content-type: application/json' \
  -d '{"text":"One day it came time for Kubirri to leave."}'
```

The checked-in systemd units include independent lexical and sentence preflights. Installing them does not
authorize or start a model:

```bash
sudo install -D -m 0644 ops/systemd/kuku-v2-infer.service \
  /etc/systemd/system/kuku-v2-infer.service
sudo install -D -m 0644 ops/systemd/kuku-v2-infer.service.d/10-dictionary-cpu-gate.conf \
  /etc/systemd/system/kuku-v2-infer.service.d/10-dictionary-cpu-gate.conf
sudo install -D -m 0644 ops/systemd/kuku-v2-infer.service.d/20-sentence-generation-gate.conf \
  /etc/systemd/system/kuku-v2-infer.service.d/20-sentence-generation-gate.conf
sudo install -D -m 0644 ops/gates/kuku-v21.2-sentence-generation-gate.json \
  /etc/mobtranslate/kuku-v21.2-sentence-generation-gate.json
sudo install -D -m 0644 ops/systemd/mobtranslate-web-translate-v2.conf \
  /etc/systemd/system/mobtranslate-web.service.d/translate-v2.conf
sudo systemctl daemon-reload
sudo systemctl disable --now kuku-v2-infer.service
```

The service definition binds only to `127.0.0.1:7955`, runs a merged checkpoint in CPU float32 mode, and serializes
inference so concurrent callers receive a retryable HTTP 429 instead of competing for model memory. Its systemd
readiness gate does not declare the service active until `/health` succeeds.
Before that load is attempted, both model-bound preflights must independently return `allowed: true`; a lexical
PASS alone is insufficient.

**Current operational state (2026-07-15):** custom Kuku Yalanji and Mi'gmaq CPU inference is intentionally unloaded.
Both units are stopped and disabled, the web unit no longer wants or starts them, and all custom-model endpoint
environment variables are blank. The downloadable model records and evaluation artifacts remain public. The
homepage translator continues independently through `/api/translate/[language]`, which injects the selected full
dictionary into a `gpt-5.4-mini` prompt and labels its output as dictionary-guided AI requiring qualified
fluent-speaker review. Do not re-enable CPU inference until a stronger RunPod Kuku Yalanji candidate clears the applicable
lexical or sentence gate, rights record, and release scope. Sentence generation additionally requires multi-cluster
natural evidence and fluent-speaker review.

When no endpoint is configured, the versioned model bench should show an honest setup state instead of pretending
translation succeeded.

## Public Dataset Release

The complete v2 corpus release is generated from the canonical mounted-drive sources by:

```bash
cd /mnt/donto-data/workspace/mobtranslate.com/apps/web
pnpm exec tsx scripts/build-kuku-yalanji-public-dataset.ts \
  --released-at 2026-07-11T06:45:00Z
```

The builder writes only under the program root's `public-datasets/` directory. It exports CSV, JSONL, YAML, and
SQLite views; copies governed splits, audits, documentation, process logs, and literal-authorship scripts; creates
deterministic ZIP and tar.gz archives; and writes SHA-256 manifests. It refuses to overwrite a versioned release
and fails unless the database, foreign keys, 20,047-row corpus digest, dictionary hash, and split totals reconcile.

Caddy serves the narrow directory at `/datasets/`; the reproducible route snippet is
`ops/caddy/mobtranslate-datasets.caddy`. The research workbench reads `public-datasets/index.json` through the
read-only research API and exposes the release under its Downloads view.

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
