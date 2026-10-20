import type { HybridReviewEvidence } from './hybrid-translation-types';
import type { ControlledTranslationSpec } from './controlled-translation.server';
import {
  ANINDILYAKWA_HYBRID_IDENTITY,
  KUKU_YALANJI_HYBRID_IDENTITY,
  MIGMAQ_HYBRID_IDENTITY,
  WAJARRI_HYBRID_IDENTITY,
} from './hybrid-language-identities';

export const HYBRID_SPACE_ENDPOINT =
  'https://ajaxdavis-alpha-v0-historic.hf.space/v1/translate';
export const DEFAULT_HYBRID_REVIEW_MODEL = 'gpt-6-luna';

interface HybridContractVersions {
  draft: string;
  evidence: string;
  review: string;
  resolver: string;
}

interface HybridEnvironmentContract {
  enabled: string;
  endpoint: string;
  modelId: string;
  version: string;
  timeoutMs: string;
  reviewModel: string;
}

export interface HybridLanguageDefinition {
  languageCode: string;
  aliases: readonly string[];
  dictionaryCode: string;
  languageName: string;
  languageTag: string;
  sourceLang: 'eng_Latn';
  targetLang: string;
  modelId: string;
  modelVersion: string;
  modelLabel: string;
  repository: string;
  grammarEvidence: readonly HybridReviewEvidence[];
  reviewGuidance: readonly string[];
  controlledTranslation?: ControlledTranslationSpec;
  ordinaryDraftEnabled?: boolean;
  contracts: HybridContractVersions;
  env: HybridEnvironmentContract;
  legacyEnv?: Partial<HybridEnvironmentContract>;
}

export interface HybridLanguageContract extends HybridLanguageDefinition {
  endpoint: string;
  timeoutMs: number;
  reviewModelId: string;
}

// The draft now translates the analysed English, evidence adds meaning
// search and grammar records, the checker keeps documented forms, and the
// resolver shows an independent reading. Every language shares the pipeline.
const HYBRID_PIPELINE_CONTRACTS: HybridContractVersions = {
  draft: 'hybrid-hf-draft-v3-analysed-english',
  evidence: 'hybrid-form-and-meaning-retrieval-v5',
  review: 'hybrid-read-first-review-v14',
  resolver: 'hybrid-blind-reading-resolver-v6',
};

const KUKU_GRAMMAR_SOURCE =
  'https://mobtranslate.com/docs/grammar-cheatsheet.html';
const MIGMAQ_GRAMMAR_SOURCE = 'https://wiki.migmaq.org/index.php/Main_Page';
const MIGMAQ_LESSON_SOURCE =
  'https://github.com/FieldDB/migmaq-lessons/blob/c424e98c3d87c3890618fd63cdf5af7ad22b3009/data/master.xml';
const WAJARRI_GRAMMAR_SOURCE =
  'https://openresearch-repository.anu.edu.au/items/f1ee9d55-076a-4ee9-838e-823d480edb78';

