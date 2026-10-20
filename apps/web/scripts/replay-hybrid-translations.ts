/**
 * Replay translation requests through the full hybrid pipeline and record
 * every stage, so a change can be judged on real inputs before it ships.
 *
 * Usage:
 *   tsx scripts/replay-hybrid-translations.ts --cases <file.json> --out <file.jsonl> [--deadline-seconds 170]
 *
 * The cases file is a JSON array of { text, language, before?, beforeGloss? }.
 * Keep it outside the repository: it holds what real people typed. Stage
 * results are cached exactly as live requests cache them, so a replay also
 * warms the cache for those inputs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { loadHybridLanguageContract } from '@/lib/hybrid-translation-registry.server';
import { loadDictionary } from '@/lib/translation-dictionary.server';
import {
  getCachedEvidencePack,
  getCachedHybridDraft,
  getCachedSourceAnalysis,
  runHybridReviewPipeline,
} from '@/lib/hybrid-pipeline.server';

interface ReplayCase {
  text: string;
  language: string;
  before?: string;
  beforeGloss?: string;
}

const args = process.argv.slice(2);
const argument = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const casesPath = argument('--cases');
const outPath = argument('--out');
if (!casesPath || !outPath) {
  throw new Error('Usage: replay-hybrid-translations.ts --cases <file.json> --out <file.jsonl>');
}

// Like the live route, each case must finish within this many seconds of
// starting its checking stage (the route allows 170 s after its draft).
const deadlineSeconds = Number(argument('--deadline-seconds') ?? 170);

// The operator runs replays deliberately; public request budgets do not apply.
const noBudget = async () => {};

async function replay(item: ReplayCase) {
  const startedAt = Date.now();
  const contract = loadHybridLanguageContract(item.language);
  if (!contract) throw new Error(`Hybrid translation is not enabled for ${item.language}.`);
  const dictionary = await loadDictionary(contract.dictionaryCode);
  if (!dictionary) throw new Error(`No dictionary for ${contract.dictionaryCode}.`);

  const analysis = await getCachedSourceAnalysis(item.text, contract, noBudget);
  const draft = await getCachedHybridDraft(analysis.value.englishText, contract, noBudget);
  const evidence = await getCachedEvidencePack(
    dictionary,
    contract,
    analysis.value,
    draft.value.translation,
    noBudget,
  );
  const result = await runHybridReviewPipeline({
    text: item.text,
    analysis: analysis.value,
    dictionary,
    contract,
    draft: draft.value,
    beforeCompute: noBudget,
    deadlineAt: Date.now() + deadlineSeconds * 1000,
  });
  return {
    text: item.text,
    language: item.language,
    before: item.before ?? null,
    beforeGloss: item.beforeGloss ?? null,
    analysis: analysis.value,
    draft: draft.value.translation,
    draftWords: evidence.value.words.map((word) => `${word.form}:${word.status}`),
    evidenceCount: evidence.value.items.length,
    after: result.reviewed.translation,
    afterGloss: result.reviewed.gloss,
    decision: result.reviewed.decision,
    confidence: result.reviewed.confidence,
    notTranslated: result.reviewed.notTranslated,
    repaired: result.repaired,
    meaningCheck: result.reviewed.meaningCheck,
    reading: result.reviewed.reading,
    summary: result.reviewed.summary,
    changes: result.reviewed.changes,
    caveats: result.reviewed.caveats,
    cache: { analysis: analysis.state, draft: draft.state, ...result.cache },
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
  };
}

async function main() {
  const cases = JSON.parse(await readFile(casesPath!, 'utf8')) as ReplayCase[];
  const lines: string[] = [];
  for (const item of cases) {
    try {
      const outcome = await replay(item);
      lines.push(JSON.stringify(outcome));
      console.log(
        `${outcome.seconds}s  ${outcome.notTranslated ? '(no translation)' : outcome.after}  | ${outcome.meaningCheck?.verdict ?? '-'}${outcome.repaired ? ' repaired' : ''} | ${outcome.confidence}`,
      );
    } catch (error) {
      lines.push(JSON.stringify({ text: item.text, error: String(error) }));
      console.log(`failed: ${String(error)}`);
    }
  }
  await writeFile(outPath!, `${lines.join('\n')}\n`, { mode: 0o640 });
  console.log(`Wrote ${lines.length} results to ${outPath}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Replay failed:', error);
  process.exit(1);
});
