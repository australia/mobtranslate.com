export interface TranslationReleasePolicy {
  policyId: string;
  languageCode: string;
  programId: string;
  forwardRoute:
    | 'unavailable'
    | 'dictionary_exact_only'
    | 'dictionary_exact_or_experimental_model';
  reverseRoute: 'unavailable' | 'dictionary_exact_only';
  publicDictionaryLookupEnabled: boolean;
  publicModelInferenceEnabled: boolean;
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
    policyId: 'anindilyakwa-homepage-release-policy-v0.2.0',
    languageCode: 'anindilyakwa',
    programId: 'anindilyakwa-v1',
    forwardRoute: 'dictionary_exact_or_experimental_model',
    reverseRoute: 'dictionary_exact_only',
    publicDictionaryLookupEnabled: true,
    publicModelInferenceEnabled: true,
    genericModelFallbackEnabled: false,
    dictionaryEdition: 'anindilyakwa-local-source-v0.1.0',
    corpusReadiness: Object.freeze({
      reportId: 'anindilyakwa-corpus-readiness-v0.3.0',
      sha256:
        '40e8e0186e93f479c23e455a8f2c408099522b99d274cbf1e2c8fafa7892fd35',
    }),
    permissionAttestationSha256:
      'f7661af8da2e63ff12a2801b564b6a1aa2a78bc23735374cffd787f41efec28b',
    unsupportedStatus: 422,
    unsupportedMessage:
      'This request is outside the Traditional-Owner-authorized Anindilyakwa experimental model and exact-dictionary routes. Generic fallback remains disabled.',
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
