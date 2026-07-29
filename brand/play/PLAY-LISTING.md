# Mob Translate — Google Play release pack

This is the current, source-of-truth listing and policy checklist for the Android app. It is intentionally narrower than the website: every claim below must be visible and usable in the submitted mobile build.

Last audited: 30 July 2026

App package: `com.mobtranslate.app`

Release: `1.0.16` (`versionCode 17`)

---

## 1. Main store listing

**App name** (30 characters maximum)

```text
Mob Translate
```

**Short description** (74 characters)

```text
Find words, hear voices and follow sources across First Nations languages.
```

**Full description** (4,000 characters maximum)

```text
Find words. Hear recorded voices. Follow the source.

Mob Translate is a calm, source-backed dictionary and learning app for First Nations languages. It brings real dictionary entries, available speaker recordings, daily practice and place names into one respectful place.

LEARN WITHOUT AN ACCOUNT
Choose a language collection, search for a word or English meaning, browse the dictionary and practise five real entries at a time. Learning, listening and place-name exploration stay open without signing in.

FOLLOW THE KNOWLEDGE TRAIL
Open an entry to see its named source, review state, usage notes and known gaps. If Mob Translate does not have a supported answer, it says so instead of filling the space with a machine guess or a word from another language.

HEAR WHAT KIND OF AUDIO IS PLAYING
Available human recordings come first. A computer pronunciation guide is always labelled as synthetic and approximate; it is never presented as the voice of a speaker, Elder or community.

EXPLORE PLACE & COUNTRY CAREFULLY
See documented place names and open each one back to its dictionary source trail. Maps give general orientation only. They do not claim fixed cultural or language boundaries and are not land-claim records.

SHARE A PRONUNCIATION BY CHOICE
Signed-in speakers can optionally contribute a recording beside a public dictionary word or sentence. Before the microphone opens, Mob Translate asks the person to confirm that it is their voice and that they have permission to share the language content. This ordinary choice allows public dictionary listening only—not AI training, voice cloning, model creation, provider transfer, public-domain dedication or commercial reuse. Permission can be withdrawn in the app.

LANGUAGE COLLECTIONS
The live app currently includes Kuku Yalanji, Anindilyakwa and Mi'gmaq collections. Each collection has its own source, publication and community-relationship status. A source or external context link does not by itself imply community endorsement.

Free. No ads. No account required to learn.
```

### Why this wording is safe

- It describes dictionary lookup, not sentence translation that the app cannot reliably promise.
- It does not claim that the project or its collections are community-owned, community-certified or officially endorsed.
- It does not advertise an Android system keyboard; the app does not currently ship an input-method service for typing in every app.
- It describes public voice use exactly as the ordinary consent screen grants it and does not call contributions public-domain.

