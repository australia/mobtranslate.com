import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

type Db = ReturnType<typeof postgres>;

type PairRow = {
  pair_id: string;
  pair_kind: string;
  canonical_ref: string;
  source_text: string;
  target_text: string;
  alignment_confidence: string;
  alignment_status: string;
  rights_status: string;
  approved_for_training: boolean;
  source_code: string;
  source_title: string;
  source_language_code: string;
  target_code: string;
  target_title: string;
  target_language_code: string;
};

type TrainingRow = {
  id: string;
  split: 'train' | 'validation' | 'test';
  direction: 'eng-gvn' | 'gvn-eng';
  tier: 'high_confidence_verse' | 'sentence_candidate';
  input_text: string;
  output_text: string;
  source_lang: string;
  target_lang: string;
  translation: Record<string, string>;
  canonical_ref: string;
  pair_kind: string;
  alignment_confidence: number;
  alignment_status: string;
  rights_status: string;
  approved_for_training: boolean;
  corpus: {
    family: 'ebible';
    source_edition: string;
    target_edition: string;
    source_title: string;
    target_title: string;
  };
};

const DEFAULT_OUT_DIR =
  '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30/datasets/kuku_yalanji_ebible_parallel_v0.1.0';

function argValue(name: string, fallback?: string): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i >= 0) return process.argv[i + 1];
  const inline = process.argv.find((v) => v.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  return fallback;
}

function boolArg(name: string, fallback: boolean): boolean {
  const raw = argValue(name);
  if (raw == null) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw.toLowerCase());
}

function loadEnv() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: '/opt/mobtranslate/db.env', override: false });
}

function stableSplit(key: string): 'train' | 'validation' | 'test' {
  const hash = crypto.createHash('sha256').update(key).digest();
  const value = hash.readUInt32BE(0) / 0xffffffff;
  if (value < 0.8) return 'train';
  if (value < 0.9) return 'validation';
  return 'test';
}

function jsonLine(row: unknown): string {
  return `${JSON.stringify(row)}\n`;
}

function writeJsonl(file: string, rows: TrainingRow[]) {
  fs.writeFileSync(file, rows.map(jsonLine).join(''), 'utf8');
}

function writeReadme(outDir: string, manifest: Record<string, unknown>) {
  const file = path.join(outDir, 'README.md');
  fs.writeFileSync(
    file,
    `# ${manifest.dataset_id}

Generated from MobTranslate's \`parallel_corpus_pairs\` table for the approved Kuku Yalanji eBible snapshot.

## Files

- \`train.jsonl\`, \`validation.jsonl\`, \`test.jsonl\`: all directions.
- \`train.eng-gvn.jsonl\`, \`validation.eng-gvn.jsonl\`, \`test.eng-gvn.jsonl\`: English to Kuku Yalanji.
- \`train.gvn-eng.jsonl\`, \`validation.gvn-eng.jsonl\`, \`test.gvn-eng.jsonl\`: Kuku Yalanji to English.
- \`manifest.json\`: counts, rights, source editions, and export settings.

Each row has \`input_text\`, \`output_text\`, \`source_lang\`, \`target_lang\`, \`direction\`, \`split\`, \`canonical_ref\`, alignment metadata, and rights metadata.

Splits are deterministic by \`canonical_ref\`, so the same Bible reference cannot appear in both training and evaluation through different English editions.

## Manifest

\`\`\`json
${JSON.stringify(manifest, null, 2)}
\`\`\`
`,
    'utf8',
  );
}

async function getRows(sql: Db, sourceCode: string, includeSentenceCandidates: boolean): Promise<PairRow[]> {
  const kinds = includeSentenceCandidates ? ['verse', 'verse_range', 'sentence_candidate'] : ['verse', 'verse_range'];
  return sql<PairRow[]>`
    select
      p.id::text as pair_id,
      p.pair_kind,
      p.canonical_ref,
      p.source_text,
      p.target_text,
      p.alignment_confidence::text,
      p.alignment_status,
      p.rights_status,
      p.approved_for_training,
      src.source_code,
      src.title as source_title,
      src.language_code as source_language_code,
      tgt.source_code as target_code,
      tgt.title as target_title,
      tgt.language_code as target_language_code
    from public.parallel_corpus_pairs p
    join public.parallel_corpus_editions src on src.id = p.source_edition_id
    join public.parallel_corpus_editions tgt on tgt.id = p.target_edition_id
    where src.source_family = 'ebible'
      and src.source_code = ${sourceCode}
      and p.approved_for_training = true
      and p.rights_status = 'rights_granted'
      and p.pair_kind = any(${kinds})
      and p.alignment_status not like 'needs_human_review%'
    order by p.canonical_ref, tgt.source_code, p.pair_kind, p.id
  `;
}

