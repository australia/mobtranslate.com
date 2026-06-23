#!/usr/bin/env python3
"""Academic enrichment & correction engine for the Kuku Yalanji dictionary.

Every transformation is grounded in Patz, *A Grammar of the Kuku Yalanji Language*
(see framework.json, distilled from grammar.md) or in unambiguous structural/typo
patterns. The original Kuku Yalanji headwords, definitions and translations are
never fabricated; corrections come only from the curated, grounded tables below and
are recorded in each entry's `commentary` for traceability.

Deterministic stages (this file):
  1. key normalisation     — merge misspelled keys (defintions -> definitions, ...)
  2. curated corrections   — leaked-meaning `type` values, wrong pronoun definition
  3. POS normalisation     — `type` -> controlled vocabulary (Patz §3.1 word classes)
  4. example extraction     — pull "<Kuku>","<English>" pairs out of definition prose
  5. reduplication          — full / partial reduplication (§3.2.3.5, §3.8.5.5)
  6. verb_class             — conjugation from citation form (§3.8.3, Table 3.15)
  7. derivation             — clear verbal derivations (-ji- reflexive, causatives…)
  8. phonemic               — rule-based IPA from the orthography (§2.1)
  9. loanword               — attested English loans (§2.3, §3.12)
 10. gloss / see_also       — concise primary gloss; normalise cross-references
 11. empty-entry flag       — mark contentless stubs for human review (no deletion)

A later LLM pass (patches.json) adds semantic_domain, extra commentary, and POS for
ambiguous/typeless entries; it is applied additively in apply_patches.py.

Usage:  python3 enrich.py --dry-run   |   python3 enrich.py
"""
import argparse
import json
import os
import re
from collections import OrderedDict, Counter

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "dictionary.yaml")
FRAMEWORK = os.path.join(HERE, "framework.json")

# --- 1. key normalisation ---------------------------------------------------
KEY_CANON = {
    "defintions": "definitions", "defintiions": "definitions",
    "tyoe": "type",
    "syonyms": "synonyms", "synoynms": "synonyms",
    "translation": "translations", "translatians": "translations",
    "usage": "usages",
}

# --- 3. POS -> controlled vocabulary (Patz §3.1; data-corrected) ------------
# Canonical classes: noun, adjective, quantifier, transitive-verb,
# intransitive-verb, adverb, locational, temporal, personal-pronoun,
# interrogative, demonstrative, particle, interjection, associative.
POS_MAP = {
    "noun": "noun", "n": "noun", "kin": "noun", "kinship": "noun", "body": "noun",
    "generic": "noun", "classifier": "noun",
    "adjective": "adjective", "adj": "adjective", "a": "adjective",
    "color": "adjective", "colour": "adjective",
    "quantifier": "quantifier", "quant": "quantifier", "num": "quantifier", "number": "quantifier",
    "transitive-verb": "transitive-verb", "transitive verb": "transitive-verb",
    "transitive": "transitive-verb", "transtive-verb": "transitive-verb",
    "trv": "transitive-verb", "tv": "transitive-verb", "vt": "transitive-verb", "v": "transitive-verb",
    "vb": "transitive-verb", "verb": "transitive-verb", "trans": "transitive-verb",
    "intransitive-verb": "intransitive-verb", "intransitive verb": "intransitive-verb",
    "intranstive-verb": "intransitive-verb", "intrasitive-verb": "intransitive-verb",
    "intransitive": "intransitive-verb", "intr": "intransitive-verb",
    "vi": "intransitive-verb", "iv": "intransitive-verb",
    "manner": "adverb", "adv": "adverb",
    # data-corrected: our `modifier` entries (baja 'again', bajaku 'very') are
    # adverbial particles, not adjectives -> adverb
    "modifier": "adverb",
    "time": "temporal", "temp": "temporal",
    "direction": "locational", "directional": "locational",
    "location": "locational", "loc": "locational", "place": "locational",
    "pronoun": "personal-pronoun", "pr": "personal-pronoun", "pro-noun": "personal-pronoun",
    "pron": "personal-pronoun",
    "question": "interrogative", "interrog": "interrogative", "ipron": "interrogative",
    "wh": "interrogative",
    "demonstrative": "demonstrative", "dem": "demonstrative", "deic": "demonstrative",
    # Patz treats negation/conjunction/discourse as non-inflecting particles (§3.9)
    "particle": "particle", "part": "particle", "ptcl": "particle",
    "negative": "particle", "negation": "particle", "neg": "particle",
    "conjunction": "particle", "conujunction": "particle", "conj": "particle",
    "auxilary": "particle", "auxiliary": "particle", "clitic": "particle",
    "exclamation": "interjection", "interjection": "interjection",
    "intj": "interjection", "interj": "interjection", "excl": "interjection",
}

