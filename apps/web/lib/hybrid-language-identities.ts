export interface HybridLanguageIdentity {
  languageCode: string;
  languageName: string;
  languageTag: string;
}

export const KUKU_YALANJI_HYBRID_IDENTITY = {
  languageCode: 'kuku_yalanji',
  languageName: 'Kuku Yalanji',
  languageTag: 'gvn',
} as const satisfies HybridLanguageIdentity;

export const MIGMAQ_HYBRID_IDENTITY = {
  languageCode: 'migmaq',
  languageName: "Mi'kmaq",
  languageTag: 'mic',
} as const satisfies HybridLanguageIdentity;

const IDENTITIES = new Map<string, HybridLanguageIdentity>(
  [KUKU_YALANJI_HYBRID_IDENTITY, MIGMAQ_HYBRID_IDENTITY].map((identity) => [
    identity.languageCode,
    identity,
  ]),
);

export function getHybridLanguageIdentity(
  languageCode: string,
): HybridLanguageIdentity | null {
  return IDENTITIES.get(languageCode) ?? null;
}
