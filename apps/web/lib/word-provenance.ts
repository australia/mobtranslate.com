export type WordSourceRelationship =
  | 'dictionary_collection'
  | 'entry_created_from_source'
  | 'linked_archive_record'
  | 'recorded_source';

export interface PublicWordSource {
  id: string;
  name: string;
  relationship: WordSourceRelationship;
  description: string;
  scope: string[];
  url?: string;
  entryUrl?: string;
  attribution?: string;
  licenseName?: string;
  licenseUrl?: string;
}

export interface ImportedWordSourceRow {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceEntryUrl: string;
  attributionText: string;
  licenseName: string;
  licenseUrl: string;
  mappingStatus: string;
}

const KUKU_YALANJI_DICTIONARY: PublicWordSource = {
  id: 'kuku-yalanji-dictionary-1982',
  name: 'Kuku-Yalanji Dictionary (1982)',
  relationship: 'dictionary_collection',
  description:
    'The headword and meaning trace to the Kuku-Yalanji dictionary compiled by Henry and Ruth Hershberger with major Kuku Yalanji contributors.',
  scope: ['headword', 'definition', 'translation'],
  url: 'https://www.sil.org/resources/archives/18038',
  attribution:
    'Major contributors include Toby Bloomfield, Roy Friday, Billy Roberts, Hector and Doris Sykes, Joe Walker, and people who lived at Jajikal in Ayton.',
};

const KUKU_YALANJI_GRAMMAR: PublicWordSource = {
  id: 'patz-kuku-yalanji-grammar-2002',
  name: 'A Grammar of the Kuku Yalanji Language of North Queensland',
  relationship: 'entry_created_from_source',
  description:
    'This entry was added from Elisabeth Patz’s reference grammar and was not present in the original dictionary dataset.',
  scope: ['headword', 'definition', 'linguistic analysis'],
  url: 'https://openresearch-repository.anu.edu.au/items/c3f55c48-a0aa-461d-be7a-fd7c3902d356',
  attribution: 'Elisabeth Patz, Pacific Linguistics 527, Australian National University, 2002.',
  licenseName: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
};

function importedSource(row: ImportedWordSourceRow): PublicWordSource {
  const createdFromSource = row.mappingStatus === 'created_from_source';
  return {
    id: `${row.sourceId}:${row.sourceEntryUrl}`,
    name: row.sourceName,
    relationship: createdFromSource ? 'entry_created_from_source' : 'linked_archive_record',
    description: createdFromSource
      ? 'This Mob Translate entry was created from the linked source record. It still remains open to community review.'
      : 'A matching archive entry supplies the attributed audio and any imported examples. The match does not imply that every field shown here came from that archive or has been community-reviewed.',
    scope: createdFromSource
      ? ['dictionary entry', 'examples', 'recordings']
      : ['matched source entry', 'examples', 'recordings'],
    url: row.sourceUrl,
    entryUrl: row.sourceEntryUrl,
    attribution: row.attributionText,
    licenseName: row.licenseName,
    licenseUrl: row.licenseUrl,
  };
}

/**
 * Build the public source trail for a word without making a stronger claim than
 * the stored evidence supports. A recording-import match is deliberately
 * described as a linked archive record, not as authorship of the whole entry.
 */
export function buildPublicWordSources(input: {
  languageCode?: string | null;
  entrySource?: string | null;
  importedSources?: ImportedWordSourceRow[];
}): PublicWordSource[] {
  const result = (input.importedSources ?? []).map(importedSource);
  const entrySource = input.entrySource?.trim();

  if (input.languageCode === 'kuku_yalanji') {
    result.push(entrySource === 'grammar' ? KUKU_YALANJI_GRAMMAR : KUKU_YALANJI_DICTIONARY);
  }

  // Preserve a named legacy source even when no richer source record exists.
  // Known sources above and imported-source names are already represented.
  if (
    entrySource &&
    entrySource !== 'grammar' &&
    !result.some((source) => source.name.toLocaleLowerCase() === entrySource.toLocaleLowerCase())
  ) {
    result.push({
      id: `entry-source:${entrySource}`,
      name: entrySource,
      relationship: 'dictionary_collection',
      description: 'This is the source name stored with the Mob Translate entry. A direct source link has not yet been documented.',
      scope: ['dictionary entry'],
    });
  }

  const seen = new Set<string>();
  return result.filter((source) => {
    const key = `${source.name}\n${source.entryUrl ?? source.url ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
