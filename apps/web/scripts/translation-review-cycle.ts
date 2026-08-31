import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const researchRoot =
  process.env.MOBTRANSLATE_TRANSLATION_REVIEW_ROOT?.trim() ||
  '/mnt/donto-data/donto-resources/research/translation-training/live-translation-review-program-2026-08-31';
const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const checkOnly = process.argv.includes('--check');

interface Program {
  key: string;
  languageScope: string;
  requestRefPrefix: string;
  methodVersion: string;
  supportingEvidenceTiers: string[];
  auditScript: string;
  sourceArgs: string[];
  outputFlag: '--output' | '--output-dir';
}

// These are registered, frozen program artifacts—not semantic routing rules.
// Classification remains data-driven inside each evidence audit.
const programs: Program[] = [
  {
    key: 'kuku_yalanji',
    languageScope: 'kuku_yalanji',
    requestRefPrefix: 'mobtranslate-kuku-audit-v1',
    methodVersion: 'kuku-audit-v1',
    supportingEvidenceTiers: ['direct_source'],
    auditScript:
      '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-live-translation-audit-2026-08-30/audit_live_requests.py',
    outputFlag: '--output-dir',
    sourceArgs: [
      '--dictionary-yaml',
      '/mnt/donto-data/workspace/mobtranslate.com/dictionaries/kuku_yalanji/dictionary.yaml',
      '--grammar-examples',
      '/mnt/donto-data/workspace/mobtranslate.com/experiments/pdftomd/extract/output/examples.xigt.json',
      '--synthetic-db',
      '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30/synthetic/claude-synthetic-v1-2026-07-02/synthetic.db',
      '--named-text-jsonl',
      '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30/runpod/v25.2-slq-literacy-corpus-audit-20260716/data/slq-kuku-ngujuji-development.eng-gvn.jsonl',
      '--named-text-jsonl',
      '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30/runpod/v25.2-slq-literacy-corpus-audit-20260716/data/slq-kuku-ngujuji-final-test.eng-gvn.jsonl',
      '--named-text-jsonl',
      '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30/runpod/v25.2-slq-literacy-corpus-audit-20260716/data/slq-translated-readers-training-candidate.eng-gvn.jsonl',
    ],
  },
  {
    key: 'wajarri',
    languageScope: 'wajarri,wbv',
    requestRefPrefix: 'mobtranslate-wajarri-audit-v1',
    methodVersion: 'wajarri-audit-v1',
    supportingEvidenceTiers: ['direct_source'],
    auditScript:
      '/mnt/donto-data/donto-resources/research/translation-training/wajarri-live-translation-audit-2026-08-30/audit_live_requests.py',
    outputFlag: '--output',
    sourceArgs: [
      '--dictionary-yaml',
      '/mnt/donto-data/workspace/mobtranslate.com/dictionaries/wajarri/dictionary.yaml',
      '--living-dictionary-forms',
      '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1/dictionary/editions/wajarri-dictionary-controlled-synthetic-activation-v1.3.0/forms.jsonl',
      '--living-dictionary-senses',
      '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1/dictionary/editions/wajarri-dictionary-controlled-synthetic-activation-v1.3.0/senses.jsonl',
      '--fixed-utterances',
      '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1/dictionary/editions/wajarri-dictionary-50words-attested-v1.2.0/examples.jsonl',
      '--open-lexical',
      '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1/releases/huggingface/mobtranslate-wajarri-synthetic-corpus-v1/data/open-lexical.jsonl',
      '--contemporary-lexical',
      '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1/analysis/inventories/wajarri-contemporary-source-evidence-v0.4.0/lexical-pairings.jsonl',
      '--contemporary-phrases',
      '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1/analysis/inventories/wajarri-contemporary-source-evidence-v0.4.0/phrase-translation-pairings.jsonl',
      '--historical-witnesses',
      '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1/releases/huggingface/mobtranslate-wajarri-synthetic-corpus-v1/data/historical-witnesses.jsonl',
      '--synthetic-pairs',
      '/mnt/donto-data/donto-resources/research/language-programs/wajarri-v1/releases/huggingface/mobtranslate-wajarri-synthetic-corpus-v1/data/controlled-synthetic.jsonl',
      '--v3-controlled-pairs',
      '/mnt/donto-data/donto-resources/research/translation-training/wajarri-live-translation-audit-2026-08-30/sources/web/wajarri-v3-training-declared-source.jsonl',
    ],
  },
  {
    key: 'anindilyakwa',
    languageScope: 'anindilyakwa',
    requestRefPrefix: 'mobtranslate-anindilyakwa-audit-v1',
    methodVersion: 'anindilyakwa-audit-v1',
    supportingEvidenceTiers: [],
    auditScript:
      '/mnt/donto-data/donto-resources/research/translation-training/anindilyakwa-live-translation-audit-2026-08-30/audit_live_requests.py',
    outputFlag: '--output',
    sourceArgs: [
      '--dictionary-yaml',
      '/mnt/donto-data/workspace/mobtranslate.com/dictionaries/anindilyakwa/dictionary.yaml',
      '--dictionary-forms',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/dictionary/editions/anindilyakwa-local-source-v0.1.0/forms.jsonl',
      '--dictionary-senses',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/dictionary/editions/anindilyakwa-local-source-v0.1.0/senses.jsonl',
      '--fixed-utterances',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/benchmarks/editions/anindilyakwa-benchmark-suite-v0.1.0/fixed-utterances.jsonl',
      '--natural-sentences',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/benchmarks/editions/anindilyakwa-benchmark-suite-v0.1.0/natural-sentences.jsonl',
      '--scripture-train',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/corpus/editions/anindilyakwa-owner-attested-parallel-v0.3.0/train.jsonl',
      '--scripture-development',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/corpus/editions/anindilyakwa-owner-attested-parallel-v0.3.0/development.jsonl',
      '--grammar-summary',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/grammar/editions/bednall-thesis-source-edition-v0.1.0/summary.json',
      '--corpus-manifest',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/corpus/editions/anindilyakwa-owner-attested-parallel-v0.3.0/MANIFEST.json',
      '--model-diagnostic',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/training/runs/anindilyakwa-private-baseline-20260809-a1/anindilyakwa-route-separated-diagnostic-v0.1.0/report.json',
      '--model-release',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/training/releases/anindilyakwa-private-baseline-v0.1.0/MODEL-RELEASE.json',
      '--release-admission',
      '/mnt/donto-data/donto-resources/research/language-programs/anindilyakwa-v1/analysis/gates/anindilyakwa-release-admission-v0.1.4/report.json',
    ],
  },
  {
    key: 'migmaq',
    languageScope: 'migmaq',
    requestRefPrefix: 'mobtranslate-migmaq-audit-v1',
    methodVersion: 'migmaq-audit-v1+source-tier-contract-v2',
    supportingEvidenceTiers: [
      'direct_source',
      'speaker_recorded_dictionary',
      'speaker_recorded_example',
      'source_attested_lesson',
    ],
    auditScript:
      '/mnt/donto-data/donto-resources/research/translation-training/migmaq-live-translation-audit-2026-08-30/audit_live_requests.py',
    outputFlag: '--output',
    sourceArgs: [
      '--dictionary-entries',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/dictionary/entries.jsonl',
      '--dictionary-senses',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/dictionary/sense-candidates.jsonl',
      '--dictionary-forms',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/dictionary/forms-raw.jsonl',
      '--dictionary-examples',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/dictionary/examples.jsonl',
      '--dictionary-census',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/analysis/inventories/dictionary-census-summary.json',
      '--lesson-ledger',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/datasets/migmaq-listuguj-lessons-parallel-v1.0.1-20260721/ledger/pair-ledger.jsonl',
      '--lessons-manifest',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/datasets/migmaq-listuguj-lessons-parallel-v1.0.1-20260721/manifest.json',
      '--sealed-analysis',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/experiments/analyses/migmaq-v3-3-dialog40-seed17-sealed-qualitative-20260721/analysis.json',
      '--release-contract',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/releases/mobtranslate-migmaq-listuguj-v3.3-hf-20260721/dataset-repo/provenance/release-contract.json',
      '--release-manifest',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/releases/mobtranslate-migmaq-listuguj-v3.3-hf-20260721/release-manifest.json',
      '--program-state',
      '/mnt/donto-data/donto-resources/research/language-programs/migmaq-listuguj-v2/PROGRAM-STATE.json',
    ],
  },
];

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

