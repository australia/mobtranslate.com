import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  evaluateReleaseAdmission,
  type AdmissionEvidenceRef,
  type ReleaseAdmissionInputs,
} from '../lib/research/releaseAdmission';

type InputFile = AdmissionEvidenceRef;
type Contract = {
  schema_version: 1;
  assessment_id: string;
  assessed_at_utc: string;
  program_id: string;
  supersedes?: {
    assessment_id: string;
    reason: string;
  };
  playbook: InputFile & { version: string };
  implementation?: Array<InputFile & { role: string }>;
  inputs: Record<string, InputFile>;
  expected_absent_paths: string[];
  planned_repositories: {
    dataset: string;
    model: string;
    space: string;
  };
  output_directory: string;
};

function flagValue(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) {
    throw new Error(`missing required ${flag} PATH`);
  }
  return process.argv[index + 1];
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
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

function verifiedJson(root: string, input: InputFile): Record<string, unknown> {
  const bytes = readFileSync(resolveWithin(root, input.path));
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`input hash mismatch: ${input.path}`);
  }
  const parsed = JSON.parse(bytes.toString('utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`input is not a JSON object: ${input.path}`);
  }
  return parsed as Record<string, unknown>;
}

function verifyExternal(input: InputFile): void {
  if (!path.isAbsolute(input.path)) {
    throw new Error('playbook path must be absolute');
  }
  const bytes = readFileSync(input.path);
  if (sha256(bytes) !== input.sha256) {
    throw new Error(`playbook hash mismatch: ${input.path}`);
  }
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

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
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

const programRoot = path.resolve(flagValue('--program-root'));
const contractRelativePath = flagValue('--contract');
const contractPath = resolveWithin(programRoot, contractRelativePath);
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1) {
  throw new Error('unsupported contract schema');
}
if (contract.program_id !== 'anindilyakwa-v1') {
  throw new Error(`unexpected program_id: ${contract.program_id}`);
}

verifyExternal(contract.playbook);
for (const implementation of contract.implementation ?? []) {
  verifyExternal(implementation);
}
const programState = verifiedJson(programRoot, contract.inputs.programState);
const corpus = verifiedJson(programRoot, contract.inputs.corpusReadiness);
const foundation = verifiedJson(programRoot, contract.inputs.foundation);
const workpack = verifiedJson(programRoot, contract.inputs.reviewWorkpack);
const dictionary = verifiedJson(programRoot, contract.inputs.dictionary);
const grammar = verifiedJson(programRoot, contract.inputs.grammar);
const benchmarks = verifiedJson(programRoot, contract.inputs.benchmarks);
const space = verifiedJson(programRoot, contract.inputs.spaceVerification);
const ipMap = verifiedJson(programRoot, contract.inputs.ipMap);
const homepageVerification = contract.inputs.homepageVerification
  ? verifiedJson(programRoot, contract.inputs.homepageVerification)
  : null;

for (const relativePath of contract.expected_absent_paths) {
  if (existsSync(resolveWithin(programRoot, relativePath))) {
    throw new Error(`expected absent path now exists: ${relativePath}`);
  }
}

for (const [label, value] of [
  ['program state', programState.program_id],
  ['workpack', workpack.workpack_id],
] as const) {
  const expected =
    label === 'workpack'
      ? 'anindilyakwa-review-workpack-v0.1.5'
      : contract.program_id;
  if (value !== expected) throw new Error(`${label} identity mismatch`);
}

if (
  atPath(space, ['admission_evidence', 'foundation_summary_sha256']) !==
    contract.inputs.foundation.sha256 ||
  atPath(space, ['admission_evidence', 'corpus_readiness_sha256']) !==
    contract.inputs.corpusReadiness.sha256 ||
  atPath(space, ['admission_evidence', 'review_workpack_summary_sha256']) !==
    contract.inputs.reviewWorkpack.sha256
) {
  throw new Error('Space descriptor evidence hashes do not match the contract');
}

const plannedPublications = JSON.stringify(ipMap);
for (const repository of Object.values(contract.planned_repositories)) {
  if (!plannedPublications.includes(repository)) {
    throw new Error(
      `planned repository is not declared in the IP map: ${repository}`,
    );
  }
}

