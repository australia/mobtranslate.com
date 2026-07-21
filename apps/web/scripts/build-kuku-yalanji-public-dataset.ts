import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { load as loadYaml } from 'js-yaml';

type SqlValue = string | number | bigint | Uint8Array | null;
type SqlRow = Record<string, SqlValue>;
type JsonRecord = Record<string, unknown>;

const RELEASE_ID = 'kuku-yalanji-synthetic-research-corpus-v2.0.0-20260711';
const RELEASE_VERSION = '2.0.0-research';
const DEFAULT_RELEASED_AT = '2026-07-11T06:45:00Z';
const EXPECTED_SENTENCES = 20_047;
const EXPECTED_CORPUS_DIGEST = 'cb32b539e0bf9763a707afe22d702c9520f5b41ec244ea8e63013fee2798763a';
const EXPECTED_DICTIONARY_DIGEST = 'b575ab035ecc60f09f7bfc5537116555f3d290869fe75b2edf0fd8db60fe1b37';

function argValue(name: string, fallback: string): string {
  const flag = `--${name}`;
  const directIndex = process.argv.indexOf(flag);
  if (directIndex >= 0 && process.argv[directIndex + 1]) return process.argv[directIndex + 1];
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
}

const repoRoot = path.resolve(argValue('repo-root', path.resolve(process.cwd(), '../..')));
const programRoot = path.resolve(argValue(
  'program-root',
  '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30',
));
const outputRoot = path.resolve(argValue('output-root', path.join(programRoot, 'public-datasets')));
const releasedAt = argValue('released-at', DEFAULT_RELEASED_AT);
const sourceDateEpoch = Math.floor(new Date(releasedAt).getTime() / 1000);

if (!Number.isFinite(sourceDateEpoch)) throw new Error(`Invalid --released-at value: ${releasedAt}`);

const corpusRoot = path.join(programRoot, 'synthetic/claude-synthetic-v1-2026-07-02');
const corpusDb = path.join(corpusRoot, 'synthetic.db');
const dictionaryYaml = path.join(repoRoot, 'dictionaries/kuku_yalanji/dictionary.yaml');
const canonicalExport = path.join(corpusRoot, 'export');
const governedV21 = path.join(programRoot, 'prepared/v21.1-codex-synthetic-direct');
const completionAudits = path.join(programRoot, 'completion_audits');
const reportRoot = path.join(programRoot, 'reports');

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

function writeText(file: string, value: string): void {
  ensureDirectory(path.dirname(file));
  fs.writeFileSync(file, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

function copyFile(source: string, target: string): void {
  if (!fs.existsSync(source)) throw new Error(`Required source file is missing: ${source}`);
  ensureDirectory(path.dirname(target));
  fs.copyFileSync(source, target);
}

function sha256File(file: string): string {
  const digest = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return digest.digest('hex');
}

function countLines(file: string): number {
  const content = fs.readFileSync(file, 'utf8');
  if (!content) return 0;
  return content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length;
}

function normalizeSqlValue(value: SqlValue): unknown {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  return value;
}

function normalizeRow(row: SqlRow, jsonColumns: string[] = []): JsonRecord {
  const normalized: JsonRecord = {};
  for (const [key, value] of Object.entries(row)) {
    if (jsonColumns.includes(key) && typeof value === 'string' && value) {
      try {
        normalized[key] = JSON.parse(value) as unknown;
        continue;
      } catch {
        // Preserve malformed historical values verbatim instead of dropping evidence.
      }
    }
    normalized[key] = normalizeSqlValue(value);
  }
  return normalized;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function writeJsonlQuery(
  db: DatabaseSync,
  file: string,
  sql: string,
  transform: (_row: SqlRow) => unknown = (row) => normalizeRow(row),
): number {
  ensureDirectory(path.dirname(file));
  const fd = fs.openSync(file, 'w');
  let count = 0;
  try {
    for (const row of db.prepare(sql).iterate() as Iterable<SqlRow>) {
      fs.writeSync(fd, `${JSON.stringify(transform(row))}\n`, null, 'utf8');
      count += 1;
    }
  } finally {
    fs.closeSync(fd);
  }
  return count;
}

function writeCsvQuery(
  db: DatabaseSync,
  file: string,
  headers: string[],
  sql: string,
  transform: (_row: SqlRow) => Record<string, unknown> = (row) => normalizeRow(row),
): number {
  ensureDirectory(path.dirname(file));
  const fd = fs.openSync(file, 'w');
  let count = 0;
  try {
    fs.writeSync(fd, `${headers.map(csvCell).join(',')}\n`, null, 'utf8');
    for (const row of db.prepare(sql).iterate() as Iterable<SqlRow>) {
      const record = transform(row);
      fs.writeSync(fd, `${headers.map((header) => csvCell(record[header])).join(',')}\n`, null, 'utf8');
      count += 1;
    }
  } finally {
    fs.closeSync(fd);
  }
  return count;
}

function scalar(db: DatabaseSync, sql: string): number {
  const row = db.prepare(sql).get() as SqlRow;
  const value = Object.values(row)[0];
  return typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
}

function corpusDigest(db: DatabaseSync): string {
  const digest = createHash('sha256');
  const rows = db.prepare(
    `SELECT b.label, s.seq, s.english, s.kuku, s.analysis, s.frame, s.tier, s.words_used,
            s.evidence, s.status, s.confidence, s.rights_status, s.author
       FROM sentences s
       JOIN batches b ON b.id = s.batch_id
      WHERE s.status IN ('accepted', 'revised')
      ORDER BY b.id, s.seq`,
  ).iterate() as Iterable<SqlRow>;

  for (const row of rows) {
    digest.update(`${JSON.stringify([
      row.label,
      row.seq,
      row.english,
      row.kuku,
      row.analysis,
      row.frame,
      row.tier,
      row.words_used,
      row.evidence,
      row.status,
      row.confidence,
      row.rights_status,
      row.author,
    ])}\n`);
  }
  return digest.digest('hex');
}

function copyTree(
  sourceRoot: string,
  targetRoot: string,
  include: (_relativePath: string) => boolean,
): number {
  let copied = 0;
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const source = path.join(directory, entry.name);
      const relative = path.relative(sourceRoot, source);
      if (entry.isDirectory()) {
        if (entry.name !== '__pycache__') visit(source);
      } else if (entry.isFile() && include(relative)) {
        copyFile(source, path.join(targetRoot, relative));
        copied += 1;
      }
    }
  };
  if (fs.existsSync(sourceRoot)) visit(sourceRoot);
  return copied;
}

function listFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) files.push(path.relative(root, file));
    }
  };
  visit(root);
  return files.sort();
}

