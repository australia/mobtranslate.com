#!/usr/bin/env python3
"""Add every form of Patz's personal pronoun paradigm (Table 3.6) to lexemes.json.

The paradigm exists in grammar.md only as an OCR table, which is hard to read
reliably. This script reads that table and records each cell as a
grammar-documented form with its person, case and plain-English meaning, so
the translation checker can confirm forms such as ngaykunji 'with me'.

Idempotent: re-running replaces the entries it previously added.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
GRAMMAR = HERE / "grammar.md"
LEXEMES = HERE / "lexemes.json"
SOURCE = "Patz Table 3.6 (personal pronoun paradigm)"

# Column order of the table's data cells, as laid out in Table 3.6.
CASES = [
    ("nominative", "{nom} (the one doing the action or being described)"),
    ("accusative, Yalanji", "{acc} (the one affected by the action)"),
    ("accusative, Nyungkul", "{acc} (the one affected by the action; Nyungkul dialect)"),
    ("dative", "to or for {acc}"),
    ("locative", "at, to or with {acc} (also used for speaking to someone)"),
    ("ablative", "from {acc}"),
    ("comitative", "with {acc}; having {acc}"),
    ("possessive", "{poss}"),
]

# Row order within each block of Table 3.6 and the English for each person.
PERSONS = {
    "Sg": [
        ("1sg", "I", "me", "my, mine"),
        ("2sg", "you (one person)", "you (one person)", "your (one person)"),
        ("3sg", "he, she or it", "him, her or it", "his, her or its"),
    ],
    "Du": [
        ("1du exclusive", "we two (not you)", "us two (not you)", "our (two, not yours)"),
        ("1du inclusive", "we two (you and I)", "us two (you and me)", "our (yours and mine)"),
        ("2du", "you two", "you two", "your (two people)"),
        ("3du", "they two", "them two", "their (two people)"),
    ],
    "Pl": [
        ("1pl exclusive", "we (not you)", "us (not you)", "our (not yours)"),
        ("1pl inclusive", "we all (including you)", "us all (including you)", "our (including yours)"),
        ("2pl", "you all", "you all", "your (several people)"),
        ("3pl", "they", "them", "their"),
    ],
}


def table_lines(text: str) -> list[str]:
    lines = text.splitlines()
    caption = next(i for i, line in enumerate(lines) if "Table 3.6:** Personal pronoun paradigm" in line)
    start = caption
    while start > 0 and not lines[start - 1].startswith("| Sg."):
        start -= 1
    block = []
    for line in lines[start - 1 : caption]:
        if line.startswith("| Sg.") or line.startswith("| Du.") or line.startswith("| Pl."):
            block.append(line)
    return block


def clean_form(raw: str) -> str:
    form = re.sub(r"[()*]", "", raw).strip()
    # OCR reads the 3pl base jana- (Table 3.7) as "iana"; the language has no
    # word-initial i.
    if form.startswith("ia"):
        form = "j" + form[1:]
    return form


def paradigm_entries() -> list[dict]:
    entries = []
    for line in table_lines(GRAMMAR.read_text(encoding="utf-8")):
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        block = cells[0].split(".")[0]
        persons = PERSONS[block]
        for column, (case_label, meaning) in enumerate(CASES):
            forms = [f for f in re.split(r"<br>", cells[column + 1]) if f.strip()]
            for row, raw in enumerate(forms):
                alternative = raw.strip().startswith("(")
                person_index = row if not alternative else len(forms) - 2
                if person_index >= len(persons):
                    continue
                person, nom, acc, poss = persons[person_index]
                form = clean_form(raw)
                gloss = meaning.format(nom=nom, acc=acc, poss=poss)
                entries.append(
                    {
                        "root": form,
                        "surface": form,
                        "gloss": f"{gloss} ({person} {case_label})",
                        "pos": "personal-pronoun",
                        "source": SOURCE,
                        "confidence": "high",
                    }
                )
    return entries


def main() -> None:
    lexemes = json.loads(LEXEMES.read_text(encoding="utf-8"))
    kept = [entry for entry in lexemes if entry.get("source") != SOURCE]
    added = paradigm_entries()
    LEXEMES.write_text(json.dumps(kept + added, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"lexemes.json: kept {len(kept)}, added {len(added)} paradigm forms")


if __name__ == "__main__":
    main()
