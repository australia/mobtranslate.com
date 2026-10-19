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
  buildWajarriFiftyWordsDictionaryEdition,
  WajarriFiftyWordsDictionaryEditionContractSchema,
} from '../lib/research/wajarriFiftyWordsDictionaryEdition';

const ReferenceSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  rows: z.number().int().nonnegative(),
});

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
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

function readRows(
  root: string,
  reference: { path: string; sha256: string; rows: number },
): Array<Record<string, unknown>> {
  const rows = parseJsonLines(readVerified(root, reference));
  if (rows.length !== reference.rows)
    throw new Error(`row count mismatch for ${reference.path}`);
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
  const programRootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!programRootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-wajarri-50words-dictionary-edition.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(programRootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = WajarriFiftyWordsDictionaryEditionContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const parentManifestBytes = readVerified(
    programRoot,
    contract.parent_manifest,
  );
  const parentManifest = JSON.parse(
    parentManifestBytes.toString('utf8'),
  ) as Record<string, unknown>;
  if (parentManifest.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition identity mismatch');
  const parentComponents = z
    .record(z.string(), ReferenceSchema)
    .parse(parentManifest.components);
  const requiredParentKeys = [
    'entries',
    'senses',
    'forms',
    'examples',
    'mediaLinks',
  ] as const;
  const parentRows = Object.fromEntries(
    requiredParentKeys.map((key) => {
      const reference = parentComponents[key];
      if (!reference) throw new Error(`parent component absent: ${key}`);
      return [key, readRows(programRoot, reference)];
    }),
  ) as Record<
    (typeof requiredParentKeys)[number],
    Array<Record<string, unknown>>
  >;

  const taskManifestBytes = readVerified(programRoot, {
    path: contract.task_review.manifest_path,
    sha256: contract.task_review.manifest_sha256,
  });
  const taskManifest = JSON.parse(taskManifestBytes.toString('utf8')) as Record<
    string,
    unknown
  >;
  const taskComponents = z
    .record(z.string(), ReferenceSchema)
    .parse(taskManifest.components);
  const taskRows = Object.fromEntries(
    [
      'lexicalSenseDecisions',
      'fixedUtteranceDecisions',
      'lexicalSurfaceGroups',
      'directSupervisionCandidates',
      'pairAudioLinks',
    ].map((key) => {
      const reference = taskComponents[key];
      if (!reference) throw new Error(`task-review component absent: ${key}`);
      return [key, readRows(programRoot, reference)];
    }),
  );
  const sourceLedgerBytes = readVerified(programRoot, contract.source_ledger);
  const sourceRows = parseJsonLines(sourceLedgerBytes);
  const source = sourceRows.find(
    (row) => row.source_id === 'src-wbv-50words-a39-2019-20260723',
  );
  if (!source) throw new Error('50 Words source record is absent');
  for (const field of [
    'training_use',
    'redistribution',
    'derived_weights',
    'hosted_transfer',
  ])
    if (source[field] !== 'allowed')
      throw new Error(`50 Words source is not allowed for ${field}`);
  const changeLedgerBytes = readFileSync(
    resolveWithin(programRoot, contract.change_ledger.path),
  );
  const changeVerification = verifyAppendOnlyLedger(
    changeLedgerBytes,
    contract.change_ledger.sha256,
  );
  const changeRows = parseJsonLines(changeVerification.verifiedBytes);
  const issuingChange = changeRows.find(
    (row) => row.change_id === contract.change_ledger.issuing_change_id,
  );
  if (!issuingChange) throw new Error('issuing dictionary change is absent');
  if (
    issuingChange.new_edition_id !== contract.edition_id ||
    issuingChange.parent_edition_id !== contract.parent_edition_id ||
    issuingChange.status !== 'accepted_source_scoped'
  )
    throw new Error('issuing dictionary change does not match contract');

  const result = buildWajarriFiftyWordsDictionaryEdition({
    contractValue: contract,
    taskReviewManifestValue: taskManifest,
    parentEntries: parentRows.entries,
    parentSenses: parentRows.senses,
    parentForms: parentRows.forms,
    parentExamples: parentRows.examples,
    parentMediaLinks: parentRows.mediaLinks,
    lexicalSenseDecisionRows: taskRows.lexicalSenseDecisions,
    fixedUtteranceDecisionRows: taskRows.fixedUtteranceDecisions,
    lexicalSurfaceGroupRows: taskRows.lexicalSurfaceGroups,
    directSupervisionCandidateRows: taskRows.directSupervisionCandidates,
    pairAudioLinkRows: taskRows.pairAudioLinks,
    downloadRows: readRows(programRoot, contract.audio_downloads),
    probeRows: readRows(programRoot, contract.audio_probes),
  });

  const editionRoot = `dictionary/editions/${contract.edition_id}`;
  const changedRows = {
    entries: result.entries,
    senses: result.senses,
    forms: result.forms,
    examples: result.examples,
    mediaLinks: result.mediaLinks,
  };
  const filenames: Record<keyof typeof changedRows, string> = {
    entries: 'entries.jsonl',
    senses: 'senses.jsonl',
    forms: 'forms.jsonl',
    examples: 'examples.jsonl',
    mediaLinks: 'media-links.jsonl',
  };
  const contents = Object.fromEntries(
    (Object.keys(changedRows) as Array<keyof typeof changedRows>).map((key) => [
      key,
      jsonLines(changedRows[key]),
    ]),
  ) as Record<keyof typeof changedRows, string>;
  const changedComponents = Object.fromEntries(
    (Object.keys(changedRows) as Array<keyof typeof changedRows>).map((key) => [
      key,
      {
        path: `${editionRoot}/${filenames[key]}`,
        sha256: sha256(contents[key]),
        rows: changedRows[key].length,
      },
    ]),
  );
  const inheritedComponents = Object.fromEntries(
    Object.entries(parentComponents).filter(
      ([key]) => !(key in changedComponents),
    ),
  );
  const components = { ...inheritedComponents, ...changedComponents };
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
    task_review: contract.task_review,
    audio_evidence: {
      downloads: contract.audio_downloads,
      probes: contract.audio_probes,
    },
    source_ledger: contract.source_ledger,
    change_ledger: {
      path: contract.change_ledger.path,
      historical_sha256: contract.change_ledger.sha256,
      current_sha256: changeVerification.currentSha256,
      verification_mode: changeVerification.verificationMode,
      issuing_change_id: contract.change_ledger.issuing_change_id,
      accepted_change_ids: contract.change_ledger.accepted_change_ids,
    },
    component_inheritance: {
      mode: 'five_changed_components_with_exact_parent_aliases',
      changed_component_keys: Object.keys(changedComponents),
      inherited_component_keys: Object.keys(inheritedComponents),
    },
    components,
    counts: result.report,
    evidence_policy: {
      lexical_acceptance:
        'Exact speaker-attributed 50 Words A39 lexical concepts and source spellings are accepted only within each published source prompt.',
      fixed_utterances:
        'Eight whole utterances are accepted as examples; no segmentation, literal composition, or productive construction is inferred.',
      audio:
        'Every added audio link is hash-bound to a public A39 derivative that passed a full decode audit.',
      source_independence:
        'No independence from the existing dictionary lineage is assumed; exact-surface overlap is corroborating evidence, not a second independent lexical observation.',
      direct_supervision:
        'Fifty-five rows are eligible noncommercial direct-supervision candidates only after a separate split contract. None is currently a trainer-ready row.',
      synthetic_generation:
        'Zero rows authorize controlled synthetic sentence generation. Lexical entries need compatible part-of-speech, morphology, and productive-grammar review first.',
    },
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit:
      'This living edition adds source-scoped Wajarri lexical entries, senses, fixed utterances, and decoded audio. It does not establish unrestricted synonymy, part of speech, morphology, productive grammar, split-independent benchmark performance, synthetic sentence eligibility, or model translation quality.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestPath = `${editionRoot}/EDITION.json`;
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
    const absoluteEditionRoot = resolveWithin(programRoot, editionRoot);
    for (const key of Object.keys(changedRows) as Array<
      keyof typeof changedRows
    >)
      writeImmutable(
        path.join(absoluteEditionRoot, filenames[key]),
        contents[key],
      );
    writeImmutable(
      resolveWithin(programRoot, editionManifestPath),
      editionContent,
    );
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
        counts: result.report,
        changedComponents,
        inheritedComponentCount: Object.keys(inheritedComponents).length,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
