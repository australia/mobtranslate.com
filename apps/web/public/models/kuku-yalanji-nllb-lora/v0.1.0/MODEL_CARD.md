# Kuku Yalanji Translation v0.1.0

Status: training-ready, not yet trained.

## Intended Use

This release line is for MobTranslate English to Kuku Yalanji machine translation experiments and for community/research review of downloadable model artifacts after training.

## Base Model

- `facebook/nllb-200-distilled-600M`
- Training method: LoRA fine-tuning, with a merged model exported for simple downstream use.
- Language control: `eng_Latn` source and an added `gvn_Latn` Kuku Yalanji control token.

## Dataset

- `kuku_yalanji_ebible_parallel_v0.1.0`
- Source: approved eBible Kuku Yalanji snapshot aligned to World English Bible and Noah Webster Bible.
- First run policy: exact verse and verse-range pairs only; sentence candidates remain available for later reviewed or experimental runs.
- Splits: deterministic by Bible reference, preventing the same reference from appearing in both training and evaluation through different English editions.

## Rights

The Kuku Yalanji eBible snapshot is marked `rights_granted` in MobTranslate Postgres. The project owner attested on 2026-06-30 that the corpus is approved for MobTranslate Kuku Yalanji model training use from this snapshot.

Final trained artifact release terms must also account for the base model license and any publication/distribution decision made by the project owner/community.

## Metrics

No metrics yet. The first RunPod run must publish:

- validation chrF++
- validation BLEU
- test chrF++
- test BLEU
- qualitative sample review notes

## Safety And Quality Notes

This model is expected to be a draft aid, not an authoritative translator. Public UI must keep source, version, and model status visible, and it must route corrections back into MobTranslate's review workflow.
