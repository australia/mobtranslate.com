/**
 * Bulk, idempotent YAML -> DB sync for EVERY tiered dictionary on disk
 * (Wiktionary + Curr). Leaves the hand-built rich dictionaries untouched.
 *
 * Usage: tsx scripts/sync-all-dictionaries.ts
 *   (must run with DATABASE_URL set — e.g. `set -a; . /opt/mobtranslate/web.env; set +a`)
 */
import { runYamlSyncForAllDictionaries } from '../lib/dictionary-sync/engine';

async function main() {
  const started = Date.now();
  const results = await runYamlSyncForAllDictionaries();
  const ok = results.filter((r) => r.words !== undefined);
  const errors = results.filter((r) => r.error);
  const skipped = results.filter((r) => r.skipped);
  const totalWords = ok.reduce((n, r) => n + (r.words ?? 0), 0);

  console.log(
    JSON.stringify(
      {
        synced_dictionaries: ok.length,
        total_words_upserted: totalWords,
        skipped_untiered: skipped.length,
        errors: errors.length,
        error_detail: errors,
        elapsed_s: Math.round((Date.now() - started) / 1000),
      },
      null,
      2
    )
  );
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('sync-all-dictionaries failed:', error);
  process.exit(1);
});
