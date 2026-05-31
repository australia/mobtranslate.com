# Design

A full design system for MobTranslate — a community-built dictionary, translator, and learning platform for Indigenous languages.

The system is **product-first**: dictionary search, learn quizzes, curator queue, and admin tools are the primary surfaces. Marketing pages (`/`, `/about`) inherit the same tokens but earn editorial liberties. Per-language identity is a first-class concern: every dictionary surface declares a `data-language` and pulls a small accent palette mapped to that language's country.

---

## 1. Theme strategy

**Scene sentence (light, default):** a Kuku Yalanji learner pulls out their phone on a sunny morning bus ride in Cairns to look up "creek" before a class — daylight, warm ambient, one hand, glance-then-act.

**Scene sentence (dark):** a curator reviews 40 pending entries at 10pm at home with one lamp on — focused, low ambient, in flow for 20 minutes.

Light is the default surface. Dark is an explicit user choice via the existing class toggle (`.dark`). Neither is "the cool one"; both are real working states.

**Color strategy: Committed.** The ochre primary carries 30–50% of the surface on product pages (search input border, primary actions, current selection, focus ring) and is allowed to drench on marketing hero. Eucalyptus is a *peer* not a stripe — it carries success state, secondary CTAs, and the entire `/curator` approved-state surface. Night-sky and sand handle structure.

This is not Restrained (one accent ≤10%) — that would flatten the warmth this brand needs. It's not Full Palette either — that would scatter identity. Committed is correct.

---

## 2. Color

OKLCH targets in parentheses for any new colors you add. Existing hex values stay; tune toward these when refreshing.

### 2.1 Earth palette (foundation)

The earth palette already exists in `packages/ui/src/tokens/tokens.css`. Keep its hex values, but apply the rules below.

| Family | Role | Use it for | Don't use it for |
|---|---|---|---|
| **Ochre** | Primary | Brand surface, primary CTAs, focus ring, selection, current-route indicator | Body text, large area fills (drench only in deliberate hero moments) |
| **Sand** | Neutral | Background, surface, muted, borders. ALL neutrals tint toward sand | Action color, state encoding |
| **Eucalyptus** | Secondary | Success, approved state, secondary CTAs, learn-correct feedback, `/curator` approved view | Decorative accent — it's peer to ochre, treat it that way |
| **Night sky** | Info / depth | Info banners, dark mode card surface, code blocks, footnote text | Body text (use foreground), error/warning |
| **Amber** | Warning / hover-accent | Warning state, hover lift on primary actions, learn-streak indicator | Default state of anything |
| **Terracotta** | Destructive / error | Error state, destructive actions, learn-incorrect feedback, `/curator` rejected view | Decoration, any non-warning context |

### 2.2 Semantic tokens

Already defined in `tokens.css`. Keep these names exactly — do not rename in component code:

`--color-primary`, `--color-secondary`, `--color-accent`, `--color-destructive`, `--color-error`, `--color-warning`, `--color-success`, `--color-info`, `--color-muted`, `--color-background`, `--color-foreground`, `--color-card`, `--color-popover`, `--color-border`, `--color-input`, `--color-ring`, plus `*-hover`, `*-active`, `*-foreground` for each.

**Light mode:** warm cream background (`#faf8f5`), deep charcoal text (`#2e2720`), ochre primary (`#b45e2a`), eucalyptus secondary (`#4a8664`). Already correct in the current tokens file.

**Dark mode:** deep warm brown background (`#1c1410`), cream text (`#f5f0ea`), brightened ochre primary (`#e29455`), softened eucalyptus (`#6ba380`). Already correct.

**Never use `#000` or `#fff`** anywhere new. Use `--color-foreground` / `--color-background`. The single exception is `--color-card: #ffffff` in light mode — that's the warm card *on* warm cream, intentional.

### 2.3 Per-language identity tokens

Each dictionary declares an accent on a `data-language` attribute. This is the system's defense against "all Indigenous languages get the same ochre palette." A single token swaps:

```css
[data-language="zku"]  { /* Kuku Yalanji — rainforest */
  --lang-accent: var(--color-eucalyptus-600);
  --lang-accent-soft: var(--color-eucalyptus-100);
  --lang-region-label: "Far North Queensland";
}

[data-language="wbv"]  { /* Wajarri — Mid West WA, semi-arid */
  --lang-accent: var(--color-ochre-700);
  --lang-accent-soft: var(--color-ochre-100);
  --lang-region-label: "Mid West Western Australia";
}

[data-language="aoi"]  { /* Anindilyakwa — Groote Eylandt, tropical coast */
  --lang-accent: var(--color-nightsky-600);
  --lang-accent-soft: var(--color-nightsky-100);
  --lang-region-label: "Groote Eylandt, Northern Territory";
}

[data-language="mic"]  { /* Mi'gmaq — Eastern Canada, boreal */
  --lang-accent: var(--color-eucalyptus-800);
  --lang-accent-soft: var(--color-eucalyptus-50);
  --lang-region-label: "Mi'kma'ki, Eastern Canada";
}
```

Use `--lang-accent` for: the dictionary header underline, the active-language pill on `/`, the `/learn/[dictionary]` progress ring, the `/stats/[dictionary]` chart primary color. Never for body text, error state, or anything semantic.

When adding a new language, the contributor adds one block here. That's it. The rest of the system adapts.

### 2.4 Contrast minimums

All token pairs in `tokens.css` already clear WCAG AA. When adding new combinations:

- Body text on background: ≥7:1 (AAA, already true at `#2e2720` on `#faf8f5`)
- UI text (≥18px or 14px bold) on background: ≥4.5:1
- Non-text UI (icon, border, focus ring): ≥3:1
- Primary CTA text on primary: AA required, AAA preferred — current `#faf8f5` on `#b45e2a` is 4.6:1 ✓

---

## 3. Typography

### 3.1 Stack

Defined in `tokens.css`. Keep these names:

```
--font-sans:    'Inter', system-ui, sans-serif;
--font-display: 'Playfair Display', serif;
--font-mono:    ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
```

**Inter** carries body, UI, labels, data, buttons. **Playfair Display** carries marketing-surface headlines and dictionary-entry headwords (the Indigenous word). **Mono** carries IPA pronunciation guides, language codes (ISO 639-3), and code blocks.

### 3.2 Roles

| Role | Family | Size | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Marketing hero | Display | clamp(2.5rem, 6vw, 5rem) | 700 | -0.025em | Landing page, `/about` opener |
| Marketing H1 | Display | clamp(2rem, 4vw, 3.5rem) | 700 | -0.025em | Section headers on `/`, `/about`, `/learn` overview |
| Headword | Display | 2.5rem | 600 | -0.015em | The Indigenous word on a dictionary entry page |
| Page H1 (product) | Sans | 1.875rem | 700 | -0.015em | `/curator`, `/admin`, `/settings` page titles |
| H2 | Sans | 1.5rem | 600 | -0.01em | Section headers in product views |
| H3 | Sans | 1.25rem | 600 | -0.01em | Card titles, subsection headers |
| Body | Sans | 1rem (17px base) | 400 | 0 | Default body, definitions, descriptions |
| UI | Sans | 0.875rem | 500 | 0 | Buttons, form labels, tags, breadcrumbs |
| Small | Sans | 0.8125rem | 400 | 0.01em | Helper text, captions, footnote attribution |
| Mono | Mono | 0.875rem | 400 | 0 | IPA, language codes, code blocks |

Note: the base is **17px**, set in `apps/web/app/globals.css`. The scale above multiplies from there.

### 3.3 Rules

- **Line length:** prose caps at 65–75ch (use `--container-prose: 65ch`). Definitions, descriptions, and cultural notes get this. Data and dense UI can run wider.
- **Line-height:** body 1.6, headlines 1.15, UI 1.4, mono 1.5.
- **Indigenous word weight:** the headword is always heavier (≥600) than its English gloss (≤500). Never the reverse.
- **`lang` attribute:** every Indigenous word in markup gets `lang="zku"` etc. CSS hook: `[lang="zku"] { font-feature-settings: "kern" 1, "liga" 1; }` (and same for other codes — kerning and ligatures matter for proper rendering).
- **Display font scope:** Playfair Display only on `h1, h2` on marketing surfaces and on the dictionary headword. Product UI uses Inter for every level (the current `globals.css` rule `h1, h2, h3, h4, h5, h6 { font-family: var(--font-display) }` should be scoped to marketing — see Section 9: Migration).
- **No gradient text.** `background-clip: text` is banned. Emphasis is weight + scale.

---

## 4. Layout & spacing

### 4.1 Grid

- **Max content width:** 80rem (`--container-2xl`). Already enforced by `.container-custom` in `globals.css`. Keep.
- **Prose width:** 65ch for any long-form text (definitions, cultural notes, about page).
- **Product app width:** dictionary search, learn, settings stay within 64rem. Admin/curator tables run full container width.

### 4.2 Spacing scale