const stages = atPath(programState, ['stages']) as Record<string, unknown>;
const decision = atPath(corpus, ['decision']) as Record<string, unknown>;
const totals = atPath(corpus, ['totals']) as Record<string, unknown>;
const dictionaryRelease = atPath(dictionary, ['release_contract']) as Record<
  string,
  unknown
>;
const grammarRelease = atPath(grammar, ['release_contract']) as Record<
  string,
  unknown
>;
const benchmarkLeakage = atPath(benchmarks, ['leakage_policy']) as Record<
  string,
  unknown
>;
const benchmarkGates = atPath(benchmarks, ['route_gates']) as Record<
  string,
  Record<string, unknown>
>;
const reviewCounts = atPath(workpack, ['counts']) as Record<string, unknown>;
const programSpace = atPath(programState, ['space_preregistration']) as Record<
  string,
  unknown
>;
const programTraining = atPath(programState, ['training_execution']) as Record<
  string,
  unknown
>;
const programPrivateModel = atPath(programState, [
  'hugging_face_private_model',
]) as Record<string, unknown>;

const sentenceThreshold = requiredString(
  atPath(benchmarkGates, ['model_sentence_generation', 'numeric_threshold']),
  'sentence benchmark threshold',
);
const controlledThreshold = requiredString(
  atPath(benchmarkGates, [
    'model_bounded_controlled_generation',
    'numeric_threshold',
  ]),
  'controlled benchmark threshold',
);
const thresholdsPreregistered =
  !sentenceThreshold.includes('must be preregistered') &&
  !controlledThreshold.includes('must be preregistered');
const blindOrEscrowed = !requiredString(
  benchmarkLeakage.sealed_status,
  'benchmark sealed status',
).includes('not blind or independently escrowed');

const requiredRoleDecisions = requiredNumber(
  reviewCounts.required_role_decisions,
  'required role decisions',
);
const completedRoleDecisions = requiredNumber(
  atPath(space, ['admission_evidence', 'completed_required_role_decisions']),
  'completed role decisions',
);
if (
  requiredRoleDecisions !==
  requiredNumber(
    atPath(space, ['admission_evidence', 'required_role_decisions']),
    'Space required role decisions',
  )
) {
  throw new Error('review decision count differs between workpack and Space');
}

