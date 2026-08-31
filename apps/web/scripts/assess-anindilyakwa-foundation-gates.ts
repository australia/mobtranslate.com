import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { load as loadYaml } from 'js-yaml';

type InputFile = { path: string; sha256: string };
type Contract = {
  schema_version: 1;
  assessment_id: string;
  assessed_at_utc: string;
  playbook: { path: string; sha256: string; version: string };
  inputs: Record<string, InputFile>;
  expected: {
    program_id: string;
    language_name: string;
    iso_639_3: string;
    glottocode: string;
    script_iso_15924: string;
    primary_translation_direction: string;
    minimum_active_sources: number;
    minimum_dictionary_rows: number;
    minimum_candidate_grammar_claims: number;
    required_active_source_ids: string[];
  };
  output_directory: string;
};

type SourceRow = {
  source_id: string;
  supersedes_source_id?: string;
  source_type: string;
  local_path: string | null;
  sha256: string | null;
  license: string;
  training_use: string;
  redistribution: string;
  derived_weights: string;
  hosted_transfer: string;
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error('path must be relative');
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`path escapes program root: ${relativePath}`);
  }
  return resolved;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function verifiedBytes(root: string, input: InputFile): Buffer {
  const bytes = readFileSync(resolveWithin(root, input.path));
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`input hash mismatch: ${input.path}`);
  }
  return bytes;
}

function verifiedExternalBytes(input: InputFile): Buffer {
  if (!path.isAbsolute(input.path))
    throw new Error('playbook path must be absolute');
  const bytes = readFileSync(input.path);
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`playbook hash mismatch: ${input.path}`);
  }
  return bytes;
}

function parseJsonl<T>(bytes: Buffer): T[] {
  return bytes
    .toString('utf8')
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    if (readFileSync(filePath, 'utf8') !== content) {
      throw new Error(`refusing to rewrite immutable artifact: ${filePath}`);
    }
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx' });
  renameSync(temporaryPath, filePath);
}

function atPath(value: unknown, segments: string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const programRoot = path.resolve(flagValue('--program-root'));
const contractPath = resolveWithin(programRoot, flagValue('--contract'));
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1)
  throw new Error('unsupported contract schema');

verifiedExternalBytes({
  path: contract.playbook.path,
  sha256: contract.playbook.sha256,
});
const charterBytes = verifiedBytes(programRoot, contract.inputs.charter);
const ledgerBytes = verifiedBytes(programRoot, contract.inputs.source_ledger);
const bootstrap = JSON.parse(
  verifiedBytes(programRoot, contract.inputs.bootstrap_summary).toString(
    'utf8',
  ),
) as Record<string, unknown>;
const dictionaryManifest = JSON.parse(
  verifiedBytes(programRoot, contract.inputs.dictionary_manifest).toString(
    'utf8',
  ),
) as Record<string, unknown>;
const grammarSummary = JSON.parse(
  verifiedBytes(programRoot, contract.inputs.grammar_summary).toString('utf8'),
) as Record<string, unknown>;
const charter = loadYaml(charterBytes.toString('utf8')) as Record<
  string,
  unknown
>;

const stage0Criteria = [
  {
    criterion: 'stable_program_and_language_identity',
    pass:
      charter.program_id === contract.expected.program_id &&
      atPath(charter, ['language', 'primary_name']) ===
        contract.expected.language_name &&
      atPath(charter, ['language', 'iso_639_3']) ===
        contract.expected.iso_639_3 &&
      atPath(charter, ['language', 'glottocode']) ===
        contract.expected.glottocode,
  },
  {
    criterion: 'included_variety_and_unknown_variety_policy_declared',
    pass:
      Array.isArray(atPath(charter, ['scope', 'included_varieties'])) &&
      (atPath(charter, ['scope', 'included_varieties']) as unknown[]).length >
        0 &&
      atPath(charter, ['scope', 'unknown_variety_policy']) ===
        'retain_as_unknown',
  },
  {
    criterion: 'script_and_source_preserving_orthography_declared',
    pass:
      Array.isArray(charter.scripts) &&
      charter.scripts.some(
        (row) =>
          atPath(row, ['iso_15924']) === contract.expected.script_iso_15924,
      ) &&
      Array.isArray(charter.orthographies) &&
      charter.orthographies.length > 0 &&
      atPath(charter, ['normalization', 'orthography_policy']) ===
        'never_silently_convert_or_reconstruct_source_spelling',
  },
  {
    criterion: 'single_primary_translation_direction_declared',
    pass:
      Array.isArray(atPath(charter, ['directions', 'translation'])) &&
      (atPath(charter, ['directions', 'translation']) as unknown[]).some(
        (row) =>
          atPath(row, ['id']) ===
            contract.expected.primary_translation_direction &&
          atPath(row, ['status']) === 'primary_research_direction',
      ),
  },
  {
    criterion: 'product_and_claim_boundaries_declared',
    pass:
      Array.isArray(charter.product_priority) &&
      charter.product_priority.length > 0 &&
      charter.model_claim_target ===
        'research_only_until_independent_natural_evaluation_and_qualified_review' &&
      atPath(charter, [
        'model_contract',
        'lexical_gate_does_not_authorize_sentence_generation',
      ]) === true &&
      atPath(charter, [
        'model_contract',
        'bounded_controlled_gate_does_not_authorize_free_form_generation',
      ]) === true,
  },
];
const stage0Pass = stage0Criteria.every((row) => row.pass);

const sourceRows = parseJsonl<SourceRow>(ledgerBytes);
const sourceIds = new Set(sourceRows.map((row) => row.source_id));
if (sourceIds.size !== sourceRows.length)
  throw new Error('duplicate source_id');
