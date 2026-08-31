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

type InputFile = { path: string; sha256: string };
type Contract = {
  schema_version: 1;
  workpack_id: string;
  created_at_utc: string;
  language: { name: string; iso_639_3: string };
  supersedes?: { workpack_id: string; reason: string };
  inputs: Record<string, InputFile>;
  output_directory: string;
  release_contract: Record<string, unknown>;
};

type DictionaryReview = {
  review_id: string;
  review_kind: string;
  source_entry_ids: string[];
  observed_key?: string;
  decision_required: string;
  status: string;
};
type Entry = {
  entry_id: string;
  source_entry_id: string;
  headword_source: string;
  headword_comparison: string;
  semantic_domain_source_id: string;
};
type Sense = {
  sense_id: string;
  entry_id: string;
  source_entry_id: string;
  english_gloss_source: string;
};
type GrammarClaim = {
  claim_id: string;
  topic: string;
  assertion: string;
  evidence: Record<string, unknown>;
  review_state: string;
};
type GrammarReview = {
  review_id: string;
  topic: string;
  question: string;
  state: string;
};
type SentenceEvidence = {
  evidence_id: string;
  example: string;
  interlinear_gloss: string;
  english_translation: string;
  example_source: string;
  verb_roots: string[];
  verb_root_glosses: string[];
  aktionsart_labels: string[];
  genres: string[];
  review_state: string;
  training_exposed: false;
};
type NaturalBenchmark = {
  source_evidence_id: string;
  benchmark_id: string;
  partition: string;
  leakage_group: string;
};
type SourceLedgerRow = {
  source_id: string;
  supersedes_source_id?: string;
  requires_cultural_review?: boolean;
  title: string;
  source_type: string;
  url: string | null;
  local_path: string | null;
  sha256: string | null;
  languages: string[];
  license: string;
  training_use: string;
  redistribution: string;
  derived_weights: string;
  hosted_transfer: string;
  authorization?: Record<string, unknown> | null;
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

const programRoot = path.resolve(flagValue('--program-root'));
const contractPath = resolveWithin(programRoot, flagValue('--contract'));
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes.toString('utf8')) as Contract;
if (contract.schema_version !== 1)
  throw new Error('unsupported contract schema');

const readInput = <T>(name: string): T[] => {
  const input = contract.inputs[name];
  if (!input) throw new Error(`missing contract input: ${name}`);
  return parseJsonl<T>(verifiedBytes(programRoot, input));
};

const dictionaryReviews = readInput<DictionaryReview>('dictionary_reviews');
const entries = readInput<Entry>('dictionary_entries');
const senses = readInput<Sense>('dictionary_senses');
const grammarClaims = readInput<GrammarClaim>('grammar_claims');
const grammarReviews = readInput<GrammarReview>('grammar_reviews');
const sentences = readInput<SentenceEvidence>('sentence_evidence');
const naturalBenchmarks = readInput<NaturalBenchmark>('natural_benchmarks');
const sources = readInput<SourceLedgerRow>('source_ledger');
const sourceIds = new Set(sources.map((source) => source.source_id));
if (sourceIds.size !== sources.length) throw new Error('duplicate source_id');
const supersededSourceIds = new Set(
  sources
    .map((source) => source.supersedes_source_id)
    .filter((sourceId): sourceId is string => Boolean(sourceId)),
);
for (const sourceId of supersededSourceIds) {
  if (!sourceIds.has(sourceId)) {
    throw new Error(`superseded source does not exist: ${sourceId}`);
  }
}
const activeSources = sources.filter(
  (source) => !supersededSourceIds.has(source.source_id),
);

const entriesBySourceId = new Map(
  entries.map((entry) => [entry.source_entry_id, entry]),
);
const sensesBySourceId = new Map<string, Sense[]>();
for (const sense of senses) {
  const rows = sensesBySourceId.get(sense.source_entry_id) ?? [];
  rows.push(sense);
  sensesBySourceId.set(sense.source_entry_id, rows);
}
const benchmarkByEvidenceId = new Map(
  naturalBenchmarks.map((row) => [row.source_evidence_id, row]),
);

