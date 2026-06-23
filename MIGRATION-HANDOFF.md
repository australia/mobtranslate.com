# mobtranslate.com — Supabase → self-hosted Postgres migration (HANDOFF)

You are Claude Code running **on the box** (OVH VPS `15.235.185.42`). Continue migrating
`mobtranslate.com` off **hosted Supabase** onto a **plain self-hosted Postgres on this box**,
**rewriting the app off the Supabase SDK entirely**. Work happens in this repo:
`/mnt/donto-data/workspace/mobtranslate.com` (Turborepo; the deployed app is `apps/web`, Next.js 16.2.9).

## Decisions already made (do not relitigate)
- **Auth:** replace Supabase GoTrue with **better-auth** (Postgres adapter). The user already runs better-auth for tpmjs.
- **Data layer:** **Drizzle ORM** (already installed + introspected). Replace all `supabase-js` `.from()`/`.rpc()`.
- **Authz:** RLS is **dropped** in the new DB — enforce authorization **in app/query code** (use the role tables + `user_has_role`).
- **Storage:** recordings → **box filesystem** behind Caddy (no Supabase Storage).
- **Cutover:** keep the **live site on hosted Supabase as rollback**. Do NOT flip to the new DB until the rewrite is verified, and **CHECKPOINT WITH THE USER before the final cutover.**

## DO NOT BREAK THE LIVE SITE
`mobtranslate.com` is live, served by **systemd `mobtranslate-web.service`** (`next start` on `127.0.0.1:3300`)
→ Caddy → Cloudflare. It currently uses **hosted Supabase** and must keep working until cutover.
Develop/test on a **separate staging port** (e.g. 3301) with `DATABASE_URL` set; never touch the
`:3300` service or its env until Phase 6. The hosted Supabase project (`ref zgmeirjjarsakyfmlskl`) is untouched = rollback.

## What is already DONE
- **Phase 1 — data captured** at `/opt/mobtranslate/dumps/`: `public.sql` (25M, 42 tables + data + functions incl. `search_similar_words`), `auth_storage.sql` (22M, incl. `auth.users` with 35 users + bcrypt `encrypted_password`). 20 audio blobs at `/opt/mobtranslate/storage/recordings/`.
- **Phase 2 — new Postgres up & loaded.** Container **`mobtranslate-pg`** (`pgvector/pgvector:pg17`), volume `/mnt/donto-data/mobtranslate-pg`, listening `127.0.0.1:5433`, db/user `mobtranslate`. **`DATABASE_URL` is in `/opt/mobtranslate/db.env`** (`ajax:ajax 600`). Restored with **exact row parity** (words 19809, definitions 27751, translations 22901, usage_examples 13651, user_profiles 35, auth.users 35), 42 tables, 151 indexes. Extensions (`vector`,`uuid-ossp`,`pgcrypto`,`pg_trgm`) live in the **`extensions`** schema. **RLS is disabled** on all public tables. `auth.users` exists (for the FKs) and is the current canonical user table.
  - psql: `docker exec -it mobtranslate-pg psql -U mobtranslate -d mobtranslate`
- **Phase 4 foundation — Drizzle wired.** In `apps/web`: `drizzle-orm`@0.45.2, `postgres`@3.4.9, `drizzle-kit`@0.31.10. Files:
  - `apps/web/drizzle.config.ts` (schemaFilter `['public']`)
  - `apps/web/lib/db/schema.ts` + `relations.ts` (introspected, **42 tables**). **Hand-patches applied** (re-apply if you re-run `drizzle-kit pull`): a `tsvector` `customType` for the 3 `search_vector` columns, `customType`/`pgSchema` added to the pg-core import, and an `auth.users` stub `export const users = pgSchema("auth").table("users", { id: uuid("id").primaryKey() })` so the ~30 cross-schema FKs resolve.
  - `apps/web/lib/db/index.ts` — the Drizzle client (`postgres-js`, reads `DATABASE_URL`). **Verified**: typed `db.select().from(languages)` returns the 4 languages.

