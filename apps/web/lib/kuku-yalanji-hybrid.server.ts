/**
 * Backwards-compatible Kuku Yalanji facade over the language-agnostic hybrid
 * translation engine. New serving code should use hybrid-translation.server.
 */
import {
  HybridReviewEvidenceListSchema,
  HybridReviewEvidenceSchema,
  HybridReviewToolSchema,
  ResolvedHybridReviewSchema,
  createHybridReviewPrompt,
  createHybridReviewUnavailableResult,
  findExactHybridDictionaryMatches,
  resolveHybridReview,
  retrieveHybridDictionaryEvidence,
  type HybridDictionaryEntry,
  type HybridReviewAttempt,
  type HybridReviewInput,
  type HybridReviewToolResult,
  type ResolvedHybridReview,
} from './hybrid-translation.server';
import {
  DEFAULT_HYBRID_REVIEW_MODEL,
  KUKU_YALANJI_HYBRID_DEFINITION,
} from './hybrid-translation-registry.server';
import type { HybridReviewEvidence } from './hybrid-translation-types';
import type { SourceAnalysis } from './hybrid-source-analysis.server';
import type { EvidencePack } from './translation-evidence/retrieve';

export const KUKU_YALANJI_REVIEW_MODEL = DEFAULT_HYBRID_REVIEW_MODEL;
export const KUKU_YALANJI_GRAMMAR_EVIDENCE =
  KUKU_YALANJI_HYBRID_DEFINITION.grammarEvidence;
export const KukuYalanjiReviewEvidenceSchema = HybridReviewEvidenceSchema;
export const KukuYalanjiReviewEvidenceListSchema =
  HybridReviewEvidenceListSchema;
export const KukuYalanjiReviewToolSchema = HybridReviewToolSchema;
export const ResolvedKukuYalanjiReviewSchema = ResolvedHybridReviewSchema;

export type KukuYalanjiDictionaryEntry = HybridDictionaryEntry;
export type KukuYalanjiReviewInput = HybridReviewInput;
export type KukuYalanjiReviewToolResult = HybridReviewToolResult;
export type ResolvedKukuYalanjiReview = ResolvedHybridReview;

export function retrieveKukuYalanjiDictionaryEvidence(
  source: string,
  entries: KukuYalanjiDictionaryEntry[],
  draft = '',
  limit = 16,
): HybridReviewEvidence[] {
  return retrieveHybridDictionaryEvidence(
    KUKU_YALANJI_HYBRID_DEFINITION,
    source,
    entries,
    draft,
    limit,
  );
}

export function findExactKukuYalanjiDictionaryMatches(
  source: string,
  entries: KukuYalanjiDictionaryEntry[],
): KukuYalanjiDictionaryEntry[] {
  return findExactHybridDictionaryMatches(source, entries);
}

export function createKukuYalanjiReviewPrompt(
  input: KukuYalanjiReviewInput,
  pack: EvidencePack,
): string {
  return createHybridReviewPrompt(KUKU_YALANJI_HYBRID_DEFINITION, input, pack);
}

export function resolveKukuYalanjiReview(
  source: string,
  analysis: SourceAnalysis,
  draft: string,
  pack: EvidencePack,
  attempt: HybridReviewAttempt,
): ResolvedKukuYalanjiReview {
  return resolveHybridReview(
    KUKU_YALANJI_HYBRID_DEFINITION,
    source,
    analysis,
    draft,
    pack,
    attempt,
  );
}

export function createReviewUnavailableResult(
  source: string,
  draft: string,
  errorMessage: string,
  dictionaryEntries: KukuYalanjiDictionaryEntry[],
  dictionaryEvidence: HybridReviewEvidence[],
): ResolvedKukuYalanjiReview {
  return createHybridReviewUnavailableResult(
    source,
    draft,
    errorMessage,
    dictionaryEntries,
    dictionaryEvidence,
  );
}