export const KUKU_YALANJI_HYBRID_DEFINITION: HybridLanguageDefinition = {
  ...KUKU_YALANJI_HYBRID_IDENTITY,
  aliases: ['kuku_yalanji', 'kuku-yalanji'],
  dictionaryCode: 'kuku_yalanji',
  sourceLang: 'eng_Latn',
  targetLang: 'gvn_Latn',
  modelId: 'kuku-yalanji-nllb-lora',
  modelVersion: 'v24.3-joint-lexeme-dose29-s3598-20260715',
  modelLabel: 'MobTranslate Kuku Yalanji v24.3',
  repository:
    'https://huggingface.co/ajaxdavis/mobtranslate-kuku-yalanji-v24-3',
  contracts: HYBRID_PIPELINE_CONTRACTS,
  env: {
    enabled: 'MOBTRANSLATE_HYBRID_KUKU_YALANJI_ENABLED',
    endpoint: 'MOBTRANSLATE_HYBRID_KUKU_YALANJI_ENDPOINT',
    modelId: 'MOBTRANSLATE_HYBRID_KUKU_YALANJI_MODEL_ID',
    version: 'MOBTRANSLATE_HYBRID_KUKU_YALANJI_VERSION',
    timeoutMs: 'MOBTRANSLATE_HYBRID_KUKU_YALANJI_TIMEOUT_MS',
    reviewModel: 'MOBTRANSLATE_HYBRID_KUKU_YALANJI_REVIEW_MODEL',
  },
  legacyEnv: {
    enabled: 'MOBTRANSLATE_HOMEPAGE_KUKU_MODEL_ENABLED',
    endpoint: 'MOBTRANSLATE_TRANSLATE_V2_ENDPOINT',
    modelId: 'MOBTRANSLATE_TRANSLATE_V2_MODEL_ID',
    version: 'MOBTRANSLATE_TRANSLATE_V2_VERSION',
    timeoutMs: 'MOBTRANSLATE_TRANSLATE_V2_TIMEOUT_MS',
    reviewModel: 'MOBTRANSLATE_KUKU_REVIEW_MODEL',
  },
  reviewGuidance: [
    'Use elder-Patz surface orthography represented by the supplied evidence.',
    'Do not mix Yalanji and Nyungkul forms unless the supplied record explicitly supports that variety.',
  ],
  grammarEvidence: [
    {
      id: 'grammar-alignment',
      kind: 'grammar',
      title: 'Who is doing the action',
      detail:
        'Kuku Yalanji marks the doer differently when an action affects someone or something else. Preserve who acts and who is affected.',
      sourceLabel: 'Patz grammar, sections 3.2, 3.5 and 4.1.4',
      sourceUrl: KUKU_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-case-agreement',
      kind: 'grammar',
      title: 'Words that belong together',
      detail:
        'Words in the same noun phrase normally carry matching markings. Those markings can also show doer, affected participant, location, destination and recipient.',
      sourceLabel: 'Patz grammar, sections 4.1.1 and 4.1.4',
      sourceUrl: KUKU_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-vowel-harmony',
      kind: 'grammar',
      title: 'Vowels in word endings',
      detail:
        'Some endings change their vowel to match the word: final u selects u, while final a or i selects a.',
      sourceLabel: 'Patz grammar, section 2.5.1',
      sourceUrl: KUKU_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-verbs',
      kind: 'grammar',
      title: 'Verb endings',
      detail:
        'A verb ending can show who takes part, whether the action affects something else, and when or how it happens. Change an ending only when supplied evidence supports those meanings.',
      sourceLabel: 'Patz grammar, sections 3.8 and 4.1.3',
      sourceUrl: KUKU_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-meaning-checks',
      kind: 'grammar',
      title: 'Meaning checks',
      detail:
        'Preserve negation, questions, commands, participant reference and clause relationships. Word overlap cannot compensate for reversing one of these meanings.',
      sourceLabel: 'Patz grammar, chapters 4 and 5',
      sourceUrl: KUKU_GRAMMAR_SOURCE,
    },
  ],
};

export const MIGMAQ_HYBRID_DEFINITION: HybridLanguageDefinition = {
  ...MIGMAQ_HYBRID_IDENTITY,
  aliases: ['migmaq', 'mic'],
  dictionaryCode: 'migmaq',
  sourceLang: 'eng_Latn',
  targetLang: 'mic_Latn',
  modelId: 'migmaq-listuguj-nllb-lora',
  modelVersion: 'v3.3.0',
  modelLabel: "MobTranslate Mi'kmaq Listuguj v3.3",
  repository:
    'https://huggingface.co/ajaxdavis/mobtranslate-migmaq-listuguj-v3-3',
  contracts: HYBRID_PIPELINE_CONTRACTS,
  env: {
    enabled: 'MOBTRANSLATE_HYBRID_MIGMAQ_ENABLED',
    endpoint: 'MOBTRANSLATE_HYBRID_MIGMAQ_ENDPOINT',
    modelId: 'MOBTRANSLATE_HYBRID_MIGMAQ_MODEL_ID',
    version: 'MOBTRANSLATE_HYBRID_MIGMAQ_VERSION',
    timeoutMs: 'MOBTRANSLATE_HYBRID_MIGMAQ_TIMEOUT_MS',
    reviewModel: 'MOBTRANSLATE_HYBRID_MIGMAQ_REVIEW_MODEL',
  },
  legacyEnv: {
    enabled: 'MOBTRANSLATE_HOMEPAGE_MIGMAQ_MODEL_ENABLED',
    endpoint: 'MOBTRANSLATE_LABS_MIGMAQ_ENDPOINT',
    timeoutMs: 'MOBTRANSLATE_LABS_MIGMAQ_TIMEOUT_MS',
  },
  reviewGuidance: [
    'Keep contemporary Listuguj spelling from the supplied records, including meaningful apostrophes and hyphens.',
    "Do not silently normalize forms from another Mi'kmaq orthography into Listuguj spelling.",
    'Do not infer person, number, animacy or a verb form from an isolated dictionary headword.',
  ],
  grammarEvidence: [
    {
      id: 'grammar-listuguj-orthography',
      kind: 'grammar',
      title: 'Listuguj spelling',
      detail:
        'Preserve the apostrophes, hyphens and spelling found in the supplied Listuguj records. A visually similar form from another writing system is not interchangeable evidence.',
      sourceLabel: "Mi'gmaq Wiki working grammar and Listuguj lesson corpus",
      sourceUrl: MIGMAQ_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-participants',
      kind: 'grammar',
      title: 'People taking part',
      detail:
        "Mi'kmaq word forms can change with who acts, who is affected, person and number. A dictionary headword alone does not prove the form needed in a sentence.",
      sourceLabel: "Mi'gmaq Wiki working grammar",
      sourceUrl: MIGMAQ_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-animacy-number',
      kind: 'grammar',
      title: 'Number and noun class',
      detail:
        'Singular and plural forms are not selected from English spelling alone, and noun class can affect surrounding forms. Prefer an attested matching example over a guessed ending.',
      sourceLabel: "Listuguj lessons and Mi'gmaq alternate-form records",
      sourceUrl: MIGMAQ_LESSON_SOURCE,
    },
    {
      id: 'grammar-verbs',
      kind: 'grammar',
      title: 'Verb forms',
      detail:
        'Verb forms carry more information than an English dictionary label. Keep the first translation unless a supplied sentence pattern supports a particular change.',
      sourceLabel: "Mi'gmaq Wiki working grammar",
      sourceUrl: MIGMAQ_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-meaning-checks',
      kind: 'grammar',
      title: 'Meaning checks',
      detail:
        'Check questions, negation, kinship, person, number and participant roles explicitly. These were material error types in the model evaluation.',
      sourceLabel: 'MobTranslate v3.3 sealed qualitative analysis',
      sourceUrl:
        'https://huggingface.co/ajaxdavis/mobtranslate-migmaq-listuguj-v3-3/blob/v3.3.0/evaluation/sealed-qualitative-analysis.json',
    },
  ],
};