const dictionaryTasks = dictionaryReviews.map((review) => {
  const sourceRecords = review.source_entry_ids.map((sourceEntryId) => {
    const entry = entriesBySourceId.get(sourceEntryId);
    if (!entry) throw new Error(`missing dictionary entry: ${sourceEntryId}`);
    return {
      source_entry_id: sourceEntryId,
      entry_id: entry.entry_id,
      headword_source: entry.headword_source,
      headword_comparison: entry.headword_comparison,
      semantic_domain_source_id: entry.semantic_domain_source_id,
      senses: (sensesBySourceId.get(sourceEntryId) ?? []).map((sense) => ({
        sense_id: sense.sense_id,
        english_gloss_source: sense.english_gloss_source,
      })),
    };
  });
  return {
    schema_version: 1,
    task_id: review.review_id,
    task_kind: 'dictionary_entry_review',
    review_kind: review.review_kind,
    required_review_roles: ['qualified_language_reviewer', 'program_steward'],
    decision_required: review.decision_required,
    observed_key: review.observed_key ?? null,
    source_records: sourceRecords,
    source_review_status: review.status,
    permitted_decisions: [
      'approve',
      'approve_with_revision',
      'reject',
      'defer',
      'not_applicable',
    ],
    promotion_boundary:
      'No entry becomes training, lookup, or public-release eligible from one role or from an automated similarity judgment.',
  };
});

const grammarTopicTasks = grammarReviews.map((review) => ({
  schema_version: 1,
  task_id: review.review_id,
  task_kind: 'grammar_claim_review',
  topic: review.topic,
  question: review.question,
  required_review_roles: ['qualified_language_reviewer', 'program_steward'],
  candidate_claims: grammarClaims
    .filter((claim) => claim.topic === review.topic)
    .map((claim) => ({
      claim_id: claim.claim_id,
      assertion: claim.assertion,
      evidence: claim.evidence,
      review_state: claim.review_state,
    })),
  source_review_status: review.state,
  permitted_decisions: [
    'approve',
    'approve_with_revision',
    'reject',
    'defer',
    'not_applicable',
  ],
  promotion_boundary:
    'Source verification alone does not establish a productive rule, cultural permission, pedagogical suitability, or speaker certification.',
}));

const grammarClaimTasks = grammarClaims.map((claim) => ({
  schema_version: 1,
  task_id: `aoi-grammar-claim-review:${claim.claim_id.split(':').at(-1)}`,
  task_kind: 'grammar_claim_review',
  topic: claim.topic,
  question:
    'Should this exact source-verified candidate claim be accepted, amended, rejected, or deferred for grammar and controlled-generation use?',
  required_review_roles: ['qualified_language_reviewer', 'program_steward'],
  candidate_claims: [
    {
      claim_id: claim.claim_id,
      assertion: claim.assertion,
      evidence: claim.evidence,
      review_state: claim.review_state,
    },
  ],
  source_review_status: claim.review_state,
  permitted_decisions: [
    'approve',
    'approve_with_revision',
    'reject',
    'defer',
    'not_applicable',
  ],
  promotion_boundary:
    'Source verification alone does not establish a productive rule, cultural permission, pedagogical suitability, or speaker certification.',
}));

const grammarTasks = [...grammarTopicTasks, ...grammarClaimTasks];

const sentenceTasks = sentences.map((sentence) => {
  const benchmark = benchmarkByEvidenceId.get(sentence.evidence_id);
  if (!benchmark) {
    throw new Error(`missing benchmark row for ${sentence.evidence_id}`);
  }
  return {
    schema_version: 1,
    task_id: `aoi-sentence-review:${sentence.evidence_id.split(':').at(-1)}`,
    task_kind: 'natural_sentence_review',
    required_review_roles: ['qualified_language_reviewer', 'cultural_reviewer'],
    source_evidence_id: sentence.evidence_id,
    anindilyakwa: sentence.example,
    interlinear_gloss: sentence.interlinear_gloss,
    english: sentence.english_translation,
    source_reference: sentence.example_source,
    verb_roots: sentence.verb_roots,
    verb_root_glosses: sentence.verb_root_glosses,
    aktionsart_labels: sentence.aktionsart_labels,
    genres: sentence.genres,
    benchmark: {
      benchmark_id: benchmark.benchmark_id,
      partition: benchmark.partition,
      leakage_group: benchmark.leakage_group,
      permanently_excluded_from_training: true,
    },
    decision_questions: [
      'Is the Anindilyakwa form and English interpretation acceptable for the stated source context?',
      'Is the item culturally safe for benchmark use under the requested scope?',
      'Are spelling, segmentation, glossing, speaker/variety, register, or context amendments required?',
    ],
    source_review_status: sentence.review_state,
    training_exposed: sentence.training_exposed,
    promotion_boundary:
      'Approval may authorize benchmark use only; these frozen items remain excluded from training and few-shot/retrieval exposure.',
  };
});

