# MobTranslate Keyboard (Android)

A custom Android keyboard (IME) for Australian First Nations languages. Type an
English word in **any** app — WhatsApp, Messages, Notes — and tap the suggestion
to swap in the Aboriginal word. Includes the special orthography keys each
language needs (`ng`, `ngw`, `nj`, `rr`, `rd`, `rn`, `ly`, …) and a one-tap
language switch.

Currently bundled (offline): **Kuku Yalanji**, **Anindilyakwa**, **Wajarri**,
**Mi'gmaq** — the suggestion dictionaries are generated from the live
MobTranslate database (~10k English keys total).

> Privacy: suggestions are looked up in an on-device dictionary. What you type
> never leaves the phone. (Online translate/TTS is a deliberately separate,
> opt-in next step — see below.)

## How it works

- `MobKeyboardService` is the IME (`InputMethodService`). It draws the keyboard,
  commits text via the `InputConnection`, and shows a suggestion bar.
- As you type, it reads the English word before the cursor, looks it up in the
  bundled index, and shows tappable candidates. Tapping one deletes the English
  word and commits the translation.
- `Dictionary` loads `assets/dictionary/<code>.json` (built by
  `tools/build_dict.py` from a TSV export of the MobTranslate dictionary).
- `Languages` defines each language's code + special orthography keys.

## Build & install on a Pixel (or any Android phone)

You need Android Studio (easiest) or a local Gradle + Android SDK.

### Option A — Android Studio
1. **Open** this `keyboard-android/` folder in Android Studio (*File → Open*).
   It will sync Gradle and generate the Gradle wrapper automatically.
2. Plug in the phone (USB debugging on) and press **Run ▶** (the `app` config),
   or *Build → Build APK(s)* and install the APK.

### Option B — command line
```bash
cd keyboard-android
# First time only, if there's no ./gradlew yet:
gradle wrapper            # uses a system Gradle to create the wrapper
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Turn it on
On the phone:
1. Open **MobTranslate Keyboard** (the app) → **Enable in Settings** → toggle it on.
   (Or *Settings → System → Languages & input → On-screen keyboards → Manage*.)
2. Tap any text field, open the keyboard switcher (🌐 / the keyboard icon), and
   pick **MobTranslate Keyboard**.

For quick dev switching:
```bash
adb shell ime list -s
adb shell ime enable com.mobtranslate.keyboard/.MobKeyboardService
adb shell ime set    com.mobtranslate.keyboard/.MobKeyboardService
```

## Try it
In WhatsApp (or the in-app test box), type `water` → tap **bana**. Switch
languages with the chip on the left of the suggestion bar.

## Regenerate the dictionaries
```bash
# 1. export a TSV from the MobTranslate DB: code, name, word, translation, definition
# 2.
python3 tools/build_dict.py dictseed.tsv app/src/main/assets/dictionary
```

## Next steps (not in this MVP)
- **Online actions, opt-in:** a "Translate whole message" / "Speak" button that
  calls the MobTranslate API and `/api/tts` (the neural voice) — gated and clearly
  labelled, since a keyboard can see sensitive text.
- Long-press alternates for orthography variants.
- Number/symbol layer.
- Per-word audio (play the recorded/synth pronunciation from a suggestion).
