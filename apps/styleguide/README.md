# MobTranslate styleguide

Interactive documentation for the workspace's `@mobtranslate/ui` library.

## Run

From the repository root:

```sh
pnpm --filter styleguide... install --frozen-lockfile
pnpm --filter styleguide dev --hostname 127.0.0.1
```

The local preview is http://127.0.0.1:3003. For production, run `pnpm --filter styleguide build` followed by `pnpm --filter styleguide start --hostname 127.0.0.1`.

## Verify

```sh
pnpm --filter styleguide lint
pnpm --filter styleguide typecheck
pnpm --filter styleguide tokens:check
pnpm --filter styleguide examples:check
pnpm --filter styleguide build
pnpm --filter styleguide test:browser
pnpm --filter styleguide test:communication
pnpm --filter styleguide test:containment
pnpm --filter styleguide test:select
pnpm --filter styleguide test:autocompleteion
pnpm --filter styleguide test:inputs
pnpm --filter styleguide test:menus
pnpm --filter styleguide test:destinations
pnpm --filter styleguide test:adaptive-navigation
pnpm --filter styleguide test:select
pnpm --filter styleguide test:routes
```

The browser and route checks require the `agent-browser` CLI and a running styleguide. Set `STYLEGUIDE_URL` to test a different local preview. `AGENT_BROWSER_EXECUTABLE_PATH` can point to an installed Chromium executable. Each run uses a unique browser session and closes it after execution. `test:routes` parses navigation with the TypeScript compiler, fetches every destination and uses the browser's HTML parser to check main/headings and internal route/fragment links. Set `STYLEGUIDE_REPORT` to save its JSON evidence.

Current browser coverage: documentation anchors, topic filtering, mobile focus containment/Escape/route selection and header clearance, theme persistence, clipboard rejection, responsive layout and interaction-state exploration, rendered token values, filtered exports and contrast calculations. Foundation checks also cover changed type/spacing/shadow values, motion interruption and reduced motion, locale formatting and invalid settings, reorder focus, icon toggle semantics, editable recovery messages and narrow-screen reflow. Developer checks exercise form validation/retention, controlled render composition, local theme scope/radius, system preference and denied storage writes. These checks do **not** yet prove the whole component catalogue, actual screen-reader announcements, native touch dragging or Material-depth coverage. The completion contract is [STYLEGUIDE-PLAN.md](./STYLEGUIDE-PLAN.md).

Action checks exercise Button lifecycle and native form types, composed anchor handlers/styles/refs and disabled keyboard activation, named IconButton toggles, FloatingActionButton dimensions and local activation, all nine Button text variants at rest/hover in both themes, and mobile reflow. Accessibility checks exercise connected error summaries, retained input through failure/retry/cancellation/completion, focus recovery and 320 CSS px reflow with text-spacing overrides. These are named DOM/browser checks; spoken announcements still require actual screen-reader verification.

## Search

