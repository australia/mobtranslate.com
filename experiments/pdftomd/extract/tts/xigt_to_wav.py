#!/usr/bin/env python3
"""
xigt_to_wav.py – IPA → eSpeak phonemes (with overrides) → WAV

Run:
    uv run python xigt_to_wav.py examples.xigt.json out_audio/
"""

import json, sys, uuid, pathlib, time
import pyttsx3, epitran

# ---------------------------------------------------------------------------
#  CONFIG
# ---------------------------------------------------------------------------
LANG_CODE       = "eng-Latn"      # epitran language model – close enough for IPA → XS
SPEECH_RATE     = 120             # eSpeak/pyttsx3 speed
DESIRED_VOICE   = "en-au+m3"      # any voice id pyttsx3 lists; try "kukuyalanji" if you made it
# ---------------------------------------------------------------------------
#  IPA → X-SAMPA patches for Kuku-Yalanji (extend as you discover issues)
# ---------------------------------------------------------------------------
PHONEME_OVERRIDES = {
    "ɲ":  "n^",
    "ŋ":  "N",
    "ɟ":  "dZ",
    "ɖ":  "d`",
    "ɳ":  "n`",
    "ʈ":  "t`",
    "ɭ":  "l`",
    "ɾ":  "4",
    "ɹ":  "r\\",
    # stress example – keep the apostrophe, epitran drops it
    "ˈ":  "'",
}

# ---------------------------------------------------------------------------
#  INIT TTS + EPITRAN
# ---------------------------------------------------------------------------
engine = pyttsx3.init()
engine.setProperty('rate', SPEECH_RATE)

# choose voice if available
for v in engine.getProperty("voices"):
    if DESIRED_VOICE in (v.id, v.name):
        engine.setProperty("voice", v.id)
        break
else:
    print(f"[warn] Voice '{DESIRED_VOICE}' not found; using default")

epi = epitran.Epitran(LANG_CODE)

# ---------------------------------------------------------------------------
def ipa_to_espeak_phonemes(text: str) -> str:
    """
    Convert text to eSpeak phonemes with custom overrides for Kuku Yalanji.
    
    Since Epitran doesn't have direct IPA → X-SAMPA conversion,
    we'll use a simpler approach by applying our phoneme overrides directly.
    """
    # Apply phoneme overrides directly to the text
    phonetic_text = text
    for ipa_char, xsampa_char in PHONEME_OVERRIDES.items():
        phonetic_text = phonetic_text.replace(ipa_char, xsampa_char)
    
    # For non-IPA text, just return it directly
    # This handles the case where the transcript is in orthographic form
    return phonetic_text

def generate_audio(text: str, wav_path: pathlib.Path):
    wav_path.parent.mkdir(parents=True, exist_ok=True)
    processed_text = ipa_to_espeak_phonemes(text)
    print(f"  → Processed text: {processed_text}")

    try:
        engine.save_to_file(processed_text, str(wav_path))
        engine.runAndWait()
        time.sleep(0.2)

        if not wav_path.exists() or wav_path.stat().st_size == 0:
            raise RuntimeError("WAV not created or empty")

        print(f"  ✓ wrote {wav_path.name}  ({wav_path.stat().st_size} bytes)")
        return True
    except Exception as e:
        print(f"  ✗ TTS failed: {e}")
        return False

# ---------------------------------------------------------------------------
def main(json_path: str, out_dir: str):
    json_path = pathlib.Path(json_path).resolve()
    out_dir   = pathlib.Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    data  = json.loads(json_path.read_text(encoding="utf-8"))
    items = data.get("items", [])

    print(f"Found {len(items)} examples in {json_path}")
    for i, item in enumerate(items, 1):
        ipa = item["transcript"].strip()
        if not ipa:
            continue

        wav = out_dir / f"{i:03}_{uuid.uuid4().hex[:6]}.wav"
        print(f"\n[{i}/{len(items)}]  {ipa}")
        generate_audio(ipa, wav)

    print(f"\nAll done → {out_dir}")

# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: python xigt_to_wav.py examples.xigt.json out_audio/")
    main(sys.argv[1], sys.argv[2])
