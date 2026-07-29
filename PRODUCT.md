# Product

## Register

product

## Users

**Primary: Indigenous language learners and community members.** A Wajarri grandchild looking up the word for "grandmother" on their phone between bus stops. A Kuku Yalanji young adult building a daily vocab habit on the train. A Mi'gmaq teacher pulling up a definition mid-lesson on a classroom laptop. Connection bandwidth varies; English may be the interface language but is never the user's full identity; the mood ranges from idle curiosity to deeply personal reconnection.

**Secondary: language custodians, linguists, and curators.** Knowledge-holders reviewing pending entries in `/curator`. Researchers cross-referencing dialects. Admins moderating contributions and watching analytics in `/admin`. They're in workflow, not browsing — they need density, keyboard speed, and unambiguous status.

**Tertiary: non-Indigenous allies and supporters.** Teachers, students, donors, developers landing on the marketing surface. They need enough orientation to understand the project, and a clear path either to use it (learners) or contribute (custodians, devs).

The job: **look up a word, learn a word, remember a word — with the language treated as the subject, not the artifact.**

## Product Purpose

MobTranslate is an independent, source-attributed dictionary and learning project for Indigenous languages, with translation models published separately as research. Existing reference materials are scattered across dictionaries, grammars, archives, recordings, and contributed records. The product makes that evidence searchable while keeping source, terms, review state, and research uncertainty visible. Publication does not imply that a collection is official, community-owned, or community-certified.

The learner-facing promise is **source-backed lookup, not generated fluency**. The home experience searches Indigenous headwords and English meanings in either direction and opens the underlying dictionary record. A missing entry stays missing. Sentence generation belongs only on a clearly labelled research surface until that exact model and language have passed linguistic evaluation, rights review, and documented community authorization for learner use. A warning label cannot substitute for those gates.

Learning follows the same promise. The mobile app offers a five-word daily practice assembled deterministically from real entries in the selected working collection. It never invents a gloss, example, cultural note, or pronunciation. Each answer can be opened as a full entry with source and review state; human audio is preferred and synthetic audio stays labelled as an approximation. A streak records that a learner returned—not that a word, language, or cultural responsibility has been “mastered.” Recording remains an important contribution workflow, but it does not displace learning in the primary learner navigation.

Success looks like:
- A learner returns daily because lookup is instant and the learn flow is satisfying enough to repeat.
- A custodian trusts the curator queue enough to approve in batches without auditing every field.
- The MIT-licensed application can be cloned and self-hosted while each language dataset and model retains its own terms.

## Brand Personality

**Respectful, grounded, warm.** Custodial rather than performative. The interface welcomes documented participation from language custodians, speakers, linguists, and learners without implying approval that has not occurred. We are infrastructure, not the protagonist.

The product lockup uses **“Language first. Always.”** It is a design test, not an ownership claim: MobTranslate must never imply that publication proves community ownership, endorsement, or certification.

Voice: plain English, second-person where helpful, never academic, never patronising. Cultural notes are sourced and credited. We don't translate a word without showing where the entry came from.

Emotional goals: trust (this is the real dictionary, not a curiosity), pride (the language is foregrounded, not flattened), competence (you can actually learn here).

## Anti-references

**Primary:** generic SaaS / startup template. No gradient hero, no purple-to-blue tech palette, no "AI-powered" badging, no triple-feature card row with stock icons, no big-number hero metrics ("4 languages, 20,862 words" presented as a SaaS stat counter), no "Get Started → Sign Up" funnel framing of a public-good resource.

**Secondary anti-references to also avoid:**
- **Cultural-tourism shortcuts:** dot-painting motifs as decoration, ochre as the only palette signal of Indigeneity, "red dirt and didgeridoo" visual clichés. Earth tones are fine when they're *grounded in the actual landscape of the language* (Kuku Yalanji is rainforest, not desert; Mi'gmaq is northeastern Canadian forest — palette must reflect this).
- **Wiktionary / old-Wikipedia feel:** dense unstyled text, underlined-blue links everywhere, zero typography care.
- **Heavy government / institutional:** bureaucratic grey-and-navy, compliance-first form layout, .gov.au energy.
- **Tech-bro reverence performance:** floating Acknowledgement of Country at page bottom in 11px text as a checkbox-tick — must be deliberate or absent.

