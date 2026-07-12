/**
 * Import a TTS-priority batch of synthetic Kuku Yalanji sentences into the
 * sentence recording studio queue (public.recording_sentences).
 *
 * Source: synthetic.db (READ-ONLY — never written). We select an initial batch
 * of ~2,000 sentences optimised for building a TTS speech corpus:
 *   - eligible = accepted/revised, 3–14 Kuku words (good utterance length)
 *   - deduped by normalised Kuku surface
 *   - ordered to MAXIMISE lexeme coverage first (greedy set-cover over the
 *     words_used JSON, CELF/lazy-greedy), tie-broken by quality tier
 *     (A = high / conf ≥ 0.90, then B ≥ 0.84, then rest) and confidence
 *   - once every lexeme is covered, the remaining slots are filled by the
 *     highest-quality sentences (redundant occurrences help TTS prosody)
 *
 * Idempotent: upserts on (corpus_source, corpus_sentence_id). Re-running never
 * duplicates rows and never clobbers elder work — kuku_text / original_kuku /
 * status / times_skipped are preserved on conflict; only priority/batch_label
 * and imported provenance context are refreshed.
 *
 * Usage:
 *   set -a; . /opt/mobtranslate/db.env; set +a
 *   npx tsx scripts/import-sentence-recording-queue.ts [--limit 2000] [--batch tts-priority-v1] [--dry-run]
 */
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: '/opt/mobtranslate/db.env', override: false });

const SYNTHETIC_DB =
  process.env.SYNTHETIC_DB ||
  '/mnt/donto-data/donto-resources/research/translation-training/kuku-yalanji-runpod-2026-06-30/synthetic/claude-synthetic-v1-2026-07-02/synthetic.db';

const CORPUS_SOURCE = 'synthetic-v1';
const LANGUAGE_CODE = 'kuku_yalanji';
const MIN_WORDS = 3;
const MAX_WORDS = 14;

function argValue(name: string, fallback?: string): string | undefined {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i >= 0) return process.argv[i + 1];
  const inline = process.argv.find((v) => v.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  return fallback;
}
const TARGET = parseInt(argValue('limit', '2000')!, 10);
const BATCH_LABEL = argValue('batch', 'tts-priority-v1')!;
const DRY_RUN = process.argv.includes('--dry-run');

type Row = {
  id: number;
  english: string;
  kuku: string;
  analysis: string | null;
  frame: string | null;
  tier: number | null;
  confidence: string | null;
  words_used: string | null;
};

type Candidate = {
  id: number;
  english: string;
  kuku: string;
  analysis: string | null;
  frame: string | null;
  tier: number | null;
  confidence: string | null;
  wordsUsed: string[]; // raw lexeme bases (as stored)
  lexIdx: number[]; // deduped lexeme indices for coverage
  qualityTier: number; // 0 = A, 1 = B, 2 = C
  confVal: number; // 0..1 comparable score
  normKuku: string;
};

/** Kuku word count = whitespace tokens of the trimmed surface. */
function wordCount(kuku: string): number {
  return kuku.trim().split(/\s+/).filter(Boolean).length;
}

/** Normalised surface for de-duplication. */
function normKuku(kuku: string): string {
  return kuku.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Parse a confidence value into a comparable 0..1 score + quality tier. */
function scoreConfidence(confidence: string | null): { confVal: number; qualityTier: number } {
  const c = (confidence ?? '').trim().toLowerCase();
  let confVal: number;
  if (c === 'high') confVal = 1.0;
  else if (c === 'medium') confVal = 0.55;
  else {
    const n = parseFloat(c);
    confVal = Number.isFinite(n) ? n : 0.5;
  }
  const qualityTier = confVal >= 0.9 ? 0 : confVal >= 0.84 ? 1 : 2;
  return { confVal, qualityTier };
}

function parseWordsUsed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((w) => String(w).trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

// ---- Minimal binary max-heap for CELF (lazy greedy) ----
type HeapNode = { cand: Candidate; gain: number; version: number };
class MaxHeap {
  private a: HeapNode[] = [];
  get size() {
    return this.a.length;
  }
  // Order: higher gain, then better quality tier, then higher confidence, then lower id.
  private less(x: HeapNode, y: HeapNode): boolean {
    if (x.gain !== y.gain) return x.gain > y.gain;
    if (x.cand.qualityTier !== y.cand.qualityTier) return x.cand.qualityTier < y.cand.qualityTier;
    if (x.cand.confVal !== y.cand.confVal) return x.cand.confVal > y.cand.confVal;
    return x.cand.id < y.cand.id;
  }
  push(n: HeapNode) {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[i], a[p])) {
        [a[i], a[p]] = [a[p], a[i]];
        i = p;
      } else break;
    }
  }
  pop(): HeapNode | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < n && this.less(a[l], a[best])) best = l;
        if (r < n && this.less(a[r], a[best])) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]];
        i = best;
      }
    }
    return top;
  }
}

