---
language:
- en
- mic
license: cc-by-nc-4.0
library_name: peft
pipeline_tag: translation
base_model: @@BASE_REPO@@
tags:
- nllb
- migmaq
- mikmaq
- listuguj
- research
datasets:
- @@DATASET_REPO@@
model-index:
- name: MobTranslate Mi'kmaq Listuguj v3.3
  results:
  - task:
      type: translation
      name: English to Listuguj Mi'kmaq
    dataset:
      name: Held-out Listuguj lesson-source test
      type: @@DATASET_REPO@@
      split: test
    metrics:
    - type: chrf
      value: 28.148747271778042
      name: chrF++
    - type: bleu
      value: 7.808362411258161
      name: SacreBLEU
---

# MobTranslate Mi'kmaq Listuguj v3.3

This is a **noncommercial research LoRA** for English-to-Mi'kmaq sentence
translation in the Listuguj orthography. It is the best candidate from the
MobTranslate v3.3 dialog-only experiment, selected prospectively across seeds
17, 42, and 73 and tested once on a sealed 133-sentence lesson-source split.

It is **not a reliable general translator**. It has not received fluent-speaker
review, has not been tested across independent speakers, and makes material
lexical, kinship, person/number, and inflection errors. Do not use its output as
authoritative language, or for health, legal, educational-assessment,
ceremonial, or other consequential communication.

## Intended use

- Reproducible low-resource machine-translation research.
- Comparing decoder, adaptation, retrieval, and human-review methods.
- Producing explicitly labelled drafts for expert review.

Known dictionary queries should use deterministic dictionary lookup. This model
reconstructed only 1 of 14,438 eligible dictionary records exactly in its full
development census; neural lexical recall is not a dictionary service.

## Usage

```bash
python -m pip install -r requirements.txt
python inference.py "Who is this?"
```

```python
from peft import PeftModel
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

base_id = "@@BASE_REPO@@"
model_id = "@@MODEL_REPO@@"
base_revision = "@@BASE_REVISION@@"
model_revision = "@@MODEL_REVISION@@"
tokenizer = AutoTokenizer.from_pretrained(
    model_id,
    revision=model_revision,
    src_lang="eng_Latn",
    tgt_lang="mic_Latn",
)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
base = AutoModelForSeq2SeqLM.from_pretrained(
    base_id,
    revision=base_revision,
    torch_dtype=torch.bfloat16,
)
base.resize_token_embeddings(len(tokenizer))
model = PeftModel.from_pretrained(
    base, model_id, revision=model_revision
).to(device).eval()
inputs = tokenizer("Who is this?", return_tensors="pt").to(device)
output = model.generate(
    **inputs,
    forced_bos_token_id=256204,
    max_new_tokens=192,
    num_beams=4,
    do_sample=False,
    no_repeat_ngram_size=3,
    repetition_penalty=1.1,
    length_penalty=1.0,
)
print(tokenizer.decode(output[0], skip_special_tokens=True))
```

The custom target token is `mic_Latn` at immutable tokenizer ID `256204`.
Inputs are unprefixed English sentences. The published generation contract is
beam search with 4 beams, no sampling, a 3-token no-repeat n-gram guard,
repetition penalty 1.1, and length penalty 1.0.

The evaluated runtime used BF16. Loading in float32 or changing hardware,
library versions, batching, or decoder settings can change beam-search outputs.

## Training

The selected rank-32 LoRA was trained for 600 optimizer updates at effective
batch size 32 from the exact MobTranslate Mi'kmaq v1 checkpoint. Its 19,200
presentations comprised 11,520 source-attested Mi'gmaq Online dictionary-example
sentences and 7,680 source-attested Listuguj lesson-dialog sentences. The
schedule contains 6,247 unique source rows, 261,363 source tokens, 340,491 target
tokens, and no truncated presentations. AdamW used learning rate `5e-5`, 48
warmup updates, and seed 17. LoRA targeted `q_proj`, `k_proj`, `v_proj`,
`out_proj`, `fc1`, and `fc2` with rank 32, alpha 64, and dropout 0.05.

## Evaluation

The fixed decoder was used for all comparisons.

| Endpoint | Base | Step-matched retention | v3.3 candidate |
| --- | ---: | ---: | ---: |
| Sealed chrF++ (133 rows) | 22.3450 | 23.3204 | **28.1487** |
| Sealed SacreBLEU | 6.3032 | 5.6464 | **7.8084** |

Candidate minus retention chrF++ was `+4.8284`; the paired-row bootstrap 90%
lower bound was `+3.2820`. A component bootstrap over 13 connected lesson
components gave a 95% interval of `[+2.7147, +8.0593]`; 11 of 13 components
were positive. Across the paired seed-17/42/73 development runs, mean dialog
gain was `+4.2962` chrF++ with a hierarchical 90% interval of
`[+2.8998, +5.7880]`.

The sealed gain is concentrated in dialogue: `+6.1099` chrF++ over retention on
101 dialogue rows, versus `+0.6003` on 32 vocabulary-container phrases. Of 133
sealed rows, 80 improved, 14 tied, and 39 worsened by sentence-level chrF++.
Only 3 outputs exactly matched the single reference. These metrics come from one
pedagogical repository and are not estimates of general population reliability.

Full machine-readable comparisons, prediction diagnostics, bootstrap settings,
metric signatures, contracts, and hashes are under `evaluation/` and
`provenance/`. The adapter SHA-256 is
`82d4c0d18ad14b2ae7c8a3684053815ebf54a402a953dd4c7d01e9e69307b687`.

The adapter release tag is `@@MODEL_REVISION@@`; it must be loaded over
`@@BASE_REPO@@` at tag `@@BASE_REVISION@@`. A BF16 merged checkpoint was
explicitly rejected because its beam-search generations differed from direct
adapter execution on 3 of 6 fixed probes. The adapter is the artifact that was
actually evaluated.

The staged base-plus-adapter package passed a separate six-input CPU-BF16 load
smoke: all artifact and tokenizer hashes matched, all outputs were nonblank,
target-prefixed, non-copies, and EOS-terminated. Exact cross-runtime text is not
a release gate because beam outputs can change with batching, hardware, and
numeric kernels; the sealed metrics above come only from the frozen GPU
evaluation files.

## Sources and license

- Base architecture: `facebook/nllb-200-distilled-600M`, CC BY-NC 4.0.
- Mi'gmaq Online material: CC BY-NC 4.0.
- Listuguj lesson material: CC BY 4.0, source commit
  `c424e98c3d87c3890618fd63cdf5af7ad22b3009`.

The combined checkpoint is released under CC BY-NC 4.0. Commercial use is not
permitted under the inherited terms. Application-code licenses do not override
the model or dataset licenses.

## Release decision

Research publication preserves the exact evaluated base-plus-adapter execution.
Homepage routing and production API use remain **not authorized** by this
release. The deterministic dictionary route remains separate.
