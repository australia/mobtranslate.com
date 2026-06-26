# Giving Kuku Yalanji a Voice — How the MobTranslate TTS Works

*A technical report on synthesizing spoken Kuku Yalanji (and other Pama‑Nyungan
languages) from text, the linguistic reasoning behind it, and where it goes next.*

---

## TL;DR

There is no off‑the‑shelf text‑to‑speech model for Kuku Yalanji, and the speech
data needed to train one from scratch does not exist. So instead of training a
model, we **borrowed the voice of a related Aboriginal language** and taught our
pipeline to spell Kuku Yalanji *the way that model expects to read it*.

Concretely:

- **Base model:** Meta's **MMS‑TTS Pitjantjatjara** (`facebook/mms-tts-pjt`) — a
  pretrained neural voice for an Aboriginal Australian (Western Desert / Pama‑Nyungan)
  language.
- **Why it works:** Pitjantjatjara and Kuku Yalanji are both Pama‑Nyungan. They
  share the **three‑vowel system (a, i, u)** and Australian phonotactics, so a model
  trained on Pitjantjatjara already "knows how to move its mouth" for Kuku Yalanji.
- **The trick:** a thin **linguistic bridge** that converts Kuku Yalanji spelling
  (the Hershberger dictionary orthography) into Pitjantjatjara orthography *before*
  the model reads it, grounded in **Patz's reference grammar**. No model weights are
  changed — this is zero‑shot cross‑lingual transfer.
- **Result:** deterministic, cacheable, natural‑sounding Kuku Yalanji audio for any
  headword or sentence in the dictionary.