# --- 2. curated corrections -------------------------------------------------
# `type` value was actually the (noun) meaning that leaked into the field.
TYPE_LEAK_NOUN = {"nganyi-nganyi", "ngarri", "ngarruy", "wakuy"}
# Definition/translation was a stray example sentence.
DEF_CORRECTIONS = {
    "ngayu": {"definitions": ["I (first person singular)"], "translations": ["I"],
              "type": "personal-pronoun",
              "why": "definition/translation held the example 'I went to the store'; "
                     "ngayu is the 1sg pronoun (Patz §3.5)"},
}
# Personal pronouns (Patz §3.5) — confirm POS regardless of source `type`.
PRONOUN_POS = {w: "personal-pronoun" for w in
               ["ngayu", "nganya", "nyulu", "ngali", "ngalin", "ngana",
                "nganjin", "yundu", "yurra", "jana"]}

# --- 6/7. verb class & derivation (Patz §3.8.3 Table 3.15; §3.8.5) ----------
def verb_info(word, pos):
    """Return (verb_class, derivation|None) for a verb headword, per the grammar."""
    w = word.strip().lower().rstrip(".")
    base = w.replace("-", "").replace(" ", "")
    if not base:
        return None, None
    deriv = None
    # clear verbal derivations (low-ambiguity suffixes)
    if base.endswith("bungal"):
        deriv = {"morpheme": "-bunga-l", "function": "state-causative (§3.8.5.1)"}
    elif base.endswith("kangal") and base != "kangal":
        deriv = {"morpheme": "-kanga-l", "function": "state-causative, commotion (§3.8.5.1)"}
    elif base.endswith("manil") and base != "manil":
        deriv = {"morpheme": "-mani-l", "function": "action-causative (§3.8.5.1)"}
    elif base.endswith("ji"):
        deriv = {"morpheme": "-ji-", "function": "reflexive / general intransitive (§3.8.5.4)"}
    elif base.endswith("mal") and pos == "intransitive-verb":
        deriv = {"morpheme": "-ma-l", "function": "inchoative (§3.8.5.3)"}
    elif base.endswith("riy") or base.endswith("ri"):
        deriv = None  # too ambiguous to assert plural-subject from spelling alone
    # conjugation class from citation form (the deterministic part of the rule)
    if base.endswith("l"):
        vc = "l-conjugation"
    elif base.endswith("y"):
        vc = "y-conjugation"
    elif base.endswith("ji"):
        vc = "y-conjugation"   # -ji- intransitive stems are y-conjugation (cite -ji-y)
    else:
        vc = None
    return vc, deriv

# --- 8. phonemic transcription (Patz §2.1 orthography is phonemic) ----------
GRAPH2IPA = [("rr", "r"), ("ng", "ŋ"), ("ny", "ɲ"),  # digraphs FIRST
             ("b", "b"), ("d", "d"), ("j", "ɟ"), ("k", "ɡ"), ("m", "m"),
             ("n", "n"), ("l", "l"), ("r", "ɻ"), ("w", "w"), ("y", "j"),
             ("a", "a"), ("i", "i"), ("u", "u")]
VALID_CHARS = set("abdijklmnruwyg ")  # g only as part of ng; handled by digraph


def phonemic_token(tok):
    out, i, ok = [], 0, True
    t = tok.lower()
    while i < len(t):
        for g, ipa in GRAPH2IPA:
            if t.startswith(g, i):
                out.append(ipa)
                i += len(g)
                break
        else:
            ok = False  # contains a non-native grapheme (e.g. loan spelt with English letters)
            i += 1
    return ("".join(out), ok)


