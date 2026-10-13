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
pnpm --filter styleguide test:routes
```

The browser and route checks require the `agent-browser` CLI and a running styleguide. Set `STYLEGUIDE_URL` to test a different local preview. `AGENT_BROWSER_EXECUTABLE_PATH` can point to an installed Chromium executable. Each run uses a unique browser session and closes it after execution. `test:routes` parses navigation with the TypeScript compiler, fetches every destination and uses the browser's HTML parser to check main/headings and internal route/fragment links. Set `STYLEGUIDE_REPORT` to save its JSON evidence.

Current browser coverage: documentation anchors, topic filtering, mobile focus containment/Escape/route selection and header clearance, theme persistence, clipboard rejection, responsive layout and interaction-state exploration, rendered token values, filtered exports and contrast calculations. Foundation checks also cover changed type/spacing/shadow values, motion interruption and reduced motion, locale formatting and invalid settings, reorder focus, icon toggle semantics, editable recovery messages and narrow-screen reflow. Developer checks exercise form validation/retention, controlled render composition, local theme scope/radius, system preference and denied storage writes. These checks do **not** yet prove the whole component catalogue, actual screen-reader announcements, native touch dragging, full content search or Material-depth coverage. The completion contract is [STYLEGUIDE-PLAN.md](./STYLEGUIDE-PLAN.md).

## Authoring

- Navigation entries live in `content/navigation.ts`.
- Detailed foundation content lives in `content/foundations.tsx`; `GuideDocument` renders its sections, specification tables, code and related links. Interactive labs live in `components/foundation-explorers.tsx`.
- Developer guidance lives in `content/developer-guides.tsx`. Its live examples are real files in `examples/`; the theme controller in `lib/theme.ts` is also used by navigation. `examples:generate` copies these checked sources into `content/examples.json`; `examples:check` rejects drift. Dev/build regenerate both source catalogues.
- Package imports resolve through the installed workspace dependency. There is no styleguide-only `@mobtranslate/ui` TypeScript alias; the build also verifies the documented package `/src` CSS paths.
- The 318-token catalogue is generated from the shared CSS using PostCSS. Development and production builds regenerate it; `tokens:check` rejects drift. Do not edit `content/tokens.json` manually.
- Use `Section` for stable, linkable headings; pass an explicit `id` if two sections share a title.
- Keep examples connected to the actual UI package. Document meaningful behavior and recovery, not just visual variants.
- Give every demo control a label and a working result. Clearly label local simulations.
- Use the real CSS tokens for live specimens. The legacy TypeScript token exports and CSS palette differ; resolve those differences before treating exported values as rendered colors.
