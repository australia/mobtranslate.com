export type PublicTranslationRoute =
  | 'unavailable'
  | 'dictionary_prompt'
  | 'hybrid_review'
  | 'dictionary_reverse_review';

export interface TranslationReleasePolicy {
  policyId: string;
  languageCode: string;
  dictionaryCode: string;
  aliases: readonly string[];
  programId: string;
  forwardRoute: PublicTranslationRoute;
  reverseRoute: PublicTranslationRoute;
  publicDictionaryLookupEnabled: boolean;
  publicModelInferenceEnabled: boolean;
  genericModelFallbackEnabled: boolean;
  answerScope: 'dictionary_and_unverified_research_preview' | 'unavailable';
  dictionaryEdition: string;
  evidenceAudit: {
    reportId: string;
    sha256: string;
  };
  corpusReadiness?: {
    reportId: string;
    sha256: string;
  };
  permissionAttestationSha256?: string;
  unsupportedStatus: 422;
  unsupportedMessage: string;
}

const KUKU_YALANJI_POLICY: TranslationReleasePolicy = Object.freeze({
  policyId: 'kuku-yalanji-live-answer-policy-v1.1.0',
  languageCode: 'kuku_yalanji',
  dictionaryCode: 'kuku_yalanji',
  aliases: Object.freeze(['kuku_yalanji', 'kuku-yalanji']),
  programId: 'kuku-yalanji-v24',
  forwardRoute: 'hybrid_review',
  reverseRoute: 'dictionary_reverse_review',
  publicDictionaryLookupEnabled: true,
  publicModelInferenceEnabled: true,
  genericModelFallbackEnabled: true,
  answerScope: 'dictionary_and_unverified_research_preview',
  dictionaryEdition: 'kuku-yalanji-source-dictionary-2026-08-30',
  evidenceAudit: Object.freeze({
    reportId: 'kuku-yalanji-live-translation-audit-2026-08-30',
    sha256: '21a5030eef97b8637e0684c691a4f6c813e0cd3da13ceda2ec06957636e49547',
  }),
  unsupportedStatus: 422,
  unsupportedMessage:
    'Kuku Yalanji translation is temporarily unavailable. Please try again shortly.',
});

const WAJARRI_POLICY: TranslationReleasePolicy = Object.freeze({
  policyId: 'wajarri-live-answer-policy-v1.1.0',
  languageCode: 'wajarri',
  dictionaryCode: 'wbv',
  aliases: Object.freeze(['wajarri', 'wbv']),
  programId: 'wajarri-v3',
  forwardRoute: 'dictionary_prompt',
  reverseRoute: 'dictionary_reverse_review',
  publicDictionaryLookupEnabled: true,
  publicModelInferenceEnabled: true,
  genericModelFallbackEnabled: true,
  answerScope: 'dictionary_and_unverified_research_preview',
  dictionaryEdition: 'wajarri-source-backed-lexical-layer-2026-08-30',
  evidenceAudit: Object.freeze({
    reportId: 'wajarri-live-translation-audit-2026-08-30',
    sha256: '58aa7823458541d75131e37f0f270508c27277b09f3910c52a1cc834293184e4',
  }),
  unsupportedStatus: 422,
  unsupportedMessage:
    'Wajarri translation is temporarily unavailable. Please try again shortly.',
});

