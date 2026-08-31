import { describe, expect, it } from 'vitest';
import {
  buildWajarriFiftyWordsTaskReview,
  type FiftyWordsTaskAudioAsset,
  type FiftyWordsTaskPairing,
} from '@/lib/research/wajarriFiftyWordsTaskReview';

function pairing(input: {
  ordinal: number;
  english: string;
  wajarri: string;
}): FiftyWordsTaskPairing {
  const recordId = `pair-${input.ordinal}`;
  return {
    schemaVersion: 1,
    inventoryId: 'wajarri-50words-a39-evidence-v0.1.0',
    recordId,
    sourceId: 'src-wbv-50words-a39-2019-20260723',
    sourceOrdinal: input.ordinal,
    englishSource: input.english,
    englishAlternateSource: null,
    wajarriSource: input.wajarri,
    speakerSource: 'Speaker',
    sourceCollection: 'Collection',
    dateReceivedSource: 20190702,
    sourceAttestationStatus: 'speaker_attributed_published_pair',
    licenseScope: 'public_50words_site_material_only',
    acceptanceStatus: 'accepted_as_source_attestation',
    lexicalSenseStatus: 'unadjudicated',
    translationTaskEligibility: 'pending_task_and_sense_review',
    syntheticEligibility: 'not_yet_eligible',
    trainingEligibility: 'not_yet_eligible_pending_task_review',
    englishTokenCount: input.english.split(/\s+/u).length,
    wajarriTokenCount: input.wajarri.split(/\s+/u).length,
    sourceHasTerminalPunctuation: /[?!.]$/u.test(
      `${input.english}${input.wajarri}`,
    ),
    audioPaths: ['mp3', 'wav', 'webm'].map(
      (extension) => `/repository/A39/${recordId}.${extension}`,
    ),
    currentDictionaryRelation: 'no_exact_current_headword',
    currentDictionaryMatches: [],
    claimLimit: 'source only',
  };
}

function audioAssets(
  rows: FiftyWordsTaskPairing[],
): FiftyWordsTaskAudioAsset[] {
  const pairAssets = rows.flatMap((row) =>
    row.audioPaths.map((remotePath) => {
      const extension = remotePath.split('.').at(-1);
      return {
        schemaVersion: 1 as const,
        assetId: `${row.recordId}-${extension}`,
        role: 'translation_pair' as const,
        sourceRecordId: row.recordId,
        englishSource: row.englishSource,
        wajarriSource: row.wajarriSource,
        speakerSource: row.speakerSource,
        remotePath,
        remoteUrl: `https://50words.online${remotePath}`,
        archiveRelativePath: `audio/${row.recordId}.${extension}`,
        mediaType:
          extension === 'mp3'
            ? ('audio/mpeg' as const)
            : extension === 'wav'
              ? ('audio/wav' as const)
              : ('video/webm' as const),
      };
    }),
  );
  return [
    ...pairAssets,
    ...['language', 'speaker'].flatMap((role) =>
      ['mp3', 'wav', 'webm'].map((extension) => ({
        schemaVersion: 1 as const,
        assetId: `${role}-${extension}`,
        role:
          role === 'language'
            ? ('language_name' as const)
            : ('speaker_name' as const),
        sourceRecordId: null,
        englishSource: role,
        wajarriSource: role,
        speakerSource: 'Speaker',
        remotePath: `/repository/A39/${role}.${extension}`,
        remoteUrl: `https://50words.online/repository/A39/${role}.${extension}`,
        archiveRelativePath: `audio/${role}.${extension}`,
        mediaType:
          extension === 'mp3'
            ? ('audio/mpeg' as const)
            : extension === 'wav'
              ? ('audio/wav' as const)
              : ('video/webm' as const),
      })),
    ),
  ];
}

