export interface HybridLanguageIdentity {
  languageCode: string;
  dictionaryCode: string;
  languageName: string;
  languageTag: string;
}

export const KUKU_YALANJI_HYBRID_IDENTITY = {
  languageCode: 'kuku_yalanji',
  dictionaryCode: 'kuku_yalanji',
  languageName: 'Kuku Yalanji',
  languageTag: 'gvn',
} as const satisfies HybridLanguageIdentity;

export const MIGMAQ_HYBRID_IDENTITY = {
  languageCode: 'migmaq',
  dictionaryCode: 'migmaq',
  languageName: "Mi'kmaq",
  languageTag: 'mic',
} as const satisfies HybridLanguageIdentity;

export const WAJARRI_HYBRID_IDENTITY = {
  languageCode: 'wajarri',
  dictionaryCode: 'wbv',
  languageName: 'Wajarri',
  languageTag: 'wbv',
} as const satisfies HybridLanguageIdentity;

const IDENTITIES = new Map<string, HybridLanguageIdentity>(
  [
    KUKU_YALANJI_HYBRID_IDENTITY,
    MIGMAQ_HYBRID_IDENTITY,
    WAJARRI_HYBRID_IDENTITY,
  ].flatMap((identity) =>
    [...new Set([identity.languageCode, identity.dictionaryCode])].map(
      (code) => [code, identity] as const,
    ),
  ),
);

export function getHybridLanguageIdentity(
  languageCode: string,
): HybridLanguageIdentity | null {
  return IDENTITIES.get(languageCode) ?? null;
}