function mediaType(file: string): string {
  if (file.endsWith('.jsonl')) return 'application/x-ndjson';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.csv')) return 'text/csv';
  if (file.endsWith('.yaml') || file.endsWith('.yml')) return 'application/yaml';
  if (file.endsWith('.md')) return 'text/markdown';
  if (file.endsWith('.sql')) return 'application/sql';
  if (file.endsWith('.db')) return 'application/vnd.sqlite3';
  if (file.endsWith('.cff')) return 'application/yaml';
  return 'application/octet-stream';
}

function fileRole(file: string): string {
  if (file.startsWith('data/')) return 'data';
  if (file.startsWith('training/')) return 'training-split';
  if (file.startsWith('documentation/')) return 'documentation';
  if (file.startsWith('audits/')) return 'audit';
  if (file.startsWith('provenance/')) return 'provenance';
  return 'release-metadata';
}

function setTreeMtime(root: string, epochSeconds: number): void {
  const timestamp = new Date(epochSeconds * 1000);
  const directories: string[] = [];
  const visit = (directory: string): void => {
    directories.push(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) fs.utimesSync(file, timestamp, timestamp);
    }
  };
  visit(root);
  directories.reverse().forEach((directory) => fs.utimesSync(directory, timestamp, timestamp));
}

function run(command: string, args: string[], options: { cwd?: string; input?: string } = {}): void {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: 'utf8',
    stdio: options.input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
}

