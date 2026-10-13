# Styleguide completion contract

Goal: a functional MobTranslate design system with the breadth and depth of Google's Material Design documentation. Preserve MobTranslate's existing visual identity and source-attribution principles. Material is a coverage reference, not a claim that this library implements Material's APIs.

## Reference and scope

Primary reference: https://m3.material.io/ (foundations, styles, components, develop). Coverage checked on 2026-10-13. Author guidance for this React/web library; state native-platform differences where relevant. Do not invent Indigenous language examples.

## Required deliverables and completion evidence

| Area | Required result | Evidence required |
| --- | --- | --- |
| Documentation shell | Search across all topics, active navigation, section anchors, mobile navigation, theme persistence, keyboard access | Desktop/mobile browser checks; Escape/focus restoration; search and link crawl |
| Foundations | Principles, tokens, color roles/contrast, typography, spacing, adaptive layout, shape, elevation, iconography, motion, interaction states, input/gestures, writing, internationalization, accessibility | Every subject has decisions, specifications, examples, failure cases, implementation and verification guidance |
| Components | Every exported component documented with overview, usage, anatomy, variants, dimensions/tokens, all applicable states, behavior, keyboard/screen-reader requirements, API, working examples, related components | Source/API comparison; route crawl; interaction tests for each family; verified copyable examples |
| Material component coverage | Map Material families to this library: actions (including icon/FAB), communication (badges/progress/snackbar), containment (cards/dialogs/sheets), navigation (bars/rails/drawers/tabs), selection (chips/switches/checkbox/radio/slider), text fields, menus, search, date/time input | Explicit mapping with implemented equivalents and honest gaps; complete missing equivalents or documented web patterns |
| Patterns | Forms/validation, navigation, search/filter, data display, loading/empty/error/offline, confirmation/undo, source/review status, permission, learning/audio | Real interactive flows, state announcements, recovery, keyboard and narrow viewport checks |
| Developer guidance | Installation that actually works in this workspace, composition, theming, migration, contribution/testing, platform boundaries | Commands run; code typechecked; references resolve; no unsupported package-publication claims |
| Tools | Theme/color contrast inspection, responsive layout and state exploration, token lookup/copy/export | Tools tested using changed values, both themes, invalid inputs, clipboard failure |
| Delivery | Runnable production build, reproducible quality checks, documented preview/start commands | Typecheck/lint/build; complete HTTP route/link crawl; automated accessibility plus manual keyboard/visual checks |

## Starting evidence (2026-10-13)

- Clean worktree at `95d22fe`, branch `codex/mobtranslate-work-20261013`.
- 50 component routes, 5 foundations, 4 guides, 3 patterns. Existing demos and prop tables are useful starting material, not proof of depth or correct behavior.
- Color documentation lists blue primary while CSS uses ochre; resolve against real tokens.
- Installation implies a published package even though the package is private. CSS paths also need verification.
- Code copy lacks failure handling; mobile navigation has no focus containment or accessible expanded state; search only indexes labels; documentation has no section navigation.
- Next config bypasses TypeScript build errors. Remove this bypass after addressing baseline failures.

## Status

In progress. Completion requires the full table above. A passing build or an expanded topic list does not prove completion.

### Verified progress, 2026-10-13

- Added detailed Layout, Shape and Interaction states foundations with anatomy, specifications, live labs, implementation guidance, failure cases and verification instructions.
- Added section anchors, desktop page outline, skip link, named topic filtering, truthful empty-search feedback and active-page semantics.
- Native mobile navigation dialog contains focus, closes with Escape, returns focus and closes after selecting a destination. Browser verified.
- Theme switching now applies explicit `.light` as well as `.dark`, synchronises desktop/mobile instances and tolerates unavailable storage.
- Code copying retains literal source and announces clipboard rejection. Browser verified.
- Repaired Collapsible composition and Slider value narrowing. Migrated the styleguide to ESLint flat configuration. Removed TypeScript build bypass and obsolete Next webpack configuration.
- `pnpm --filter styleguide lint`: passed. `typecheck`: passed. Production build: passed with TypeScript checking, 69 prerendered pages including framework routes; peak build memory 966.1MB.
- `pnpm --filter styleguide test:browser`: 8/8 passed. This covers the shell and new labs, not every component or full accessibility.
- 67 navigation routes resolve to files; 8 foundation pages exist. Desktop, mobile and dark-theme screenshots inspected at `/mnt/donto-data/donto-resources/outputs/mobtranslate-styleguide-20261013/`.
- Replaced the token summary with a generated catalogue of all 318 CSS declarations, search/group filters, light/dark/live values and filtered CSS/JSON exports. Added a drift check and build-time generation.
- Replaced the blue-based static color documentation with actual rendered role pairs and a working WCAG sRGB contrast checker. Measures unrounded ratios and rejects invalid inputs.
- The shared stylesheet now uses `@theme static`, ensuring every declared custom property is emitted for dynamic consumers.
- Expanded browser suite: 10/10 passed, including all-token availability, theme updates, exports and contrast extremes/invalid input.
- The live color tool exposed a dark info foreground failure (3.52:1), plus light secondary (4.06:1) and destructive/error (4.31:1) failures. Corrected them using existing palette shades and a dark foreground for the dark info fill. Updated secondary/destructive hover and active roles accordingly.
- Added shorthand-hex handling for the browser’s computed `#fff` values. The checker’s editable fields still explicitly accept opaque `#RRGGBB` inputs.
- Final browser suite: 11/11 passed, including all 12 documented semantic text pairs in both rendered themes. This is text-pair evidence, not whole-page or whole-library WCAG certification.
- Removed blanket contrast/compliance claims from the existing accessibility introduction. Full accessibility guidance and all component combinations still need the complete audit.
- Final production build passed after the palette corrections (TypeScript enabled; peak build memory 1010.6MB). All 67 navigation destinations returned HTTP 200 with main content and a page heading from the production server.
- Ran the 11-test browser suite against the production server: 11/11 passed. Results and build logs are retained in the output directory above.
- Local preview: `mobtranslate-styleguide-20261013.service`, http://127.0.0.1:3003, user service capped at 2GB RAM and 100% of one CPU.

Remaining: complete all other foundation subjects; reconcile the legacy TypeScript token exports and remaining foundation specimens with the rendered CSS; deepen every component; implement missing Material-family web patterns; expand task patterns; verify APIs/code, all component families, both themes, accessibility and responsive behavior. The production route check proves reachable pages, not complete component behavior or Material-depth documentation. No full-completion claim yet.
