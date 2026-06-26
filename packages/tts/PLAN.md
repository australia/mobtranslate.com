# MobTranslate Neural TTS — Plan & Architecture

*Give every dictionary a real, native-family voice; store every generation;
grow toward per-language and per-speaker (elder) models.*

Status: **in build** (2026-06-26). Author: engineering. This supersedes the
Google-Translate Indonesian donor for Kuku Yalanji.

---

## 0. Where we are

- **Today (production):** `apps/web/app/api/tts/route.ts` reads Indigenous
  spelling with **Google Translate TTS, Indonesian donor voice** — a phonetic
  approximation, syllable-timed but Austronesian (5-vowel, wrong family).
- **What we want (and had, as a report/spec — code was lost in a disk
  consolidation):** Meta **MMS-TTS Pitjantjatjara** (`facebook/mms-tts-pjt`, a
  VITS model) — a real **Aboriginal, Pama-Nyungan** voice (same family, same
  3-vowel system as Kuku Yalanji) — driven through a **grammar-grounded
  orthography bridge** (Hershberger Yalanji → Pitjantjatjara spelling, per Patz's
  reference grammar). This sounds markedly more natural than the donor.
- **Salvaged assets:** the Patz grammar lexicon (`output/lexicon.jsonld`, 25k
  lines) for phonetic overrides; the dictionary's per-word `phonemic` IPA (now in
  the DB, 2,679/2,688 Yalanji words); the `recordings`/`speaker_profiles` tables
  (the authentic ground truth + future training corpus).

We are **rebuilding the neural pipeline from the spec** and deploying it as a
service, then making it the Kuku Yalanji default, storing all generations, and
laying the rails for per-language and per-speaker voices.

---

## 1. Principles (non-negotiable)

1. **Synthesis is a scaffold, never the truth.** Generated audio is a phonetic
   approximation and the UI must always flag it; **real speaker recordings are
   the ground truth** and always win when present. (A word with a community
   recording should prefer it over TTS.)
2. **Same-family donor + explicit phonology beats a fancier wrong-family voice.**
   Pitjantjatjara (Pama-Nyungan) over Indonesian (Austronesian).
3. **Determinism + store-everything.** Seeded synthesis → byte-identical audio →
   every generation is cached and **persisted** (filesystem + a provenance row),
   so the finite dictionary is synthesized once and served forever, and we have a
   full audit of what the model said.
4. **Per-language from day one in the architecture.** A registry maps each
   dictionary language → its best available MMS model + bridge. Adding a language
   is a config + (optional) bridge, not a rewrite.
5. **CARE / community governance.** Voices are borrowed until a community licenses
   a real one. Per-speaker models require **explicit, revocable consent** from the
   speaker (esp. elders); a speaker can withdraw their voice and its model.

---

## 2. Architecture

```
 Browser SpeakButton ──► Next /api/tts ──┐
                                          │  (kuku_yalanji → neural; others → donor)
                                          ▼
                          ┌───────────────────────────────┐
                          │  mobtranslate-tts.service       │  FastAPI, :7820
                          │  POST /tts {text, lang, ...}    │
                          │   1. registry: lang → model+bridge
                          │   2. bridge:   Yalanji → pjt spelling (Patz)
                          │   3. lexicon:  per-word phonetic overrides
                          │   4. synth:    MMS VitsModel (seeded) → WAV
                          │   5. cache:    L1 mem + L2 disk
                          └───────────────────────────────┘
                                          │ audio bytes + meta
                                          ▼
        Next stores generation:  box FS (/mnt/donto-data/mobtranslate-storage/tts/<lang>/<hash>.mp3)
                                  + DB row tts_generations (provenance, served URL)
                                          │
                                          ▼
                          serve same-origin /api/storage/tts/... (cache-immutable)
```

- **The service is standalone Python** (torch/transformers), decoupled from the
  Next build — it can be developed and run regardless of app deploys.
- **The Next route owns storage + fallback**, so the app never hard-depends on the
  TTS service being up (donor fallback on error/timeout).

---

## 3. Components to build

### 3.1 The TTS service — `packages/tts/mobtranslate_tts/`
- `registry.py` — **language → { model, bridge }** map. v1: `kuku_yalanji`/`zku`
  → `facebook/mms-tts-pjt` + `yalanji` bridge. Others → no neural (donor
  fallback) until a model+bridge is added.
- `orthography.py` — the **Yalanji → Pitjantjatjara bridge**, rebuilt from Patz:
  per-morpheme mapping (Table 2.1 / §2.1), §2.5.2 word-final /y/ deletion,
  §2.6.1 reduplication boundary + compound juncture, English/proper-noun
  pass-through.
- `lexicon.py` — load `output/lexicon.jsonld`; override orthography where Patz
  records finer allophony/stress; filter noise (loanwords, abbrevs, proper nouns,
  no-op entries).
