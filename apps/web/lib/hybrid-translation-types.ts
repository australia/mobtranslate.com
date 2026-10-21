export type HybridReviewDecision =
  | 'dictionary_exact'
  | 'kept_draft'
  | 'revised_draft'
  | 'insufficient_evidence'
  | 'review_unavailable';

export type HybridReviewConfidence = 'low' | 'medium' | 'high';

export interface HybridReviewEvidence {
  id: string;
  kind: 'dictionary' | 'example' | 'grammar';
  title: string;
  detail: string;
  sourceLabel: string;
  sourceUrl: string;
}

export type TranslationCacheState = 'hit' | 'miss' | 'coalesced' | 'disabled';

/** One word of a translation as read without seeing the English. */
export interface HybridWordReading {
  form: string;
  meaning: string;
  /** Other senses the records give the word. */
  otherMeanings?: string[];
  basis: 'dictionary' | 'grammar' | 'example' | 'name' | 'loanword' | 'unknown';
}

/** How the reading of a translation compares with what was meant. */
export interface HybridMeaningCheck {
  verdict: 'same' | 'close' | 'different';
  problems: string[];
  summary: string;
}

/** How the typed text was read before translating. */
export interface HybridSourceReading {
  language: string;
  /** The English used for translation, when it differs from what was typed. */
  englishText: string | null;
  corrections: string[];
}

export interface ControlledTranslationInference {
  contractId: string;
  constructionId: string;
  modelTemplate: string;
  dictionaryHeadword: string;
}

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
  controlled?: ControlledTranslationInference;
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
  controlled?: ControlledTranslationInference;
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
    reading: { words: HybridWordReading[]; meaning: string } | null;
    meaningCheck: HybridMeaningCheck | null;
  };
  source: HybridSourceReading | null;
  cache: {
    analysis: TranslationCacheState;
    draft: TranslationCacheState;
    evidence: TranslationCacheState;
    review: TranslationCacheState;
    reading: TranslationCacheState;
    resolved: TranslationCacheState;
  };
}
