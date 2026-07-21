import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  auditSplitLeakage,
  bilingualComparisonKey,
  buildLeakageGroups,
  canonicalDatasetText,
  exactBilingualKey,
  leakageComparisonText,
  sha256,
  stableDatasetSplit,
  type DatasetSplit,
  type LeakageAuditRow,
  type LeakageNode,
} from './lib/migmaq-translation-dataset';

const RELEASE_ID = 'migmaq-online-example-parallel-v1.0.0-20260712';
const RELEASED_AT = '2026-07-12T09:00:00Z';
const EXPECTED_ENTRY_COUNT = 6_974;
const EXPECTED_SOURCE_SHA256 = '1859ce4541130c6604550210f511aad378171ed2d79868e1f64e3cf3b5a57dfc';
const SPLIT_NAMESPACE = 'migmaq-online-example-parallel-v1.0.0';
const SOURCE_ROOT = '/mnt/donto-data/donto-resources/research/migmaq-online-talking-dictionary-2026-07-12';
const DEFAULT_PROGRAM_ROOT = '/mnt/donto-data/donto-resources/research/translation-training/migmaq-runpod-2026-07-12';

const RecordingSchema = z.object({
  externalRecordingId: z.string().min(1),
  kind: z.enum(['word', 'sentence']),
  speakerCode: z.string(),
  sourceAudioUrl: z.string().url(),
  sourceEntryUrl: z.string().url(),
  sourceHeadword: z.string(),
  exampleIndex: z.number().int().nonnegative().nullable(),
  audioFileName: z.string(),
  archiveRelativePath: z.string(),
}).passthrough();

const ExampleSchema = z.object({
  text: z.string().nullable().transform((value) => value ?? ''),
  translation: z.string().nullable().transform((value) => value ?? ''),
  recordings: z.array(RecordingSchema),
}).passthrough();

const EntrySchema = z.object({
  externalEntryId: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceHeadword: z.string(),
  normalizedHeadword: z.string(),
  translation: z.string().nullable().transform((value) => value ?? ''),
  partOfSpeech: z.string().nullable().transform((value) => value ?? ''),
  meanings: z.array(z.string()),
  examples: z.array(ExampleSchema),
  rawHtmlPath: z.string(),
  rawHtmlSha256: z.string().regex(/^[a-f0-9]{64}$/),
  fetchedAt: z.string(),
}).passthrough();

type Entry = z.infer<typeof EntrySchema>;
type Recording = z.infer<typeof RecordingSchema>;

type SourceRecord = {
  entry_id: string;
  entry_url: string;
  headword: string;
  example_index: number;
  raw_html_path: string;
  raw_html_sha256: string;
  fetched_at: string;
  recordings: Array<{
    recording_id: string;
    speaker_code: string;
    source_audio_url: string;
    archive_relative_path: string;
  }>;
};

type SentencePair = {
  id: string;
  split: DatasetSplit;
  leakage_group: string;
  migmaq_text: string;
  english_text: string;
  source_records: SourceRecord[];
};

type TrainingRow = {
  id: string;
  dataset_id: string;
  split: DatasetSplit;
  direction: 'eng-mic' | 'mic-eng';
  tier: 'source_attested_dictionary_example';
  input_text: string;
  output_text: string;
  source_lang: 'eng_Latn' | 'mic_Latn';
  target_lang: 'mic_Latn' | 'eng_Latn';
  translation: Record<string, string>;
  canonical_ref: string;
  pair_kind: 'dictionary_example_sentence';
  leakage_group: string;
  rights_status: 'noncommercial_cc_by_nc_4_0';
  approved_for_training: true;
  orthography_scope: 'source_contemporary_listuguj';
  source_records: SourceRecord[];
};

type StructuralRejection = {
  entry_id: string;
  example_index: number;
  reason: 'empty_migmaq_text' | 'empty_english_text';
  source_url: string;
};

