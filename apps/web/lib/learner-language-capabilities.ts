export type SentenceGenerationStatus =
  | 'community_authorized'
  | 'research_only'
  | 'not_supported';

export interface LearnerLanguageCapability {
  languageCode: string;
  dictionaryLookup: 'available';
  sentenceGeneration: {
    status: SentenceGenerationStatus;
    label: string;
    detail: string;
    researchUrl?: string;
    evidenceUrl?: string;
  };
}

const CAPABILITIES: Record<string, LearnerLanguageCapability> = {
  kuku_yalanji: {
    languageCode: 'kuku_yalanji',
    dictionaryLookup: 'available',
    sentenceGeneration: {
      status: 'research_only',
      label: 'Research only',
      detail:
        'Current sentence models have not passed the linguistic and community authorization gates required for learner-facing use.',
      researchUrl: '/translate/v2',
      evidenceUrl:
        'https://huggingface.co/ajaxdavis/mobtranslate-kuku-yalanji-v24-3',
    },
  },
  migmaq: {
    languageCode: 'migmaq',
    dictionaryLookup: 'available',
    sentenceGeneration: {
      status: 'research_only',
      label: 'Research only',
      detail:
        "The Mi'gmaq v3.3 release explicitly does not authorize homepage routing or production API use.",
      researchUrl: '/labs/migmaq',
      evidenceUrl:
        'https://huggingface.co/ajaxdavis/mobtranslate-migmaq-listuguj-v3-3',
    },
  },
  anindilyakwa: {
    languageCode: 'anindilyakwa',
    dictionaryLookup: 'available',
    sentenceGeneration: {
      status: 'not_supported',
      label: 'Not available',
      detail:
        'No source-verified and community-authorized sentence system is documented for this collection.',
    },
  },
};

const DEFAULT_CAPABILITY: LearnerLanguageCapability = {
  languageCode: 'unknown',
  dictionaryLookup: 'available',
  sentenceGeneration: {
    status: 'not_supported',
    label: 'Not available',
    detail:
      'No source-verified and community-authorized sentence system is documented for this collection.',
  },
};

export function getLearnerLanguageCapability(
  languageCode: string,
): LearnerLanguageCapability {
  return (
    CAPABILITIES[languageCode] ?? {
      ...DEFAULT_CAPABILITY,
      languageCode,
    }
  );
}
