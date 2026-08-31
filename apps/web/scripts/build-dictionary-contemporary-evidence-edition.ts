import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import { verifyAppendOnlyLedger } from '../lib/research/appendOnlyLedger';
import {
  buildDictionaryContemporaryEvidenceEdition,
  type SpeakerAttribution,
} from '../lib/research/dictionaryContemporaryEvidenceEdition';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const ArtifactSchema = z.object({
  path: z.string().min(1),
  sha256: Sha256Schema,
});
const RowArtifactSchema = ArtifactSchema.extend({
  rows: z.number().int().nonnegative(),
});
const ContractSchema = z.object({
  schema_version: z.literal(1),
  edition_id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/u),
  parent_edition_id: z.string().min(1),
  created_at_utc: z.string().datetime(),
  status: z.literal('candidate_contemporary_and_media_evidence'),
  scope: z.object({
    language: z.string().min(1),
    iso_639_3: z.string().length(3),
    glottocode: z.string().min(1),
    variety: z.string().min(1),
    orthographies: z.array(z.string().min(1)).min(1),
  }),
  parent_manifest: ArtifactSchema,
  source_ledger: ArtifactSchema,
  change_ledger: ArtifactSchema.extend({
    recorded_candidate_change_ids: z.array(z.string().min(1)).min(1),
  }),
  app_archive: z.object({
    source_id: z.string().min(1),
    archive_program_path: z.string().min(1),
    dictionary_audio_crosswalk: RowArtifactSchema,
    audio_probes: RowArtifactSchema,
    assets: RowArtifactSchema,
    audit_report: ArtifactSchema,
  }),
  contemporary_lexicon: z.object({
    source_id: z.string().min(1),
    crosswalk_2021: RowArtifactSchema,
    lexical_evidence_report: ArtifactSchema,
    audit_report: ArtifactSchema,
  }),
  speaker_attribution: z.object({
    speaker_id: z.string().min(1),
    speaker_name: z.string().min(1),
    source_id: z.string().min(1),
    source_artifact: ArtifactSchema,
    source_page: z.number().int().positive(),
    page_rendering: ArtifactSchema,
    attribution_claim: z.string().min(1),
    attribution_scope: z.literal(
      'entire_app_database_approximately_2000_words',
    ),
    verification_status: z.literal('source_level_attribution'),
  }),
  expected_counts: z.object({
    resolved_audio_links: z.number().int().nonnegative(),
    unresolved_image_links: z.number().int().nonnegative(),
    attributed_speaker_links: z.number().int().nonnegative(),
    contemporary_evidence_links: z.number().int().nonnegative(),
    exact_headword_and_english_candidates: z.number().int().nonnegative(),
    exact_headword_gloss_reviews: z.number().int().nonnegative(),
    no_exact_headword_reviews: z.number().int().nonnegative(),
    no_exact_single_surface_forms: z.number().int().nonnegative(),
    no_exact_multiword_expressions: z.number().int().nonnegative(),
    unlinked_audio_candidates: z.number().int().nonnegative(),
    added_lexical_review_items: z.number().int().nonnegative(),
    added_unlinked_audio_review_items: z.number().int().nonnegative(),
  }),
  current_pointer_path: z.string().min(1),
  supersedes_pointer_sha256: Sha256Schema,
  release_status: z.literal('not_released'),
});

type Artifact = z.infer<typeof ArtifactSchema>;
type RowArtifact = z.infer<typeof RowArtifactSchema>;

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error(`path must be relative to program root: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes program root: ${relativePath}`);
  return resolved;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readVerified(root: string, artifact: Artifact): Buffer {
  const bytes = readFileSync(resolveWithin(root, artifact.path));
  const actual = sha256(bytes);
  if (actual !== artifact.sha256)
    throw new Error(
      `hash mismatch for ${artifact.path}: ${actual} != ${artifact.sha256}`,
    );
  return bytes;
}

