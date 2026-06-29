# PRD — Compounding Indigenous-language translation quality on MobTranslate

**Status:** Draft for engineering · **Date:** 2026-06-29 · **Owner:** MobTranslate
**Companion research:** [`translation-improvement-research-2026-06-29.md`](./translation-improvement-research-2026-06-29.md)

---

## 1. Purpose & thesis

Build a **compounding flywheel** that turns MobTranslate's existing assets — curated dictionaries, community audio, and the `word_improvement_suggestions` pipeline — into steadily improving translation, *per language*, while honoring community data governance.

> **Quality is driven by accumulating verified parallel sentences (and faithful augmentation of them), not by better prompts.** Vocabulary coverage and parallel examples — not grammar prose — predict translation quality (Aycock et al. 2024). The corrections pipeline is therefore the product's most valuable engine.

Three active languages, each at a different scale and morphology:

| Tribe | Region | Headwords | Morphology | Family transfer source | Governance frame |
|---|---|---:|---|---|---|
| **Kuku Yalanji** | FNQ, Australia | ~2,700 | suffixing, rich case/aspect | other Pama-Nyungan | ICIP |
| **Anindilyakwa** | Groote Eylandt, NT | ~590 | **polysynthetic**, noun classes | weak (near-isolate) | ICIP |
| **Mi'gmaq** | Atlantic Canada | ~13,000 | polysynthetic (Algonquian) | Cree/Ojibwe (Algonquian) | **OCAP®** |

*(Wajarri/`wbv` is paused; this PRD covers it only as a future onboarding once a community partner is engaged — it reuses all shared infra below.)*

---

## 2. Goals & success metrics

### 2.1 Platform-level goals
- **G1 — Gold pipeline:** every approved `translation`/`example` suggestion becomes a versioned, provenance-tagged gold pair.
- **G2 — Active learning:** the suggestion UI asks for the *highest-value* sentence next.
- **G3 — Faithful augmentation:** synthetic data multiplies gold ~5–15× with **zero invented vocabulary**.
- **G4 — Owned model:** move from per-call frontier (`gpt-5.4-mini`) to a fine-tuned NLLB-200 (LoRA) served model per language, with frontier as teacher/fallback.
- **G5 — Honest eval:** chrF++ + second metric, frozen regression sets, in-product human rubric; **no regressions ship**.
- **G6 — Governance:** consent-to-train, restriction flags, attribution, and withdrawal enforced end-to-end.

### 2.2 Success metrics (per tribe, tracked over time)

| Metric | Definition | Target trajectory |
|---|---|---|
| **Verified gold pairs** | approved translation/example suggestions | grows every phase (north-star input) |
| **Coverage** | % headwords with ≥1 verified example sentence | KY 30%→70%; Anin 50%→90%; Mig 10%→40% |
| **chrF++** on frozen regression set | held-out, never trained | monotone non-decreasing each release |
| **Human rubric** | adequacy/fluency/morphology/cultural-fit (1–5) by fluent speakers | ≥ +0.3 avg per major phase |
| **Round-trip pass rate** | en→X→en within threshold | rising |
| **Cost / 1k translations** | served model cost | ↓ after G4 (distillation) |
| **Active contributors** | distinct community members with an approved suggestion / month | rising (rate-limiting input) |

> **Note:** the binding constraint is **fluent-contributor throughput**, not modeling. Phase gates are written around accumulating *verified* data, and most "build" work exists to make that accumulation cheaper and safer.

---

## 3. Starting point (asset audit) per tribe

All three already have: dictionary (words, definitions, English translations, word classes, phonetic transcriptions, place-names+coords), community audio (per word + per example), the suggestion system (6 types), and the LLM translate endpoint (full-dictionary-into-prompt, `gpt-5.4-mini`).

| Asset | Kuku Yalanji | Anindilyakwa | Mi'gmaq |
|---|---|---|---|
| Headwords | ~2,700 | ~590 | ~13,000 |
| Fits full dict in context? | ✓ | ✓ | **✗ (needs RAG)** |
| Seed example sentences | moderate | few | many but lexical-heavy |
| FST / morph analyzer | none yet | none yet (high value) | partial exists in literature (Algonquian) |
| Transfer base | Pama-Nyungan | weak | Algonquian (Cree/Ojibwe) |
| Audio for ASR mining | growing | growing + TTS scaffold | growing |
| Legacy OCR opportunity | mission wordlists | mission/linguist records | substantial documented corpus |

---

## 4. Shared platform roadmap (cross-tribe infra)

Build once, reuse for all languages (and future Wajarri). Each item maps to a research §.

