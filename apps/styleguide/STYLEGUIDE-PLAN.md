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

### Foundation expansion, 2026-10-13

- Replaced Typography, Spacing, Elevation and Motion with authored usage/role decisions, source-generated specifications, live labs, implementation, failures and verification guidance. Shadow specimens now use the actual theme-dependent CSS, not legacy black-shadow values.
- Added Iconography, Writing, Internationalization and Input/gestures. These distinguish symbol/target size, accessible action names, source authority, translated interface vs content language, locale fallback/time zones, bidi isolation, and dragging vs keyboard/single-pointer alternatives.
- Eight live foundation labs support real changes. Reordering preserves a meaningful enabled control on the moved item. Motion cancels superseded animations and offers an immediate reduced-motion result. Locale validation pauses formatting on invalid settings. Writing and saved-entry actions explicitly simulate local state.
- Mobile inspection exposed a floating menu covering text. Replaced it with an opaque header and anchor clearance; checked the production rendering. Corrected multiline labs to use the library's textarea styling, yielding a 96px initial textarea instead of the single-line input height.
- Lint, TypeScript and the 318-token freshness check passed. Final production build passed with TypeScript enabled; peak memory 980.3MB.
- Production browser suite: 18/18 passed. 71/71 documentation routes returned HTTP 200 with exactly one main and h1. Internal route and fragment crawl: zero findings. Evidence: `browser-foundations-release.txt`, `build-foundations-release.txt`, `production-routes-foundations.json` and inspected screenshots in the output directory above.
- Browser driver empty `fill` does not consistently emit React changes, so the empty-action case uses actual select-all/Backspace. Runs use unique browser sessions to avoid inheriting an interrupted wait. Earlier aborted driver runs are retained as diagnostics, not passing evidence.
- Stable local production preview: `mobtranslate-styleguide-preview-20261013.service`, http://127.0.0.1:3003. Capped at 2GB RAM and 100% of one CPU. The prior development preview and temporary 3004 production server are stopped. After later changes, build and restart this preview to refresh it.

### Developer guidance and checked sources, 2026-10-13

- Replaced Getting Started and Theming with actual private-workspace setup, real CSS imports, client/server boundaries, explicit theme selection, cascade/portal behavior, failure modes and verification guidance. Added Composition, Contribution and Testing, and Migration with source/version boundaries and a current migration register.
- Three live developer examples are actual compiled .tsx sources. A fourth source is the theme controller now shared with navigation. Generated CodeBlock snippets contain these exact source bytes; `examples:check` rejects drift, and dev/build regenerate them.
- Removed styleguide-only UI TypeScript aliases. Both component typechecking and the production build now resolve the installed workspace package; global CSS uses the same real package /src imports as the web app. Filtered frozen/offline workspace installation passed without dependency or lockfile changes.
- Added reproducible `test:routes`: parses the navigation AST, fetches every page, uses the browser HTML parser, checks main/h1 and internal route/fragment destinations, and optionally writes a JSON report.
- Corrected homepage counts to derive from navigation/token data and removed unsupported public-package CSS paths and blanket comprehensive-coverage wording.
- Production build passed with TypeScript enabled; peak memory 1GB. Lint, typecheck, token freshness and checked-example freshness passed. Browser suite: 23/23 passed. Route/anchor check: 74 routes, zero findings.
- Browser evidence covers actual invalid/valid local submission, retained input, one composed disclosure trigger with controlled keyboard state, local token/radius scope, system theme changes, storage-write rejection, and narrow reflow of all five developer topics. Does not prove actual backend writes or every component family.
- Inspected getting-started/theming mobile and composition desktop screenshots. Evidence: `build-guides.txt`, `browser-guides-final.txt`, `routes-guides.json` and guide screenshots in the same output directory.
- The preview user service is transient: stopping it can unload its unit, requiring recreation instead of `systemctl start`. It is currently recreated and serving the verified production build on http://127.0.0.1:3003 with the same CPU/memory limits.

### Actions and accessible task guidance, 2026-10-13

- Replaced Button documentation with usage decisions, anatomy/dimensions, all nine variants/four sizes, lifecycle and native form-type labs, composition, API, behavior, failures and verification guidance.
- Repaired shared Button asChild through the installed Base UI useRender utility. Child/wrapper classes, styles, descriptions, handlers and refs compose; link semantics remain intact. Disabled/loading activation is intercepted in capture before child/wrapper callbacks. Native omitted type still submits a form. Ref now describes the actual HTMLElement, which may be an anchor.
- Added exported IconButton and FloatingActionButton with typed icon-only naming requirements, explicit non-submit defaults, working state examples and detailed docs. Icon target is 44px; FAB icon sizes 44/56/72px and extended labels can wrap. Placement remains the consuming layout’s responsibility.
- Real browser measurement exposed light warning-hover contrast of 3.61:1 and link-rest contrast of 4.33:1. Warning retains its readable fill while its hover border changes; link text uses the darker existing ochre role. All nine action text variants pass 4.5:1 at rest/hover in both themes. This does not prove all pressed, boundary or focus contrast combinations.
- Fixed mobile heading overflow and changed displayed action titles to readable words, retaining API identifiers in source examples and references. The production action suite passed 29/29 and the route/fragment check covered 76 routes with zero findings (`browser-actions-release.txt`, `routes-actions-release.json`).
- Replaced principles’ obsolete blue-palette and automatic-accessibility claims with task/evidence decisions, actual token layers, authority boundaries, worked decisions, failures and a review process.
- Replaced accessibility with specific web requirements and linked W3C references: structure/names, keyboard/focus, contrast/reflow/spacing, alternate input, errors/status, timing, audio/language/authentication and a scoped verification procedure.
- Added a ninth checked source: an accessible local request with focused linked error summary, retained read-only pending inputs, explicit duplicate-submission guard and manual success/failure/cancellation outcomes. Corrected targeted browser checks passed 2/2 for this complete local flow and 320 CSS px reflow with text-spacing overrides (`browser-accessibility-targeted.txt`). No backend or spoken-announcement claim.
- The first combined browser run had an invalid quoted wait expression in the test harness and was terminated; it is diagnostic evidence only (`browser-accessibility.txt`). Added syntax validation before driver polling and a hard timeout signal. Its exact task-owned browser was closed after URL ownership verification; unrelated browsers were preserved.
- Source lint, styleguide/UI TypeScript, 318-token freshness and nine-example freshness passed. Accessibility production build passed with TypeScript enabled and a 1GB peak; its 76-route/fragment check had zero findings (`build-accessibility.txt`, `routes-accessibility.json`).
- Final readable-title production build passed with TypeScript enabled (1001.6MB peak). The corrected combined browser suite passed 31/31 against that build; 76 routes/fragment checks had zero findings. Evidence: `build-actions-guides-final.txt`, `browser-actions-guides-final.txt`, `routes-actions-guides-final.json`. Inspected final mobile FAB heading, mobile accessibility form and focused error-summary screenshots. Task-owned production preview remains bounded and serving http://127.0.0.1:3003.

Remaining: reconcile legacy TypeScript token/component exports and React peer declarations with the actual runtime; deepen remaining components and verify shared-API consumer compatibility; implement missing Material-family web patterns; expand task patterns and full content search; verify APIs/copyable code, all component families, both themes, automated accessibility and manual assistive-technology/responsive behavior. Route reachability and lab tests do not prove complete component behavior or Material-depth documentation. No full-completion claim yet.
