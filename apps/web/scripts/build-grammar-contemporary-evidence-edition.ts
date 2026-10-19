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
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildGrammarContemporaryEvidenceEdition,
  GrammarContemporaryEvidenceContractSchema,
} from '../lib/research/grammarContemporaryEvidenceEdition';

const ReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  rows: z.number().int().nonnegative(),
});

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error(
      `path must be relative to the program root: ${relativePath}`,
    );
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes the program root: ${relativePath}`);
  return resolved;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readVerified(
  root: string,
  reference: { path: string; sha256: string },
): Buffer {
  const bytes = readFileSync(resolveWithin(root, reference.path));
  const actual = sha256(bytes);
  if (actual !== reference.sha256)
    throw new Error(
      `hash mismatch for ${reference.path}: ${actual} != ${reference.sha256}`,
    );
  return bytes;
}

function parseJsonLines(bytes: Buffer): Array<Record<string, unknown>> {
  return bytes
    .toString('utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function readRows(
  root: string,
  reference: { path: string; sha256: string; rows: number },
): Array<Record<string, unknown>> {
  const rows = parseJsonLines(readVerified(root, reference));
  if (rows.length !== reference.rows)
    throw new Error(`row count mismatch for ${reference.path}`);
  return rows;
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
      `current pointer does not match supersedes hash: ${previousHash}`,
    );
  const temporary = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o664 });
    renameSync(temporary, filePath);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-grammar-contemporary-evidence-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = GrammarContemporaryEvidenceContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const parentManifest = JSON.parse(
    readVerified(programRoot, contract.parent_manifest).toString('utf8'),
  ) as Record<string, unknown>;
  const parentComponents = z
    .record(z.string(), ReferenceSchema)
    .parse(parentManifest.components);
  for (const reference of Object.values(parentComponents))
    readRows(programRoot, reference);
  const parentReviewReference = parentComponents.reviewQueue;
  const parentEvidenceReference = parentComponents.evidenceComponents;
  if (!parentReviewReference || !parentEvidenceReference)
    throw new Error('parent grammar edition lacks review/evidence components');

  const inventoryManifest = JSON.parse(
    readVerified(programRoot, {
      path: contract.evidence_inventory.manifest_path,
      sha256: contract.evidence_inventory.manifest_sha256,
    }).toString('utf8'),
  ) as Record<string, unknown>;
  const inventoryComponents = z
    .record(z.string(), ReferenceSchema)
    .parse(inventoryManifest.components);
  const inventoryRowsByComponent = new Map<string, unknown[]>();
  for (const componentKey of contract.evidence_inventory.component_keys) {
    const reference = inventoryComponents[componentKey];
    if (!reference)
      throw new Error(`inventory component is absent: ${componentKey}`);
    inventoryRowsByComponent.set(
      componentKey,
      readRows(programRoot, reference),
    );
  }

  const sourceLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.source_ledger.path),
  );
  const sourceLedgerVerification = verifyAppendOnlyLedger(
    sourceLedgerBytes,
    contract.source_ledger.sha256,
  );
  const sourceRows = parseJsonLines(sourceLedgerVerification.verifiedBytes);
  const sourceArtifacts = z
    .array(z.object({ source_id: z.string().min(1) }).passthrough())
    .parse(inventoryManifest.source_artifacts);
  for (const sourceId of new Set(sourceArtifacts.map((row) => row.source_id))) {
    const source = sourceRows.find((row) => row.source_id === sourceId);
    if (!source) throw new Error(`required source is absent: ${sourceId}`);
    for (const key of [
      'training_use',
      'redistribution',
      'derived_weights',
      'hosted_transfer',
    ])
      if (source[key] !== 'not_allowed')
        throw new Error(`required source ${sourceId} has unexpected ${key}`);
  }
  const changeLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.change_ledger.path),
  );
  const changeLedgerVerification = verifyAppendOnlyLedger(
    changeLedgerBytes,
    contract.change_ledger.sha256,
  );

  const result = buildGrammarContemporaryEvidenceEdition({
    contractValue: contract,
    parentManifestValue: parentManifest,
    inventoryManifestValue: inventoryManifest,
    parentReviewRows: readRows(programRoot, parentReviewReference),
    parentEvidenceComponentRows: readRows(programRoot, parentEvidenceReference),
    inventoryRowsByComponent,
    changeLedgerRows: parseJsonLines(changeLedgerVerification.verifiedBytes),
  });
  const expected = contract.expected_counts;
  const actual: Record<string, number | undefined> = {
    lexical_pairings: result.report.lexicalPairings,
    phrase_translation_pairings: result.report.phraseTranslationPairings,
    source_internal_form_conflicts: result.report.sourceInternalFormConflicts,
    pedagogical_records: result.report.pedagogicalRecords,
    discourse_clusters: result.report.discourseClusters,
    discourse_benchmark_units: result.report.discourseBenchmarkUnits,
    reading_comprehension_clusters: result.report.readingComprehensionClusters,
    document_translation_witnesses: result.report.documentTranslationWitnesses,
    assessment_version_conflicts: result.report.assessmentVersionConflicts,
    document_parallel_units: result.report.documentParallelUnits,
    sentence_translation_benchmark_units:
      result.report.sentenceTranslationBenchmarkUnits,
    added_review_items: result.report.addedReviewItems,
  };
  for (const [key, expectedValue] of Object.entries(expected))
    if (actual[key] !== expectedValue)
      throw new Error(
        `expected count mismatch for ${key}: ${actual[key]} != ${expectedValue}`,
      );

  const editionRelativeRoot = `grammar/editions/${contract.edition_id}`;
  const reviewContent = jsonLines(result.reviewQueue);
  const evidenceContent = jsonLines(result.evidenceComponents);
  const reviewReference = {
    path: `${editionRelativeRoot}/review-queue.jsonl`,
    sha256: sha256(reviewContent),
    rows: result.reviewQueue.length,
  };
  const evidenceReference = {
    path: `${editionRelativeRoot}/evidence-components.jsonl`,
    sha256: sha256(evidenceContent),
    rows: result.evidenceComponents.length,
  };
  const components = {
    ...result.inheritedComponents,
    reviewQueue: reviewReference,
    evidenceComponents: evidenceReference,
    ...result.inventoryComponents,
  };
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
    evidence_inventory: contract.evidence_inventory,
    source_ledger: {
      path: contract.source_ledger.path,
      historical_sha256: contract.source_ledger.sha256,
      current_sha256: sourceLedgerVerification.currentSha256,
      verification_mode: sourceLedgerVerification.verificationMode,
    },
    change_ledger: {
      path: contract.change_ledger.path,
      historical_sha256: contract.change_ledger.sha256,
      current_sha256: changeLedgerVerification.currentSha256,
      verification_mode: changeLedgerVerification.verificationMode,
      issuing_change_id: contract.change_ledger.issuing_change_id,
      accepted_change_ids: contract.change_ledger.accepted_change_ids,
    },
    components,
    counts: {
      inherited_source_assertions: parentComponents.assertions?.rows ?? 0,
      inherited_cross_source_syntheses: parentComponents.syntheses?.rows ?? 0,
      ...result.report,
    },
    evidence_policy: {
      pedagogical_material:
        'Printed forms, masks, image prompts, and action cues are source evidence candidates. No source-internal segmentation or lexical meaning is inferred.',
      natural_discourse:
        'The SCSA text remains one code-switched, discourse-level cluster. Paragraph boundaries are not treated as aligned sentences or independent samples.',
      ...(contract.evidence_inventory.component_keys.includes(
        'readingComprehensionClusters',
      )
        ? {
            reading_comprehension:
              'Printed Wajarri text, orthographic sentence boundaries, attribution, and comprehension questions are preserved without inventing translations, answer mappings, morpheme analyses, or benchmark rows.',
          }
        : {}),
      ...(contract.evidence_inventory.component_keys.includes(
        'documentTranslationWitnesses',
      )
        ? {
            document_translation:
              'A source-labelled full translation is one document-level parallel witness. Unequal orthographic segmentation and absent source alignment prohibit sentence, clause, token, or morpheme pairs from being inferred.',
          }
        : {}),
      ...(contract.evidence_inventory.component_keys.includes(
        'assessmentVersionConflicts',
      )
        ? {
            assessment_versioning:
              'Differences between task and marking-key wording, marks, and answers remain explicit unresolved source-version conflicts; no edition is silently preferred or reconciled.',
          }
        : {}),
      acceptance:
        'No new rule, paradigm cell, alignment, example, or training row is accepted without evidence-qualified review.',
    },
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit:
      'This edition expands contemporary grammar and discourse evidence. It authorizes no grammatical analysis, lexical segmentation, sentence alignment, benchmark reference, synthetic row, model training, or public translation claim.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestPath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256(editionContent);
  const pointer = {
    schema_version: 1,
    artifact: 'grammar',
    current_edition_id: contract.edition_id,
    manifest_path: editionManifestPath,
    manifest_sha256: editionManifestSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const pointerContent = `${JSON.stringify(pointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    const editionRoot = resolveWithin(programRoot, editionRelativeRoot);
    writeImmutable(path.join(editionRoot, 'review-queue.jsonl'), reviewContent);
    writeImmutable(
      path.join(editionRoot, 'evidence-components.jsonl'),
      evidenceContent,
    );
    writeImmutable(path.join(editionRoot, 'EDITION.json'), editionContent);
    writePointer(
      resolveWithin(programRoot, contract.current_pointer_path),
      pointerContent,
      contract.supersedes_pointer_sha256,
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        editionId: contract.edition_id,
        editionManifestPath,
        editionManifestSha256,
        currentPointerSha256: sha256(pointerContent),
        counts: edition.counts,
        components,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
