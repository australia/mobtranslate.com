import { z } from 'zod';

const ParentMediaSchema = z
  .object({
    mediaLinkId: z.string().min(1),
    entryCandidateId: z.string().min(1),
    mediaKind: z.enum(['audio', 'image']),
    sourcePointer: z.string().min(1),
    resolutionStatus: z.string().min(1),
  })
  .passthrough();

const ReviewSchema = z
  .object({
    reviewItemId: z.string().min(1),
  })
  .passthrough();

const AppMapSchema = z.object({
  sourceRecordId: z.string().min(1),
  sourceOrdinal: z.number().int().positive(),
  entryCandidateId: z.string().min(1),
  mediaLinkId: z.string().min(1),
  headword: z.string().min(1),
  sourcePointer: z.string().regex(/^Track\d+\.mp3$/u),
  assetId: z.string().min(1),
  originalUrl: z.string().url(),
  replayUrl: z.string().url(),
  archiveRelativePath: z.string().min(1),
  captureTimestamp: z.string().regex(/^\d{14}$/u),
  cdxDigestSha1Base32: z.string().regex(/^[A-Z2-7]{32}$/u),
  resolutionStatus: z.literal('wayback_capture_identified'),
  linguisticStatus: z.literal('candidate'),
  trainingUse: z.literal('not_allowed'),
});

const ProbeSchema = z.object({
  assetId: z.string().min(1),
  assetKind: z.literal('audio'),
  archiveRelativePath: z.string().min(1),
  contentSha1Base32: z.string().regex(/^[A-Z2-7]{32}$/u),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/u),
  fileSizeBytes: z.number().int().positive(),
  dictionaryReferenceCount: z.number().int().nonnegative(),
  validationStatus: z.literal('cdx_digest_verified'),
  codecName: z.literal('mp3'),
  durationMs: z.number().int().positive(),
  durationSeconds: z.number().positive(),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().positive(),
  decodeStatus: z.literal('passed'),
});

const AppAssetSchema = z.object({
  assetId: z.string().min(1),
  assetKind: z.string().min(1),
  originalUrl: z.string().url(),
  replayUrl: z.string().url(),
  archiveRelativePath: z.string().min(1),
  dictionaryReferenceCount: z.number().int().nonnegative(),
});

const GgwCrosswalkSchema = z
  .object({
    sourceRecordId: z.string().min(1),
    snapshotId: z.string().min(1),
    sourceItemNumber: z.number().int().positive(),
    headwordSource: z.string().min(1),
    englishSource: z.string().min(1),
    categorySource: z.string().min(1),
    sourceSurfaceTokenCount: z.number().int().positive(),
    sourceUnitKind: z.enum(['single_surface_form', 'multiword_expression']),
    currentCandidates: z.array(
      z
        .object({
          sourceRecordId: z.string().min(1),
          entryCandidateId: z.string().min(1),
        })
        .passthrough(),
    ),
    reviewCandidates: z
      .array(
        z
          .object({
            sourceRecordId: z.string().min(1),
            entryCandidateId: z.string().min(1),
            combinedReviewScore: z.number().min(0).max(1),
          })
          .passthrough(),
      )
      .length(5),
    relationStatus: z.enum([
      'exact_headword_and_english_candidate',
      'exact_headword_gloss_review',
      'no_exact_headword_review',
    ]),
    automaticMergeAllowed: z.literal(false),
    trainingUse: z.literal('not_allowed'),
  })
  .passthrough();

export interface SpeakerAttribution {
  speakerId: string;
  speakerName: string;
  sourceId: string;
  sourcePath: string;
  sourceSha256: string;
  sourcePage: number;
  pageRenderingPath: string;
  pageRenderingSha256: string;
  attributionClaim: string;
  attributionScope: 'entire_app_database_approximately_2000_words';
  verificationStatus: 'source_level_attribution';
}

