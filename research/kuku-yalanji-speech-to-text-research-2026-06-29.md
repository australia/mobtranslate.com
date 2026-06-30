# Speech-to-text for Kuku Yalanji — a research report

*MobTranslate · 2026-06-29*

## TL;DR

You are closer to a working Kuku Yalanji speech-to-text (ASR) system than it looks, because **the MobTranslate recording studio is already producing the exact thing ASR training needs: short audio clips each paired with the text that was said** (a word or a sentence), plus a ~2,700-entry dictionary that doubles as a pronunciation lexicon. The recommended path is:

1. **Don't train from scratch.** Fine-tune a *multilingual self-supervised* base model — **Meta MMS** (adapter-based, built for 1,000+ low-resource languages) or **Whisper-large-v3 with LoRA** — on the clips you've collected. Targeted fine-tuning of these bases reaches usable accuracy (WER ~12–45%) from a few hours of audio, where zero-shot is 48–90%+.
2. **Use forced alignment (Montreal Forced Aligner) with the dictionary as a pronunciation lexicon** to turn longer recordings + transcripts into clean, segmented training data, and to get word-level timestamps the app can use.
3. **Close the loop in the app you already have:** the model auto-suggests a transcription, the speaker/keeper confirms or corrects it (you already built a corrections + recording-worklist UX), and every confirmation becomes a new labelled example. ASR quality then compounds with usage.
4. For a turnkey, linguist-friendly on-ramp, **Elpis** (built by the Australian CoEDL specifically for Indigenous-language ASR) lets the community train and run models without ML engineering.

The rest of this report explains why, what data you need, the technique trade-offs, evaluation, an architecture that fits MobTranslate, a phased roadmap, and the governance that has to wrap all of it.

---

## 1. The goal and why it's hard

**Goal.** Given Kuku Yalanji speech (a spoken word, a sentence, or eventually free speech), produce the written Kuku Yalanji text — "speech → text" (ASR). Useful immediately for: (a) **assisted transcription** so an elder can *speak* a sentence and have it written down (vastly faster than typing for an 80-year-old speaker), (b) **voice search** of the dictionary, (c) accelerating the recording corpus by auto-drafting transcripts for the community to verify, and (d) long-term language documentation.

**Why it's genuinely hard:**

