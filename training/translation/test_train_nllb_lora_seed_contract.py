from __future__ import annotations

import ast
from pathlib import Path


def test_training_arguments_receive_the_declared_cli_seed() -> None:
    source_path = Path(__file__).with_name("train_nllb_lora.py")
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "Seq2SeqTrainingArguments"
    ]
    assert len(calls) == 1

    arguments = {keyword.arg: keyword.value for keyword in calls[0].keywords}
    for name in ("seed", "data_seed"):
        value = arguments[name]
        assert isinstance(value, ast.Attribute)
        assert isinstance(value.value, ast.Name)
        assert value.value.id == "args"
        assert value.attr == "seed"
