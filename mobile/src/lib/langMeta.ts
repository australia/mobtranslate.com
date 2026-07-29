/** Sourced identity context per language. Artwork/map live in theme.LANG_ART;
 * references point to community-led language or Country organisations and do
 * not imply that those organisations endorse Mob Translate. */
export interface LangMeta {
  region: string;
  place: string;
  tagline: string;
  languageTag: string;
  referenceLabel: string;
  referenceUrl: string;
}

export const LANG_META: Record<string, LangMeta> = {
  kuku_yalanji: {
    region: 'Far North Queensland',
    place: 'Daintree, QLD',
    tagline: 'A living language of rainforest, coast and reef Country.',
    languageTag: 'gvn',
    referenceLabel: 'Wujal Wujal Aboriginal Shire Council',
    referenceUrl: 'https://www.wujalwujalcouncil.qld.gov.au/Visit/Language',
  },
  anindilyakwa: {
    region: 'Groote & Bickerton Islands, NT',
    place: 'Groote Eylandt, NT',
    tagline: 'Spoken across Groote Eylandt and Bickerton Island.',
    languageTag: 'aoi',
    referenceLabel: 'Anindilyakwa Language Centre',
    referenceUrl: 'https://anindilyakwa.com.au/preserving-culture/language-centre/',
  },
  migmaq: {
    region: "Mi'kma'ki, Atlantic Canada",
    place: 'Atlantic Canada',
    tagline: 'Many communities, accents and ways of speaking.',
    languageTag: 'mic',
    referenceLabel: "Learn Mi'gmaq — Mi'gmaq Partnership",
    referenceUrl: 'https://learn.migmaq.org/',
  },
  wbv: {
    region: 'Murchison & Gascoyne, WA',
    place: 'Murchison, WA',
    tagline: 'Language of Murchison and Gascoyne Country.',
    languageTag: 'wbv',
    referenceLabel: 'Wajarri Yamaji Aboriginal Corporation',
    referenceUrl: 'https://www.wajarrienterprises.com.au/about-us/our-organisation/wyac.aspx',
  },
};

export function langMeta(code: string): LangMeta {
  return LANG_META[code] ?? {
    region: '',
    place: '',
    tagline: 'Learn words, meanings and voices.',
    languageTag: code,
    referenceLabel: 'Mob Translate language directory',
    referenceUrl: 'https://mobtranslate.com/dictionaries',
  };
}
