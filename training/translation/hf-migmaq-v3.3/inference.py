#!/usr/bin/env python3
"""Translate one English sentence with the frozen Mi'kmaq v3.3 decoder."""

import argparse

import torch
from peft import PeftModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


MODEL_ID = "@@MODEL_REPO@@"
BASE_ID = "@@BASE_REPO@@"
MODEL_REVISION = "@@MODEL_REVISION@@"
BASE_REVISION = "@@BASE_REVISION@@"
SOURCE_LANG = "eng_Latn"
TARGET_LANG = "mic_Latn"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("text")
    parser.add_argument("--model", default=MODEL_ID)
    parser.add_argument("--base", default=BASE_ID)
    parser.add_argument("--model-revision", default=MODEL_REVISION)
    parser.add_argument("--base-revision", default=BASE_REVISION)
    parser.add_argument(
        "--dtype", choices=("bfloat16", "float32"), default="bfloat16"
    )
    args = parser.parse_args()

    use_cuda = torch.cuda.is_available()
    if args.dtype == "bfloat16" and use_cuda and not torch.cuda.is_bf16_supported():
        raise RuntimeError("The selected CUDA device does not support bfloat16")
    dtype = torch.bfloat16 if args.dtype == "bfloat16" else torch.float32
    device = torch.device("cuda" if use_cuda else "cpu")
    tokenizer = AutoTokenizer.from_pretrained(
        args.model,
        revision=args.model_revision,
        src_lang=SOURCE_LANG,
        tgt_lang=TARGET_LANG,
    )
    base = AutoModelForSeq2SeqLM.from_pretrained(
        args.base,
        revision=args.base_revision,
        torch_dtype=dtype,
    )
    base.resize_token_embeddings(len(tokenizer))
    model = PeftModel.from_pretrained(
        base,
        args.model,
        revision=args.model_revision,
    )
    model.to(device).eval()
    target_id = int(tokenizer.convert_tokens_to_ids(TARGET_LANG))
    if target_id != 256204:
        raise RuntimeError(f"Unexpected mic_Latn token ID: {target_id}")
    encoded = tokenizer(
        args.text,
        return_tensors="pt",
        truncation=True,
        max_length=192,
    ).to(device)
    with torch.inference_mode():
        output = model.generate(
            **encoded,
            forced_bos_token_id=target_id,
            max_new_tokens=192,
            num_beams=4,
            do_sample=False,
            no_repeat_ngram_size=3,
            repetition_penalty=1.1,
            length_penalty=1.0,
        )
    print(tokenizer.decode(output[0], skip_special_tokens=True).strip())


if __name__ == "__main__":
    main()
