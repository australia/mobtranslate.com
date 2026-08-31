import { describe, expect, it } from 'vitest';
import { buildFiftyWordsWajarriEvidence } from '../../lib/research/wajarriFiftyWords';

const audio = (name: string) => [
  `/repository/A39/${name}.webm`,
  `/repository/A39/${name}.mp3`,
  `/repository/A39/${name}.wav`,
];

const index = {
  type: 'Feature',
  properties: {
    language: { name: 'Wajarri', audio: audio('language') },
    date_received: 20190702,
    code: 'A39',
    words: [
      { english: 'yes', indigenous: 'guwa', audio: audio('yes') },
      {
        english: 'where are you going?',
        indigenous: 'thaaga nyinda yanmanha?',
        audio: audio('where'),
      },
    ],
    speaker: { name: 'Godfrey Simpson', audio: audio('speaker') },
    name: 'Wajarri',
    source: 'Gambay',
  },
};

const dictionary = [
  {
    Wajarri: 'guwa',
    English: 'yes',
    description: 'yes',
    sound: 'Track1.mp3',
  },
  {
    Wajarri: 'guwa',
    English: 'agreement',
    description: 'agreement particle',
    sound: 'Track2.mp3',
  },
];

describe('Wajarri 50 Words evidence inventory', () => {
  it('preserves source pairs and reports exact current-headword relations', () => {
    const result = buildFiftyWordsWajarriEvidence({
      indexValue: index,
      currentDictionaryValue: dictionary,
    });

    expect(result.report).toMatchObject({
      pairings: 2,
      uniqueEnglishSources: 2,
      uniqueWajarriSources: 2,
      multiTokenEnglishSources: 1,
      multiTokenWajarriSources: 1,
      noExactCurrentHeadword: 1,
      multipleExactCurrentHeadwords: 1,
      exactCurrentHeadwordMatches: 2,
      exactCurrentEnglishMatches: 1,
      audioAssets: 12,
      acceptedSourceAttestations: 2,
      trainingEligibleRows: 0,
      syntheticEligibleRows: 0,
    });
    expect(result.pairings[0]).toMatchObject({
      englishSource: 'yes',
      wajarriSource: 'guwa',
      currentDictionaryRelation: 'multiple_exact_current_headwords',
      acceptanceStatus: 'accepted_as_source_attestation',
      translationTaskEligibility: 'pending_task_and_sense_review',
    });
    expect(result.pairings[1]).toMatchObject({
      currentDictionaryRelation: 'no_exact_current_headword',
      sourceHasTerminalPunctuation: true,
    });
  });

  it('rejects duplicate English source prompts instead of collapsing them', () => {
    expect(() =>
      buildFiftyWordsWajarriEvidence({
        indexValue: {
          ...index,
          properties: {
            ...index.properties,
            words: [index.properties.words[0], index.properties.words[0]],
          },
        },
        currentDictionaryValue: dictionary,
      }),
    ).toThrow('duplicate English source');
  });

  it('rejects audio derivatives outside the source collection', () => {
    expect(() =>
      buildFiftyWordsWajarriEvidence({
        indexValue: {
          ...index,
          properties: {
            ...index.properties,
            words: [
              {
                ...index.properties.words[0],
                audio: ['/repository/OTHER/x.webm', ...audio('yes').slice(1)],
              },
            ],
          },
        },
        currentDictionaryValue: dictionary,
      }),
    ).toThrow();
  });
});