function argValue(name: string, fallback: string): string {
  const flag = `--${name}`;
  const direct = process.argv.indexOf(flag);
  if (direct >= 0 && process.argv[direct + 1]) return process.argv[direct + 1];
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
}

function ensureDirectory(directory: string): void {
  fs.mkdirSync(directory, { recursive: true });
}

function writeText(file: string, value: string): void {
  ensureDirectory(path.dirname(file));
  fs.writeFileSync(file, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
}

function writeJson(file: string, value: unknown): void {
  writeText(file, JSON.stringify(value, null, 2));
}

function writeJsonl(file: string, rows: unknown[]): void {
  writeText(file, rows.map((row) => JSON.stringify(row)).join('\n'));
}

function sha256File(file: string): string {
  const digest = createHash('sha256');
  const handle = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(handle);
  }
  return digest.digest('hex');
}

function readEntries(file: string): Entry[] {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const entries: Entry[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(lines[index]);
    } catch (error) {
      throw new Error(`Invalid JSON at ${file}:${index + 1}: ${String(error)}`);
    }
    const parsed = EntrySchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`Schema failure at ${file}:${index + 1}: ${z.prettifyError(parsed.error)}`);
    }
    entries.push(parsed.data);
  }
  return entries;
}

function recordingProvenance(recording: Recording): SourceRecord['recordings'][number] {
  return {
    recording_id: recording.externalRecordingId,
    speaker_code: recording.speakerCode,
    source_audio_url: recording.sourceAudioUrl,
    archive_relative_path: recording.archiveRelativePath,
  };
}

function sourceRecord(entry: Entry, exampleIndex: number): SourceRecord {
  const example = entry.examples[exampleIndex];
  return {
    entry_id: entry.externalEntryId,
    entry_url: entry.sourceUrl,
    headword: entry.sourceHeadword,
    example_index: exampleIndex,
    raw_html_path: entry.rawHtmlPath,
    raw_html_sha256: entry.rawHtmlSha256,
    fetched_at: entry.fetchedAt,
    recordings: example.recordings
      .map(recordingProvenance)
      .sort((a, b) => a.recording_id.localeCompare(b.recording_id)),
  };
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

function setTreeMtime(root: string, timestamp: Date): void {
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
  for (const directory of directories.reverse()) fs.utimesSync(directory, timestamp, timestamp);
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? 'unknown'}`);
}

function quantiles(values: number[]): Record<string, number> {
  if (values.length === 0) return {};
  const sorted = [...values].sort((a, b) => a - b);
  const at = (ratio: number): number => sorted[Math.min(sorted.length - 1, Math.floor(ratio * (sorted.length - 1)))];
  return {
    min: sorted[0],
    p05: at(0.05),
    p25: at(0.25),
    median: at(0.5),
    p75: at(0.75),
    p95: at(0.95),
    max: sorted[sorted.length - 1],
  };
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const result = {} as Record<T, number>;
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function qualityFlags(pair: SentencePair): string[] {
  const flags: string[] = [];
  if (leakageComparisonText(pair.migmaq_text) === leakageComparisonText(pair.english_text)) flags.push('identical_cross_language_text');
  if (/\uFFFD/u.test(pair.migmaq_text) || /\uFFFD/u.test(pair.english_text)) flags.push('unicode_replacement_character');
  if (/\p{Cc}/u.test(pair.migmaq_text) || /\p{Cc}/u.test(pair.english_text)) flags.push('control_character');
  if (/<[^>]+>/u.test(pair.migmaq_text) || /<[^>]+>/u.test(pair.english_text)) flags.push('markup_like_text');
  if (/https?:\/\//iu.test(pair.migmaq_text) || /https?:\/\//iu.test(pair.english_text)) flags.push('url_like_text');
  const ratio = pair.migmaq_text.length / Math.max(pair.english_text.length, 1);
  if (ratio < 0.2 || ratio > 5) flags.push('extreme_character_length_ratio');
  return flags;
}

function trainingRow(pair: SentencePair, direction: TrainingRow['direction']): TrainingRow {
  const englishToMigmaq = direction === 'eng-mic';
  return {
    id: `${pair.id}:${direction}`,
    dataset_id: RELEASE_ID,
    split: pair.split,
    direction,
    tier: 'source_attested_dictionary_example',
    input_text: englishToMigmaq ? pair.english_text : pair.migmaq_text,
    output_text: englishToMigmaq ? pair.migmaq_text : pair.english_text,
    source_lang: englishToMigmaq ? 'eng_Latn' : 'mic_Latn',
    target_lang: englishToMigmaq ? 'mic_Latn' : 'eng_Latn',
    translation: { eng_Latn: pair.english_text, mic_Latn: pair.migmaq_text },
    canonical_ref: `${pair.source_records[0].entry_id}#example-${pair.source_records[0].example_index}`,
    pair_kind: 'dictionary_example_sentence',
    leakage_group: pair.leakage_group,
    rights_status: 'noncommercial_cc_by_nc_4_0',
    approved_for_training: true,
    orthography_scope: 'source_contemporary_listuguj',
    source_records: pair.source_records,
  };
}

