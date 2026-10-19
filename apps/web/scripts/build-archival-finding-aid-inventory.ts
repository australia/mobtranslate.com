import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { verifyAppendOnlyLedger } from '../lib/research/appendOnlyLedger';
import {
  ArchivalFindingAidInventoryContractSchema,
  buildArchivalFindingAidInventory,
} from '../lib/research/archivalFindingAidInventory';
import { canonicalJson } from '../lib/research/dictionarySourceCensus';

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

function sha1Base32(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const digest = createHash('sha1').update(bytes).digest();
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
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
  const text = bytes.toString('utf8');
  if (!text.endsWith('\n')) throw new Error('JSONL must end with a newline');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
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

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  const contractRelativePath = flagValue('--contract');
  if (!rootArgument || !contractRelativePath)
    throw new Error(
      'usage: tsx scripts/build-archival-finding-aid-inventory.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractBytes = readFileSync(
    resolveWithin(programRoot, contractRelativePath),
  );
  const contractValue = JSON.parse(contractBytes.toString('utf8')) as Record<
    string,
    unknown
  >;
  const contract =
    ArchivalFindingAidInventoryContractSchema.parse(contractValue);

  const parentManifestBytes = readVerified(
    programRoot,
    contract.parent_inventory.manifest,
  );
  const parentCandidateRows = parseJsonLines(
    readVerified(
      programRoot,
      contract.parent_inventory.aiatsis_recording_candidates,
    ),
  );
  for (const component of Object.values(
    contract.parent_inventory.inherited_components,
  ))
    readVerified(programRoot, component);

  const ledgerBytes = readFileSync(
    resolveWithin(programRoot, contract.source_ledger.path),
  );
  const ledgerVerification = verifyAppendOnlyLedger(
    ledgerBytes,
    contract.source_ledger.historical_sha256,
  );
  const buildFromCurrentLedger =
    contract.source_ledger.build_scope === 'current_after_verified_prefix';
  const buildLedgerBytes = buildFromCurrentLedger
    ? ledgerBytes
    : ledgerVerification.verifiedBytes;
  const sourceTexts = new Map<string, string>();
  for (const source of contract.source_artifacts) {
    const pdfBytes = readVerified(programRoot, source.pdf);
    if (source.capture_kind !== 'browser_rendered_catalog_record') {
      const actualSha1 = sha1Base32(pdfBytes);
      if (actualSha1 !== source.payload_sha1_base32)
        throw new Error(`SHA-1 payload mismatch for ${source.source_id}`);
      if (
        source.payload_digest_verification ===
          'wayback_cdx_sha1_base32_exact_match' &&
        actualSha1 !== source.wayback_cdx_digest
      )
        throw new Error(`Wayback digest mismatch for ${source.source_id}`);
    }
    sourceTexts.set(
      source.text_artifact_key,
      readVerified(programRoot, source.extracted_text).toString('utf8'),
    );
    for (const rendering of source.renderings)
      readVerified(programRoot, rendering);
    for (const artifact of source.acquisition_artifacts)
      readVerified(programRoot, artifact);
  }

  const result = buildArchivalFindingAidInventory({
    contractValue: contract,
    parentCandidateRows,
    parentManifestValue: JSON.parse(
      parentManifestBytes.toString('utf8'),
    ) as Record<string, unknown>,
    sourceLedgerRows: parseJsonLines(buildLedgerBytes),
    sourceTexts,
  });
  const relativeRoot = `analysis/inventories/${contract.inventory_id}`;
  const componentFiles = {
    aiatsisRecordingCandidates: 'aiatsis-recording-candidates.jsonl',
    relatedLanguageExclusions: 'related-language-exclusions.jsonl',
    sourceArtifactVerification: 'source-artifact-verification.jsonl',
  } as const;
  const componentContents = Object.fromEntries(
    Object.entries(componentFiles).map(([key]) => [
      key,
      jsonLines(
        result.components[key as keyof typeof result.components] as unknown[],
      ),
    ]),
  ) as Record<keyof typeof componentFiles, string>;
  const components = Object.fromEntries(
    Object.entries(componentFiles).map(([key, filename]) => [
      key,
      {
        path: `${relativeRoot}/${filename}`,
        sha256: sha256(componentContents[key as keyof typeof componentFiles]),
        rows: result.components[key as keyof typeof result.components].length,
      },
    ]),
  );
  const report = {
    schema_version: 1,
    report_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    parent_inventory: contract.parent_inventory.inventory_id,
    validation: result.validation,
    findings: contract.report_findings ?? [
      {
        finding_id: `${contract.inventory_id}-target-catalog-expansion`,
        classification: 'source_acquisition_priority',
        finding:
          'The new byte-verified finding aids add catalog-level Wajarri lesson, elicitation, word-list, narrative, song, and radio candidates across multiple named participants. Catalog groups remain acquisition units, not transcripts or independent sentence pairs.',
        linguistic_evidentiary_force: 'catalog_only',
      },
      {
        finding_id: `${contract.inventory_id}-related-language-exclusions`,
        classification: 'language_identity_control',
        finding:
          'IRRA-WANGGA-02, IRRA-WANGGA-03, and IRRA-WANGGA-05 are source-verified as Warriyangka or Warriyangga collections and are explicitly excluded from the Wajarri candidate pool.',
        linguistic_evidentiary_force: 'exclusion_only',
      },
      {
        finding_id: `${contract.inventory_id}-model-use`,
        classification: 'rights_and_evidence_block',
        finding:
          'The finding aids are archived, but the described recordings, transcripts, and alignments are not acquired. Every row remains closed to training, benchmarking, hosted transfer, and automatic linguistic acceptance.',
        linguistic_evidentiary_force: 'none_for_model_input',
      },
    ],
    claim_limit: contract.claim_limit,
  };
  const reportContent = `${JSON.stringify(report, null, 2)}\n`;
  const manifest = {
    schema_version: 1,
    inventory_id: contract.inventory_id,
    created_at_utc: contract.created_at_utc,
    language: contract.language,
    parent_inventory: contract.parent_inventory,
    method_contract: {
      path: contractRelativePath,
      sha256: sha256(contractBytes),
    },
    source_ledger: {
      path: contract.source_ledger.path,
      historical_sha256: contract.source_ledger.historical_sha256,
      current_sha256: buildFromCurrentLedger
        ? ledgerVerification.currentSha256
        : sha256(buildLedgerBytes),
      verification_mode: buildFromCurrentLedger
        ? ledgerVerification.verificationMode
        : 'exact_file',
    },
    // The contract has already been validated. Preserve its declared key order so
    // historical manifests remain byte-reproducible when the Zod schema evolves.
    source_artifacts: contractValue.source_artifacts,
    inherited_components: contract.parent_inventory.inherited_components,
    components,
    report: {
      path: `${relativeRoot}/REPORT.json`,
      sha256: sha256(reportContent),
    },
    validation: result.validation,
    release_status: contract.release_status,
    claim_limit: contract.claim_limit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = `${relativeRoot}/MANIFEST.json`;

  if (process.argv.includes('--write')) {
    for (const key of Object.keys(componentFiles) as Array<
      keyof typeof componentFiles
    >)
      writeImmutable(
        resolveWithin(programRoot, components[key].path),
        componentContents[key],
      );
    writeImmutable(
      resolveWithin(programRoot, `${relativeRoot}/REPORT.json`),
      reportContent,
    );
    writeImmutable(resolveWithin(programRoot, manifestPath), manifestContent);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        inventoryId: contract.inventory_id,
        manifestPath,
        manifestSha256: sha256(manifestContent),
        validation: result.validation,
        components,
      },
      null,
      2,
    )}\n`,
  );
}

void main();
