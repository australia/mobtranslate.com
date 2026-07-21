export type HybridReviewDecision =
  | 'dictionary_exact'
  | 'kept_draft'
  | 'revised_draft'
  | 'insufficient_evidence'
  | 'review_unavailable';

export type HybridReviewConfidence = 'low' | 'medium' | 'high';

export interface HybridReviewEvidence {
  id: string;
  kind: 'dictionary' | 'grammar';
  title: string;
  detail: string;
  sourceLabel: string;
  sourceUrl: string;
}

export type TranslationCacheState = 'hit' | 'miss' | 'coalesced' | 'disabled';

export interface HybridDraftInference {
  route: 'huggingface_draft';
  validation: 'unverified_research_preview';
  latencyMs: number;
  language: {
    code: string;
    name: string;
    tag: string;
  };
  draft: {
    provider: 'huggingface_space';
    translation: string;
    modelId: string;
    version: string;
    label: string;
    latencyMs: number;
    queueMs: number;
    sourceUrl: string;
  };
  cache: {
    draft: TranslationCacheState;
  };
}

export interface HybridTranslationInference {
  route: 'huggingface_grammar_review';
  validation: 'unverified_research_preview';
  latencyMs: number;
  language: {
    code: string;
    name: string;
    tag: string;
  };
  draft: {
    provider: 'huggingface_space';
    translation: string;
    modelId: string;
    version: string;
    label: string;
    latencyMs: number;
    queueMs: number;
    sourceUrl: string;
  };
  review: {
    provider: 'openai';
    modelId: string;
    decision: HybridReviewDecision;
    confidence: HybridReviewConfidence;
    latencyMs: number | null;
    summary: string;
    changes: string[];
    caveats: string[];
    evidence: HybridReviewEvidence[];
  };
  cache: {
    draft: TranslationCacheState;
    evidence: TranslationCacheState;
    review: TranslationCacheState;
    resolved: TranslationCacheState;
  };
}
