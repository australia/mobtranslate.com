import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  HybridModelResultSchema,
  translateWithHybridModel,
  type HybridModelResult,
} from './hybrid-model-inference.server';
import type { HybridLanguageContract } from './hybrid-translation-registry.server';
import {
  HYBRID_REVIEW_SYSTEM,
  HybridReviewToolSchema,
  ResolvedHybridReviewSchema,
  createHybridReviewPrompt,
  rankSourceDictionaryEntries,
  resolveExactHybridMatch,
  resolveHybridReview,
  sameSurface,
  type HybridReviewAttempt,
  type HybridReviewReadingInput,
  type ResolvedHybridReview,
} from './hybrid-translation.server';
import {
  BLIND_READING_SYSTEM,
  BlindReadingSchema,
  MEANING_CHECK_SYSTEM,
  MeaningCheckSchema,
  attemptRank,
  createBlindReadingPrompt,
  createMeaningCheckPrompt,
  needsRepair,
  type BlindReading,
  type MeaningCheck,
} from './hybrid-reading.server';
import {
  SOURCE_ANALYSIS_SYSTEM,
  SourceAnalysisSchema,
  createSourceAnalysisPrompt,
  fallbackSourceAnalysis,
  type SourceAnalysis,
} from './hybrid-source-analysis.server';
import { runStructuredCall, type StructuredReasoningEffort } from './hybrid-llm.server';
import { ApiBudgetUnavailableError, ApiRateLimitError } from './api-rate-limit.server';
import {
  TRANSLATION_CACHE_TTL,
  withTranslationCache,
  type TranslationCacheResult,
  type TranslationCacheState,
} from './translation-pipeline-cache.server';
import { safeTranslationErrorDiagnostic } from './translation-service-error.server';
import type { Dictionary } from './translation-dictionary.server';
import { embedTexts, EVIDENCE_EMBEDDING_MODEL } from './translation-evidence/embeddings.server';
import { formLookupKeys, normalizeForm, surfaceTokens } from './translation-evidence/forms';
import {
  loadEvidenceIndex,
  searchEvidenceIndex,
  type LoadedEvidenceIndex,
  type SemanticQuota,
} from './translation-evidence/index-store.server';
import {
  assembleEvidencePack,
  buildFormIndex,
  type EvidencePack,
  type EvidenceQuery,
  type FormIndex,
  type IndexedEvidenceUnit,
} from './translation-evidence/retrieve';
import { dictionaryWordUrl } from './translation-evidence/units';

/**
 * The hybrid translator, stage by stage:
 *
 *   0. analysis  – read the input: English for the draft model, every idea
 *   1. draft     – the fine-tuned Hugging Face model translates the English
 *   2. evidence  – records for each draft word (by written form) and for
 *                  each idea (by meaning)
 *   3. review    – the checker keeps or repairs the draft against the records
 *   4. reading   – a reader who never sees the English reads the result
 *   5. meaning   – the reading is compared with what was meant; one repair
 *                  round runs when they disagree
 *   6. resolve   – the best attempt becomes the public result
 *
 * Every stage is cached by its inputs, so the homepage's separate draft and
 * review requests never repeat work.
 */

export const REVIEW_MAX_OUTPUT_TOKENS = 16000;

/**
 * Reasoning effort for the checker, overridable for tuning with
 * MOBTRANSLATE_HYBRID_REVIEW_EFFORT (low | medium | high). Low is the
 * default (owner decision, 2026-10-20, with gpt-6-luna) to keep checks fast.
 * A deeper setting falls back to low when it runs long, so a checked answer
 * still arrives in time.
 */
const EFFORT_STEPS: StructuredReasoningEffort[] = ['low', 'medium', 'high'];
function reviewEffort(env: NodeJS.ProcessEnv = process.env): {
  primary: StructuredReasoningEffort;
  fallback: StructuredReasoningEffort | undefined;
} {
  const configured = env.MOBTRANSLATE_HYBRID_REVIEW_EFFORT?.trim() as StructuredReasoningEffort | undefined;
  const primary = configured && EFFORT_STEPS.includes(configured) ? configured : 'low';
  return { primary, fallback: primary === 'low' ? undefined : 'low' };
}
const REVIEW_EFFORT = reviewEffort();

