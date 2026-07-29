import type { LanguageGovernance } from './api';

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

const INDEPENDENT_SUMMARY =
  'Published by Mob Translate as an independent working collection. It is not presented as official, community-owned, community-certified, or endorsed by the organisations linked here.';

/** Conservative offline copy; the live API carries the fuller audited record. */
export function fallbackGovernance(code: string): LanguageGovernance {
  const common = {
    collectionLabel: 'Independent working collection',
    summary: INDEPENDENT_SUMMARY,
    communityRelationship: {
      status: 'open' as const,
      label: 'Relationship not documented',
      detail: 'No formal community stewardship relationship or endorsement is recorded for this collection.',
    },
    references: [],
    lastAudited: '2026-07-30',
  };

  if (code === 'kuku_yalanji') {
    return {
      ...common,
      sourceEvidence: {
        status: 'documented',
        label: 'Source trail documented',
        detail: 'The 1982 dictionary and identified reference-grammar additions are named.',
      },
      publicationBasis: {
        status: 'partial',
        label: 'Terms partly documented',
        detail: 'Terms for the base dictionary still need to be recorded.',
      },
    };
  }
  if (code === 'migmaq') {
    return {
      ...common,
      sourceEvidence: {
        status: 'partial',
        label: 'Source trail partly documented',
        detail: 'Linked source recordings and examples are documented; not every legacy field is.',
      },
      publicationBasis: {
        status: 'partial',
        label: 'Terms partly documented',
        detail: 'Linked Talking Dictionary material is identified as CC BY-NC 4.0.',
      },
    };
  }
  return {
    ...common,
    sourceEvidence: {
      status: 'open',
      label: 'Source investigation open',
      detail: 'A defensible source record has not yet been attached to this imported collection.',
    },
    publicationBasis: {
      status: 'open',
      label: 'Publication basis not documented',
      detail: 'No publication-permission or reusable-license record is currently attached.',
    },
  };
}