async function main() {
  const dbFile = SYNTHETIC_DB;
  const sqlite = new DatabaseSync(dbFile, { readOnly: true });
  const rows = sqlite
    .prepare(
      `select id, english, kuku, analysis, frame, tier, confidence, words_used
       from sentences
       where status in ('accepted','revised')
       order by id asc`,
    )
    .all() as unknown as Row[];
  sqlite.close();

  // Build the lexeme index over the eligible pool and the candidate list.
  const lexToIdx = new Map<string, number>();
  const seenSurface = new Set<string>();
  const candidates: Candidate[] = [];
  let skippedLen = 0;
  let skippedDup = 0;

  for (const r of rows) {
    const wc = wordCount(r.kuku);
    if (wc < MIN_WORDS || wc > MAX_WORDS) {
      skippedLen++;
      continue;
    }
    const nk = normKuku(r.kuku);
    if (seenSurface.has(nk)) {
      skippedDup++;
      continue;
    }
    seenSurface.add(nk);
    const wordsUsed = parseWordsUsed(r.words_used);
    const lexSet = new Set<number>();
    for (const w of wordsUsed) {
      let idx = lexToIdx.get(w);
      if (idx === undefined) {
        idx = lexToIdx.size;
        lexToIdx.set(w, idx);
      }
      lexSet.add(idx);
    }
    const { confVal, qualityTier } = scoreConfidence(r.confidence);
    candidates.push({
      id: r.id,
      english: r.english,
      kuku: r.kuku,
      analysis: r.analysis,
      frame: r.frame,
      tier: r.tier,
      confidence: r.confidence,
      wordsUsed,
      lexIdx: [...lexSet],
      qualityTier,
      confVal,
      normKuku: nk,
    });
  }

  const numLexemes = lexToIdx.size;
  console.log(
    `Eligible pool: ${candidates.length} sentences (skipped ${skippedLen} out-of-range, ${skippedDup} dup surface) · ${numLexemes} distinct lexemes`,
  );

  // ---- CELF lazy-greedy max coverage, then quality fill ----
  const covered = new Uint8Array(numLexemes);
  const selectedFlag = new Uint8Array(candidates.length); // by array index
  const candIndexById = new Map<number, number>();
  candidates.forEach((c, i) => candIndexById.set(c.id, i));

  const gainOf = (c: Candidate): number => {
    let g = 0;
    for (const idx of c.lexIdx) if (!covered[idx]) g++;
    return g;
  };

  const heap = new MaxHeap();
  for (const c of candidates) heap.push({ cand: c, gain: c.lexIdx.length, version: 0 });

  const selected: Candidate[] = [];
  let globalVersion = 0;
  let coveragePhaseCount = 0;
  let coverageComplete = false;

  while (selected.length < TARGET) {
    const top = heap.pop();
    if (!top) break;
    const ci = candIndexById.get(top.cand.id)!;
    if (selectedFlag[ci]) continue;
    if (top.version !== globalVersion) {
      top.gain = gainOf(top.cand);
      top.version = globalVersion;
      heap.push(top);
      continue;
    }
    // top is fresh and maximal.
    if (top.gain === 0) {
      coverageComplete = true;
      break; // no candidate adds new coverage — switch to quality fill
    }
    selectedFlag[ci] = 1;
    for (const idx of top.cand.lexIdx) covered[idx] = 1;
    selected.push(top.cand);
    coveragePhaseCount++;
    globalVersion++;
  }

  // Quality fill for any remaining slots (redundant lexeme occurrences help TTS).
  if (selected.length < TARGET) {
    const remaining = candidates
      .filter((_, i) => !selectedFlag[i])
      .sort(
        (a, b) =>
          a.qualityTier - b.qualityTier || b.confVal - a.confVal || a.id - b.id,
      );
    for (const c of remaining) {
      if (selected.length >= TARGET) break;
      selected.push(c);
    }
  }

  const coveredCount = covered.reduce((s, v) => s + v, 0);
  const tierCounts = selected.reduce(
    (m, c) => ((m[c.qualityTier] = (m[c.qualityTier] ?? 0) + 1), m),
    {} as Record<number, number>,
  );
  const avgWords =
    selected.reduce((s, c) => s + wordCount(c.kuku), 0) / (selected.length || 1);
  const grammarFrames = new Set(selected.map((c) => c.frame ?? '?')).size;

  console.log('---- selection ----');
  console.log(`Selected: ${selected.length} (coverage phase ${coveragePhaseCount}, quality fill ${selected.length - coveragePhaseCount})`);
  console.log(`Lexeme coverage: ${coveredCount}/${numLexemes} (${((coveredCount / numLexemes) * 100).toFixed(1)}%)${coverageComplete ? ' — complete' : ''}`);
  console.log(`Quality tiers: A=${tierCounts[0] ?? 0} B=${tierCounts[1] ?? 0} C=${tierCounts[2] ?? 0}`);
  console.log(`Avg Kuku words/sentence: ${avgWords.toFixed(2)} · distinct grammar frames: ${grammarFrames}`);

  if (DRY_RUN) {
    console.log('Dry run — no DB writes.');
    return;
  }

  // ---- Idempotent upsert into recording_sentences ----
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set (source /opt/mobtranslate/db.env)');
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [{ id: languageId } = { id: null }] = await sql<{ id: string }[]>`
      select id from public.languages where code = ${LANGUAGE_CODE} limit 1`;
    if (!languageId) throw new Error(`Language ${LANGUAGE_CODE} not found`);

    let inserted = 0;
    let updated = 0;
    await sql.begin(async (tx) => {
      for (let i = 0; i < selected.length; i++) {
        const c = selected[i];
        const priority = TARGET - i; // selection order → priority desc
        const res = await tx<{ inserted: boolean }[]>`
          insert into public.recording_sentences
            (language_id, corpus_source, corpus_sentence_id, kuku_text, english_text, original_kuku,
             analysis, frame, tier, confidence, words_used, status, priority, batch_label)
          values
            (${languageId}::uuid, ${CORPUS_SOURCE}, ${c.id}, ${c.kuku}, ${c.english}, ${c.kuku},
             ${c.analysis}, ${c.frame}, ${c.tier}, ${c.confidence},
             ${JSON.stringify(c.wordsUsed)}::jsonb, 'pending', ${priority}, ${BATCH_LABEL})
          on conflict (corpus_source, corpus_sentence_id) do update set
             priority = excluded.priority,
             batch_label = excluded.batch_label,
             english_text = excluded.english_text,
             analysis = excluded.analysis,
             frame = excluded.frame,
             tier = excluded.tier,
             confidence = excluded.confidence,
             words_used = excluded.words_used,
             language_id = excluded.language_id,
             updated_at = now()
          returning (xmax = 0) as inserted`;
        if (res[0]?.inserted) inserted++;
        else updated++;
      }
    });

    const [{ total }] = await sql<{ total: number }[]>`
      select count(*)::int as total from public.recording_sentences
      where corpus_source = ${CORPUS_SOURCE} and batch_label = ${BATCH_LABEL}`;
    console.log('---- upsert ----');
    console.log(`Inserted ${inserted}, updated ${updated}. Queue now holds ${total} rows in batch '${BATCH_LABEL}'.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