def phonemic(word):
    """Phonemic IPA with primary stress on the first syllable (§2.6.1)."""
    parts = re.split(r"([ -])", word.strip())
    pieces, all_ok = [], True
    for p in parts:
        if p in ("", " ", "-"):
            pieces.append(" " if p != "-" else "-")
            continue
        ipa, ok = phonemic_token(p)
        all_ok = all_ok and ok
        pieces.append(ipa)
    body = "".join(pieces).strip()
    if not body or not all_ok:
        return None
    # primary stress before first vowel
    m = re.search(r"[aiu]", body)
    if m and m.start() >= 0:
        body = body[: max(0, _syllable_onset(body, m.start()))] + "ˈ" + body[max(0, _syllable_onset(body, m.start())):]
    return f"/{body}/"


def _syllable_onset(s, vowel_idx):
    """Index of the consonant beginning the first syllable (handles initial C)."""
    j = vowel_idx
    while j > 0 and s[j - 1] not in "aiu /-ˈ":
        j -= 1
    return j


def load_framework():
    if os.path.exists(FRAMEWORK):
        return json.load(open(FRAMEWORK, encoding="utf-8"))
    return None


def build_loan_table(fw):
    loans = {}
    if not fw:
        return loans
    for l in fw.get("loan", {}).get("attested_loans", []):
        src = l.get("english_source", "")
        if "NOT a loan" in src:
            continue
        loans[l["kuku_yalanji"].strip().lower()] = src
    return loans


def as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [x for x in v if x not in (None, "")]
    return [v]


QUOTE_RE = re.compile(r'[""“”]')


def extract_examples(defstr):
    s = QUOTE_RE.sub('"', str(defstr))
    quotes = re.findall(r'"([^"]*)"', s)
    pairs = []
    for i in range(0, len(quotes) - 1, 2):
        ky = quotes[i].strip(" ,.;")
        en = quotes[i + 1].strip(" ,.;")
        if ky and en:
            pairs.append({"kuku_yalanji": ky, "english": en})
    if not pairs:
        return str(defstr), [], None
    lead = s.split('"', 1)[0].strip().rstrip(" .,;:")
    note = None
    m = re.search(r"\(([^)]*)\)", s.rsplit('"', 1)[-1])
    if m:
        note = m.group(1).strip()
    return (lead or str(defstr)), pairs, note


