# Voice-Model Readiness — research & scoring model

*What it actually takes to train a text-to-speech voice on one person's own voice,
and how the "My contributions → voice readiness" page scores progress against it.*

This document is the research backing for the readiness breakdown at
`/contributions/[language]`. The scoring lives in
[`apps/web/lib/voice/readiness.ts`](../../apps/web/lib/voice/readiness.ts).

---

## 1. The approach we're scoring against

We do **not** train a voice from scratch — that needs tens of hours of studio audio.
A personal voice is made by **fine-tuning an existing neural TTS model** on a single
speaker's clean, transcribed recordings. This project's pipeline already uses Meta's
**MMS-TTS** (VITS architecture) with a related Aboriginal language as the base (see
[ABORIGINAL-VOICE-REPORT.md](./ABORIGINAL-VOICE-REPORT.md)), so the realistic path to a
contributor's own voice is **single-speaker fine-tuning (or LoRA adaptation) of that
base** on their recordings.

The thresholds below are for *that* scenario: adapting a strong multilingual base, not
training from zero.

## 2. How much audio is enough?

The research converges on a wide-but-usable range — data **quality and coverage**
matter as much as raw minutes.

| Stage | Audio | ~Utterances | What you get |
|---|---|---|---|
| Voice clone (zero-shot) | 30 s – 2 min | 1–10 | Speaker timbre via adaptation; lowest fidelity. |
| Minimum fine-tune (LoRA) | ~20 min | ~80–150 | Recognizably the speaker, with artefacts. LoRA avoids overfitting under ~1 hr. |
| **Good (our headline target)** | **~1 hr** | **~300** | Solid, usable everyday quality. |
| High quality | ~2–5 hr | ~800 | Natural; hard to distinguish in most contexts. |
| Full phonetic coverage | ~5 hr | ~1500 | Enough to synthesize arbitrary text; beyond this the base model, not the data, is the bottleneck. |

Key supporting points from the literature:

- VITS/MMS fine-tuning is **data-efficient**: usable results from as little as
  **20 minutes / 80–150 samples**; with **< 1 hour**, LoRA-style adaptation is
  recommended to avoid overfitting.
- **2–5 hours** of clean single-speaker audio yields output difficult to distinguish
  from the target voice; **beyond ~5 hours there are diminishing returns** for
  single-speaker fine-tuning.
- **~5 hours** is the rough point of full **phonetic coverage** for arbitrary text;
  below it, some sounds are under-represented.

## 3. What matters besides minutes

A readiness score that only counted minutes would be misleading. The page scores six
dimensions:

1. **Audio quantity** (weight 0.34) — total clean duration vs. the 1-hour good-quality
   target. The dominant axis.
2. **Phonetic coverage** (0.24) — how many of the language's phonemes appear in the
   words the contributor has recorded. Computed from the dictionary's rule-derived
   `phonemic` (IPA) field against the language's phoneme inventory (from the reference
   grammar). A voice can't reliably produce sounds it never heard the speaker make.
3. **Connected speech** (0.16) — amount of **sentence** audio. Isolated words don't
   teach prosody/intonation; ~10 minutes of sentences is the soft target.
4. **Audio quality** (0.16) — clipping rate and sample rate (≥ 16 kHz). Clipped or
   low-rate audio degrades a fine-tune disproportionately.
5. **Speaker & format consistency** (0.10) — a single speaker profile and a single
   recording format/device per language make a clean training set.
6. **Transcripts** — every clip carries its text (`label`), which is required for
   fine-tuning; gloss coverage is surfaced as documentation quality.

The **overall score** is the weighted sum, expressed as progress toward the
good-quality target. Milestone tiers (clone → minimum → good → high → full) are shown
separately, keyed off total duration, so a contributor sees both "how good" and "what
stage."

## 4. Data sources

- **Recordings & metrics:** `recordings` joined via `speaker_profiles.user_id =
  auth.uid()` (status `active`). Aggregated by the SECURITY DEFINER functions
  `auth_contribution_summary()` and `auth_voice_readiness(language_id)`
  (migration `20260624000000_user_contribution_stats.sql`). Quality signals come from
  `duration_ms`, `clipped`, `sample_rate`, `kind` (word/phrase/sentence), and the
  speaker profile count.
- **Phoneme inventory & word IPA:** the `phonemic` column on `words` (from the
  dictionary-enrichment pass) and the per-language inventory in `readiness.ts`
  (currently Kuku Yalanji: `b d ɟ ɡ m n ɲ ŋ l r ɻ w j a i u`).

## 5. Honest limitations

- Thresholds are **guidelines**, not guarantees — exact needs vary with the base
  model, the speaker, recording conditions, and the fine-tuning method.
- Coverage is **word-level phonemic**; it doesn't yet weight phoneme *frequency* or
  contextual (co-articulatory) coverage.
- A personal/community voice model would only ever be **trained and used with the
  contributor's and community's explicit consent**. The page frames synthesis as a
  tool that complements, never replaces, a living speaker.

## 6. Sources

- [Unsloth — Text-to-Speech (TTS) Fine-tuning Guide](https://unsloth.ai/docs/basics/text-to-speech-tts-fine-tuning)
- [ylacombe/finetune-hf-vits — Finetune VITS and MMS (HuggingFace)](https://github.com/ylacombe/finetune-hf-vits)
- [Adapting TTS models for New Speakers using Transfer Learning (arXiv:2110.05798)](https://arxiv.org/pdf/2110.05798)
- [AdaVITS: Tiny VITS for Low Computing Resource Speaker Adaptation (arXiv:2206.00208)](https://arxiv.org/pdf/2206.00208)
- [coqui-ai/TTS — single vs. multi-speaker data discussion](https://github.com/coqui-ai/TTS/discussions/2935)
- [The Vocal Market — how much vocal data to train a voice model](https://thevocalmarket.com/blogs/enterprise/how-much-vocal-data-to-train-voice-model)