const input: ReleaseAdmissionInputs = {
  evidence: {
    programState: contract.inputs.programState,
    corpusReadiness: contract.inputs.corpusReadiness,
    foundation: contract.inputs.foundation,
    reviewWorkpack: contract.inputs.reviewWorkpack,
    dictionary: contract.inputs.dictionary,
    grammar: contract.inputs.grammar,
    benchmarks: contract.inputs.benchmarks,
    spaceVerification: contract.inputs.spaceVerification,
    ipMap: contract.inputs.ipMap,
    ...(contract.inputs.homepageVerification
      ? { homepageVerification: contract.inputs.homepageVerification }
      : {}),
  },
  foundation: {
    stage0Passed: requiredBoolean(
      atPath(foundation, ['gates', 'stage_0_language_charter']),
      'foundation stage 0',
    ),
    stage1Passed: requiredBoolean(
      atPath(foundation, ['gates', 'stage_1_source_discovery_and_archival']),
      'foundation stage 1',
    ),
    downstreamAuthorized: requiredBoolean(
      foundation.downstream_training_or_publication_authorized,
      'foundation downstream authorization',
    ),
  },
  stages: {
    dictionary: requiredString(stages.dictionary, 'dictionary stage'),
    grammar: requiredString(stages.grammar, 'grammar stage'),
    naturalCorpus: requiredString(
      stages.natural_corpus,
      'natural corpus stage',
    ),
    benchmarks: requiredString(stages.benchmarks, 'benchmark stage'),
    syntheticCorpus: requiredString(
      stages.synthetic_corpus,
      'synthetic corpus stage',
    ),
    translationModel: requiredString(
      stages.translation_model,
      'translation model stage',
    ),
    release: requiredString(stages.release, 'release stage'),
  },
  dictionary: {
    lookupEligible: requiredBoolean(
      dictionaryRelease.dictionary_lookup_eligible,
      'dictionary lookup eligibility',
    ),
    trainingEligible: requiredBoolean(
      dictionaryRelease.model_training_eligible,
      'dictionary training eligibility',
    ),
  },
  grammar: {
    acceptedGenerationRules: requiredNumber(
      totals.accepted_generation_rules,
      'accepted generation rules',
    ),
    trainingAllowed: requiredBoolean(
      grammarRelease.training_use_allowed,
      'grammar training eligibility',
    ),
  },
  corpus: {
    privateResearchTrainingReady: requiredBoolean(
      decision.private_research_training_ready,
      'private research training readiness',
    ),
    corpusReady: requiredBoolean(decision.corpus_ready, 'corpus readiness'),
    eligibleLexicalRows: requiredNumber(
      totals.eligible_lexical_training_rows,
      'eligible lexical rows',
    ),
    eligibleParallelSentenceRows: requiredNumber(
      totals.eligible_parallel_sentence_training_rows,
      'eligible parallel rows',
    ),
    eligibleSyntheticRows: requiredNumber(
      totals.eligible_synthetic_training_rows,
      'eligible synthetic rows',
    ),
    trainingExposedRows: requiredNumber(
      programTraining.training_exposed_rows_after_run ??
        totals.training_exposed_rows,
      'post-run training exposed rows',
    ),
    huggingFaceDatasetReady: requiredBoolean(
      decision.hugging_face_dataset_ready,
      'Hugging Face dataset readiness',
    ),
    huggingFaceModelReady: requiredBoolean(
      decision.hugging_face_model_ready,
      'Hugging Face model readiness',
    ),
    homepageModelRouteReady: requiredBoolean(
      decision.homepage_model_route_ready,
      'homepage model route readiness',
    ),
  },
  benchmarks: {
    blindOrIndependentlyEscrowed: blindOrEscrowed,
    numericThresholdsPreregistered: thresholdsPreregistered,
    qualifiedSentenceReviewPassed: false,
  },
  review: {
    requiredRoleDecisions,
    completedRoleDecisions,
    promotionSnapshotExists: false,
    promotionSnapshotPass: false,
  },
  model: {
    artifactExists: requiredBoolean(
      atPath(space, ['admission_evidence', 'model_artifact_exists']),
      'model artifact existence',
    ),
    immutableReleaseManifestExists: requiredBoolean(
      programPrivateModel.immutable_release_verified,
      'immutable private release verification',
    ),
    cleanRoomParityPassed:
      requiredBoolean(
        programTraining.mechanism_audit_passed,
        'training mechanism audit',
      ) &&
      requiredBoolean(
        programPrivateModel.remote_weight_hash_verified,
        'remote model weight hash verification',
      ),
    lexicalGatePassed: false,
    controlledSentenceGatePassed: false,
    freeFormSentenceGatePassed: false,
  },
  publication: {
    datasetGatePassed: requiredBoolean(
      programState.hugging_face_dataset_release_gate_passed,
      'dataset release gate',
    ),
    modelGatePassed: requiredBoolean(
      programState.hugging_face_model_release_gate_passed,
      'model release gate',
    ),
    datasetPublished: requiredBoolean(
      atPath(space, ['contract', 'dataset_published']),
      'dataset publication',
    ),
    modelPublished: requiredBoolean(
      atPath(space, ['contract', 'model_published']),
      'model publication',
    ),
  },
  space: {
    localFailClosedDescriptorVerified: requiredBoolean(
      atPath(space, ['decision', 'local_fail_closed_contract_verified']),
      'local Space descriptor verification',
    ),
    committed: requiredBoolean(
      atPath(space, ['source', 'committed']),
      'Space committed state',
    ),
    pushed: requiredBoolean(
      atPath(space, ['source', 'pushed']),
      'Space pushed state',
    ),
    deployed: requiredBoolean(
      atPath(space, ['source', 'deployed']),
      'Space deployed state',
    ),
    inferenceEnabled: requiredBoolean(
      atPath(space, ['contract', 'space_inference_enabled']),
      'Space inference state',
    ),
    readinessGatePassed: requiredBoolean(
      atPath(space, ['decision', 'hugging_face_space_readiness_gate_passed']),
      'Space readiness gate',
    ),
  },
  homepage: {
    dictionaryFirstContractVerified: homepageVerification
      ? requiredBoolean(
          atPath(homepageVerification, [
            'decision',
            'dictionary_first_contract_verified',
          ]),
          'homepage dictionary-first contract verification',
        )
      : false,
    unavailableFallbackVerified: homepageVerification
      ? requiredBoolean(
          atPath(homepageVerification, [
            'decision',
            'unavailable_fallback_verified',
          ]),
          'homepage unavailable fallback verification',
        )
      : false,
    modelRouteGatePassed: requiredBoolean(
      programState.homepage_custom_model_route_gate_passed,
      'homepage route gate',
    ),
    deployedAndBrowserVerified: homepageVerification
      ? requiredBoolean(
          atPath(homepageVerification, [
            'decision',
            'deployed_and_browser_verified',
          ]),
          'homepage deployed browser verification',
        )
      : false,
  },
  authorization: {
    freeFormSentenceRouteAuthorized: requiredBoolean(
      programState.free_form_sentence_route_authorized,
      'free-form sentence route authorization',
    ),
  },
};

