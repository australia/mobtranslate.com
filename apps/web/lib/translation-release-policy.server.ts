export interface TranslationReleasePolicy {
  policyId: string;
  languageCode: string;
  programId: string;
  forwardRoute: 'unavailable' | 'dictionary_exact_only';
  reverseRoute: 'unavailable' | 'dictionary_exact_only';
  publicDictionaryLookupEnabled: boolean;
  publicModelInferenceEnabled: false;
  genericModelFallbackEnabled: false;
  dictionaryEdition: string;
  corpusReadiness: {
    reportId: string;
    sha256: string;
  };
  permissionAttestationSha256: string;
  unsupportedStatus: 422;
  unsupportedMessage: string;
}

const TRANSLATION_RELEASE_POLICIES: Readonly<
  Record<string, TranslationReleasePolicy>
> = Object.freeze({
  anindilyakwa: Object.freeze({
    policyId: 'anindilyakwa-homepage-release-policy-v0.1.0',
    languageCode: 'anindilyakwa',
    programId: 'anindilyakwa-v1',
    forwardRoute: 'unavailable',
    reverseRoute: 'unavailable',
    publicDictionaryLookupEnabled: false,
    publicModelInferenceEnabled: false,
    genericModelFallbackEnabled: false,
    dictionaryEdition: 'anindilyakwa-local-source-v0.1.0',
    corpusReadiness: Object.freeze({
      reportId: 'anindilyakwa-corpus-readiness-v0.3.0',
      sha256:
        '40e8e0186e93f479c23e455a8f2c408099522b99d274cbf1e2c8fafa7892fd35',
    }),
    permissionAttestationSha256:
      '040067e98afea96281df7bbf38966546a8d36102d74fffaa2da0c77ab6836c31',
    unsupportedStatus: 422,
    unsupportedMessage:
      'Anindilyakwa dictionary lookup and model translation are not publicly admitted yet, so this request cannot be completed safely.',
  }),
});

/**
 * Return an immutable evidence-bound release policy when a language must not
 * fall through to generic generation. Absence means this module imposes no
 * additional restriction; it never guesses policy from a language name.
 */
export function loadTranslationReleasePolicy(
  languageCode: string,
): TranslationReleasePolicy | null {
  return TRANSLATION_RELEASE_POLICIES[languageCode] ?? null;
}