The sidebar filters topic names/categories. [Search guidance](http://127.0.0.1:3003/search) searches the rendered documentation, including prose, tables and literal code examples. Submit a query to load all navigation destinations in batches of three; progress and any failure are visible. A failed route prevents a complete-index claim and offers retry. No partial index is silently presented as complete.

All query terms must occur in the same section or its page title. Camel-case API names are split for matching; frequency-derived ranking favors page/section names without a synonym list. Results highlight matching text, link to focusable headings and load more in groups of twenty. Queries are shareable as `/search?q=…`.

Query synchronization uses Next's [useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params), with the client tool inside a Suspense boundary. Changing a query through topic navigation works while already on the search page. At the end of a long result list, Show more becomes Return to first result to preserve keyboard focus.

The index is an in-memory snapshot for that search page, available in development and production without a generated manifest. Reload guidance after edits. It indexes initial rendered example content, not subsequent user input or external websites. Leaving the page or choosing Cancel loading guidance aborts its loading work. Cancellation retains the query and returns focus to its input. The browser checks cover prose/code matches, all-term filtering, empty queries/results, pagination, indexing failure/retry, actual request cancellation and mobile keyboard navigation through the topic-filter fallback.

## Authoring

- Navigation entries live in `content/navigation.ts`.
- Content search lives in `components/document-search.tsx` and `lib/document-search.ts`. Extraction uses the browser’s inert HTML parser and limits indexing to the main content of navigation routes. Keep failure/coverage feedback and section destinations tied to the actual render.
- Detailed foundation content lives in `content/foundations.tsx`; `GuideDocument` renders its sections, specification tables, code and related links. Interactive labs live in `components/foundation-explorers.tsx`.
- Developer guidance lives in `content/developer-guides.tsx`. Its live examples are real files in `examples/`; the theme controller in `lib/theme.ts` is also used by navigation. `examples:generate` copies these checked sources into `content/examples.json`; `examples:check` rejects drift. Dev/build regenerate both source catalogues.
- Action documentation lives in `content/actions.tsx`; principles/accessibility in `content/principles-accessibility.tsx`. Sixty-two source files feed the checked examples, including the interactive accessibility request. Keep guidance tied to current exports and source-backed behavior.
- Communication guidance lives in `content/communication.tsx`, with actual provider-managed notifications, inline alerts, count badges, linear/circular progress, scalar meters and loading recovery in four checked example files. `test:communication` verifies their task outcomes, keyboard behavior, timing, contrast and narrow reflow.
- Containment guidance lives in `content/containment.tsx`; four checked sources exercise card actions, dialog editing, staged drawer filters and local confirmation/restore. `test:containment` verifies the actual local outcomes, focus and dismissal contracts, edge/size geometry and narrow layouts.
- Selection guidance lives in `content/selection.tsx`; five checked sources exercise independent/grouped choices, retained settings, chip roles, named range sliders and pressed segments. `test:selection` verifies actual state, local FormData, filtering, recovery, keyboard behavior, directional layout and chip text contrast.
- Input guidance lives in `content/inputs.tsx`; four checked sources exercise native text values, registered fields, grouped availability, local validation/recovery and formatted numeric quantities. `test:inputs` verifies actual payloads, correction, editing enforcement and narrow reflow.
- Tab/toolbar guidance lives in `content/navigation-controls.tsx`; two checked sources exercise retained drafts, explicit preview outcomes, actual formatting/copy commands and live orientation/direction. `test:navigation-controls` checks selection versus focus, disabled discovery/activation, hidden mounting, indicator geometry, recovery, contrast and reflow.
- Menu guidance lives in `content/menus.tsx`; three checked sources exercise actual command effects/recovery, contextual pointer access with a visible alternative, and coordinated command bars. `test:menus` verifies actual outcomes, checked choices, keyboard/focus, unavailable controls and bounded popups.
- Package imports resolve through the installed workspace dependency. There is no styleguide-only `@mobtranslate/ui` TypeScript alias; the build also verifies the documented package `/src` CSS paths.
- The 318-token catalogue is generated from the shared CSS using PostCSS. Development and production builds regenerate it; `tokens:check` rejects drift. Do not edit `content/tokens.json` manually.
- Use `Section` for stable, linkable headings; pass an explicit `id` if two sections share a title.
- Keep examples connected to the actual UI package. Document meaningful behavior and recovery, not just visual variants.
- Give every demo control a label and a working result. Clearly label local simulations.
- Use the real CSS tokens for live specimens. CSS-declared TypeScript primitives, semantic roles and shadows are generated by packages/ui/scripts/generate-tokens.mjs. Run tokens:generate after editing CSS; tokens:check checks both outputs. Imported values are authored snapshots, while computed CSS reflects theme selection and scoped overrides. Separate typography helpers are described in the theming guide. The nineteen component presets are generated from explicit component CSS bindings and inspected in /guides/component-specifications.

Destination guidance lives in `content/destination-navigation.tsx`. Three checked source files show native disclosure destinations, authored breadcrumb ancestry and local/URL page models. `test:destinations` checks real navigation, retained values, requested versus loaded records, recovery, native form behavior, unavailable activation, direction and reflow. The pinned Base UI patch retains live menubar context and gates disabled navigation-trigger hover in both module formats.

The destination delivery was checked with `agent-browser 0.31.0` from `/usr/local/bin`. Check `command -v agent-browser` and `agent-browser --version` in the actual test environment: this box’s interactive shell and system services can resolve different installations. Use the same binary when inspecting a live test session; a version mismatch can restart its daemon.

Adaptive navigation guidance lives in `content/navigation-pattern.tsx`. Copy the checked `examples/adaptive-navigation.tsx` and its adjacent CSS together. `test:adaptive-navigation` verifies actual query-selected activities, native history/separate-tab behavior, retained local task values, modal closure/arrival, pending recovery, measured layout changes, focus handoff, narrow labels and both-theme contrast. The bar stays in document flow; fixed placement, durable storage, remote routes and hardware/assistive-technology behavior need their own acceptance evidence.

Select guidance lives in `content/select.tsx`, with a checked form/preview source in `examples/select-preferences.tsx`. `test:select` verifies native submitted entries, disabled repeated-value omission, read-only serialization, unavailable activation, empty recovery, retained outcomes, geometry and text contrast. Closed option markup can remain registered under a hidden positioner in the pinned SDK; inspect actual visibility and the active focus tree rather than requiring DOM removal.

Autocomplete guidance lives in `content/autocomplete.tsx`, with checked `examples/autocomplete-text.tsx`. `test:autocomplete` verifies controlled reset/clear, native text versus option metadata, exactly-once keyboard/click/drag-release callbacks, independent instance ids, unavailable/read-only/disabled behavior, native form outcomes, bounded geometry, contrast and narrow reflow. The wrapper uses the pinned primitive in list mode; free text remains valid and no remote provider or durable save is implied.

Combobox guidance lives in `content/combobox.tsx`, with checked `examples/combobox-choice.tsx`. `test:combobox` verifies registered IDs versus query text, native form serialization, clearing/reset, instance relationships, activation counts, unavailable controls, actual preview recovery, RTL geometry and both-theme contrast. Selection and draft query have separate ownership; consuming forms must validate availability and their query-commit policy.

Date/time guidance lives in `content/date-time.tsx` and `/patterns/date-time`, with checked `examples/date-time-window.tsx`. `test:date-time` exercises actual native temporal values/constraints, paired ordering, runtime zone validation, registered entries, retained outcomes, record filtering, empty recovery and narrow directional layouts. The native composition operates on civil records; it does not claim custom Material picker chrome or instant-booking conversion.

Disclosure guidance lives in `content/disclosure.tsx` across Accordion, Collapsible, Popover and Tooltip, with checked `examples/disclosure-tasks.tsx`. `test:disclosure` verifies actual retained edits/native entries, expansion modes, unavailable activation, staged reading results/dismissal, named bookmark actions, hover/focus hints, state class callbacks, directional bounds, text contrast and reduced motion. Mounting, disclosure availability and task authorization remain separate.

Rating guidance lives in `content/rating.tsx`, with checked `examples/rating-feedback.tsx`. `test:rating` verifies registered numeric scores, keyboard selection/direction, hover versus committed state, independent controlled/uncontrolled groups, native availability semantics, clearing/scale reconciliation, actual feedback outcomes, icon sizes and narrow bounds/contrast. A usefulness score remains opinion; it does not establish qualified source review or durable feedback.

Stepper guidance lives in `content/stepper.tsx`, with checked `examples/stepper-draft.tsx`. `test:stepper` verifies actual indicator/status semantics, validated progression, retained remounted editors, reviewed snapshot outcomes, focus, measured adaptation, direction and contrast. The Stepper is presentational; application state owns admissibility, submission and actual completion.

Layout utility guidance lives in `content/layout-utilities.tsx` across Stack/HStack/VStack, Aspect Ratio, Separator and Visually Hidden, with checked `examples/layout-utilities.tsx`. `test:layout-utilities` verifies actual flex layout/gap/wrapping and task effects, reserved media geometry/cropping, separator orientation/decoration, clipped accessible naming and narrow reflow. These utilities supply geometry or presentation; their consuming tasks retain semantic and source-authority ownership.

Avatar guidance lives in `content/avatar.tsx`, with checked `examples/avatar-source.tsx`. `test:avatar` verifies actual load/error/retry/replacement, held native preload and stale-event isolation, stable informative/decorative naming, real parent action, all sizes and narrow reflow. The source-backed loader replaces the old permanent error flag; photo identity, rights and profile persistence remain separate consumer evidence.

Scroll Area guidance lives in `content/scroll-area.tsx`, with checked `examples/scroll-records.tsx`. `test:scroll-area` verifies real native keyboard/ref scrolling, content selection/retention, dynamic overflow and corner geometry, thumb dragging, viewport handler/class composition and narrow RTL bounds/contrast. Root and viewport props/refs have distinct ownership; virtualization and source coverage remain separate task features.

Preview Card guidance lives in `content/preview-card.tsx`, with checked `examples/preview-destination.tsx`. `test:preview-card` checks the exported delayed focus/hover preview, Escape/pointer transfer, retained local text, preview gating, actual native destination navigation and narrow directional bounds/contrast. Persistent help and link behavior remain independent from supplemental preview disclosure.

Table and Data Display guidance lives in `content/table.tsx`, with checked `examples/table-records.tsx`. `test:table` verifies real native table relationships, sorting, current-page mixed selection, stable IDs across paging/filtering, detail and summary snapshots, footer totals, empty recovery, container ref/keyboard overflow and narrow directional density/contrast. The repaired wrapper contains comparison overflow; it does not implement a remote data engine or spreadsheet grid.

Material reference coverage lives in `content/material-coverage.tsx`, mapping the 36 captured official component families to actual local topics and explicit web/platform boundaries. Three new checked compositions in `content/material-patterns.tsx` cover independent action groups/split buttons/FAB menus, measured sticky app bars, and native lists/carousels. `test:material-patterns` verifies actual task outcomes, focus, scroll geometry, endpoints and narrow direction/theme layouts. The map is a coverage input; it does not replace the full completion audit.

Search, Source/Review and Permissions guidance lives in `content/governed-patterns.tsx`. Its shared checked `examples/governed-workspace.tsx` fetches the public English-only `public/fixtures/governed-records.json`, coordinates request identity/abort/held application, retains result/detail/drafts and demonstrates revision-bound local review and capability-dependent UI. `test:governed-patterns` verifies actual HTTP/recovery, supersession, model outcomes and adaptation. The role picker and fixture are explicitly public demos, not authentication or qualified language authority.

Learning, Audio and Offline guidance lives in `content/learning-offline.tsx`, with three checked compositions, authored interface questions and a deterministic WAV generator/manifest. `audio:check` verifies the exact signal bytes. `test:learning-offline` verifies real checked attempts, native media time/state, browser-stored draft readback/reload, cross-tab conflict/lock cancellation, storage failure and native offline cached-resource recovery. The examples make no language credential, pronunciation, private access or backend synchronization claim.

The package and both consumers use React/React DOM ^19.2.7. `test:token-contract` compares all 318 compiled token declarations with computed CSS in both themes, verifies local override behavior and narrow keyboard reflow, and checks that UI/web/styleguide resolve the same installed React runtime. This verifies the declared CSS token contract; component sizing presets have their own 90-field source/render contract and browser suite.

`component-tokens:generate/check` on @mobtranslate/ui maintains the existing named presets and the exported componentTokenSpecifications register. `test:component-specifications` checks generator rejection cases, the actual rendered parts, contextual sizes, scoped inheritance, retained modal captures and narrow layouts. Its captures are local observations with viewport/theme context; a closed popup is never reported as live.

The inspector observes active selected-part animations as well as resize/mutation events, then reads final geometry on animation/transition completion or cancellation. Keep the browser executable and launch settings, including AGENT_BROWSER_DEFAULT_TIMEOUT, constant for each test session; changing them can reset the profile and lose the current document.

Inclusive participation guidance lives in content/inclusive-participation.tsx and uses an explicitly unexecuted plan template. The Design Glossary has independent explanations for all 67 captured Material headings plus local vocabulary; glossary:check guards its inventory, required fields, unique fragments and related navigation routes. Its filter indexes the authored data, and hash navigation reveals/focuses entries without restricting fresh shared links.