function cycleKey(): string {
  const explicit = option('cycle-key');
  if (explicit) {
    if (!/^[0-9A-Za-z._-]+$/u.test(explicit)) throw new Error('Invalid --cycle-key.');
    return explicit;
  }
  return new Date().toISOString().replaceAll(/[-:]/gu, '').replace('.000', '');
}

function sourcePaths(program: Program): string[] {
  const values: string[] = [program.auditScript];
  for (let index = 1; index < program.sourceArgs.length; index += 2) {
    values.push(program.sourceArgs[index]);
  }
  return [...new Set(values)];
}

async function fingerprint(filePath: string): Promise<{ path: string; bytes: number; sha256: string }> {
  const bytes = await readFile(filePath);
  return {
    path: filePath,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function run(executable: string, args: string[]): string {
  const result = spawnSync(executable, args, {
    cwd: webRoot,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${executable} failed (${result.status ?? 'signal'}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout.trim();
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is required.');
  const selectedKey = option('language');
  const selected = selectedKey
    ? programs.filter((program) => program.key === selectedKey)
    : programs;
  if (selected.length === 0) throw new Error(`Unknown review program: ${selectedKey}`);

  const sourceInventory = Object.fromEntries(
    await Promise.all(
      selected.map(async (program) => [
        program.key,
        await Promise.all(sourcePaths(program).map(fingerprint)),
      ]),
    ),
  );
  if (checkOnly) {
    console.log(JSON.stringify({ status: 'ready', programs: sourceInventory }, null, 2));
    return;
  }

  const key = cycleKey();
  const cycleRoot = path.join(researchRoot, 'runs', key);
  try {
    await stat(cycleRoot);
    throw new Error(`Review cycle already exists: ${cycleRoot}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(cycleRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  const results: unknown[] = [];

  for (const program of selected) {
    const output = path.join(cycleRoot, program.key, 'output');
    await mkdir(output, { recursive: true });
    run('/usr/bin/python3', [
      program.auditScript,
      ...program.sourceArgs,
      program.outputFlag,
      output,
    ]);
    const artifact = path.join(output, 'request-classifications.no-raw-text.jsonl');
    const importOutput = run('/usr/bin/pnpm', [
      'exec',
      'tsx',
      'scripts/translation-review-ledger.ts',
      'import-audit',
      '--artifact',
      artifact,
      '--language-scope',
      program.languageScope,
      '--request-ref-prefix',
      program.requestRefPrefix,
      '--run-key',
      `${program.key}-review-cycle-${key}`,
      '--method-version',
      program.methodVersion,
      ...program.supportingEvidenceTiers.flatMap((tier) => [
        '--supporting-evidence-tier',
        tier,
      ]),
    ]);
    results.push(JSON.parse(importOutput));
  }

  const outputFiles = await Promise.all(
    selected.flatMap((program) => {
      const output = path.join(cycleRoot, program.key, 'output');
      return readdir(output).then((names) => Promise.all(names.sort().map((name) => fingerprint(path.join(output, name)))));
    }),
  );
  const manifest = {
    schema_version: 1,
    cycle_key: key,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    status: 'complete',
    source_inventory: sourceInventory,
    results,
    output_files: outputFiles.flat(),
  };
  await writeFile(
    path.join(cycleRoot, 'MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  console.log(JSON.stringify(manifest));
}

main();