const ANALYSIS_CONTRACT = 'hybrid-source-analysis-v6-understood';
const READING_CONTRACT = 'hybrid-blind-reading-v7-one-sense';
const MEANING_CONTRACT = 'hybrid-meaning-check-v8-senses';
const REPAIR_CONTRACT = 'hybrid-repair-review-v5';

/** Rate-limit and budget refusals must reach the caller, never be swallowed. */
function isGuardError(error: unknown): boolean {
  return error instanceof ApiRateLimitError || error instanceof ApiBudgetUnavailableError;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Charge a provider budget at most once, however many calls a run makes. */
export function chargeOnce(charge: () => Promise<void>): () => Promise<void> {
  let charged: Promise<void> | null = null;
  return () => {
    charged ??= charge();
    return charged;
  };
}

// ---------------------------------------------------------------------------
// Stage 0: analysis
// ---------------------------------------------------------------------------

const CachedAnalysisSchema = z.object({
  analysis: SourceAnalysisSchema.omit({ englishText: true }),
  /** Null when the English is the typed text, which the cache never stores. */
  englishText: z.string().nullable(),
});

export async function getCachedSourceAnalysis(
  text: string,
  contract: HybridLanguageContract,
  beforeCompute: () => Promise<void>,
): Promise<{ value: SourceAnalysis; state: TranslationCacheState; degraded: boolean }> {
  try {
    const result = await withTranslationCache({
      descriptor: {
        stage: 'hybrid_source_analysis',
        languageCode: contract.languageCode,
        source: text,
        modelId: 'openai',
        modelVersion: contract.reviewModelId,
        contractVersion: ANALYSIS_CONTRACT,
      },
      schema: CachedAnalysisSchema,
      ttlMs: TRANSLATION_CACHE_TTL.review,
      negativeTtlMs: TRANSLATION_CACHE_TTL.transientError,
      beforeCompute,
      compute: async () => {
        const { value } = await runStructuredCall({
          modelId: contract.reviewModelId,
          system: SOURCE_ANALYSIS_SYSTEM,
          prompt: createSourceAnalysisPrompt(contract.languageName, text),
          toolName: 'submitSourceAnalysis',
          toolDescription: 'Submit the language, the English for translation, corrections and the list of ideas.',
          schema: SourceAnalysisSchema,
          reasoningEffort: 'low',
          maxOutputTokens: 6000,
          timeoutMs: 45000,
        });
        // The cache deliberately keeps no raw source text: an unchanged
        // English text is restored from the request instead of stored.
        const { englishText, ...rest } = value;
        return {
          analysis: rest,
          englishText: englishText.trim() === text.trim() ? null : englishText,
        };
      },
    });
    const analysis = {
      ...result.value.analysis,
      englishText: result.value.englishText ?? text.trim(),
    };
    return { value: analysis, state: result.state, degraded: false };
  } catch (error) {
    if (isGuardError(error)) throw error;
    console.error(
      `${contract.languageName} source analysis failed; translating the text as typed:`,
      safeTranslationErrorDiagnostic(error),
    );
    return { value: fallbackSourceAnalysis(text), state: 'disabled', degraded: true };
  }
}

// ---------------------------------------------------------------------------
// Stage 1: draft
// ---------------------------------------------------------------------------

export function getCachedHybridDraft(
  englishText: string,
  contract: HybridLanguageContract,
  beforeCompute: () => Promise<void>,
): Promise<TranslationCacheResult<HybridModelResult>> {
  return withTranslationCache({
    descriptor: {
      stage: 'hybrid_hf_draft',
      languageCode: contract.languageCode,
      source: englishText,
      modelId: contract.modelId,
      modelVersion: contract.modelVersion,
      contractVersion: contract.contracts.draft,
    },
    schema: HybridModelResultSchema,
    ttlMs: TRANSLATION_CACHE_TTL.draft,
    negativeTtlMs: TRANSLATION_CACHE_TTL.transientError,
    beforeCompute,
    compute: () => translateWithHybridModel(englishText, contract),
  });
}

// ---------------------------------------------------------------------------
// Stage 2: evidence
// ---------------------------------------------------------------------------

const QUOTA_PER_IDEA: SemanticQuota[] = [
  { kind: 'dictionary', limit: 3 },
  { kind: 'grammar_form', limit: 2 },
  { kind: 'example', limit: 2 },
  { kind: 'grammar', limit: 1 },
];

const QUOTA_FOR_SOURCE: SemanticQuota[] = [
  { kind: 'dictionary', limit: 5 },
  { kind: 'grammar_form', limit: 2 },
  { kind: 'example', limit: 2 },
  { kind: 'grammar', limit: 2 },
];

interface EvidenceSource {
  revision: string | null;
  index: LoadedEvidenceIndex | null;
  units: ReadonlyMap<string, IndexedEvidenceUnit>;
  formIndex: FormIndex;
}

const formIndexCache = new WeakMap<object, FormIndex>();
const dictionaryUnitCache = new WeakMap<Dictionary, ReadonlyMap<string, IndexedEvidenceUnit>>();

/** Dictionary-only units, used when no evidence index has been built. */
function dictionaryUnits(dictionary: Dictionary): ReadonlyMap<string, IndexedEvidenceUnit> {
  const cached = dictionaryUnitCache.get(dictionary);
  if (cached) return cached;
  const units = new Map<string, IndexedEvidenceUnit>();
  for (const entry of dictionary.words) {
    const key = `dictionary:${normalizeForm(entry.word)}`;
    units.set(key, {
      key,
      kind: 'dictionary',
      title: entry.word,
      body: entry.gloss,
      sourceLabel: `${dictionary.meta.name} dictionary entry`,
      sourceUrl: dictionaryWordUrl(dictionary.meta.code, entry.word),
      targetForms: surfaceTokens(entry.word).flatMap((token) => formLookupKeys(token)),
      pinned: false,
    });
  }
  dictionaryUnitCache.set(dictionary, units);
  return units;
}

async function evidenceSource(dictionary: Dictionary): Promise<EvidenceSource> {
  let index: LoadedEvidenceIndex | null = null;
  try {
    index = await loadEvidenceIndex(dictionary.meta.code);
  } catch (error) {
    console.error(
      'Evidence index unavailable; using dictionary records only:',
      safeTranslationErrorDiagnostic(error),
    );
  }
  const units = index?.units ?? dictionaryUnits(dictionary);
  let formIndex = formIndexCache.get(units);
  if (!formIndex) {
    formIndex = buildFormIndex(units.values());
    formIndexCache.set(units, formIndex);
  }
  return { revision: index?.revision ?? null, index, units, formIndex };
}

export function evidenceQueries(analysis: SourceAnalysis): EvidenceQuery[] {
  const queries: EvidenceQuery[] = [{ text: analysis.englishText, origin: 'source' }];
  const seen = new Set([analysis.englishText.toLocaleLowerCase()]);
  for (const idea of analysis.ideas) {
    // Names are kept as written; searching records for them adds noise.
    if (idea.kind === 'name') continue;
    const key = idea.english.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push({ text: idea.english, origin: 'idea' });
  }
  return queries.slice(0, 14);
}

const PackedEvidenceSchema = z.object({
  id: z.string(),
  kind: z.enum(['dictionary', 'example', 'grammar']),
  title: z.string(),
  detail: z.string(),
  sourceLabel: z.string(),
  sourceUrl: z.string(),
  unitKey: z.string(),
  unitKind: z.enum(['dictionary', 'example', 'grammar', 'grammar_form']),
  matchedIdeas: z.array(z.string()),
  matchedWords: z.array(z.string()),
});

export const EvidencePackSchema = z.object({
  items: z.array(PackedEvidenceSchema),
  guide: z.array(PackedEvidenceSchema),
  words: z.array(
    z.object({
      form: z.string(),
      status: z.enum(['recorded', 'documented_form', 'stem_known', 'not_found']),
      stem: z.string().nullable(),
      ending: z.string().nullable(),
      evidenceIds: z.array(z.string()),
    }),
  ),
});

async function semanticHitsFor(
  source: EvidenceSource,
  queries: readonly EvidenceQuery[],
  beforeCompute: () => Promise<void>,
) {
  if (!source.index || queries.length === 0) return [];
  if (source.index.embeddingModel !== EVIDENCE_EMBEDDING_MODEL) return [];
  try {
    await beforeCompute();
    const vectors = await embedTexts(
      queries.map((query) => query.text),
      { signal: AbortSignal.timeout(20000) },
    );
    const usable = vectors.map((vector, index) => ({ vector, index }));
    if (usable.some((item) => !item.vector)) return [];
    // Each query gets its own quota set; the source query gets a larger one.
    const [sourceHits, ideaHits] = await Promise.all([
      searchEvidenceIndex(source.index.languageCode, [vectors[0]!], QUOTA_FOR_SOURCE),
      vectors.length > 1
        ? searchEvidenceIndex(
            source.index.languageCode,
            vectors.slice(1) as number[][],
            QUOTA_PER_IDEA,
          )
        : Promise.resolve([]),
    ]);
    return [
      ...sourceHits,
      ...ideaHits.map((hit) => ({ ...hit, queryIndex: hit.queryIndex + 1 })),
    ];
  } catch (error) {
    if (isGuardError(error)) throw error;
    console.error(
      'Meaning search failed; using written-form and English-word evidence only:',
      safeTranslationErrorDiagnostic(error),
    );
    return [];
  }
}

export async function getCachedEvidencePack(
  dictionary: Dictionary,
  contract: HybridLanguageContract,
  analysis: SourceAnalysis,
  draft: string,
  beforeCompute: () => Promise<void>,
): Promise<TranslationCacheResult<EvidencePack>> {
  const source = await evidenceSource(dictionary);
  const queries = evidenceQueries(analysis);
  return withTranslationCache({
    descriptor: {
      stage: 'hybrid_dictionary_evidence',
      languageCode: contract.languageCode,
      source: analysis.englishText,
      dictionaryFingerprint: dictionary.revision,
      modelId: 'mobtranslate-evidence-retriever',
      modelVersion: `${source.revision ?? 'dictionary-only'}:${sha256(draft)}`,
      contractVersion: `${contract.contracts.evidence}:${sha256(queries)}`,
    },
    schema: EvidencePackSchema,
    ttlMs: TRANSLATION_CACHE_TTL.evidence,
    compute: async () =>
      assembleEvidencePack({
        units: source.units,
        formIndex: source.formIndex,
        lookupText: draft,
        queries,
        semanticHits: await semanticHitsFor(source, queries, beforeCompute),
        lexicalKeys: rankSourceDictionaryEntries(
          analysis.englishText,
          dictionary.words,
        ).map((entry) => `dictionary:${normalizeForm(entry.word)}`),
      }),
  });
}

/** Records for the words of a finished translation only (no English used). */
async function readingEvidencePack(
  dictionary: Dictionary,
  translation: string,
): Promise<EvidencePack> {
  const source = await evidenceSource(dictionary);
  return assembleEvidencePack({
    units: source.units,
    formIndex: source.formIndex,
    lookupText: translation,
    queries: [],
    semanticHits: [],
  });
}

// ---------------------------------------------------------------------------
// Stages 3–6: review, reading, meaning check, repair, resolve
// ---------------------------------------------------------------------------

const CachedReviewSchema = z.object({
  review: HybridReviewToolSchema,
  latencyMs: z.number().nonnegative(),
});
const CachedReadingSchema = z.object({ reading: BlindReadingSchema });
const CachedMeaningSchema = z.object({ check: MeaningCheckSchema });
const CachedResolvedSchema = z.object({
  reviewed: ResolvedHybridReviewSchema,
  reviewLatencyMs: z.number().nonnegative(),
  repaired: z.boolean(),
});

interface PipelineContext {
  text: string;
  analysis: SourceAnalysis;
  dictionary: Dictionary;
  contract: HybridLanguageContract;
  draft: HybridModelResult;
  pack: EvidencePack;
  packFingerprint: string;
  beforeCompute: () => Promise<void>;
  /** Wall-clock time (ms) by which the run must be finished, if any. */
  deadlineAt: number | null;
}

function timeLeft(context: PipelineContext): number {
  return context.deadlineAt === null ? Number.POSITIVE_INFINITY : context.deadlineAt - Date.now();
}

/** A call's timeout: its own maximum, less what later steps need. */
function callTimeout(context: PipelineContext, maximum: number, reserve: number): number {
  return Math.min(maximum, timeLeft(context) - reserve);
}

// Time a repair round (review, reading, meaning check) needs to finish.
const REPAIR_MINIMUM_MS = 80_000;

/** A translation together with its independent reading and meaning check. */
interface ReadTranslation {
  translation: string;
  reading: BlindReading;
  check: MeaningCheck;
}

function readingFeedback(
  of: HybridReviewReadingInput['of'],
  read: ReadTranslation | null,
): HybridReviewReadingInput | null {
  return read
    ? {
        of,
        translation: read.translation,
        readingMeaning: read.reading.plainMeaning,
        problems: read.check.problems.map((problem) => problem.detail),
      }
    : null;
}

async function reviewAttempt(
  context: PipelineContext,
  feedback: HybridReviewReadingInput | null,
) {
  const { contract } = context;
  const repair = feedback?.of === 'previous_attempt';
  return withTranslationCache({
    descriptor: {
      stage: repair ? 'hybrid_llm_review_repair' : 'hybrid_llm_review',
      languageCode: contract.languageCode,
      source: context.text,
      dictionaryFingerprint: context.dictionary.revision,
      modelId: 'openai',
      modelVersion: contract.reviewModelId,
      contractVersion: [
        contract.contracts.review,
        `effort-${REVIEW_EFFORT.primary}`,
        sha256(context.analysis),
        sha256(context.draft.translation),
        context.packFingerprint,
        ...(repair ? [REPAIR_CONTRACT] : []),
        sha256(feedback),
      ].join(':'),
    },
    schema: CachedReviewSchema,
    ttlMs: TRANSLATION_CACHE_TTL.review,
    negativeTtlMs: TRANSLATION_CACHE_TTL.transientError,
    beforeCompute: context.beforeCompute,
    compute: async () => {
      const timeoutMs = callTimeout(context, 120_000, 25_000);
      if (timeoutMs < 20_000) {
        throw new Error('Not enough time is left to check this translation.');
      }
      const { value, latencyMs } = await runStructuredCall({
        modelId: contract.reviewModelId,
        system: HYBRID_REVIEW_SYSTEM(contract.languageName),
        prompt: createHybridReviewPrompt(
          contract,
          {
            source: context.text,
            analysis: context.analysis,
            draft: context.draft.translation,
            draftModelId: context.draft.modelId,
            draftVersion: context.draft.model,
          },
          context.pack,
          feedback,
        ),
        toolName: 'submitReview',
        toolDescription:
          'Submit the final translation, each word with its meaning and support, which ideas it carries, and a short public explanation.',
        schema: HybridReviewToolSchema,
        reasoningEffort: REVIEW_EFFORT.primary,
        fallbackReasoningEffort: REVIEW_EFFORT.fallback,
        // Deep reasoning gets most of the time; if it runs long, a lighter
        // pass still returns a checked result inside the route's limit.
        primaryTimeoutMs: Math.max(10_000, Math.min(60_000, timeoutMs - 30_000)),
        maxOutputTokens: REVIEW_MAX_OUTPUT_TOKENS,
        timeoutMs,
      });
      return { review: value, latencyMs };
    },
  });
}

async function blindReading(
  context: PipelineContext,
  translation: string,
): Promise<{ reading: BlindReading | null; state: TranslationCacheState }> {
  if (!translation.trim()) return { reading: null, state: 'disabled' };
  const { contract } = context;
  const timeoutMs = callTimeout(context, 60_000, 8_000);
  if (timeoutMs < 8_000) return { reading: null, state: 'disabled' };
  try {
    const pack = await readingEvidencePack(context.dictionary, translation);
    const result = await withTranslationCache({
      descriptor: {
        stage: 'hybrid_blind_reading',
        languageCode: contract.languageCode,
        // Keyed by the translation only: the reader never sees the English.
        source: translation,
        dictionaryFingerprint: context.dictionary.revision,
        modelId: 'openai',
        modelVersion: contract.reviewModelId,
        contractVersion: `${READING_CONTRACT}:${sha256(pack)}`,
      },
      schema: CachedReadingSchema,
      ttlMs: TRANSLATION_CACHE_TTL.review,
      negativeTtlMs: TRANSLATION_CACHE_TTL.transientError,
      beforeCompute: context.beforeCompute,
      compute: async () => {
        const { value } = await runStructuredCall({
          modelId: contract.reviewModelId,
          system: BLIND_READING_SYSTEM(contract.languageName),
          prompt: createBlindReadingPrompt(contract, translation, pack),
          toolName: 'submitReading',
          toolDescription: 'Submit the word-by-word reading and the plain meaning.',
          schema: BlindReadingSchema,
          reasoningEffort: 'low',
          maxOutputTokens: 10000,
          timeoutMs,
        });
        return { reading: value };
      },
    });
    return { reading: result.value.reading, state: result.state };
  } catch (error) {
    if (isGuardError(error)) throw error;
    console.error(
      `${contract.languageName} independent reading failed:`,
      safeTranslationErrorDiagnostic(error),
    );
    return { reading: null, state: 'disabled' };
  }
}

async function meaningCheck(
  context: PipelineContext,
  reading: BlindReading | null,
): Promise<MeaningCheck | null> {
  if (!reading) return null;
  const { contract } = context;
  const timeoutMs = callTimeout(context, 45_000, 2_000);
  if (timeoutMs < 5_000) return null;
  try {
    const result = await withTranslationCache({
      descriptor: {
        stage: 'hybrid_meaning_check',
        languageCode: contract.languageCode,
        source: context.text,
        modelId: 'openai',
        modelVersion: contract.reviewModelId,
        contractVersion: `${MEANING_CONTRACT}:${sha256(context.analysis)}:${sha256(reading)}`,
      },
      schema: CachedMeaningSchema,
      ttlMs: TRANSLATION_CACHE_TTL.review,
      negativeTtlMs: TRANSLATION_CACHE_TTL.transientError,
      beforeCompute: context.beforeCompute,
      compute: async () => {
        const { value } = await runStructuredCall({
          modelId: contract.reviewModelId,
          system: MEANING_CHECK_SYSTEM,
          prompt: createMeaningCheckPrompt(context.analysis, reading),
          toolName: 'submitMeaningCheck',
          toolDescription: 'Submit the verdict, the problems found and a one-sentence summary.',
          schema: MeaningCheckSchema,
          reasoningEffort: 'low',
          maxOutputTokens: 8000,
          timeoutMs,
        });
        return { check: value };
      },
    });
    return result.value.check;
  } catch (error) {
    if (isGuardError(error)) throw error;
    console.error(
      `${contract.languageName} meaning check failed:`,
      safeTranslationErrorDiagnostic(error),
    );
    return null;
  }
}

/** The independent reading of a translation and, when it exists, its meaning check. */
async function readAndCheck(
  context: PipelineContext,
  translation: string,
): Promise<{
  read: ReadTranslation | null;
  reading: BlindReading | null;
  state: TranslationCacheState;
}> {
  const { reading, state } = await blindReading(context, translation);
  const check = await meaningCheck(context, reading);
  return {
    read: reading && check ? { translation, reading, check } : null,
    reading,
    state,
  };
}

function better(
  left: HybridReviewAttempt,
  right: HybridReviewAttempt,
): HybridReviewAttempt {
  const [leftVerdict, leftProblems] = attemptRank(left.check);
  const [rightVerdict, rightProblems] = attemptRank(right.check);
  if (rightVerdict !== leftVerdict) return rightVerdict < leftVerdict ? right : left;
  return rightProblems < leftProblems ? right : left;
}

export interface HybridPipelineInput {
  text: string;
  analysis: SourceAnalysis;
  dictionary: Dictionary;
  contract: HybridLanguageContract;
  draft: HybridModelResult;
  beforeCompute: () => Promise<void>;
  /** Wall-clock time (ms) by which the run must finish; none for replays. */
  deadlineAt?: number;
}

export interface HybridPipelineResult {
  reviewed: ResolvedHybridReview;
  reviewLatencyMs: number;
  repaired: boolean;
  cache: {
    evidence: TranslationCacheState;
    review: TranslationCacheState;
    reading: TranslationCacheState;
    resolved: TranslationCacheState;
  };
}

export async function runHybridReviewPipeline(
  input: HybridPipelineInput,
): Promise<HybridPipelineResult> {
  const { text, analysis, dictionary, contract, draft, beforeCompute } = input;
  const evidence = await getCachedEvidencePack(
    dictionary,
    contract,
    analysis,
    draft.translation,
    beforeCompute,
  );
  const exact = resolveExactHybridMatch(
    contract,
    text,
    analysis,
    draft.translation,
    dictionary.words,
  );
  if (exact) {
    return {
      reviewed: exact,
      reviewLatencyMs: 0,
      repaired: false,
      cache: { evidence: evidence.state, review: 'disabled', reading: 'disabled', resolved: 'disabled' },
    };
  }

  const context: PipelineContext = {
    text,
    analysis,
    dictionary,
    contract,
    draft,
    pack: evidence.value,
    packFingerprint: sha256(evidence.value),
    beforeCompute,
    deadlineAt: input.deadlineAt ?? null,
  };
  let reviewState: TranslationCacheState = 'hit';
  let readingState: TranslationCacheState = 'hit';

  const resolved = await withTranslationCache({
    descriptor: {
      stage: 'hybrid_resolved_translation',
      languageCode: contract.languageCode,
      source: text,
      dictionaryFingerprint: dictionary.revision,
      modelId: 'mobtranslate-hybrid-resolver',
      modelVersion: `${contract.modelVersion}:${contract.reviewModelId}`,
      contractVersion: [
        contract.contracts.resolver,
        contract.contracts.review,
        `effort-${REVIEW_EFFORT.primary}`,
        contract.contracts.evidence,
        contract.contracts.draft,
        ANALYSIS_CONTRACT,
        READING_CONTRACT,
        MEANING_CONTRACT,
        REPAIR_CONTRACT,
        sha256(analysis),
        sha256(draft.translation),
        context.packFingerprint,
      ].join(':'),
    },
    schema: CachedResolvedSchema,
    ttlMs: TRANSLATION_CACHE_TTL.resolved,
    compute: async () => {
      // Read the first translation before checking it, so the checker knows
      // what its words actually say, not only what they were meant to say.
      const draftRead = await readAndCheck(context, draft.translation);

      const first = await reviewAttempt(
        context,
        readingFeedback('first_translation', draftRead.read),
      );
      reviewState = first.state;
      const firstRead = sameSurface(first.value.review.translation, draft.translation)
        ? draftRead
        : await readAndCheck(context, first.value.review.translation);
      readingState = firstRead.state;
      const firstAttempt: HybridReviewAttempt = {
        review: first.value.review,
        reading: firstRead.read?.reading ?? firstRead.reading,
        check: firstRead.read?.check ?? null,
      };
      let chosen = firstAttempt;
      let latency = first.value.latencyMs;
      let repaired = false;

      if (
        firstRead.read &&
        firstAttempt.review.decision !== 'cannot_translate' &&
        needsRepair(firstRead.read.check) &&
        timeLeft(context) >= REPAIR_MINIMUM_MS
      ) {
        try {
          const second = await reviewAttempt(
            context,
            readingFeedback('previous_attempt', firstRead.read),
          );
          latency += second.value.latencyMs;
          const secondRead = await readAndCheck(context, second.value.review.translation);
          const secondAttempt: HybridReviewAttempt = {
            review: second.value.review,
            reading: secondRead.read?.reading ?? secondRead.reading,
            check: secondRead.read?.check ?? null,
          };
          chosen = better(firstAttempt, secondAttempt);
          repaired = chosen === secondAttempt;
        } catch (error) {
          if (isGuardError(error)) throw error;
          console.error(
            `${contract.languageName} repair attempt failed; keeping the first check:`,
            safeTranslationErrorDiagnostic(error),
          );
        }
      }

      return {
        reviewed: resolveHybridReview(
          contract,
          text,
          analysis,
          draft.translation,
          context.pack,
          chosen,
        ),
        reviewLatencyMs: latency,
        repaired,
      };
    },
  });

  return {
    reviewed: resolved.value.reviewed,
    reviewLatencyMs: resolved.value.reviewLatencyMs,
    repaired: resolved.value.repaired,
    cache: {
      evidence: evidence.state,
      review: resolved.state === 'hit' ? 'hit' : reviewState,
      reading: resolved.state === 'hit' ? 'hit' : readingState,
      resolved: resolved.state,
    },
  };
}
