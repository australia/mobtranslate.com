import { z } from 'zod';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

const ReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
  rows: z.number().int().nonnegative(),
});

export const WajarriFiftyWordsDictionaryEditionContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: z.string().min(1),
  created_at_utc: z.string().datetime(),
  parent_edition_id: z.string().min(1),
  status: z.literal('reviewed_attested_source_extension'),
  scope: z.object({
    language: z.literal('Wajarri'),
    iso_639_3: z.literal('wbv'),
    glottocode: z.literal('waja1257'),
    variety: z.string().min(1),
    orthography: z.string().min(1),
  }),
  parent_manifest: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  task_review: z.object({
    manifest_path: z.string().min(1),
    manifest_sha256: Sha256Schema,
  }),
  audio_downloads: ReferenceSchema,
  audio_probes: ReferenceSchema,
  source_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  }),
  change_ledger: z.object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    issuing_change_id: z.string().min(1),
    accepted_change_ids: z.array(z.string().min(1)).length(1),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  expected_counts: z.object({
    parent_entries: z.number().int().nonnegative(),
    parent_senses: z.number().int().nonnegative(),
    parent_forms: z.number().int().nonnegative(),
    parent_examples: z.number().int().nonnegative(),
    parent_media_links: z.number().int().nonnegative(),
    added_entries: z.number().int().positive(),
    added_senses: z.number().int().positive(),
    added_forms: z.number().int().positive(),
    added_examples: z.number().int().positive(),
    added_media_links: z.number().int().positive(),
    direct_supervision_candidates: z.number().int().positive(),
    split_assigned_training_rows: z.literal(0),
    synthetic_eligible_rows: z.literal(0),
    productive_grammar_rules: z.literal(0),
  }),
  release_status: z.literal('not_released'),
});

const TaskReviewManifestSchema = z.object({
  schema_version: z.literal(1),
  review_id: z.string().min(1),
  components: z.object({
    taskDecisions: ReferenceSchema,
    lexicalSenseDecisions: ReferenceSchema,
    fixedUtteranceDecisions: ReferenceSchema,
    lexicalSurfaceGroups: ReferenceSchema,
    directSupervisionCandidates: ReferenceSchema,
    pairAudioLinks: ReferenceSchema,
  }),
  counts: z.object({
    sourcePairings: z.number().int().positive(),
    fixedUtterances: z.number().int().nonnegative(),
    lexicalSenses: z.number().int().nonnegative(),
    lexicalSurfaceGroups: z.number().int().nonnegative(),
    pairAudioLinks: z.number().int().nonnegative(),
    directSupervisionCandidates: z.number().int().nonnegative(),
    splitAssignedTrainingRows: z.literal(0),
    syntheticEligibleRows: z.literal(0),
    productiveGrammarRules: z.literal(0),
  }),
});

const LexicalSenseDecisionSchema = z.object({
  decisionId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  sourceId: z.literal('src-wbv-50words-a39-2019-20260723'),
  sourceOrdinal: z.number().int().positive(),
  speakerSource: z.string().min(1),
  englishSource: z.string().min(1),
  englishAlternateSource: z.string().min(1).nullable(),
  wajarriSource: z.string().min(1),
  sourceTaskClass: z.literal('lexical_concept_or_expression'),
  taskToken: z.literal('<lexeme>'),
  sourceSenseStatus: z.literal('accepted_exact_source_lexical_sense'),
  dictionaryIntegration: z.literal('accepted_source_entry_and_sense'),
  directSupervisionEligibility: z.literal(
    'eligible_noncommercial_after_split_assignment',
  ),
  splitAssignment: z.literal('unassigned'),
  sourceIndependenceStatus: z.literal('not_assumed'),
  partOfSpeechStatus: z.literal('not_inferred'),
  morphologicalAnalysisStatus: z.literal('not_inferred'),
  syntheticEligibility: z.literal(
    'blocked_pending_pos_morphology_and_productive_grammar',
  ),
  audioAssetIds: z.array(z.string().min(1)).length(3),
  currentDictionaryRelation: z.enum([
    'no_exact_current_headword',
    'unique_exact_current_headword',
    'multiple_exact_current_headwords',
  ]),
  currentDictionaryMatchIds: z.array(z.string().min(1)),
  claimLimit: z.string().min(1),
});

