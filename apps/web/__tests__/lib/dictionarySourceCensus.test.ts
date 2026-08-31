import {
  buildCandidateDictionaryLedgers,
  buildDictionaryCensus,
  buildSourceDictionaryRecords,
  canonicalJson,
  type DatabaseWordRecord,
  DictionaryCensusContractSchema,
  sha256Canonical,
} from '@/lib/research/dictionarySourceCensus';

const contract = DictionaryCensusContractSchema.parse({
  schema_version: 1,
  census_id: 'wajarri-dictionary-census-v0.2.0',
  language: { code: 'wbv', name: 'Wajarri' },
  source: {
    source_id: 'src-test',
    path: 'sources/raw/dictionary.json',
    format: 'json_array',
    record_id_prefix: 'wbv-src',
    fields: {
      headword: 'Wajarri',
      translation: 'English',
      definition: 'description',
      audio: 'sound',
      image: 'image',
    },
  },
  database: {
    yaml_source_file: 'dictionaries/wajarri/dictionary.yaml',
    yaml_source_ref_base: 1,
    require_exact_legacy_and_yaml_pair: true,
  },
});

function databaseRow(
  id: string,
  raw: Record<string, string>,
  managedByYamlSync: boolean,
  ordinal: number,
): DatabaseWordRecord {
  return {
    databaseWordId: id,
    word: raw.Wajarri,
    normalizedWord: raw.Wajarri,
    managedByYamlSync,
    yamlSourceFile: managedByYamlSync
      ? 'dictionaries/wajarri/dictionary.yaml'
      : null,
    yamlSourceRef: managedByYamlSync
      ? `dictionaries/wajarri/dictionary.yaml#${ordinal}`
      : null,
    yamlContentHash: managedByYamlSync ? 'source-content-hash' : null,
    isVerified: !managedByYamlSync,
    qualityScore: managedByYamlSync ? 0 : 80,
    notes: null,
    metadata: managedByYamlSync ? {} : { original_entry: raw },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    wordClassCode: null,
    definitions: [
      {
        id: `${id}-definition`,
        definition: raw.description,
        definitionNumber: 1,
        isPrimary: true,
      },
    ],
    translations: [
      {
        id: `${id}-translation`,
        translation: raw.English,
        targetLanguage: 'en',
        isPrimary: true,
      },
    ],
    entrySource: null,
    needsReview: null,
  };
}

describe('dictionary source census', () => {
  it('canonicalizes object keys before hashing', () => {
    expect(canonicalJson({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{"a":{"b":3,"y":2},"z":1}',
    );
    expect(sha256Canonical({ a: 1, b: 2 })).toBe(
      sha256Canonical({ b: 2, a: 1 }),
    );
  });

  it('proves one exact legacy and YAML lineage without collapsing homographs', () => {
    const raw = [
      {
        Wajarri: 'baba',
        English: 'rain',
        description: 'water, rain',
        sound: 'Track1.mp3',
        image: 'logo.png',
      },
      {
        Wajarri: 'baba',
        English: 'water',
        description: 'fresh water',
        sound: 'Track2.mp3',
        image: 'logo.png',
      },
    ];
    const source = buildSourceDictionaryRecords(raw, contract);
    const database = raw.flatMap((record, index) => [
      databaseRow(`legacy-${index}`, record, false, index + 1),
      databaseRow(`yaml-${index}`, record, true, index + 1),
    ]);
    const result = buildDictionaryCensus(source, database, contract);

    expect(result.report.crosswalk).toEqual({
      exactTwoLineagePairs: 2,
      anomalyRows: 0,
      unconsumedDatabaseRows: 0,
      duplicateSourceContentTupleGroups: 0,
    });
    expect(result.report.source.distinctExactHeadwords).toBe(1);
    expect(result.report.repeatedHeadwordGroups).toHaveLength(1);
    expect(result.crosswalk.map((row) => row.sourceRecordId)).toEqual([
      'wbv-src-000001',
      'wbv-src-000002',
    ]);
    const ledgers = buildCandidateDictionaryLedgers(source, result.report, {
      orthographyId: 'wajarri-source-practical-v0',
    });
    expect(ledgers.entries).toHaveLength(2);
    expect(ledgers.senses).toHaveLength(2);
    expect(ledgers.forms).toHaveLength(2);
    expect(ledgers.mediaLinks).toHaveLength(4);
    expect(ledgers.reviewQueue).toHaveLength(1);
    expect(ledgers.reviewQueue[0].reviewKind).toBe('headword_identity');
  });

  it('reports a missing lineage and source-reference mismatch', () => {
    const raw = {
      Wajarri: 'baba',
      English: 'rain',
      description: 'water, rain',
      sound: 'Track1.mp3',
      image: 'logo.png',
    };
    const source = buildSourceDictionaryRecords([raw], contract);
    const yaml = databaseRow('yaml-1', raw, true, 99);
    const result = buildDictionaryCensus(source, [yaml], contract);

    expect(result.crosswalk[0].status).toBe('anomaly');
    expect(result.crosswalk[0].anomalyCodes).toEqual([
      'legacy_lineage_count_not_one',
      'yaml_source_ref_mismatch',
    ]);
    expect(result.report.anomalyCodes).toEqual({
      legacy_lineage_count_not_one: 1,
      yaml_source_ref_mismatch: 1,
    });
  });
});
