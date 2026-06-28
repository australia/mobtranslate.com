"""
The linguistic bridge: Kuku Yalanji (Hershberger orthography) -> Pitjantjatjara
spelling, so Meta's MMS-TTS Pitjantjatjara model can read Yalanji.

Both are Pama-Nyungan with a 3-vowel system and shared Australian phonotactics.
The systematic difference is the consonant *spelling*: Hershberger writes the
stop series with voiced letters (b d g j) while Pitjantjatjara writes one
voiceless series (p t k tj). Mapping across the two, plus a few Patz-grounded
rules, lets the pjt model's own allophony produce Yalanji-correct voicing
(fortis initially, lenis intervocalically).

Grounded in: R.M.W. Patz, *A Grammar of the Kuku Yalanji Language of North
Queensland* — §2.1 / Table 2.1 (phoneme inventory), §2.5.2 (word-final /y/
deletion), §2.6.1 (reduplication & compound juncture).
"""

from __future__ import annotations

import re

# Multi-letter graphemes handled before single letters (longest first).
_DIGRAPHS: list[tuple[str, str]] = [
    ("ng", "ng"),   # velar nasal — same in pjt
    ("ny", "ny"),   # palatal nasal — same
    ("rr", "rr"),   # trill — same
    ("rd", "rt"),   # retroflex stop (if written) -> pjt retroflex spelling
    ("rn", "rn"),   # retroflex nasal
    ("rl", "rl"),   # retroflex lateral
]

# Single-letter map. The core move: voiced Hershberger stops -> voiceless pjt.
_SINGLE: dict[str, str] = {
    "b": "p", "d": "t", "g": "k", "j": "tj",   # voiced stops -> pjt voiceless series
    "p": "p", "t": "t", "k": "k",               # already voiceless
    "m": "m", "n": "n", "l": "l", "r": "r",     # sonorants
    "w": "w", "y": "y",
    "a": "a", "i": "i", "u": "u",               # 3-vowel system, shared
    "e": "i", "o": "u",                          # marginal vowels -> nearest (Patz 3-vowel)
}

# Letters that never occur in native Yalanji words; their presence flags a
# borrowing/proper noun the bridge should leave alone.
_FOREIGN = set("csvqxhfz")

_VOWELS = set("aiueo")
_LETTERS = re.compile(r"[a-z]")


def _is_foreign(morph: str) -> bool:
    """A morpheme to pass through untouched (English loan / proper noun)."""
    if not morph:
        return False
    if morph[0].isupper():
        return True
    return any(ch in _FOREIGN for ch in morph.lower())


def yalanji_to_pjt(morph: str) -> str:
    """Map a single wholly-Yalanji morpheme from Hershberger to pjt spelling."""
    s = morph.lower()
    out: list[str] = []
    i = 0
    while i < len(s):
        two = s[i : i + 2]
        hit = next((repl for dig, repl in _DIGRAPHS if dig == two), None)
        if hit is not None:
            out.append(hit)
            i += 2
            continue
        ch = s[i]
        out.append(_SINGLE.get(ch, ch))
        i += 1
    return "".join(out)


def _final_y_deletion(morph: str) -> str:
    """
    Patz §2.5.2: word-final /y/ after a vowel is deleted (badiy -> badi,
    karangajiy -> karangaji), but intervocalic 'iy' is kept (miyil stays).
    Applied on the Yalanji form, before mapping.
    """
    if len(morph) >= 2 and morph[-1] == "y" and morph[-2] in _VOWELS:
        return morph[:-1]
    return morph


def _split_reduplication(morph: str) -> tuple[str, str] | None:
    """
    Detect genuine full reduplication XX (e.g. walbulwalbul, dakaldakal): the
    string is two identical halves, each >=3 letters and vowel-bearing. Returns
    the two halves, else None. Avoids splitting a simple word (bama) in two.
    """
    n = len(morph)
    if n < 6 or n % 2 != 0:
        return None
    half = n // 2
    a, b = morph[:half], morph[half:]
    if a == b and len(a) >= 3 and any(v in a for v in _VOWELS):
        return a, b
    return None


# ---------------------------------------------------------------------------
# Anindilyakwa (Eastern Gunwinyguan) -> Pitjantjatjara
#
# Anindilyakwa is NOT Pama-Nyungan and has no same-family MMS voice, so pjt is a
# CROSS-family donor (the user chose it as the closest available Australian
# voice). It still shares the core Australian phonotactics — and, crucially, the
# practical orthography (Stokes/Groote Eylandt Language Centre, confirmed against
# the MobTranslate dictionary's 591 headwords) uses the SAME voiced-letter stop
# convention as Yalanji: b d g j = /p t k c/. That maps cleanly onto pjt's single
# voiceless series (p t k tj), and the pjt model's own allophony restores the
# natural fortis/lenis voicing.
#
# Graphemes Anindilyakwa adds over Yalanji (all attested in the dictionary):
#   ngw /ŋʷ/, kw /kʷ/, nj /ɲ/ (pjt spells this 'ny'), ly /ʎ/, and the
#   retroflexes rd /ʈ/, rn /ɳ/, rl /ɭ/. Words almost always end in -a.
#
# Vowels: the practical orthography writes a e i u (o is marginal). pjt has the
# 3-vowel a/i/u; e -> i and o -> u (nearest), matching the Yalanji bridge.
#
# Grounded in: van Egmond 2012 (*Enindhilyakwa phonology, morphosyntax & genetic
# position*); Leeding 1989 (*Anindilyakwa phonology & morphology*); J. Stokes,
# *Anindilyakwa Dictionary*; Wikipedia phoneme inventory. This is a SCAFFOLD
# voice (a Pama-Nyungan donor reading Gunwinyguan), upgraded from the prior
# Indonesian donor — authentic elder recordings remain the ground truth.
# ---------------------------------------------------------------------------

