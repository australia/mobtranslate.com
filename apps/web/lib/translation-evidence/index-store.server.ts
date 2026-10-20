import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/index';
import { vectorLiteral } from './embeddings.server';
import type { EvidenceUnitKind } from './units';
import type { IndexedEvidenceUnit, SemanticHit } from './retrieve';

/**
 * Runtime access to the evidence index. Unit text and forms are held in
 * memory per language (they are small); embeddings stay in Postgres and are
 * searched there with pgvector.
 */

export interface LoadedEvidenceIndex {
  languageCode: string;
  revision: string;
  embeddingModel: string;
  dimensions: number;
  units: Map<string, IndexedEvidenceUnit>;
}

const STATE_TTL_MS = 60_000;
const loaded = new Map<string, LoadedEvidenceIndex>();
const stateChecks = new Map<string, { at: number; revision: string | null }>();

async function currentRevision(languageCode: string): Promise<{
  revision: string;
  embeddingModel: string;
  dimensions: number;
} | null> {
  const rows = (await db.execute(sql`
    SELECT revision, embedding_model, dimensions
    FROM public.translation_evidence_index_state
    WHERE language_code = ${languageCode}
  `)) as unknown as { revision: string; embedding_model: string; dimensions: number }[];
  const row = rows[0];
  return row
    ? { revision: row.revision, embeddingModel: row.embedding_model, dimensions: Number(row.dimensions) }
    : null;
}

/**
 * The index for a language, or null when none has been built. The state row
 * is re-checked at most once a minute so a rebuild is picked up without a
 * restart.
 */
export async function loadEvidenceIndex(
  languageCode: string,
): Promise<LoadedEvidenceIndex | null> {
  const now = Date.now();
  const cached = loaded.get(languageCode);
  const check = stateChecks.get(languageCode);
  if (check && now - check.at < STATE_TTL_MS) {
    if (!check.revision) return null;
    if (cached?.revision === check.revision) return cached;
  }

  const state = await currentRevision(languageCode);
  stateChecks.set(languageCode, { at: now, revision: state?.revision ?? null });
  if (!state) {
    loaded.delete(languageCode);
    return null;
  }
  if (cached?.revision === state.revision) return cached;

  const rows = (await db.execute(sql`
    SELECT unit_key, kind, title, body, source_label, source_url, target_forms, pinned
    FROM public.translation_evidence_units
    WHERE language_code = ${languageCode}
  `)) as unknown as {
    unit_key: string;
    kind: EvidenceUnitKind;
    title: string;
    body: string;
    source_label: string;
    source_url: string;
    target_forms: string[];
    pinned: boolean;
  }[];
  const units = new Map<string, IndexedEvidenceUnit>();
  for (const row of rows) {
    units.set(row.unit_key, {
      key: row.unit_key,
      kind: row.kind,
      title: row.title,
      body: row.body,
      sourceLabel: row.source_label,
      sourceUrl: row.source_url,
      targetForms: row.target_forms ?? [],
      pinned: row.pinned,
    });
  }
  const index: LoadedEvidenceIndex = {
    languageCode,
    revision: state.revision,
    embeddingModel: state.embeddingModel,
    dimensions: state.dimensions,
    units,
  };
  loaded.set(languageCode, index);
  return index;
}

export interface SemanticQuota {
  kind: EvidenceUnitKind;
  limit: number;
}

/** Nearest units of each kind for each query vector (cosine distance). */
export async function searchEvidenceIndex(
  languageCode: string,
  queryVectors: readonly (readonly number[])[],
  quotas: readonly SemanticQuota[],
): Promise<SemanticHit[]> {
  if (queryVectors.length === 0 || quotas.length === 0) return [];
  // Arrays travel as JSON so the driver binds each as a single parameter.
  const vectors = JSON.stringify(queryVectors.map((vector) => vectorLiteral(vector)));
  const quotaJson = JSON.stringify(
    quotas.map((quota) => ({ kind: quota.kind, lim: Math.max(1, Math.floor(quota.limit)) })),
  );
  const rows = (await db.execute(sql`
    SELECT q.ordinality::int - 1 AS query_index,
           hit.unit_key,
           hit.similarity
    FROM json_array_elements_text(${vectors}::json) WITH ORDINALITY AS q(vec, ordinality)
    CROSS JOIN json_to_recordset(${quotaJson}::json) AS quota(kind text, lim int)
    CROSS JOIN LATERAL (
      SELECT u.unit_key,
             1 - (u.embedding <=> q.vec::vector) AS similarity
      FROM public.translation_evidence_units u
      WHERE u.language_code = ${languageCode}
        AND u.kind = quota.kind
      ORDER BY u.embedding <=> q.vec::vector
      LIMIT quota.lim
    ) AS hit
  `)) as unknown as { query_index: number; unit_key: string; similarity: number }[];
  return rows.map((row) => ({
    queryIndex: Number(row.query_index),
    unitKey: row.unit_key,
    similarity: Number(row.similarity),
  }));
}