const supersededSourceIds = new Set(
  sourceRows
    .map((row) => row.supersedes_source_id)
    .filter((sourceId): sourceId is string => Boolean(sourceId)),
);
for (const sourceId of supersededSourceIds) {
  if (!sourceIds.has(sourceId)) {
    throw new Error(`superseded source does not exist: ${sourceId}`);
  }
}
const activeSources = sourceRows.filter(
  (row) => !supersededSourceIds.has(row.source_id),
);
const sourceArtifactChecks = activeSources.map((source) => {
  if (!source.local_path || !source.sha256) {
    return {
      source_id: source.source_id,
      pass: false,
      reason: 'active source lacks local_path or sha256',
    };
  }
  if (!existsSync(source.local_path) || !statSync(source.local_path).isFile()) {
    return {
      source_id: source.source_id,
      pass: false,
      reason: 'local source file is missing or not a regular file',
    };
  }
  const observedSha256 = sha256(readFileSync(source.local_path));
  return {
    source_id: source.source_id,
    pass: observedSha256 === source.sha256,
    expected_sha256: source.sha256,
    observed_sha256: observedSha256,
  };
});
const requiredSourceCoverage = contract.expected.required_active_source_ids.map(
  (sourceId) => ({
    source_id: sourceId,
    pass: activeSources.some((row) => row.source_id === sourceId),
  }),
);
const rightsFieldsComplete = activeSources.every((source) =>
  [
    source.license,
    source.training_use,
    source.redistribution,
    source.derived_weights,
    source.hosted_transfer,
  ].every((value) => typeof value === 'string' && value.length > 0),
);
const stage1Criteria = [
  {
    criterion: 'minimum_active_source_inventory_met',
    pass: activeSources.length >= contract.expected.minimum_active_sources,
    observed: activeSources.length,
  },
  {
    criterion: 'required_source_frontiers_present',
    pass: requiredSourceCoverage.every((row) => row.pass),
    observed: requiredSourceCoverage,
  },
  {
    criterion: 'all_active_source_artifacts_hash_verified',
    pass: sourceArtifactChecks.every((row) => row.pass),
    observed: sourceArtifactChecks,
  },
  {
    criterion: 'operational_rights_fields_recorded_for_every_active_source',
    pass: rightsFieldsComplete,
  },
  {
    criterion: 'dictionary_inventory_sufficient_for_extraction_plan',
    pass:
      atPath(bootstrap, ['counts', 'source_rows']) ===
        contract.expected.minimum_dictionary_rows &&
      atPath(bootstrap, ['counts', 'projection_mismatches']) === 0 &&
      dictionaryManifest.schema_version === 1,
  },
  {
    criterion: 'grammar_inventory_sufficient_for_extraction_plan',
    pass:
      Number(
        atPath(grammarSummary, ['counts', 'source_verified_candidate_claims']),
      ) >= contract.expected.minimum_candidate_grammar_claims &&
      Number(atPath(grammarSummary, ['counts', 'source_pages'])) > 0,
  },
];
const stage1Pass = stage1Criteria.every((row) => row.pass);

const common = {
  schema_version: 1,
  assessment_id: contract.assessment_id,
  assessed_at_utc: contract.assessed_at_utc,
  playbook: contract.playbook,
  contract: {
    path: path.relative(programRoot, contractPath),
    sha256: sha256(contractBytes),
  },
};
const stage0 = {
  ...common,
  stage: 0,
  stage_name: 'Language Charter',
  gate_passed: stage0Pass,
  criteria: stage0Criteria,
  charter: {
    path: contract.inputs.charter.path,
    sha256: contract.inputs.charter.sha256,
  },
  limitation:
    'This gate proves collection and labeling scope, not community endorsement, final orthography acceptance, source rights, or model competence.',
};
const stage1 = {
  ...common,
  stage: 1,
  stage_name: 'Source Discovery and Archival',
  gate_passed: stage1Pass,
  criteria: stage1Criteria,
  inventory: {
    ledger_path: contract.inputs.source_ledger.path,
    ledger_sha256: contract.inputs.source_ledger.sha256,
    ledger_rows: sourceRows.length,
    active_sources: activeSources.length,
    superseded_sources: supersededSourceIds.size,
    active_source_types: [
      ...new Set(activeSources.map((source) => source.source_type)),
    ].sort(),
  },
  limitation:
    'This gate proves an archived planning inventory. It does not authorize training, redistribution, derived weights, hosted transfer, publication, or public inference.',
};
const summary = {
  ...common,
  gates: {
    stage_0_language_charter: stage0Pass,
    stage_1_source_discovery_and_archival: stage1Pass,
  },
  downstream_training_or_publication_authorized: false,
  next_stage:
    stage0Pass && stage1Pass ? 'stage_2_dictionary' : 'foundation_repair',
};

const outputs = new Map<string, string>([
  ['stage-0.json', `${JSON.stringify(stage0, null, 2)}\n`],
  ['stage-1.json', `${JSON.stringify(stage1, null, 2)}\n`],
  ['summary.json', `${JSON.stringify(summary, null, 2)}\n`],
]);
if (!process.argv.includes('--write')) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
const outputRoot = resolveWithin(programRoot, contract.output_directory);
for (const [name, content] of outputs) {
  writeImmutable(path.join(outputRoot, name), content);
}
const sums = [...outputs.entries()]
  .map(([name, content]) => `${sha256(content)}  ${name}`)
  .join('\n');
writeImmutable(path.join(outputRoot, 'SHA256SUMS'), `${sums}\n`);
console.log(JSON.stringify(summary, null, 2));