Defined in `tokens.css` (`--spacing-0` through `--spacing-24`). Use these exact tokens.

**Rhythm rules:**
- Section-to-section vertical gap: `--spacing-16` to `--spacing-24` (vary, don't standardize on one).
- Card internal padding: `--spacing-6` for compact (search results), `--spacing-8` for emphasized (dictionary entry hero).
- Form field vertical gap: `--spacing-4`.
- Inline UI gap (label → input): `--spacing-1-5`.
- Button padding: `0.625rem 1rem` for default, `0.5rem 0.75rem` for compact.

### 4.3 Card discipline

Cards are the lazy answer. Use them only when they're the genuine affordance.

- The dictionary index (`/dictionaries`) is a card grid because each entry is a discrete, navigable language. Keep.
- The home page `/` "How It Works" section is three identical cards. **Refactor:** use a numbered list or a single editorial-typography section with inline diagrams. Three icon-headline-paragraph cards is exactly the SaaS template anti-ref.
- The `/curator` queue is a list, not a card grid. Use rows with row-level affordances (approve / reject / comment), not nested card chrome.
- **No nested cards anywhere.** A card inside a card is always wrong.

### 4.4 Surface elevation

The shadow tokens in `tokens.css` are warm-tinted and correct. Use them sparingly:

- `--shadow-xs` on inputs (focus only)
- `--shadow-sm` on cards at rest
- `--shadow-md` on cards on hover (with `.hover-lift`)
- `--shadow-lg+` reserved for modals, popovers, command palette
- Never `--shadow-2xl` decoratively

---

## 5. Components

Each interactive component has every state: default, hover, focus-visible, active, disabled, loading, error. Don't ship with half. The existing `packages/ui` has primitives — extend, don't replace.

### 5.1 Button

Three variants. Don't add more without a documented reason.

| Variant | Use | Visual |
|---|---|---|
| **primary** | Single primary action per view. "Translate", "Save", "Approve". | Ochre fill, cream text, `--shadow-sm`. Hover: ochre-hover. Focus: ring. |
| **secondary** | Secondary action paired with a primary. "Cancel", "Browse Dictionaries" next to "Start Learning". | Transparent fill, foreground text, `--color-border` border. Hover: `--color-muted` fill. |
| **ghost** | Tertiary, inline, low-noise. Toolbar buttons, list-row actions. | No border, no fill at rest. Hover: `--color-muted` fill. |

**Sizes:** `sm` (32px height, compact UI), `md` (40px, default), `lg` (48px, hero CTAs). Touch target padding ensures ≥44×44 hit area on `md`.

**Destructive:** any variant accepts `destructive` modifier → swap primary token to `--color-destructive`.

### 5.2 Input

- Border `--color-input`, radius `--radius-md`, padding `0.625rem 0.875rem`, height 40px (matches `md` button).
- Focus: outline removed; `--shadow-xs` + 2px ring `--color-ring` (already configured globally).
- Error state: border `--color-error`, helper text in `--color-error`, with an icon — never color-alone.
- **Translator textarea (the homepage hero):** larger — min-height 8rem, font-size 1.125rem, Inter, generous internal padding (`--spacing-6`). The character counter is `--color-muted-foreground` `--text-sm`, right-aligned.

### 5.3 Dictionary entry

The most important component in the system. Anatomy:

```
┌─────────────────────────────────────────────┐
│  [region label, --text-sm, muted]           │
│                                             │
│  HEADWORD                                   │ ← Playfair 2.5rem, weight 600
│  /ipa.pronunciation/   [part-of-speech]     │ ← Mono + tag pill
│                                             │
│  Definition in English. 65ch max line.      │ ← Inter 1.125rem, weight 400
│  No restating the headword.                 │
│                                             │
│  ── Examples ──                             │ ← H3, Inter
│  • Indigenous example sentence              │ ← lang attr; ochre underline accent
│    English translation                      │ ← muted-foreground
│                                             │
│  ── Cultural note ──                        │
│  Story or context, attributed.              │
│  — Source: [contributor name]               │ ← --text-sm, muted
└─────────────────────────────────────────────┘
```

No card chrome around the whole thing — the entry IS the page on `/dictionaries/[language]/[word]`. On a search result list, a more compact variant: headword + part-of-speech + truncated definition, with hover state revealing the example sentence.

### 5.4 Learn card (flip / quiz)

Existing 3D flip utilities (`.preserve-3d`, `.rotate-y-180`, `.perspective-1000`) are in `globals.css`. Keep them.

- Front: Indigenous word, Playfair, 3rem, centered. `--color-card`. Subtle `--shadow-md`.
- Back: English gloss + example sentence + IPA. Inter, 1.25rem.
- Correct state: full card background flashes `--color-eucalyptus-100` for 400ms then settles, eucalyptus border, checkmark icon (top-right, animated scale-in).
- Incorrect state: `--color-terracotta-100` flash, x icon, the correct answer revealed below with a "try saying it again" prompt — never just "wrong."

### 5.5 Curator row (queue item)

A row, not a card. List of pending entries.

```
[lang pill] HEADWORD   /pronunciation/   English gloss preview...   [contributor] · 3d ago   [approve] [reject] [comment]
```

Status color appears as a left-edge inset (NOT a side-stripe border; a 2px inset shadow inside the row's left padding). Approve = eucalyptus, reject = terracotta, pending = sand.

Keyboard: `j`/`k` to move, `a` to approve, `r` to reject, `c` to comment. Show keymap pinned at the bottom.

### 5.6 Tag / pill

For language family, endangerment status, part of speech.

- Radius `--radius-full`, padding `0.25rem 0.625rem`, `--text-xs`, weight 500.
- Default: `--color-muted` bg, `--color-muted-foreground` text, no border.
- Status-aware variants: endangered → terracotta tint; vulnerable → amber tint; severely endangered → terracotta-700; safe → eucalyptus.
- Always pairs with text and/or icon — never color-alone.

### 5.7 Translation result

The home page result box. Currently shows generic error. Should:

- Indigenous translation foregrounded, Playfair, 1.5rem, weight 600, with `lang` attribute.
- English source small above it, `--text-sm`, muted.
- Pronunciation guide (IPA + audio button when available) right under the headword.
- AI disclaimer pinned below in `--color-muted-foreground`, `--text-sm`, with a "report this" link.
- Loading state: skeleton placeholder for the Indigenous word, NOT a centered spinner.

### 5.8 Empty state

Every empty surface teaches the interface. Anatomy:

- Illustration or thumbnail icon (eucalyptus-300 outlined, never decorative photo).
- One-sentence explanation in plain English.
- One primary action.

Examples:
- `/learn/[dict]` first visit: "Start with 10 everyday words. They take about 3 minutes." → Start button.
- Empty curator queue: "All caught up. Nothing pending review." (No fake "well done" copy; just the fact.)

### 5.9 Modal

Modals are usually laziness. Use only when:
- The action requires confirmation (delete entry, reject submission).
- Auth (sign in / sign up — and even here, prefer dedicated routes).

For everything else: inline editing, drawer panels, or a new route. Translation results, curator review, settings — never a modal.

---

## 6. Iconography

- **One family.** Lucide (free, MIT, 24px grid). Already widely used in the React ecosystem.
- **Stroke 1.5–1.75px**, `currentColor` so they inherit semantic color.
- **No custom-painted icons** in the dictionary surface itself. Cultural motifs (boomerang, leaf, etc.) are absent from UI chrome. They live in editorial content if at all — never as ornamentation.
- **Sizes:** 14, 16, 20, 24px. No in-between.

---

## 7. Motion

The existing `globals.css` motion tokens are good. Keep them. Apply by these rules:

### 7.1 Durations

- `--duration-fast` (100ms): hover state transitions (color, border).
- `--duration-normal` (200ms): button press, focus, popover entrance.
- `--duration-slow` (300ms): page enter, theme toggle, modal entrance.
- `--duration-slower` (500ms): learn-card flip, large reveal.

### 7.2 Easing

- `--ease-out` (cubic-bezier(0, 0, 0.2, 1)) for entrances — exponential out, no overshoot.
- `--ease-in-out` for state changes.
- **Remove `--ease-bounce` from product UI** — keep it only in the learn-card "correct" celebration. Bounce is the cliché of "delightful" SaaS animation; reserve it for the one moment it earns its place.

### 7.3 Bans

- No animating `width`, `height`, `top`, `left`, `padding`, `margin`. Use `transform` and `opacity`.
- No orchestrated page-load sequences. Pages enter with the existing `page-enter` keyframe (8px fade-up), nothing else.
- No animation that fires more than once on the same element per session unless triggered by user action.
- Decorative motion (the `animate-shimmer`, `animate-wave`) only on intentional surfaces (loading skeleton, learn-card celebration). Not on icons, headings, or default buttons.

### 7.4 Reduced motion

Already correctly guarded in `globals.css`. New components must respect this — never override with `!important`. If a feature *requires* motion to convey state (e.g., learn-card flip), provide a non-motion alternative (e.g., instant state swap with an icon).

---

## 8. Imagery & illustration

- **Photography:** when used (`/about`, language hero on `/dictionaries/[language]`), it's of the **country** of the language, not of people, and is captioned with location + attribution. No stock photography. No "diverse hands typing on laptops."
- **No decorative cultural motifs** (dot painting, boomerangs, symbols) in UI chrome. If a community contributes artwork, it appears as content with attribution — not as background pattern.
- **Illustration style for empty states / onboarding:** single-color line illustrations in `--color-eucalyptus-300` or `--color-ochre-300`, no shading, no characters.
- **Maps:** when locating a language's country, use a minimal outline map with the region highlighted in `--lang-accent`. No satellite imagery.

---

## 9. Migration notes (current → target)

Implementing this system on the current codebase. Numbered by priority.

1. **Scope display font to marketing only.** The `apps/web/app/globals.css` rule `h1, h2, h3, h4, h5, h6 { font-family: var(--font-display) }` is too broad — it forces Playfair on `/curator` and `/admin` headings where Inter belongs. Scope by either route (`body[data-route^="/curator"] h1 { font-family: var(--font-sans) }`) or by an explicit class on marketing layouts (`.marketing h1 {...}`).

2. **Refactor home page "How It Works" section.** Currently three identical icon-headline-paragraph cards — that's the SaaS template. Replace with a single editorial-typography block: numbered (01, 02, 03 in Playfair display size) with prose paragraphs in 65ch column.

3. **Refactor home page stat counter ("4 Languages, 20,862+ Words, 100% Open Source").** Currently reads as SaaS metric brag. Reframe as a sentence: "4 languages, 20,862 entries, every line of code and every dictionary entry open." Same numbers, different posture.

4. **Replace existing translator error state.** "Translation error occurred. Please try again." is a fail message, not a UX. Use the translation result component (5.7) with an error-flavored variant: explain what failed (rate limit? language not supported? network?) with a recovery action.

5. **Add per-language identity tokens.** Create `apps/web/app/language-tokens.css`, populate per Section 2.3, import into `globals.css`. Wrap dictionary-specific routes in `<body data-language={code}>` via the layout.

6. **Audit current ochre usage.** It's currently used everywhere — links, headings, hover states, CTAs, footer accent. That's too thin to be "Committed." Pull it back to: primary CTAs, focus ring, current-route indicator, headword underline, selection. Let eucalyptus carry secondary actions and success.

7. **Footer Acknowledgement of Country.** Currently a single 14px line. Either give it the typographic weight it deserves (its own section, generous padding, sourced from the actual Traditional Owners of the language's country when on a dictionary route) or remove it from the global footer and place it deliberately on `/about`.

8. **Audit "card" usage.** Identify every `<div class="card">` or equivalent. Justify each. Remove half.

---

## 10. Reference: page-by-page application

### `/` Home
- Marketing register; editorial typography; hero translator carries Playfair on the action verb and Inter for body controls.
- Hero translator output uses Section 5.7.
- Dictionary cards on this page only — they're a legitimate browse affordance.
- "How It Works" reworked to editorial (see migration #2).
- Final CTA pair: "Browse Dictionaries" (secondary), "Start Learning" (primary).

### `/dictionaries/[language]`
- Product register, but with marketing header for the language identity.
- Top: large language headword (Playfair, drenched with `--lang-accent` 5% tint behind it), region label, contributor count, endangerment status.
- Below: search input + word list. Plain rows, not cards.

### `/dictionaries/[language]/[word]`
- The dictionary entry component (Section 5.3) is the entire page.
- Sibling words (alphabetical neighbors) listed in a sidebar at md+, below content at sm.

### `/learn/[dictionary]`
- Full product register; Inter only.
- The learn card (Section 5.4) is the focal element. Single column, generous whitespace.
- Streak counter, words-mastered count, and "session complete" celebration all use the eucalyptus reward palette.

### `/curator/`
- Pure product. Inter only. Dense.
- Curator row (Section 5.5) as the primary affordance. Keyboard-first. Filters in a left rail at lg+.

### `/admin/`
- Pure product. Inter only.
- Dashboards, tables, settings forms. Follow Linear/Stripe/Notion conventions; no editorial liberties.

### `/about`, `/styleguide`
- Marketing register. Display font earns its place here.
- `/styleguide` should render every component variant at every state — it's a working showcase, not a screenshot gallery.