| Component | What it is | Research § |
|---|---|---|
| **Gold pair store** | versioned table of verified pairs: `lang, src, tgt, field_type, contributor, curator, provenance(human|synthetic), restriction, created_at, version`; sourced from approved suggestions | §2.1 |
| **Active-learning selector** | service that ranks unverified sentences by (coverage gap × round-trip divergence × frequency) and feeds the suggestion UI ("help translate this") | §2.2 |
| **Synthetic-data pipeline** | dictionary-constrained templating + back-translation; round-trip + **OOV-rejection** filters; mandatory human spot-check; tags `provenance=synthetic` | §3 |
| **Grounding layer** | full-dict injection (small langs) + **RAG retriever** (Mi'gmaq); gloss-then-translate; FST/lexically-constrained decoding hook | §4 |
| **Fine-tuning loop** | NLLB-200 (600M distilled) + **LoRA** per language; distillation from frontier teacher; model registry + rollback | §3.2, §5 |
| **Eval harness** | chrF++ + second metric; frozen per-language regression set; in-product human rubric; CI gate "no regression ships" | §6 |
| **Governance layer** | `consent_to_train` per language; `restriction` field excludes from train+output; attribution; withdrawal → retrain/retire | §8 |

**Ordering of shared build:** Gold store → Eval harness → Active-learning selector → Synthetic pipeline → RAG → Fine-tuning loop. (Eval is built early so every later change is measured.)

---

## 5. Phased plan (with per-tribe tailoring)

Timelines are **rough, contributor-throughput-bound** estimates for a small team; gates, not dates, advance phases.

### Phase 0 — Foundations & instrumentation *(now → ~4 weeks)*
**Build:** Gold pair store (G1); promote existing approved suggestions into it; **eval harness** + freeze a regression set per language; baseline chrF++ for the current `gpt-5.4-mini` full-dict prompt; **governance v1** — add `consent_to_train` (per language, default off) and `restriction` flag; ensure restricted items are excluded from any export.
**Data:** snapshot current verified examples per language → first gold sets.
**Models/techniques:** none changed; measure baseline only.
**Eval gate:** reproducible chrF++ + human-rubric baseline recorded for all three; regression sets frozen and access-controlled.
**Governance checkpoint:** confirm with each community partner that *display* consent ≠ *train* consent; obtain (or scope) train-consent conversations. **No training on any language without consent.**

### Phase 1 — Corrections-as-data + active learning *(~1–2 months)*
**Build:** wire approved `translation`/`example` suggestions to auto-promote into gold (G1 complete); ship the **active-learning selector** (G2) — surface coverage-gap and round-trip-divergent sentences in the suggestion UI; add **gamification** (per-language coverage bar, streaks, "verify the word of the day," badges); curator dashboard for throughput.
**Data:** steady inflow of verified pairs; prioritize **coverage** (every headword → ≥1 verified example).
**Models/techniques:** keep full-dict prompt; add **round-trip QE** display (ChrEnTranslate-style) to flag low-confidence outputs for correction.
**Eval gate:** verified-pair count and coverage rising for ≥4 consecutive weeks; chrF++ on regression set ≥ baseline (no regression).
**Per-tribe:**
- *Anindilyakwa (~590):* coverage to 90% is achievable fastest — make it the demo of the flywheel. Prioritize closed-class/noun-class examples.
- *Kuku Yalanji (~2,700):* drive coverage 30%→50%+; the best near-term fine-tuning candidate.
- *Mi'gmaq (~13,000):* coverage % will move slowly; focus on *high-frequency* headwords first; begin RAG design (full dict won't fit context — known limit).
**Governance checkpoint:** attribution visible on every gold pair; contributors credited.

