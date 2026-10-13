import { createHash } from 'node:crypto';
import { z } from 'zod';

export const auditRowSchema = z
  .object({
    request_ref: z.string().regex(/^[0-9a-f]{64}$/),
    kind: z.string(),
    language_code: z.string().min(1),
    created_at: z.string().datetime({ offset: true }),
    status: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    evidence_tier: z.string().nullable().optional(),
    input_chars: z.number().int().nonnegative(),
    output_chars: z.number().int().nonnegative().nullable().optional(),
    runtime_error: z.unknown().nullable().optional(),
  })
  .passthrough();

export type AuditRow = z.infer<typeof auditRowSchema>;

export type ReviewDecision =
  | 'supported'
  | 'partially_supported'
  | 'contradicted'
  | 'unverified'
  | 'error'
  | 'not_translation'
  | 'not_reviewable';

export function legacyAuditRef(prefix: string, requestId: string): string {
  return createHash('sha256').update(`${prefix}:${requestId}`).digest('hex');
}

/**
 * Convert an evidence audit into a deliberately conservative ledger decision.
 * Synthetic agreement is retained in the evidence tier but never promoted to
 * linguistic support. Only direct-source coverage can produce "supported".
 */
export function auditDecision(
  row: AuditRow,
  supportingEvidenceTiers: ReadonlySet<string> = new Set(['direct_source']),
): ReviewDecision {
  if (row.kind !== 'translate') return 'not_translation';
  if (row.status === 'error' || row.runtime_error != null) return 'error';
  if (row.output_chars == null || row.output_chars === 0) return 'not_reviewable';
  if (!row.evidence_tier || !supportingEvidenceTiers.has(row.evidence_tier)) {
    return 'unverified';
  }

  const directCoverage = [
    row.direct_target_token_coverage,
    row.direct_or_synthetic_target_token_coverage,
    row.known_target_token_coverage,
  ].find((value): value is number => typeof value === 'number');

  return directCoverage != null && directCoverage < 1
    ? 'partially_supported'
    : 'supported';
}