function toTrainingRows(row: PairRow): TrainingRow[] {
  const split = stableSplit(row.canonical_ref);
  const confidence = Number(row.alignment_confidence);
  const tier = row.pair_kind === 'sentence_candidate' ? 'sentence_candidate' : 'high_confidence_verse';
  const corpus = {
    family: 'ebible' as const,
    source_edition: row.source_code,
    target_edition: row.target_code,
    source_title: row.source_title,
    target_title: row.target_title,
  };

  return [
    {
      id: `${row.pair_id}:eng-gvn`,
      split,
      direction: 'eng-gvn',
      tier,
      input_text: row.target_text,
      output_text: row.source_text,
      source_lang: 'eng_Latn',
      target_lang: 'gvn_Latn',
      translation: { eng_Latn: row.target_text, gvn_Latn: row.source_text },
      canonical_ref: row.canonical_ref,
      pair_kind: row.pair_kind,
      alignment_confidence: confidence,
      alignment_status: row.alignment_status,
      rights_status: row.rights_status,
      approved_for_training: row.approved_for_training,
      corpus,
    },
    {
      id: `${row.pair_id}:gvn-eng`,
      split,
      direction: 'gvn-eng',
      tier,
      input_text: row.source_text,
      output_text: row.target_text,
      source_lang: 'gvn_Latn',
      target_lang: 'eng_Latn',
      translation: { gvn_Latn: row.source_text, eng_Latn: row.target_text },
      canonical_ref: row.canonical_ref,
      pair_kind: row.pair_kind,
      alignment_confidence: confidence,
      alignment_status: row.alignment_status,
      rights_status: row.rights_status,
      approved_for_training: row.approved_for_training,
      corpus,
    },
  ];
}

async function main() {
  loadEnv();
  const outDir = argValue('out', DEFAULT_OUT_DIR)!;
  const datasetId = argValue('dataset-id', path.basename(outDir))!;
  const sourceCode = argValue('source-code', 'gvn-2026-06-30')!;
  const includeSentenceCandidates = boolArg('include-sentence-candidates', false);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Load /opt/mobtranslate/db.env or pass DATABASE_URL.');
  }

  fs.mkdirSync(outDir, { recursive: true });
  const sql = postgres(databaseUrl, { max: 4 });
  try {
    const pairRows = await getRows(sql, sourceCode, includeSentenceCandidates);
    const rows = pairRows.flatMap(toTrainingRows);

    for (const split of ['train', 'validation', 'test'] as const) {
      const splitRows = rows.filter((row) => row.split === split);
      writeJsonl(path.join(outDir, `${split}.jsonl`), splitRows);
      for (const direction of ['eng-gvn', 'gvn-eng'] as const) {
        writeJsonl(
          path.join(outDir, `${split}.${direction}.jsonl`),
          splitRows.filter((row) => row.direction === direction),
        );
      }
    }
    writeJsonl(path.join(outDir, 'all.jsonl'), rows);

    const bySplit = Object.fromEntries(
      ['train', 'validation', 'test'].map((split) => [split, rows.filter((row) => row.split === split).length]),
    );
    const byDirection = Object.fromEntries(
      ['eng-gvn', 'gvn-eng'].map((direction) => [direction, rows.filter((row) => row.direction === direction).length]),
    );
    const byTier = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.tier] = (acc[row.tier] ?? 0) + 1;
      return acc;
    }, {});
    const byTargetEdition = pairRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.target_code] = (acc[row.target_code] ?? 0) + 1;
      return acc;
    }, {});

    const manifest = {
      dataset_id: datasetId,
      version: '0.1.0',
      generated_at: new Date().toISOString(),
      source_code: sourceCode,
      source_language: { iso_639_3: 'gvn', nllb_token: 'gvn_Latn', name: 'Kuku Yalanji' },
      english_language: { iso_639_3: 'eng', nllb_token: 'eng_Latn', name: 'English' },
      rights: {
        source_rights_status: 'rights_granted',
        approved_for_training: true,
        attested_by: 'project_owner',
        attested_at: '2026-06-30T00:00:00Z',
      },
      export_policy: {
        include_sentence_candidates: includeSentenceCandidates,
        excluded_alignment_status_prefix: 'needs_human_review',
        split_key: 'canonical_ref',
        split_ratio: { train: 0.8, validation: 0.1, test: 0.1 },
      },
      counts: {
        source_pairs: pairRows.length,
        training_rows: rows.length,
        by_split: bySplit,
        by_direction: byDirection,
        by_tier: byTier,
        source_pairs_by_english_edition: byTargetEdition,
      },
    };

    fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    writeReadme(outDir, manifest);
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
