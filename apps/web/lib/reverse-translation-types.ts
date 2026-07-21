import type { TranslationCacheState } from './kuku-yalanji-hybrid-types';

export type ReverseTranslationConfidence = 'low' | 'medium' | 'high';

export interface ReverseTranslationEvidence {
  id: string;
  kind: 'dictionary';
  title: string;
  detail: string;
  sourceLabel: string;
  sourceUrl: string;
}

/** The whole input was a single dictionary headword — no model involved. */
export interface ReverseDictionaryExactInference {
  route: 'dictionary_exact_reverse';
  validation: 'dictionary_record';
  modelId: 'mobtranslate-dictionary';
  dictionaryRevision: string;
  sourceUrl: string;
  senses: { word: string; gloss: string; sourceUrl: string }[];
}

/** Dictionary-evidence retrieval + a structured model pass. */
export interface ReverseTranslationInference {
  route: 'dictionary_reverse_review';
  validation: 'unverified_research_preview';
  latencyMs: number;
  review: {
    provider: 'openai';
    modelId: string;
    confidence: ReverseTranslationConfidence;
    latencyMs: number | null;
    summary: string;
    breakdown: string;
    caveats: string[];
    evidence: ReverseTranslationEvidence[];
  };
  cache: {
    evidence: TranslationCacheState;
    review: TranslationCacheState;
    resolved: TranslationCacheState;
  };
}
