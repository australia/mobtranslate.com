import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { load as loadYaml } from 'js-yaml';
import type {
  CompletionCheck,
  CountOption,
  DatasetData,
  DictionaryData,
  DictionaryEntry,
  LexemeData,
  LexemeRow,
  ModelCurvePoint,
  ModelData,
  ModelEvaluation,
  OverviewData,
  Pagination,
  SentenceData,
  SentenceRow,
} from './kuku-yalanji-research-types';

const PROGRAM_ROOT = process.env.MOBTRANSLATE_KUKU_RESEARCH_ROOT
  ?? '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30';
const REPO_ROOT = process.env.MOBTRANSLATE_REPO_ROOT
  ?? path.resolve(process.cwd(), '../..');
const CORPUS_DB = path.join(
  PROGRAM_ROOT,
  'synthetic/claude-synthetic-v1-2026-07-02/synthetic.db',
);
const DATASET_INDEX = path.join(PROGRAM_ROOT, 'public-datasets/index.json');
const DICTIONARY_FILE = path.join(REPO_ROOT, 'dictionaries/kuku_yalanji/dictionary.yaml');
const RUN_ROOT = path.join(
  PROGRAM_ROOT,
  'runpod/v21.1-codex-synthetic-direct-20260710T171317Z',
);
const MODEL_ID = 'v21.1-codex-synthetic-direct-gvn-3epoch-lr2e-5';
const MODEL_ROOT = path.join(RUN_ROOT, 'models', MODEL_ID);

type SqlValue = string | number | bigint | null;
type SqlRow = Record<string, SqlValue>;

type RawDictionaryEntry = {
  word?: unknown;
  type?: unknown;
  phonemic?: unknown;
  gloss?: unknown;
  definitions?: unknown;
  translations?: unknown;
  semantic_domain?: unknown;
  source?: unknown;
  needs_review?: unknown;
  examples?: unknown;
  commentary?: unknown;
  verb_class?: unknown;
};

type RawDictionary = {
  meta?: { name?: unknown };
  words?: RawDictionaryEntry[];
};

let dictionaryCache: { mtimeMs: number; entries: DictionaryEntry[] } | null = null;

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(asString).filter((item): item is string => item !== null);
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item),
  );
}

function parseJsonArray(value: SqlValue): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    return asStringArray(JSON.parse(value));
  } catch {
    return [];
  }
}

function parseRecordArray(value: SqlValue): Array<Record<string, unknown>> {
  if (typeof value !== 'string' || !value) return [];
  try {
    return asRecordArray(JSON.parse(value));
  } catch {
    return [];
  }
}

function numberValue(value: SqlValue | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}

function textValue(value: SqlValue | undefined): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function nullableText(value: SqlValue | undefined): string | null {
  return value === null || value === undefined || value === '' ? null : String(value);
}

function openCorpus(): DatabaseSync {
  if (!fs.existsSync(CORPUS_DB)) {
    throw new Error('Kuku Yalanji corpus database is not mounted');
  }
  const db = new DatabaseSync(CORPUS_DB, { readOnly: true });
  db.exec('PRAGMA query_only = ON');
  return db;
}

function loadJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function loadDictionary(): DictionaryEntry[] {
  const stat = fs.statSync(DICTIONARY_FILE);
  if (dictionaryCache?.mtimeMs === stat.mtimeMs) return dictionaryCache.entries;

  const raw = loadYaml(fs.readFileSync(DICTIONARY_FILE, 'utf8')) as RawDictionary;
  const entries = (raw.words ?? []).map((entry, index): DictionaryEntry => {
    const examples = asRecordArray(entry.examples).map((example) => ({
      kukuYalanji: asString(example.kuku_yalanji) ?? '',
      english: asString(example.english) ?? '',
    })).filter((example) => example.kukuYalanji || example.english);

    return {
      id: `dictionary-${index + 1}`,
      word: asString(entry.word) ?? '(missing headword)',
      type: asString(entry.type),
      phonemic: asString(entry.phonemic),
      gloss: asString(entry.gloss),
      definitions: asStringArray(entry.definitions),
      translations: asStringArray(entry.translations),
      semanticDomain: asString(entry.semantic_domain),
      source: asString(entry.source) ?? 'community dictionary',
      needsReview: asString(entry.needs_review),
      examples,
      commentary: asStringArray(entry.commentary),
      verbClass: asString(entry.verb_class),
    };
  });

  dictionaryCache = { mtimeMs: stat.mtimeMs, entries };
  return entries;
}