## The rewrite surface (scoped)
**89 files** import the Supabase client. Counts across `apps/web`:
- `.from(` — **422** → Drizzle queries.
- `.rpc(` — **56** (24 distinct fns) → the SQL functions **still exist in `mobtranslate-pg`**; call them via `db.execute(sql`select * from fn(...)`)`. Distinct: `user_has_role`(19), `update_document_processing_status`(6), `exec_sql`(3), `auth_my_invites`(3), `get_user_stats`(2), `get_user_language_role`(2), and singles incl. `search_similar_words`, `recording_*`/`invite_*`/`auth_*` (recording studio), `count_auth_users`/`get_auth_user_emails` (these read `auth.users`), `can_user_curate_language`, `refresh_user_quiz_progress`, `query`/`exec_sql` (dynamic SQL helpers — audit these).
- `.auth.` — **76** → better-auth.
- `.storage` — **11** → box filesystem.
- Client modules to replace: `apps/web/lib/supabase/{server.ts,client.ts,admin.ts,queries.ts,types.ts}`.

## ✅✅ MASS-CONVERT DONE — entire app off Supabase (verified on staging :3301; live :3300 untouched, NOT cut over)
All ~96 files converted across every feature area. **0 TypeScript errors**, production build green, and a 39-check HTTP smoke test passes (public reads, dictionary pages, box-FS audio serving, unauth 401 gates, better-auth login w/ migrated bcrypt user, authed user features, admin, curator, recordings incl. SECURITY-DEFINER GUC functions, profile mutation round-trip). `lib/supabase/` is now **only `types.ts`** (pure interfaces — kept); `server/client/admin/queries.ts` deleted; the 6 custom `/api/auth/*` routes deleted (better-auth `[...all]` + `authClient` replace them); `middleware.ts`, `AuthContext`, `/api/user/profile`, storage (`lib/storage.ts` + `/api/storage/recordings/[...path]`) all done. **Audio moved to box FS** at `/mnt/donto-data/mobtranslate-storage/recordings` (`MOBTRANSLATE_STORAGE_DIR`).

### Extra gotchas learned during the mass-convert (beyond the slice patterns below)
- **Cast numeric/boolean params in raw `sql`**: postgres-js can't infer bare JS numbers/bools as a function's `integer`/`boolean` arg → "Failed query / could not determine data type". Always `${n}::int` / `${b}::boolean` (uuid/bigint/real too). This bit the recording functions' `limit`/`offset`/`p_sample_rate`/`p_clipped` etc.
- **`auth.uid()` SECURITY-DEFINER functions**: any SQL function that reads `auth.uid()` (the GoTrue `request.jwt.claim.sub` GUC) must be called inside `db.transaction` after `select set_config('request.jwt.claim.sub', <userId>, true)`. Applies to `auth_my_recordings/auth_create_recording/auth_my_invites/auth_add_target/auth_worklist`. EXCEPTION: `get_auth_user_emails()` only used auth.uid() for a redundant admin gate → replaced with a direct `select … from auth.users` (route is already `requireRole`-gated). `count_auth_users()` has no gate.
- **Drizzle wraps a PG `RAISE` as `"Failed query: …"`** — surface the real message with `(err as any)?.cause?.message ?? (err as Error).message` (done in the recording routes; e.g. now returns `"no active invite"`).
- **Schema gaps found** (tables/columns/views/functions referenced by old Supabase code that never existed in the dump): `likes` table → real table is `user_word_likes`; `profiles` embeds → `user_profiles`; `word_comments` had no `is_flagged/moderated_*` (flagged derived from `downvotes>=3`); `words_needing_review` view absent; `user_profiles.reputation_score` absent (returned null); `refresh_user_quiz_progress()` fn absent (kept in swallowing try/catch). All handled to preserve the old JSON shape/behavior.
- **Build env**: `apply-rls` route is now an admin-gated no-op (RLS is app-level). `/api/admin/apply-rls` does NOT re-enable RLS.