function parseJsonLines(bytes: Buffer): unknown[] {
  return bytes
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

function readRows(root: string, artifact: RowArtifact): unknown[] {
  const rows = parseJsonLines(readVerified(root, artifact));
  if (rows.length !== artifact.rows)
    throw new Error(
      `row count mismatch for ${artifact.path}: ${rows.length} != ${artifact.rows}`,
    );
  return rows;
}

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== content)
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o664 });
}

function writePointer(
  filePath: string,
  content: string,
  expectedPreviousHash: string,
): void {
  const previous = readFileSync(filePath);
  if (previous.toString('utf8') === content) return;
  const previousHash = sha256(previous);
  if (previousHash !== expectedPreviousHash)
    throw new Error(
      `current pointer hash mismatch: ${previousHash} != ${expectedPreviousHash}`,
    );
  const temporary = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o664 });
    renameSync(temporary, filePath);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

function component(
  manifest: Record<string, unknown>,
  key: string,
): RowArtifact {
  return RowArtifactSchema.parse(
    (manifest.components as Record<string, unknown> | undefined)?.[key],
  );
}

function assertExpectedCounts(
  actual: Record<string, number>,
  expected: Record<string, number>,
): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];
    if (actualValue !== expectedValue)
      throw new Error(
        `expected count mismatch for ${key}: ${String(actualValue)} != ${expectedValue}`,
      );
  }
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-dictionary-contemporary-evidence-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = ContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const parentManifest = JSON.parse(
    readVerified(programRoot, contract.parent_manifest).toString('utf8'),
  ) as Record<string, unknown>;
  if (parentManifest.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match its manifest');

  const sourceLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.source_ledger.path),
  );
  verifyAppendOnlyLedger(sourceLedgerBytes, contract.source_ledger.sha256);
  const sourceRows = parseJsonLines(sourceLedgerBytes).map((row) =>
    z
      .object({
        source_id: z.string(),
        training_use: z.string(),
        redistribution: z.string(),
        derived_weights: z.string(),
        hosted_transfer: z.string(),
      })
      .passthrough()
      .parse(row),
  );
  const requiredSourceIds = [
    contract.app_archive.source_id,
    contract.contemporary_lexicon.source_id,
    contract.speaker_attribution.source_id,
  ];
  for (const sourceId of requiredSourceIds) {
    const source = sourceRows.find((row) => row.source_id === sourceId);
    if (!source)
      throw new Error(
        `required source is absent from source ledger: ${sourceId}`,
      );
    for (const field of [
      'training_use',
      'redistribution',
      'derived_weights',
      'hosted_transfer',
    ] as const) {
      if (source[field] !== 'not_allowed')
        throw new Error(
          `required source ${sourceId} has unexpected ${field}: ${source[field]}`,
        );
    }
  }

  const changeLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.change_ledger.path),
  );
  verifyAppendOnlyLedger(changeLedgerBytes, contract.change_ledger.sha256);
  const changeRows = parseJsonLines(changeLedgerBytes).map((row) =>
    z
      .object({ change_id: z.string(), status: z.string() })
      .passthrough()
      .parse(row),
  );
  for (const changeId of contract.change_ledger.recorded_candidate_change_ids) {
    const change = changeRows.find((row) => row.change_id === changeId);
    if (!change || change.status !== 'candidate')
      throw new Error(
        `recorded candidate change is absent or not candidate: ${changeId}`,
      );
  }

  const parentKeys = [
    'entries',
    'senses',
    'forms',
    'examples',
    'mediaLinks',
    'conflicts',
    'reviewQueue',
    'crosswalkCandidates',
  ] as const;
  const parentRows = Object.fromEntries(
    parentKeys.map((key) => {
      const descriptor = component(parentManifest, key);
      return [key, readRows(programRoot, descriptor)];
    }),
  ) as Record<(typeof parentKeys)[number], unknown[]>;

  readVerified(programRoot, contract.app_archive.audit_report);
  readVerified(programRoot, contract.contemporary_lexicon.audit_report);
  readVerified(
    programRoot,
    contract.contemporary_lexicon.lexical_evidence_report,
  );
  readVerified(programRoot, contract.speaker_attribution.source_artifact);
  readVerified(programRoot, contract.speaker_attribution.page_rendering);
  const speakerAttribution: SpeakerAttribution = {
    speakerId: contract.speaker_attribution.speaker_id,
    speakerName: contract.speaker_attribution.speaker_name,
    sourceId: contract.speaker_attribution.source_id,
    sourcePath: contract.speaker_attribution.source_artifact.path,
    sourceSha256: contract.speaker_attribution.source_artifact.sha256,
    sourcePage: contract.speaker_attribution.source_page,
    pageRenderingPath: contract.speaker_attribution.page_rendering.path,
    pageRenderingSha256: contract.speaker_attribution.page_rendering.sha256,
    attributionClaim: contract.speaker_attribution.attribution_claim,
    attributionScope: contract.speaker_attribution.attribution_scope,
    verificationStatus: contract.speaker_attribution.verification_status,
  };

  const result = buildDictionaryContemporaryEvidenceEdition({
    parentMediaLinks: parentRows.mediaLinks,
    parentReviewQueue: parentRows.reviewQueue,
    appMapRows: readRows(
      programRoot,
      contract.app_archive.dictionary_audio_crosswalk,
    ),
    appProbeRows: readRows(programRoot, contract.app_archive.audio_probes),
    appAssetRows: readRows(programRoot, contract.app_archive.assets),
    ggwCrosswalkRows: readRows(
      programRoot,
      contract.contemporary_lexicon.crosswalk_2021,
    ),
    speakerAttribution,
    appSourceId: contract.app_archive.source_id,
    ggwSourceId: contract.contemporary_lexicon.source_id,
    archiveProgramPath: contract.app_archive.archive_program_path,
  });
  const actualExpectedCounts = {
    resolved_audio_links: result.report.resolvedAudioLinks,
    unresolved_image_links: result.report.unresolvedImageLinks,
    attributed_speaker_links: result.report.attributedSpeakerLinks,
    contemporary_evidence_links: result.report.contemporaryEvidenceLinks,
    exact_headword_and_english_candidates:
      result.report.exactHeadwordAndEnglishCandidates,
    exact_headword_gloss_reviews: result.report.exactHeadwordGlossReviews,
    no_exact_headword_reviews: result.report.noExactHeadwordReviews,
    no_exact_single_surface_forms: result.report.noExactSingleSurfaceForms,
    no_exact_multiword_expressions: result.report.noExactMultiwordExpressions,
    unlinked_audio_candidates: result.report.unlinkedAudioCandidates,
    added_lexical_review_items: result.report.addedLexicalReviewItems,
    added_unlinked_audio_review_items:
      result.report.addedUnlinkedAudioReviewItems,
  };
  assertExpectedCounts(actualExpectedCounts, contract.expected_counts);

  const editionRelativeRoot = `dictionary/editions/${contract.edition_id}`;
  const editionRoot = resolveWithin(programRoot, editionRelativeRoot);
  const outputRows = {
    entries: parentRows.entries,
    senses: parentRows.senses,
    forms: parentRows.forms,
    examples: parentRows.examples,
    mediaLinks: result.mediaLinks,
    conflicts: parentRows.conflicts,
    reviewQueue: result.reviewQueue,
    crosswalkCandidates: parentRows.crosswalkCandidates,
    contemporaryEvidenceLinks: result.contemporaryEvidenceLinks,
    unlinkedAudio: result.unlinkedAudio,
  };
  const contents = Object.fromEntries(
    Object.entries(outputRows).map(([key, rows]) => [key, jsonLines(rows)]),
  ) as Record<keyof typeof outputRows, string>;
  const fileNames: Record<keyof typeof outputRows, string> = {
    entries: 'entries.jsonl',
    senses: 'senses.jsonl',
    forms: 'forms.jsonl',
    examples: 'examples.jsonl',
    mediaLinks: 'media-links.jsonl',
    conflicts: 'conflicts.jsonl',
    reviewQueue: 'review-queue.jsonl',
    crosswalkCandidates: 'historical-current-crosswalk-candidates.jsonl',
    contemporaryEvidenceLinks: 'contemporary-evidence-links.jsonl',
    unlinkedAudio: 'unlinked-audio.jsonl',
  };
  const components = Object.fromEntries(
    Object.entries(contents).map(([key, content]) => [
      key,
      {
        path: `${editionRelativeRoot}/${fileNames[key as keyof typeof outputRows]}`,
        sha256: sha256(content),
        rows: outputRows[key as keyof typeof outputRows].length,
      },
    ]),
  );
  const edition = {
    schema_version: 1,
    edition_id: contract.edition_id,
    created_at_utc: contract.created_at_utc,
    parent_edition_id: contract.parent_edition_id,
    status: contract.status,
    scope: contract.scope,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    parent_manifest: contract.parent_manifest,
    source_ledger_sha256: contract.source_ledger.sha256,
    change_ledger_sha256: contract.change_ledger.sha256,
    recorded_candidate_change_ids:
      contract.change_ledger.recorded_candidate_change_ids,
    evidence_inputs: {
      app_archive: contract.app_archive,
      contemporary_lexicon: contract.contemporary_lexicon,
      speaker_attribution: contract.speaker_attribution,
    },
    components,
    counts: {
      entries: parentRows.entries.length,
      senses: parentRows.senses.length,
      forms: parentRows.forms.length,
      examples: parentRows.examples.length,
      conflicts: parentRows.conflicts.length,
      historicalCrosswalkCandidates: parentRows.crosswalkCandidates.length,
      ...result.report,
      acceptedEntries: 0,
      acceptedSenses: 0,
      acceptedForms: 0,
      acceptedMediaMappings: 0,
      trainingEligibleRows: 0,
    },
    evidence_policy: {
      app_audio:
        'Exact archived payload mapping and full decode resolve media identity only; they do not accept a lexical form or training right.',
      speaker_attribution:
        'The newsletter supports source-level attribution across the app database; no hidden per-file speaker metadata was inferred.',
      contemporary_lexicon:
        'Same-project corroboration and conflict evidence only; no lexical identity, spelling relation, sense relation, or source independence is inferred.',
      unlinked_audio:
        'Preserved as review candidates; filenames and similarity are insufficient to infer lexical mappings.',
    },
    accepted_change_ids: [],
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit:
      'This edition resolves archived media identity and adds contemporary source relations as candidates. It accepts no new lexical fact, speaker-per-file claim, training row, redistribution right, hosted-transfer right, or model-weight right.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestPath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256(editionContent);
  const currentPointer = {
    schema_version: 1,
    artifact: 'dictionary',
    current_edition_id: contract.edition_id,
    manifest_path: editionManifestPath,
    manifest_sha256: editionManifestSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const currentPointerContent = `${JSON.stringify(currentPointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    for (const [key, content] of Object.entries(contents))
      writeImmutable(
        path.join(editionRoot, fileNames[key as keyof typeof outputRows]),
        content,
      );
    writeImmutable(path.join(editionRoot, 'EDITION.json'), editionContent);
    writePointer(
      resolveWithin(programRoot, contract.current_pointer_path),
      currentPointerContent,
      contract.supersedes_pointer_sha256,
    );
  }
  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        editionId: contract.edition_id,
        editionManifestPath,
        editionManifestSha256,
        currentPointerSha256: sha256(currentPointerContent),
        counts: edition.counts,
        components,
      },
      null,
      2,
    ),
  );
}

main();