function main(): void {
  const programRoot = path.resolve(argValue('program-root', DEFAULT_PROGRAM_ROOT));
  const outputRoot = path.resolve(argValue('output-root', path.join(programRoot, 'datasets')));
  const sourceFile = path.join(SOURCE_ROOT, 'manifests/entries.jsonl');
  const finalDirectory = path.join(outputRoot, RELEASE_ID);
  const tarFile = path.join(outputRoot, `${RELEASE_ID}.tar`);
  const archiveFile = `${tarFile}.gz`;
  const archiveHashFile = `${archiveFile}.sha256`;
  for (const target of [finalDirectory, tarFile, archiveFile, archiveHashFile]) {
    if (fs.existsSync(target)) throw new Error(`Refusing to overwrite versioned artifact: ${target}`);
  }

  const sourceSha256 = sha256File(sourceFile);
  if (sourceSha256 !== EXPECTED_SOURCE_SHA256) {
    throw new Error(`Source snapshot digest changed: expected ${EXPECTED_SOURCE_SHA256}, found ${sourceSha256}`);
  }
  const entries = readEntries(sourceFile);
  if (entries.length !== EXPECTED_ENTRY_COUNT) {
    throw new Error(`Source entry count changed: expected ${EXPECTED_ENTRY_COUNT}, found ${entries.length}`);
  }

  const nodes: LeakageNode[] = entries.map((entry) => ({
    entryId: entry.externalEntryId,
    headword: entry.sourceHeadword,
    sourceTexts: entry.examples.map((example) => example.text).filter(Boolean),
    targetTexts: entry.examples.map((example) => example.translation).filter(Boolean),
  }));
  const groupByEntry = buildLeakageGroups(nodes);

  const structuralRejections: StructuralRejection[] = [];
  const pairCandidates: Array<{
    migmaqText: string;
    englishText: string;
    sourceRecord: SourceRecord;
  }> = [];
  for (const entry of entries) {
    for (let exampleIndex = 0; exampleIndex < entry.examples.length; exampleIndex += 1) {
      const example = entry.examples[exampleIndex];
      const migmaqText = canonicalDatasetText(example.text);
      const englishText = canonicalDatasetText(example.translation);
      if (!migmaqText) {
        structuralRejections.push({ entry_id: entry.externalEntryId, example_index: exampleIndex, reason: 'empty_migmaq_text', source_url: entry.sourceUrl });
        continue;
      }
      if (!englishText) {
        structuralRejections.push({ entry_id: entry.externalEntryId, example_index: exampleIndex, reason: 'empty_english_text', source_url: entry.sourceUrl });
        continue;
      }
      pairCandidates.push({ migmaqText, englishText, sourceRecord: sourceRecord(entry, exampleIndex) });
    }
  }

  pairCandidates.sort((a, b) =>
    a.sourceRecord.entry_id.localeCompare(b.sourceRecord.entry_id)
    || a.sourceRecord.example_index - b.sourceRecord.example_index);
  const deduplicated = new Map<string, { migmaqText: string; englishText: string; sourceRecords: SourceRecord[] }>();
  for (const candidate of pairCandidates) {
    const key = exactBilingualKey(candidate.migmaqText, candidate.englishText);
    const existing = deduplicated.get(key);
    if (existing) existing.sourceRecords.push(candidate.sourceRecord);
    else deduplicated.set(key, { migmaqText: candidate.migmaqText, englishText: candidate.englishText, sourceRecords: [candidate.sourceRecord] });
  }

  const sentencePairs: SentencePair[] = [];
  for (const [key, value] of deduplicated) {
    value.sourceRecords.sort((a, b) =>
      a.entry_id.localeCompare(b.entry_id) || a.example_index - b.example_index);
    const groups = new Set(value.sourceRecords.map((record) => groupByEntry.get(record.entry_id)));
    if (groups.has(undefined) || groups.size !== 1) {
      throw new Error(`Deduplicated pair spans unresolved leakage groups: ${sha256(key)}`);
    }
    const leakageGroup = [...groups][0]!;
    sentencePairs.push({
      id: `mic-sent-${sha256(key).slice(0, 24)}`,
      split: stableDatasetSplit(leakageGroup, SPLIT_NAMESPACE),
      leakage_group: leakageGroup,
      migmaq_text: value.migmaqText,
      english_text: value.englishText,
      source_records: value.sourceRecords,
    });
  }
  sentencePairs.sort((a, b) => a.id.localeCompare(b.id));

  const auditRows: LeakageAuditRow[] = sentencePairs.map((pair) => ({
    id: pair.id,
    split: pair.split,
    leakageGroup: pair.leakage_group,
    entryIds: pair.source_records.map((record) => record.entry_id),
    headwords: pair.source_records.map((record) => record.headword),
    sourceText: pair.migmaq_text,
    targetText: pair.english_text,
  }));
  const leakageViolations = auditSplitLeakage(auditRows);
  if (leakageViolations.length !== 0) {
    throw new Error(`Split leakage audit failed with ${leakageViolations.length} violations`);
  }

  const comparisonPairCount = new Set(sentencePairs.map((pair) => bilingualComparisonKey(pair.migmaq_text, pair.english_text))).size;
  if (comparisonPairCount !== sentencePairs.length) {
    throw new Error(`Case-folded bilingual duplicates remain: ${sentencePairs.length - comparisonPairCount}`);
  }

  const lexicalRows = entries
    .map((entry) => ({
      id: `mic-lex-${sha256(exactBilingualKey(entry.sourceHeadword, entry.translation)).slice(0, 24)}`,
      split: stableDatasetSplit(groupByEntry.get(entry.externalEntryId)!, SPLIT_NAMESPACE),
      pair_kind: 'headword_gloss_auxiliary' as const,
      migmaq_text: canonicalDatasetText(entry.sourceHeadword),
      english_text: canonicalDatasetText(entry.translation),
      leakage_group: groupByEntry.get(entry.externalEntryId),
      treatment: 'excluded_from_v1_sentence_candidate' as const,
      rights_status: 'noncommercial_cc_by_nc_4_0' as const,
      source: {
        entry_id: entry.externalEntryId,
        entry_url: entry.sourceUrl,
        raw_html_sha256: entry.rawHtmlSha256,
      },
    }))
    .filter((row) => row.migmaq_text && row.english_text)
    .sort((a, b) => a.id.localeCompare(b.id));

  const duplicateLexicalIds = lexicalRows.length - new Set(lexicalRows.map((row) => row.id)).size;
  const trainingRows = sentencePairs.flatMap((pair) => [trainingRow(pair, 'eng-mic'), trainingRow(pair, 'mic-eng')]);
  const splitOrder: DatasetSplit[] = ['train', 'validation', 'test'];
  const engMicRows = trainingRows.filter((row) => row.direction === 'eng-mic');
  const micEngRows = trainingRows.filter((row) => row.direction === 'mic-eng');
  const flags = sentencePairs.flatMap((pair) => qualityFlags(pair).map((flag) => ({ row_id: pair.id, flag })));
  const flagCounts = countBy(flags.map((item) => item.flag));

  ensureDirectory(outputRoot);
  const workRoot = fs.mkdtempSync(path.join(outputRoot, '.migmaq-dataset-build-'));
  const releaseDirectory = path.join(workRoot, RELEASE_ID);
  ensureDirectory(releaseDirectory);

  writeJsonl(path.join(releaseDirectory, 'data/sentence-pairs.jsonl'), sentencePairs);
  writeJsonl(path.join(releaseDirectory, 'data/lexical-auxiliary.jsonl'), lexicalRows);
  for (const split of splitOrder) {
    const combined = trainingRows.filter((row) => row.split === split);
    writeJsonl(path.join(releaseDirectory, `training/${split}.jsonl`), combined);
    writeJsonl(path.join(releaseDirectory, `training/${split}.eng-mic.jsonl`), engMicRows.filter((row) => row.split === split));
    writeJsonl(path.join(releaseDirectory, `training/${split}.mic-eng.jsonl`), micEngRows.filter((row) => row.split === split));
    writeJsonl(path.join(releaseDirectory, `lexical/${split}.jsonl`), lexicalRows.filter((row) => row.split === split));
  }

  const gateCandidates = engMicRows
    .filter((row) => row.split === 'train')
    .sort((a, b) => sha256(`gate\u001f${a.id}`).localeCompare(sha256(`gate\u001f${b.id}`)));
  writeJsonl(path.join(releaseDirectory, 'training/gates/overfit-128.eng-mic.jsonl'), gateCandidates.slice(0, 128));
  writeJsonl(path.join(releaseDirectory, 'training/gates/sanity-64.eng-mic.jsonl'), gateCandidates.slice(128, 192));

  const leakageAudit = {
    generated_at: RELEASED_AT,
    algorithm: {
      component_features: ['normalized_headword', 'normalized_migmaq_sentence', 'normalized_english_sentence'],
      normalization: 'Windows-1252 C1 repair + NFC + collapsed whitespace for output; NFKC + Unicode lowercase + quotation folding for comparison only',
      split_namespace: SPLIT_NAMESPACE,
      split_ratio: { train: 0.8, validation: 0.1, test: 0.1 },
    },
    rows_audited: sentencePairs.length,
    leakage_groups: new Set(sentencePairs.map((pair) => pair.leakage_group)).size,
    dimensions: ['leakage_group', 'entry', 'headword', 'source_text', 'target_text', 'bilingual_pair'],
    violation_count: leakageViolations.length,
    violations: leakageViolations,
  };
  const qualityAudit = {
    generated_at: RELEASED_AT,
    policy: 'Flags are review signals. Only empty sides are structurally excluded; flagged linguistic content is not silently rewritten.',
    source_examples: pairCandidates.length + structuralRejections.length,
    structurally_accepted_instances: pairCandidates.length,
    structurally_rejected_instances: structuralRejections.length,
    structural_rejections: structuralRejections,
    exact_duplicate_instances_removed: pairCandidates.length - sentencePairs.length,
    comparison_duplicate_instances_remaining: sentencePairs.length - comparisonPairCount,
    flagged_rows: new Set(flags.map((item) => item.row_id)).size,
    flag_counts: flagCounts,
    flags,
    character_lengths: {
      migmaq: quantiles(sentencePairs.map((pair) => pair.migmaq_text.length)),
      english: quantiles(sentencePairs.map((pair) => pair.english_text.length)),
    },
    whitespace_token_lengths: {
      migmaq: quantiles(sentencePairs.map((pair) => pair.migmaq_text.split(/\s+/u).length)),
      english: quantiles(sentencePairs.map((pair) => pair.english_text.split(/\s+/u).length)),
    },
    orthographic_diagnostics: {
      rows_with_ascii_apostrophe: sentencePairs.filter((pair) => pair.migmaq_text.includes("'")).length,
      rows_with_curly_apostrophe: sentencePairs.filter((pair) => pair.migmaq_text.includes('’')).length,
      source_examples_with_windows_1252_c1_controls_repaired: entries.reduce((count, entry) =>
        count + entry.examples.filter((example) => /[\u0080-\u009f]/u.test(`${example.text}${example.translation}`)).length, 0),
      source_examples_changed_by_nfc: entries.reduce((count, entry) =>
        count + entry.examples.filter((example) =>
          example.text !== example.text.normalize('NFC') || example.translation !== example.translation.normalize('NFC')).length, 0),
    },
  };
  writeJson(path.join(releaseDirectory, 'audits/leakage-audit.json'), leakageAudit);
  writeJson(path.join(releaseDirectory, 'audits/quality-audit.json'), qualityAudit);
  writeJson(path.join(releaseDirectory, 'audits/structural-rejections.json'), structuralRejections);

  const sourceSnapshot = {
    collection: "Mi'gmaq/Mi'kmaq Online Talking Dictionary",
    collection_url: 'https://mikmaqonline.org/',
    entry_index_url: 'https://mikmaqonline.org/all-words.html',
    local_snapshot_root: SOURCE_ROOT,
    manifest_path: path.relative(SOURCE_ROOT, sourceFile),
    manifest_sha256: sourceSha256,
    parsed_entry_count: entries.length,
    snapshot_date: '2026-07-12',
    source_attribution: "Mi'gmaq/Mi'kmaq Online Talking Dictionary (mikmaqonline.org), CC BY-NC 4.0.",
  };
  writeJson(path.join(releaseDirectory, 'provenance/source-snapshot.json'), sourceSnapshot);
  writeText(path.join(releaseDirectory, 'RIGHTS.md'), `# Rights and attribution

Source material: Mi'gmaq/Mi'kmaq Online Talking Dictionary (mikmaqonline.org).

Source license: Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).

This derived dataset may be copied, adapted, and shared only under the source license's terms, including attribution and the noncommercial restriction. It must not imply endorsement by the source project or its contributors. Source-supplied speaker codes are opaque provenance identifiers, not inferred identities or consent claims.

This release is approved for noncommercial research training only. The planned NLLB base model is independently subject to a noncommercial license.
`);

  const countsBySplit = Object.fromEntries(splitOrder.map((split) => [split, sentencePairs.filter((pair) => pair.split === split).length]));
  const manifest = {
    dataset_id: RELEASE_ID,
    version: '1.0.0',
    released_at: RELEASED_AT,
    status: 'frozen',
    task_scope: {
      primary_v1_direction: 'eng-mic',
      available_directions: ['eng-mic', 'mic-eng'],
      source_language: { name: 'English', iso_639_3: 'eng', nllb_token: 'eng_Latn' },
      target_language: { name: "Mi'gmaq", iso_639_3: 'mic', custom_nllb_token: 'mic_Latn' },
      orthography: 'source contemporary Listuguj spelling',
    },
    rights: {
      license: 'CC-BY-NC-4.0',
      commercial_use: false,
      approved_for_training: true,
      approved_scope: 'noncommercial research',
      attribution: sourceSnapshot.source_attribution,
    },
    source_snapshot: sourceSnapshot,
    split_policy: leakageAudit.algorithm,
    counts: {
      source_entries: entries.length,
      source_example_instances: pairCandidates.length + structuralRejections.length,
      structurally_complete_instances: pairCandidates.length,
      unique_sentence_pairs: sentencePairs.length,
      exact_duplicate_instances_removed: pairCandidates.length - sentencePairs.length,
      sentence_pairs_by_split: countsBySplit,
      bidirectional_training_rows: trainingRows.length,
      lexical_auxiliary_rows: lexicalRows.length,
      duplicate_lexical_ids: duplicateLexicalIds,
      plumbing_gate_train_rows: 128,
      plumbing_gate_sanity_rows: 64,
    },
    gates: {
      typed_source_parse: 'pass',
      source_checksum: 'pass',
      structural_validation: structuralRejections.length === 0 ? 'pass' : 'pass_with_reported_exclusions',
      split_leakage: 'pass',
      lexical_material_excluded_from_v1_sentence_training: true,
      frozen_test_not_for_model_selection: true,
    },
  };
  writeJson(path.join(releaseDirectory, 'manifest.json'), manifest);
  writeText(path.join(releaseDirectory, 'README.md'), `# ${RELEASE_ID}

Frozen, provenance-preserving English-Mi'gmaq parallel data derived from the example sentences in the Mi'gmaq/Mi'kmaq Online Talking Dictionary.

## Scope

- Primary v1 model direction: English -> Mi'gmaq.
- Written form: the source collection's contemporary Listuguj spellings.
- Sentence data: only complete, source-attested dictionary examples.
- Lexical data: exported separately and excluded from the v1 sentence candidate.
- License: CC BY-NC 4.0; noncommercial research use only.

## Layout

- \`data/sentence-pairs.jsonl\`: one neutral bilingual record per deduplicated sentence pair.
- \`training/{train,validation,test}.eng-mic.jsonl\`: English-to-Mi'gmaq model rows.
- \`training/{train,validation,test}.mic-eng.jsonl\`: reverse-direction rows for future experiments.
- \`training/gates/\`: training-only custom-token plumbing controls.
- \`data/lexical-auxiliary.jsonl\` and \`lexical/\`: headword-gloss material, not used in the v1 sentence score.
- \`audits/\`: structural, quality, and zero-leakage reports.
- \`provenance/\`: source snapshot identity and checksum.
- \`manifest.json\`: frozen release contract and counts.
- \`SHA256SUMS\`: per-file integrity record.

## Leakage policy

Entries are connected into one component when they share a normalized headword, Mi'gmaq sentence, or English sentence. Entire components receive one deterministic split. The audit asserts zero split overlap for component, entry, headword, source sentence, target sentence, and bilingual pair.

The held-out test split must not be consulted for model or decoding selection. Validation is the selection surface; test is reserved for the final frozen candidate report.

## Rebuild

From \`apps/web\` in the MobTranslate repository:

\`pnpm exec tsx scripts/build-migmaq-translation-dataset.ts\`

The builder pins the source manifest SHA-256 and refuses to overwrite this release ID.
`);

  const filesBeforeChecksums = listFiles(releaseDirectory);
  const checksumLines = filesBeforeChecksums.map((file) => `${sha256File(path.join(releaseDirectory, file))}  ${file}`);
  writeText(path.join(releaseDirectory, 'SHA256SUMS'), checksumLines.join('\n'));

  const releasedAt = new Date(RELEASED_AT);
  setTreeMtime(releaseDirectory, releasedAt);
  fs.renameSync(releaseDirectory, finalDirectory);
  fs.rmdirSync(workRoot);

  run('tar', [
    '--sort=name',
    `--mtime=@${Math.floor(releasedAt.getTime() / 1000)}`,
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-cf', tarFile,
    '-C', outputRoot,
    RELEASE_ID,
  ]);
  run('gzip', ['-n', '-9', tarFile]);
  const archiveSha256 = sha256File(archiveFile);
  writeText(archiveHashFile, `${archiveSha256}  ${path.basename(archiveFile)}`);

  console.log(JSON.stringify({
    release_directory: finalDirectory,
    archive_file: archiveFile,
    archive_sha256: archiveSha256,
    manifest,
    quality_flags: flagCounts,
    leakage_violations: leakageViolations.length,
  }, null, 2));
}

main();