const FixedUtteranceDecisionSchema = z.object({
  decisionId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  sourceId: z.literal('src-wbv-50words-a39-2019-20260723'),
  sourceOrdinal: z.number().int().positive(),
  speakerSource: z.string().min(1),
  englishSource: z.string().min(1),
  englishAlternateSource: z.string().min(1).nullable(),
  wajarriSource: z.string().min(1),
  sourceTaskClass: z.literal('fixed_utterance'),
  taskToken: z.literal('<translate>'),
  sourceSenseStatus: z.literal('accepted_exact_source_fixed_utterance'),
  dictionaryIntegration: z.literal('example_only'),
  directSupervisionEligibility: z.literal(
    'eligible_noncommercial_after_split_assignment',
  ),
  splitAssignment: z.literal('unassigned'),
  sourceIndependenceStatus: z.literal('not_assumed'),
  partOfSpeechStatus: z.literal('not_inferred'),
  morphologicalAnalysisStatus: z.literal('not_inferred'),
  syntheticEligibility: z.literal('not_a_productive_template'),
  audioAssetIds: z.array(z.string().min(1)).length(3),
  claimLimit: z.string().min(1),
});

const LexicalSurfaceGroupSchema = z.object({
  lexicalEntryId: z.string().min(1),
  formId: z.string().min(1),
  wajarriSource: z.string().min(1),
  sourceRecordIds: z.array(z.string().min(1)).min(1),
  sourceOrdinals: z.array(z.number().int().positive()).min(1),
  englishSourceSenses: z.array(z.string().min(1)).min(1),
  senseDecisionIds: z.array(z.string().min(1)).min(1),
  speakerSource: z.string().min(1),
  sourceId: z.literal('src-wbv-50words-a39-2019-20260723'),
  orthographyStatus: z.literal('accepted_exact_source_spelling'),
  partOfSpeechStatus: z.literal('not_inferred'),
  morphologicalAnalysisStatus: z.literal('not_inferred'),
  syntheticEligibility: z.literal(
    'blocked_pending_pos_morphology_and_productive_grammar',
  ),
});

const DirectSupervisionCandidateSchema = z.object({
  datasetRecordId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  sourceOrdinal: z.number().int().positive(),
  taskType: z.enum(['lexical_reconstruction', 'fixed_utterance_translation']),
  taskToken: z.enum(['<lexeme>', '<translate>']),
  inputText: z.string().min(1),
  targetText: z.string().min(1),
  sourceId: z.literal('src-wbv-50words-a39-2019-20260723'),
  speakerSource: z.string().min(1),
  license: z.literal('CC BY-NC 4.0'),
  commercialUse: z.literal('not_allowed'),
  attributionRequired: z.literal(true),
  splitAssignment: z.literal('unassigned'),
  trainingStatus: z.literal('eligible_after_split_assignment'),
  benchmarkIndependence: z.literal('not_independent_if_in_training'),
  synthetic: z.literal(false),
  linguisticEvidenceRole: z.literal('direct_source_pair'),
  audioAssetIds: z.array(z.string().min(1)).length(3),
});

const PairAudioLinkSchema = z.object({
  mediaLinkId: z.string().min(1),
  sourceRecordId: z.string().min(1),
  assetId: z.string().min(1),
  archiveRelativePath: z.string().min(1),
  remoteUrl: z.string().url(),
  mediaType: z.enum(['audio/mpeg', 'audio/wav', 'video/webm']),
  speakerSource: z.string().min(1),
  decodeStatus: z.literal('passed_in_source_archive_audit'),
  trainingEligibility: z.literal(
    'eligible_noncommercial_after_split_assignment',
  ),
});

const DownloadSchema = z.object({
  assetId: z.string().min(1),
  archiveRelativePath: z.string().min(1),
  fileSizeBytes: z.number().int().positive(),
  remoteUrl: z.string().url(),
  responseContentType: z.string().min(1),
  sha256: Sha256Schema,
  sourceRecordId: z.string().min(1).nullable(),
  role: z.enum(['language_name', 'speaker_name', 'translation_pair']),
});

const ProbeSchema = z.object({
  assetId: z.string().min(1),
  archiveRelativePath: z.string().min(1),
  channels: z.number().int().positive(),
  codecName: z.string().min(1),
  durationSeconds: z.number().positive(),
  fullDecodeStatus: z.literal('passed'),
  sampleRate: z.number().int().positive(),
  sha256: Sha256Schema,
});

export type WajarriFiftyWordsDictionaryEditionContract = z.infer<
  typeof WajarriFiftyWordsDictionaryEditionContractSchema