function fixture() {
  const rows = [
    pairing({ ordinal: 1, english: 'hello', wajarri: 'phrase' }),
    pairing({ ordinal: 2, english: 'fire', wajarri: 'word' }),
    pairing({ ordinal: 3, english: 'firewood', wajarri: 'word' }),
  ];
  const assets = audioAssets(rows);
  return {
    rows,
    assets,
    contractValue: {
      schema_version: 1,
      review_id: 'review-1',
      created_at_utc: '2026-07-23T00:00:00Z',
      output_root: 'analysis/reviews/review-1',
      source_pairings: {
        path: 'pairings.jsonl',
        sha256: 'a'.repeat(64),
        rows: 3,
      },
      source_audio_assets: {
        path: 'audio.jsonl',
        sha256: 'b'.repeat(64),
        rows: 15,
      },
      rights_review: {
        path: 'rights.json',
        sha256: 'c'.repeat(64),
        review_id: 'rights-1',
      },
      task_tokens: {
        lexical_concept: '<lexeme>',
        fixed_utterance: '<translate>',
      },
      fixed_utterance_ordinals: [1],
      lexical_concept_ordinals: [2, 3],
      expected_counts: {
        source_pairings: 3,
        fixed_utterances: 1,
        lexical_senses: 2,
        lexical_surface_groups: 1,
        pair_audio_links: 9,
        direct_supervision_candidates: 3,
        split_assigned_training_rows: 0,
        synthetic_eligible_rows: 0,
        productive_grammar_rules: 0,
      },
      review_policy: {
        direct_supervision: 'source_exact_noncommercial_after_split_assignment',
        source_independence: 'not_assumed',
        part_of_speech: 'not_inferred',
        morphology: 'not_inferred',
        fixed_utterance_productivity: 'not_inferred',
        synthetic_generation:
          'blocked_until_productive_grammar_and_slot_compatibility_are_accepted',
      },
    },
    rightsReviewValue: {
      schema_version: 1,
      review_id: 'rights-1',
      included_material: {
        translation_pairings: 3,
        public_audio_derivatives: 15,
        license: 'CC BY-NC 4.0',
      },
      operational_decision: {
        model_training: true,
        redistribution: true,
        derived_model_weights: true,
        third_party_hosted_processing: true,
        conditions: ['noncommercial'],
      },
    },
  };
}

describe('buildWajarriFiftyWordsTaskReview', () => {
  it('separates fixed utterances from lexical senses without opening synthesis', () => {
    const input = fixture();
    const result = buildWajarriFiftyWordsTaskReview({
      contractValue: input.contractValue,
      pairingRows: input.rows,
      audioAssetRows: input.assets,
      rightsReviewValue: input.rightsReviewValue,
    });
    expect(result.report).toMatchObject({
      sourcePairings: 3,
      fixedUtterances: 1,
      lexicalSenses: 2,
      lexicalSurfaceGroups: 1,
      directSupervisionCandidates: 3,
      splitAssignedTrainingRows: 0,
      syntheticEligibleRows: 0,
      productiveGrammarRules: 0,
    });
    expect(result.taskDecisions.map((row) => row.inputText)).toEqual([
      '<translate> hello',
      '<lexeme> fire',
      '<lexeme> firewood',
    ]);
    expect(result.lexicalSurfaceGroups[0].englishSourceSenses).toEqual([
      'fire',
      'firewood',
    ]);
  });

  it('rejects an incomplete semantic task partition', () => {
    const input = fixture();
    input.contractValue.lexical_concept_ordinals = [2];
    expect(() =>
      buildWajarriFiftyWordsTaskReview({
        contractValue: input.contractValue,
        pairingRows: input.rows,
        audioAssetRows: input.assets,
        rightsReviewValue: input.rightsReviewValue,
      }),
    ).toThrow('task partition omits source ordinal 3');
  });

  it('rejects a source row without all three matching pair-audio derivatives', () => {
    const input = fixture();
    input.assets = input.assets.filter(
      (asset) => asset.assetId !== 'pair-2-wav',
    );
    input.contractValue.source_audio_assets.rows -= 1;
    input.rightsReviewValue.included_material.public_audio_derivatives -= 1;
    expect(() =>
      buildWajarriFiftyWordsTaskReview({
        contractValue: input.contractValue,
        pairingRows: input.rows,
        audioAssetRows: input.assets,
        rightsReviewValue: input.rightsReviewValue,
      }),
    ).toThrow('expected three pair audio assets for pair-2, found 2');
  });
});
