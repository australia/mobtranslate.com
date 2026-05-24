#!/usr/bin/env python3
"""
synth_neural.py — Neural TTS for Kuku Yalanji using Indonesian donor voice.

Why Indonesian (id-ID)?
-----------------------
The two languages share enough phonological surface that an Indonesian
neural voice reads Kuku Yalanji orthography with surprising fidelity:

  * Shared digraph conventions:  ng, ny, j, y
  * Pure five-vowel system (a e i o u), no diphthong reflexes
  * Unaspirated stops, syllable-timed rhythm
  * Lenis stops between vowels

Almost no orthographic adaptation is needed before passing the text to
edge-tts; the voice does the right thing by default. Compare with
en-AU which over-aspirates stops and breaks vowel purity.

We slow the rate and drop the pitch slightly to push the resonance
toward an older male speaker, which fits the dictionary register
better than the default neural narrator.

Usage:
  uv run python synth_neural.py "Kawku, nyulu jawun ngayku." \\
    --out output/hello_she_is_my_friend.mp3
"""

from __future__ import annotations

import argparse
import asyncio
import pathlib
import sys

import edge_tts

# Indonesian male neural voice. Ardi has the most stable rendering for the
# Kuku Yalanji digraph set. Gadis (female) also works; swap with --voice.
DEFAULT_VOICE = "id-ID-ArdiNeural"

# Slower + slightly lower pitch reads as more deliberate and lower-resonance,
# closer to the older-speaker dictionary register.
DEFAULT_RATE = "-30%"
DEFAULT_PITCH = "-5Hz"


async def synthesize(
    text: str,
    out_path: pathlib.Path,
    voice: str = DEFAULT_VOICE,
    rate: str = DEFAULT_RATE,
    pitch: str = DEFAULT_PITCH,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(str(out_path))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("text", help="Kuku Yalanji text to synthesize")
    parser.add_argument("--out", type=pathlib.Path, required=True, help="Output MP3 path")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help=f"Edge TTS voice id (default: {DEFAULT_VOICE})")
    parser.add_argument("--rate", default=DEFAULT_RATE, help=f"Speech rate (default: {DEFAULT_RATE})")
    parser.add_argument("--pitch", default=DEFAULT_PITCH, help=f"Pitch shift (default: {DEFAULT_PITCH})")
    args = parser.parse_args()

    print(f"Voice: {args.voice}   Rate: {args.rate}   Pitch: {args.pitch}")
    print(f"Text:  {args.text}")
    print(f"Out:   {args.out}")

    asyncio.run(synthesize(args.text, args.out, args.voice, args.rate, args.pitch))

    size = args.out.stat().st_size
    print(f"Wrote {args.out}  ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