Google requires listing text and screenshots to accurately reflect the submitted app: [Deceptive Behaviour policy](https://support.google.com/googleplay/android-developer/answer/16680223) and [publishing checklist](https://support.google.com/googleplay/android-developer/answer/15191715).

---

## 2. Graphics and screenshot plan

| Asset | File | Required specification | Status |
|---|---|---:|---|
| App icon | `play-icon-512.png` | 512×512 PNG, opaque | Ready |
| Feature graphic | `play-feature-graphic-v2.png` | 1024×500 PNG, no alpha | Ready |
| Phone screenshots | Capture from `1.0.16` / vc17 | 2–8 PNG/JPG images | Capture after installing vc17 |

Use screenshots that tell the product story in this order:

1. First run — “Find words. Hear voices. Follow the source.” and language choice.
2. Home — selected language, collection-status trail and dictionary lookup.
3. Word detail — meaning, review/source panel and clearly labelled audio source.
4. Learn — the five-word practice flow using real dictionary entries.
5. Place & Country — map disclaimer, documented place names and source-trail action.
6. Voice permission — public dictionary listening allowed; AI/cloning/commercial use clearly excluded.
7. You — open learning boundary, contribution controls, privacy and deletion links.

Do not use screenshots from 1.0.8. Do not show generated sample results, unsupported language content or a screen state that requires a role the supplied reviewer account cannot access.

---

## 3. Store settings

- **App category:** Education
- **Tags:** Education, Language, Reference
- **Contact email:** `ajax@mobtranslate.com`
- **Website:** https://mobtranslate.com
- **Privacy policy:** https://mobtranslate.com/privacy
- **Account deletion URL:** https://mobtranslate.com/account-deletion
- **Contains ads:** No
- **Government app:** No
- **Financial features:** None
- **Target audience:** 13 and older. Public learning content can be used with families and schools; account creation and contribution are intended for people aged 13+.

---

## 4. App access for Google review

Select **All or some functionality is restricted** because contribution tools require an account and the Elder studio requires a curator role.

Enter reusable reviewer credentials directly in Play Console—never in this repository. They must work without a one-time password, location restriction or expiring link. Google’s current requirement is documented in [Sign-in details for review](https://support.google.com/googleplay/android-developer/answer/15748846).

Suggested reviewer instructions:

```text
No account is required for Home, Words, Learn, Country, dictionary audio, source trails, About, Support or Privacy.

To review contribution and permission controls:
1. Open You.
2. Sign in with the reusable reviewer account supplied below.
3. Open Share a pronunciation.
4. The microphone remains unavailable until both voice and sharing-authority confirmations are selected.
5. Public dictionary playback can be withdrawn under You → Voice sharing permission.

The same reviewer account has curator access to Record with an Elder. That studio records each permitted use separately and leaves every option off by default.
```

Before submission, verify that the reviewer account is active, has the required role and has at least one recording target in a live language collection.

---

## 5. Content rating guidance

Use the answers that match the submitted build; let IARC calculate the rating.

- Category: Reference, News or Educational
- Violence: No
- Sexuality or nudity: No
- Profanity or crude humour: No
- Controlled substances: No
- Gambling: No
- Digital purchases: No
- User-generated content: Yes — signed-in people can submit audio, corrections, examples and place suggestions for review/publication.
- User interaction: Answer consistently with Play Console’s current wording. People do not privately message each other, but approved contributions can be heard or read by other users.
- Shares the user’s current physical location: No. The app does not request device location. A deliberately submitted map pin is a content suggestion, not a location reading from the device.

Do not predict or manually claim the final age rating in listing copy.

---

## 6. Data safety answers

**Does the app collect user data?** Yes.

**Does the app share user data with third parties?** No, based on the current implementation: infrastructure/monitoring providers process data as service providers, and any public recording transfer is user-initiated after prominent consent. Reconfirm this if providers or contracts change.

**Is data encrypted in transit?** Yes, through HTTPS.

**Can users request deletion?** Yes, in the app and at the account-deletion URL above.

Google defines “collect” broadly as transmitting data off-device, including pseudonymous data and SDK behavior. Complete the live form against [Google’s Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469), not against this table alone.

| Google Play data type | Collected | Required or optional | Purpose | Current handling |
|---|---|---|---|---|
| Name | Yes | Optional | Account management, app functionality | Only when an account is created |
| Email address | Yes | Optional | Account management | Only when an account is created |
| User IDs | Yes | Optional | Account management, security | Account and pseudonymous contributor identifiers |
| Voice or sound recordings | Yes | Optional | App functionality | User-initiated; public only within the exact saved permission |
| Other user-generated content | Yes | Optional | App functionality | Corrections, examples, place suggestions, consent context and reviewed transcripts |
| In-app search history | Yes | Optional | App functionality, service improvement | Search/request text may be retained for a limited period as disclosed in Privacy |
| App interactions | Yes | Required | Analytics, app functionality | App opens and limited feature events; no advertising tracker |
| Diagnostics | Yes | Required | Security, reliability | Standard request/error details in operational logs |

### Not collected by the current Android app

- Device physical location: no coarse/fine location permission and no device-location API.
- Contacts, photos or videos, health, financial or payment information.
- Advertising ID or other persistent device ID for advertising.
- Text typed into other apps: Mob Translate does not currently ship an Android input-method service.

### Voice disclosure shown before collection

The microphone is requested only after the in-app permission explanation. Ordinary sharing grants public dictionary playback only. AI training, speech-recognition training, hosted-provider transfer, voice cloning, model weights, public metrics, commercial reuse and public-domain dedication remain off. Curator-led speech sessions use separate, granular choices and bind recordings to the exact consent version.

---

## 7. Account deletion

Because the app supports account creation, Google requires both an in-app path and an external deletion resource. The submitted build links **You → Delete account and data** to the working public page above. The page names Mob Translate, explains what is deleted and provides a direct request action. See [Google Play’s account-deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

---

## 8. Testing path to production

For a personal developer account created after 13 November 2023, Google currently requires a closed test with at least **12 testers continuously opted in for 14 days** before applying for production access. Internal testing is optional and does not satisfy that requirement. Keep the closed test active while uploading vc17. See [Google’s testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465) and [test-track setup](https://support.google.com/googleplay/android-developer/answer/9845334).

Tester email addresses must be Google Accounts or Google Workspace accounts. Adding an address is not enough: each tester must open the opt-in link while signed into that address and remain opted in continuously.

---

## 9. Android release

- **Upload bundle:** `MobTranslate-1.0.16-vc17.aab`
- **Sideload build:** `MobTranslate-1.0.16-vc17.apk`
- **Package:** `com.mobtranslate.app`
- **Version name/code:** `1.0.16` / `17`
- **Only declared sensitive permission:** `android.permission.RECORD_AUDIO`
- **Minimum / target SDK:** `24` / `36`, verified from the final AAB
- **AAB SHA-256:** `a5a62b4fd67c3f53cfadc40842af6681ab7189fbc88e84ee33bbccd3308b2955`
- **APK SHA-256:** `8388bc5c9f07cca5018e400d839a0c8a1085833d5a2d782cc43e16f4f52ca969`
- **Upload certificate SHA-256:** `2A:08:66:02:B5:B6:34:F8:57:44:4B:D2:93:20:78:31:7D:69:BB:8D:04:C0:31:F8:9D:9C:D1:06:64:6E:8F:D0`
- **Release note:** `Clearer dictionary recovery, more honest artwork labels, and contribution status that tells you exactly what happens next.`

The bundle targets API 36, satisfying Google’s current target API requirement: [Target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878).

Never reuse an older bundle after uploading vc17; every later build must increment `versionCode`.

---

## 10. Upload key

The private upload keystore and password stay only in the ignored local release folder and permanent private backups. Never commit them, paste them into a task, or place reviewer credentials beside them.

Before every release:

1. Verify the AAB certificate matches the registered upload certificate.
2. Verify package name, version name, version code, target SDK and permissions from the AAB itself.
3. Back up the keystore and password in two private locations.
4. Upload only the `.aab`; testers can use the `.apk` only for direct sideload checks.