function main(): void {
  if (!fs.existsSync(corpusDb) || !fs.existsSync(dictionaryYaml)) {
    throw new Error('Canonical corpus or dictionary source is missing.');
  }

  const finalReleaseDir = path.join(outputRoot, RELEASE_ID);
  const zipFile = path.join(outputRoot, `${RELEASE_ID}.zip`);
  const tarFile = path.join(outputRoot, `${RELEASE_ID}.tar.gz`);
  for (const target of [finalReleaseDir, zipFile, tarFile]) {
    if (fs.existsSync(target)) throw new Error(`Refusing to overwrite versioned release artifact: ${target}`);
  }

  ensureDirectory(outputRoot);
  const workRoot = fs.mkdtempSync(path.join(outputRoot, '.dataset-build-'));
  const releaseDir = path.join(workRoot, RELEASE_ID);
  ensureDirectory(releaseDir);

  const db = new DatabaseSync(corpusDb, { readOnly: true });
  try {
    db.exec('PRAGMA query_only = ON');
    const integrityRows = db.prepare('PRAGMA integrity_check').all() as SqlRow[];
    const integrity = integrityRows.map((row) => String(Object.values(row)[0] ?? ''));
    const foreignKeyViolations = (db.prepare('PRAGMA foreign_key_check').all() as SqlRow[]).length;
    if (integrity.length !== 1 || integrity[0] !== 'ok' || foreignKeyViolations !== 0) {
      throw new Error(`Corpus database failed integrity checks: ${JSON.stringify({ integrity, foreignKeyViolations })}`);
    }

    const sourceWal = `${corpusDb}-wal`;
    const sourceWalBytes = fs.existsSync(sourceWal) ? fs.statSync(sourceWal).size : 0;
    if (sourceWalBytes !== 0) throw new Error(`Corpus WAL is non-empty (${sourceWalBytes} bytes); checkpoint before export.`);

    const sentenceCount = scalar(db, 'SELECT COUNT(*) FROM sentences');
    const verifiedCount = scalar(db, "SELECT COUNT(*) FROM sentences WHERE status IN ('accepted', 'revised')");
    const computedCorpusDigest = corpusDigest(db);
    const dictionaryDigest = sha256File(dictionaryYaml);
    if (sentenceCount !== EXPECTED_SENTENCES || verifiedCount !== EXPECTED_SENTENCES) {
      throw new Error(`Expected ${EXPECTED_SENTENCES} closed sentences, found ${sentenceCount}/${verifiedCount}.`);
    }
    if (computedCorpusDigest !== EXPECTED_CORPUS_DIGEST) {
      throw new Error(`Canonical corpus digest changed: ${computedCorpusDigest}`);
    }
    if (dictionaryDigest !== EXPECTED_DICTIONARY_DIGEST) {
      throw new Error(`Pinned dictionary digest changed: ${dictionaryDigest}`);
    }

    const tableCounts = Object.fromEntries([
      'sentences',
      'batches',
      'lexemes',
      'lexeme_log',
      'reviews',
      'revisions',
      'lessons',
      'process_events',
      'authorship_remediation',
    ].map((table) => [table, scalar(db, `SELECT COUNT(*) FROM ${table}`)]));

    const sentenceSql = `SELECT s.id, b.label AS batch, s.seq AS sequence, s.english,
                                s.kuku AS kuku_yalanji, s.analysis, s.frame, s.tier,
                                s.words_used, s.loans_used, s.evidence, s.status, s.confidence,
                                s.rights_status, s.author, s.created_at, s.updated_at
                           FROM sentences s
                           JOIN batches b ON b.id = s.batch_id
                          ORDER BY b.id, s.seq`;
    const sentenceTransform = (row: SqlRow) => normalizeRow(row, ['words_used', 'loans_used']);
    const sentenceHeaders = [
      'id', 'batch', 'sequence', 'english', 'kuku_yalanji', 'analysis', 'frame', 'tier',
      'words_used', 'loans_used', 'evidence', 'status', 'confidence', 'rights_status',
      'author', 'created_at', 'updated_at',
    ];
    const jsonlSentences = writeJsonlQuery(db, path.join(releaseDir, 'data/sentences.jsonl'), sentenceSql, sentenceTransform);
    const csvSentences = writeCsvQuery(db, path.join(releaseDir, 'data/sentences.csv'), sentenceHeaders, sentenceSql, sentenceTransform);
    if (jsonlSentences !== EXPECTED_SENTENCES || csvSentences !== EXPECTED_SENTENCES) {
      throw new Error('Sentence convenience exports do not contain the full corpus.');
    }

    const lexemeSql = 'SELECT * FROM lexemes ORDER BY id';
    const lexemeTransform = (row: SqlRow) => normalizeRow(row, ['senses', 'attestation']);
    writeJsonlQuery(db, path.join(releaseDir, 'data/lexemes.jsonl'), lexemeSql, lexemeTransform);
    writeCsvQuery(
      db,
      path.join(releaseDir, 'data/lexemes.csv'),
      [
        'id', 'headword', 'phonemic', 'pos', 'conj_class', 'case_class', 'gloss', 'senses',
        'attestation', 'allomorphy', 'morphology', 'collocations', 'usage_notes',
        'antonyms_contrasts', 'corpus_freq', 'status', 'verified_at', 'notes',
      ],
      lexemeSql,
      lexemeTransform,
    );

    const genericExports: Array<[string, string[]]> = [
      ['batches', []],
      ['reviews', []],
      ['revisions', []],
      ['lessons', []],
      ['lexeme_log', []],
      ['process_events', []],
      ['authorship_remediation', []],
    ];
    for (const [table, jsonColumns] of genericExports) {
      writeJsonlQuery(
        db,
        path.join(releaseDir, `data/${table}.jsonl`),
        `SELECT * FROM ${table} ORDER BY id`,
        (row) => normalizeRow(row, jsonColumns),
      );
    }

    const schemaRows = db.prepare(
      `SELECT type, name, sql FROM sqlite_master
        WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
        ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
    ).all() as SqlRow[];
    writeText(
      path.join(releaseDir, 'data/schema.sql'),
      schemaRows.map((row) => `-- ${row.type}: ${row.name}\n${row.sql};`).join('\n\n'),
    );
    copyFile(corpusDb, path.join(releaseDir, 'data/synthetic.db'));
    copyFile(dictionaryYaml, path.join(releaseDir, 'data/dictionary.yaml'));

    const rawDictionary = loadYaml(fs.readFileSync(dictionaryYaml, 'utf8')) as {
      meta?: Record<string, unknown>;
      words?: JsonRecord[];
    };
    const dictionaryEntries = rawDictionary.words ?? [];
    const dictionaryJsonl = path.join(releaseDir, 'data/dictionary.jsonl');
    ensureDirectory(path.dirname(dictionaryJsonl));
    writeText(
      dictionaryJsonl,
      dictionaryEntries.map((entry, index) => JSON.stringify({ entry_id: `dictionary-${index + 1}`, ...entry })).join('\n'),
    );
    const dictionaryHeaders = [
      'entry_id', 'word', 'type', 'phonemic', 'gloss', 'definitions', 'translations',
      'semantic_domain', 'source', 'needs_review', 'examples', 'commentary', 'verb_class', 'entry_json',
    ];
    const dictionaryCsv = path.join(releaseDir, 'data/dictionary.csv');
    const dictionaryFd = fs.openSync(dictionaryCsv, 'w');
    try {
      fs.writeSync(dictionaryFd, `${dictionaryHeaders.map(csvCell).join(',')}\n`, null, 'utf8');
      dictionaryEntries.forEach((entry, index) => {
        const record: Record<string, unknown> = {
          entry_id: `dictionary-${index + 1}`,
          word: entry.word,
          type: entry.type,
          phonemic: entry.phonemic,
          gloss: entry.gloss,
          definitions: entry.definitions,
          translations: entry.translations,
          semantic_domain: entry.semantic_domain,
          source: entry.source,
          needs_review: entry.needs_review,
          examples: entry.examples,
          commentary: entry.commentary,
          verb_class: entry.verb_class,
          entry_json: entry,
        };
        fs.writeSync(dictionaryFd, `${dictionaryHeaders.map((header) => csvCell(record[header])).join(',')}\n`, null, 'utf8');
      });
    } finally {
      fs.closeSync(dictionaryFd);
    }

    const copyMap: Array<[string, string]> = [
      [path.join(canonicalExport, 'train.jsonl'), 'training/canonical-splits/train.jsonl'],
      [path.join(canonicalExport, 'dev.jsonl'), 'training/canonical-splits/dev.jsonl'],
      [path.join(canonicalExport, 'synthtest.jsonl'), 'training/canonical-splits/synthtest.jsonl'],
      [path.join(canonicalExport, 'MANIFEST.json'), 'training/canonical-splits/MANIFEST.json'],
      [path.join(governedV21, 'train.eng-gvn.jsonl'), 'training/v21.1-governed/train.eng-gvn.jsonl'],
      [path.join(governedV21, 'validation.eng-gvn.jsonl'), 'training/v21.1-governed/validation.eng-gvn.jsonl'],
      [path.join(governedV21, 'test.eng-gvn.jsonl'), 'training/v21.1-governed/test.eng-gvn.jsonl'],
      [path.join(governedV21, 'quarantine/source_or_surface_overlap.jsonl'), 'training/v21.1-governed/quarantine.jsonl'],
      [path.join(governedV21, 'v21_1_codex_synthetic_direct_manifest.json'), 'training/v21.1-governed/MANIFEST.json'],
      [path.join(governedV21, 'SHA256SUMS.v21.1'), 'training/v21.1-governed/SOURCE-SHA256SUMS'],
      [path.join(reportRoot, 'KUKU-YALANJI-CORPUS-OPERATOR-GUIDE.md'), 'documentation/operator-guide.md'],
      [path.join(reportRoot, 'SAMPLE-PRODUCTION-PAGES.md'), 'documentation/sample-production-pages.md'],
      [path.join(reportRoot, 'kuku-yalanji-mega-grammar-cheatsheet-2026-07-02.md'), 'documentation/grammar-cheatsheet.md'],
      [path.join(reportRoot, 'kuku-yalanji-dictionary-errata-2026-07-02.md'), 'documentation/dictionary-errata.md'],
      [path.join(completionAudits, 'KUKU-YALANJI-20000-COMPLETION-AUDIT-2026-07-10.md'), 'audits/completion-audit.md'],
      [path.join(completionAudits, 'audit-goal-20000-result.json'), 'audits/completion-audit-result.json'],
      [path.join(completionAudits, 'audit_goal_20000.py'), 'audits/audit-goal-20000.py'],
      [path.join(completionAudits, 'lexical-source-coverage-2026-07-10.md'), 'audits/lexical-source-coverage.md'],
      [path.join(corpusRoot, 'core-lexicon.yaml'), 'provenance/core-lexicon.yaml'],
      [path.join(corpusRoot, 'lint_corpus.py'), 'provenance/lint-corpus.py'],
      [path.join(corpusRoot, 'export_training.py'), 'provenance/export-training.py'],
    ];
    copyMap.forEach(([source, target]) => copyFile(source, path.join(releaseDir, target)));

    const processLogFiles = copyTree(
      path.join(corpusRoot, 'process_logs'),
      path.join(releaseDir, 'provenance/process-logs'),
      (relative) => relative.endsWith('.md'),
    );
    const batchScriptFiles = copyTree(
      path.join(corpusRoot, 'batch_scripts'),
      path.join(releaseDir, 'provenance/batch-scripts'),
      (relative) => relative.endsWith('.py'),
    );

    const canonicalSplitCounts = {
      train: countLines(path.join(canonicalExport, 'train.jsonl')),
      development: countLines(path.join(canonicalExport, 'dev.jsonl')),
      synthetic_test: countLines(path.join(canonicalExport, 'synthtest.jsonl')),
    };
    const governedSplitCounts = {
      train: countLines(path.join(governedV21, 'train.eng-gvn.jsonl')),
      validation: countLines(path.join(governedV21, 'validation.eng-gvn.jsonl')),
      test: countLines(path.join(governedV21, 'test.eng-gvn.jsonl')),
      quarantine: countLines(path.join(governedV21, 'quarantine/source_or_surface_overlap.jsonl')),
    };
    const canonicalSplitTotal = Object.values(canonicalSplitCounts).reduce((sum, count) => sum + count, 0);
    const governedSplitTotal = Object.values(governedSplitCounts).reduce((sum, count) => sum + count, 0);
    if (canonicalSplitTotal !== EXPECTED_SENTENCES || governedSplitTotal !== EXPECTED_SENTENCES) {
      throw new Error(`Split reconciliation failed: canonical=${canonicalSplitTotal}, governed=${governedSplitTotal}`);
    }

    const uniqueHeadwords = new Set(
      dictionaryEntries.map((entry) => String(entry.word ?? '').trim().toLocaleLowerCase()).filter(Boolean),
    ).size;
    const dictionaryExamples = dictionaryEntries.reduce(
      (sum, entry) => sum + (Array.isArray(entry.examples) ? entry.examples.length : 0),
      0,
    );
    const needsReview = dictionaryEntries.filter((entry) => Boolean(entry.needs_review)).length;
    const kukuWords = scalar(
      db,
      `SELECT SUM(CASE WHEN TRIM(kuku) = '' THEN 0
                       ELSE LENGTH(TRIM(kuku)) - LENGTH(REPLACE(TRIM(kuku), ' ', '')) + 1 END)
         FROM sentences`,
    );

    const readme = `# Kuku-Yalanji Synthetic Research Corpus v2

This is the complete public research release behind the Mob Translate Kuku-Yalanji corpus workbench. It contains
all ${sentenceCount.toLocaleString('en-AU')} synthetic English-Kuku-Yalanji sentence pairs and the process evidence
needed to inspect how they were produced, reviewed, revised, split, and used in the v21.1 model experiment.

## Status

- Language: Kuku-Yalanji (ISO 639-3: \`gvn\`; Glottocode: \`kuku1273\`; NLLB token: \`gvn_Latn\`).
- Release: \`${RELEASE_VERSION}\`, ${releasedAt}.
- Corpus status: project-reviewed synthetic research material pending fluent-speaker and elder verification.
- This is not a speaker-certified dictionary or translation corpus.
- A database status such as \`verified\` means verified against this project's documented source and review
  procedure. It does not mean verified by a Kuku-Yalanji speaker.

## Contents

- \`data/sentences.jsonl\` and \`data/sentences.csv\`: every sentence with analysis, frame, lexical inventory,
  evidence, review state, rights state, authorship, and timestamps.
- \`data/dictionary.yaml\`, \`dictionary.jsonl\`, and \`dictionary.csv\`: ${dictionaryEntries.length.toLocaleString('en-AU')}
  source-preserving dictionary entries. The YAML file is canonical; JSONL and CSV are convenience views.
- \`data/lexemes.*\`: ${tableCounts.lexemes.toLocaleString('en-AU')} scholarly working-lexeme records, including
  attestation, allomorphy, morphology, usage notes, watchlist, and retired-phantom state.
- \`data/synthetic.db\`: immutable SQLite snapshot containing all corpus and process tables.
- \`data/reviews.jsonl\`, \`revisions.jsonl\`, \`lessons.jsonl\`, \`process_events.jsonl\`, and related ledgers.
- \`training/canonical-splits/\`: the original deterministic 16,820/1,609/1,618 split.
- \`training/v21.1-governed/\`: the leakage-audited 16,642/1,609/1,606 split plus 190 quarantined rows.
- \`documentation/\`: the operator guide, production examples, grammar cheatsheet, and dictionary errata.
- \`audits/\`: the executable 20,000-sentence completion audit and its machine-readable result.
- \`provenance/\`: process logs, generation/closure scripts, core lexicon, linter, and export program.

## Recommended ML Input

Use \`training/v21.1-governed/train.eng-gvn.jsonl\` for the governed v21.1 treatment. Keep its validation, test,
and quarantine files separate. Do not train on \`data/sentences.jsonl\` and then report results on one of the
included held-out splits: that would invalidate the evaluation through leakage.

## Integrity

Run \`sha256sum -c SHA256SUMS\` from this directory. The release builder refuses to publish unless SQLite integrity,
foreign keys, the pinned dictionary hash, the ${EXPECTED_SENTENCES.toLocaleString('en-AU')}-row count, and the
canonical corpus-content digest all match the completion audit.

## Rights and cultural responsibility

Read \`DATA_USE.md\` before use. Public download is not a blanket relicensing of community language knowledge,
the underlying dictionary, or third-party grammatical descriptions. External elder-shared and Bible controls,
audio, and model weights are deliberately excluded from this package.
`;
    writeText(path.join(releaseDir, 'README.md'), readme);

    writeText(path.join(releaseDir, 'DATA_USE.md'), `# Data use and limitations

## Permitted research inspection

This release is published so researchers can inspect, reproduce, audit, and compare the Mob Translate synthetic
corpus program. The project status attached to the sentence rows is
\`project_approved_synthetic_pending_elder_verification\` (with historical variants preserved verbatim).

## No speaker-certification claim

The sentence pairs were synthetically authored and reviewed against project sources and formal checks. They have
not been comprehensively approved by fluent Kuku-Yalanji speakers or elders. They may contain errors in morphology,
lexical choice, idiomaticity, pragmatics, register, dialect, cultural appropriateness, or English correspondence.
Do not present them as community-endorsed speech, use them for high-stakes communication, or substitute them for
speaker consultation.

## Rights

No blanket public-domain, Creative Commons, or commercial license is asserted for the complete package. The
download does not relicense underlying community knowledge, dictionary material, grammatical descriptions, or
other third-party sources. Before redistribution, commercial use, or production deployment, conduct an independent
rights review and consult the relevant Kuku-Yalanji community and source rights holders.

## Deliberate exclusions

This package excludes elder-shared evaluation pairs, Bible evaluation controls, audio, personal account data, and
model weights. Those materials have separate provenance and rights conditions. The quarantine file is included
for auditability but must not be silently merged back into governed training splits.

## Corrections

Preserve record IDs and revision history. Corrections should supersede or append to the revision ledger rather than
silently overwriting the historical release.
`);

    writeText(path.join(releaseDir, 'SCHEMA.md'), `# Dataset schema

## Sentence record

The JSONL sentence record contains: \`id\`, \`batch\`, \`sequence\`, \`english\`, \`kuku_yalanji\`, \`analysis\`,
\`frame\`, \`tier\`, \`words_used[]\`, \`loans_used[]\`, \`evidence\`, \`status\`, \`confidence\`,
\`rights_status\`, \`author\`, \`created_at\`, and \`updated_at\`.

\`analysis\` preserves the project's morpheme segmentation/gloss string. It is an analytic claim, not an
independent gold annotation. \`evidence\` records the nearest project source anchor. \`words_used\` is a structured
inventory of dictionary or analyzed forms used in the row.

## Dictionary record

\`dictionary.jsonl\` adds a stable \`entry_id\` to each source YAML object without normalizing away duplicate
headwords, homophony, commentary, review flags, loanword records, derivation records, or source-specific fields.
\`entry_json\` in the CSV preserves the full source object.

## Lexeme record

The lexeme ledger contains project-level analyses and source tracking. \`senses\` and \`attestation\` are JSON
arrays. \`status=verified\` is project verification only; \`watchlist\` and \`phantom-retired\` must remain visible.

## Process tables

The full SQLite DDL is in \`data/schema.sql\`. JSONL exports retain the original snake_case database columns and
sort records by primary key.
`);

    writeText(path.join(releaseDir, 'CITATION.cff'), `cff-version: 1.2.0
message: "Please cite this dataset and state that it is synthetic and not speaker-certified."
title: "Kuku-Yalanji Synthetic Research Corpus v2"
type: dataset
version: "${RELEASE_VERSION}"
date-released: "2026-07-11"
authors:
  - name: "Mob Translate Research Program"
url: "https://mobtranslate.com/datasets/${RELEASE_ID}/"
repository-code: "https://github.com/australia/mobtranslate.com"
keywords:
  - Kuku-Yalanji
  - gvn
  - synthetic corpus
  - machine translation
  - low-resource language
`);

    const sourceInputs = {
      corpus_database: { path: corpusDb, sha256: sha256File(corpusDb) },
      dictionary_yaml: { path: dictionaryYaml, sha256: dictionaryDigest },
      canonical_split_manifest: {
        path: path.join(canonicalExport, 'MANIFEST.json'),
        sha256: sha256File(path.join(canonicalExport, 'MANIFEST.json')),
      },
      governed_v21_manifest: {
        path: path.join(governedV21, 'v21_1_codex_synthetic_direct_manifest.json'),
        sha256: sha256File(path.join(governedV21, 'v21_1_codex_synthetic_direct_manifest.json')),
      },
      completion_audit_result: {
        path: path.join(completionAudits, 'audit-goal-20000-result.json'),
        sha256: sha256File(path.join(completionAudits, 'audit-goal-20000-result.json')),
      },
    };

    const inventory = listFiles(releaseDir).map((relative) => {
      const file = path.join(releaseDir, relative);
      return {
        path: relative,
        bytes: fs.statSync(file).size,
        sha256: sha256File(file),
        media_type: mediaType(relative),
        role: fileRole(relative),
      };
    });
    const manifest = {
      schema_version: '1.0.0',
      dataset_id: RELEASE_ID,
      title: 'Kuku-Yalanji Synthetic Research Corpus v2',
      version: RELEASE_VERSION,
      released_at: releasedAt,
      status: 'research-only-pending-speaker-and-elder-verification',
      language: {
        name: 'Kuku-Yalanji',
        iso_639_3: 'gvn',
        bcp_47: 'gvn-Latn',
        glottocode: 'kuku1273',
        nllb_token: 'gvn_Latn',
        region: 'Far North Queensland, Australia',
      },
      counts: {
        ...tableCounts,
        kuku_words: kukuWords,
        dictionary_entries: dictionaryEntries.length,
        dictionary_unique_headwords: uniqueHeadwords,
        dictionary_examples: dictionaryExamples,
        dictionary_needs_review: needsReview,
        process_log_files: processLogFiles,
        batch_script_files: batchScriptFiles,
      },
      splits: {
        canonical: canonicalSplitCounts,
        governed_v21_1: governedSplitCounts,
      },
      integrity: {
        sqlite_integrity: integrity,
        foreign_key_violations: foreignKeyViolations,
        source_wal_bytes: sourceWalBytes,
        canonical_corpus_content_sha256: computedCorpusDigest,
        canonical_dictionary_sha256: dictionaryDigest,
        source_database_sha256: sha256File(corpusDb),
      },
      rights: {
        status: 'research-only; rights and community review required before redistribution or production use',
        sentence_project_status: 'project_approved_synthetic_pending_elder_verification',
        speaker_certified: false,
        elder_verified: false,
        blanket_reuse_license: null,
        data_use_file: 'DATA_USE.md',
      },
      exclusions: [
        'elder-shared external evaluation pairs',
        'Bible external evaluation controls',
        'audio and personal account data',
        'model weights and optimizer checkpoints',
        'copyrighted source books and papers',
      ],
      source_inputs: sourceInputs,
      files: inventory,
    };
    writeText(path.join(releaseDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));

    const checksumFiles = listFiles(releaseDir).filter((relative) => relative !== 'SHA256SUMS');
    writeText(
      path.join(releaseDir, 'SHA256SUMS'),
      checksumFiles.map((relative) => `${sha256File(path.join(releaseDir, relative))}  ${relative}`).join('\n'),
    );
  } finally {
    db.close();
  }

  setTreeMtime(releaseDir, sourceDateEpoch);
  fs.renameSync(releaseDir, finalReleaseDir);
  fs.rmSync(workRoot, { recursive: true, force: true });

  const temporaryTar = `${tarFile}.tmp`;
  run('tar', [
    '--sort=name',
    `--mtime=@${sourceDateEpoch}`,
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-czf',
    temporaryTar,
    '-C',
    outputRoot,
    RELEASE_ID,
  ]);
  fs.renameSync(temporaryTar, tarFile);

  const temporaryZip = path.join(outputRoot, `.${RELEASE_ID}.tmp.zip`);
  const zipInputs = listFiles(finalReleaseDir).map((relative) => `${RELEASE_ID}/${relative}`);
  run('zip', ['-X', '-q', temporaryZip, '-@'], { cwd: outputRoot, input: `${zipInputs.join('\n')}\n` });
  fs.renameSync(temporaryZip, zipFile);

  const directFiles = [
    { id: 'sentences-jsonl', label: 'All sentences (JSONL)', relative: 'data/sentences.jsonl', format: 'JSONL' },
    { id: 'sentences-csv', label: 'All sentences (CSV)', relative: 'data/sentences.csv', format: 'CSV' },
    { id: 'dictionary-jsonl', label: 'Dictionary (JSONL)', relative: 'data/dictionary.jsonl', format: 'JSONL' },
    { id: 'dictionary-csv', label: 'Dictionary (CSV)', relative: 'data/dictionary.csv', format: 'CSV' },
    { id: 'dictionary-yaml', label: 'Canonical dictionary (YAML)', relative: 'data/dictionary.yaml', format: 'YAML' },
    { id: 'sqlite', label: 'Complete SQLite snapshot', relative: 'data/synthetic.db', format: 'SQLite' },
  ].map((item) => {
    const file = path.join(finalReleaseDir, item.relative);
    return {
      ...item,
      href: `/datasets/${RELEASE_ID}/${item.relative}`,
      bytes: fs.statSync(file).size,
      sha256: sha256File(file),
    };
  });
  const publishedManifest = JSON.parse(
    fs.readFileSync(path.join(finalReleaseDir, 'MANIFEST.json'), 'utf8'),
  ) as { counts: Record<string, number> };
  const index = {
    schema_version: '1.0.0',
    current_release: RELEASE_ID,
    dataset: {
      dataset_id: RELEASE_ID,
      title: 'Kuku-Yalanji Synthetic Research Corpus v2',
      version: RELEASE_VERSION,
      released_at: releasedAt,
      status: 'research-only-pending-speaker-and-elder-verification',
      language: { name: 'Kuku-Yalanji', iso_639_3: 'gvn', bcp_47: 'gvn-Latn' },
      counts: {
        sentences: EXPECTED_SENTENCES,
        dictionary_entries: publishedManifest.counts.dictionary_entries,
        lexemes: publishedManifest.counts.lexemes,
        reviews: publishedManifest.counts.reviews,
        revisions: publishedManifest.counts.revisions,
        lessons: publishedManifest.counts.lessons,
        process_events: publishedManifest.counts.process_events,
      },
      archives: [
        {
          id: 'complete-zip',
          label: 'Complete dataset',
          format: 'ZIP',
          href: `/datasets/${RELEASE_ID}.zip`,
          bytes: fs.statSync(zipFile).size,
          sha256: sha256File(zipFile),
          recommended: true,
        },
        {
          id: 'complete-tar-gz',
          label: 'Complete dataset',
          format: 'TAR.GZ',
          href: `/datasets/${RELEASE_ID}.tar.gz`,
          bytes: fs.statSync(tarFile).size,
          sha256: sha256File(tarFile),
          recommended: false,
        },
      ],
      direct_files: directFiles,
      manifest_href: `/datasets/${RELEASE_ID}/MANIFEST.json`,
      checksums_href: `/datasets/${RELEASE_ID}/SHA256SUMS`,
      readme_href: `/datasets/${RELEASE_ID}/README.md`,
      data_use_href: `/datasets/${RELEASE_ID}/DATA_USE.md`,
    },
  };
  const indexFile = path.join(outputRoot, 'index.json');
  const currentFile = path.join(outputRoot, 'CURRENT');
  writeText(indexFile, JSON.stringify(index, null, 2));
  writeText(currentFile, RELEASE_ID);
  const releaseTimestamp = new Date(sourceDateEpoch * 1000);
  [zipFile, tarFile, indexFile, currentFile].forEach((file) => {
    fs.utimesSync(file, releaseTimestamp, releaseTimestamp);
  });

  process.stdout.write(`${JSON.stringify(index, null, 2)}\n`);
}

main();
