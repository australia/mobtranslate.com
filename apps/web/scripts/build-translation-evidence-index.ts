/**
 * Build (or refresh) the meaning-searchable evidence index the hybrid
 * translation checker reads: dictionary entries and example sentences from
 * the database, plus any grammar sources configured in
 * lib/translation-evidence/sources.ts.
 *
 * Only units whose content changed are re-embedded, so a re-run after a small
 * dictionary edit costs almost nothing. Index rows are derived data and are
 * replaced wholesale per language inside one transaction.
 *
 * Usage:
 *   tsx scripts/build-translation-evidence-index.ts [--language <code>]... [--dry-run]
 * With no --language, every hybrid-translation dictionary is built.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import {
  EVIDENCE_EMBEDDING_DIMENSIONS,
  EVIDENCE_EMBEDDING_MODEL,
  embedTexts,
  vectorLiteral,
} from '../lib/translation-evidence/embeddings.server';
import { normalizeForm } from '../lib/translation-evidence/forms';
import { EVIDENCE_GRAMMAR_SOURCES } from '../lib/translation-evidence/sources';
import {
  buildDictionaryUnits,
  buildGrammarDigestUnits,
  buildGrammarFormUnits,
  buildGrammarMarkdownUnits,
  collectKnownStems,
  evidenceIndexRevision,
  type DictionaryEntryRecord,
  type EvidenceUnit,
  type GrammarFormRecord,
} from '../lib/translation-evidence/units';
import { listHybridLanguageDefinitions } from '../lib/hybrid-translation-registry.server';

const here = path.dirname(fileURLToPath(import.meta.url));
const dictionariesRoot = path.resolve(
  process.env.MOBTRANSLATE_DICTIONARIES_ROOT || path.resolve(here, '../../../dictionaries'),
);
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const requested = args.flatMap((arg, index) =>
  arg === '--language' && args[index + 1] ? [args[index + 1]] : [],
);
const languages = requested.length > 0
  ? requested
  : [...new Set(listHybridLanguageDefinitions().map((definition) => definition.dictionaryCode))];

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const sql = postgres(databaseUrl, { max: 2 });

async function loadDictionaryEntries(code: string): Promise<{
  name: string;
  entries: DictionaryEntryRecord[];
}> {
  const [language] = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM public.languages WHERE code = ${code} LIMIT 1
  `;
  if (!language) throw new Error(`No language with code ${code}.`);
  const words = await sql<{ id: string; word: string; word_type: string | null }[]>`
    SELECT id, word, word_type FROM public.words
    WHERE language_id = ${language.id}
    ORDER BY word, id
  `;
  const ids = words.map((word) => word.id);
  const [translations, definitions, examples] = await Promise.all([
    sql<{ word_id: string; translation: string }[]>`
      SELECT word_id, translation FROM public.translations
      WHERE word_id = ANY(${ids}::uuid[]) ORDER BY word_id, is_primary DESC NULLS LAST, created_at, id
    `,
    sql<{ word_id: string; definition: string }[]>`
      SELECT word_id, definition FROM public.definitions
      WHERE word_id = ANY(${ids}::uuid[]) ORDER BY word_id, definition_number NULLS LAST, id
    `,
    sql<{ word_id: string; example_text: string; translation: string | null }[]>`
      SELECT word_id, example_text, translation FROM public.usage_examples
      WHERE word_id = ANY(${ids}::uuid[]) ORDER BY word_id, created_at, id
    `,
  ]);
  const byWordId = <T extends { word_id: string }>(rows: readonly T[]) => {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
      const list = grouped.get(row.word_id) ?? [];
      list.push(row);
      grouped.set(row.word_id, list);
    }
    return grouped;
  };
  const translationsById = byWordId(translations);
  const definitionsById = byWordId(definitions);
  const examplesById = byWordId(examples);

  // Homographs (several rows with one headword) become one entry, matching
  // how the translator's dictionary loader merges senses.
  const merged = new Map<string, DictionaryEntryRecord & { types: Set<string> }>();
  for (const word of words) {
    const key = normalizeForm(word.word);
    if (!key) continue;
    const record = merged.get(key) ?? {
      word: word.word.trim(),
      wordType: null,
      glosses: [],
      examples: [],
      types: new Set<string>(),
    };
    if (word.word_type) record.types.add(word.word_type);
    for (const row of translationsById.get(word.id) ?? []) record.glosses.push(row.translation);
    for (const row of definitionsById.get(word.id) ?? []) record.glosses.push(row.definition);
    for (const row of examplesById.get(word.id) ?? []) {
      record.examples.push({ text: row.example_text, translation: row.translation });
    }
    merged.set(key, record);
  }
  return {
    name: language.name,
    entries: [...merged.values()].map(({ types, ...record }) => ({
      ...record,
      wordType: types.size > 0 ? [...types].join(', ') : null,
    })),
  };
}

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(dictionariesRoot, relativePath), 'utf8')) as T;
}

async function buildUnits(code: string): Promise<{ units: EvidenceUnit[]; summary: Record<string, unknown> }> {
  const { name, entries } = await loadDictionaryEntries(code);
  const units = buildDictionaryUnits(code, name, entries);
  const summary: Record<string, unknown> = {
    dictionaryEntries: entries.length,
    dictionaryExamples: units.filter((unit) => unit.kind === 'example').length,
  };

  const grammar = EVIDENCE_GRAMMAR_SOURCES[code];
  if (grammar) {
    const identity = { label: grammar.label, url: grammar.url };
    const forms = grammar.formsPath ? await readJson<GrammarFormRecord[]>(grammar.formsPath) : [];
    const knownStems = collectKnownStems(entries, forms);
    if (forms.length > 0) {
      const formUnits = buildGrammarFormUnits(identity, forms);
      units.push(...formUnits);
      summary.grammarForms = { path: grammar.formsPath, units: formUnits.length };
    }
    if (grammar.markdownPath) {
      const markdown = await readFile(path.join(dictionariesRoot, grammar.markdownPath), 'utf8');
      const passageUnits = buildGrammarMarkdownUnits(identity, markdown, knownStems, {
        pinnedHeadings: grammar.pinnedHeadings,
      });
      units.push(...passageUnits);
      summary.grammarPassages = { path: grammar.markdownPath, units: passageUnits.length };
    }
    if (grammar.digestPath) {
      const digest = await readJson<Record<string, unknown>>(grammar.digestPath);
      const digestUnits = buildGrammarDigestUnits(
        identity,
        digest,
        knownStems,
        grammar.digestSkipFields,
      );
      units.push(...digestUnits);
      summary.grammarDigest = { path: grammar.digestPath, units: digestUnits.length };
    }
  }

  const keys = new Set<string>();
  for (const unit of units) {
    if (keys.has(unit.key)) throw new Error(`Duplicate evidence unit key ${unit.key} for ${code}.`);
    keys.add(unit.key);
  }
  return { units, summary };
}

async function buildLanguage(code: string): Promise<void> {
  const { units, summary } = await buildUnits(code);
  const revision = evidenceIndexRevision(units, EVIDENCE_EMBEDDING_MODEL, EVIDENCE_EMBEDDING_DIMENSIONS);
  const existing = await sql<{ unit_key: string; content_sha256: string; embedding_model: string }[]>`
    SELECT unit_key, content_sha256, embedding_model
    FROM public.translation_evidence_units WHERE language_code = ${code}
  `;
  const current = new Map(existing.map((row) => [row.unit_key, row]));
  const changed = units.filter((unit) => {
    const row = current.get(unit.key);
    return !row || row.content_sha256 !== unit.contentSha256 || row.embedding_model !== EVIDENCE_EMBEDDING_MODEL;
  });
  const unitKeys = new Set(units.map((unit) => unit.key));
  const removed = existing.filter((row) => !unitKeys.has(row.unit_key));
  const approxTokens = Math.round(changed.reduce((total, unit) => total + unit.embedText.length, 0) / 4);
  console.log(
    `${code}: ${units.length} units (${JSON.stringify(summary)}); ${changed.length} to embed (~${approxTokens.toLocaleString()} tokens), ${removed.length} to remove; revision ${revision.slice(0, 12)}`,
  );
  if (dryRun) return;

  const vectors: (number[] | null)[] = [];
  for (let start = 0; start < changed.length; start += 256) {
    const batch = changed.slice(start, start + 256);
    vectors.push(...(await embedTexts(batch.map((unit) => unit.embedText))));
    console.log(`  embedded ${Math.min(start + 256, changed.length)}/${changed.length}`);
  }
  const missing = vectors.findIndex((vector) => !vector || vector.length !== EVIDENCE_EMBEDDING_DIMENSIONS);
  if (missing >= 0) throw new Error(`No usable embedding for ${changed[missing].key}.`);

  await sql.begin(async (tx) => {
    for (let index = 0; index < changed.length; index += 1) {
      const unit = changed[index];
      await tx`
        INSERT INTO public.translation_evidence_units
          (language_code, unit_key, kind, title, body, source_label, source_url,
           target_forms, pinned, content_sha256, embedding_model, embedding, updated_at)
        VALUES
          (${code}, ${unit.key}, ${unit.kind}, ${unit.title}, ${unit.body}, ${unit.sourceLabel},
           ${unit.sourceUrl}, ${unit.targetForms}::text[], ${unit.pinned}, ${unit.contentSha256},
           ${EVIDENCE_EMBEDDING_MODEL}, ${vectorLiteral(vectors[index]!)}::vector, CURRENT_TIMESTAMP)
        ON CONFLICT (language_code, unit_key) DO UPDATE SET
          kind = EXCLUDED.kind,
          title = EXCLUDED.title,
          body = EXCLUDED.body,
          source_label = EXCLUDED.source_label,
          source_url = EXCLUDED.source_url,
          target_forms = EXCLUDED.target_forms,
          pinned = EXCLUDED.pinned,
          content_sha256 = EXCLUDED.content_sha256,
          embedding_model = EXCLUDED.embedding_model,
          embedding = EXCLUDED.embedding,
          updated_at = CURRENT_TIMESTAMP
      `;
    }
    if (removed.length > 0) {
      await tx`
        DELETE FROM public.translation_evidence_units
        WHERE language_code = ${code}
          AND unit_key = ANY(${removed.map((row) => row.unit_key)}::text[])
      `;
    }
    const [{ count }] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM public.translation_evidence_units WHERE language_code = ${code}
    `;
    if (count !== units.length) {
      throw new Error(`Index for ${code} has ${count} rows after the build, expected ${units.length}.`);
    }
    await tx`
      INSERT INTO public.translation_evidence_index_state
        (language_code, revision, unit_count, embedding_model, dimensions, source_summary, built_at)
      VALUES
        (${code}, ${revision}, ${units.length}, ${EVIDENCE_EMBEDDING_MODEL},
         ${EVIDENCE_EMBEDDING_DIMENSIONS}, ${sql.json(summary as postgres.JSONValue)}, CURRENT_TIMESTAMP)
      ON CONFLICT (language_code) DO UPDATE SET
        revision = EXCLUDED.revision,
        unit_count = EXCLUDED.unit_count,
        embedding_model = EXCLUDED.embedding_model,
        dimensions = EXCLUDED.dimensions,
        source_summary = EXCLUDED.source_summary,
        built_at = EXCLUDED.built_at
    `;
  });
  console.log(`  ${code}: index revision ${revision.slice(0, 12)} written (${units.length} units).`);
}

async function main() {
  for (const code of languages) await buildLanguage(code);
}

main()
  .catch((error) => {
    console.error('Evidence index build failed:', error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
