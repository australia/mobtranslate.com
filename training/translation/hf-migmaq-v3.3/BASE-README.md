---
language:
- en
- mic
license: cc-by-nc-4.0
library_name: transformers
pipeline_tag: translation
base_model: facebook/nllb-200-distilled-600M
tags:
- nllb
- migmaq
- listuguj
- research
---

# MobTranslate Mi'kmaq Listuguj v1 adapter base

`@@BASE_REPO@@` is the immutable custom-vocabulary base required to reproduce
the v3.3 compact LoRA release. It is published as a dependency and historical
research artifact, not as the recommended translator. Its `mic_Latn` token is
ID 256204. The frozen release tag is `@@BASE_REVISION@@`. Use
`@@MODEL_REPO@@` for the selected compact adapter.

The model descends from `facebook/nllb-200-distilled-600M` and is licensed
CC BY-NC 4.0. It is noncommercial research software, not an authoritative or
speaker-validated translation service.
