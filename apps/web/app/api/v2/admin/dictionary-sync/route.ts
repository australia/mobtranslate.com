import { NextRequest, NextResponse } from 'next/server';
import { asc, count, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { snakeRows } from '@/lib/db/case';
import { getSessionUser, userHasRole } from '@/lib/auth-helpers';
import {
  dictionaryLocationCache as locationCacheT,
  dictionarySyncRuns as syncRunsT,
  dictionarySyncTasks as syncTasksT,
  languages as languagesT,
} from '@/lib/db/schema';
import {
  ensureSyncTasksForAllDictionaries,
  runDueDictionaryTasks,
  runManualDictionaryTasks
} from '@/lib/dictionary-sync/engine';

async function isAdminAuthenticated() {
  const user = await getSessionUser();

  if (!user) {
    return { ok: false, status: 401, userId: null as string | null };
  }

  const hasRole = await userHasRole(user.id, ['super_admin', 'dictionary_admin']);

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

    await ensureSyncTasksForAllDictionaries();

    // Tasks + their language (code, name) nested under `languages` to match the
    // original Supabase relation embed.
    const [taskRows, runRows, cacheCountRows] = await Promise.all([
      db
        .select({
          task: syncTasksT,
          language_code: languagesT.code,
          language_name: languagesT.name,
        })
        .from(syncTasksT)
        .leftJoin(languagesT, eq(syncTasksT.languageId, languagesT.id))
        .orderBy(asc(syncTasksT.taskType), asc(syncTasksT.nextRunAt)),
      db
        .select({
          run: syncRunsT,
          language_code: languagesT.code,
          language_name: languagesT.name,
        })
        .from(syncRunsT)
        .leftJoin(languagesT, eq(syncRunsT.languageId, languagesT.id))
        .orderBy(desc(syncRunsT.startedAt))
        .limit(100),
      db.select({ value: count() }).from(locationCacheT),
    ]);

    const tasks = taskRows.map((r) => ({
      ...snakeRows([r.task])[0],
      languages: r.language_code ? { code: r.language_code, name: r.language_name } : null,
    }));
    const runs = runRows.map((r) => ({
      ...snakeRows([r.run])[0],
      languages: r.language_code ? { code: r.language_code, name: r.language_name } : null,
    }));
    const cacheCount = cacheCountRows[0]?.value ?? 0;

    const runningCount = tasks.filter((task: any) => task.is_running).length;
    const failingCount = tasks.filter((task: any) => task.last_status === 'failed').length;
    const successCount = runs.filter((run: any) => run.status === 'success').length;
    const failureCount = runs.filter((run: any) => run.status === 'failed').length;

    return NextResponse.json({
      tasks,
      runs,
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

    await ensureSyncTasksForAllDictionaries();

    if (action === 'run_due') {
      const results = await runDueDictionaryTasks(null, isCronRequest ? 'cron' : 'api');
      return NextResponse.json({ action, count: results.length, results });
    }

    if (action === 'sync_all') {
      const results = await runManualDictionaryTasks(null, {
        taskType: 'yaml_sync',
        triggeredBy: isCronRequest ? 'cron' : 'manual',
        limit: 50
      });
      return NextResponse.json({ action, count: results.length, results });
    }

    if (action === 'enrich_locations') {
      const results = await runManualDictionaryTasks(null, {
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

      const results = await runManualDictionaryTasks(null, {
        languageCode,
        taskType: taskType as 'yaml_sync' | 'location_enrichment' | undefined,
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