# Longest-first so 'ngw' wins over 'ng', 'kw' over 'k', etc.
_ANIN_DIGRAPHS: list[tuple[str, str]] = [
    ("ngw", "ngw"),  # labialised velar nasal /ŋʷ/
    ("ng", "ng"),    # velar nasal /ŋ/
    ("kw", "kw"),    # labialised velar stop /kʷ/
    ("nj", "ny"),    # palatal nasal /ɲ/ -> pjt 'ny'  (ESSENTIAL: else n+j -> 'ntj')
    ("ny", "ny"),    # palatal nasal, if already spelled 'ny'
    ("ly", "ly"),    # palatal lateral /ʎ/ -> pjt 'ly'
    ("rd", "rt"),    # retroflex stop /ʈ/ -> pjt retroflex stop spelling
    ("rn", "rn"),    # retroflex nasal /ɳ/
    ("rl", "rl"),    # retroflex lateral /ɭ/
    ("rr", "rr"),    # alveolar trill /r/
]

# Same single-letter map as Yalanji: voiced stops -> pjt voiceless series, the
# shared 3-vowel system, e->i / o->u for the marginal vowels.
_ANIN_SINGLE: dict[str, str] = dict(_SINGLE)


def anindilyakwa_to_pjt(morph: str) -> str:
    """Map a single Anindilyakwa morpheme (practical orthography) to pjt spelling."""
    s = morph.lower()
    out: list[str] = []
    i = 0
    while i < len(s):
        # Disambiguate 'rng' as r + ng (the common velar-nasal cluster), not the
        # retroflex 'rn' + g — else e.g. 'ngarngku' mis-parses to a doubled k.
        if s[i] == "r" and s[i + 1 : i + 3] == "ng":
            out.append("r")
            i += 1
            continue
        three = s[i : i + 3]
        hit3 = next((r for d, r in _ANIN_DIGRAPHS if len(d) == 3 and d == three), None)
        if hit3 is not None:
            out.append(hit3)
            i += 3
            continue
        two = s[i : i + 2]
        hit2 = next((r for d, r in _ANIN_DIGRAPHS if len(d) == 2 and d == two), None)
        if hit2 is not None:
            out.append(hit2)
            i += 2
            continue
        ch = s[i]
        out.append(_ANIN_SINGLE.get(ch, ch))
        i += 1
    return "".join(out)


def normalize_anindilyakwa_for_pjt(
    text: str,
    *,
    compound_juncture: str = "",
    redup_boundary: str = " ",
) -> str:
    """
    Convert an Anindilyakwa string into Pitjantjatjara-shaped text for MMS-TTS.

    Mirrors the Yalanji pipeline: split each whitespace word on '-' into
    morphemes (Anindilyakwa is polysynthetic and the dictionary hyphenates
    affixes), pass English/proper-noun morphemes through untouched, map native
    morphemes via the Anindilyakwa->pjt table, and lightly separate genuine
    reduplication so the model doesn't read it as one flat run. No Yalanji-
    specific final-/y/ rule (Anindilyakwa words end in -a).
    """
    words_out: list[str] = []
    for word in text.split():
        morphs = word.split("-")
        mapped: list[str] = []
        for m in morphs:
            if _is_foreign(m):
                mapped.append(m)
                continue
            redup = _split_reduplication(m)
            if redup:
                a, b = redup
                mapped.append(anindilyakwa_to_pjt(a) + redup_boundary + anindilyakwa_to_pjt(b))
            else:
                mapped.append(anindilyakwa_to_pjt(m))
        words_out.append(compound_juncture.join(mapped))
    return " ".join(words_out)


def normalize_for_pjt(
    text: str,
    *,
    compound_juncture: str = "",
    redup_boundary: str = " ",
) -> str:
    """
    Convert a Kuku Yalanji string into Pitjantjatjara-shaped text for MMS-TTS.

    - Per whitespace word: split on '-' into morphemes (compounds/affixes).
    - English/proper-noun morphemes pass through verbatim.
    - Native morphemes: final-/y/ deletion, then Hershberger->pjt mapping.
    - Compound morphemes are joined by `compound_juncture` (default ""; Patz
      §2.6.1: a compound is one phonological word).
    - Genuine reduplication gets a light `redup_boundary` between halves so the
      model doesn't read it as one flat monotone run (Patz §2.6.1 stress).
    """
    words_out: list[str] = []
    for word in text.split():
        morphs = word.split("-")
        mapped: list[str] = []
        for m in morphs:
            if _is_foreign(m):
                mapped.append(m)
                continue
            redup = _split_reduplication(m)
            if redup:
                a, b = redup
                mapped.append(yalanji_to_pjt(_final_y_deletion(a)) + redup_boundary + yalanji_to_pjt(b))
            else:
                mapped.append(yalanji_to_pjt(_final_y_deletion(m)))
        words_out.append(compound_juncture.join(mapped))
    return " ".join(words_out)