This is a **phonetic approximation, not a recording of a speaker.** It is a
scaffold to make the dictionary audible today; authentic native‑speaker audio comes
from the Recording Studio (see [§9](#9-authenticity-the-recording-studio-is-the-ground-truth)).

---

## 1. The problem

A dictionary you can only read is half a dictionary. Learners need to *hear* words —
especially in a language with sounds and stress patterns that English speakers guess
wrong. But:

- **No native model exists.** None of the big TTS providers ship a Kuku Yalanji voice.
- **No corpus to train one.** High‑quality neural TTS typically needs tens of hours
  of clean, transcribed single‑speaker audio. For Kuku Yalanji that simply isn't
  available, and producing it is a multi‑year community undertaking.
- **English voices are actively wrong.** Reading `ngayu` or `jalbu` with an English
  voice imposes English vowels, aspiration, and stress — it teaches the wrong
  pronunciation.

So the question became: *what is the closest thing to a Kuku Yalanji mouth that
already exists, and how do we feed it Kuku Yalanji correctly?*

---

## 2. The core idea: cross‑lingual transfer from a related language

A neural TTS model is, in effect, a learned map from a sequence of letters/phonemes
to an audio waveform, conditioned on the **phonology** of its training language. If
two languages share a phonology, a model trained on one can pronounce the other —
provided you present the input in the spelling system the model learned.

Kuku Yalanji's nearest readily available neighbour with a pretrained voice is
**Pitjantjatjara**, thanks to Meta's **MMS** project, which released TTS models for
1,000+ languages — including a number of Australian languages. Pitjantjatjara is:

- **Pama‑Nyungan** (the same language family as Kuku Yalanji),
- **three‑vowel** (a, i, u) — identical vowel inventory,
- **syllable‑timed** with Australian consonant phonotactics (retroflexes, the
  `ny`/`ng`/`j`/`y` series, no consonant clusters of the English kind).

That makes its MMS model dramatically better at Kuku Yalanji than any
Indo‑European voice — *if* we hand it Pitjantjatjara‑shaped spelling.

### The Malay → Pitjantjatjara migration

The first neural version of this pipeline used **`facebook/mms-tts-zlm` (Standard
Malay)** as the base. Malay is also syllable‑timed with unaspirated stops and
`ny`/`ng` digraphs, which already beat English. But Malay is **not** Pama‑Nyungan: it
has a five‑vowel system and its own stress placement, so it coloured the output with
Malay vowel quality and rhythm.

Switching the base to **Pitjantjatjara (`facebook/mms-tts-pjt`)** produced
*noticeably more natural* Kuku Yalanji audio, because the three‑vowel system and
stress behaviour now match. The before/after clips for this exact migration live in
[`packages/tts/out_compare/`](../../packages/tts/out_compare/) (`zlm_raw.*` vs.
`pjt_raw.*` / `pjt_mapped.*`). `facebook/mms-tts-pjt` is the engine's
`DEFAULT_MODEL` today.

> MMS‑TTS models are **VITS** architecture (a conditional VAE + adversarial training
> end‑to‑end TTS) and are loaded through Hugging Face `transformers` as `VitsModel`.

---

## 3. Architecture at a glance

```
 Kuku Yalanji text (Hershberger orthography)         e.g.  "ngayu kuku-yalanji bama"
          │
          ▼
 ┌────────────────────────────────────────────────┐
 │ lexicon.py   — optional per-word phonetic        │   recover Patz's allophony /
 │                override from the ontolex lexicon  │   assimilation / stress where
 │                (Patz grammar JSON-LD)             │   the lexicon records it
 └────────────────────────────────────────────────┘
          │
          ▼
 ┌────────────────────────────────────────────────┐
 │ orthography.py — normalize_for_pjt               │   Hershberger Yalanji → pjt
 │   • per-morpheme mapping (split on '-')          │   spelling, grounded in
 │   • Patz §2.5.2 word-final /y/ deletion          │   Patz §2.1 / Table 2.1 /
 │   • Patz §2.6.1 reduplication & compound juncture│   §2.5.2 / §2.6.1
 │   • English / proper nouns pass through verbatim │
 └────────────────────────────────────────────────┘
          │  (Pitjantjatjara-shaped text)
          ▼
 ┌────────────────────────────────────────────────┐
 │ synth.py — TTSEngine over MMS-TTS (VitsModel)    │   deterministic synthesis,
 │   facebook/mms-tts-pjt → waveform                │   two-layer cache, WAV/MP3
 └────────────────────────────────────────────────┘
          │
          ▼
 ┌────────────────────────────────────────────────┐
 │ server.py — FastAPI  POST /tts                   │   {text|ipa, model} → audio
 └────────────────────────────────────────────────┘
```

Package layout (`packages/tts/mobtranslate_tts/`):

| Module | Responsibility |
|---|---|
| `__init__.py` | Exposes `TTSEngine`, `DEFAULT_MODEL`. |
| `orthography.py` | The linguistic bridge: Yalanji → Pitjantjatjara spelling. |
| `lexicon.py` | Lexicon‑aware phonetic overrides from the grammar's JSON‑LD. |
| `synth.py` | Neural synthesis engine (MMS‑TTS / VITS) + caching. |
| `server.py` | FastAPI HTTP service (`POST /tts`). |

Python stack: `transformers`, `torch`, `safetensors`, `tokenizers`, `scipy`,
`numpy`, `fastapi`, `uvicorn`.

---

## 4. The linguistic bridge (`orthography.py`)

This is where most of the intelligence lives. The MMS Pitjantjatjara model expects
**Pitjantjatjara orthography**; our dictionary stores **Hershberger Kuku Yalanji
orthography**. They encode similar sounds with different letters, so we translate
before tokenization. Every rule is anchored in **Patz, *A Grammar of the Kuku Yalanji
Language of North Queensland*** (§2.1 phoneme inventory and Table 2.1 consonants).

The pipeline (`normalize_for_pjt`) processes **per morpheme**:

1. **Split** each whitespace‑delimited word on `-` into morphemes.
2. **Map** each morpheme that is wholly Kuku Yalanji letters from Hershberger spelling
   to Pitjantjatjara spelling (`yalanji_to_pjt`). Non‑letters (apostrophes,
   punctuation) pass through.
3. **English borrowings and proper nouns** (`Stormie`, `Cairns`, `Sunday`) pass
   through **verbatim** — they are not Yalanji phonology and must not be mangled.
4. **Patz §2.5.2 — word‑final /y/ deletion.** `badiy` ('cry') → `badi`; `karangajiy`
   ('sneak') → `karangaji`. But intervocalic `iy` is preserved: `miyil` stays `miyil`.
5. **Patz §2.6.1 — compounds are one phonological word.** Morpheme dashes are
   stripped by default (`compound_juncture = ""`) so the model reads a compound as a
   single run rather than two stressed words.

### Reduplication and stress

Reduplication (`XX`, e.g. `walbulwalbul`, `dakaldakal`) is pervasive in Kuku Yalanji.
By Patz §2.6.1 a reduplicated form carries **primary stress on the first half and
secondary stress on the first syllable of the second half**. Left alone, the model
treats the whole run as one long word with flat, monotone stress. So the bridge
**detects genuine reduplication** (each half ≥3 letters and vowel‑bearing, to avoid
splitting a simple word like `bama` into `ba`+`ma`) and inserts a **light boundary**
between the halves, and can optionally prepend apostrophe stress markers per word.
The A/B evidence for this is in [`packages/tts/stress_ab/`](../../packages/tts/stress_ab/)
(`*_stress_on.mp3` vs `*_stress_off.mp3` for disyllables, trisyllables, compounds,
inflected forms, and full sentences).

---

## 5. Lexicon‑aware overrides (`lexicon.py`)

Pure orthographic mapping captures the regular sound system, but Patz also documents
**allophony and assimilation** that plain spelling hides — e.g. a palatal offglide on
`/a u/` before laminal consonants, `/n/` → palatalized `[ɲ]` before `/j/`, and
specific stress placements.

`lexicon.py` loads an **ontolex JSON‑LD** dump extracted from Patz's grammar
(`experiments/pdftomd/extract/output/lexicon.jsonld`). Where an input word matches a
lexicon entry whose `phonetic` field encodes one of those finer details, we **override
the orthography** with the lexicon's form (after normalizing Patz's transcription
convention — `j` for the palatal stop, mixed with IPA — down to Hershberger‑compatible
spelling so the standard `yalanji_to_pjt` mapping still applies).

To avoid noise, the loader deliberately **filters out**:

- entries whose normalized phonetics equal the plain orthography (no new information),
- English loanwords (their IPA uses sounds outside Yalanji phonology),
- grammatical abbreviations, and
- `ProperNoun` entries (Patz's dialect/personal‑name transcriptions in the dump are
  inconsistent — e.g. *Yalanji* is mis‑transcribed with a palatal stop when the name
  actually starts with the glide `/j/`).

---

## 6. The synthesis engine (`synth.py`)

`TTSEngine` wraps the MMS‑TTS `VitsModel`:

- **Deterministic by default.** A fixed `DEFAULT_SEED` (via `torch.manual_seed`) means
  the same text always produces **byte‑identical audio**. This is what makes caching
  safe and reproducible.
- **Two‑layer cache.** Because the dictionary is a *finite* set of headwords, each
  word only ever needs to be synthesized once:
  - **L1** — in‑memory LRU (`OrderedDict`) for hot words.
  - **L2** — optional on‑disk cache (enable with the `TTS_CACHE_DIR` env var) that
    survives restarts, bounded by entry count with amortized mtime‑LRU eviction
    (`TTS_CACHE_MAX_ENTRIES`).
- **Output formats.** Raw waveform → 16‑bit PCM **WAV** (`scipy.io.wavfile`) or
  **MP3**, at the model's native sampling rate.
- **Observability.** Each synthesis logs `model`, `ipa`, `rate`, `seed`, `stress`,
  `juncture`, `redup`, and the raw vs. mapped token strings, so you can see exactly
  what the model was handed.

---

## 7. Serving it (`server.py`)

A small **FastAPI** service exposes `POST /tts` (`TTSRequest` → audio), with model
warmup on boot. This is the clean integration seam: any client (the Next.js app, a
batch pre‑renderer for the whole dictionary, a CLI) speaks plain HTTP.

---

## 8. What is deployed today

The neural MMS‑TTS Pitjantjatjara pipeline described above is now the **production
default**. [`apps/web/app/api/tts/route.ts`](../../apps/web/app/api/tts/route.ts):

- For neural‑supported languages (Kuku Yalanji), it calls the **MMS‑TTS service**
  (`facebook/mms-tts-pjt`) over HTTP at `TTS_SERVICE_URL` (the FastAPI engine from
  `packages/tts`), passing the Patz‑mapped (`pjt`‑shaped) text.
- It **synthesizes once and serves forever**: generated clips are written to disk
  (`MOBTRANSLATE_TTS_DIR`) and recorded in Postgres, so each headword is rendered a
  single time.
- If the service is unavailable or the language isn't neural‑supported, it **falls
  back to the Google donor voice (Indonesian, `id`)** so pronunciation never breaks.

So the two strategies now operate as primary + fallback rather than current vs.
future:

| | Primary (neural) | Fallback (donor) |
|---|---|---|
| Engine | Meta MMS‑TTS (VITS) | Google Translate TTS |
| Donor language | **Pitjantjatjara** (`mms-tts-pjt`) | Indonesian (`id`) |
| Donor family | **Pama‑Nyungan (same family)** | Austronesian (close‑ish) |
| Linguistic mapping | full Patz‑grounded Yalanji→pjt bridge | none (raw spelling) |
| Caching | synthesize‑once to disk + DB | per‑request, CDN cached |

> Infra note: the app has since migrated **off hosted Supabase onto self‑hosted
> Postgres** (Drizzle ORM, better‑auth, filesystem audio storage). The TTS data path
> and the contribution/voice‑readiness features run against that Postgres.

---

## 9. Authenticity: the Recording Studio is the ground truth

**None of this is a substitute for a Kuku Yalanji speaker.** Synthesized audio is a
phonetic approximation and the UI is required to flag it as needing community
verification. The authentic path runs in parallel:

- The **Recording Studio** (`/admin/recordings`) and the **speaker portal**
  (`/record/<token>`) let native speakers and invited community members record real
  pronunciations, organized by language and speaker, with a per‑speaker session flow.
- Those recordings (`recordings`, `speaker_profiles`) are the long‑term ground truth —
  both for direct playback and, eventually, as the **training/fine‑tuning corpus** that
  could replace cross‑lingual transfer with a true Kuku Yalanji voice.

Synthesis makes the dictionary audible **now**; recordings make it **authentic** over
time. The two are complementary, not competing.

---

## 10. How it was validated

- **Regression set** — [`packages/tts/regression/`](../../packages/tts/regression/):
  20 fixed clips spanning single words, inflected forms (`maral-angka`, `bama-ngka`,
  `manyarrda`), reduplication (`walbulwalbul`, `dakaldakal`, `kangkal-kangkal`),
  minimal pairs (`dudu`, `juju`, `ngandal`, `nyandal`), proper‑noun mixes, and full
  sentences. Determinism makes these meaningful as a true regression suite.
- **Stress A/B** — [`packages/tts/stress_ab/`](../../packages/tts/stress_ab/):
  stress‑on vs. stress‑off for each prosodic category.
- **Base/mapping comparisons** — [`packages/tts/out_compare/`](../../packages/tts/out_compare/):
  Malay vs. Pitjantjatjara, raw vs. mapped input, tier‑1/tier‑2 preprocessing, and
  comma/stress juncture variants.

---

## 11. Limitations & next steps

- **It is still a borrowed voice.** Pitjantjatjara phonology ≠ Kuku Yalanji phonology;
  some contrasts (certain retroflex/laminal details, fine vowel quality) are
  approximations, and the speaker identity/timbre is Pitjantjatjara.
- **Prosody is word‑level.** Sentence intonation is basic; we control stress and
  juncture but not full intonation contours (cf. Patz §2.6.2–2.6.3).
- **Lexicon coverage is partial** — overrides only fire where the JSON‑LD records the
  finer detail.
- **Roadmap:**
  1. Wire the FastAPI engine into the app behind the existing `/api/tts` contract and
     **pre‑render the whole dictionary** (finite headword set → synthesize once, cache
     forever).
  2. Expand the lexicon‑override coverage from the enriched `dictionary.yaml`
     (`phonemic` field) now that every headword carries a rule‑derived IPA.
  3. Collect speaker recordings at scale, then **fine‑tune** the MMS base on real Kuku
     Yalanji audio — the point where this stops being a donor voice and becomes a Kuku
     Yalanji voice.

---

## 12. Reproducing it

```bash
cd packages/tts
source .venv/bin/activate          # transformers, torch, scipy, fastapi, ...

# one-off synthesis via the engine
python -c "from mobtranslate_tts import TTSEngine; \
  open('out.wav','wb').write(TTSEngine().synthesize_wav_bytes('ngayu kuku-yalanji bama'))"

# or run the HTTP service
uvicorn mobtranslate_tts.server:app --port 8000
# POST /tts {"text": "ngayu kuku-yalanji bama"} -> audio

# regression / stress suites
pytest
```

Key knobs: `DEFAULT_MODEL` (`facebook/mms-tts-pjt`), `TTS_CACHE_DIR`,
`TTS_CACHE_MAX_ENTRIES`.

---

### One‑sentence summary

We gave Kuku Yalanji a voice by taking Meta's pretrained **Pitjantjatjara** neural TTS
model — a fellow Pama‑Nyungan Aboriginal language with the same three‑vowel system —
and building a **grammar‑grounded bridge that respells Kuku Yalanji the way that model
reads**, so an existing Aboriginal voice can speak a language it was never trained on,
while real speaker recordings are gathered to make it authentic over time.
