"""
Language -> { model, bridge } registry. Adding a language is a config change
here (+ optionally a new orthography bridge), never an app rewrite.

`model` is a Hugging Face MMS-TTS id (VITS). `bridge` selects the orthography
normalizer applied before synthesis ("yalanji" -> normalize_for_pjt; None ->
pass the text through unchanged).
"""

from __future__ import annotations

DEFAULT_MODEL = "facebook/mms-tts-pjt"

# v1: Kuku Yalanji rides the Pitjantjatjara voice via the Patz-grounded bridge.
# Other dictionaries keep the Google donor (no entry here) until a same-family
# MMS model + bridge is evaluated for them.
REGISTRY: dict[str, dict] = {
    "kuku_yalanji": {"model": "facebook/mms-tts-pjt", "bridge": "yalanji"},
    "zku": {"model": "facebook/mms-tts-pjt", "bridge": "yalanji"},
    # Anindilyakwa (Eastern Gunwinyguan) — no native/same-family MMS voice exists,
    # so it rides the Pitjantjatjara voice through a cross-family orthography
    # bridge (a scaffold; authentic elder recordings remain the goal).
    "anindilyakwa": {"model": "facebook/mms-tts-pjt", "bridge": "anindilyakwa"},
    "aoi": {"model": "facebook/mms-tts-pjt", "bridge": "anindilyakwa"},
}


def resolve(lang: str | None) -> dict | None:
    """Return the {model, bridge} entry for a language code, or None."""
    if not lang:
        return None
    return REGISTRY.get(lang.lower())


def supported() -> list[str]:
    return sorted(REGISTRY.keys())