const rightsTasks = activeSources.map((source) => ({
  schema_version: 1,
  task_id: `aoi-rights-review:${source.source_id}`,
  task_kind: 'source_rights_review',
  required_review_roles:
    source.languages.includes(contract.language.iso_639_3) ||
    source.requires_cultural_review === true
      ? ['source_rights_authority', 'cultural_reviewer', 'program_steward']
      : ['source_rights_authority', 'program_steward'],
  source: {
    source_id: source.source_id,
    title: source.title,
    source_type: source.source_type,
    url: source.url,
    local_path: source.local_path,
    sha256: source.sha256,
    languages: source.languages,
  },
  recorded_terms: {
    license: source.license,
    training_use: source.training_use,
    redistribution: source.redistribution,
    derived_weights: source.derived_weights,
    hosted_transfer: source.hosted_transfer,
    authorization: source.authorization ?? null,
  },
  scope_questions: [
    'May source bytes or row-level extracts be used for private model training?',
    'May the source or a derived dataset be redistributed publicly?',
    'May derived model weights be published?',
    'May content be transferred to hosted model or review providers?',
    'May derived inference be offered publicly, and under what limitations or withdrawal procedure?',
  ],
  promotion_boundary:
    'Project authorization is preserved but cannot silently replace source-specific copyright authority, cultural authority, consent, or qualified language review.',
}));

const allTasks = [
  ...dictionaryTasks,
  ...grammarTasks,
  ...sentenceTasks,
  ...rightsTasks,
];
const taskIds = new Set<string>();
for (const task of allTasks) {
  if (taskIds.has(task.task_id))
    throw new Error(`duplicate task: ${task.task_id}`);
  taskIds.add(task.task_id);
}

const decisionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${contract.workpack_id}:review-decision:v1`,
  title: 'Anindilyakwa append-only review decision',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'decision_id',
    'task_id',
    'task_kind',
    'reviewer',
    'decided_at_utc',
    'verdict',
    'scope',
    'rationale',
    'evidence_refs',
  ],
  properties: {
    schema_version: { const: 1 },
    decision_id: { type: 'string', minLength: 1 },
    task_id: { type: 'string', minLength: 1 },
    task_kind: {
      enum: [
        'dictionary_entry_review',
        'grammar_claim_review',
        'natural_sentence_review',
        'source_rights_review',
      ],
    },
    reviewer: {
      type: 'object',
      additionalProperties: false,
      required: ['reviewer_id', 'role', 'authority_basis'],
      properties: {
        reviewer_id: { type: 'string', minLength: 1 },
        role: {
          enum: [
            'qualified_language_reviewer',
            'cultural_reviewer',
            'source_rights_authority',
            'program_steward',
          ],
        },
        affiliation: { type: ['string', 'null'] },
        authority_basis: { type: 'string', minLength: 1 },
      },
    },
    decided_at_utc: { type: 'string', format: 'date-time' },
    verdict: {
      enum: [
        'approve',
        'approve_with_revision',
        'reject',
        'defer',
        'not_applicable',
      ],
    },
    scope: {
      type: 'object',
      additionalProperties: false,
      required: [
        'research_inventory',
        'benchmark_use',
        'training_use',
        'hosted_transfer',
        'redistribution',
        'derived_weights',
        'public_inference',
      ],
      properties: Object.fromEntries(
        [
          'research_inventory',
          'benchmark_use',
          'training_use',
          'hosted_transfer',
          'redistribution',
          'derived_weights',
          'public_inference',
        ].map((key) => [
          key,
          {
            enum: ['allowed', 'not_allowed', 'conditional', 'not_reviewed'],
          },
        ]),
      ),
    },
    rationale: { type: 'string', minLength: 1 },
    evidence_refs: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'reference'],
        properties: {
          kind: { enum: ['local_path', 'url', 'document_id', 'source_span'] },
          reference: { type: 'string', minLength: 1 },
          sha256: {
            type: ['string', 'null'],
            pattern: '^[0-9a-f]{64}$',
          },
          note: { type: ['string', 'null'] },
        },
      },
    },
    amendments: { type: ['object', 'null'] },
    conditions: { type: 'array', items: { type: 'string', minLength: 1 } },
    supersedes_decision_id: { type: ['string', 'null'] },
  },
};

const countsByDictionaryKind = Object.fromEntries(
  [...new Set(dictionaryTasks.map((task) => task.review_kind))]
    .sort()
    .map((kind) => [
      kind,
      dictionaryTasks.filter((task) => task.review_kind === kind).length,
    ]),
);
const summary = {
  schema_version: 1,
  workpack_id: contract.workpack_id,
  created_at_utc: contract.created_at_utc,
  language: contract.language,
  contract: {
    path: path.relative(programRoot, contractPath),
    sha256: sha256(contractBytes),
  },
  supersedes: contract.supersedes ?? null,
  counts: {
    total_tasks: allTasks.length,
    dictionary_tasks: dictionaryTasks.length,
    dictionary_tasks_by_kind: countsByDictionaryKind,
    grammar_tasks: grammarTasks.length,
    grammar_topic_tasks: grammarTopicTasks.length,
    grammar_claim_tasks: grammarClaimTasks.length,
    grammar_candidate_claim_links: grammarTasks.reduce(
      (sum, task) => sum + task.candidate_claims.length,
      0,
    ),
    natural_sentence_tasks: sentenceTasks.length,
    source_rights_tasks: rightsTasks.length,
    required_role_decisions: allTasks.reduce(
      (sum, task) => sum + task.required_review_roles.length,
      0,
    ),
  },
  decision_model: {
    append_only: true,
    one_active_decision_per_task_and_role: true,
    corrections_require_supersedes_decision_id: true,
    automated_or_model_review_is_not_a_qualified_role: true,
    missing_review_means_abstention_not_approval: true,
  },
  release_contract: contract.release_contract,
};

const instructions = `# Anindilyakwa review workpack ${contract.workpack_id}\n\nThis workpack converts every currently known review gate into a stable task. It does not contain an approval.\n\n## Decision procedure\n\n1. Reviewers work only within a role they can document in \`reviewer.authority_basis\`.\n2. Write one JSON object per line using \`review-decision.schema.json\`.\n3. Keep the ledger append-only. A correction adds a new decision with \`supersedes_decision_id\`; it never edits or deletes history.\n4. Every decision cites at least one evidence reference.\n5. Missing required-role decisions mean abstention. A single role cannot approve a task that requires multiple roles.\n6. \`approve_with_revision\` includes machine-readable \`amendments\`; \`conditional\` scopes list explicit conditions.\n7. Natural benchmark items remain permanently excluded from training even when approved for benchmark use.\n8. Project approval, source-rights authority, cultural authority, qualified language review, and speaker certification remain distinct.\n\n## Files\n\n- \`dictionary-tasks.jsonl\`: ${dictionaryTasks.length} duplicate, editorial, and phrase-role tasks.\n- \`grammar-tasks.jsonl\`: ${grammarTopicTasks.length} topic gates plus ${grammarClaimTasks.length} direct claim decisions.\n- \`natural-sentence-tasks.jsonl\`: ${sentenceTasks.length} authentic benchmark candidates.\n- \`source-rights-tasks.jsonl\`: ${rightsTasks.length} source-by-source scope decisions.\n- \`review-decision.schema.json\`: decision contract.\n- \`summary.json\`: workload and role-decision census.\n\nRun the repository validator before treating any ledger as promotion evidence. The validator checks structure and documented coverage; it cannot authenticate a person's identity or manufacture authority.\n`;

const outputs = new Map<string, string>([
  [
    'dictionary-tasks.jsonl',
    `${dictionaryTasks.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'grammar-tasks.jsonl',
    `${grammarTasks.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'natural-sentence-tasks.jsonl',
    `${sentenceTasks.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'source-rights-tasks.jsonl',
    `${rightsTasks.map((row) => JSON.stringify(row)).join('\n')}\n`,
  ],
  [
    'review-decision.schema.json',
    `${JSON.stringify(decisionSchema, null, 2)}\n`,
  ],
  ['INSTRUCTIONS.md', instructions],
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