const ANINDILYAKWA_POLICY: TranslationReleasePolicy = Object.freeze({
  policyId: 'anindilyakwa-homepage-release-policy-v0.1.0',
  languageCode: 'anindilyakwa',
  dictionaryCode: 'anindilyakwa',
  aliases: Object.freeze(['anindilyakwa', 'aoi']),
  programId: 'anindilyakwa-v1',
  forwardRoute: 'unavailable',
  reverseRoute: 'unavailable',
  publicDictionaryLookupEnabled: false,
  publicModelInferenceEnabled: false,
  genericModelFallbackEnabled: false,
  answerScope: 'unavailable',
  dictionaryEdition: 'anindilyakwa-local-source-v0.1.0',
  evidenceAudit: Object.freeze({
    reportId: 'anindilyakwa-live-translation-audit-2026-08-30',
    sha256: 'b7017f658b42e7f94348650267ac3f59c220b30fbaca427835d191dc5397a6d7',
  }),
  corpusReadiness: Object.freeze({
    reportId: 'anindilyakwa-corpus-readiness-v0.3.0',
    sha256: '40e8e0186e93f479c23e455a8f2c408099522b99d274cbf1e2c8fafa7892fd35',
  }),
  permissionAttestationSha256:
    '040067e98afea96281df7bbf38966546a8d36102d74fffaa2da0c77ab6836c31',
  unsupportedStatus: 422,
  unsupportedMessage:
    'Anindilyakwa dictionary lookup and model translation are not publicly admitted yet, so MobTranslate cannot complete this request safely.',
});

const MIGMAQ_POLICY: TranslationReleasePolicy = Object.freeze({
  policyId: 'listuguj-migmaq-live-answer-policy-v1.1.0',
  languageCode: 'migmaq',
  dictionaryCode: 'migmaq',
  aliases: Object.freeze(['migmaq', 'mic']),
  programId: 'listuguj-migmaq-v3.3',
  forwardRoute: 'hybrid_review',
  reverseRoute: 'dictionary_reverse_review',
  publicDictionaryLookupEnabled: true,
  publicModelInferenceEnabled: true,
  genericModelFallbackEnabled: true,
  answerScope: 'dictionary_and_unverified_research_preview',
  dictionaryEdition: 'listuguj-migmaq-source-attested-v3.3',
  evidenceAudit: Object.freeze({
    reportId: 'migmaq-live-translation-audit-2026-08-30',
    sha256: '161dcaef6eabed2f91ad01d4f940d73a96ab95575bf775e747471a620ca5e34c',
  }),
  unsupportedStatus: 422,
  unsupportedMessage:
    "Listuguj Mi'gmaq translation is temporarily unavailable. Please try again shortly.",
});

const POLICIES = Object.freeze([
  KUKU_YALANJI_POLICY,
  WAJARRI_POLICY,
  ANINDILYAKWA_POLICY,
  MIGMAQ_POLICY,
]);

const TRANSLATION_RELEASE_POLICIES: ReadonlyMap<
  string,
  TranslationReleasePolicy
> = new Map(
  POLICIES.flatMap((policy) =>
    policy.aliases.map((alias) => [alias, policy] as const),
  ),
);

/**
 * Return an immutable, evidence-bound release policy for an audited language.
 * The policy is keyed by declared aliases only and never guesses from text.
 */
export function loadTranslationReleasePolicy(
  languageCode: string,
): TranslationReleasePolicy | null {
  return TRANSLATION_RELEASE_POLICIES.get(languageCode) ?? null;
}

export function resolveTranslationDictionaryCode(languageCode: string): string {
  return (
    loadTranslationReleasePolicy(languageCode)?.dictionaryCode ?? languageCode
  );
}

export function isDictionaryLookupAdmitted(
  policy: TranslationReleasePolicy,
  direction: 'to_language' | 'to_english',
): boolean {
  const route =
    direction === 'to_language' ? policy.forwardRoute : policy.reverseRoute;
  return policy.publicDictionaryLookupEnabled && route !== 'unavailable';
}

export function isGeneratedTranslationAdmitted(
  policy: TranslationReleasePolicy,
  direction: 'to_language' | 'to_english',
): boolean {
  const route =
    direction === 'to_language' ? policy.forwardRoute : policy.reverseRoute;
  return (
    route !== 'unavailable' &&
    (policy.publicModelInferenceEnabled || policy.genericModelFallbackEnabled)
  );
}

export function listTranslationReleasePolicies(): TranslationReleasePolicy[] {
  return [...POLICIES];
}
