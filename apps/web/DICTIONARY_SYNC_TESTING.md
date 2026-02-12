# Dictionary Sync Testing Guide

This guide shows exactly how to test the YAML-to-DB sync system end-to-end.

It covers:
- required environment setup
- migration checks
- manual sync tests
- admin UI tests
- API tests
- scheduler/cron tests
- expected outputs
- troubleshooting

---

## 1. What This System Does

Source of truth:
- `dictionaries/*/dictionary.yaml`

DB mirror and orchestration:
- `dictionary_sync_tasks` (scheduled jobs)
- `dictionary_sync_runs` (run history + metrics)
- `dictionary_location_cache` (geocode cache with TTL)
- `words` now includes sync + location fields

Task types:
- `yaml_sync`
- `location_enrichment`

---

## 2. Required Environment

In repo root `.env`, make sure these are set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DICTIONARY_SYNC_SECRET`
- `OPENAI_API_KEY` (optional, improves location candidate detection)

Quick check:

```bash
cd /Users/ajaxdavis/repos/mobtranslate.com
rg -n "^NEXT_PUBLIC_SUPABASE_URL=|^NEXT_PUBLIC_SUPABASE_ANON_KEY=|^SUPABASE_SERVICE_ROLE_KEY=|^DICTIONARY_SYNC_SECRET=|^OPENAI_API_KEY=" .env
```

---

## 3. Verify Migrations

Required migrations:
- `supabase/migrations/20260212000000_create_dictionary_sync_system.sql`
- `supabase/migrations/20260212001000_fix_yaml_source_ref_unique_index.sql`

Check remote migration status:

```bash
cd /Users/ajaxdavis/repos/mobtranslate.com
supabase migration list
```

Expected:
- `20260212000000` appears in both Local and Remote
- `20260212001000` appears in both Local and Remote

---

## 4. CLI Test Flow (Fastest)

Run YAML sync for all dictionaries:

```bash
cd /Users/ajaxdavis/repos/mobtranslate.com
set -a && source .env && set +a
pnpm --filter web run sync:dictionaries:all
```

Expected:
- JSON result with `count` > 0
- each result row has `status: "success"`

Run location enrichment:

```bash
pnpm --filter web run sync:dictionaries:locations
```

Expected:
- JSON result with `count` > 0
- task results `status: "success"`

Run due-scheduler path:

```bash
pnpm --filter web run sync:dictionaries
```

Expected:
- `count` may be `0` if nothing is due (this is normal)
- if due tasks exist, runs are created

---

## 5. DB Proof Queries

Use this one-shot command to print key health metrics:

```bash
cd /Users/ajaxdavis/repos/mobtranslate.com
set -a && source .env && set +a
pnpm --filter web exec tsx -e "import {createClient} from '@supabase/supabase-js'; const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!); (async()=>{ const [tasks,runs,cache]=await Promise.all([s.from('dictionary_sync_tasks').select('*',{count:'exact',head:true}),s.from('dictionary_sync_runs').select('*',{count:'exact',head:true}),s.from('dictionary_location_cache').select('*',{count:'exact',head:true})]); console.log({tasks:tasks.count,runs:runs.count,cache:cache.count}); })();"
```

Expected:
- `tasks` is non-zero
- `runs` increases after each test run
- `cache` grows after enrichment runs

Check latest run results:

```bash
cd /Users/ajaxdavis/repos/mobtranslate.com
set -a && source .env && set +a
pnpm --filter web exec tsx -e "import {createClient} from '@supabase/supabase-js'; const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!); (async()=>{ const r=await s.from('dictionary_sync_runs').select('task_type,status,words_scanned,words_upserted,locations_resolved,error_count,error_details,started_at').order('started_at',{ascending:false}).limit(12); console.log(JSON.stringify(r.data,null,2)); })();"
```

Expected:
- recent `yaml_sync` rows with `status: "success"` and `words_upserted > 0`
- recent `location_enrichment` rows with `status: "success"`
- `error_count` should usually be `0`

---

## 6. Admin UI Test

Start web app:

```bash
cd /Users/ajaxdavis/repos/mobtranslate.com/apps/web
pnpm dev
```

Open:
- `http://localhost:3000/admin/dictionary-sync`

