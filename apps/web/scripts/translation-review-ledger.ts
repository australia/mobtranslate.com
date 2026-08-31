import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import postgres from 'postgres';
import {
  auditDecision,
  auditRowSchema,
  legacyAuditRef,
  type AuditRow,
} from '../lib/translation-review-ledger';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const client = postgres(databaseUrl, { max: 1 });
const command = process.argv[2];

function option(name: string, required = true): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : undefined;
  if (required && !value) throw new Error(`--${name} is required.`);
  return value;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function readAuditRows(artifactPath: string): Promise<{
  bytes: Buffer;
  rows: AuditRow[];
}> {
  const bytes = await readFile(artifactPath);
  const rows = bytes
    .toString('utf8')
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line, index) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON at ${artifactPath}:${index + 1}`, { cause: error });
      }
      return auditRowSchema.parse(value);
    });
  return { bytes, rows };
}

async function importAudit(): Promise<void> {
  const artifactPath = option('artifact')!;
  const languageScope = option('language-scope')!;
  const requestRefPrefix = option('request-ref-prefix')!;
  const runKey = option('run-key')!;
  const methodVersion = option('method-version')!;
  const { bytes, rows: allRows } = await readAuditRows(artifactPath);
  const artifactHash = sha256(bytes);
  const artifactStat = await stat(artifactPath);
  const rows = allRows.filter((row) => row.kind === 'translate');
  const latestRequestAt = rows.reduce<string | undefined>(
    (latest, row) => (!latest || row.created_at > latest ? row.created_at : latest),
    undefined,
  );

  const existing = await client<{
    subject_id: string;
    request_id: string;
    legacy_audit_ref: string | null;
  }[]>`
    SELECT id AS subject_id, request_id, legacy_audit_ref
    FROM public.translation_review_subjects
    WHERE request_id IS NOT NULL
  `;
  const subjectByLegacyRef = new Map(
    existing.map((subject) => [
      legacyAuditRef(requestRefPrefix, subject.request_id),
      subject,
    ]),
  );

  const outcome = await client.begin(async (transaction) => {
    await transaction`
      INSERT INTO public.translation_review_runs (
        run_key,
        language_scope,
        reviewer_kind,
        method,
        method_version,
        status,
        cutoff_at,
        expected_subject_count,
        source_artifact_path,
        source_artifact_sha256,
        metadata,
        started_at
      ) VALUES (
        ${runKey},
        ${languageScope},
        'automated_evidence_audit',
        'retained_request_source_evidence_audit',
        ${methodVersion},
        'running',
        ${latestRequestAt ? new Date(latestRequestAt) : null},
        ${rows.length},
        ${artifactPath},
        ${artifactHash},
        ${transaction.json({
          artifact_mtime: artifactStat.mtime.toISOString(),
          cutoff_basis: 'maximum_request_created_at_in_artifact',
          source_row_count: allRows.length,
          translation_row_count: rows.length,
        })},
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (run_key) DO NOTHING
    `;
    const [run] = await transaction<{
      id: string;
      source_artifact_sha256: string | null;
      method_version: string;
    }[]>`
      SELECT id, source_artifact_sha256, method_version
      FROM public.translation_review_runs
      WHERE run_key = ${runKey}
      FOR UPDATE
    `;
    if (!run) throw new Error(`Review run was not created: ${runKey}`);
    if (run.source_artifact_sha256 !== artifactHash || run.method_version !== methodVersion) {
      throw new Error(`Review run ${runKey} already exists with different immutable provenance.`);
    }

    let matchedRetained = 0;
    let recoveredAfterPruning = 0;
    let insertedEvents = 0;

    for (const row of rows) {
      const matched = subjectByLegacyRef.get(row.request_ref);
      let subjectId: string;
      if (matched) {
        const updated = await transaction`
          UPDATE public.translation_review_subjects
             SET legacy_audit_ref = COALESCE(legacy_audit_ref, ${row.request_ref})
           WHERE id = ${matched.subject_id}
             AND (legacy_audit_ref IS NULL OR legacy_audit_ref = ${row.request_ref})
        `;
        if (updated.count !== 1) {
          throw new Error(`Conflicting legacy audit reference for subject ${matched.subject_id}.`);
        }
        subjectId = matched.subject_id;
        matchedRetained += 1;
      } else {
        await transaction`
          INSERT INTO public.translation_review_subjects (
            legacy_audit_ref,
            language_code,
            kind,
            request_status,
            model,
            request_created_at,
            input_char_count,
            output_char_count,
            raw_deleted_at
          ) VALUES (
            ${row.request_ref},
            ${row.language_code},
            ${row.kind},
            ${row.status ?? null},
            ${row.model ?? null},
            ${new Date(row.created_at)},
            ${row.input_chars},
            ${row.output_chars ?? null},
            CURRENT_TIMESTAMP
          )
          ON CONFLICT (legacy_audit_ref) DO NOTHING
        `;
        const [recovered] = await transaction<{ id: string }[]>`
          SELECT id
          FROM public.translation_review_subjects
          WHERE legacy_audit_ref = ${row.request_ref}
        `;
        if (!recovered) throw new Error(`Could not recover audited subject ${row.request_ref}.`);
        subjectId = recovered.id;
        recoveredAfterPruning += 1;
      }

      const evidenceRefs = [{
        type: 'privacy_safe_audit_artifact',
        path: artifactPath,
        sha256: artifactHash,
        request_ref: row.request_ref,
      }];
      const inserted = await transaction`
        INSERT INTO public.translation_review_events (
          subject_id,
          run_id,
          reviewer_kind,
          reviewer_identity,
          method,
          method_version,
          decision,
          evidence_tier,
          category,
          evidence_refs,
          findings,
          source_artifact_path,
          source_artifact_sha256,
          idempotency_key,
          reviewed_at
        ) VALUES (
          ${subjectId},
          ${run.id},
          'automated_evidence_audit',
          'codex',
          'retained_request_source_evidence_audit',
          ${methodVersion},
          ${auditDecision(row)},
          ${row.evidence_tier ?? null},
          ${row.category ?? null},
          ${transaction.json(evidenceRefs)},
          ${transaction.json(row)},
          ${artifactPath},
          ${artifactHash},
          ${`${runKey}:${row.request_ref}`},
          ${artifactStat.mtime}
        )
        ON CONFLICT (idempotency_key) DO NOTHING
      `;
      insertedEvents += inserted.count;
    }

    const [reviewed] = await transaction<{ count: number }[]>`
      SELECT COUNT(DISTINCT subject_id)::int AS count
      FROM public.translation_review_events
      WHERE run_id = ${run.id}
    `;
    const reviewedSubjectCount = reviewed?.count ?? 0;
    await transaction`
      UPDATE public.translation_review_runs
         SET status = CASE
               WHEN ${reviewedSubjectCount} = expected_subject_count THEN 'complete'
               ELSE 'failed'
             END,
             reviewed_subject_count = ${reviewedSubjectCount},
             completed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP,
             metadata = metadata || ${transaction.json({
               matched_retained_subjects: matchedRetained,
               recovered_after_raw_pruning: recoveredAfterPruning,
             })}
       WHERE id = ${run.id}
    `;

    return {
      runKey,
      artifactHash,
      expectedSubjects: rows.length,
      reviewedSubjects: reviewedSubjectCount,
      insertedEvents,
      matchedRetained,
      recoveredAfterPruning,
      status: reviewedSubjectCount === rows.length ? 'complete' : 'failed',
    };
  });

  console.log(JSON.stringify(outcome));
}

async function status(): Promise<void> {
  const coverage = await client`
    SELECT *
    FROM public.translation_review_language_coverage
    ORDER BY known_lifetime_request_count DESC, language_code
  `;
  const runs = await client`
    SELECT
      run_key,
      language_scope,
      reviewer_kind,
      method,
      method_version,
      status,
      expected_subject_count,
      reviewed_subject_count,
      started_at,
      completed_at
    FROM public.translation_review_runs
    ORDER BY created_at, id
  `;
  const reconciliation = await client`
    SELECT
      (SELECT COUNT(*)::int FROM public.translation_requests WHERE kind = 'translate')
        AS retained_translation_requests,
      (SELECT COUNT(*)::int FROM public.translation_review_subjects WHERE request_id IS NOT NULL)
        AS subjects_with_raw_request,
      (SELECT COUNT(*)::int FROM public.translation_review_subjects)
        AS individual_subjects,
      (SELECT COUNT(*)::int FROM public.translation_review_events)
        AS review_events,
      (SELECT COALESCE(SUM(privacy_pruned_request_count), 0)::int
         FROM public.translation_review_archive_gaps)
        AS untracked_privacy_pruned_requests
  `;
  console.log(JSON.stringify({ reconciliation: reconciliation[0], coverage, runs }, null, 2));
}

async function main(): Promise<void> {
  if (command === 'import-audit') return importAudit();
  if (command === 'status') return status();
  throw new Error('Usage: translation-review-ledger.ts <import-audit|status> [options]');
}

main().finally(() => client.end());