## Design Principles

1. **The language is the subject.** Indigenous word foregrounded; English gloss subordinate. Typography, hierarchy, and color all reinforce this — never the other way around. This is the test for every screen.

2. **Custodial confidence.** Show source, contributor, and approval state for every entry. Never route research model output into learner tools without explicit authorization. Research limitations stay visible and honest, not buried in tooltips.

   On mobile, this appears as a **Knowledge trail** attached to source-backed results. A reviewed dictionary record, an unreviewed record, and a record with no documented source are different states with icon + label + plain-language explanation. Experimental sentence generation is not another learner-result state; it stays on a separate research surface.

   Audio follows the same rule. An attributed source or contributed human recording plays before synthetic speech whenever it exists. User recordings are labelled as recorded voices, not automatically treated as reviewed or community-certified. Synthetic speech is always called a pronunciation guide and described as an approximation; it never borrows the identity of a language speaker.

   Source evidence also has levels. A **dictionary collection** can support a whole imported entry; an **entry created from a source** can name the exact record; a **linked archive record** can support recordings and imported examples without being presented as the author of every field. Source and review are separate facts: neither a citation nor an internal “reviewed” flag implies community endorsement. When no defensible source record exists, the interface says so plainly and keeps the gap visible for curation.

   Trust also exists at the **collection level**. Every public dictionary states (a) how complete its source trail is, (b) whether its licence or publication permission is documented, and (c) whether Mob Translate has a recorded community stewardship relationship. These three states never collapse into one “official” or “community” badge. Until a relationship is evidenced, the product says **independent working collection** and treats links to community organisations as context—not endorsement.

3. **Earth tones, not earth clichés.** The Earth palette (ochre, sand, eucalyptus, night sky) is the system; how it's applied depends on the **specific language's country**. Each dictionary carries a small per-language identity treatment (accent hue, hero photograph, geographic origin label) — Wajarri (Murchison and Gascoyne) reads differently from Kuku Yalanji (Far North Queensland rainforest) reads differently from Mi'gmaq (Mi'kma'ki, Atlantic Canada).

4. **Product surfaces serve the task.** Dictionary search, learn quiz, curator queue, admin analytics — these are not marketing pages. Familiar component vocabulary (Linear / Notion / Stripe quality bar), tight loading states, keyboard-first, no decorative motion. Delight is reserved for word-level moments (a satisfying flip on a learn card), not page-level theatre.

5. **Built in the open.** Every interface element should pass the "would a contributor be proud to PR this?" test. No proprietary-feeling polish, no marketing flourish that contradicts the MIT-licensed, fork-it-yourself reality.

## Accessibility & Inclusion

**WCAG 2.2 AA minimum, AAA where reasonable** (especially color contrast and focus indicators). The current `globals.css` already covers skip links, focus-visible rings, reduced-motion, forced-colors, and sr-only — that bar must be maintained, not regressed.

**Specific considerations:**
- **Reduced motion:** all decorative animation is opt-in to motion-safe. The existing `prefers-reduced-motion` guard in `globals.css` is correct; new components must use the same pattern.
- **Color blindness:** never encode state in color alone. The curator queue (approved / pending / rejected) and learn-quiz correctness must carry icon + label + color, not color alone.
- **Variable connection:** target dictionary search to be usable on 3G. No web-font flash that hides Indigenous word for >100ms; prefer `font-display: optional` for display fonts on dictionary entry pages.
- **Touch targets:** 44×44 minimum across all primary actions; learn-card tap zones at 56×56 for mid-game tap accuracy.
- **Language tags:** every Indigenous word renders with its BCP 47 language tag (`gvn`, `aoi`, `mic`, `wbv`) rather than an internal dictionary code. This helps screen readers and translation tools handle the text without "fixing" its spelling.
- **Acknowledgement of Country:** never an afterthought footer. Where it appears, it's typeset with the same care as the headline above it.