### Phase 2 — Faithful synthetic augmentation + grounding *(~2–3 months)*
**Build:** **synthetic-data pipeline** (G3) — dictionary-constrained templating (substitute attested same-class headwords into real example frames) + **back-translation** over monolingual Indigenous text (incl. ASR-transcribed audio); filters = round-trip consistency + **auto-reject any OOV Indigenous token** + **human spot-check of every batch**; tag `provenance=synthetic`, never outranks human gold. **Grounding upgrades:** gloss-then-translate prompt; for **Mi'gmaq ship RAG** (retrieve relevant entries+examples by lexical+embedding match) since full-dict no longer fits.
**Data:** gold ×5–15 in faithful synthetic pairs per language; new monolingual text mined from audio (forced alignment/ASR).
**Models/techniques:** back-translation, templating, paraphrase aug, round-trip filtering, RAG (Mi'gmaq), gloss-augmented ICL.
**Eval gate:** synthetic batches pass human spot-check (≥ agreed accuracy, e.g. ≥95% no-fabrication); chrF++ + human rubric improve vs Phase 1 **with no regression**; Mi'gmaq RAG ≥ full-dict-truncation baseline.
**Per-tribe:**
- *Anindilyakwa:* begin a **partial FST** (noun-class prefixes, closed-class affixes) to constrain templating + decoding — disproportionately valuable given polysynthesis.
- *Kuku Yalanji:* templating yields the largest faithful synthetic set (mid vocab, regular suffixing).
- *Mi'gmaq:* lean on **transfer from Algonquian** + RAG; reuse existing Algonquian morphology resources where licensing/community permission allows.
**Governance checkpoint:** restricted/sacred items confirmed excluded from monolingual mining and synthetic generation; cultural_context suggestions reviewed by elders.

### Phase 3 — Owned served model (distillation + LoRA) *(~3–4 months, per tribe as data allows)*
**Build:** **fine-tuning loop** (G4) — fine-tune NLLB-200 (600M distilled) per language with **LoRA** on gold + filtered synthetic; **distill** the frontier teacher (`gpt-5.4`/o-series) into the served student; model registry + one-click rollback; serve the fine-tuned model with frontier as fallback for OOV/low-confidence.
**Data:** each language's accumulated gold + synthetic (see research §7.1 scaling table).
**Models/techniques:** NLLB-200 + LoRA, knowledge distillation, lexically-constrained decoding (terminology enforcement from dictionary), transfer warm-start from family base.
**Eval gate:** fine-tuned model **≥ frontier-full-dict baseline on chrF++ AND human rubric on the frozen regression set**, at lower cost/translation; otherwise stay on frontier and keep gathering data.
**Per-tribe:**
- *Kuku Yalanji:* **first** to fine-tune (best data/morphology balance).
- *Anindilyakwa:* fine-tune only with FST-constrained decoding; smallest data → expect to rely on augmentation + constraints heavily; may stay teacher-in-the-loop longer.
- *Mi'gmaq:* highest ceiling but needs the most gold; warm-start from Algonquian, then LoRA; RAG stays on at inference.
**Governance checkpoint:** explicit **consent_to_train confirmed** before any fine-tune; trained-model card lists data sources + restrictions; withdrawal path tested (revoke data → retrain/retire).

### Phase 4 — Continuous improvement & expansion *(ongoing)*
**Build:** close the loop fully — production errors feed active learning automatically; scheduled re-fine-tune as gold grows; **OCR ingestion** of legacy dictionaries/texts (permission-gated) to grow lexicon+corpus; TTS/ASR co-improvement (audio mines text; better text improves TTS); onboard new languages (e.g. Wajarri) via the shared infra.
**Eval gate:** per-release regression CI green; quarterly community review of quality + governance.
**Governance checkpoint:** periodic community re-consent; benefit-sharing (models/exports accessible to communities).

---

## 6. Per-tribe summary timeline

| Phase | Kuku Yalanji | Anindilyakwa | Mi'gmaq |
|---|---|---|---|
| **0** Foundations | gold + baseline + regression set | same | same + **RAG design** (dict won't fit context) |
| **1** Corrections + active learning | coverage 30%→50%; flywheel live | **coverage →90%** (flagship demo) | high-freq coverage; RAG build |
| **2** Synthetic + grounding | largest templated synthetic set | **partial FST** + constrained templating | **RAG shipped** + Algonquian transfer |
| **3** Owned model | **first to LoRA-fine-tune** | FST-constrained; teacher-in-loop longer | warm-start Algonquian → LoRA; RAG at inference |
| **4** Continuous | re-fine-tune cadence; OCR | TTS/ASR co-loop; OCR | scale gold; OCR (rich legacy corpus) |

---

## 7. Dependencies & risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Too few fluent contributors** (the real bottleneck) | flywheel stalls regardless of modeling | gamification, curator tooling, AI-drafted suggestions for humans to accept/edit, partner with language centres/schools |
| **Synthetic data fabricates vocabulary** | poisons gold, erodes trust | dictionary-constrained generation, OOV auto-reject, mandatory human spot-check, provenance tags, gold > synthetic ranking |
| **Metric mirage** (BLEU/COMET unreliable here) | ship "improvements" that aren't | chrF++ headline + second metric + **human rubric** as the real gate; never trust one number on tiny sets |
| **Mi'gmaq dict exceeds context** | full-dict prompt breaks at scale | RAG from Phase 1 design / Phase 2 ship |
| **Polysynthesis (Anin/Mig)** breaks word-level approaches | wrong/illegal surface forms | FST + lexically-constrained decoding; gloss-then-translate |
| **Governance breach** (sacred/restricted data trained or leaked) | unacceptable; breaks community trust | restriction flags exclude from train+output; consent-to-train gate; withdrawal→retrain/retire; elder review of cultural_context |
| **Frontier cost / API dependence** | unbounded per-call cost at scale | distill to owned NLLB+LoRA in Phase 3; frontier as fallback only |
| **Regression on update** | quality silently drops | frozen regression set in CI; no-regression ship rule; model registry + rollback |
| **Orthographic variation** splinters tiny data | weaker training/retrieval | normalization preprocessing as first-class step (Anin bridge already exists) |

---

## 8. Out of scope (for this PRD)
- Speech-to-speech translation (depends on mature ASR/TTS — Phase 4+).
- New language onboarding beyond Wajarri reactivation (handled by shared infra when partners engage).
- Real-time/streaming translation latency optimization (after owned model lands).

---

## 9. Definition of done (per tribe)
A language reaches **steady-state** when: (1) approved corrections auto-flow into versioned gold; (2) the active-learning selector drives coverage toward target; (3) faithful synthetic augmentation is running with passing spot-checks; (4) an **owned fine-tuned model beats the frontier baseline on the frozen regression set at lower cost** (or is consciously deferred with frontier-in-loop); (5) every governance gate (consent, restriction, attribution, withdrawal) is enforced and community-reviewed.