def detect_reduplication(word):
    w = str(word).strip()
    if "-" in w:
        parts = w.split("-")
        if len(parts) == 2 and parts[0] == parts[1] and len(parts[0]) >= 2:
            return {"pattern": "full", "base": parts[0]}
        if len(parts) == 2 and len(parts[0]) >= 3 and len(parts[1]) >= 3 and parts[0][:3] == parts[1][:3] and parts[0] != parts[1]:
            return {"pattern": "partial", "base": parts[0]}
    else:
        n = len(w)
        if n >= 6 and n % 2 == 0 and w[: n // 2] == w[n // 2:]:
            return {"pattern": "full", "base": w[: n // 2]}
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    fw = load_framework()
    loan_table = build_loan_table(fw)
    data = yaml.safe_load(open(SRC, encoding="utf-8"))
    words = data.get("words", [])

    rep = Counter()
    unmapped_types = Counter()

    for w in words:
        if not isinstance(w, dict):
            continue
        head = str(w.get("word", "")).strip()
        low = head.lower()
        commentary = as_list(w.get("commentary"))

        # 1. key normalisation
        for bad, good in KEY_CANON.items():
            if bad in w:
                vals, cur = as_list(w.pop(bad)), as_list(w.get(good))
                merged = cur + [v for v in vals if v not in cur]
                if merged:
                    w[good] = merged
                rep["key_fixes"] += 1

        # 2a. leaked-meaning type
        if low in TYPE_LEAK_NOUN:
            commentary.append(f"Correction: original `type` value '{w.get('type')}' was the "
                              f"word's meaning, not a part of speech; reclassified as noun.")
            w["type"] = "noun"
            rep["type_leak"] += 1

        # 2b. definition corrections
        if low in DEF_CORRECTIONS:
            fix = DEF_CORRECTIONS[low]
            w["definitions"] = list(fix["definitions"])
            w["translations"] = list(fix["translations"])
            w["type"] = fix["type"]
            commentary.append(f"Correction: {fix['why']}.")
            rep["def_corrected"] += 1

        # 3. POS normalisation (controlled `type`)
        tval = w.get("type")
        if isinstance(tval, list):  # a list leaked into `type` -> take first element
            tval = tval[0] if tval else ""
            w["type"] = tval
            rep["type_list_fixed"] += 1
        raw = str(tval or "").strip().lower()
        pos = POS_MAP.get(raw)
        if low in PRONOUN_POS:
            pos = PRONOUN_POS[low]
        if pos:
            if pos != w.get("type"):
                rep["pos_normalised"] += 1
            w["type"] = pos
        elif raw:
            unmapped_types[raw] += 1  # left for the LLM pass

        # 4. example extraction
        defs = as_list(w.get("definitions"))
        new_defs, examples, notes = [], as_list(w.get("examples")), []
        changed = False
        for dd in defs:
            clean, pairs, note = extract_examples(dd)
            new_defs.append(clean)
            if clean != dd:
                changed = True
            examples.extend(pairs)
            if note:
                notes.append(note)
        if changed and new_defs:
            w["definitions"] = new_defs
        if examples:
            w["examples"] = examples
            rep["examples"] = rep.get("examples", 0) + len(pairs) if False else rep["examples"]
        if examples:
            w["examples"] = examples
        if notes:
            w["usages"] = as_list(w.get("usages")) + notes

        # 5. reduplication
        redup = detect_reduplication(head)
        if redup:
            w["reduplication"] = redup
            rep["redup"] += 1

        # 6/7. verb class + derivation
        if w.get("type") in ("transitive-verb", "intransitive-verb"):
            vc, deriv = verb_info(head, w.get("type"))
            if vc:
                w["verb_class"] = vc
                rep["verb_class"] += 1
            if deriv:
                w["derivation"] = deriv
                rep["derivation"] += 1

        # 8. phonemic
        ipa = phonemic(head)
        if ipa:
            w["phonemic"] = ipa
            rep["phonemic"] += 1

        # 9. loanword (attested)
        if low in loan_table:
            w["loanword"] = {"source": loan_table[low], "reference": "Patz §2.3/§3.12"}
            rep["loanword"] += 1

        # 10. gloss + see_also
        trans = as_list(w.get("translations"))
        if trans and "gloss" not in w:
            w["gloss"] = str(trans[0]).strip()
        if "see" in w:
            w["see_also"] = as_list(w.pop("see"))
            rep["see_norm"] += 1

        # 11. empty-entry flag
        if not as_list(w.get("definitions")) and not trans:
            w["needs_review"] = "no definition or translation in source"
            rep["empty_flagged"] += 1

        if examples:
            rep["examples_words"] += 1
        if commentary:
            w["commentary"] = commentary

    # count total examples
    rep["examples"] = sum(len(w.get("examples", [])) for w in words if isinstance(w, dict))

    print("ENRICHMENT REPORT")
    for k in sorted(rep):
        print(f"  {k:18} {rep[k]}")
    print(f"  total entries      {sum(1 for w in words if isinstance(w, dict))}")
    if unmapped_types:
        print("\n  unmapped `type` values left for LLM pass:")
        for t, c in unmapped_types.most_common():
            print(f"    {t!r:18} x{c}")

    if args.dry_run:
        print("\n(dry run — nothing written)")
        return

    ORDER = ["word", "type", "phonemic", "gloss", "definitions", "translations",
             "examples", "synonyms", "see_also", "usages", "reduplication",
             "verb_class", "derivation", "semantic_domain", "loanword", "dialect",
             "commentary", "needs_review", "meaning", "maybe"]

    class Dumper(yaml.SafeDumper):
        pass

    def ordered(w):
        out = OrderedDict()
        for k in ORDER:
            if k in w:
                out[k] = w[k]
        for k in w:
            if k not in out:
                out[k] = w[k]
        return out

    data["words"] = [ordered(w) if isinstance(w, dict) else w for w in words]
    Dumper.add_representer(OrderedDict,
                          lambda d, x: d.represent_mapping("tag:yaml.org,2002:map", x.items()))
    with open(SRC, "w", encoding="utf-8") as f:
        f.write("# Kuku Yalanji dictionary — enriched & corrected against Patz, "
                "A Grammar of the Kuku Yalanji Language.\n")
        f.write("# Source language data preserved; `commentary` records corrections. "
                "See SCHEMA.md for the field spec.\n\n")
        yaml.dump(data, f, Dumper=Dumper, allow_unicode=True, sort_keys=False,
                  default_flow_style=False, width=4096)
    print(f"\nWrote {SRC}")


if __name__ == "__main__":
    main()
