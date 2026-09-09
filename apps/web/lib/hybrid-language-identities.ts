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

export const WAJARRI_HYBRID_IDENTITY = {
  languageCode: 'wajarri',
  languageName: 'Wajarri',
  languageTag: 'wbv',
} as const satisfies HybridLanguageIdentity;

export const ANINDILYAKWA_HYBRID_IDENTITY = {
  languageCode: 'anindilyakwa',
  languageName: 'Anindilyakwa',
  languageTag: 'aoi',
} as const satisfies HybridLanguageIdentity;

const IDENTITIES = new Map<string, HybridLanguageIdentity>([
  [KUKU_YALANJI_HYBRID_IDENTITY.languageCode, KUKU_YALANJI_HYBRID_IDENTITY],
  ['kuku-yalanji', KUKU_YALANJI_HYBRID_IDENTITY],
  [MIGMAQ_HYBRID_IDENTITY.languageCode, MIGMAQ_HYBRID_IDENTITY],
  ['mic', MIGMAQ_HYBRID_IDENTITY],
  [WAJARRI_HYBRID_IDENTITY.languageCode, WAJARRI_HYBRID_IDENTITY],
  ['wbv', WAJARRI_HYBRID_IDENTITY],
  [ANINDILYAKWA_HYBRID_IDENTITY.languageCode, ANINDILYAKWA_HYBRID_IDENTITY],
  ['aoi', ANINDILYAKWA_HYBRID_IDENTITY],
]);

export function getHybridLanguageIdentity(
  languageCode: string,
): HybridLanguageIdentity | null {
  return IDENTITIES.get(languageCode) ?? null;
}
