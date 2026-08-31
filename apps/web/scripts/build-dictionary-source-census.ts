import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import postgres, { type Sql } from 'postgres';
import {
  buildDictionaryCensus,
  buildSourceDictionaryRecords,
  canonicalJson,
  classifyDatabaseLineage,
  databaseContentTupleSha256,
  DictionaryCensusContractSchema,
  type DatabaseWordRecord,
} from '../lib/research/dictionarySourceCensus';

function flagValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function resolveWithin(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath))
    throw new Error(`path must be relative to the program root: ${relativePath}`);
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`path escapes the program root: ${relativePath}`);
  return resolved;
}

function sha256Bytes(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeImmutable(filePath: string, content: string): void {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf8');
    if (existing !== content)
      throw new Error(`refusing to rewrite immutable census artifact: ${filePath}`);
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o664 });
}

function jsonLines(rows: unknown[]): string {
  return `${rows.map((row) => canonicalJson(row)).join('\n')}\n`;
}

async function readDatabaseSnapshot(
  sql: Sql,
  languageCode: string,
): Promise<{
  snapshotAtUtc: string;
  databaseLanguage: { id: string; code: string; name: string };
  rows: DatabaseWordRecord[];
}> {
  await sql.unsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const languages = await sql<
    { id: string; code: string; name: string }[]
  >`
    SELECT id::text, code, name
    FROM public.languages
    WHERE code = ${languageCode}
  `;
  if (languages.length !== 1)
    throw new Error(
      `expected exactly one language row for ${languageCode}, found ${languages.length}`,
    );
  const language = languages[0];
  const snapshots = await sql<{ snapshot_at_utc: string }[]>`
    SELECT to_char(
      transaction_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) AS snapshot_at_utc
  `;
  const result = await sql<{ record: DatabaseWordRecord }[]>`
    SELECT jsonb_build_object(
      'databaseWordId', w.id::text,
      'word', w.word,
      'normalizedWord', w.normalized_word,
      'managedByYamlSync', w.managed_by_yaml_sync,
      'yamlSourceFile', w.yaml_source_file,
      'yamlSourceRef', w.yaml_source_ref,
      'yamlContentHash', w.yaml_content_hash,
      'isVerified', w.is_verified,
      'qualityScore', w.quality_score,
      'notes', w.notes,
      'metadata', COALESCE(w.metadata, '{}'::jsonb),
      'createdAt', to_char(
        w.created_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'updatedAt', to_char(
        COALESCE(w.updated_at, w.created_at) AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'wordClassCode', wc.code,
      'definitions', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', d.id::text,
            'definition', d.definition,
            'definitionNumber', d.definition_number,
            'isPrimary', d.is_primary
          ) ORDER BY d.definition_number NULLS LAST, d.id
        )
        FROM public.definitions d
        WHERE d.word_id = w.id
      ), '[]'::jsonb),
      'translations', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', t.id::text,
            'translation', t.translation,
            'targetLanguage', t.target_language,
            'isPrimary', t.is_primary
          ) ORDER BY t.is_primary DESC NULLS LAST, t.id
        )
        FROM public.translations t
        WHERE t.word_id = w.id
      ), '[]'::jsonb),
      'entrySource', w.entry_source,
      'needsReview', w.needs_review
    ) AS record
    FROM public.words w
    LEFT JOIN public.word_classes wc ON wc.id = w.word_class_id
    WHERE w.language_id = ${language.id}::uuid
    ORDER BY w.created_at, w.id
  `;
  return {
    snapshotAtUtc: snapshots[0].snapshot_at_utc,
    databaseLanguage: language,
    rows: result.map((row) => row.record),
  };
}