- `synth.py` — `TTSEngine` over `VitsModel`: deterministic seed, L1 LRU + L2 disk
  cache, WAV/MP3 out, structured logging (raw vs mapped tokens, seed, model).
- `server.py` — **FastAPI** `POST /tts` (`{text, lang, format}` → audio) + model
  warmup + `/health`. Bind 127.0.0.1:7820.
- venv at `packages/tts/.venv` (gitignored), `requirements.txt` pinned.

### 3.2 Service deployment
- **systemd `mobtranslate-tts.service`** (uvicorn, auto-restart, env file).
- Health-checked; model preloaded on boot.

### 3.3 App integration — `apps/web`
- `/api/tts/route.ts`: if `lang ∈ {kuku_yalanji, zku}` → POST the TTS service,
  **store** the result, serve it; else (or on error/timeout) → existing Google
  donor. Keep the immutable browser/CDN cache.
- **Storage** like recordings: `/mnt/donto-data/mobtranslate-storage/tts/<lang>/<sha>.mp3`,
  served via a `/api/storage/tts/[...]` route (or reuse the recordings storage
  route generalized).
- **DB:** `tts_generations` table — `(id, language_code, text, normalized_input,
  model, engine, storage_path, url, duration_ms, sample_rate, seed, created_at)`,
  unique on `(language_code, text, model)` so each is stored once. This is the
  "save and store all generations" requirement + a provenance/audit trail.

### 3.4 Pre-render the dictionary
- A background script that walks every Kuku Yalanji **headword + usage example**,
  calls the service, and stores the generation — so the whole dictionary is
  audible instantly with zero per-request latency. Finite set → synthesize once.
- Re-runnable; skips already-stored; logs coverage.

---

## 4. Per-language models (roadmap, architected now)

- The **registry** is the seam. Each dictionary language gets an entry mapping to
  the best available MMS model (Meta MMS shipped 1,100+ languages incl. several
  Australian ones) + an orthography bridge to that model's training language.
- **Process to add a language:** (1) pick the closest same-family MMS donor;
  (2) write/borrow a thin orthography bridge; (3) A/B against the current donor;
  (4) flip the registry. No app changes.
- Candidate next: evaluate MMS coverage for Wajarri / Mi'gmaq / Anindilyakwa and
  map each to its best donor (or keep the Google donor where MMS has nothing
  close).

## 5. Per-speaker (elder) voices (roadmap)

- **Corpus = the Recording Studio.** As named speakers (esp. elders) record words
  and example sentences (now recordable per-word AND per-example), their
  `recordings` accumulate into a per-speaker, transcribed, single-voice corpus —
  exactly what TTS fine-tuning needs.
- **Path:** once a speaker has enough clean audio (target: a few hours), **fine-tune
  the MMS base on that speaker** → a model that *is* their voice. Store it in the
  registry keyed by `speaker_id`; let the dictionary play "in Aunty X's voice."
- **Consent & control (CARE):** a per-speaker model is created only with explicit,
  written, **revocable** consent; the speaker (or family) can withdraw the voice
  and delete the model and its training audio. Models are community-owned.
- **Data hygiene:** the studio already captures lossless WAV masters + speaker
  metadata (community, dialect) — the right shape for training. We add a
  consent + training-eligibility flag to `speaker_profiles`.

---

## 6. What I'm adding that the original spec missed

1. **Persist every generation** (not just an LRU/disk cache) in a DB-backed,
   served, audited store — the user's explicit ask, and the basis for analytics +
   never-resynthesize.
2. **Recording-wins precedence:** the SpeakButton / word page should play a
   **community recording when one exists**, and only fall back to TTS otherwise —
   tying the two systems together so authentic audio supplants synthesis
   automatically as it's collected.
3. **Graceful degradation:** the app keeps the Google donor as an always-available
   fallback so a TTS-service outage never breaks pronunciation.
4. **Per-language registry + per-speaker keying** as first-class, so the roadmap is
   a config change, not a rewrite.
5. **Governance fields** (consent, revocation) for per-speaker voices.
6. **Pre-render job** so the finite dictionary is instant and offline-cacheable.
7. **Observability:** every generation logs the exact mapped input + model + seed.

---

## 7. Build order (this session)

1. ✅ Plan (this doc).
2. **TTS service:** venv + torch + `facebook/mms-tts-pjt`; rebuild bridge +
   lexicon + synth + FastAPI; verify a Yalanji phrase sounds right; systemd.
3. **Wire + store:** `/api/tts` neural-for-Yalanji + storage + `tts_generations`
   + recording-wins precedence; deploy.
4. **Pre-render** the Kuku Yalanji dictionary.
5. Roadmap items (per-language eval, per-speaker consent scaffolding) staged.

---

*Synthesis makes the dictionary audible now; recordings make it authentic over
time; per-speaker models, with consent, make it personal. The architecture treats
the borrowed voice as a temporary scaffold and every real recording as a step
toward replacing it.*
