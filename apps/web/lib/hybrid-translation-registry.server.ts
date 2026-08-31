import type { HybridReviewEvidence } from './hybrid-translation-types';
import type { ControlledTranslationSpec } from './controlled-translation.server';
import {
  KUKU_YALANJI_HYBRID_IDENTITY,
  MIGMAQ_HYBRID_IDENTITY,
  WAJARRI_HYBRID_IDENTITY,
} from './hybrid-language-identities';

export const HYBRID_SPACE_ENDPOINT =
  'https://ajaxdavis-alpha-v0-historic.hf.space/v1/translate';
export const DEFAULT_HYBRID_REVIEW_MODEL = 'gpt-5.4-mini-2026-03-17';

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

const KUKU_GRAMMAR_SOURCE =
  'https://mobtranslate.com/docs/grammar-cheatsheet.html';
const MIGMAQ_GRAMMAR_SOURCE = 'https://wiki.migmaq.org/index.php/Main_Page';
const MIGMAQ_LESSON_SOURCE =
  'https://github.com/FieldDB/migmaq-lessons/blob/c424e98c3d87c3890618fd63cdf5af7ad22b3009/data/master.xml';
const WAJARRI_GRAMMAR_SOURCE =
  'https://openresearch-repository.anu.edu.au/items/f1ee9d55-076a-4ee9-838e-823d480edb78';
const WAJARRI_DATASET_SOURCE =
  'https://huggingface.co/datasets/ajaxdavis/mobtranslate-wajarri-synthetic-corpus-v1/tree/302f3a93eb255a2fc70692b7c429ba5ee8300687';

export const KUKU_YALANJI_HYBRID_DEFINITION: HybridLanguageDefinition = {
  ...KUKU_YALANJI_HYBRID_IDENTITY,
  sourceLang: 'eng_Latn',
  targetLang: 'gvn_Latn',
  modelId: 'kuku-yalanji-nllb-lora',
  modelVersion: 'v24.3-joint-lexeme-dose29-s3598-20260715',
  modelLabel: 'MobTranslate Kuku Yalanji v24.3',
  repository:
    'https://huggingface.co/ajaxdavis/mobtranslate-kuku-yalanji-v24-3',
  contracts: {
    draft: 'hybrid-hf-draft-v2',
    evidence: 'hybrid-source-draft-retrieval-v3',
    review: 'hybrid-plain-language-review-v4',
    resolver: 'hybrid-conservative-resolver-v3',
  },
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
  sourceLang: 'eng_Latn',
  targetLang: 'mic_Latn',
  modelId: 'migmaq-listuguj-nllb-lora',
  modelVersion: 'v3.3.0',
  modelLabel: "MobTranslate Mi'kmaq Listuguj v3.3",
  repository:
    'https://huggingface.co/ajaxdavis/mobtranslate-migmaq-listuguj-v3-3',
  contracts: {
    draft: 'hybrid-hf-draft-v2',
    evidence: 'hybrid-source-draft-retrieval-v3',
    review: 'hybrid-plain-language-review-v4',
    resolver: 'hybrid-conservative-resolver-v3',
  },
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
  sourceLang: 'eng_Latn',
  targetLang: 'wbv_Latn',
  modelId: 'mobtranslate-wajarri-v3-controlled',
  modelVersion: 'v3.0.0-controlled-subject-slot-s17-step40-20260802',
  modelLabel: 'MobTranslate Wajarri v3 controlled',
  repository:
    'https://huggingface.co/ajaxdavis/mobtranslate-wajarri-v3-controlled',
  controlledTranslation: {
    contractId: 'wajarri-subject-slot-v3-s17-step40-20260802',
    task: 'subject_slot',
    slotToken: '<copy>',
    constructions: [
      {
        id: 'coming-towards-speaker',
        sourceTemplate: 'The <copy> is coming towards the speaker.',
        modelTemplate: '<copy> yanajimanha.',
      },
      {
        id: 'going-away-from-speaker',
        sourceTemplate: 'The <copy> is going away from the speaker.',
        modelTemplate: '<copy> yanmanha.',
      },
      {
        id: 'running',
        sourceTemplate: 'The <copy> is running.',
        modelTemplate: '<copy> jamarnimanha.',
      },
      {
        id: 'sitting-down',
        sourceTemplate: 'The <copy> is sitting down.',
        modelTemplate: '<copy> nyinarangamanha.',
      },
      {
        id: 'sitting',
        sourceTemplate: 'The <copy> is sitting.',
        modelTemplate: '<copy> nyinamanha.',
      },
      {
        id: 'standing',
        sourceTemplate: 'The <copy> is standing.',
        modelTemplate: '<copy> garrimanha.',
      },
    ],
  },
  ordinaryDraftEnabled: false,
  contracts: {
    draft: 'hybrid-hf-controlled-draft-v1',
    evidence: 'hybrid-source-draft-retrieval-v3',
    review: 'hybrid-plain-language-review-v4',
    resolver: 'hybrid-conservative-resolver-v3',
  },
  env: {
    enabled: 'MOBTRANSLATE_HYBRID_WAJARRI_ENABLED',
    endpoint: 'MOBTRANSLATE_HYBRID_WAJARRI_ENDPOINT',
    modelId: 'MOBTRANSLATE_HYBRID_WAJARRI_MODEL_ID',
    version: 'MOBTRANSLATE_HYBRID_WAJARRI_VERSION',
    timeoutMs: 'MOBTRANSLATE_HYBRID_WAJARRI_TIMEOUT_MS',
    reviewModel: 'MOBTRANSLATE_HYBRID_WAJARRI_REVIEW_MODEL',
  },
  reviewGuidance: [
    'Preserve exact supplied spelling and variety labels; do not silently replace historical Watjarri forms with current Wajarri forms.',
    'Do not invent case or verb endings from a dictionary stem. Require a supplied complete form or a matching attested pattern.',
    'Treat the controlled subject-predicate examples as bounded evidence, not a rule for unrestricted lexical substitution.',
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
      id: 'grammar-bounded-constructions',
      kind: 'grammar',
      title: 'Supported sentence patterns',
      detail:
        'The model accepts only six enumerated complete predicates and one exact dictionary-bound subject slot. It does not license generating new inflections or unrestricted sentence patterns.',
      sourceLabel: 'MobTranslate Wajarri controlled-synthetic release',
      sourceUrl: WAJARRI_DATASET_SOURCE,
    },
    {
      id: 'grammar-variety-orthography',
      kind: 'grammar',
      title: 'Spelling and variety',
      detail:
        'The evidence contains historical and current source systems and more than one variety label. Preserve the spelling actually supported by the retrieved record and report conflicts instead of normalising them away.',
      sourceLabel: 'MobTranslate Wajarri source and model audit',
      sourceUrl:
        'https://huggingface.co/ajaxdavis/mobtranslate-wajarri-v3-controlled',
    },
  ],
};

const LANGUAGE_DEFINITIONS: readonly HybridLanguageDefinition[] = [
  KUKU_YALANJI_HYBRID_DEFINITION,
  MIGMAQ_HYBRID_DEFINITION,
  WAJARRI_HYBRID_DEFINITION,
];

const DEFINITIONS = new Map<string, HybridLanguageDefinition>(
  LANGUAGE_DEFINITIONS.flatMap((definition) =>
    [...new Set([definition.languageCode, definition.dictionaryCode])].map(
      (code) => [code, definition] as const,
    ),
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
  return [...LANGUAGE_DEFINITIONS];
}
