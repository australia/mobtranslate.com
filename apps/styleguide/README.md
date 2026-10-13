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
pnpm --filter styleguide build
pnpm --filter styleguide test:browser
```

The browser checks require the `agent-browser` CLI and a running styleguide. Set `STYLEGUIDE_URL` to test a different local preview. `AGENT_BROWSER_EXECUTABLE_PATH` can point to an installed Chromium executable. The suite uses its own browser session and closes it after execution.

Current browser coverage: documentation anchors, topic filtering, mobile focus containment/Escape/route selection, theme persistence, clipboard rejection, responsive layout and interaction-state exploration, rendered token values, filtered exports and contrast calculations. These checks do **not** yet prove the whole component catalogue, screen-reader announcements, full content search or Material-depth coverage. The completion contract is [STYLEGUIDE-PLAN.md](./STYLEGUIDE-PLAN.md).

## Authoring

- Navigation entries live in `content/navigation.ts`.
- The 318-token catalogue is generated from the shared CSS using PostCSS. Development and production builds regenerate it; `tokens:check` rejects drift. Do not edit `content/tokens.json` manually.
- Use `Section` for stable, linkable headings; pass an explicit `id` if two sections share a title.
- Keep examples connected to the actual UI package. Document meaningful behavior and recovery, not just visual variants.
- Give every demo control a label and a working result. Clearly label local simulations.
- Use the real CSS tokens for live specimens. The legacy TypeScript token exports and CSS palette differ; resolve those differences before treating exported values as rendered colors.
