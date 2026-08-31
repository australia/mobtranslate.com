import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { verifyAppendOnlyLedger } from '../lib/research/appendOnlyLedger';
import {
  buildContemporaryLanguageEvidenceInventory,
  ContemporaryLanguageEvidenceInventoryContractSchema,
} from '../lib/research/contemporaryLanguageEvidenceInventory';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';

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
  relativePath: string,
  expectedSha256: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== expectedSha256)
    throw new Error(
      `hash mismatch for ${relativePath}: ${actualSha256} != ${expectedSha256}`,
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

function jsonLines(rows: unknown[]): string {
  return rows.length === 0
    ? '\n'
    : `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing !== content)
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o664 });
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-contemporary-language-evidence-inventory.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );

  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = ContemporaryLanguageEvidenceInventoryContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  for (const artifact of contract.source_artifacts)
    readVerified(programRoot, artifact.path, artifact.sha256);

  const sourceLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.source_ledger.path),
  );
  const sourceLedgerVerification = verifyAppendOnlyLedger(
    sourceLedgerBytes,
    contract.source_ledger.sha256,
  );
  const result = buildContemporaryLanguageEvidenceInventory({
    contractValue: contract,
    sourceLedgerRows: parseJsonLines(sourceLedgerVerification.verifiedBytes),
  });

  const inventoryRelativeRoot = `analysis/inventories/${contract.inventory_id}`;
  const lexicalContent = jsonLines(result.lexicalPairings);
  const phraseTranslationContent = jsonLines(result.phraseTranslationPairings);
  const pedagogyContent = jsonLines(result.pedagogicalEvidence);
  const discourseContent = jsonLines(result.discourseClusters);
  const readingComprehensionContent = jsonLines(
    result.readingComprehensionClusters,
  );
  const documentTranslationContent = jsonLines(
    result.documentTranslationWitnesses,
  );
  const assessmentConflictContent = jsonLines(
    result.assessmentVersionConflicts,
  );
  const report = {
    schema_version: 1,
    report_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    counts: result.report,
    evidence_policy: {
      lexical_pairings:
        'Explicit source pairings are preserved as published evidence, but remain unadjudicated and non-training candidates.',
      ...(contract.phrase_translation_pairings !== undefined
        ? {
            phrase_translations:
              'Explicit translated titles are preserved only as whole-phrase evidence. No lexical segmentation, compositional gloss, dictionary entry, or phrase-level benchmark is inferred.',
          }
        : {}),
      pedagogical_material:
        'Word banks, picture prompts, masks, and chant cues preserve source structure; no lexical segmentation or grammar is inferred.',
      discourse:
        'The SCSA text is one code-switched discourse cluster with only discourse-level translation. Paragraphs are not independent sentence pairs.',
      ...(contract.reading_comprehension_clusters !== undefined
        ? {
            reading_comprehension:
              'A printed Wajarri passage and English comprehension questions constrain document-level propositions but supply no sentence translation, answer key, word alignment, or grammatical analysis.',
          }
        : {}),
      ...(contract.document_translation_witnesses !== undefined
        ? {
            document_translation:
              'A source-labelled full translation establishes one document-level parallel witness. Unequal orthographic segmentation and absent source alignment keep every sentence, clause, token, and morpheme relation unresolved and ineligible for training or sentence benchmarking.',
            assessment_versioning:
              'Task and marking-key question text, marks, and answers are compared by source question number. Differences remain explicit source-version conflicts and are never silently reconciled.',
          }
        : {}),
    },
    release_status: contract.release_status,
    claim_limit: contract.claim_limit,
  };
  const reportContent = prettyJson(report);
  const component = (name: string, content: string, rows: number) => ({
    path: `${inventoryRelativeRoot}/${name}`,
    sha256: sha256(content),
    rows,
  });
  const components = {
    lexicalPairings: component(
      'lexical-pairings.jsonl',
      lexicalContent,
      result.lexicalPairings.length,
    ),
    ...(contract.phrase_translation_pairings !== undefined
      ? {
          phraseTranslationPairings: component(
            'phrase-translation-pairings.jsonl',
            phraseTranslationContent,
            result.phraseTranslationPairings.length,
          ),
        }
      : {}),
    pedagogicalEvidence: component(
      'pedagogical-evidence.jsonl',
      pedagogyContent,
      result.pedagogicalEvidence.length,
    ),
    discourseClusters: component(
      'discourse-clusters.jsonl',
      discourseContent,
      result.discourseClusters.length,
    ),
    ...(contract.reading_comprehension_clusters !== undefined
      ? {
          readingComprehensionClusters: component(
            'reading-comprehension-clusters.jsonl',
            readingComprehensionContent,
            result.readingComprehensionClusters.length,
          ),
        }
      : {}),
    ...(contract.document_translation_witnesses !== undefined
      ? {
          documentTranslationWitnesses: component(
            'document-translation-witnesses.jsonl',
            documentTranslationContent,
            result.documentTranslationWitnesses.length,
          ),
          assessmentVersionConflicts: component(
            'assessment-version-conflicts.jsonl',
            assessmentConflictContent,
            result.assessmentVersionConflicts.length,
          ),
        }
      : {}),
  };
  const manifest = {
    schema_version: 1,
    inventory_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    source_ledger: {
      path: contract.source_ledger.path,
      historical_sha256: contract.source_ledger.sha256,
      current_sha256: sourceLedgerVerification.currentSha256,
      verification_mode: sourceLedgerVerification.verificationMode,
    },
    source_artifacts: contract.source_artifacts,
    components,
    report: {
      path: `${inventoryRelativeRoot}/REPORT.json`,
      sha256: sha256(reportContent),
    },
    validation: {
      unique_source_artifacts: true,
      lexical_pairings: result.report.lexicalPairings,
      ...(contract.phrase_translation_pairings !== undefined
        ? {
            phrase_translation_pairings:
              result.report.phraseTranslationPairings,
          }
        : {}),
      pedagogical_records: result.report.pedagogicalRecords,
      picture_completions: result.report.pictureCompletions,
      discourse_clusters: result.report.discourseClusters,
      benchmark_units_from_discourse: result.report.discourseClusters,
      ...(contract.reading_comprehension_clusters !== undefined
        ? {
            reading_comprehension_clusters:
              result.report.readingComprehensionClusters,
          }
        : {}),
      ...(contract.document_translation_witnesses !== undefined
        ? {
            document_translation_witnesses:
              result.report.documentTranslationWitnesses,
            document_parallel_units: result.report.documentParallelUnits,
            assessment_version_conflicts:
              result.report.assessmentVersionConflicts,
            sentence_translation_benchmark_units:
              result.report.sentenceTranslationBenchmarkUnits,
          }
        : {}),
      accepted_rows: result.report.acceptedRows,
      training_eligible_rows: result.report.trainingEligibleRows,
    },
    release_status: contract.release_status,
    claim_limit: contract.claim_limit,
  };
  const manifestContent = prettyJson(manifest);

  if (process.argv.includes('--write')) {
    const outputRoot = resolveWithin(programRoot, inventoryRelativeRoot);
    writeImmutable(
      path.join(outputRoot, 'lexical-pairings.jsonl'),
      lexicalContent,
    );
    if (contract.phrase_translation_pairings !== undefined)
      writeImmutable(
        path.join(outputRoot, 'phrase-translation-pairings.jsonl'),
        phraseTranslationContent,
      );
    writeImmutable(
      path.join(outputRoot, 'pedagogical-evidence.jsonl'),
      pedagogyContent,
    );
    writeImmutable(
      path.join(outputRoot, 'discourse-clusters.jsonl'),
      discourseContent,
    );
    if (contract.reading_comprehension_clusters !== undefined)
      writeImmutable(
        path.join(outputRoot, 'reading-comprehension-clusters.jsonl'),
        readingComprehensionContent,
      );
    if (contract.document_translation_witnesses !== undefined) {
      writeImmutable(
        path.join(outputRoot, 'document-translation-witnesses.jsonl'),
        documentTranslationContent,
      );
      writeImmutable(
        path.join(outputRoot, 'assessment-version-conflicts.jsonl'),
        assessmentConflictContent,
      );
    }
    writeImmutable(path.join(outputRoot, 'REPORT.json'), reportContent);
    writeImmutable(path.join(outputRoot, 'MANIFEST.json'), manifestContent);
  }

  process.stdout.write(
    prettyJson({
      mode: process.argv.includes('--write') ? 'written' : 'validated_only',
      inventoryId: contract.inventory_id,
      components,
      report: result.report,
      manifestSha256: sha256(manifestContent),
    }),
  );
}

void main();
