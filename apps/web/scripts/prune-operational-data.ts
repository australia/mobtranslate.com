import postgres from 'postgres';
import { ttsInputFingerprint } from '../lib/tts-cache.server';

const databaseUrl = process.env.DATABASE_URL?.trim();
const dryRun = process.argv.includes('--dry-run');
const retentionDays = Number(
  process.env.MOBTRANSLATE_RAW_REQUEST_RETENTION_DAYS || '30',
);

if (!databaseUrl) throw new Error('DATABASE_URL is required.');
if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
  throw new Error('MOBTRANSLATE_RAW_REQUEST_RETENTION_DAYS must be 1–365.');
}

const client = postgres(databaseUrl, { max: 1 });
const LOCK_ID = 1_973_061_904;

async function main() {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const counts = await client<{
    raw_requests: number;
    tts_without_fingerprint: number;
    tts_text_to_redact: number;
    expired_budgets: number;
    expired_translation_cache: number;
  }[]>`
    select
      (select count(*)::int from public.translation_requests where created_at < ${cutoff}) as raw_requests,
      (select count(*)::int from public.tts_generations where input_fingerprint is null) as tts_without_fingerprint,
      (select count(*)::int from public.tts_generations
        where created_at < ${cutoff} and text not like '[expired:%') as tts_text_to_redact,
      (select count(*)::int from public.public_api_rate_limits where expires_at < now()) as expired_budgets,
      (select count(*)::int from public.translation_pipeline_cache where expires_at < now()) as expired_translation_cache
  `;

  if (dryRun) {
    console.log(JSON.stringify({ dryRun, retentionDays, cutoff, ...counts[0] }));
    return;
  }

  await client`select pg_advisory_lock(${LOCK_ID})`;
  try {
    const result = await client.begin(async (transaction) => {
      const missing = await transaction<{
        id: string;
        language_code: string;
        text: string;
        model: string;
      }[]>`
        select id, language_code, text, model
          from public.tts_generations
         where input_fingerprint is null
         order by created_at, id
         for update
      `;
      let fingerprintsBackfilled = 0;
      for (const row of missing) {
        const fingerprint = ttsInputFingerprint(
          row.language_code,
          row.text,
          row.model,
        );
        const updated = await transaction`
          update public.tts_generations as target
             set input_fingerprint = ${fingerprint}
           where target.id = ${row.id}
             and target.input_fingerprint is null
             and not exists (
               select 1
                 from public.tts_generations as existing
                where existing.language_code = target.language_code
                  and existing.model = target.model
                  and existing.input_fingerprint = ${fingerprint}
                  and existing.id <> target.id
             )
        `;
        fingerprintsBackfilled += updated.count;
      }

      await transaction`
        insert into public.translation_request_daily_metrics (
          activity_date, kind, source, language_code, status, model,
          request_count, error_count, total_duration_ms
        )
        select
          created_at::date,
          kind,
          coalesce(source, ''),
          coalesce(language_code, ''),
          coalesce(status, ''),
          coalesce(model, ''),
          count(*),
          count(*) filter (where status = 'error' or error is not null),
          coalesce(sum(duration_ms), 0)
        from public.translation_requests
        where created_at < ${cutoff}
        group by 1, 2, 3, 4, 5, 6
        on conflict (activity_date, kind, source, language_code, status, model)
        do update set
          request_count = translation_request_daily_metrics.request_count + excluded.request_count,
          error_count = translation_request_daily_metrics.error_count + excluded.error_count,
          total_duration_ms = translation_request_daily_metrics.total_duration_ms + excluded.total_duration_ms,
          archived_at = now()
      `;
      const deletedRequests = await transaction`
        delete from public.translation_requests where created_at < ${cutoff}
      `;
      const redactedTts = await transaction`
        update public.tts_generations
           set text = '[expired:' || id::text || ']',
               normalized_input = null
         where created_at < ${cutoff}
           and input_fingerprint is not null
           and text not like '[expired:%'
      `;
      const deletedBudgets = await transaction`
        delete from public.public_api_rate_limits where expires_at < now()
      `;
      const deletedTranslationCache = await transaction`
        delete from public.translation_pipeline_cache where expires_at < now()
      `;
      return {
        fingerprintsBackfilled,
        rawRequestsArchivedAndDeleted: deletedRequests.count,
        ttsInputsRedacted: redactedTts.count,
        expiredBudgetRowsDeleted: deletedBudgets.count,
        expiredTranslationCacheRowsDeleted: deletedTranslationCache.count,
      };
    });
    console.log(JSON.stringify({ dryRun, retentionDays, cutoff, ...result }));
  } finally {
    await client`select pg_advisory_unlock(${LOCK_ID})`;
  }
}

main().finally(() => client.end());