What to verify:
- cards show running/failing/success/cache counts
- task table lists `yaml_sync` + `location_enrichment` by language
- run history populates after CLI/API runs
- buttons work:
  - `Run Due Tasks`
  - `Sync YAML`
  - `Enrich Locations`

Expected:
- button actions create new rows in `dictionary_sync_runs`
- task statuses update and re-schedule `next_run_at`

---

## 7. API Test

Read dashboard payload:

```bash
curl -s http://localhost:3000/api/v2/admin/dictionary-sync
```

Trigger sync-all:

```bash
curl -s -X POST http://localhost:3000/api/v2/admin/dictionary-sync \
  -H "Content-Type: application/json" \
  -d '{"action":"sync_all"}'
```

Trigger location enrichment:

```bash
curl -s -X POST http://localhost:3000/api/v2/admin/dictionary-sync \
  -H "Content-Type: application/json" \
  -d '{"action":"enrich_locations"}'
```

Cron-style due-run (secret header):

```bash
curl -s -X POST http://localhost:3000/api/v2/admin/dictionary-sync \
  -H "Content-Type: application/json" \
  -H "x-sync-secret: YOUR_DICTIONARY_SYNC_SECRET" \
  -d '{"action":"run_due"}'
```

Expected:
- JSON with `count` and per-task `status`
- no 500 errors

---

## 8. Scheduler/Cron Setup

Recommended schedule:
- every 10 minutes call `run_due`

Endpoint:
- `POST /api/v2/admin/dictionary-sync`

Body:
- `{"action":"run_due"}`

Header:
- `x-sync-secret: <DICTIONARY_SYNC_SECRET>`

Why:
- tasks self-schedule via `next_run_at`
- due-run pattern avoids hardcoding intervals in cron

---

## 9. Smoke Checklist

Use this as a quick pass/fail checklist:

- [ ] both sync migrations are applied remotely
- [ ] `.env` has all required keys
- [ ] `sync:dictionaries:all` returns success rows
- [ ] `sync:dictionaries:locations` returns success rows
- [ ] `dictionary_sync_tasks` has rows for each language and both task types
- [ ] `dictionary_sync_runs` row count increases after each run
- [ ] admin page loads and action buttons work
- [ ] map/location words exist with lat/lng where resolved

---

## 10. Troubleshooting

### `there is no unique or exclusion constraint matching the ON CONFLICT specification`
Cause:
- missing/faulty unique index on `(language_id, yaml_source_ref)`

Fix:
- ensure migration `20260212001000_fix_yaml_source_ref_unique_index.sql` is applied

### `Dictionary YAML not found for language ...`
Cause:
- dictionary folder missing `dictionary.yaml`

Fix:
- create `dictionaries/<folder>/dictionary.yaml`
- rerun sync

### `sync_all` returns `count: 0`
Cause:
- no matching enabled tasks or lock issue

Checks:
- inspect `dictionary_sync_tasks` rows
- verify `enabled = true`
- verify tasks are not stuck with `is_running = true` and future `lock_expires_at`

### Supabase `db push` blocked by migration history mismatch
Cause:
- local and remote migration timelines differ

Fix pattern:
- `supabase migration list`
- repair statuses carefully with `supabase migration repair`
- re-run `supabase db push`

---

## 11. Key Files

- Runtime engine: `apps/web/lib/dictionary-sync/engine.ts`
- Admin API: `apps/web/app/api/v2/admin/dictionary-sync/route.ts`
- Admin page: `apps/web/app/admin/dictionary-sync/page.tsx`
- CLI runner: `apps/web/scripts/run-dictionary-sync.ts`
- Migration 1: `supabase/migrations/20260212000000_create_dictionary_sync_system.sql`
- Migration 2: `supabase/migrations/20260212001000_fix_yaml_source_ref_unique_index.sql`
- Wajarri YAML source: `dictionaries/wajarri/dictionary.yaml`

