---
language:
- en
- mic
license: cc-by-nc-4.0
task_categories:
- translation
pretty_name: MobTranslate Mi'kmaq Listuguj v3.3 research data
tags:
- migmaq
- mikmaq
- listuguj
- low-resource
- machine-translation
---

# MobTranslate Mi'kmaq Listuguj v3.3 research data

This dataset repository (`@@DATASET_REPO@@`) contains the exact
19,200-presentation training schedule for the selected seed-17 v3.3 recipe, a
deduplicated 6,247-row source pool, the frozen development and opened-regression
sets, the one-shot sealed Listuguj lesson-source test, and the complete
14,438-entry lexical diagnostic census. Manifests and SHA-256 checksums are
included.

The frozen dataset release tag is `@@DATASET_REVISION@@`.

## Files

- `training/dialog40-seed17-600-steps.eng-mic.jsonl`: exact optimizer-order
  schedule; repeated presentations are intentional.
- `training/unique-source-pool.eng-mic.jsonl`: one row per schedule source.
- `evaluation/`: sentence, lesson, sealed, and lexical diagnostic sets.
- `provenance/`: source manifests and frozen experimental contracts.

Every JSONL row preserves source identifiers and task metadata. Model-facing
inputs are unprefixed English and targets use the Listuguj orthography represented
by the sources. The sealed test was opened once only after a multi-seed recipe
passed its frozen development gate.

## Limits

The data is concentrated in dictionary examples and one pedagogical lesson
repository. It is not speaker-diverse and does not establish broad dialect,
genre, discourse, or population coverage. Lexical rows are diagnostics and do
not authorize neural dictionary answers.

## License

Mi'gmaq Online-derived material is CC BY-NC 4.0. Listuguj lesson material is
CC BY 4.0. The combined release is therefore CC BY-NC 4.0 and noncommercial.