export const WAJARRI_HYBRID_DEFINITION: HybridLanguageDefinition = {
  ...WAJARRI_HYBRID_IDENTITY,
  aliases: ['wajarri', 'wbv'],
  dictionaryCode: 'wbv',
  sourceLang: 'eng_Latn',
  targetLang: 'wbv_Latn',
  modelId: 'mobtranslate-wajarri-v2',
  modelVersion:
    'v2.0-context-guarded-nr4-s17-context-recovery-r16-s20-20260731',
  modelLabel: 'MobTranslate Wajarri v2 research model',
  repository: 'https://huggingface.co/ajaxdavis/mobtranslate-wajarri-v2',
  contracts: HYBRID_PIPELINE_CONTRACTS,
  env: {
    enabled: 'MOBTRANSLATE_HYBRID_WAJARRI_ENABLED',
    endpoint: 'MOBTRANSLATE_HYBRID_WAJARRI_ENDPOINT',
    modelId: 'MOBTRANSLATE_HYBRID_WAJARRI_MODEL_ID',
    version: 'MOBTRANSLATE_HYBRID_WAJARRI_VERSION',
    timeoutMs: 'MOBTRANSLATE_HYBRID_WAJARRI_TIMEOUT_MS',
    reviewModel: 'MOBTRANSLATE_HYBRID_WAJARRI_REVIEW_MODEL',
  },
  reviewGuidance: [
    'Treat the first translation as an unverified research draft, not as fluent-speaker evidence.',
    'Use supplied dictionary records as primary evidence and do not treat a controlled synthetic example as natural-sentence validation.',
    'Keep confidence low when the supplied records do not support the complete sentence.',
    'Preserve exact supplied spelling and variety labels; do not silently replace historical Watjarri forms with current Wajarri forms.',
    'Do not invent case or verb endings from a dictionary stem. Require a supplied complete form or a matching attested pattern.',
  ],
  grammarEvidence: [
    {
      id: 'grammar-participant-case',
      kind: 'grammar',
      title: 'Who is doing what',
      detail:
        'Wajarri participant marking is not a word-for-word copy of English. Check who acts, who is affected, and whether the supplied evidence supports the required complete case form.',
      sourceLabel: 'Douglas, Watjarri, nominal and clause morphology',
      sourceUrl: WAJARRI_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-verbal-inflection',
      kind: 'grammar',
      title: 'Complete verb forms',
      detail:
        'Verb forms can encode conjugation class, tense, aspect and mood. Keep a model form unchanged unless a supplied example supports the replacement as a complete form in the same function.',
      sourceLabel: 'Douglas, Watjarri, verb morphology',
      sourceUrl: WAJARRI_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-order',
      kind: 'grammar',
      title: 'Sentence order',
      detail:
        'Clause order can vary with emphasis and context. Do not reorder a draft merely to mirror English; require evidence that the proposed order and participant markings belong together.',
      sourceLabel: 'Douglas, Watjarri, syntax and focus',
      sourceUrl: WAJARRI_GRAMMAR_SOURCE,
    },
    {
      id: 'grammar-variety-orthography',
      kind: 'grammar',
      title: 'Spelling and variety',
      detail:
        'The evidence contains historical and current source systems and more than one variety label. Preserve the spelling actually supported by the retrieved record and report conflicts instead of normalising them away.',
      sourceLabel: 'MobTranslate Wajarri source and model audit',
      sourceUrl: 'https://huggingface.co/ajaxdavis/mobtranslate-wajarri-v2',
    },
  ],
};

