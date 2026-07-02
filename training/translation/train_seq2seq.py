#!/usr/bin/env python3
"""Fine-tune a generic seq2seq model for MobTranslate JSONL rows."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import sacrebleu
import torch
from datasets import DatasetDict, load_dataset
from transformers import (
    AutoModelForSeq2SeqLM,
    AutoTokenizer,
    DataCollatorForSeq2Seq,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    set_seed,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-file", required=True)
    parser.add_argument("--validation-file", required=True)
    parser.add_argument("--test-file")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--base-model", default="google/byt5-small")
    parser.add_argument("--model-id", default="mobtranslate/kuku-yalanji-seq2seq")
    parser.add_argument("--direction", default="eng-gvn")
    parser.add_argument("--max-source-length", type=int, default=384)
    parser.add_argument("--max-target-length", type=int, default=384)
    parser.add_argument("--max-train-samples", type=int)
    parser.add_argument("--max-validation-samples", type=int)
    parser.add_argument("--max-test-samples", type=int)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--epochs", type=float, default=20)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--gradient-accumulation-steps", type=int, default=2)
    parser.add_argument("--warmup-ratio", type=float, default=0.0)
    parser.add_argument("--weight-decay", type=float, default=0.0)
    parser.add_argument("--save-steps", type=int, default=100)
    parser.add_argument("--save-total-limit", type=int, default=2)
    parser.add_argument("--eval-steps", type=int, default=100)
    parser.add_argument("--logging-steps", type=int, default=20)
    parser.add_argument("--generation-num-beams", type=int, default=1)
    parser.add_argument("--generation-no-repeat-ngram-size", type=int, default=0)
    parser.add_argument("--generation-repetition-penalty", type=float, default=1.0)
    parser.add_argument("--generation-length-penalty", type=float, default=1.0)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--shuffle-before-cap", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--trust-remote-code", action=argparse.BooleanOptionalAction, default=False)
    parser.add_argument("--gradient-checkpointing", action=argparse.BooleanOptionalAction, default=False)
    return parser.parse_args()


def normalize_text(text: Any) -> str:
    return " ".join(str(text or "").split())


def load_json_dataset(train_file: str, validation_file: str, test_file: str | None) -> DatasetDict:
    data_files: dict[str, str] = {"train": train_file, "validation": validation_file}
    if test_file:
        data_files["test"] = test_file
    return load_dataset("json", data_files=data_files)  # type: ignore[return-value]


def cap_split(dataset: DatasetDict, split: str, max_samples: int | None, *, seed: int, shuffle: bool) -> None:
    if max_samples is None or split not in dataset:
        return
    rows = dataset[split]
    if shuffle:
        rows = rows.shuffle(seed=seed)
    dataset[split] = rows.select(range(min(max_samples, len(rows))))


def main() -> None:
    args = parse_args()
    set_seed(args.seed)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=args.trust_remote_code)
    model = AutoModelForSeq2SeqLM.from_pretrained(
        args.base_model,
        trust_remote_code=args.trust_remote_code,
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else None,
    )
    if args.gradient_checkpointing:
        model.config.use_cache = False
        model.gradient_checkpointing_enable()
    model.generation_config.num_beams = args.generation_num_beams
    model.generation_config.no_repeat_ngram_size = args.generation_no_repeat_ngram_size
    model.generation_config.repetition_penalty = args.generation_repetition_penalty
    model.generation_config.length_penalty = args.generation_length_penalty

    dataset = load_json_dataset(args.train_file, args.validation_file, args.test_file)
    dataset = dataset.filter(lambda row: row.get("direction") == args.direction)
    cap_split(dataset, "train", args.max_train_samples, seed=args.seed, shuffle=args.shuffle_before_cap)
    cap_split(dataset, "validation", args.max_validation_samples, seed=args.seed + 1, shuffle=args.shuffle_before_cap)
    cap_split(dataset, "test", args.max_test_samples, seed=args.seed + 2, shuffle=args.shuffle_before_cap)
    split_rows = {split: len(rows) for split, rows in dataset.items()}

    def preprocess(batch: dict[str, list[str]]) -> dict[str, Any]:
        model_inputs = tokenizer(
            [normalize_text(text) for text in batch["input_text"]],
            max_length=args.max_source_length,
            truncation=True,
        )
        labels = tokenizer(
            text_target=[normalize_text(text) for text in batch["output_text"]],
            max_length=args.max_target_length,
            truncation=True,
        )
        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    tokenized = dataset.map(
        preprocess,
        batched=True,
        remove_columns=dataset["train"].column_names,
        desc="Tokenizing",
    )

    data_collator = DataCollatorForSeq2Seq(tokenizer=tokenizer, model=model, label_pad_token_id=-100)

    def compute_metrics(eval_pred: Any) -> dict[str, float]:
        preds, labels = eval_pred
        if isinstance(preds, tuple):
            preds = preds[0]
        preds = np.asarray(preds)
        preds = np.where((preds >= 0) & (preds < len(tokenizer)), preds, tokenizer.pad_token_id)
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)
        decoded_preds = [normalize_text(text) for text in tokenizer.batch_decode(preds, skip_special_tokens=True)]
        decoded_labels = [normalize_text(text) for text in tokenizer.batch_decode(labels, skip_special_tokens=True)]
        bleu = sacrebleu.corpus_bleu(decoded_preds, [decoded_labels]).score
        chrf = sacrebleu.corpus_chrf(decoded_preds, [decoded_labels], word_order=2).score
        return {"bleu": bleu, "chrf": chrf}

    bf16 = torch.cuda.is_available() and torch.cuda.is_bf16_supported()
    training_args = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        overwrite_output_dir=True,
        eval_strategy="steps",
        save_strategy="steps",
        eval_steps=args.eval_steps,
        save_steps=args.save_steps,
        logging_steps=args.logging_steps,
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation_steps,
        num_train_epochs=args.epochs,
        warmup_ratio=args.warmup_ratio,
        weight_decay=args.weight_decay,
        predict_with_generate=True,
        generation_max_length=args.max_target_length,
        generation_num_beams=args.generation_num_beams,
        fp16=torch.cuda.is_available() and not bf16,
        bf16=bf16,
        report_to="tensorboard",
        load_best_model_at_end=True,
        metric_for_best_model="chrf",
        greater_is_better=True,
        save_total_limit=args.save_total_limit,
        gradient_checkpointing=args.gradient_checkpointing,
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )

    train_result = trainer.train()
    trainer.save_model(str(output_dir / "merged"))
    tokenizer.save_pretrained(str(output_dir / "merged"))

    metrics = {"train": train_result.metrics, "validation": trainer.evaluate(tokenized["validation"])}
    if "test" in tokenized:
        metrics["test"] = trainer.evaluate(tokenized["test"], metric_key_prefix="test")

    manifest = {
        "model_id": args.model_id,
        "version": "0.1.0",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "base_model": args.base_model,
        "direction": args.direction,
        "dataset": {
            "train_file": os.path.abspath(args.train_file),
            "validation_file": os.path.abspath(args.validation_file),
            "test_file": os.path.abspath(args.test_file) if args.test_file else None,
            "split_rows": split_rows,
            "max_train_samples": args.max_train_samples,
            "max_validation_samples": args.max_validation_samples,
            "max_test_samples": args.max_test_samples,
            "shuffle_before_cap": args.shuffle_before_cap,
        },
        "training_args": {
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "gradient_accumulation_steps": args.gradient_accumulation_steps,
            "learning_rate": args.learning_rate,
            "warmup_ratio": args.warmup_ratio,
            "weight_decay": args.weight_decay,
            "seed": args.seed,
            "generation_num_beams": args.generation_num_beams,
            "generation_no_repeat_ngram_size": args.generation_no_repeat_ngram_size,
            "generation_repetition_penalty": args.generation_repetition_penalty,
            "generation_length_penalty": args.generation_length_penalty,
            "save_total_limit": args.save_total_limit,
            "gradient_checkpointing": args.gradient_checkpointing,
        },
        "metrics": metrics,
        "artifacts": {"merged_dir": str(output_dir / "merged")},
    }
    (output_dir / "model_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
