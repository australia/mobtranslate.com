// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  buildDictionaryContemporaryEvidenceEdition,
  type DictionaryContemporaryEvidenceInput,
} from '@/lib/research/dictionaryContemporaryEvidenceEdition';

const speakerAttribution = {
  speakerId: 'wbv-speaker-godfrey-simpson-source-attributed',
  speakerName: 'Godfrey Simpson',
  sourceId: 'src-newsletter',
  sourcePath: 'newsletter.pdf',
  sourceSha256: 'a'.repeat(64),
  sourcePage: 12,
  pageRenderingPath: 'page-012.png',
  pageRenderingSha256: 'b'.repeat(64),
  attributionClaim: 'Godfrey Simpson recorded the entire app database.',
  attributionScope: 'entire_app_database_approximately_2000_words' as const,
  verificationStatus: 'source_level_attribution' as const,
};

function probe(assetId: string, path: string, references: number) {
  return {
    assetId,
    assetKind: 'audio',
    archiveRelativePath: path,
    contentSha1Base32: 'A'.repeat(32),
    contentSha256: 'c'.repeat(64),
    fileSizeBytes: 1000,
    dictionaryReferenceCount: references,
    validationStatus: 'cdx_digest_verified',
    codecName: 'mp3',
    durationMs: 1000,
    durationSeconds: 1,
    sampleRate: 16000,
    channels: 1,
    decodeStatus: 'passed',
  };
}

describe('contemporary dictionary evidence edition', () => {
  it('resolves audio, preserves image uncertainty, and creates review records without acceptance', () => {
    const input: DictionaryContemporaryEvidenceInput = {
      parentMediaLinks: [
        {
          mediaLinkId: 'entry-1-media-audio',
          entryCandidateId: 'entry-1',
          mediaKind: 'audio',
          sourcePointer: 'Track1.mp3',
          resolutionStatus: 'source_pointer_unresolved',
        },
        {
          mediaLinkId: 'entry-1-media-image',
          entryCandidateId: 'entry-1',
          mediaKind: 'image',
          sourcePointer: 'logo.png',
          resolutionStatus: 'source_pointer_unresolved',
        },
      ],
      parentReviewQueue: [{ reviewItemId: 'parent-review' }],
      appMapRows: [
        {
          sourceRecordId: 'source-1',
          sourceOrdinal: 1,
          entryCandidateId: 'entry-1',
          mediaLinkId: 'entry-1-media-audio',
          headword: 'marlu',
          sourcePointer: 'Track1.mp3',
          assetId: 'asset-linked',
          originalUrl: 'http://example.com/Track1.mp3',
          replayUrl: 'https://web.archive.org/Track1.mp3',
          archiveRelativePath: 'archive/audio/Track1.mp3',
          captureTimestamp: '20160229135557',
          cdxDigestSha1Base32: 'A'.repeat(32),
          resolutionStatus: 'wayback_capture_identified',
          linguisticStatus: 'candidate',
          trainingUse: 'not_allowed',
        },
      ],
      appProbeRows: [
        probe('asset-linked', 'archive/audio/Track1.mp3', 1),
        probe('asset-unlinked', 'archive/audio/Track2.mp3', 0),
      ],
      appAssetRows: [
        {
          assetId: 'asset-linked',
          assetKind: 'audio',
          originalUrl: 'http://example.com/Track1.mp3',
          replayUrl: 'https://web.archive.org/Track1.mp3',
          archiveRelativePath: 'archive/audio/Track1.mp3',
          dictionaryReferenceCount: 1,
        },
        {
          assetId: 'asset-unlinked',
          assetKind: 'audio',
          originalUrl: 'http://example.com/Track2.mp3',
          replayUrl: 'https://web.archive.org/Track2.mp3',
          archiveRelativePath: 'archive/audio/Track2.mp3',
          dictionaryReferenceCount: 0,
        },
      ],
      ggwCrosswalkRows: [
        {
          sourceRecordId: 'ggw-1',
          snapshotId: 'ggw-2021',
          sourceItemNumber: 1,
          headwordSource: 'marlu',
          englishSource: 'red kangaroo',
          categorySource: 'animals',
          sourceSurfaceTokenCount: 1,
          sourceUnitKind: 'single_surface_form',
          currentCandidates: [],
          reviewCandidates: Array.from({ length: 5 }, (_, index) => ({
            sourceRecordId: `source-${index + 1}`,
            entryCandidateId: `entry-${index + 1}`,
            combinedReviewScore: 1 - index / 10,
          })),
          relationStatus: 'no_exact_headword_review',
          automaticMergeAllowed: false,
          trainingUse: 'not_allowed',
        },
      ],
      speakerAttribution,
      appSourceId: 'src-app',
      ggwSourceId: 'src-ggw',
      archiveProgramPath: 'sources/raw/app',
    };
    const result = buildDictionaryContemporaryEvidenceEdition(input);

    expect(result.mediaLinks[0]).toMatchObject({
      resolutionStatus: 'archived_cdx_digest_and_decode_verified',
      speakerId: 'wbv-speaker-godfrey-simpson-source-attributed',
      trainingEligibility: 'not_allowed',
    });
    expect(result.mediaLinks[1]).toMatchObject({
      resolutionStatus: 'source_pointer_unresolved',
    });
    expect(result.report).toMatchObject({
      resolvedAudioLinks: 1,
      unresolvedImageLinks: 1,
      contemporaryEvidenceLinks: 1,
      noExactHeadwordReviews: 1,
      unlinkedAudioCandidates: 1,
      totalReviewItems: 3,
      acceptedLexicalRows: 0,
      trainingEligibleRows: 0,
    });

    const identityMismatch = structuredClone(input);
    (
      identityMismatch.appMapRows[0] as Record<string, unknown>
    ).entryCandidateId = 'different-entry';
    expect(() =>
      buildDictionaryContemporaryEvidenceEdition(identityMismatch),
    ).toThrow('app mapping identity mismatch');

    const digestMismatch = structuredClone(input);
    (
      digestMismatch.appProbeRows[0] as Record<string, unknown>
    ).contentSha1Base32 = 'B'.repeat(32);
    expect(() =>
      buildDictionaryContemporaryEvidenceEdition(digestMismatch),
    ).toThrow('app mapping/probe mismatch');
  });
});
