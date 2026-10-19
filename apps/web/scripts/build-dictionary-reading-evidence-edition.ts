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
  buildDictionaryReadingEvidenceEdition,
  DictionaryReadingEvidenceContractSchema,
} from '../lib/research/dictionaryReadingEvidenceEdition';

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
    throw new Error(`path must be relative to program root: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes or aliases program root: ${relativePath}`);
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
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function writeImmutable(filePath: string, content: Buffer | string): void {
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (existsSync(filePath)) {
    if (!readFileSync(filePath).equals(bytes))
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, bytes, { mode: 0o664 });
}

function writePointer(
  filePath: string,
  content: string,
  expectedPreviousHash: string,
): void {
  const previous = readFileSync(filePath);
  if (previous.toString('utf8') === content) return;
  const actual = sha256(previous);
  if (actual !== expectedPreviousHash)
    throw new Error(
      `current pointer hash mismatch: ${actual} != ${expectedPreviousHash}`,
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
      'usage: tsx scripts/build-dictionary-reading-evidence-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = DictionaryReadingEvidenceContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );

  const parentBytes = readVerified(programRoot, contract.parent_manifest);
  const parentManifest = z
    .object({
      edition_id: z.string(),
      components: z.record(z.string(), ReferenceSchema),
      counts: z.record(z.string(), z.unknown()),
    })
    .passthrough()
    .parse(JSON.parse(parentBytes.toString('utf8')));
  const inherited = Object.fromEntries(
    Object.entries(parentManifest.components).map(([key, reference]) => {
      const bytes = readVerified(programRoot, reference);
      const rows = parseJsonLines(bytes);
      if (rows.length !== reference.rows)
        throw new Error(`row count mismatch for ${reference.path}`);
      return [key, { reference, bytes, rows }];
    }),
  );
  for (const requiredKey of [
    'entries',
    'senses',
    'reviewQueue',
    'reconstructionPromptGroups',
  ])
    if (!inherited[requiredKey])
      throw new Error(`parent component is absent: ${requiredKey}`);

  const inventoryBytes = readVerified(programRoot, {
    path: contract.evidence_inventory.manifest_path,
    sha256: contract.evidence_inventory.manifest_sha256,
  });
  const inventoryManifest = z
    .object({
      components: z.record(z.string(), ReferenceSchema),
      source_artifacts: z.array(
        z.object({ source_id: z.string().min(1) }).passthrough(),
      ),
    })
    .passthrough()
    .parse(JSON.parse(inventoryBytes.toString('utf8')));
  const readingReference =
    inventoryManifest.components[
      contract.evidence_inventory.reading_component_key
    ];
  if (!readingReference)
    throw new Error('reading-comprehension component is absent');
  const readingRows = parseJsonLines(
    readVerified(programRoot, readingReference),
  );
  if (readingRows.length !== readingReference.rows)
    throw new Error('reading-comprehension row count mismatch');
  let translationWitnessRows: Array<Record<string, unknown>> = [];
  const translationWitnessComponentKey =
    contract.evidence_inventory.translation_witness_component_key;
  if (translationWitnessComponentKey) {
    const translationWitnessReference =
      inventoryManifest.components[translationWitnessComponentKey];
    if (!translationWitnessReference)
      throw new Error('document-translation witness component is absent');
    translationWitnessRows = parseJsonLines(
      readVerified(programRoot, translationWitnessReference),
    );
    if (translationWitnessRows.length !== translationWitnessReference.rows)
      throw new Error('document-translation witness row count mismatch');
  }

  const sourceVerification = verifyAppendOnlyLedger(
    readFileSync(resolveWithin(programRoot, contract.source_ledger.path)),
    contract.source_ledger.sha256,
  );
  const sourceRows = parseJsonLines(sourceVerification.verifiedBytes);
  for (const sourceId of new Set(
    inventoryManifest.source_artifacts.map((row) => row.source_id),
  )) {
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
  const changeVerification = verifyAppendOnlyLedger(
    readFileSync(resolveWithin(programRoot, contract.change_ledger.path)),
    contract.change_ledger.sha256,
  );

  const result = buildDictionaryReadingEvidenceEdition({
    contractValue: contract,
    parentManifestValue: parentManifest,
    inventoryManifestValue: JSON.parse(inventoryBytes.toString('utf8')),
    readingClusterRows: readingRows,
    documentTranslationWitnessRows: translationWitnessRows,
    parentEntries: inherited.entries.rows,
    parentSenses: inherited.senses.rows,
    parentPromptGroups: inherited.reconstructionPromptGroups.rows,
    parentReviewQueue: inherited.reviewQueue.rows,
    changeLedgerRows: parseJsonLines(changeVerification.verifiedBytes),
  });

  const editionRelativeRoot = `dictionary/editions/${contract.edition_id}`;
  const reviewContent = jsonLines(result.reviewQueue);
  const usedFileNames = new Set<string>();
  const output = Object.fromEntries(
    Object.entries(inherited).map(([key, value]) => {
      const fileName = path.basename(value.reference.path);
      if (usedFileNames.has(fileName))
        throw new Error(`parent component filename collision: ${fileName}`);
      usedFileNames.add(fileName);
      const content =
        key === 'reviewQueue' ? Buffer.from(reviewContent) : value.bytes;
      const rows =
        key === 'reviewQueue'
          ? result.reviewQueue.length
          : value.reference.rows;
      return [
        key,
        {
          fileName,
          content,
          reference: {
            path: `${editionRelativeRoot}/${fileName}`,
            sha256: sha256(content),
            rows,
          },
        },
      ];
    }),
  );
  if (result.readingContextEvidenceLinks.length > 0) {
    const componentKey = 'readingContextEvidenceLinks';
    const inheritedRows = inherited[componentKey]?.rows ?? [];
    const evidenceRows = [
      ...inheritedRows,
      ...result.readingContextEvidenceLinks,
    ];
    const evidenceContent = jsonLines(evidenceRows);
    const evidenceFileName = inherited[componentKey]
      ? path.basename(inherited[componentKey].reference.path)
      : 'reading-context-evidence-links.jsonl';
    if (!inherited[componentKey] && usedFileNames.has(evidenceFileName))
      throw new Error(`component filename collision: ${evidenceFileName}`);
    usedFileNames.add(evidenceFileName);
    output[componentKey] = {
      fileName: evidenceFileName,
      content: Buffer.from(evidenceContent),
      reference: {
        path: `${editionRelativeRoot}/${evidenceFileName}`,
        sha256: sha256(evidenceContent),
        rows: evidenceRows.length,
      },
    };
  }
  if (result.titleTranslationEvidenceLinks.length > 0) {
    const componentKey = 'titleTranslationEvidenceLinks';
    const inheritedRows = inherited[componentKey]?.rows ?? [];
    const evidenceRows = [
      ...inheritedRows,
      ...result.titleTranslationEvidenceLinks,
    ];
    const evidenceContent = jsonLines(evidenceRows);
    const evidenceFileName = inherited[componentKey]
      ? path.basename(inherited[componentKey].reference.path)
      : 'title-translation-evidence-links.jsonl';
    if (!inherited[componentKey] && usedFileNames.has(evidenceFileName))
      throw new Error(`component filename collision: ${evidenceFileName}`);
    usedFileNames.add(evidenceFileName);
    output[componentKey] = {
      fileName: evidenceFileName,
      content: Buffer.from(evidenceContent),
      reference: {
        path: `${editionRelativeRoot}/${evidenceFileName}`,
        sha256: sha256(evidenceContent),
        rows: evidenceRows.length,
      },
    };
  }
  const components = Object.fromEntries(
    Object.entries(output).map(([key, value]) => [key, value.reference]),
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
    evidence_inventory: contract.evidence_inventory,
    source_ledger: {
      path: contract.source_ledger.path,
      historical_sha256: contract.source_ledger.sha256,
      current_sha256: sourceVerification.currentSha256,
      verification_mode: sourceVerification.verificationMode,
    },
    change_ledger: {
      path: contract.change_ledger.path,
      historical_sha256: contract.change_ledger.sha256,
      current_sha256: changeVerification.currentSha256,
      verification_mode: changeVerification.verificationMode,
      issuing_change_id: contract.change_ledger.issuing_change_id,
      accepted_change_ids: contract.change_ledger.accepted_change_ids,
    },
    components,
    counts: {
      ...parentManifest.counts,
      readingContextEvidenceLinks:
        components.readingContextEvidenceLinks?.rows ?? 0,
      titleTranslationEvidenceLinks:
        components.titleTranslationEvidenceLinks?.rows ?? 0,
      inheritedReviewItems: result.report.inheritedReviewItems,
      addedReadingContextReviewItems: result.report.addedReviewItems,
      addedTitleTranslationReviewItems:
        result.report.addedTitleTranslationReviewItems,
      documentTranslationWitnesses: result.report.titleTranslationWitnesses,
      titleTranslationRelatedPromptGroups:
        result.report.titleTranslationRelatedPromptGroups,
      totalReviewItems: result.report.totalReviewItems,
      acceptedLexicalRows: 0,
      acceptedEntries: 0,
      acceptedSenses: 0,
      acceptedForms: 0,
      trainingEligibleRows: 0,
    },
    evidence_policy: {
      document_context:
        'A title, passage occurrence, and unanswered comprehension question may establish a reviewable document-level relation. They do not by themselves establish a translation, sense identity, species scope, synonymy, or substitutability.',
      ...(result.titleTranslationEvidenceLinks.length > 0
        ? {
            source_attested_title_translation:
              'An official source-labelled title translation is preserved as explicit title-level evidence. It does not automatically establish a general dictionary sense, botanical scope, synonymy with other headwords, substitutability, or training eligibility.',
          }
        : {}),
      ambiguity:
        'Every recorded target in the matching current prompt group remains visible until evidence-qualified sense review resolves its relation.',
      acceptance:
        'The new evidence link and review item remain unaccepted and ineligible for training, benchmark registration, redistribution, hosted transfer, and model-weight derivation.',
    },
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit: contract.claim_limit,
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestPath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256(editionContent);
  const pointer = {
    schema_version: 1,
    artifact: 'dictionary',
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
    for (const value of Object.values(output))
      writeImmutable(path.join(editionRoot, value.fileName), value.content);
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
        report: result.report,
        components,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
