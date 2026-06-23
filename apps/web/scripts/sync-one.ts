import path from 'path';
import fs from 'fs';
import { createAdminClient } from '../lib/supabase/admin';
import { runYamlSyncForLanguage } from '../lib/dictionary-sync/engine';

/** Sync a single dictionary by language code. Usage: tsx scripts/sync-one.ts <code> */
async function main() {
  const code = process.argv[2] || 'kuku_yalanji';
  const supabase = createAdminClient();
  const root = path.resolve(process.cwd(), '../../dictionaries');
  const file = path.join(root, code, 'dictionary.yaml');
  if (!fs.existsSync(file)) {
    throw new Error(`Dictionary file not found: ${file}`);
  }
  console.log(`Syncing ${code} from ${file} ...`);
  const stats = await runYamlSyncForLanguage(supabase, code, file, { prune_removed: true });
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error('sync-one failed:', error);
  process.exit(1);
});
