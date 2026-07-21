# MobTranslate — Google Play listing pack

Everything you need to paste into Play Console. Assets are in this folder.

---

## 1. Store listing — text

**App name** (max 30)
```
MobTranslate
```

**Short description** (max 80 — this is 73)
```
Translate, hear and record First Nations languages. Keep language strong.
```

**Full description** (max 4000)
```
Mob Translate helps you learn, hear, and keep First Nations languages strong.

Built with and for community, Mob Translate brings Australian Aboriginal and other First Nations languages into one warm, simple app — so anyone, including Elders and young people, can look up words, hear how they sound, translate everyday phrases, and add their own voice.

WHAT YOU CAN DO
• Translate — type in English and get the word or phrase in language, with meanings and examples.
• Look up words — browse a living dictionary with meanings, examples and artwork for each word.
• Hear it — tap any word to hear it spoken aloud.
• Record your language — add words and sentences in your own voice with a few big, friendly taps. Community recordings help keep pronunciation strong for the next generation.
• Walk Country — explore place names on a map of Country and hear them spoken.
• Language keyboard — type your language in any app, with the special letters and spelling.

LANGUAGES
Mob Translate currently supports languages including Kuku Yalanji, Anindilyakwa and Mi'kmaq, with more being added as communities come on board.

COMMUNITY-BUILT, COUNTRY-OWNED
Mob Translate is a community project. Words, meanings and recordings come from speakers and language keepers. Recordings you contribute are shared as public-domain resources, so they can help everyone learning the language — now and in the future.

MADE SIMPLE, FOR EVERYONE
Big, clear buttons. Warm, calm design. No ads, no cost. Made to be easy for Elders and young learners alike.

RESPECT
We follow community wishes about how language and cultural knowledge are shared. If something isn't right, you can suggest a correction so the keepers can fix it.

Free. No ads. Made with respect for the people and Country the languages come from.
```

---

## 2. Store listing — graphics (files in this folder)

| Asset | File | Spec | Status |
|---|---|---|---|
| App icon (hi-res) | `play-icon-512.png` | 512×512, 32-bit PNG, opaque | ✅ ready |
| Feature graphic | `play-feature-graphic.png` | 1024×500, no alpha | ✅ ready |
| Phone screenshots | *(capture on your phone)* | 2–8, PNG/JPG, 9:16 (e.g. 1080×2400) | ⛔ you |

**Screenshots to capture on your Pixel (running 1.0.7), in this order:**
1. Home — hero + translate widget (shows a translated result if you can)
2. Dictionary — list with a word that has artwork
3. Word detail — the artwork hero + meaning
4. Record — mid-recording, the breathing mic orb + waveform (the signature screen)
5. Map — "Walk Country" / pins on Country
6. Account — the contribution weave

Capture with Power + Volume-Down. No editing needed — Play accepts raw phone screenshots.

---

## 3. Store settings

- **App category:** Education  *(alt: Books & Reference)*
- **Tags:** Education, Language, Reference
- **Contact email:** thomasalwyndavis@gmail.com
- **Website:** https://mobtranslate.com
- **Privacy policy:** https://mobtranslate.com/privacy

---

## 4. "Set up your app" — declarations

- **Ads:** No, my app does **not** contain ads.
- **App access:** Some features (recording, contributing) need a **free account**. Reviewers must be able to test them → create a reviewer login and enter it under *App access → All or some functionality is restricted → add instructions* (email + password). Browsing, translating, dictionary and audio all work without login.
- **Government app:** No.
- **Financial features:** None.
- **Target audience & content:** recommended primary age group **13 and older**. (Including under-13 pulls you into Google's stricter *Families* policy; the app has open user-generated recordings + accounts, so 13+ is the clean path. Content itself is safe for all ages.)

---

## 5. Content rating questionnaire (IARC)

- **Category:** Reference, News, or Educational
- Violence: **No**
- Sexuality / nudity: **No**
- Profanity / crude humour: **No**
- Controlled substances (drugs/alcohol/tobacco): **No**
- Gambling / simulated gambling: **No**
- **Users can interact / share content or user-generated content:** **Yes** — users can record audio and add words/sentences that are shared publicly (reviewed by language keepers).
- Shares user's current physical location: **No**
- Digital purchases: **No**

Expected result: **Everyone / PEGI 3** with an "interactive elements: users interact, shares info" note.

---

## 6. Data safety form

**Does your app collect or share user data?** Yes (collect). **Encrypted in transit:** Yes. **Users can request deletion:** Yes (via account / by emailing support).

| Data type | Collected | Shared | Purpose | Required? |
|---|---|---|---|---|
| **Name** | Yes | No | Account management, App functionality | Yes (for an account) |
| **Email address** | Yes | No | Account management | Yes (for an account) |
| **Voice / audio recordings** | Yes | **Public** | App functionality — contributed as public-domain language recordings; published in the app | Optional (user-initiated) |
| **User-generated text** (words/sentences) | Yes | **Public** | App functionality — published to the community dictionary | Optional |
| **App activity** (in-app events) | Yes | No | Analytics | No |

Notes for the form:
- Audio + text contributions are **published publicly** by design — in the Data safety flow, declare them collected, and be clear in the description/privacy policy that contributions become public-domain. (They are not sold or transferred to third-party advertisers.)
- **No** location, contacts, photos, financial info, health, or device identifiers for ads are collected.

---

## 7. Release

- **Bundle:** `MobTranslate-1.0.8-vc9.aab` (versionName 1.0.8, versionCode 9), signed with your upload key (SHA-256 `2A:08:66:02:B5:B6:34:F8:…:8F:D0`).
- **Path to public:** Internal testing (instant) → **Closed testing with ≥12 testers for ≥14 days** → apply for Production.
- Reuse the same `.aab` across tracks; bump versionCode for any new build.

---

## 8. Keystore — CRITICAL

Upload keystore: `upload-keystore.jks` · alias `mobtranslate-upload`. **Back it up off the server and keep the password forever** — it is the only key that can publish updates to this app.
