# Kuku Yalanji TTS — experimental

Text-to-speech pipeline for Kuku Yalanji. Two synthesis paths live here:

- **`synth_neural.py`** — Edge TTS with an Indonesian neural donor voice. Sounds human; the default for any new generation.
- **`xigt_to_wav.py`** — eSpeak via `pyttsx3` + `epitran`. Robotic but phonetically precise; useful for IPA→X-SAMPA debugging.

Neither path is trained on a Kuku Yalanji speaker corpus. They are donor-voice approximations until a community-licensed model exists.

---

## Why an Indonesian donor voice

Edge TTS doesn't ship a Kuku Yalanji voice. Picking the right donor matters more than fancier model architecture. Indonesian (`id-ID`) reads Kuku Yalanji orthography with near-zero adaptation:

| Phonological feature | Kuku Yalanji | Indonesian | English (en-AU) |
|---|---|---|---|
| Digraphs `ny`, `ng`, `j`, `y` | yes, same values | yes, same values | divergent (`ng` only) |
| Vowel system | pure 5-vowel `a e i o u` | pure 5-vowel `a e i o u` | 11+ vowels with diphthongs |
| Stop aspiration | unaspirated | unaspirated | aspirated initially |
| Rhythm | syllable-timed | syllable-timed | stress-timed |
| Lenis intervocalic stops | yes | yes | no |

The result: feed the Indonesian voice raw Kuku Yalanji orthography and most words come out broadly correct. English voices over-aspirate stops and break vowel purity; Mandarin and Hindi voices distort the rhythm. Indonesian is the donor that lets the language be itself.

Trade-off: this is still a guess. A real Kuku Yalanji speaker model is the goal, not this. Treat output as a phonetic sketch, never as authoritative pronunciation.

---

## Quick start

```bash
cd experiments/pdftomd/extract/tts
uv sync

# Generate one phrase
uv run python synth_neural.py "Kawku, nyulu jawun ngayku." \
  --out output/hello_she_is_my_friend.mp3
```

Outputs an MP3 in `output/`. Default settings:

- Voice: `id-ID-ArdiNeural` (male; swap for `id-ID-GadisNeural` for female)
- Rate: `-30%` (slowed for clarity)
- Pitch: `-5Hz` (slightly lower resonance, closer to older-speaker register)

Override with `--voice`, `--rate`, `--pitch`.

---

## How "Hello, she is my friend" was constructed

Every word was pulled directly from `dictionaries/kuku_yalanji/dictionary.yaml`. No guessed words, no AI-translated grammar.

| English | Kuku Yalanji | Dictionary source |
|---|---|---|
| Hello (welcoming) | **kawku** | `word: kawku` — exclamation, "expression of delight on the arrival of a visitor" |
| she / he / it | **nyulu** | `word: nyulu` — pronoun |
| friend | **jawun** | `word: jawun` — noun |
| my | **ngayku** | `word: ngayku` — possessive |

Grammar pattern from example sentences in the same dictionary:

- `Nyulu wulman jaway bajaku` ("The old man is very generous") → zero copula; "is" is unspoken, predicate follows subject.
- `Nyulu bana manin ngayku` ("He got water for me") → `ngayku` (possessor / benefactive) follows the noun it modifies.

Combining: **subject** `Nyulu` + **noun** `jawun` + **possessor** `ngayku` → `Nyulu jawun ngayku` ("She [is] friend my").

With the greeting prepended:

> **Kawku, nyulu jawun ngayku.**

### Honesty disclaimer

This is a dictionary-word concatenation by someone who isn't a Kuku Yalanji speaker. Word order and morphology may be wrong in ways the dictionary entries don't catch. **A native speaker or qualified linguist must verify before this is treated as a correct sentence**, especially before publishing as an example or teaching aid. Per MobTranslate's design principle "custodial confidence", AI/dictionary-constructed output is flagged, not asserted.

---

## File layout

```
tts/
├── synth_neural.py       — Edge TTS (Indonesian donor) — primary path
├── xigt_to_wav.py        — eSpeak via pyttsx3+epitran — IPA debugging
├── mapping_kuku.py       — IPA → X-SAMPA overrides for Kuku Yalanji phonemes
├── main.py               — placeholder entry point
├── list_langs.py         — utility: list available pyttsx3 voices
├── test_ipa.py           — IPA conversion smoke tests
├── pyproject.toml        — uv project manifest
├── output/               — generated audio (mp3, wav)
└── README.md             — this file
```

---

## Roadmap

1. **Word- and example-level batch generation** from `dictionaries/kuku_yalanji/dictionary.yaml` (one MP3 per headword, one per usage example).
2. **Audio attribution metadata** alongside each clip: source (Edge TTS / native speaker), voice id, date, dictionary version hash.
3. **Native speaker corpus integration** when text-aligned recordings become available. Donor-voice approach retires the moment a community-licensed model exists.
4. **Per-language donor map** — same approach for Wajarri, Anindilyakwa, Mi'gmaq (each needs its own donor candidate evaluation; Indonesian is a Kuku Yalanji choice, not a universal one).

---

## Limitations to flag honestly

- Donor-voice synthesis approximates phonology but cannot encode prosody, intonation, ceremonial register, or speaker variation. It is a placeholder.
- Edge TTS requires network access to Microsoft endpoints. No offline mode.
- Edge TTS terms permit personal and educational use; verify terms before commercial distribution.
- Output should never be presented as "spoken by a Kuku Yalanji person" — only as a synthesis approximation of the orthography.