if (
  input.model.artifactExists !==
  requiredBoolean(programSpace.model_artifact_exists, 'program model artifact')
) {
  throw new Error('model artifact state differs between program and Space');
}

const evaluation = evaluateReleaseAdmission(input);
const report = {
  schema_version: 1,
  assessment_id: contract.assessment_id,
  assessed_at_utc: contract.assessed_at_utc,
  program_id: contract.program_id,
  language: { name: 'Anindilyakwa', iso_639_3: 'aoi' },
  playbook: contract.playbook,
  implementation: contract.implementation ?? [],
  contract: {
    path: contractRelativePath,
    sha256: sha256(contractBytes),
  },
  supersedes: contract.supersedes ?? null,
  planned_repositories: contract.planned_repositories,
  measured_state: {
    private_research_training_ready: input.corpus.privateResearchTrainingReady,
    eligible_lexical_training_rows: input.corpus.eligibleLexicalRows,
    eligible_parallel_sentence_training_rows:
      input.corpus.eligibleParallelSentenceRows,
    eligible_synthetic_training_rows: input.corpus.eligibleSyntheticRows,
    training_exposed_rows: input.corpus.trainingExposedRows,
    accepted_generation_rules: input.grammar.acceptedGenerationRules,
    required_role_decisions: input.review.requiredRoleDecisions,
    completed_role_decisions: input.review.completedRoleDecisions,
    model_artifact_exists: input.model.artifactExists,
    space_local_fail_closed_descriptor_verified:
      input.space.localFailClosedDescriptorVerified,
    space_deployed: input.space.deployed,
    homepage_unavailable_fallback_verified:
      input.homepage.unavailableFallbackVerified,
    homepage_deployed_and_browser_verified:
      input.homepage.deployedAndBrowserVerified,
  },
  ...evaluation,
  decision: {
    release_ready: evaluation.releaseReady,
    strongest_admitted_product_route: evaluation.gates.dictionaryExact.pass
      ? 'dictionary_exact'
      : 'none',
    model_inference_admitted: false,
    homepage_integration_admitted: evaluation.gates.homepage.pass,
    claim_limit:
      'A private scripture-domain research baseline may be trained, evaluated, and stored in the operator-authorized private model repository. No public dictionary lookup, neural lexical reconstruction, controlled sentence generation, free-form sentence generation, dataset/model release, Space inference, or homepage translation route is currently admitted.',
  },
};

if (evaluation.releaseReady) {
  throw new Error(
    'current preregistration assessment unexpectedly passed release',
  );
}

const outputRoot = resolveWithin(programRoot, contract.output_directory);
const reportContent = `${JSON.stringify(report, null, 2)}\n`;
const reportPath = path.join(outputRoot, 'report.json');
writeImmutable(reportPath, reportContent);
writeImmutable(
  path.join(outputRoot, 'SHA256SUMS'),
  `${sha256(reportContent)}  report.json\n`,
);

process.stdout.write(
  `${JSON.stringify({
    assessment_id: contract.assessment_id,
    report: path.relative(programRoot, reportPath),
    report_sha256: sha256(reportContent),
    admitted_capabilities: evaluation.admittedCapabilities,
    release_ready: evaluation.releaseReady,
  })}\n`,
);