async function main(): Promise<void> {
  const rootArgument = flagValue('--program-root');
  if (!rootArgument)
    throw new Error(
      'usage: tsx scripts/build-dictionary-source-census.ts --program-root PATH --contract RELATIVE_PATH [--write]',
    );
  const programRoot = path.resolve(rootArgument);
  const contractRelativePath =
    flagValue('--contract') ?? 'dictionary/CENSUS-CONTRACT.json';
  const contractPath = resolveWithin(programRoot, contractRelativePath);
  const contractBytes = readFileSync(contractPath);
  const contract = DictionaryCensusContractSchema.parse(
    JSON.parse(contractBytes.toString('utf8')),
  );
  const sourcePath = resolveWithin(programRoot, contract.source.path);
  const sourceBytes = readFileSync(sourcePath);
  const sourceJson: unknown = JSON.parse(sourceBytes.toString('utf8'));
  if (!Array.isArray(sourceJson)) throw new Error('source JSON must be an array');
  const sourceRecords = buildSourceDictionaryRecords(sourceJson, contract);

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const client = postgres(databaseUrl, { max: 1 });
  let snapshot;
  try {
    snapshot = await client.begin((transaction) =>
      readDatabaseSnapshot(transaction, contract.language.code),
    );
  } finally {
    await client.end();
  }
  const census = buildDictionaryCensus(sourceRecords, snapshot.rows, contract);

  if (
    contract.database.require_exact_legacy_and_yaml_pair &&
    (census.report.crosswalk.anomalyRows !== 0 ||
      census.report.crosswalk.unconsumedDatabaseRows !== 0 ||
      census.report.crosswalk.exactTwoLineagePairs !== sourceRecords.length)
  ) {
    throw new Error(
      `strict lineage contract failed: ${canonicalJson(census.report.crosswalk)}`,
    );
  }

  const generatedAtUtc = new Date().toISOString();
  const sourceRecordsContent = jsonLines(sourceRecords);
  const databaseRowsContent = jsonLines(
    snapshot.rows.map((row) => ({
      ...row,
      lineage: classifyDatabaseLineage(row),
      contentTupleSha256: databaseContentTupleSha256(row),
    })),
  );
  const crosswalkContent = jsonLines(census.crosswalk);
  const report = {
    ...census.report,
    censusId: contract.census_id,
    generatedAtUtc,
    databaseSnapshotAtUtc: snapshot.snapshotAtUtc,
    databaseLanguage: snapshot.databaseLanguage,
    contractSha256: sha256Bytes(contractBytes),
    sourceFileSha256: sha256Bytes(sourceBytes),
  };
  const reportContent = `${JSON.stringify(report, null, 2)}\n`;
  const outputRelativeRoot = `analysis/inventories/${contract.census_id}`;
  const outputRoot = resolveWithin(programRoot, outputRelativeRoot);
  const artifacts = {
    sourceRecords: {
      path: `${outputRelativeRoot}/source-records.jsonl`,
      sha256: sha256Bytes(sourceRecordsContent),
      rows: sourceRecords.length,
    },
    databaseRows: {
      path: `${outputRelativeRoot}/live-database-rows.jsonl`,
      sha256: sha256Bytes(databaseRowsContent),
      rows: snapshot.rows.length,
    },
    crosswalk: {
      path: `${outputRelativeRoot}/source-database-crosswalk.jsonl`,
      sha256: sha256Bytes(crosswalkContent),
      rows: census.crosswalk.length,
    },
    report: {
      path: `${outputRelativeRoot}/report.json`,
      sha256: sha256Bytes(reportContent),
      rows: null,
    },
  };
  const manifest = {
    schemaVersion: 1,
    censusId: contract.census_id,
    generatedAtUtc,
    databaseSnapshotAtUtc: snapshot.snapshotAtUtc,
    contract: {
      path: contractRelativePath,
      sha256: sha256Bytes(contractBytes),
    },
    source: {
      sourceId: contract.source.source_id,
      path: contract.source.path,
      sha256: sha256Bytes(sourceBytes),
    },
    artifacts,
    exactLineageContractPassed:
      census.report.crosswalk.anomalyRows === 0 &&
      census.report.crosswalk.unconsumedDatabaseRows === 0 &&
      census.report.crosswalk.exactTwoLineagePairs === sourceRecords.length,
    claimLimit: census.report.claimLimit,
  };
  const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`;

  if (process.argv.includes('--write')) {
    writeImmutable(
      path.join(outputRoot, 'source-records.jsonl'),
      sourceRecordsContent,
    );
    writeImmutable(
      path.join(outputRoot, 'live-database-rows.jsonl'),
      databaseRowsContent,
    );
    writeImmutable(
      path.join(outputRoot, 'source-database-crosswalk.jsonl'),
      crosswalkContent,
    );
    writeImmutable(path.join(outputRoot, 'report.json'), reportContent);
    writeImmutable(path.join(outputRoot, 'MANIFEST.json'), manifestContent);
  }

  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes('--write') ? 'written' : 'validated_only',
        outputRoot,
        manifestSha256: sha256Bytes(manifestContent),
        ...census.report.source,
        database: census.report.database,
        crosswalk: census.report.crosswalk,
        EnglishPromptInventory: census.report.EnglishPromptInventory,
        artifactHashes: artifacts,
      },
      null,
      2,
    ),
  );
}

main();
