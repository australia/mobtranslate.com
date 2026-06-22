# Dependency Upgrade — React 19 / Next 16 / AI SDK v6

Full "update to latest" pass on the live web app. **Not yet pushed — awaiting review.**

## Status: green
| Gate | Result |
|---|---|
| `pnpm --filter web typecheck` | **0 errors** |
| `pnpm --filter web lint` | **0 errors** (25 pre-existing warnings in recording code) |
| `pnpm --filter web build` (`next build --webpack`) | **Succeeds** — 95/95 pages |
| `pnpm --filter web test` | **458 / 458** (flakiness fixed; stale tests repaired) |
| Runtime smoke (prod server) | Home, About, Dictionaries, Map (react-leaflet 5), Education all render under React 19/Next 16 |

## Updated to latest
React 18→**19**, react-dom 18→**19**, Next 14→**16**, AI SDK `ai` 4→**6** (+`@ai-sdk/openai` 1→3, `@ai-sdk/react` 1→3, `openai` 4→**6**), **zod** 3→**4**, **lucide-react** 0.x→**1**, **@supabase/ssr** 0.0.10→**0.12**, @supabase/supabase-js, **react-leaflet** 4→**5**, react-markdown 9→**10**, **js-yaml** 4→**5**, **typescript** 5.7→**6**, @types/node 22→**26**, @types/react/react-dom →**19**, jsdom 28→**29**, @vercel/analytics 1→**2**, framer-motion, swr, tailwind/@tailwindcss/postcss, tailwind-merge, styled-components, swagger-*, tsx, dotenv, postcss, vitest, @vitejs/plugin-react.

## Migration work required by the upgrades
- **Next 16 async request APIs**: `cookies()` (supabase/server → `getAll`/`setAll`, async; ~90 `await createClient()` call sites) and route/page `params` are now Promises (official `next-async-request-api` codemod, 37 files).
- **Next 16 build**: switched to `next build --webpack` (project uses a webpack alias config; Turbopack is the new default); removed the unsupported `eslint` config key; set `outputFileTracingRoot`; curator page uses a static import (`ssr:false` dynamic is disallowed in server components).
- **AI SDK v6**: route → `convertToModelMessages` + `stopWhen(stepCountIs(5))` + `toUIMessageStreamResponse`; both chat components → `@ai-sdk/react` with `sendMessage`/`status`/`message.parts`/tool-parts (replacing `append`/`input`/`handleSubmit`/`isLoading`/`.content`/`.toolInvocations`).
- **zod 4**: `ZodError.errors`→`.issues` (17 routes), `z.record(v)`→`z.record(z.string(), v)`.
- **lucide v1**: removed brand icons → `Github`→`Code`, `Twitter`→`AtSign`.
- **Misc**: react-markdown `className` prop removed; `NextRequest.ip` removed; js-yaml named import; supabase-js stricter insert typing.

## ⚠️ Needs your verification before push
- **Chat (AI SDK v6)** — compiles and builds, but the streaming/`useChat` rewrite (message parts, tool-call rendering, image attachments) **could not be runtime-tested here** (needs a live OpenAI key + sign-in). Please exercise: a basic translation question, a tool result (e.g. "translate hello to Kuku Yalanji"), and an image upload. Search for `// TODO: verify image upload end-to-end` in `AppChatInterface.tsx`.

## Held back (with reason)
- **eslint** kept at 8.57 / **eslint-config-next** at 15. eslint **10** drops the `ESLINT_USE_FLAT_CONFIG` legacy flag this repo uses, and the Next eslint plugins (`eslint-plugin-import/react/jsx-a11y`) don't yet support eslint 10. Dev-only — no effect on build or runtime. Revisit when the plugins ship eslint-10 support (or migrate to flat config).

## Deferred deprecation warnings (non-blocking)
- Next 16: the `middleware` file convention is deprecated in favour of `proxy` (still works).