function cleanSearch(value: string | null): string {
  return (value ?? '').trim().slice(0, 160);
}

function positiveInt(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function pagination(page: number, limit: number, total: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const boundedPage = Math.min(page, totalPages);
  return {
    page: boundedPage,
    limit,
    total,
    totalPages,
    hasNext: boundedPage < totalPages,
    hasPrev: boundedPage > 1,
  };
}

function optionRows(rows: SqlRow[], valueKey: string, labelKey = valueKey): CountOption[] {
  return rows.map((row) => ({
    value: textValue(row[valueKey]),
    label: textValue(row[labelKey]),
    count: numberValue(row.count),
  }));
}

function countOptions(values: string[]): CountOption[] {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: value, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function getDictionaryData(searchParams: URLSearchParams): DictionaryData {
  const entries = loadDictionary();
  const q = cleanSearch(searchParams.get('q')).toLocaleLowerCase();
  const type = cleanSearch(searchParams.get('type'));
  const source = cleanSearch(searchParams.get('source'));
  const domain = cleanSearch(searchParams.get('domain'));
  const review = searchParams.get('review') === 'yes';
  const page = positiveInt(searchParams.get('page'), 1, 100_000);
  const limit = positiveInt(searchParams.get('limit'), 24, 100);

  const filtered = entries.filter((entry) => {
    if (type && entry.type !== type) return false;
    if (source && entry.source !== source) return false;
    if (domain && entry.semanticDomain !== domain) return false;
    if (review && !entry.needsReview) return false;
    if (!q) return true;
    const haystack = [
      entry.word,
      entry.phonemic,
      entry.gloss,
      entry.semanticDomain,
      ...entry.definitions,
      ...entry.translations,
      ...entry.commentary,
    ].filter(Boolean).join('\n').toLocaleLowerCase();
    return haystack.includes(q);
  }).sort((a, b) => a.word.localeCompare(b.word, 'en', { sensitivity: 'base' }));

  const pageData = pagination(page, limit, filtered.length);
  const start = (pageData.page - 1) * limit;

  return {
    entries: filtered.slice(start, start + limit),
    pagination: pageData,
    filters: {
      types: countOptions(entries.map((entry) => entry.type ?? 'unclassified')),
      sources: countOptions(entries.map((entry) => entry.source)),
      domains: countOptions(entries.map((entry) => entry.semanticDomain ?? 'unclassified')).slice(0, 120),
      needsReview: entries.filter((entry) => entry.needsReview).length,
    },
  };
}

export function getSentenceData(searchParams: URLSearchParams): SentenceData {
  const db = openCorpus();
  try {
    const q = cleanSearch(searchParams.get('q'));
    const status = cleanSearch(searchParams.get('status'));
    const frame = cleanSearch(searchParams.get('frame'));
    const tier = positiveInt(searchParams.get('tier'), 0, 20);
    const page = positiveInt(searchParams.get('page'), 1, 100_000);
    const limit = positiveInt(searchParams.get('limit'), 25, 100);
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (q) {
      conditions.push('(s.english LIKE ? OR s.kuku LIKE ? OR s.analysis LIKE ? OR s.evidence LIKE ?)');
      const pattern = `%${q}%`;
      values.push(pattern, pattern, pattern, pattern);
    }
    if (status) {
      conditions.push('s.status = ?');
      values.push(status);
    }
    if (frame) {
      conditions.push('s.frame = ?');
      values.push(frame);
    }
    if (tier > 0) {
      conditions.push('s.tier = ?');
      values.push(tier);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM sentences s ${where}`).get(...values) as SqlRow;
    const total = numberValue(totalRow.total);
    const pageData = pagination(page, limit, total);
    const offset = (pageData.page - 1) * limit;
    const rows = db.prepare(
      `SELECT s.id, b.label AS batch, s.seq, s.english, s.kuku, s.analysis, s.frame,
              s.tier, s.words_used, s.loans_used, s.evidence, s.status, s.confidence,
              s.rights_status, s.created_at, s.updated_at
       FROM sentences s
       JOIN batches b ON b.id = s.batch_id
       ${where}
       ORDER BY s.id ${order}
       LIMIT ? OFFSET ?`,
    ).all(...values, limit, offset) as SqlRow[];

    const statuses = db.prepare(
      'SELECT status, COUNT(*) AS count FROM sentences GROUP BY status ORDER BY count DESC, status',
    ).all() as SqlRow[];
    const tiers = db.prepare(
      'SELECT CAST(tier AS TEXT) AS tier, COUNT(*) AS count FROM sentences WHERE tier IS NOT NULL GROUP BY tier ORDER BY tier',
    ).all() as SqlRow[];
    const frames = db.prepare(
      'SELECT frame, COUNT(*) AS count FROM sentences GROUP BY frame ORDER BY count DESC, frame LIMIT 160',
    ).all() as SqlRow[];

    return {
      rows: rows.map((row): SentenceRow => ({
        id: numberValue(row.id),
        batch: textValue(row.batch),
        sequence: numberValue(row.seq),
        english: textValue(row.english),
        kuku: textValue(row.kuku),
        analysis: textValue(row.analysis),
        frame: textValue(row.frame),
        tier: row.tier === null ? null : numberValue(row.tier),
        wordsUsed: parseJsonArray(row.words_used),
        loansUsed: parseJsonArray(row.loans_used),
        evidence: nullableText(row.evidence),
        status: textValue(row.status),
        confidence: nullableText(row.confidence),
        rightsStatus: textValue(row.rights_status),
        createdAt: textValue(row.created_at),
        updatedAt: nullableText(row.updated_at),
      })),
      pagination: pageData,
      filters: {
        statuses: optionRows(statuses, 'status'),
        tiers: optionRows(tiers, 'tier'),
        frames: optionRows(frames, 'frame'),
      },
    };
  } finally {
    db.close();
  }
}

export function getLexemeData(searchParams: URLSearchParams): LexemeData {
  const db = openCorpus();
  try {
    const q = cleanSearch(searchParams.get('q'));
    const status = cleanSearch(searchParams.get('status'));
    const pos = cleanSearch(searchParams.get('pos'));
    const page = positiveInt(searchParams.get('page'), 1, 100_000);
    const limit = positiveInt(searchParams.get('limit'), 30, 100);
    const conditions: string[] = [];
    const values: string[] = [];
    if (q) {
      conditions.push('(headword LIKE ? OR gloss LIKE ? OR usage_notes LIKE ? OR morphology LIKE ?)');
      const pattern = `%${q}%`;
      values.push(pattern, pattern, pattern, pattern);
    }
    if (status) {
      conditions.push('status = ?');
      values.push(status);
    }
    if (pos) {
      conditions.push('pos = ?');
      values.push(pos);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM lexemes ${where}`).get(...values) as SqlRow;
    const total = numberValue(totalRow.total);
    const pageData = pagination(page, limit, total);
    const offset = (pageData.page - 1) * limit;
    const rows = db.prepare(
      `SELECT id, headword, phonemic, pos, gloss, status, corpus_freq, senses, attestation,
              allomorphy, morphology, collocations, usage_notes, antonyms_contrasts,
              verified_at, notes
       FROM lexemes
       ${where}
       ORDER BY corpus_freq DESC, headword COLLATE NOCASE
       LIMIT ? OFFSET ?`,
    ).all(...values, limit, offset) as SqlRow[];
    const statuses = db.prepare(
      'SELECT status, COUNT(*) AS count FROM lexemes GROUP BY status ORDER BY count DESC, status',
    ).all() as SqlRow[];
    const partsOfSpeech = db.prepare(
      'SELECT pos, COUNT(*) AS count FROM lexemes GROUP BY pos ORDER BY count DESC, pos',
    ).all() as SqlRow[];

    return {
      rows: rows.map((row): LexemeRow => ({
        id: numberValue(row.id),
        headword: textValue(row.headword),
        phonemic: nullableText(row.phonemic),
        pos: textValue(row.pos),
        gloss: textValue(row.gloss),
        status: textValue(row.status),
        corpusFrequency: numberValue(row.corpus_freq),
        senses: parseRecordArray(row.senses),
        attestation: parseRecordArray(row.attestation),
        allomorphy: nullableText(row.allomorphy),
        morphology: nullableText(row.morphology),
        collocations: nullableText(row.collocations),
        usageNotes: nullableText(row.usage_notes),
        contrasts: nullableText(row.antonyms_contrasts),
        verifiedAt: nullableText(row.verified_at),
        notes: nullableText(row.notes),
      })),
      pagination: pageData,
      filters: {
        statuses: optionRows(statuses, 'status'),
        partsOfSpeech: optionRows(partsOfSpeech, 'pos'),
      },
    };
  } finally {
    db.close();
  }
}

function distribution(db: DatabaseSync, sql: string, labelKey: string): Array<{ label: string; count: number }> {
  return (db.prepare(sql).all() as SqlRow[]).map((row) => ({
    label: textValue(row[labelKey]),
    count: numberValue(row.count),
  }));
}

export function getOverviewData(): OverviewData {
  const dictionary = loadDictionary();
  const db = openCorpus();
  try {
    const sentence = db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
              SUM(CASE WHEN status = 'revised' THEN 1 ELSE 0 END) AS revised,
              SUM(CASE WHEN status IN ('accepted', 'revised') THEN 0 ELSE 1 END) AS open,
              SUM(CASE WHEN TRIM(kuku) = '' THEN 0
                       ELSE LENGTH(TRIM(kuku)) - LENGTH(REPLACE(TRIM(kuku), ' ', '')) + 1 END) AS kuku_words,
              MAX(COALESCE(updated_at, created_at)) AS latest_at
       FROM sentences`,
    ).get() as SqlRow;
    const counts = db.prepare(
      `SELECT
        (SELECT COUNT(*) FROM batches) AS batches,
        (SELECT COUNT(*) FROM reviews) AS reviews,
        (SELECT COUNT(*) FROM revisions) AS revisions,
        (SELECT COUNT(*) FROM lessons) AS lessons,
        (SELECT COUNT(*) FROM lexemes) AS lexemes,
        (SELECT COUNT(*) FROM process_events) AS process_events`,
    ).get() as SqlRow;
    const rights = db.prepare(
      'SELECT rights_status, COUNT(*) AS count FROM sentences GROUP BY rights_status ORDER BY count DESC LIMIT 1',
    ).get() as SqlRow;
    const uniqueHeadwords = new Set(dictionary.map((entry) => entry.word.trim().toLocaleLowerCase())).size;
    const dictionaryExamples = dictionary.reduce((sum, entry) => sum + entry.examples.length, 0);

    const checks: CompletionCheck[] = [
      { label: 'Whole-corpus lint', status: 'pass', detail: '20,047 passed; 0 failed.' },
      { label: 'Split leakage audit', status: 'pass', detail: '0 source, target-surface, or pair intersections after quarantine.' },
      { label: 'Duplicate audit', status: 'pass', detail: '0 normalized Kuku duplicates and 0 normalized English-Kuku pair duplicates.' },
      { label: 'Database integrity', status: 'pass', detail: 'SQLite integrity and foreign-key checks passed at closure.' },
      { label: 'Model archive', status: 'pass', detail: '192/192 model files matched the RunPod SHA-256 inventory.' },
      { label: 'Speaker review', status: 'qualified', detail: 'Project-reviewed synthetic data; elder verification is still pending.' },
    ];

    return {
      language: { name: 'Kuku Yalanji', code: 'gvn', region: 'Far North Queensland' },
      counts: {
        sentences: numberValue(sentence.total),
        accepted: numberValue(sentence.accepted),
        revised: numberValue(sentence.revised),
        open: numberValue(sentence.open),
        kukuWords: numberValue(sentence.kuku_words),
        batches: numberValue(counts.batches),
        reviews: numberValue(counts.reviews),
        revisions: numberValue(counts.revisions),
        lessons: numberValue(counts.lessons),
        lexemes: numberValue(counts.lexemes),
        processEvents: numberValue(counts.process_events),
        dictionaryEntries: dictionary.length,
        uniqueHeadwords,
        dictionaryExamples,
      },
      rightsStatus: textValue(rights.rights_status),
      generatedAt: new Date().toISOString(),
      latestSentenceAt: nullableText(sentence.latest_at),
      distributions: {
        sentenceStatus: distribution(db, 'SELECT status, COUNT(*) AS count FROM sentences GROUP BY status ORDER BY count DESC', 'status'),
        tiers: distribution(db, "SELECT COALESCE(CAST(tier AS TEXT), 'unrated') AS tier, COUNT(*) AS count FROM sentences GROUP BY tier ORDER BY tier", 'tier'),
        frames: distribution(db, 'SELECT frame, COUNT(*) AS count FROM sentences GROUP BY frame ORDER BY count DESC, frame LIMIT 24', 'frame'),
        lexemeStatus: distribution(db, 'SELECT status, COUNT(*) AS count FROM lexemes GROUP BY status ORDER BY count DESC', 'status'),
        partsOfSpeech: distribution(db, 'SELECT pos, COUNT(*) AS count FROM lexemes GROUP BY pos ORDER BY count DESC, pos LIMIT 20', 'pos'),
      },
      checks,
    };
  } finally {
    db.close();
  }
}

export function getDatasetData(): DatasetData {
  const index = loadJson<{ dataset: DatasetData }>(DATASET_INDEX);
  return index.dataset;
}

type AnalysisFile = {
  aggregate: {
    rows: number;
    bleu: number;
    chrf: number;
    exact: number;
    empty: number;
    length_ratio?: { mean?: number | null };
  };
};

type TrainerState = {
  log_history: Array<{
    step?: number;
    epoch?: number;
    eval_loss?: number;
    eval_bleu?: number;
    eval_chrf?: number;
  }>;
};

export function getModelData(): ModelData {
  const evaluationSpecs: Array<{
    id: string;
    label: string;
    category: 'synthetic' | 'external';
  }> = [
    { id: 'eval_train_sample_1024', label: 'Train sample', category: 'synthetic' },
    { id: 'eval_synthetic_dev_1609', label: 'Synthetic development', category: 'synthetic' },
    { id: 'eval_synthetic_test_tagged_1606', label: 'Synthetic test, tagged', category: 'synthetic' },
    { id: 'eval_synthetic_test_untagged_1606', label: 'Synthetic test, untagged', category: 'synthetic' },
    { id: 'eval_elder_sentence_pair_43', label: 'Elder-shared pairs', category: 'external' },
    { id: 'eval_db_usage_heldout_84', label: 'Dictionary usage', category: 'external' },
    { id: 'eval_bible_direct_heldout_325', label: 'Bible direct', category: 'external' },
    { id: 'eval_bible_ref_heldout_325', label: 'Bible reference', category: 'external' },
  ];
  const evaluations: ModelEvaluation[] = evaluationSpecs.map((spec) => {
    const analysis = loadJson<AnalysisFile>(path.join(MODEL_ROOT, `${spec.id}_analysis.json`));
    const aggregate = analysis.aggregate;
    return {
      ...spec,
      rows: aggregate.rows,
      bleu: aggregate.bleu,
      chrf: aggregate.chrf,
      exact: aggregate.exact,
      empty: aggregate.empty,
      meanLengthRatio: aggregate.length_ratio?.mean ?? null,
    };
  });

  const trainerState = loadJson<TrainerState>(path.join(MODEL_ROOT, 'checkpoint-3120/trainer_state.json'));
  const curve: ModelCurvePoint[] = trainerState.log_history
    .filter((row) => row.eval_chrf !== undefined)
    .map((row) => ({
      step: row.step ?? 0,
      epoch: row.epoch ?? 0,
      loss: row.eval_loss ?? 0,
      bleu: row.eval_bleu ?? 0,
      chrf: row.eval_chrf ?? 0,
    }));

  const resource = loadJson<{
    max_gpu_util_pct: number;
    max_gpu_mem_used_mib: number;
    max_python_rss_mib: number;
  }>(path.join(MODEL_ROOT, 'resource_summary.json'));
  const runContract = loadJson<{
    train_rows: number;
    validation_rows: number;
    test_rows: number;
    max_source_length: number;
    max_target_length: number;
    seed: number;
    rights: string;
  }>(path.join(MODEL_ROOT, 'run_contract.json'));
  const archive = loadJson<{
    status: string;
    checksum_records: number;
    directory_stats: Record<string, { bytes: number; files: number }>;
    gate_results: { v1_exact: number; v1_chrf: number; v2_exact: number; v2_chrf: number };
    smoke_equivalence: { status: string };
  }>(path.join(RUN_ROOT, 'reports/v21.1-archive-audit.json'));
  const postDelete = loadJson<{
    active_pod_count: number;
    account: { clientBalance: number };
  }>(path.join(RUN_ROOT, 'runpod/post-delete-account-pod-state.json'));
  const provisioning = loadJson<{ events: Array<{ balance_usd?: number }> }>(
    path.join(RUN_ROOT, 'runpod/provisioning-events.json'),
  );
  const startBalance = provisioning.events.find((event) => typeof event.balance_usd === 'number')?.balance_usd
    ?? postDelete.account.clientBalance;
  return {
    productLabel: 'Kuku Yalanji translation model v2 candidate',
    experimentId: MODEL_ID,
    status: 'research-only',
    promotionEligible: false,
    verdict: 'Strong synthetic-domain learning with severe external-domain loss. Keep retrieval-first routing and require the independent balanced-replay comparison plus speaker review before promotion.',
    rightsStatus: runContract.rights,
    treatment: {
      train: runContract.train_rows,
      validation: runContract.validation_rows,
      test: runContract.test_rows,
      quarantine: 190,
      epochs: 3,
      learningRate: 0.00002,
      effectiveBatch: 16,
      sourceTokenCap: runContract.max_source_length,
      targetTokenCap: runContract.max_target_length,
      seed: runContract.seed,
      baseModel: 'v12.0 merged NLLB distilled 600M',
    },
    gates: [
      { id: 'gate-v1', label: '30-epoch gate', status: 'fail', epochs: 30, exact: archive.gate_results.v1_exact, rows: 128, chrf: archive.gate_results.v1_chrf, empty: 0 },
      { id: 'gate-v2', label: '100-epoch gate', status: 'pass', epochs: 100, exact: archive.gate_results.v2_exact, rows: 128, chrf: archive.gate_results.v2_chrf, empty: 0 },
    ],
    curve,
    evaluations,
    resources: {
      gpu: 'NVIDIA RTX 4090 24 GB',
      runtimeSeconds: 1170.1797,
      maxGpuUtilization: resource.max_gpu_util_pct,
      maxGpuMemoryMiB: resource.max_gpu_mem_used_mib,
      maxPythonRssMiB: resource.max_python_rss_mib,
      grossAccountDeltaUsd: Math.max(0, startBalance - postDelete.account.clientBalance),
    },
    archive: {
      status: archive.status,
      files: archive.checksum_records,
      bytes: Object.values(archive.directory_stats).reduce((sum, item) => sum + item.bytes, 0),
      mergedModelSha256: '9cc55520f541bf3f93db0126f733aafd91966b225e4406a2e4115c444dfb9a90',
      adapterSha256: '0d90b2790beb5c3a32f093e178a762164757aaf9d5e409a8bbb71409a45a735d',
      localRemoteSmokeEquivalent: archive.smoke_equivalence.status === 'PASS',
      activePodsAfterDelete: postDelete.active_pod_count,
    },
    nextExperiment: {
      id: 'v21.2-balanced-replay',
      owner: 'Claude',
      purpose: 'Measure whether balanced replay can retain elder, dictionary-usage, and Bible behavior while learning the 20k synthetic treatment.',
    },
    links: [
      { label: 'Operator guide', href: '/docs/operator-guide.html' },
      { label: 'Model registry', href: '/models' },
      { label: 'Translation lab', href: '/translate/v2' },
    ],
  };
}