### ⏭️ REMAINING = Phase 6 cutover ONLY (needs user sign-off — see bottom)
Nothing else to convert. Cutover = point the live `:3300` systemd unit at the new DB + better-auth env, drop `@supabase/*` + `SUPABASE_*` from `web.env`, add `DATABASE_URL`/`BETTER_AUTH_*`/`MOBTRANSLATE_STORAGE_DIR`, rebuild, restart, keep hosted Supabase as rollback.

## ✅ VERTICAL SLICE DONE (patterns locked — verified on staging :3301, live :3300 untouched)
The read page + mutating route slice is built and passed a 12-check HTTP smoke test. **Reuse these patterns for the mass-convert. better-auth is 1.6.20** (not 1.4.10).
- **Reads → `apps/web/lib/db/queries.ts`** (Drizzle). Drizzle returns camelCase; UI consumers expect snake_case + nested shapes, so query fns **map results back to the `lib/supabase/types.ts` interfaces**. `/dictionaries/[language]` re-pointed here. Parity-verified vs direct SQL.
- **API routes → snake_case via `apps/web/lib/db/case.ts`** (`snakeRow`/`snakeRows`, shallow top-level key conversion; leaves nested jsonb like `metadata` untouched, mirroring Supabase). The admin UI reads `is_active`/`word_count` etc., so **every route returning DB rows must `snakeRow` them**.
- **Auth → `apps/web/lib/auth.ts`** (better-auth + Drizzle adapter). Tables `user/session/account/verification` created via `lib/db/auth-tables.sql` + typed in `lib/db/auth-schema.ts` (separate file so `drizzle-kit pull` won't clobber). **Mirror strategy** (decided): better-auth owns auth with **UUID ids** (`advanced.database.generateId = crypto.randomUUID`); a `databaseHooks.user.create.after` hook inserts a thin `auth.users` row + the `user_profiles` row (reimplements `handle_new_user_profile`) so the ~30 public FKs stay valid — **no FK surgery**. **bcrypt preserved** via custom `password.{hash,verify}` (bcryptjs) — all 35 users keep passwords. Seeded by `lib/db/seed-auth-users.sql` (re-runnable; bcrypt hash → `account.password`). Client: `lib/auth-client.ts`; handler: `app/api/auth/[...all]/route.ts`.
- **Authz → `apps/web/lib/auth-helpers.ts`**: `getSessionUser()` (replaces `supabase.auth.getUser()`), `requireRole(roles, langId?)` + `requireUser()` (replace `.rpc('user_has_role')`). Usage: `const { user, response } = await requireRole([...]); if (response) return response;`. `user.id` is the UUID used by every FK. user_has_role array must be built as `ARRAY[...]::text[]` (see helper) — a JS array param expands to a row constructor.
- **`apps/web/lib/db/index.ts` is now LAZY** (Proxy) — importing never connects, so `next build` page-data collection doesn't need `DATABASE_URL`. Construct SDK clients lazily too (the OpenAI client in `app/api/translate/[language]` still throws at build without `OPENAI_API_KEY`).
- **middleware.ts** rewritten onto better-auth (`getSessionCookie`, Edge-safe, no DB; profile-redirect dropped since profiles are auto-created on signup).
- **Build/run staging:** `set -a; . /opt/mobtranslate/web.env; . /opt/mobtranslate/staging.env; set +a` (staging wins for `DATABASE_URL`/`BETTER_AUTH_*`/`PORT`/`NODE_ENV`), then `pnpm run build` (script is `next build --webpack` — NOT bare `next build`, which fails on the webpack/turbopack conflict; and NOT via `turbo`, which sandboxes env away). `/opt/mobtranslate/staging.env` holds `DATABASE_URL` + a generated `BETTER_AUTH_SECRET` + `BETTER_AUTH_URL=http://localhost:3301` + `PORT=3301`. Smoke test: `scratchpad/smoke.sh`.

**Mass-convert order (each builds on the locked patterns):** the 6 custom `/api/auth/*` routes + `AuthContext.tsx` (rewire to `authClient`) → dictionaries/search → quiz/SRS → curation/RBAC → recording studio (+ Phase 5 storage) → admin/sync. **CHECKPOINT with the user before Phase 6 cutover.**

## Remaining phases
**Phase 3 — better-auth.** Add better-auth (Postgres/Drizzle adapter) + its tables (`user`,`session`,`account`,`verification`). Migrate the 35 users from `auth.users` **preserving `id`** (so the ~30 public FKs stay linked — either keep FKs pointing at `auth.users` and back better-auth onto that, or create better-auth tables and repoint FKs with the same IDs). GoTrue uses **bcrypt** in `auth.users.encrypted_password` — reuse the hashes (better-auth bcrypt verification / custom password plugin) so users keep passwords; else force a reset (35 users, acceptable). Replace login/signup/reset, the session **middleware** (most routes), `AuthContext`, the ~6 `/api/auth/*` routes, and the ~50 `auth.getUser()` sites. Reimplement the `handle_new_user_profile` behavior (auto-create `user_profiles` on signup) **in app code**.

**Phase 4 — Drizzle data layer.** Convert the 422 `.from()` + 56 `.rpc()` call sites. Replace `lib/supabase/*` with Drizzle-based modules. **Because RLS is gone, every query must enforce authz in code** (ownership + role checks via the `user_roles`/`user_role_assignments` tables and `user_has_role`). Keep the SQL functions; call via raw `sql`. Suggest a vertical slice first (one read page + one mutating route) to lock the patterns, then scale by feature area (dictionaries → quiz/SRS → curation/RBAC → recording studio → admin/sync).

**Phase 5 — storage.** Move the `recordings` bucket to the box filesystem (the 20 files are at `/opt/mobtranslate/storage/recordings/` — copy to a served dir, e.g. `/mnt/donto-data/mobtranslate-storage/recordings`, served by Caddy). Rewrite `lib/recording/server.ts` + the 4 recordings API routes + the 11 `.storage` calls. NOTE: `recordings.master_url`/`opus_url` store **absolute hosted URLs** rendered into `<audio>` tags — rewrite them to the new host, or (cleaner) build URLs at render time from the host-independent `storage_path`/`opus_path` columns.

**Phase 6 — cutover (CHECKPOINT FIRST).** Add `DATABASE_URL` (from `/opt/mobtranslate/db.env`) to the systemd unit `EnvironmentFile`, drop `@supabase/*` deps + `SUPABASE_*`/`NEXT_PUBLIC_SUPABASE_*` from `/opt/mobtranslate/web.env`, rebuild, smoke-test on the staging port, then restart `mobtranslate-web.service`. Verify, keep hosted Supabase as rollback for a few days.

## How to build / test (don't disturb :3300)
- Repo root: `set -a; . /opt/mobtranslate/db.env; set +a` to get `DATABASE_URL`.
- Build: `cd /mnt/donto-data/workspace/mobtranslate.com && ./node_modules/.bin/turbo run build --filter=web` (uses pnpm 9.15 workspace).
- Typecheck a package: `cd apps/web && npx tsc -p tsconfig.json --noEmit`.
- Run a **staging** instance: `cd apps/web && PORT=3301 DATABASE_URL=... node node_modules/next/dist/bin/next start` (after a build), or `next dev` on 3301.
- Scripts use `tsx` (CJS — wrap top-level await in an async IIFE).
- Re-introspect: `cd apps/web && drizzle-kit pull` then re-apply the schema.ts patches (tsvector + auth.users stub).
- Live ops notes: `/root/MIGRATION-NOTES.md` (sudo). Box guide: `/mnt/donto-data/workspace/CLAUDE.md`.

## Secrets / safety
- All env in `/opt/mobtranslate/*.env` (mode 600). `db.env` is `ajax`-owned. Never echo or commit secret values.
- Hosted Supabase remains the source of truth until cutover. If you need more data/schema, there is a Supabase CLI authed on the *user's laptop* (not this box) and the Management API query endpoint; ask the user.
- Work as a user that can write the repo (`ajax`/`ajaxdavis`) and read `/opt/mobtranslate/db.env` (root via sudo, or ajax).

Start by reading `apps/web/lib/supabase/{server,client,queries}.ts` and one feature end-to-end (e.g. `apps/web/app/dictionaries/[language]`), then propose the vertical-slice plan before mass-converting.
