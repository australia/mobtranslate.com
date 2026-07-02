# Kuku Yalanji Resource Inventory

Date: 2026-06-30

This inventory covers local resources found on the VPS for MobTranslate and related Kuku Yalanji / Eastern Kuku Yalanji work. No web search was used.

## MobTranslate System

- Repo: `/mnt/donto-data/workspace/mobtranslate.com`
- Storage: `/mnt/donto-data/mobtranslate-storage`
- Database: local Postgres container `mobtranslate-pg`, database/user `mobtranslate`
- Live services: `mobtranslate-web.service`, `mobtranslate-tts.service`
- Database credentials live under `/opt/mobtranslate/*.env`; do not print them into logs or docs.

MobTranslate is a Next.js/Turborepo Indigenous language dictionary and translation platform. The current stack is self-hosted Postgres/Drizzle/better-auth after migration away from hosted Supabase. It includes dictionary browsing, AI translation, learning/leaderboards/favorites, recording/voice tooling, TTS, Expo mobile app work, and Android keyboard work.

## Translation Improvement Docs

- `/mnt/donto-data/workspace/mobtranslate.com/research/translation-improvement-prd-2026-06-29.md`
- `/mnt/donto-data/workspace/mobtranslate.com/research/translation-improvement-research-2026-06-29.md`
- `/mnt/donto-data/workspace/mobtranslate.com/research/kuku-yalanji-speech-to-text-research-2026-06-29.md`

Key Kuku Yalanji implications:

- Kuku Yalanji is one of the three active translation languages, alongside Anindilyakwa and Mi'gmaq.
- It has roughly 2,700 headwords and enough dictionary/examples to fit the whole dictionary into model context today.
- The PRD frames Kuku Yalanji as the best near-term fine-tuning candidate among the active languages because the dictionary is broad and the usage examples provide an initial parallel corpus.
- The research direction is not prompt-only translation. The path is verified sentence pairs, active learning, synthetic data review, grounded retrieval, eval harnesses, and eventually LoRA/fine-tuning.
- For speech-to-text, the recommended path is community recording loops first, then Whisper-large-v3 LoRA or Meta MMS adapter work once hours of speaker-held-out recordings exist.

## Canonical Kuku Yalanji Dictionary Files

Directory: `/mnt/donto-data/workspace/mobtranslate.com/dictionaries/kuku_yalanji`

Important files:

- `dictionary.yaml` - canonical enriched dictionary, 2,688 headword rows.
- `dictionary.yaml.backup-2026-06-23`
- `dictionary.js`
- `dictionary.md`
- `grammar.md`
- `lexemes.json`
- `lexicon.jsonld`
- `framework.json`
- `accepted_words.json`
- `missing_candidates.json`
- `MISSING-WORDS.md`
- `SCHEMA.md`
- `resources/dictionary.pdf`
- `resources/grammar.pdf`
- `grammar_assets/*.jpeg`

Scripts:

- `gen_grammar.py`
- `finalize.py`
- `find_missing.py`
- `enrich.py`
- `gen_markdown.py`
- `apply_patches.py`

Public app copy:

- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/dictionaries/kuku_yalanji/dictionary.yaml`

Schema/provenance notes:

- Headwords, definitions, and translations come from community dictionary/Hershberger lineage and Patz grammar enrichment.
- Original language data is not to be fabricated; enrichment is additive and grounded.
- `MISSING-WORDS.md` records the Patz grammar mining pass: 1,977 glossed lexeme attestations, 104 candidate roots, 65 accepted, 34 rejected, 63 new grammar-source lexemes merged.

## Database Counts

Language row:

- id: `d32404a2-82f9-4199-801f-6ed1bcd11c30`
- code: `kuku_yalanji`
- name/native_name: `Kuku Yalanji`
- region: Far North Queensland, Australia
- family: Pama-Nyungan
- script: Latin
- status: severely endangered
- active: true

Lexical data:

- words: 2,688
- definitions: 2,795
- translations: 3,808
- usage examples: 449
- synonyms: 125
- phonemic forms: 2,679 words
- commentary: 1,590 words
- location words: 109
- location words with coordinates: 89
- YAML-sync managed words: 2,688
- grammar-source entries: 63
- community/null-source entries: 2,625

Major part-of-speech counts:

- nouns: 1,723
- adjectives: 254
- transitive verbs: 246
- intransitive verbs: 198
- adverbs: 51
- temporal: 30
- locational: 23
- personal-pronoun: 18
- interrogative: 17
- particle: 14
- demonstrative: 11
- interjection: 9

Major semantic domains:

- place-name: 216
- flora-tree: 207
- fauna-bird: 155
- cognition-emotion: 132
- fauna-fish: 116
- body-part: 107
- value-quality: 107
- manipulation-impact: 106
- speech-communication: 81

Translation/TTS request history:

- translation_requests: 251
- tts_generations: 2,835
- tts plays: 117

## Audio And Voice Resources

TTS:

- `/mnt/donto-data/mobtranslate-storage/tts/kuku_yalanji`
- 2,835 MP3 files, about 22 MB.
- DB model/provider: `facebook/mms-tts-pjt`, engine `mms-tts`, format `mp3`.
- Current Kuku neural TTS uses a Pitjantjatjara donor model with a Patz-grounded Kuku Yalanji to Pitjantjatjara orthography bridge.

TTS code:

- `/mnt/donto-data/workspace/mobtranslate.com/packages/tts/PLAN.md`
- `/mnt/donto-data/workspace/mobtranslate.com/packages/tts/mobtranslate_tts/orthography.py`
- `/mnt/donto-data/workspace/mobtranslate.com/packages/tts/mobtranslate_tts/registry.py`

Human recordings:

- `/mnt/donto-data/mobtranslate-storage/recordings`
- 44 files on disk, about 6.3 MB.
- Active DB clips: 18 word recordings and 3 sentence recordings.
- Active duration: about 43.91s word audio and 10.49s sentence audio.
- Speaker profiles: 5.
- Cultural consent: 5 profiles.
- Training consent: 1 profile.

## Public App Assets

Word/day and word-image assets:

- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/wotd/kuku-yalanji-junkali.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-ba.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-bajal.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-babi.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-bajabaja.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-badi.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-babaji.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-babarr.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-bakamu.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-babajaka.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/word-img/kuku-yalanji-baban.jpg`

Story assets:

- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/stories/kuku-yalanji-camp`
- Files include `dawn.jpg`, `kangaroo.jpg`, `stars.jpg`, `yarning.jpg`, `turtle.jpg`, `country.jpg`, `camp.jpg`, `fire.jpg`, `bush.jpg`, `_attributions.json`.

Mobile generated assets:

- `/mnt/donto-data/workspace/mobtranslate.com/mobile/assets/images/gen/lang-kuku_yalanji.jpg`
- `/mnt/donto-data/workspace/mobtranslate.com/mobile/assets/images/gen/map-kuku_yalanji.jpg`

Android packages:

- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/downloads/mobtranslate-app.apk`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/downloads/mobtranslate-app-1.0.1.apk`
- `/mnt/donto-data/workspace/mobtranslate.com/apps/web/public/downloads/mobtranslate-keyboard.apk`

## Mobile And Keyboard Work

Memory files:

- `/home/ajax/.claude/projects/-home-ajax/memory/project_mobtranslate_mobile_app.md`
- `/home/ajax/.claude/projects/-home-ajax/memory/project_mobtranslate_keyboard.md`
- `/home/ajax/.claude/projects/-home-ajax/memory/project_mobtranslate_voice_pages.md`
- `/home/ajax/.claude/projects/-home-ajax/memory/project_mobtranslate_anindilyakwa_tts.md`

Relevant content:

- Expo Android app under `mobile/`.
- Native Android keyboard work under `/mnt/donto-data/workspace/mobtranslate.com/keyboard-android`.
- HeliBoard clone under `/mnt/donto-data/workspace/heliboard`.
- Keyboard memory reports an offline Kuku Yalanji dictionary bundle with 2,769 English keys.
- Voice pages include readiness modeling, speaker profiles, recording pages, and notes that 2,679/2,688 Yalanji words have phonemic IPA coverage.

## PDF-To-Markdown And Extraction Experiments

Directory:

- `/mnt/donto-data/workspace/mobtranslate.com/experiments/pdftomd`

Important files/directories:

- `grammar.pdf`
- `grammar_complete.md`
- `grammar_markdown/pages_*.md`
- `extract/output/lexicon.jsonld`
- `extract/output/examples.xigt.json`
- `extract/output/grammar_features.csv`
- `extract/output/processed_chunks.json`
- `extract/tts/mapping_kuku.py`

## Bloomfield Mission Papers

Directory:

- `/mnt/donto-data/donto-resources/genealogy/bloomfield-mission-papers`

This is a complete digital edition of late-19th century Bloomfield River/Wujal Wujal mission papers and related records.

Key counts:

- 790 page/leaf folders transcribed.
- 3,160 total transcription files.
- 2,370 markdown transcription files.
- 2,625-entry Kuku Yalanji dictionary.

Important files:

- `README.md`
- `docs/YALANJI_DECODE.md`
- `docs/DIYARI_DECODE.md`
- `docs/DECODER_SPEC.md`
- `docs/RECONSTRUCT_SPEC.md`
- `docs/TRANSCRIBER_SPEC.md`
- `manifest.csv`
- `dictionaries/kuku_yalanji_dictionary.yaml`
- `dictionaries/kuku_yalanji_dictionary_OCR.txt`

Edition PDFs:

- `editions/01_Yalata_Gibson_records.pdf`
- `editions/02_WujalWujal_Inquiry_1890.pdf`
- `editions/03_Rechner_Folder1_1887-1890.pdf`
- `editions/04_1887_Transcripts_Summaries.pdf`
- `editions/05_Rechner_Folder2_1890-1891.pdf`

`docs/YALANJI_DECODE.md` identifies confirmed Kuku-Yalanji leaves and records the spelling map and core glossary used for local-language decoding.

## Native Title And Genealogy Research

Primary local research tree:

- `/home/ajax/notes/peter-elder-research`

High-value Kuku Yalanji entry points:

- `/home/ajax/notes/peter-elder-research/dossiers/PREP-language-references.md`
- `/home/ajax/notes/peter-elder-research/dossiers/_research-kuku-yalanji-decoding.md`
- `/home/ajax/notes/peter-elder-research/CHRONICLE-MAXIMAL-1850-1950.md`
- `/home/ajax/notes/peter-elder-research/REPORT-FORENSIC.md`
- `/home/ajax/notes/peter-elder-research/REPORT-LITERARY.md`
- `/home/ajax/notes/peter-elder-research/SEARCH-buru-china-camp.md`
- `/home/ajax/notes/peter-elder-research/SEARCH-nmp.md`
- `/home/ajax/notes/peter-elder-research/BLOOMFIELD-MISSION-Davis-1890-Inquiry.md`
- `/home/ajax/notes/peter-elder-research/BANA-YARRALJI-corporate-extraction.md`
- `/home/ajax/notes/peter-elder-research/MURPHY-2015-thesis-extraction.md`
- `/home/ajax/notes/peter-elder-research/deep-research-anderson-1984-extraction.md`
- `/home/ajax/notes/peter-elder-research/deep-research-place-clan-name-decoding.md`

Important linguistic content in this tree:

- Kuku-Yalanji place/clan/person-name decoding.
- Buru/China Camp and Buru-warra notes.
- Wujal Wujal, Dandi, Dikarr, Banabila, Jajikal, Kuna, Helenvale/Bibikarrbaja, Kija/Roaring Meg Falls, Ngalba-Bulal/Mt Pieter Botte.
- Kin/social terms including `bama`, `bubu`, `ngaji`, `babi`, `nganjan`, `ngamu`, `maja`, `mandi`.
- Morphological notes including `-(w)arra`, `-baka`, and `kuku + yala-nji`.

Current caveat: this tree is under `/home/ajax/notes`, not the mounted research-drive canonical area. It should be linked or migrated later, except where another process still owns the files.

## Buru / China Camp Resources

Directory:

- `/home/ajax/donto-resources/buru-china-camp`

This is called out in the operator handbook as a live-download exception/symlink target. Leave it in place until its owning process is finished.

Key files:

- `/home/ajax/donto-resources/buru-china-camp/sources/kuku-yalanji-toponymy-china-camp-cluster.txt`
- `/home/ajax/donto-resources/buru-china-camp/README.md`
- `/home/ajax/donto-resources/buru-china-camp/BURU-CAMPAIGN-FINAL-REPORT.md`
- `/home/ajax/donto-resources/buru-china-camp/BURU-LOCATION-DOSSIER.md`
- `/home/ajax/donto-resources/buru-china-camp/BURU-500-MARKED.md`
- `/home/ajax/donto-resources/buru-china-camp/500-CREATIVE-ANGLES.md`
- `/home/ajax/donto-resources/buru-china-camp/material/BURU-SURVEY-PLAN.md`
- `/home/ajax/donto-resources/buru-china-camp/material/BURU-CHINA-CAMP-SYNTHESIS.md`
- `/home/ajax/donto-resources/buru-china-camp/material/BURU-MATERIAL-CULTURE.md`
- `/home/ajax/donto-resources/buru-china-camp/native-title/BURU-EKY-NATIVE-TITLE.md`
- `/home/ajax/donto-resources/buru-china-camp/native-title/eky-tracker/BURU-EKY-APICAL-BRIDGE.md`

The toponymy file is especially valuable. It lists Buru as China Camp and includes Buru-warra, Buru-warri, Burunbu, Dikarr, Kija, Kulki, Wujal-wujal, Ngalba-butal, and many other local place-name forms.

## Genes / Native Title Resources

Directory:

- `/mnt/donto-data/workspace/genes/native-title/resources`

High-value source:

- `/mnt/donto-data/workspace/genes/native-title/resources/anderson-1984-full-text.txt`
- `/mnt/donto-data/workspace/genes/native-title/resources/anderson-1984-kuku-yalanji-social-history.pdf`

Other resource clusters:

- `autoresearch-backup/`
- `owen-reynolds/`
- `rosie/`

Important examples:

- `rosie/CIFHS_EKY_ILUA_Apical_Ancestors_2021.md`
- `rosie/EKY_Apical_Ancestors_Deep_Research_2026-04-05.md`
- `rosie/Western_Yalanji_Apical_Ancestors_2013.md`
- `autoresearch-backup/oral-histories/OH55_*`
- `autoresearch-backup/bloomfield-mission-1890-pages/page-*.txt`

## Other Donto Resource Areas

Kirstine / Patkay source captures:

- `/mnt/donto-data/donto-resources/research/kirstine-patkay-sources`
- Includes Kuku Yalanji Wikipedia captures, Mossman/Douglas sources, CYLC/EKY/Mossman captures, and `MANIFEST.tsv`.

Marilyn Wallace Friday / Bana Yarralji source:

- `/mnt/donto-data/donto-resources/research/marilyn-wallace-friday/murphy-2015-thesis.txt`
- Helen Murphy 2015 JCU thesis on Bana Yarralji Bubu educational tourism and Aboriginal development aspirations.

Generated official docs:

- `/mnt/donto-data/donto-resources/notes-misc/official-docs`
- Contains generated TeX/log/toc/pdf support files for EKY apical ancestors and related family/native-title treatises, including Caroline Rose Davis, Peter Wallace, and Elder/Peter kin-network reports.

Blucher raw text captures:

- `/mnt/donto-data/donto-resources/notes-misc/notes/blucher-research/resources/raw-text`
- Kuku-relevant files include `wikipedia__Kuku_Yalanji.txt`, `wikipedia__Kuku_Nyungkal.txt`, `govt__qldgov-wujal-wujal.txt`, `oh55-20__ruby-friday-1995.md`, `oh55-37__bamboo-friday-1995.md`, `oh55-25__harry-shipton-1995.md`, `local-history__missionaries-bloomfield.txt`, and `local-history__cifhs-eky-ilua.txt`.

Temporary cached research pages:

- `/home/ajax/tmp/wave6/trove-powell-yalanji.html`
- `/home/ajax/tmp/wave6/google-ms3094.html`
- `/home/ajax/tmp/wave6/ddg-ms3094.html`
- `/home/ajax/tmp/wave6/austlii-brady-wayback.html`

These are lower-canonical-value temp captures but may still preserve useful source state.

## Immediate Follow-Ups

- Build a machine-readable manifest from this inventory with path, type, language/domain, source authority, and migration status.
- Link or migrate `/home/ajax/notes/peter-elder-research` into `/mnt/donto-data/donto-resources/` to satisfy the mounted-drive research rule.
- Do not move `/home/ajax/donto-resources/buru-china-camp` until its live download/process ownership is resolved.
- Treat the Kuku dictionary, Bloomfield mission papers, Anderson thesis, Buru toponymy file, and Peter Elder language dossiers as the highest-value resource set for translation and cultural/geographic grounding.
