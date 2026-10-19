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
import { verifyAppendOnlyLedger } from '../lib/research/appendOnlyLedger';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';
import {
  buildGrammarEvidenceSynthesis,
  GrammarEvidenceSynthesisContractSchema,
  type LoadedEvidenceSource,
} from '../lib/research/grammarEvidenceSynthesis';

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
  expected: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  const actual = sha256(bytes);
  if (actual !== expected)
    throw new Error(
      `hash mismatch for ${relativePath}: expected ${expected}, found ${actual}`,
    );
  return bytes;
}

function readVerifiedLedger(
  root: string,
  relativePath: string,
  expected: string,
): Buffer {
  const bytes = readFileSync(resolveWithin(root, relativePath));
  return verifyAppendOnlyLedger(bytes, expected).verifiedBytes;
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

function writeMutablePointer(
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
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, content, { encoding: 'utf8', mode: 0o664 });
    renameSync(temporaryPath, filePath);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath);
  }
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-grammar-evidence-synthesis.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contract = GrammarEvidenceSynthesisContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const parentManifestBytes = readVerified(
    programRoot,
    contract.parent_edition.manifest_path,
    contract.parent_edition.manifest_sha256,
  );
  const parentManifest = JSON.parse(parentManifestBytes.toString('utf8')) as {
    edition_id?: string;
    components?: { claims?: { path?: string; sha256?: string } };
  };
  if (parentManifest.edition_id !== contract.parent_edition_id)
    throw new Error('parent edition ID does not match its manifest');
  const inheritedClaimsComponent = parentManifest.components?.claims;
  if (!inheritedClaimsComponent?.path || !inheritedClaimsComponent.sha256)
    throw new Error('parent manifest has no claims component');
  const inheritedClaims = parseJsonLines(
    readVerified(
      programRoot,
      inheritedClaimsComponent.path,
      inheritedClaimsComponent.sha256,
    ),
  );
  const inheritedClaimKeys = new Set(
    inheritedClaims.map((claim) => {
      if (typeof claim.claimKey !== 'string')
        throw new Error('parent claim has no claimKey');
      return claim.claimKey;
    }),
  );

  readVerifiedLedger(
    programRoot,
    contract.source_ledger.path,
    contract.source_ledger.sha256,
  );
  readVerifiedLedger(
    programRoot,
    contract.change_ledger.path,
    contract.change_ledger.sha256,
  );

  const loadedSources = new Map<string, LoadedEvidenceSource>();
  for (const source of contract.sources) {
    const sourceBytes = readVerified(programRoot, source.path, source.sha256);
    if (source.source_kind === 'form_feed_text') {
      readVerified(
        programRoot,
        source.page_index.manifest_path,
        source.page_index.manifest_sha256,
      );
      const pageRows = parseJsonLines(
        readVerified(
          programRoot,
          source.page_index.pages_path,
          source.page_index.pages_sha256,
        ),
      );
      loadedSources.set(source.source_id, {
        sourceBytes,
        pageIndexRows: pageRows as unknown as NonNullable<
          LoadedEvidenceSource['pageIndexRows']
        >,
      });
    } else {
      loadedSources.set(source.source_id, { sourceBytes });
    }
  }

  const result = buildGrammarEvidenceSynthesis(
    contract,
    loadedSources,
    inheritedClaimKeys,
  );
  const editionRelativeRoot = `grammar/editions/${contract.edition_id}`;
  const editionRoot = resolveWithin(programRoot, editionRelativeRoot);
  const contents = {
    assertions: jsonLines(result.assertions),
    syntheses: jsonLines(result.syntheses),
    conflicts: jsonLines(result.conflicts),
    reviewQueue: jsonLines(result.reviewQueue),
  };
  const components = Object.fromEntries(
    Object.entries(contents).map(([key, content]) => [
      key,
      {
        path: `${editionRelativeRoot}/${
          key === 'reviewQueue'
            ? 'review-queue'
            : key === 'assertions'
              ? 'source-assertions'
              : key
        }.jsonl`,
        sha256: sha256(content),
        rows:
          key === 'assertions'
            ? result.assertions.length
            : key === 'syntheses'
              ? result.syntheses.length
              : key === 'conflicts'
                ? result.conflicts.length
                : result.reviewQueue.length,
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
    parent_edition: {
      ...contract.parent_edition,
      inherited_claim_rows: inheritedClaims.length,
      inherited_claim_component: inheritedClaimsComponent,
    },
    source_ledger_sha256: contract.source_ledger.sha256,
    change_ledger_sha256: contract.change_ledger.sha256,
    evidence_sources: contract.sources.map((source) => ({
      source_id: source.source_id,
      source_kind: source.source_kind,
      sha256: source.sha256,
      authority_tier: source.authority_tier,
      training_use: source.training_use,
    })),
    components,
    counts: {
      inherited_candidate_claims: inheritedClaims.length,
      new_source_assertions: result.assertions.length,
      cross_source_syntheses: result.syntheses.length,
      accepted_for_analysis_syntheses: result.acceptedForAnalysisCount,
      unresolved_conflicts: result.conflicts.length,
      review_items: result.reviewQueue.length,
      training_eligible_rows: 0,
    },
    accepted_change_ids: contract.change_ledger.accepted_change_ids,
    supersedes: [contract.parent_edition_id],
    release_status: contract.release_status,
    claim_limit:
      'Accepted-for-analysis means convergent source support for research planning. It is not fluent-speaker ratification, training permission, a natural sentence corpus, or authorization for model release.',
  };
  const editionContent = `${JSON.stringify(edition, null, 2)}\n`;
  const editionManifestRelativePath = `${editionRelativeRoot}/EDITION.json`;
  const editionManifestSha256 = sha256(editionContent);
  const currentPointer = {
    schema_version: 1,
    artifact: 'grammar',
    current_edition_id: contract.edition_id,
    manifest_path: editionManifestRelativePath,
    manifest_sha256: editionManifestSha256,
    updated_at_utc: contract.created_at_utc,
    supersedes_pointer_sha256: contract.supersedes_pointer_sha256,
    release_status: contract.release_status,
  };
  const currentPointerContent = `${JSON.stringify(currentPointer, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    writeImmutable(
      path.join(editionRoot, 'source-assertions.jsonl'),
      contents.assertions,
    );
    writeImmutable(
      path.join(editionRoot, 'syntheses.jsonl'),
      contents.syntheses,
    );
    writeImmutable(
      path.join(editionRoot, 'conflicts.jsonl'),
      contents.conflicts,
    );
    writeImmutable(
      path.join(editionRoot, 'review-queue.jsonl'),
      contents.reviewQueue,
    );
    writeImmutable(path.join(editionRoot, 'EDITION.json'), editionContent);
    writeMutablePointer(
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
        editionManifestPath: editionManifestRelativePath,
        editionManifestSha256,
        currentPointerSha256: sha256(currentPointerContent),
        components,
        counts: edition.counts,
      },
      null,
      2,
    ),
  );
}

main();
