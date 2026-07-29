export type GovernanceStatus = 'documented' | 'partial' | 'open';

export interface GovernanceFinding {
  status: GovernanceStatus;
  label: string;
  detail: string;
}

export interface GovernanceReference {
  label: string;
  url: string;
  kind: 'source' | 'rights' | 'language_context';
}

export interface LanguageGovernance {
  collectionLabel: string;
  summary: string;
  sourceEvidence: GovernanceFinding;
  publicationBasis: GovernanceFinding;
  communityRelationship: GovernanceFinding;
  references: GovernanceReference[];
  lastAudited: string;
}

const INDEPENDENT_SUMMARY =
  'Mob Translate publishes this as an independent working collection. It is not presented as official, community-owned, community-certified, or endorsed by the organisations linked here.';

const NO_RECORDED_STEWARDSHIP: GovernanceFinding = {
  status: 'open',
  label: 'Relationship not documented',
  detail:
    'Mob Translate has not recorded a formal community stewardship relationship or endorsement for this collection. Language and Country links are context references only.',
};

const GOVERNANCE_BY_CODE: Record<string, LanguageGovernance> = {
  kuku_yalanji: {
    collectionLabel: 'Independent working collection',
    summary: INDEPENDENT_SUMMARY,
    sourceEvidence: {
      status: 'documented',
      label: 'Source trail documented',
      detail:
        'Entries trace to the 1982 Kuku-Yalanji Dictionary, with identified additions from Elisabeth Patz’s reference grammar.',
    },
    publicationBasis: {
      status: 'partial',
      label: 'Terms partly documented',
      detail:
        'The Patz grammar is available under CC BY 4.0. Mob Translate has not yet recorded publication terms for the 1982 base dictionary.',
    },
    communityRelationship: NO_RECORDED_STEWARDSHIP,
    references: [
      {
        label: 'Kuku-Yalanji Dictionary (1982)',
        url: 'https://www.sil.org/resources/archives/18038',
        kind: 'source',
      },
      {
        label: 'Patz reference grammar',
        url: 'https://openresearch-repository.anu.edu.au/items/c3f55c48-a0aa-461d-be7a-fd7c3902d356',
        kind: 'source',
      },
      {
        label: 'Wujal Wujal language information',
        url: 'https://www.wujalwujalcouncil.qld.gov.au/Visit/Language',
        kind: 'language_context',
      },
    ],
    lastAudited: '2026-07-30',
  },
  anindilyakwa: {
    collectionLabel: 'Independent working collection',
    summary: INDEPENDENT_SUMMARY,
    sourceEvidence: {
      status: 'open',
      label: 'Source investigation open',
      detail:
        'The imported entries do not yet have a defensible source record attached. Mob Translate keeps this gap visible while the collection is traced.',
    },
    publicationBasis: {
      status: 'open',
      label: 'Publication basis not documented',
      detail:
        'No publication-permission or reusable-license record is currently attached to this imported collection.',
    },
    communityRelationship: NO_RECORDED_STEWARDSHIP,
    references: [
      {
        label: 'Anindilyakwa Language Centre',
        url: 'https://anindilyakwa.com.au/preserving-culture/language-centre/',
        kind: 'language_context',
      },
      {
        label: 'Anindilyakwa Land Council copyright',
        url: 'https://anindilyakwa.com.au/about/copyright/',
        kind: 'rights',
      },
      {
        label: 'Anindilyakwa data sovereignty',
        url: 'https://anindilyakwa.com.au/anindilyakwa-data-sovereignty-2/',
        kind: 'rights',
      },
    ],
    lastAudited: '2026-07-30',
  },
  migmaq: {
    collectionLabel: 'Independent working collection',
    summary: INDEPENDENT_SUMMARY,
    sourceEvidence: {
      status: 'partial',
      label: 'Source trail partly documented',
      detail:
        'Matched recordings, imported examples, and source-created entries link to the Mi’gmaq/Mi’kmaq Online Talking Dictionary. The origin of every legacy lexical field is not yet documented.',
    },
    publicationBasis: {
      status: 'partial',
      label: 'Terms partly documented',
      detail:
        'Linked Talking Dictionary material is identified as CC BY-NC 4.0. Terms for remaining legacy entry data still need a source record.',
    },
    communityRelationship: NO_RECORDED_STEWARDSHIP,
    references: [
      {
        label: 'Mi’gmaq/Mi’kmaq Online Talking Dictionary',
        url: 'https://mikmaqonline.org/',
        kind: 'source',
      },
      {
        label: 'Learn Mi’gmaq',
        url: 'https://learn.migmaq.org/',
        kind: 'language_context',
      },
    ],
    lastAudited: '2026-07-30',
  },
};

const DEFAULT_GOVERNANCE: LanguageGovernance = {
  collectionLabel: 'Independent working collection',
  summary: INDEPENDENT_SUMMARY,
  sourceEvidence: {
    status: 'open',
    label: 'Source status not yet documented',
    detail: 'Mob Translate has not yet published a complete source record for this collection.',
  },
  publicationBasis: {
    status: 'open',
    label: 'Publication basis not documented',
    detail: 'No reusable-license or publication-permission record is currently shown for this collection.',
  },
  communityRelationship: NO_RECORDED_STEWARDSHIP,
  references: [],
  lastAudited: '2026-07-30',
};

/**
 * Conservative public status for a language collection. Unknown collections
 * inherit open gaps rather than being silently described as community-led.
 */
export function governanceForLanguage(code: string | null | undefined): LanguageGovernance {
  return (code && GOVERNANCE_BY_CODE[code]) || DEFAULT_GOVERNANCE;
}