- **Low-resource / no parallel corpora.** Modern ASR is built on thousands of hours of transcribed audio. Kuku Yalanji has, at most, hours. There is no large transcribed speech corpus, no off-the-shelf model that already knows the language.
- **The language itself.** Kuku Yalanji is a Pama-Nyungan language of Far North Queensland with ~300+ speakers across two dialects (**Yalanji** and **Nyungkul**). Its sound system is typical of Australian languages: a small three-vowel system **/a i u/** (with length distinctions), no fricatives, and a rich set of stops/nasals/laterals across places of articulation (bilabial, dental, alveolar, retroflex, palatal, velar) plus rhotics. Two consequences for ASR:
  - The acoustic contrasts that *do* matter (e.g. retroflex vs alveolar, vowel length, the laminal dental/palatal series) are ones English ASR models are *bad* at, so an English-pretrained model transfers imperfectly.
  - But the **orthography is shallow and largely phonemic** (one letter ≈ one sound, per the standard SIL/community orthography), which is *good* news: character-based ASR works well and you don't need a deep grapheme-to-phoneme model.
- **Dialects + speaker variation.** Yalanji vs Nyungkul, plus a small number of speakers, means the model can overfit to a couple of voices. You need multiple speakers and to track which dialect a clip is.
- **Code-switching with English.** Real speech mixes English words and place/personal names. The model must not "correct" Kuku Yalanji into English (Whisper in particular loves to do this).
- **Orthographic variation.** Community spelling isn't perfectly standardised (the same word may appear with `-kal`/`-gal`, doubled vowels for length, etc.). Inconsistent transcripts hurt training; this is also a *labelling-standards* problem, not just a modelling one.
- **Governance.** This is Indigenous cultural data. Some recordings or content may be restricted; the trained model is itself a cultural asset the community should own. (Section 9.)

---

## 2. Your secret weapon: you are already collecting ASR data

This is the most important point in the report. **ASR fine-tuning data = (short audio clip, exact transcript) pairs.** The MobTranslate recording studio already produces precisely this:

| MobTranslate asset | What it gives ASR |
|---|---|
| **Per-word recordings** (record-a-word worklist) | Thousands of *(audio, word)* pairs — isolated-word ASR + acoustic units |
| **Per-sentence recordings** (example-sentence worklist + "add a sentence for everyone") | *(audio, sentence)* pairs — connected-speech ASR, the valuable kind |
| **~2,700 dictionary entries** with phonetic transcriptions + translations | A **pronunciation lexicon** for forced alignment + a vocabulary/language-model prior |
| **Corrections / suggestions pipeline** (curator-reviewed) | A ready-made **human-verification loop** to clean transcripts and labels |
| **Public-domain licensing** on uploaded recordings | The legal basis to train on them (with the governance caveats in §9) |
| **Speaker profiles + dialect/community fields** | Speaker- and dialect-aware splits, so you can measure and avoid overfitting |

So the strategy is not "go collect a speech corpus" — it's "**recognise that the recording studio IS the corpus pipeline, then point a fine-tuning recipe at it and close the loop.**"

### How much audio do you actually need?

Rough, honest numbers for fine-tuning a strong multilingual base (MMS/XLS-R/Whisper), not training from scratch:

- **~1 hour** of clean, transcribed speech: a first model worth demoing; high error rate but useful for *assisted* transcription (human still in the loop).
- **~3–10 hours**: a genuinely useful word/sentence recogniser (WER plausibly in the 15–40% range, better on isolated words).
- **20–50+ hours, multiple speakers, both dialects**: a robust system.

A per-word clip is ~1–2 seconds; a sentence ~3–6 seconds. **One hour ≈ ~1,800 word clips or ~700 sentence clips.** That is squarely within reach of a motivated community using the worklist + a few elders recording — which is exactly the activation flow you built. Prioritise **sentence-level** clips: connected speech is far more valuable than isolated words for a real ASR model, and gives the model the coarticulation and prosody it needs.

---

## 3. Technique landscape, ranked for your situation

### 3.1 Fine-tune a multilingual self-supervised base — **the recommended core**

Self-supervised speech models (wav2vec 2.0 family) are pre-trained on enormous *unlabelled* multilingual audio, learning general speech representations; you then fine-tune on a *small* labelled set in your target language. This is the dominant low-resource ASR recipe.

- **Meta MMS (Massively Multilingual Speech)** — *best fit.* A wav2vec 2.0 model pre-trained on **1,406 languages**; the released **MMS-1B** uses tiny (~2M-parameter) **per-language adapters** on top of a frozen 1B backbone, so you fine-tune a small adapter (cheap GPU, little data, no catastrophic forgetting) and get character-level CTC output. It was explicitly designed for exactly this — extending speech tech to long-tail languages — and there is a maintained Hugging Face recipe for fine-tuning MMS adapters. Kuku Yalanji is not one of the 1,107 ASR languages, but the backbone's broad acoustic coverage (including other Australian/Pama-Nyungan-adjacent phonetics) transfers well, and you add it as a *new* adapter.
- **Whisper-large-v3 + LoRA** — *strong alternative, especially for sentences/long-form.* Whisper is an encoder-decoder trained on 680k+ hours; it's robust to noise and handles longer audio and segmentation natively. Fine-tuning with LoRA adapters on a few hours has been shown to cut WER dramatically (e.g. from 48–90% zero-shot to 12–45%) on low-resource languages. Caveats: it has a strong English/known-language prior and will try to "translate" or anglicise Kuku Yalanji unless constrained; mitigate with (a) fine-tuning, (b) forcing/teaching a language token, (c) suppressing English-bias via training data, and (d) a recent trick — *generating long-form training data from your sentence clips* so the model keeps its segmentation ability without 30-minute recordings.
- **XLS-R (wav2vec 2.0, 128 languages)** — the classic low-resource fine-tune; well-documented, slightly older than MMS but very battle-tested for cross-lingual transfer.

**Recommendation:** start with **MMS-1B adapter fine-tuning** (cheapest, purpose-built, character CTC suits the shallow orthography). Run **Whisper-large-v3 + LoRA** in parallel for sentence/connected speech and pick per use-case. Both are a single A100/4090-class GPU for a few hours.

### 3.2 Elpis — the turnkey, community-runnable pipeline

**Elpis** was built by the Australian **CoEDL** (ARC Centre of Excellence for the Dynamics of Language) *specifically to make ASR usable by language workers and linguists* documenting endangered/Indigenous languages, with a friendly web UI over Kaldi and (newer) ESPnet/Hugging Face back-ends. It has been used on real Indigenous and Pacific languages (e.g. Cook Islands Māori). Value for MobTranslate: it lets **the community** train and run a Kuku Yalanji model without ML engineers, and its data-management conventions (audio + ELAN/transcription pairing) are a good template even if you ultimately use your own fine-tuning code. Use it as the on-ramp and as a fallback "anyone can do this" path.

### 3.3 Forced alignment (Montreal Forced Aligner) — bootstrap + word timing

**MFA** time-aligns a transcript to its audio using a **pronunciation dictionary** — and you *have* a pronunciation dictionary (2,700 entries, phonemic orthography). Two payoffs:

1. **Manufacture clean training data.** Feed longer recordings (stories, elders' sentences) + their transcripts; MFA segments them into aligned word/utterance chunks, which become high-quality fine-tuning examples. It works for *any* language with a lexicon, and transfer-learning its acoustic model from English roughly halves boundary errors vs training from scratch on tiny data.
2. **Word-level timestamps for the app** — highlight-as-it-plays, click-a-word-to-hear, and better pronunciation tooling — straight out of the same alignment.

Because Kuku Yalanji orthography is near-phonemic, building the MFA pronunciation dictionary is mostly a deterministic letter→phone mapping you can auto-generate from the dictionary's spellings + the phonetic-transcription field, with a linguist spot-check.

### 3.4 Output units: characters vs phonemes

Use **character/grapheme CTC** (what MMS and fine-tuned wav2vec2 do): the orthography is shallow, so characters are close to phonemes, the dictionary covers vocabulary, and you avoid maintaining a separate G2P. Keep a normalisation step that standardises the known orthographic variants (vowel-length doubling, `-kal/-gal`, etc.) *consistently* in training transcripts — inconsistent spelling is a top source of apparent "errors." (This is the same spelling-variant issue raised in community feedback; here it directly degrades ASR, so it's worth a normalisation map driven by the dictionary, not ad-hoc.)

### 3.5 The compounding loop (self-training / pseudo-labelling)

Once a first model exists: run it over **un-transcribed** Kuku Yalanji audio (archival tapes, new uploads) to produce **draft transcripts**, have the community confirm/fix them in the studio, and fold the verified pairs back into training. This *semi-supervised self-training* is how low-resource systems escape the cold start. Crucially, **MobTranslate already has the human-in-the-loop UI** (recording worklist + corrections/curator review) to make the "confirm/fix" step a normal community activity rather than a research chore.

---

## 4. The flywheel (why this gets better on its own)

```
   record a word/sentence  ─►  (audio, text) pair  ─►  fine-tune MMS/Whisper
            ▲                                                   │
            │                                                   ▼
   community confirms/corrects  ◄─  model drafts a transcript  ◄─ run model on
   (curator review)                 for new/old audio              new audio
```

Each turn adds verified labelled data and improves the model, which makes the *next* round of transcription cheaper, which gets more audio recorded and confirmed. The two scarce ingredients — **labelled audio** and **human verification** — are exactly the two things your app is already built to gather. Quantitatively: getting Kuku Yalanji from "~1 hour, demo model" to "~10 hours, useful model" is a few hundred confirmed sentences — a realistic community season's work, especially if framed as the recording campaign you already gamified.

---

## 5. Evaluation (measure it honestly)

- **Prefer Character Error Rate (CER) over Word Error Rate (WER).** Kuku Yalanji is morphologically rich (case suffixes, vowel-harmony alternations); WER over-penalises a near-miss on a long suffixed word. Report both, lead with CER.
- **Hold out by speaker *and* by dialect.** A test set that shares speakers with training overstates accuracy badly in low-resource ASR. Keep ≥1 speaker entirely unseen, and report Yalanji vs Nyungkul separately.
- **Keep a fixed regression set** of \~100–300 utterances you never train on, re-scored every model version, so you can prove the flywheel is actually helping.
- **Human-judged usefulness**, not just CER: for *assisted* transcription, "how much faster is it than typing, after correction?" is the metric that matters to an elder.
- **COMET/BLEU-style automatic metrics don't apply** (that's translation); for ASR stick to CER/WER + human review.
- Watch specifically for: English-anglicisation errors (Whisper), retroflex/alveolar confusions, vowel-length drops, and over-/under-segmentation of suffixes.

---

## 6. How it plugs into MobTranslate (architecture)

**Training** is an offline GPU job (your own box's spare GPU, or a rented A100 for a few hours per model version). Output: a fine-tuned MMS adapter or Whisper-LoRA checkpoint, versioned per language + dialect, plus its CER/CER-by-dialect scorecard.

**Inference** options, cheapest first:
- **Hosted endpoint** (a small Python service, same pattern as your image-gen worker/queue): app/web sends an audio clip → gets text. Fine for assisted transcription and voice search; bounded cost; easy to gate/log.
- **On-device** later: MMS/wav2vec2 and Whisper both have quantised/`whisper.cpp`/ONNX builds that can run a small model on a modern phone for offline, private STT — valuable in remote communities with poor connectivity. Treat as a Phase-4 goal.

**Product surfaces that fall out of it:**
- **"Tap to speak" in the recording studio:** the elder speaks; the model drafts the transcript; they confirm/edit (which both saves the recording *and* labels it). This is the killer feature for your 80-year-old speaker — and it doubles your data-collection rate.
- **Voice search** of the dictionary ("say a word → find the entry").
- **Pronunciation feedback** (compare a learner's audio to the model's expectation) for the learning side of the app.
- **Bulk transcription** of any archival Kuku Yalanji audio the community holds.

---

## 7. Phased roadmap

**Phase 0 — Data foundation (now → ~4 weeks).**
Organise existing recordings into clean *(audio, normalised-text, speaker, dialect)* records. Build the **orthographic normalisation map** from the dictionary (standardise length/variant spellings). Auto-generate an **MFA pronunciation dictionary** from the dictionary + phonetic field; linguist spot-check. Define the held-out test set (≥1 unseen speaker, both dialects). *Gate to advance: ≥~1 hour of clean, normalised, speaker-tagged audio and a frozen test set.*

**Phase 1 — First model (~2–4 weeks).**
Fine-tune **MMS-1B adapter** and **Whisper-large-v3 + LoRA** on the Phase-0 data. Use MFA to segment any longer recordings into more training clips. Score CER by dialect on the held-out set. Stand up the **inference endpoint**. *Gate: a model that beats "type it yourself" for assisted transcription on real elder speech (human-judged), even if CER is high.*

**Phase 2 — Assisted transcription in the app (~3–5 weeks).**
Ship **"speak → draft transcript → confirm/correct"** into the recording studio (reuse the recording + corrections UI). Every confirmation is logged as new labelled data. Add **voice search**. Track collection rate + per-version CER. *Gate: data inflow from confirmations exceeds manual typing, and CER trends down across versions.*

**Phase 3 — Self-training flywheel + dialect models (ongoing).**
Run the model over un-transcribed/archival audio to pre-label; community verifies; retrain monthly. Split **Yalanji vs Nyungkul** models/adapters once each dialect has enough data. Add pronunciation-feedback for learners. *Gate: a published, improving CER curve and a growing verified corpus the community controls.*

**Phase 4 — Real-time / on-device + documentation scale.**
Quantised on-device STT for offline use; near-real-time transcription; integration with language-documentation exports (ELAN/Elpis-compatible). Optional: contribute the model + (consented) data back to the community's own archive.

---

## 8. A concrete starting recipe (what to actually run first)

1. Export from the DB: every Kuku Yalanji recording with its `label`/`gloss` (transcript), `kind` (word/sentence), speaker, and dialect → a manifest of `(audio_path, text)`.
2. Normalise transcripts with the dictionary-derived map; drop or flag clips whose transcript looks unreliable (use the corrections data to prioritise verified ones).
3. **MMS path:** follow the Hugging Face *"Fine-Tune MMS Adapter Models for low-resource ASR"* recipe — load `facebook/mms-1b-all`, add a new target-language adapter + character vocab built from your transcripts, train a few epochs, evaluate CER. Tiny adapter, single GPU, hours.
4. **Whisper path:** fine-tune `openai/whisper-large-v3` with LoRA (PEFT) on the sentence clips; apply the long-form-data-generation trick so it keeps segmentation; force a custom/"unknown" language token to fight anglicisation.
5. **Forced alignment:** install MFA, point it at longer recordings + transcripts + your pronunciation dictionary to mint more aligned training data and word timings.
6. **Community on-ramp:** stand up **Elpis** so language workers can retrain without you, using the same data conventions.
7. Wrap inference in a small hosted endpoint; wire the "speak → draft → confirm" loop into the recording studio.

GPU: a single 24–80 GB card for a few hours per training run; inference of a fine-tuned MMS/Whisper-small is cheap and can later go on-device.

---

## 9. Governance (non-negotiable, do this from day one)

- **Community ownership of the model**, not just the data. The trained Kuku Yalanji ASR model is a cultural artefact; the Bama community should own/control it under **CARE** (Collective benefit, Authority to control, Responsibility, Ethics) and **OCAP** principles, alongside Indigenous Cultural & Intellectual Property (ICIP).
- **Consent for *training*, separately from consent for *recording*.** MobTranslate already contributes uploaded recordings to the public domain, which gives a legal basis, but "public domain" is not the same as community consent to train an AI; confirm the keepers are comfortable with model training and with the model's uses.
- **Restricted / sacred content** must be excludable from training and from any transcription surface; gender- or initiation-restricted material and certain names need handling rules, not a blanket "ingest everything."
- **Attribution** of speakers and knowledge-holders in the model card.
- **Keep humans in the loop.** ASR drafts are *suggestions* a speaker/keeper confirms — never an authority that "corrects" the language. This both respects authority-to-control and is, conveniently, also how the model gets better.

---

## 10. Bottom line

The fastest credible route to Kuku Yalanji speech-to-text is not a research moonshot — it's: **(1)** treat the recording studio as the corpus engine it already is, **(2)** fine-tune **MMS** (and trial **Whisper-LoRA**) on the *(audio, text)* pairs, **(3)** use **MFA** + the dictionary to bootstrap and to get word timings, **(4)** ship **"speak → draft → confirm"** so every use adds verified data, and **(5)** wrap it in community-owned governance. Each loop makes the next one cheaper. Start with one hour of clean sentence audio and a frozen test set; everything else compounds from there.

---

## References

- Foley et al., *Building Speech Recognition Systems for Language Documentation: The CoEDL Endangered Language Pipeline and Inference System (Elpis)* — https://www.semanticscholar.org/paper/9476918d232768de4f2cbc13240c6626f49b4d04
- *Managing Transcription Data for Automatic Speech Recognition with Elpis* — https://www.researchgate.net/publication/370684903_Managing_Transcription_Data_for_Automatic_Speech_Recognition_with_Elpis
- *User-friendly automatic transcription of low-resource languages: Plugging ESPnet into Elpis* — https://www.academia.edu/118593005/
- Meta AI, *Massively Multilingual Speech (MMS)* overview — https://syncedreview.com/2023/05/25/meta-ais-massively-multilingual-speech-project-scales-speech-technology-to-1000-languages/
- Hugging Face, *Fine-Tune MMS Adapter Models for low-resource ASR* — https://huggingface.co/blog/mms_adapters
- *Fine-tuning Whisper on Low-Resource Languages for Real-World Applications* (arXiv:2412.15726) — https://arxiv.org/abs/2412.15726
- *Whispering in Amharic: Fine-tuning Whisper for Low-resource Language* (arXiv:2503.18485) — https://arxiv.org/pdf/2503.18485
- *Breaking the Transcription Bottleneck: Fine-tuning ASR Models for Extremely Low-Resource Fieldwork Languages* (arXiv:2506.17459) — https://arxiv.org/pdf/2506.17459
- *Fine-Tuning ASR models for Very Low-Resource Languages* (ACL SRW 2024) — https://aclanthology.org/2024.acl-srw.16.pdf
- Montreal Forced Aligner — documentation: https://montreal-forced-aligner.readthedocs.io/ ; original paper: https://montrealcorpustools.github.io/Montreal-Forced-Aligner/images/MFA_paper_Interspeech2017.pdf
- *Kuku-Yalanji Dictionary*, Work Papers of SIL-AAB Series B, Vol. 7 (Hershberger & Hershberger, 1986) — https://eric.ed.gov/?id=ED282433
- Pama Language Centre — Kuku Yalanji — https://www.pamacentre.org.au/kuku-yalanji/
- CARE Principles for Indigenous Data Governance — https://www.gida-global.org/care
