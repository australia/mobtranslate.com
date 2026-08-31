import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  buildEvidenceGapRequirementsEdition,
  EvidenceGapRequirementsContractSchema,
} from '../lib/research/evidenceGapRequirementsEdition';
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
    if (readFileSync(filePath, 'utf8') !== content)
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
      'usage: tsx scripts/build-evidence-gap-requirements-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = EvidenceGapRequirementsContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const parentManifest = JSON.parse(
    readVerified(programRoot, {
      path: contract.parent.manifest_path,
      sha256: contract.parent.manifest_sha256,
    }).toString('utf8'),
  ) as Record<string, unknown>;
  const parentRequirementRows = parseJsonLines(
    readVerified(programRoot, {
      path: contract.parent.requirements_path,
      sha256: contract.parent.requirements_sha256,
    }),
  );
  const dictionaryManifest = JSON.parse(
    readVerified(programRoot, {
      path: contract.bound_inputs.dictionary.manifest_path,
      sha256: contract.bound_inputs.dictionary.manifest_sha256,
    }).toString('utf8'),
  ) as Record<string, unknown>;
  const grammarManifest = JSON.parse(
    readVerified(programRoot, {
      path: contract.bound_inputs.grammar.manifest_path,
      sha256: contract.bound_inputs.grammar.manifest_sha256,
    }).toString('utf8'),
  ) as Record<string, unknown>;
  const inventoryManifest = JSON.parse(
    readVerified(programRoot, {
      path: contract.bound_inputs.contemporary_inventory.manifest_path,
      sha256: contract.bound_inputs.contemporary_inventory.manifest_sha256,
    }).toString('utf8'),
  ) as Record<string, unknown>;

  const result = buildEvidenceGapRequirementsEdition({
    contractValue: contract,
    parentManifestValue: parentManifest,
    parentRequirementRows,
    dictionaryManifestValue: dictionaryManifest,
    grammarManifestValue: grammarManifest,
    inventoryManifestValue: inventoryManifest,
  });
  const expected = contract.expected_counts;
  const actual: Record<keyof typeof expected, number> = {
    requirements: result.summary.requirements,
    critical: result.summary.critical,
    high: result.summary.high,
    blocked_direct_conflict: result.summary.blockedDirectConflict,
    blocked_evidence_review: result.summary.blockedEvidenceReview,
    blocked_human_review: result.summary.blockedHumanReview,
    blocked_natural_data: result.summary.blockedNaturalData,
    closed: result.summary.closed,
  };
  for (const key of Object.keys(expected) as Array<keyof typeof expected>)
    if (actual[key] !== expected[key])
      throw new Error(
        `expected count mismatch for ${key}: ${actual[key]} != ${expected[key]}`,
      );

  const editionRelativeRoot = `analysis/corpus-requirements/${contract.requirements_edition_id}`;
  const requirementsContent = jsonLines(result.requirements);
  const dictionaryCounts = dictionaryManifest.counts as Record<string, unknown>;
  const grammarCounts = grammarManifest.counts as Record<string, unknown>;
  const inventoryValidation = inventoryManifest.validation as Record<
    string,
    unknown
  >;
  const report = {
    schema_version: 1,
    report_id: contract.requirements_edition_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    bound_knowledge_editions: {
      dictionary: {
        edition_id: contract.bound_inputs.dictionary.edition_id,
        manifest_sha256: contract.bound_inputs.dictionary.manifest_sha256,
        candidate_entries: dictionaryCounts.entries,
        review_items: dictionaryCounts.totalReviewItems,
        published_evidence_links: dictionaryCounts.evidenceLinks,
        training_eligible_rows: dictionaryCounts.trainingEligibleRows,
      },
      grammar: {
        edition_id: contract.bound_inputs.grammar.edition_id,
        manifest_sha256: contract.bound_inputs.grammar.manifest_sha256,
        inherited_source_assertions: grammarCounts.inherited_source_assertions,
        inherited_accepted_for_analysis_syntheses:
          grammarCounts.acceptedForAnalysisSyntheses,
        unresolved_conflicts: grammarCounts.unresolvedConflicts,
        pedagogical_records: grammarCounts.pedagogicalRecords,
        discourse_clusters: grammarCounts.discourseClusters,
        new_accepted_rows: grammarCounts.newAcceptedRows,
        training_eligible_rows: grammarCounts.trainingEligibleRows,
      },
    },
    contemporary_evidence: {
      inventory_id: contract.bound_inputs.contemporary_inventory.inventory_id,
      manifest_sha256:
        contract.bound_inputs.contemporary_inventory.manifest_sha256,
      lexical_pairings: inventoryValidation.lexical_pairings,
      pedagogical_records: inventoryValidation.pedagogical_records,
      discourse_clusters: inventoryValidation.discourse_clusters,
      benchmark_units_from_discourse:
        inventoryValidation.benchmark_units_from_discourse,
      accepted_rows: inventoryValidation.accepted_rows,
      training_eligible_rows: inventoryValidation.training_eligible_rows,
    },
    requirement_summary: result.summary,
    synthetic_generation_gate: {
      status: 'closed',
      reasons: [
        'Dictionary v0.5 has zero accepted or training-eligible lexical rows.',
        'Grammar v0.5 accepts no new rule, form, alignment, paradigm cell, or example for training.',
        'The one SCSA discourse is an unresolved source candidate, not a frozen independent natural evaluation cluster.',
        'No lexical, morphology, sentence, degeneration, or human-review benchmark suite is frozen.',
        'No frozen baseline failure census exists.',
      ],
      synthetic_rows_authorized: result.summary.syntheticRowsAuthorized,
      model_training_authorized: result.summary.modelTrainingAuthorized,
      count_policy: contract.count_policy,
      evidence_policy:
        'Synthetic or model output is training and regression material only. It cannot establish a dictionary entry, grammar rule, natural reference, or publication authority.',
    },
    next_evidence_actions: [
      'Adjudicate the five explicit newsletter pairings at entry, sense, part-of-speech, variety, and use-right level.',
      'Review the twelve picture completions and Nyinda julgara chant without inferring segmentation from English action cues.',
      'Resolve provenance, rights, code-switching, and clause/proposition alignment for the single SCSA discourse while preserving it as one cluster.',
      'Continue Douglas paradigm and example collation plus acquisition of full current morphology evidence.',
      'Acquire additional genuinely independent speaker/text/occasion clusters before freezing natural benchmarks.',
      'Freeze benchmark manifests and run a full baseline failure census before proposing any synthetic corpus or GPU experiment.',
    ],
    decision:
      'The living knowledge editions now include contemporary published and discourse evidence, but model training and synthetic generation remain unauthorized. Evidence adjudication and independent natural evaluation remain the bottlenecks.',
  };
  const reportContent = prettyJson(report);
  const components = {
    requirements: {
      path: `${editionRelativeRoot}/requirements.jsonl`,
      sha256: sha256(requirementsContent),
      rows: result.requirements.length,
    },
    report: {
      path: `${editionRelativeRoot}/REPORT.json`,
      sha256: sha256(reportContent),
      rows: null,
    },
  };
  const manifest = {
    schema_version: 1,
    requirements_edition_id: contract.requirements_edition_id,
    parent_requirements_edition_id: contract.parent_requirements_edition_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    parent: contract.parent,
    bound_inputs: contract.bound_inputs,
    components,
    validation: {
      unique_requirement_ids: true,
      schema_complete_rows: result.requirements.length,
      dictionary_manifest_bound_rows: result.requirements.length,
      grammar_manifest_bound_rows: result.requirements.length,
      ...actual,
      amended_requirements: result.summary.amendedRequirements,
      synthetic_generation_gate: 'closed',
      synthetic_rows_authorized: result.summary.syntheticRowsAuthorized,
      model_training_authorized: result.summary.modelTrainingAuthorized,
    },
    count_policy: contract.count_policy,
    claim_limit: contract.claim_limit,
    release_status: contract.release_status,
  };
  const manifestContent = prettyJson(manifest);

  if (process.argv.includes('--write')) {
    const outputRoot = resolveWithin(programRoot, editionRelativeRoot);
    writeImmutable(
      path.join(outputRoot, 'requirements.jsonl'),
      requirementsContent,
    );
    writeImmutable(path.join(outputRoot, 'REPORT.json'), reportContent);
    writeImmutable(path.join(outputRoot, 'MANIFEST.json'), manifestContent);
  }
  process.stdout.write(
    prettyJson({
      mode: process.argv.includes('--write') ? 'written' : 'validated_only',
      requirementsEditionId: contract.requirements_edition_id,
      components,
      summary: result.summary,
      manifestSha256: sha256(manifestContent),
    }),
  );
}

void main();