export const ANINDILYAKWA_HYBRID_DEFINITION: HybridLanguageDefinition = {
  ...ANINDILYAKWA_HYBRID_IDENTITY,
  aliases: ['anindilyakwa', 'aoi'],
  dictionaryCode: 'anindilyakwa',
  sourceLang: 'eng_Latn',
  targetLang: 'aoi_Latn',
  modelId: 'anindilyakwa-nllb-scripture-baseline',
  modelVersion: 'v0.2.0-traditional-owner-authorized-experimental',
  modelLabel: 'MobTranslate Anindilyakwa v0.2 failed-quality baseline',
  repository: 'https://huggingface.co/ajaxdavis/mobtranslate-anindilyakwa-v1',
  contracts: HYBRID_PIPELINE_CONTRACTS,
  env: {
    enabled: 'MOBTRANSLATE_HYBRID_ANINDILYAKWA_ENABLED',
    endpoint: 'MOBTRANSLATE_HYBRID_ANINDILYAKWA_ENDPOINT',
    modelId: 'MOBTRANSLATE_HYBRID_ANINDILYAKWA_MODEL_ID',
    version: 'MOBTRANSLATE_HYBRID_ANINDILYAKWA_VERSION',
    timeoutMs: 'MOBTRANSLATE_HYBRID_ANINDILYAKWA_TIMEOUT_MS',
    reviewModel: 'MOBTRANSLATE_HYBRID_ANINDILYAKWA_REVIEW_MODEL',
  },
  reviewGuidance: [
    'The first model failed its automatic quality diagnostic, so never treat repetition or fluent-looking text as proof of correctness.',
    'Use supplied dictionary records as primary evidence and describe all unsupported choices as unchecked.',
    'No qualified fluent-language review has validated this model; keep confidence low unless a unique exact dictionary record decides the answer.',
  ],
  grammarEvidence: [],
};

const DEFINITIONS = new Map(
  [
    KUKU_YALANJI_HYBRID_DEFINITION,
    MIGMAQ_HYBRID_DEFINITION,
    WAJARRI_HYBRID_DEFINITION,
    ANINDILYAKWA_HYBRID_DEFINITION,
  ].flatMap((definition) =>
    definition.aliases.map((alias) => [alias, definition] as const),
  ),
);

function envValue(
  env: NodeJS.ProcessEnv,
  primary: string,
  legacy?: string,
): string | undefined {
  return env[primary]?.trim() || (legacy ? env[legacy]?.trim() : undefined);
}

export function getHybridLanguageDefinition(
  languageCode: string,
): HybridLanguageDefinition | null {
  return DEFINITIONS.get(languageCode) ?? null;
}

export function loadHybridLanguageContract(
  languageCode: string,
  env: NodeJS.ProcessEnv = process.env,
): HybridLanguageContract | null {
  const definition = getHybridLanguageDefinition(languageCode);
  if (!definition) return null;
  const enabled = envValue(
    env,
    definition.env.enabled,
    definition.legacyEnv?.enabled,
  );
  if (enabled !== '1') return null;

  const timeoutValue = Number(
    envValue(env, definition.env.timeoutMs, definition.legacyEnv?.timeoutMs) ??
      env.MOBTRANSLATE_HYBRID_SPACE_TIMEOUT_MS ??
      170000,
  );
  return {
    ...definition,
    endpoint:
      envValue(env, definition.env.endpoint, definition.legacyEnv?.endpoint) ||
      env.MOBTRANSLATE_HYBRID_SPACE_ENDPOINT?.trim() ||
      HYBRID_SPACE_ENDPOINT,
    modelId:
      envValue(env, definition.env.modelId, definition.legacyEnv?.modelId) ||
      definition.modelId,
    modelVersion:
      envValue(env, definition.env.version, definition.legacyEnv?.version) ||
      definition.modelVersion,
    timeoutMs:
      Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 170000,
    reviewModelId:
      envValue(
        env,
        definition.env.reviewModel,
        definition.legacyEnv?.reviewModel,
      ) || DEFAULT_HYBRID_REVIEW_MODEL,
  };
}

export function listHybridLanguageDefinitions(): HybridLanguageDefinition[] {
  return [...new Set(DEFINITIONS.values())];
}
