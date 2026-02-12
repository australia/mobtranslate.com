import { createAdminClient } from '../lib/supabase/admin';
import { runDueDictionaryTasks, runManualDictionaryTasks } from '../lib/dictionary-sync/engine';

async function main() {
  const supabase = createAdminClient();
  const action = process.argv[2] || 'run_due';

  if (action === 'run_due') {
    const results = await runDueDictionaryTasks(supabase, 'manual');
    console.log(JSON.stringify({ action, count: results.length, results }, null, 2));
    return;
  }

  if (action === 'sync_all') {
    const results = await runManualDictionaryTasks(supabase, {
      taskType: 'yaml_sync',
      triggeredBy: 'manual',
      limit: 50
    });
    console.log(JSON.stringify({ action, count: results.length, results }, null, 2));
    return;
  }

  if (action === 'enrich_locations') {
    const results = await runManualDictionaryTasks(supabase, {
      taskType: 'location_enrichment',
      triggeredBy: 'manual',
      limit: 50
    });
    console.log(JSON.stringify({ action, count: results.length, results }, null, 2));
    return;
  }

  throw new Error(`Unsupported action: ${action}`);
}

main().catch((error) => {
  console.error('Dictionary sync runner failed:', error);
  process.exit(1);
});