export interface DictionaryContemporaryEvidenceInput {
  parentMediaLinks: unknown[];
  parentReviewQueue: unknown[];
  appMapRows: unknown[];
  appProbeRows: unknown[];
  appAssetRows: unknown[];
  ggwCrosswalkRows: unknown[];
  speakerAttribution: SpeakerAttribution;
  appSourceId: string;
  ggwSourceId: string;
  archiveProgramPath: string;
}

export interface DictionaryContemporaryEvidenceResult {
  mediaLinks: unknown[];
  reviewQueue: unknown[];
  contemporaryEvidenceLinks: unknown[];
  unlinkedAudio: unknown[];
  report: {
    parentMediaLinks: number;
    resolvedAudioLinks: number;
    unresolvedImageLinks: number;
    attributedSpeakerLinks: number;
    contemporaryEvidenceLinks: number;
    exactHeadwordAndEnglishCandidates: number;
    exactHeadwordGlossReviews: number;
    noExactHeadwordReviews: number;
    noExactSingleSurfaceForms: number;
    noExactMultiwordExpressions: number;
    unlinkedAudioCandidates: number;
    inheritedReviewItems: number;
    addedLexicalReviewItems: number;
    addedUnlinkedAudioReviewItems: number;
    totalReviewItems: number;
    acceptedLexicalRows: 0;
    trainingEligibleRows: 0;
  };
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildDictionaryContemporaryEvidenceEdition(
  input: DictionaryContemporaryEvidenceInput,
): DictionaryContemporaryEvidenceResult {
  const parentMediaLinks = input.parentMediaLinks.map((row) =>
    ParentMediaSchema.parse(row),
  );
  const parentReviewQueue = input.parentReviewQueue.map((row) =>
    ReviewSchema.parse(row),
  );
  const appMapRows = input.appMapRows.map((row) => AppMapSchema.parse(row));
  const appProbeRows = input.appProbeRows.map((row) => ProbeSchema.parse(row));
  const appAssetRows = input.appAssetRows.map((row) =>
    AppAssetSchema.parse(row),
  );
  const ggwRows = input.ggwCrosswalkRows.map((row) =>
    GgwCrosswalkSchema.parse(row),
  );

  assertUnique(
    parentMediaLinks.map((row) => row.mediaLinkId),
    'parent media link ID',
  );
  assertUnique(
    parentReviewQueue.map((row) => row.reviewItemId),
    'parent review item ID',
  );
  assertUnique(
    appMapRows.map((row) => row.mediaLinkId),
    'app map media link ID',
  );
  assertUnique(
    appProbeRows.map((row) => row.assetId),
    'app probe asset ID',
  );
  assertUnique(
    appAssetRows.map((row) => row.assetId),
    'app asset ID',
  );
  assertUnique(
    ggwRows.map((row) => row.sourceRecordId),
    'GGW source record ID',
  );

  const mapByMediaLink = new Map(
    appMapRows.map((row) => [row.mediaLinkId, row]),
  );
  const probeByAsset = new Map(appProbeRows.map((row) => [row.assetId, row]));
  const audioParentRows = parentMediaLinks.filter(
    (row) => row.mediaKind === 'audio',
  );
  if (audioParentRows.length !== appMapRows.length)
    throw new Error(
      `audio parent/app map count mismatch: ${audioParentRows.length} != ${appMapRows.length}`,
    );

  const mediaLinks = parentMediaLinks.map((parent) => {
    if (parent.mediaKind !== 'audio') return parent;
    const mapping = mapByMediaLink.get(parent.mediaLinkId);
    if (!mapping)
      throw new Error(`missing app mapping for ${parent.mediaLinkId}`);
    if (
      mapping.entryCandidateId !== parent.entryCandidateId ||
      mapping.sourcePointer !== parent.sourcePointer
    )
      throw new Error(
        `app mapping identity mismatch for ${parent.mediaLinkId}`,
      );
    const probe = probeByAsset.get(mapping.assetId);
    if (!probe) throw new Error(`missing decoded probe for ${mapping.assetId}`);
    if (
      probe.archiveRelativePath !== mapping.archiveRelativePath ||
      probe.contentSha1Base32 !== mapping.cdxDigestSha1Base32 ||
      probe.dictionaryReferenceCount !== 1
    )
      throw new Error(`app mapping/probe mismatch for ${mapping.assetId}`);
    return {
      ...parent,
      archivePath: `${input.archiveProgramPath}/${mapping.archiveRelativePath}`,
      resolutionStatus: 'archived_cdx_digest_and_decode_verified',
      archiveSourceId: input.appSourceId,
      archiveAssetId: mapping.assetId,
      archiveOriginalUrl: mapping.originalUrl,
      archiveReplayUrl: mapping.replayUrl,
      archiveCaptureTimestamp: mapping.captureTimestamp,
      cdxDigestSha1Base32: mapping.cdxDigestSha1Base32,
      contentSha256: probe.contentSha256,
      fileSizeBytes: probe.fileSizeBytes,
      codecName: probe.codecName,
      durationMs: probe.durationMs,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      decodeStatus: probe.decodeStatus,
      speakerId: input.speakerAttribution.speakerId,
      speakerName: input.speakerAttribution.speakerName,
      speakerAttributionStatus: input.speakerAttribution.verificationStatus,
      speakerAttributionScope: input.speakerAttribution.attributionScope,
      speakerAttributionEvidence: input.speakerAttribution,
      trainingEligibility: 'not_allowed',
      status: 'candidate',
    };
  });

  const contemporaryEvidenceLinks = ggwRows.map((row) => ({
    schemaVersion: 1,
    evidenceLinkId: `${row.sourceRecordId}-dictionary-evidence-link`,
    evidenceSourceId: input.ggwSourceId,
    evidenceSourceRecordId: row.sourceRecordId,
    snapshotId: row.snapshotId,
    sourceItemNumber: row.sourceItemNumber,
    sourceHeadword: row.headwordSource,
    sourceEnglish: row.englishSource,
    sourceCategory: row.categorySource,
    sourceSurfaceTokenCount: row.sourceSurfaceTokenCount,
    sourceUnitKind: row.sourceUnitKind,
    exactCurrentEntryCandidateIds: row.currentCandidates.map(
      (candidate) => candidate.entryCandidateId,
    ),
    reviewCandidates: row.reviewCandidates,
    relationStatus: row.relationStatus,
    sourceIndependence: 'same_project_dictionary_plus_local_speaker_input',
    automaticMergeAllowed: false,
    trainingEligibility: 'not_allowed',
    status: 'candidate',
  }));

  const unlinkedAudio = appAssetRows
    .filter(
      (asset) =>
        asset.assetKind === 'audio' && asset.dictionaryReferenceCount === 0,
    )
    .map((asset) => {
      const probe = probeByAsset.get(asset.assetId);
      if (!probe)
        throw new Error(
          `missing decoded probe for unlinked audio ${asset.assetId}`,
        );
      return {
        schemaVersion: 1,
        unlinkedAudioId: `${asset.assetId}-unlinked`,
        archiveSourceId: input.appSourceId,
        archiveAssetId: asset.assetId,
        originalUrl: asset.originalUrl,
        replayUrl: asset.replayUrl,
        archivePath: `${input.archiveProgramPath}/${asset.archiveRelativePath}`,
        contentSha256: probe.contentSha256,
        durationMs: probe.durationMs,
        sampleRate: probe.sampleRate,
        channels: probe.channels,
        decodeStatus: probe.decodeStatus,
        lexicalMappingStatus: 'unlinked_no_source_metadata',
        inferenceAllowed: false,
        trainingEligibility: 'not_allowed',
        status: 'candidate',
      };
    });
  assertUnique(
    unlinkedAudio.map((row) => row.unlinkedAudioId),
    'unlinked audio ID',
  );

  const lexicalReviews = contemporaryEvidenceLinks
    .filter(
      (row) => row.relationStatus !== 'exact_headword_and_english_candidate',
    )
    .map((row) => ({
      schemaVersion: 1,
      reviewItemId: `${row.evidenceSourceRecordId}-dictionary-relation-review`,
      reviewKind:
        row.relationStatus === 'no_exact_headword_review'
          ? 'contemporary_source_no_exact_headword'
          : 'contemporary_source_gloss_relation',
      sourceRecordId: row.evidenceSourceRecordId,
      evidenceLinkId: row.evidenceLinkId,
      sourceHeadword: row.sourceHeadword,
      sourceEnglish: row.sourceEnglish,
      sourceUnitKind: row.sourceUnitKind,
      candidateEntryIds: row.reviewCandidates.map(
        (candidate) => candidate.entryCandidateId,
      ),
      automaticDecisionAllowed: false,
      trainingEligibility: 'not_allowed',
      status: 'pending',
    }));
  const unlinkedAudioReviews = unlinkedAudio.map((row) => ({
    schemaVersion: 1,
    reviewItemId: `${row.archiveAssetId}-lexical-mapping-review`,
    reviewKind: 'unlinked_archived_audio',
    archiveAssetId: row.archiveAssetId,
    unlinkedAudioId: row.unlinkedAudioId,
    reason:
      'No archived dictionary payload, HTML, ID3 metadata, or source record maps this recording to a word.',
    inferenceAllowed: false,
    trainingEligibility: 'not_allowed',
    status: 'pending',
  }));
  const reviewQueue = [
    ...parentReviewQueue,
    ...lexicalReviews,
    ...unlinkedAudioReviews,
  ];
  assertUnique(
    reviewQueue.map((row) => row.reviewItemId),
    'combined review item ID',
  );

  const noExactRows = ggwRows.filter(
    (row) => row.relationStatus === 'no_exact_headword_review',
  );
  return {
    mediaLinks,
    reviewQueue,
    contemporaryEvidenceLinks,
    unlinkedAudio,
    report: {
      parentMediaLinks: parentMediaLinks.length,
      resolvedAudioLinks: mediaLinks.filter(
        (row) =>
          row.mediaKind === 'audio' &&
          row.resolutionStatus === 'archived_cdx_digest_and_decode_verified',
      ).length,
      unresolvedImageLinks: mediaLinks.filter(
        (row) =>
          row.mediaKind === 'image' &&
          row.resolutionStatus === 'source_pointer_unresolved',
      ).length,
      attributedSpeakerLinks: mediaLinks.filter(
        (row) =>
          row.mediaKind === 'audio' &&
          row.speakerId === input.speakerAttribution.speakerId,
      ).length,
      contemporaryEvidenceLinks: contemporaryEvidenceLinks.length,
      exactHeadwordAndEnglishCandidates: ggwRows.filter(
        (row) => row.relationStatus === 'exact_headword_and_english_candidate',
      ).length,
      exactHeadwordGlossReviews: ggwRows.filter(
        (row) => row.relationStatus === 'exact_headword_gloss_review',
      ).length,
      noExactHeadwordReviews: noExactRows.length,
      noExactSingleSurfaceForms: noExactRows.filter(
        (row) => row.sourceUnitKind === 'single_surface_form',
      ).length,
      noExactMultiwordExpressions: noExactRows.filter(
        (row) => row.sourceUnitKind === 'multiword_expression',
      ).length,
      unlinkedAudioCandidates: unlinkedAudio.length,
      inheritedReviewItems: parentReviewQueue.length,
      addedLexicalReviewItems: lexicalReviews.length,
      addedUnlinkedAudioReviewItems: unlinkedAudioReviews.length,
      totalReviewItems: reviewQueue.length,
      acceptedLexicalRows: 0,
      trainingEligibleRows: 0,
    },
  };
}