>;

export interface WajarriFiftyWordsDictionaryEditionResult {
  entries: Array<Record<string, unknown>>;
  senses: Array<Record<string, unknown>>;
  forms: Array<Record<string, unknown>>;
  examples: Array<Record<string, unknown>>;
  mediaLinks: Array<Record<string, unknown>>;
  addedEntries: Array<Record<string, unknown>>;
  addedSenses: Array<Record<string, unknown>>;
  addedForms: Array<Record<string, unknown>>;
  addedExamples: Array<Record<string, unknown>>;
  addedMediaLinks: Array<Record<string, unknown>>;
  report: {
    parentEntries: number;
    parentSenses: number;
    parentForms: number;
    parentExamples: number;
    parentMediaLinks: number;
    addedEntries: number;
    addedSenses: number;
    addedForms: number;
    addedExamples: number;
    addedMediaLinks: number;
    totalEntries: number;
    totalSenses: number;
    totalForms: number;
    totalExamples: number;
    totalMediaLinks: number;
    acceptedEntries: number;
    acceptedSenses: number;
    acceptedForms: number;
    acceptedExamples: number;
    directSupervisionCandidates: number;
    splitAssignedTrainingRows: 0;
    syntheticEligibleRows: 0;
    productiveGrammarRules: 0;
  };
}

