# Dictionary Sync System

This system keeps YAML dictionaries as source-of-truth while continuously syncing to PostgreSQL/Supabase.

## What it does

- Syncs all `dictionaries/*/dictionary.yaml` files into database tables.
- Tracks every sync/enrichment run in `dictionary_sync_runs`.
- Schedules recurring tasks in `dictionary_sync_tasks`.
- Enriches map/location words with AI-assisted candidate detection plus geocoding.
- Caches geocoding lookups in `dictionary_location_cache` with TTL expiry.

## Required migration

Run:

- `apps/web/supabase/migrations/20260212_create_dictionary_sync_system.sql`

## Env vars

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DICTIONARY_SYNC_SECRET` (for cron endpoint security)
- `OPENAI_API_KEY` (optional but recommended for AI candidate scoring)

## API endpoint

- `GET /api/v2/admin/dictionary-sync`: dashboard data
- `POST /api/v2/admin/dictionary-sync`: run actions

POST body actions:

- `{ "action": "run_due" }`
- `{ "action": "sync_all" }`
- `{ "action": "enrich_locations" }`
- `{ "action": "run_language", "language_code": "kuku_yalanji", "task_type": "yaml_sync" }`

For unattended scheduler calls, send header:

- `x-sync-secret: $DICTIONARY_SYNC_SECRET`

## CLI commands

- `npm run sync:dictionaries`
- `npm run sync:dictionaries:all`
- `npm run sync:dictionaries:locations`

## Suggested cron defaults

- Call `POST /api/v2/admin/dictionary-sync` with `{ "action": "run_due" }` every 10 minutes.
- YAML sync task interval: 6 hours.
- Location enrichment task interval: 12 hours.
- Geocode cache TTL: 90 days.

