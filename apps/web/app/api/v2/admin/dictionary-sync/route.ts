import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  ensureSyncTasksForAllDictionaries,
  runDueDictionaryTasks,
  runManualDictionaryTasks
} from '@/lib/dictionary-sync/engine';

async function isAdminAuthenticated() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, status: 401, userId: null as string | null };
  }

  const { data: hasRole } = await supabase.rpc('user_has_role', {
    user_uuid: user.id,
    role_names: ['super_admin', 'dictionary_admin']
  });

  if (!hasRole) {
    return { ok: false, status: 403, userId: user.id };
  }

  return { ok: true, status: 200, userId: user.id };
}

function hasValidCronSecret(request: NextRequest): boolean {
  const headerSecret = request.headers.get('x-sync-secret');
  const envSecret = process.env.DICTIONARY_SYNC_SECRET;
  return !!envSecret && !!headerSecret && headerSecret === envSecret;
}

export async function GET() {
  try {
    const auth = await isAdminAuthenticated();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
    }

    const supabase = createAdminClient();
    await ensureSyncTasksForAllDictionaries(supabase);

    const [{ data: tasks, error: tasksError }, { data: runs, error: runsError }, { count: cacheCount, error: cacheError }] =
      await Promise.all([
        supabase
          .from('dictionary_sync_tasks')
          .select(`
            *,
            languages!dictionary_sync_tasks_language_id_fkey(code, name)
          `)
          .order('task_type')
          .order('next_run_at', { ascending: true }),
        supabase
          .from('dictionary_sync_runs')
          .select(`
            *,
            languages!dictionary_sync_runs_language_id_fkey(code, name)
          `)
          .order('started_at', { ascending: false })
          .limit(100),
        supabase
          .from('dictionary_location_cache')
          .select('*', { count: 'exact', head: true })
      ]);

    if (tasksError) {
      throw tasksError;
    }
    if (runsError) {
      throw runsError;
    }
    if (cacheError) {
      throw cacheError;
    }

    const runningCount = (tasks || []).filter((task: any) => task.is_running).length;
    const failingCount = (tasks || []).filter((task: any) => task.last_status === 'failed').length;
    const successCount = (runs || []).filter((run: any) => run.status === 'success').length;
    const failureCount = (runs || []).filter((run: any) => run.status === 'failed').length;

    return NextResponse.json({
      tasks: tasks || [],
      runs: runs || [],
      stats: {
        running_tasks: runningCount,
        failing_tasks: failingCount,
        successful_runs: successCount,
        failed_runs: failureCount,
        cache_records: cacheCount || 0
      }
    });
  } catch (error) {
    console.error('Dictionary sync GET error:', error);
    return NextResponse.json({ error: 'Failed to load dictionary sync status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const isCronRequest = hasValidCronSecret(request);
    if (!isCronRequest) {
      const auth = await isAdminAuthenticated();
      if (!auth.ok) {
        return NextResponse.json({ error: auth.status === 401 ? 'Unauthorized' : 'Forbidden' }, { status: auth.status });
      }
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : 'run_due';
    const taskType = typeof body.task_type === 'string' ? body.task_type : undefined;
    const languageCode = typeof body.language_code === 'string' ? body.language_code : undefined;

    const supabase = createAdminClient();
    await ensureSyncTasksForAllDictionaries(supabase);

    if (action === 'run_due') {
      const results = await runDueDictionaryTasks(supabase, isCronRequest ? 'cron' : 'api');
      return NextResponse.json({ action, count: results.length, results });
    }

    if (action === 'sync_all') {
      const results = await runManualDictionaryTasks(supabase, {
        taskType: 'yaml_sync',
        triggeredBy: isCronRequest ? 'cron' : 'manual',
        limit: 50
      });
      return NextResponse.json({ action, count: results.length, results });
    }

    if (action === 'enrich_locations') {
      const results = await runManualDictionaryTasks(supabase, {
        taskType: 'location_enrichment',
        triggeredBy: isCronRequest ? 'cron' : 'manual',
        limit: 50
      });
      return NextResponse.json({ action, count: results.length, results });
    }

    if (action === 'run_language') {
      if (!languageCode) {
        return NextResponse.json({ error: 'language_code is required for run_language' }, { status: 400 });
      }

      const results = await runManualDictionaryTasks(supabase, {
        languageCode,
        taskType,
        triggeredBy: isCronRequest ? 'cron' : 'manual',
        limit: 10
      });
      return NextResponse.json({ action, count: results.length, results });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Dictionary sync POST error:', error);
    return NextResponse.json({ error: 'Failed to run dictionary sync action' }, { status: 500 });
  }
}

