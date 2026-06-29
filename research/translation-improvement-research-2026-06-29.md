# Improving Indigenous-language translation over time — techniques and a path for MobTranslate

**Status:** Research report · **Date:** 2026-06-29 · **Audience:** MobTranslate engineering + language-community partners

---

## Executive summary

MobTranslate translates between English and three active First Nations / Indigenous languages — **Kuku Yalanji** (Far North Queensland, ~2,700 words), **Anindilyakwa** (Groote Eylandt, NT, ~590 words), and **Mi'gmaq** (Atlantic Canada, ~13,000 words) — by loading the *entire* dictionary into an LLM prompt and translating with a frontier model (currently `gpt-5.4-mini`). These are **low-resource languages**: they have rich, curated dictionaries but little or no sentence-aligned parallel corpus, which is the single resource neural MT depends on most.

The central thesis of this report, grounded in the 2024–2026 low-resource MT literature, is:

> **Translation quality for these languages will be driven by accumulating verified parallel sentences, not by ever-better prompts or grammar prose. The fastest, safest, community-respecting way to accumulate them is a compounding flywheel: community corrections → verified pairs → faithful synthetic augmentation (grounded in the real dictionary + grammar) → a better served model → more usage → more corrections.**

The strongest empirical result behind this is from *Can LLMs Really Learn to Translate a Low-Resource Language from One Grammar Book?* (Aycock et al., 2024): on the unseen Kalamang language, **parallel examples beat grammatical explanations by 7+ chrF++ points**, and grammar prose added negligible value once parallel examples were present; a fine-tuned NLLB model matched long-context LLM performance on the same parallel data within 0.2 chrF++ — far more cheaply. **Vocabulary coverage in the prompt was the dominant predictor of quality.** ([arXiv 2409.19151](https://arxiv.org/abs/2409.19151))

MobTranslate is unusually well-positioned: it *already* owns the two scarcest assets — a curated dictionary and a live **word-improvement-suggestion** pipeline that turns community knowledge into structured, reviewed signal. This report surveys the field and maps each technique to MobTranslate's assets; the companion **PRD** (`translation-improvement-prd-2026-06-29.md`) turns it into a per-tribe timeline.

---

## 1. The core challenge: low-resource MT for Indigenous languages

### 1.1 No parallel corpora

Neural MT and LLM fine-tuning both want **sentence-aligned bilingual pairs**. For high-resource pairs (e.g. en↔fr) these number in the hundreds of millions. For our three languages they number, realistically, in the **tens to low thousands** — and most of what exists is *lexical* (word↔gloss), not *sentential*. Data scarcity is "a profound challenge in training NMT models, especially for low-resource languages" because most models "rely on extensive bilingual corpora." ([arXiv 2505.02463](https://arxiv.org/abs/2505.02463))

What MobTranslate *does* have, per language:

| Asset | Kuku Yalanji | Anindilyakwa | Mi'gmaq |
|---|---|---|---|
| Headwords | ~2,700 | ~590 | ~13,000 |
| Definitions + English translations | ✓ | ✓ | ✓ |
| Usage example sentences (some with translation) | ✓ | ✓ | ✓ |
| Word classes / part of speech | ✓ | ✓ | ✓ |
| Phonetic transcriptions | partial | partial | partial |
| Place names with coordinates | ✓ | ✓ | ✓ |
| Community audio (per word + per example) | growing | growing | growing |
| Word-improvement suggestions (structured) | live | live | live |

The **usage example sentences** are the seed parallel corpus. Growing, verifying, and exploiting them is the core engineering problem.

### 1.2 Morphological richness and polysynthesis

These languages are not just "small versions of English." **Anindilyakwa is polysynthetic** — a single word can encode what English needs a whole clause for (subject, object, tense, noun-class, incorporation), with extensive noun-class prefixing. **Mi'gmaq is polysynthetic and agglutinative** (Algonquian). **Kuku Yalanji** (Pama-Nyungan) is suffixing with rich case/aspect morphology. Consequences:

- A word-level dictionary lookup cannot reconstruct inflected surface forms. The model must *generate* morphology it may have never seen.
- Token-overlap metrics (BLEU) are unreliable; a single wrong affix tanks BLEU even when meaning is preserved. Character-level metrics (chrF++) correlate better with human judgement for morphologically rich languages ([arXiv 2602.17425](https://arxiv.org/html/2602.17425v1)).
- A **morphological analyzer / finite-state transducer (FST)** — where one exists or can be built — is disproportionately valuable: it lets us gloss, segment, and *constrain* generation.

### 1.3 Orthographic variation and dialects

Indigenous orthographies are often recent, contested, or community-specific. Kuku Yalanji has Eastern/Western variation; Anindilyakwa orthography has known normalization issues (the MobTranslate codebase already carries an Anindilyakwa→donor-TTS orthography bridge). Mi'gmaq has multiple competing writing systems (Listuguj, Smith-Francis, Pacifique). Naive training treats `x` and its variant spelling as different tokens, splintering already-tiny data. **Orthographic normalization is a first-class preprocessing step**, and synthetic-data work for Indigenous languages explicitly pairs augmentation with *language-specific preprocessing* ([arXiv 2601.03135](https://arxiv.org/pdf/2601.03135)).

### 1.4 Cultural and sacred-knowledge governance

This is not a footnote. Some vocabulary, stories, place names, and recordings are **restricted, gendered, or sacred** and must never enter a training set or a public model output. The literature is explicit that working with Indigenous language data is governed by **CARE** (Collective benefit, Authority to control, Responsibility, Ethics) ([CARE / GIDA](https://datascience.codata.org/articles/dsj-2020-043)), **OCAP®** in Canada (Ownership, Control, Access, Possession — directly relevant to Mi'gmaq), and **ICIP** (Indigenous Cultural and Intellectual Property) in Australia. "It's how you do things that matters" (Bird, 2024) argues that *process* — consent, attribution, community authority — matters as much as model quality ([arXiv 2402.02639](https://arxiv.org/pdf/2402.02639)). See §8.

---

## 2. Human-in-the-loop corrections & suggestions (what we already have)

MobTranslate's `word_improvement_suggestions` table — community members proposing corrections to *definition, translation, example, pronunciation, grammar, cultural_context*, with curator approve/reject — is **the most valuable thing in the system for translation improvement.** It is a structured, attributed, consent-bearing stream of ground-truth signal. The literature on endangered-language MT converges on exactly this design.

### 2.1 Corrections compound into training signal

The canonical example is **ChrEn / ChrEnTranslate** (Cherokee–English): a deployed demo that translates, shows **quality estimation**, and collects **corrective feedback / human-in-the-loop** edits to grow the corpus and improve the model over time ([arXiv 2107.14800](https://arxiv.org/pdf/2107.14800); [ChrEn, arXiv 2010.04791](https://arxiv.org/pdf/2010.04791)). Each approved correction is a *verified pair* or a *verified gloss* — precisely the resource §1.1 says we lack. The mechanism:

1. Model proposes a translation (or a definition/example).
2. Community member corrects it; curator approves.
3. The approved item becomes a **gold pair** with provenance (who, when, which language, which field).
4. Gold pairs accumulate into a versioned training set.

MobTranslate's six suggestion *types* map cleanly onto distinct signals: `translation`/`example` → parallel sentences; `definition` → lexical gold; `pronunciation` → audio/phonetic gold (feeds ASR/TTS); `grammar` → morphological/syntactic rules (feeds FST + constrained decoding); `cultural_context` → governance metadata (restriction flags, register).

### 2.2 Active learning — *which* sentence to ask about next

A correction is most valuable when it resolves a case the model is *most wrong or most uncertain* about. **Active learning** picks those cases so a few human interactions move quality the most: "active learning allows converging to the best MT systems with fewer human interactions" and HITL+active-learning "involve humans only when necessary," concentrating effort "where most impactful" ([Onception, MIT Press CL 2023](https://direct.mit.edu/coli/article/49/2/325/114185); [arXiv 2502.12755](https://arxiv.org/html/2502.12755v1)). Practical selection signals MobTranslate can compute cheaply:

- **Quality-estimation / self-consistency**: translate, back-translate, measure round-trip divergence; high divergence → ask a human (also a QE signal à la ChrEnTranslate).
- **Vocabulary coverage gap**: sentences using headwords that have *no* verified example sentence yet (directly attacks the §1.1 / Aycock "vocabulary coverage predicts quality" finding).
- **Disagreement**: where two model variants (or model vs. dictionary lookup) disagree.
- **High-frequency, high-leverage forms**: common verbs/affixes whose correction generalizes widely.

The product surface for this already exists — surface the selected sentence *as a suggestion-to-fill* in the existing suggestion UI ("Help us translate this sentence" / "Is this example right?").

### 2.3 Curator review and gamification

Curator approve/reject is the **quality gate** that keeps synthetic and crowd noise out of gold. To sustain volume without burning out a tiny pool of fluent speakers:

- **Gamification / leaderboards**: contribution streaks, per-language progress bars ("Kuku Yalanji: 312 / 2,700 words have a verified example"), badges for approved suggestions, "word of the day to verify." Endangered-language revitalization work repeatedly notes community engagement as the bottleneck, and that AI tools "empower communities to take an active role" ([TRENDS Research](https://trendsresearch.org/insight/machine-learning-for-endangered-language-preservation/)).
- **Reviewer tiers**: trusted elders/linguists as curators; learners as proposers; AI as a *drafting assistant* that pre-fills suggestions for humans to accept/edit (never auto-commit).

---

## 3. Synthetic / augmented data with high-reasoning models

Synthetic data is how we bridge from "hundreds of verified pairs" to "enough to fine-tune," **but only if it is faithful** — it must never invent vocabulary or morphology. Every technique below is paired with a verification/human-spot-check gate.

### 3.1 Back-translation (the workhorse)

Train/prompt a model to translate *Indigenous → English*; run it over **monolingual Indigenous text** (example sentences, stories, recordings transcribed via ASR); pair the synthetic English with the real Indigenous source → synthetic parallel data. "Back-translation… has been shown to improve translation quality across a range of low-resource settings" and "can mitigate the scarcity of bilingual data by generating synthetic data from monolingual corpora" ([arXiv 2505.02463](https://arxiv.org/abs/2505.02463); [Luganda case study, ACM 2024](https://dl.acm.org/doi/10.1145/3711542.3711594)). **Crucial asymmetry for us:** the *Indigenous side is real* (human-authored), so we never fabricate Indigenous vocabulary — the synthetic part is the English, which a frontier model does reliably.

### 3.2 Forward translation / self-training / distillation from a strong teacher

Where monolingual *English* is abundant but Indigenous monolingual is scarce (often our case), **forward translation** generates the Indigenous side. This is riskier (it can hallucinate Indigenous vocabulary), so it is **strictly gated**: generate with the strong teacher (`gpt-5.4`/o-series) constrained to the real dictionary (§4), filter by round-trip consistency, then **human spot-check** a sample before any pair enters gold. Forward translation "has gained attention as a scalable alternative to back-translation for languages with scarce monolingual resources" ([arXiv 2505.02463](https://arxiv.org/abs/2505.02463)). **Distillation**: use the expensive teacher to label data, then fine-tune a smaller/cheaper served student on the labels (Self-Evolution KD reports ~+1.4 SacreBLEU; [arXiv 2412.15303](https://arxiv.org/abs/2412.15303)). For MobTranslate this is the path from "gpt-5.4-mini in the loop" → "a cheap fine-tuned NLLB/served model we own."

### 3.3 Dictionary-driven sentence templating

The safest synthetic source: take **real example sentences** and substitute attested headwords of the same word class into the same syntactic frame, producing many grammatically-controlled variants. Because every slot is filled from the *real* dictionary and every frame is a *real* example, fabrication risk is low. Pair with paraphrase augmentation of the English side. This directly grows **vocabulary coverage**, the dominant predictor of quality (§1.1).

### 3.4 Round-trip consistency as a filter (not just a metric)

For every synthetic pair: translate forward, translate back, compare to the original. Discard pairs whose round-trip diverges beyond a threshold; route borderline pairs to human review (this *is* the active-learning selector of §2.2). High-quality augmentation pipelines combine a generator with **filtering** to keep only good synthetic pairs ([arXiv 2408.12079](https://arxiv.org/abs/2408.12079)).

### 3.5 The faithfulness rule (non-negotiable)

> **Synthetic data may recombine and rephrase what the community has attested; it may never invent Indigenous words, affixes, or meanings.** Concretely: (a) constrain generation to the real lexicon/grammar (§4); (b) auto-reject any output containing an out-of-vocabulary Indigenous token unless flagged as a *candidate* for human review; (c) human spot-check a fixed sample of every synthetic batch; (d) tag every synthetic row `provenance=synthetic` and never let it outrank human-verified gold.

---

## 4. Grounding the model in our assets

This is where MobTranslate already leads and should double down: the model should *retrieve and obey* the real dictionary + grammar rather than rely on parametric memory.

### 4.1 Full-dictionary / long-context injection (current approach) and its limit

MobTranslate already loads the whole dictionary into the prompt — exactly right for the smaller languages. But the Aycock finding warns: piling *prose grammar* into context yields "needle-in-a-haystack" dilution, and **prompt length did not correlate with quality**; *parallel examples and vocabulary coverage* did ([arXiv 2409.19151](https://arxiv.org/abs/2409.19151)). Implications:

- **Keep injecting the full word list** (it's the coverage that matters), especially while it fits the context window (Kuku Yalanji + Anindilyakwa comfortably; ~13k-word **Mi'gmaq will eventually exceed practical context** → needs retrieval).
- **Inject relevant *example sentences*, not paragraphs of grammar prose** — examples are the load-bearing signal.

### 4.2 Retrieval-augmented translation (RAG) — required for Mi'gmaq

Retrieve only the dictionary entries and example sentences relevant to the source sentence (lexical + embedding match on the source tokens), then translate. RAG prompting improves low-resource MT (Mambai study, [ACL 2024.eurali-1.1](https://aclanthology.org/2024.eurali-1.1/)), though *retrieval quality is itself a bottleneck* — "retrieval and understanding are both the problem" ([arXiv 2406.15625](https://arxiv.org/pdf/2406.15625)). So build retrieval carefully: index headwords, inflected forms (via FST if available), glosses, and example sentences; retrieve by source-token match **and** semantic similarity; always include any headword the source contains.

### 4.3 Grammar-informed in-context learning & grammar-constrained decoding

**GrammaMT** shows grammar-informed ICL — feeding *interlinear glosses* and gloss-then-translate chains — improves MT ([arXiv 2410.18702](https://arxiv.org/pdf/2410.18702)). The Aycock nuance: grammar helps **structured linguistic subtasks** (grammaticality judgement +3%, gloss prediction) even though prose grammar doesn't help raw translation. So use grammar **operationally**: gloss the source, constrain morphology, enforce noun-class agreement — not as prose for the model to "read."

### 4.4 Morphological analyzers / FSTs and lexically-constrained decoding

For polysynthetic Anindilyakwa and Mi'gmaq, an FST/morphological analyzer is the highest-leverage grammar asset: it segments and **constrains** generation to legal forms, and enables **terminology enforcement / lexically-constrained decoding** — forcing the attested target word for a known source term. **Hybrid rule-based + neural / LLM-assisted RBMT** is an active, effective pattern for no/low-resource languages ([ACL 2024.americasnlp-1.9](https://aclanthology.org/2024.americasnlp-1.9/)). Even a partial FST (closed-class affixes, noun-class prefixes) pays off.

---

## 5. Every other relevant technique

- **Transfer learning from related/higher-resource languages.** Warm-start from a relative within the same family before fine-tuning on the target — "combining transfer learning and data augmentation can successfully exploit language similarity" ([Bavarian case study, arXiv 2404.08259](https://arxiv.org/html/2404.08259v1)). Family anchors: **Mi'gmaq** ← other Algonquian (Cree, Ojibwe) which have more data; **Kuku Yalanji** ← other Pama-Nyungan; **Anindilyakwa** is a relative isolate (Gunwinyguan-area) so transfer is weaker → lean on multilingual pretrained models + augmentation.
- **Multilingual pretrained models as the base.** **NLLB-200** (200 languages, distilled 600M variant is cheap to fine-tune) and **MADLAD-400** are the standard low-resource bases; fine-tuning NLLB-200 "significantly enhances translation… to Indigenous American languages" and won several AmericasNLP-2024 pairs ([NLLB, arXiv 2207.04672](https://arxiv.org/pdf/2207.04672); [AmericasNLP 2024 findings, ACL 2024.americasnlp-1.28](https://aclanthology.org/2024.americasnlp-1.28/)). None natively support our three languages well, so they are *bases to adapt*, not drop-in solutions.
- **LoRA / parameter-efficient fine-tuning / instruction-tuning.** LoRA fine-tunes on tiny datasets, "preserves multilingual knowledge by keeping original weights intact," and adds no inference latency once merged — fine-tuning NLLB-200 with LoRA on as few as **650 sentences** is a documented recipe ([LoRA-for-LRL survey, ResearchGate](https://www.researchgate.net/publication/389729899); [Turkmen 650-sentence walkthrough](https://medium.com/@meinnps/fine-tuning-nllb-200-with-lora-on-a-650-sentence-turkmen-english-corpus-082f68bdec71)). This is the realistic path once each language has a few hundred–few thousand verified pairs.
- **Pivot translation.** Translate via a high-resource pivot (e.g. Indigenous→related-language→English) when direct data is absent.
- **Hybrid rule-based + neural** (see §4.4).
- **Leverage audio — ASR/forced-alignment to mine text; TTS for learners.** Community recordings (per word + per example) are a corpus. Forced alignment + ASR transcribes recordings into *new monolingual Indigenous text* (feeds back-translation §3.1), and TTS supports learning apps (MobTranslate already has an Anindilyakwa TTS scaffold). Audio is "another modality to mine more text."
- **OCR of legacy dictionaries/texts.** Mission-era dictionaries, wordlists, recorded stories, and printed grammars exist on paper for all three communities. OCR + human correction grows the lexicon and the example corpus — **subject to copyright/community permission** (§8). For Mi'gmaq especially, substantial documented material exists.

---

## 6. Evaluation

Measuring progress honestly is essential, and standard metrics mislead on these languages.

### 6.1 Metric caveats

| Metric | Use | Caveat for our languages |
|---|---|---|
| **BLEU** | legacy comparability | "overly harsh due to limited lexical overlap despite meaning preservation"; brittle on rich morphology; small test sets make it noisy ([arXiv 2602.17425](https://arxiv.org/html/2602.17425v1)) |
| **chrF / chrF++** | **primary automatic metric** | character-level → "correlates more strongly with human judgments than BLEU, especially for morphologically rich or lower-resource languages"; can inflate via source-copying — watch for it |
| **COMET** | secondary | higher human correlation than BLEU on some low-resource sets, **but** it relies on pretrained encoders that *do not cover our languages* → zero-shot COMET is unreliable here ([COMET LR case study, ACL 2024.lrec-main.315](https://aclanthology.org/2024.lrec-main.315/); [arXiv 2406.03893](https://arxiv.org/pdf/2406.03893)) |

**Conclusion:** report **chrF++ as headline + a second metric**; never trust a single number on tiny test sets ("a combination of metrics is necessary," [arXiv 2602.17425](https://arxiv.org/html/2602.17425v1)).

### 6.2 Human evaluation (the real gate)

Automatic metrics are a smoke alarm; **community judgement is the verdict.** Use a lightweight rubric (adequacy, fluency, morphological correctness, cultural appropriateness, each 1–5) scored by fluent speakers. Barriers are real — "shortage of qualified annotators, geographically dispersed communities, no standard protocol" ([arXiv 2602.17425](https://arxiv.org/html/2602.17425v1)) — so make it *cheap and in-product* (the same suggestion/verify UI), and treat **approved corrections as continuous human evaluation**.

### 6.3 Round-trip checks and regression sets

- **Round-trip** (en→X→en) as a free, scalable QE signal and active-learning selector (§2.2, §3.4).
- A **frozen regression set** per language (held-out verified pairs, never trained on) re-scored on every model/prompt change, so we catch quality regressions — including the kind caused by a noisy synthetic batch.

---

## 7. The compounding flywheel

```
        ┌─────────────────────────────────────────────────────────┐
        │                                                         │
   community usage ──► corrections/suggestions ──► curator review │
        ▲                                               │         │
        │                                               ▼         │
   better served model ◄── fine-tune (LoRA) ◄── verified gold pairs│
        ▲                                               │         │
        │                                               ▼         │
   eval gate (chrF++ + human) ◄── filtered synthetic ◄─ augmentation
        │                          (back-translation, templating,  │
        └──────────────────────────  distillation, round-trip)─────┘
```

Each turn: usage surfaces errors → active learning asks the *highest-value* corrections → curators verify → gold grows → faithful augmentation multiplies it → fine-tune a cheaper owned model → quality rises → usage rises. The dictionary keeps fabrication out; curators keep noise out; the regression set keeps it monotone.

### 7.1 Rough scaling per tribe

Assume each verified example sentence can be *templated/augmented* into ~5–15 faithful synthetic pairs (dictionary-constrained substitution + paraphrase), and that LoRA on NLLB-200 shows real gains from a few hundred pairs ([Turkmen 650-sentence](https://medium.com/@meinnps/fine-tuning-nllb-200-with-lora-on-a-650-sentence-turkmen-english-corpus-082f68bdec71); Aycock NLLB-on-parallel result):

| Tribe | Headwords | Realistic near-term verified pairs (1 example/word for a fraction of vocab) | After augmentation (~10×) | Fine-tuning viable? |
|---|---|---|---|---|
| **Anindilyakwa** | ~590 | ~200–600 | ~2k–6k | Yes, but augmentation + FST critical (polysynthetic, smallest vocab) |
| **Kuku Yalanji** | ~2,700 | ~800–2,700 | ~8k–27k | **Best near-term fine-tuning candidate** (mid vocab, suffixing) |
| **Mi'gmaq** | ~13,000 | ~2k–6k initially (needs RAG to even prompt) | ~20k–60k | Highest ceiling; needs RAG + transfer from Algonquian + biggest curation effort |

These are order-of-magnitude planning figures, not promises — the real driver is **how many fluent contributors verify how often**, which is why §2 (HITL + gamification) is the rate-limiting step, not the modeling.

---

## 8. Governance

Modeling choices are subordinate to community authority. MobTranslate must operationalize:

- **CARE** (Collective benefit, Authority to control, Responsibility, Ethics) — Indigenous data governance as a response to "open by default" FAIR practices that ignored Indigenous perspectives ([CARE, Data Science Journal 2020](https://datascience.codata.org/articles/dsj-2020-043); [Operationalizing CARE+FAIR, Nature Sci Data](https://www.nature.com/articles/s41597-021-00892-0)).
- **OCAP®** (Ownership, Control, Access, Possession) — **directly governs Mi'gmaq** as a First Nations community in Canada ([OCAP overview](https://community.environicsanalytics.com/hc/en-us/articles/19376737814541-2-Understanding-The-First-Nations-Principles-of-OCAP)).
- **ICIP** (Indigenous Cultural and Intellectual Property) — the Australian frame for Kuku Yalanji and Anindilyakwa.
- **Process over output** — consent, attribution, and community authority are first-class, not afterthoughts ([Bird 2024, arXiv 2402.02639](https://arxiv.org/pdf/2402.02639)).

Concrete requirements for the pipeline:

1. **Consent for training.** Communities explicitly opt in to having their language data used to *train/fine-tune* models — distinct from displaying it in a dictionary. Default off until granted.
2. **Restricted-content flags.** A first-class `restriction` field (sacred, gendered, ceremonial, region-restricted) that **excludes** items from training sets and from public model output. The existing `cultural_context` suggestion type feeds this.
3. **Attribution & provenance.** Every gold pair carries who contributed and who curated; communities are credited (MobTranslate already has a credits surface).
4. **Authority to control / withdrawal.** Communities can revoke data; the pipeline must support deleting items *and* retiring any model trained on withdrawn data.
5. **Local benefit.** Models, exports, and data remain accessible to the community (collective benefit), not locked behind the platform.

---

## 9. Synthesis — what to build, in order

1. **Make the corrections pipeline a training-data pipeline.** Promote approved `translation`/`example` suggestions into a versioned, provenance-tagged **gold parallel set** per language. *(highest ROI — it's the scarce asset, and we already collect it.)*
2. **Active-learning selector** that surfaces the highest-value sentences to verify (coverage gaps + round-trip divergence) inside the existing suggestion UI.
3. **Faithful synthetic-data pipeline** — dictionary-constrained templating + back-translation, round-trip + OOV filtering, mandatory human spot-check, `provenance=synthetic`.
4. **Grounding upgrades** — keep full-dictionary injection for the small languages; build **RAG** for Mi'gmaq; add gloss-then-translate and (where available) FST-based constraints.
5. **Owned served model** — distill/LoRA-fine-tune NLLB-200 per language once enough gold accrues, moving off per-call frontier cost.
6. **Eval harness** — chrF++ + second metric, frozen regression sets, in-product human rubric.
7. **Governance gates** wired through every stage (consent, restriction flags, attribution, withdrawal).

The companion **PRD** sequences this into phased, per-tribe milestones with evaluation and governance gates.

---

## References

- Aycock et al. (2024). *Can LLMs Really Learn to Translate a Low-Resource Language from One Grammar Book?* — [arXiv 2409.19151](https://arxiv.org/abs/2409.19151) · [OpenReview](https://openreview.net/forum?id=aMBSY2ebPw)
- Tanzer et al. (2024). *MTOB: A Benchmark for Learning to Translate a New Language from One Grammar Book.* (Kalamang) — referenced in [arXiv 2409.19151](https://arxiv.org/abs/2409.19151)
- *Low-Resource MT through Retrieval-Augmented LLM Prompting: the Mambai Language* — [ACL 2024.eurali-1.1](https://aclanthology.org/2024.eurali-1.1/)
- *Shortcomings of LLMs for Low-Resource Translation: Retrieval and Understanding are Both the Problem* — [arXiv 2406.15625](https://arxiv.org/pdf/2406.15625)
- *GrammaMT: Improving MT with Grammar-Informed In-Context Learning* — [arXiv 2410.18702](https://arxiv.org/pdf/2410.18702)
- *LLM-Assisted Rule-Based MT for Low/No-Resource Languages* — [ACL 2024.americasnlp-1.9](https://aclanthology.org/2024.americasnlp-1.9/)
- *Data Augmentation With Back-translation for Low-Resource Languages (English–Luganda)* — [arXiv 2505.02463](https://arxiv.org/abs/2505.02463) · [ACM 2024](https://dl.acm.org/doi/10.1145/3711542.3711594)
- *Improving Indigenous Language MT with Synthetic Data and Language-Specific Preprocessing* — [arXiv 2601.03135](https://arxiv.org/pdf/2601.03135)
- *High-Quality Data Augmentation for Low-Resource NMT (Translation Memory + GAN + Filtering)* — [arXiv 2408.12079](https://arxiv.org/abs/2408.12079)
- *Self-Evolution Knowledge Distillation for LLM-based MT* — [arXiv 2412.15303](https://arxiv.org/abs/2412.15303)
- No Language Left Behind team (2022). *NLLB-200: Scaling Human-Centered MT* — [arXiv 2207.04672](https://arxiv.org/pdf/2207.04672)
- *Toward Low-Resource Languages MT: Language-Specific Fine-Tuning with LoRA* — [ResearchGate 389729899](https://www.researchgate.net/publication/389729899)
- Durdyyev. *Fine-Tuning NLLB-200 with LoRA on a 650-Sentence Turkmen–English Corpus* — [Medium](https://medium.com/@meinnps/fine-tuning-nllb-200-with-lora-on-a-650-sentence-turkmen-english-corpus-082f68bdec71)
- *Findings of the AmericasNLP 2024 Shared Task on MT into Indigenous Languages* — [ACL 2024.americasnlp-1.28](https://aclanthology.org/2024.americasnlp-1.28/)
- *Findings of the AmericasNLP 2025 Shared Tasks* — [ACL 2025.americasnlp-1.16](https://aclanthology.org/2025.americasnlp-1.16/)
- Zhang et al. *ChrEn: Cherokee–English MT for Endangered Language Revitalization* — [arXiv 2010.04791](https://arxiv.org/pdf/2010.04791); *ChrEnTranslate* demo — [arXiv 2107.14800](https://arxiv.org/pdf/2107.14800)
- *Onception: Active Learning with Expert Advice for Real-World MT* — [MIT Press CL 2023](https://direct.mit.edu/coli/article/49/2/325/114185) · [arXiv 2203.04507](https://arxiv.org/pdf/2203.04507)
- *Efficient MT Corpus Generation: HITL Post-Editing with LLMs* — [arXiv 2502.12755](https://arxiv.org/html/2502.12755v1)
- *Evaluating Extremely Low-Resource MT: chrF++ vs BLEU* — [arXiv 2602.17425](https://arxiv.org/html/2602.17425v1)
- *COMET for Low-Resource MT Evaluation (English–Maltese, Spanish–Basque)* — [ACL 2024.lrec-main.315](https://aclanthology.org/2024.lrec-main.315/)
- *How Good is Zero-Shot MT Evaluation for Low-Resource Indian Languages?* — [arXiv 2406.03893](https://arxiv.org/pdf/2406.03893)
- *Investigating NMT for Low-Resource Languages: Bavarian Case Study* — [arXiv 2404.08259](https://arxiv.org/html/2404.08259v1)
- *The CARE Principles for Indigenous Data Governance* — [Data Science Journal 2020](https://datascience.codata.org/articles/dsj-2020-043); *Operationalizing CARE + FAIR* — [Nature Sci Data](https://www.nature.com/articles/s41597-021-00892-0)
- *Understanding the First Nations Principles of OCAP®* — [Environics/FNIGC](https://community.environicsanalytics.com/hc/en-us/articles/19376737814541-2-Understanding-The-First-Nations-Principles-of-OCAP)
- Bird (2024). *"It's how you do things that matters": Attending to Process to Better Serve Indigenous Communities with Language Technologies* — [arXiv 2402.02639](https://arxiv.org/pdf/2402.02639)
- *Machine Learning for Endangered Language Preservation* — [TRENDS Research](https://trendsresearch.org/insight/machine-learning-for-endangered-language-preservation/)
