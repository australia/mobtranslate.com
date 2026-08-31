// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  auditDecision,
  auditRowSchema,
  legacyAuditRef,
} from '@/lib/translation-review-ledger';

const base = auditRowSchema.parse({
  request_ref: 'a'.repeat(64),
  kind: 'translate',
  language_code: 'kuku_yalanji',
  created_at: '2026-08-30T00:00:00.000Z',
  status: 'ok',
  model: 'dictionary-exact',
  category: 'example',
  evidence_tier: 'none',
  input_chars: 4,
  output_chars: 6,
});

describe('translation review ledger helpers', () => {
  it('reproduces a stable legacy audit reference', () => {
    expect(legacyAuditRef('mobtranslate-kuku-audit-v1', 'request-1')).toBe(
      legacyAuditRef('mobtranslate-kuku-audit-v1', 'request-1'),
    );
    expect(legacyAuditRef('mobtranslate-kuku-audit-v1', 'request-1')).not.toBe(
      legacyAuditRef('mobtranslate-wajarri-audit-v1', 'request-1'),
    );
  });

  it('never promotes synthetic evidence into direct linguistic support', () => {
    expect(auditDecision({ ...base, evidence_tier: 'synthetic' })).toBe('unverified');
    expect(auditDecision({ ...base, evidence_tier: 'none' })).toBe('unverified');
  });

  it('distinguishes full and partial direct-source support', () => {
    expect(auditDecision({
      ...base,
      evidence_tier: 'direct_source',
      direct_target_token_coverage: 1,
    })).toBe('supported');
    expect(auditDecision({
      ...base,
      evidence_tier: 'direct_source',
      direct_target_token_coverage: 0.5,
    })).toBe('partially_supported');
  });

  it('keeps errors, empty results, and chats out of support counts', () => {
    expect(auditDecision({ ...base, status: 'error' })).toBe('error');
    expect(auditDecision({ ...base, output_chars: 0 })).toBe('not_reviewable');
    expect(auditDecision({ ...base, kind: 'chat' })).toBe('not_translation');
  });
});