function assertUnique<T>(
  rows: T[],
  key: (row: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function assertExpected(
  report: WajarriFiftyWordsDictionaryEditionResult['report'],
  expected: WajarriFiftyWordsDictionaryEditionContract['expected_counts'],
): void {
  const comparisons: Array<[string, number, number]> = [
    ['parent_entries', report.parentEntries, expected.parent_entries],
    ['parent_senses', report.parentSenses, expected.parent_senses],
    ['parent_forms', report.parentForms, expected.parent_forms],
    ['parent_examples', report.parentExamples, expected.parent_examples],
    [
      'parent_media_links',
      report.parentMediaLinks,
      expected.parent_media_links,
    ],
    ['added_entries', report.addedEntries, expected.added_entries],
    ['added_senses', report.addedSenses, expected.added_senses],
    ['added_forms', report.addedForms, expected.added_forms],
    ['added_examples', report.addedExamples, expected.added_examples],
    ['added_media_links', report.addedMediaLinks, expected.added_media_links],
    [
      'direct_supervision_candidates',
      report.directSupervisionCandidates,
      expected.direct_supervision_candidates,
    ],
    [
      'split_assigned_training_rows',
      report.splitAssignedTrainingRows,
      expected.split_assigned_training_rows,
    ],
    [
      'synthetic_eligible_rows',
      report.syntheticEligibleRows,
      expected.synthetic_eligible_rows,
    ],
    [
      'productive_grammar_rules',
      report.productiveGrammarRules,
      expected.productive_grammar_rules,
    ],
  ];
  for (const [label, actual, wanted] of comparisons)
    if (actual !== wanted)
      throw new Error(
        `expected count mismatch for ${label}: ${actual} != ${wanted}`,
      );
}

export function buildWajarriFiftyWordsDictionaryEdition(input: {
  contractValue: unknown;
  taskReviewManifestValue: unknown;
  parentEntries: Array<Record<string, unknown>>;
  parentSenses: Array<Record<string, unknown>>;
  parentForms: Array<Record<string, unknown>>;
  parentExamples: Array<Record<string, unknown>>;
  parentMediaLinks: Array<Record<string, unknown>>;
  lexicalSenseDecisionRows: unknown[];
  fixedUtteranceDecisionRows: unknown[];
  lexicalSurfaceGroupRows: unknown[];
  directSupervisionCandidateRows: unknown[];
  pairAudioLinkRows: unknown[];
  downloadRows: unknown[];
  probeRows: unknown[];
}): WajarriFiftyWordsDictionaryEditionResult {
  const contract = WajarriFiftyWordsDictionaryEditionContractSchema.parse(
    input.contractValue,
  );
  const taskManifest = TaskReviewManifestSchema.parse(
    input.taskReviewManifestValue,
  );
  const lexicalDecisions = z
    .array(LexicalSenseDecisionSchema)
    .parse(input.lexicalSenseDecisionRows);
  const fixedDecisions = z
    .array(FixedUtteranceDecisionSchema)
    .parse(input.fixedUtteranceDecisionRows);
  const lexicalGroups = z
    .array(LexicalSurfaceGroupSchema)
    .parse(input.lexicalSurfaceGroupRows);
  const directRows = z
    .array(DirectSupervisionCandidateSchema)
    .parse(input.directSupervisionCandidateRows);
  const audioLinks = z
    .array(PairAudioLinkSchema)
    .parse(input.pairAudioLinkRows);
  const downloads = z.array(DownloadSchema).parse(input.downloadRows);
  const probes = z.array(ProbeSchema).parse(input.probeRows);

  if (taskManifest.counts.lexicalSenses !== lexicalDecisions.length)
    throw new Error('task-review lexical-sense count mismatch');
  if (taskManifest.counts.fixedUtterances !== fixedDecisions.length)
    throw new Error('task-review fixed-utterance count mismatch');
  if (taskManifest.counts.lexicalSurfaceGroups !== lexicalGroups.length)
    throw new Error('task-review lexical-surface count mismatch');
  if (taskManifest.counts.directSupervisionCandidates !== directRows.length)
    throw new Error('task-review direct-supervision count mismatch');
  if (taskManifest.counts.pairAudioLinks !== audioLinks.length)
    throw new Error('task-review audio-link count mismatch');

  assertUnique(lexicalDecisions, (row) => row.decisionId, 'sense decision ID');
  assertUnique(fixedDecisions, (row) => row.decisionId, 'example decision ID');
  assertUnique(lexicalGroups, (row) => row.lexicalEntryId, 'lexical entry ID');
  assertUnique(lexicalGroups, (row) => row.formId, 'lexical form ID');
  assertUnique(directRows, (row) => row.datasetRecordId, 'direct row ID');
  assertUnique(audioLinks, (row) => row.mediaLinkId, 'audio link ID');
  assertUnique(downloads, (row) => row.assetId, 'download asset ID');
  assertUnique(probes, (row) => row.assetId, 'probe asset ID');

  const groupByDecision = new Map<string, (typeof lexicalGroups)[number]>();
  for (const group of lexicalGroups) {
    if (
      group.sourceRecordIds.length !== group.sourceOrdinals.length ||
      group.sourceRecordIds.length !== group.englishSourceSenses.length ||
      group.sourceRecordIds.length !== group.senseDecisionIds.length
    )
      throw new Error(
        `unaligned lexical group arrays: ${group.lexicalEntryId}`,
      );
    for (const decisionId of group.senseDecisionIds) {
      if (groupByDecision.has(decisionId))
        throw new Error(
          `sense decision belongs to multiple groups: ${decisionId}`,
        );
      groupByDecision.set(decisionId, group);
    }
  }
  for (const decision of lexicalDecisions) {
    const group = groupByDecision.get(decision.decisionId);
    if (!group)
      throw new Error(
        `sense decision has no lexical group: ${decision.decisionId}`,
      );
    if (
      group.wajarriSource.normalize('NFC') !==
      decision.wajarriSource.normalize('NFC')
    )
      throw new Error(`sense/group surface mismatch: ${decision.decisionId}`);
  }
  if (groupByDecision.size !== lexicalDecisions.length)
    throw new Error('lexical groups reference an unknown sense decision');

  const downloadByAsset = new Map(downloads.map((row) => [row.assetId, row]));
  const probeByAsset = new Map(probes.map((row) => [row.assetId, row]));
  const lexicalDecisionByRecord = new Map(
    lexicalDecisions.map((row) => [row.sourceRecordId, row]),
  );
  const fixedDecisionByRecord = new Map(
    fixedDecisions.map((row) => [row.sourceRecordId, row]),
  );

  const addedEntries = lexicalGroups.map((group) => ({
    entryCandidateId: group.lexicalEntryId,
    headwordSource: group.wajarriSource,
    headwordComparison: group.wajarriSource
      .normalize('NFC')
      .toLocaleLowerCase('en'),
    sourceId: group.sourceId,
    sourceRecordId: group.sourceRecordIds[0],
    sourceRecordIds: group.sourceRecordIds,
    sourceOrdinals: group.sourceOrdinals,
    speakerSource: group.speakerSource,
    status: 'accepted',
    lexicalIdentityStatus: 'accepted_source_scoped_entry',
    partOfSpeechStatus: group.partOfSpeechStatus,
    rawPartOfSpeech: null,
    comparisonPartOfSpeech: null,
    directSupervisionEligibility:
      'eligible_noncommercial_after_split_assignment',
    splitAssignment: 'unassigned',
    syntheticEligibility: group.syntheticEligibility,
    sourceIndependenceStatus: 'not_assumed',
  }));
  const addedSenses = lexicalDecisions.map((decision) => {
    const group = groupByDecision.get(decision.decisionId)!;
    return {
      senseCandidateId: `${decision.sourceRecordId}-sense-accepted-v1`,
      entryCandidateId: group.lexicalEntryId,
      sourceRecordId: decision.sourceRecordId,
      sourceId: decision.sourceId,
      sourceOrdinal: decision.sourceOrdinal,
      translationSource: decision.englishSource,
      translationComparison: decision.englishSource
        .normalize('NFC')
        .toLocaleLowerCase('en'),
      definitionSource: decision.englishSource,
      englishAlternateSource: decision.englishAlternateSource,
      sourceFields: {
        translation: 'englishSource',
        definition: 'englishSource',
      },
      status: 'accepted',
      senseBoundaryStatus: 'accepted_exact_source_prompt',
      substitutableTranslationStatus: 'accepted_source_scoped_prompt_only',
      crossEntryRelationStatus: 'not_adjudicated',
      partOfSpeechStatus: decision.partOfSpeechStatus,
      morphologicalAnalysisStatus: decision.morphologicalAnalysisStatus,
      directSupervisionEligibility: decision.directSupervisionEligibility,
      splitAssignment: decision.splitAssignment,
      benchmarkInterpretation: 'closed_set_reconstruction_only_if_trained',
      sourceIndependenceStatus: decision.sourceIndependenceStatus,
      syntheticEligibility: decision.syntheticEligibility,
      claimLimit: decision.claimLimit,
    };
  });
  const addedForms = lexicalGroups.map((group) => ({
    formCandidateId: group.formId,
    entryCandidateId: group.lexicalEntryId,
    sourceRecordId: group.sourceRecordIds[0],
    sourceRecordIds: group.sourceRecordIds,
    sourceId: group.sourceId,
    surfaceSource: group.wajarriSource,
    surfaceComparison: group.wajarriSource
      .normalize('NFC')
      .toLocaleLowerCase('en'),
    formType: 'speaker_attributed_published_source_form',
    orthography: 'wajarri-50words-source-spelling-a39-v1',
    orthographyStatus: group.orthographyStatus,
    variety: 'source_unspecified_wajarri_a39',
    status: 'accepted',
    morphologicalAnalysisStatus: group.morphologicalAnalysisStatus,
    directSupervisionEligibility:
      'eligible_noncommercial_after_split_assignment',
    splitAssignment: 'unassigned',
    syntheticEligibility: group.syntheticEligibility,
  }));
  const addedExamples = fixedDecisions.map((decision) => ({
    exampleId: `${decision.sourceRecordId}-fixed-utterance-example-v1`,
    sourceRecordId: decision.sourceRecordId,
    sourceId: decision.sourceId,
    sourceOrdinal: decision.sourceOrdinal,
    speakerSource: decision.speakerSource,
    englishSource: decision.englishSource,
    englishAlternateSource: decision.englishAlternateSource,
    wajarriSource: decision.wajarriSource,
    exampleKind: 'speaker_attributed_fixed_utterance',
    status: 'accepted',
    taskToken: decision.taskToken,
    directSupervisionEligibility: decision.directSupervisionEligibility,
    splitAssignment: decision.splitAssignment,
    benchmarkInterpretation:
      'attested_fixed_utterance_regression_only_if_trained',
    sourceIndependenceStatus: decision.sourceIndependenceStatus,
    segmentationStatus: 'not_inferred',
    literalCompositionStatus: 'not_inferred',
    productiveGrammarStatus: 'not_inferred',
    syntheticEligibility: decision.syntheticEligibility,
    audioAssetIds: decision.audioAssetIds,
    claimLimit: decision.claimLimit,
  }));
  const exampleIdByRecord = new Map(
    addedExamples.map((row) => [row.sourceRecordId, row.exampleId]),
  );

  const addedMediaLinks = audioLinks.map((link) => {
    const download = downloadByAsset.get(link.assetId);
    const probe = probeByAsset.get(link.assetId);
    if (!download || !probe)
      throw new Error(`audio link lacks download or probe: ${link.assetId}`);
    if (
      download.sha256 !== probe.sha256 ||
      download.archiveRelativePath !== probe.archiveRelativePath ||
      download.archiveRelativePath !== link.archiveRelativePath ||
      download.sourceRecordId !== link.sourceRecordId ||
      download.role !== 'translation_pair'
    )
      throw new Error(`audio evidence identity mismatch: ${link.assetId}`);
    const lexicalDecision = lexicalDecisionByRecord.get(link.sourceRecordId);
    const fixedDecision = fixedDecisionByRecord.get(link.sourceRecordId);
    if (!!lexicalDecision === !!fixedDecision)
      throw new Error(
        `audio link task identity is ambiguous: ${link.mediaLinkId}`,
      );
    const entryCandidateId = lexicalDecision
      ? groupByDecision.get(lexicalDecision.decisionId)?.lexicalEntryId
      : null;
    const exampleId = fixedDecision
      ? exampleIdByRecord.get(fixedDecision.sourceRecordId)
      : null;
    if (lexicalDecision && !entryCandidateId)
      throw new Error(`audio link lacks lexical entry: ${link.mediaLinkId}`);
    if (fixedDecision && !exampleId)
      throw new Error(`audio link lacks fixed example: ${link.mediaLinkId}`);
    return {
      mediaLinkId: link.mediaLinkId,
      entryCandidateId: entryCandidateId,
      exampleId,
      sourceRecordId: link.sourceRecordId,
      sourceId: 'src-wbv-50words-a39-2019-20260723',
      assetId: link.assetId,
      mediaKind: 'audio',
      sourcePointer: download.remoteUrl,
      archivePath: `sources/raw/50words-wajarri-a39-20260723/${download.archiveRelativePath}`,
      contentSha256: download.sha256,
      fileSizeBytes: download.fileSizeBytes,
      responseContentType: download.responseContentType,
      codecName: probe.codecName,
      durationMs: Math.round(probe.durationSeconds * 1000),
      channels: probe.channels,
      sampleRate: probe.sampleRate,
      decodeStatus: probe.fullDecodeStatus,
      speakerName: link.speakerSource,
      speakerAttributionStatus: 'exact_source_pair_attribution',
      status: 'accepted',
      license: 'CC BY-NC 4.0',
      commercialUse: 'not_allowed',
      attributionRequired: true,
      trainingEligibility: link.trainingEligibility,
      splitAssignment: 'unassigned',
    };
  });

  const entries = [...input.parentEntries, ...addedEntries];
  const senses = [...input.parentSenses, ...addedSenses];
  const forms = [...input.parentForms, ...addedForms];
  const examples = [...input.parentExamples, ...addedExamples];
  const mediaLinks = [...input.parentMediaLinks, ...addedMediaLinks];
  assertUnique(
    entries,
    (row) => z.string().parse(row.entryCandidateId),
    'edition entry ID',
  );
  assertUnique(
    senses,
    (row) => z.string().parse(row.senseCandidateId),
    'edition sense ID',
  );
  assertUnique(
    forms,
    (row) => z.string().parse(row.formCandidateId),
    'edition form ID',
  );
  assertUnique(
    examples,
    (row) => z.string().parse(row.exampleId),
    'edition example ID',
  );
  assertUnique(
    mediaLinks,
    (row) => z.string().parse(row.mediaLinkId),
    'edition media-link ID',
  );

  const report: WajarriFiftyWordsDictionaryEditionResult['report'] = {
    parentEntries: input.parentEntries.length,
    parentSenses: input.parentSenses.length,
    parentForms: input.parentForms.length,
    parentExamples: input.parentExamples.length,
    parentMediaLinks: input.parentMediaLinks.length,
    addedEntries: addedEntries.length,
    addedSenses: addedSenses.length,
    addedForms: addedForms.length,
    addedExamples: addedExamples.length,
    addedMediaLinks: addedMediaLinks.length,
    totalEntries: entries.length,
    totalSenses: senses.length,
    totalForms: forms.length,
    totalExamples: examples.length,
    totalMediaLinks: mediaLinks.length,
    acceptedEntries: addedEntries.length,
    acceptedSenses: addedSenses.length,
    acceptedForms: addedForms.length,
    acceptedExamples: addedExamples.length,
    directSupervisionCandidates: directRows.length,
    splitAssignedTrainingRows: 0,
    syntheticEligibleRows: 0,
    productiveGrammarRules: 0,
  };
  assertExpected(report, contract.expected_counts);
  return {
    entries,
    senses,
    forms,
    examples,
    mediaLinks,
    addedEntries,
    addedSenses,
    addedForms,
    addedExamples,
    addedMediaLinks,
    report,
  };
}
