import { createHash } from 'node:crypto';
import { formLookupKeys, normalizeForm, segmentForm, surfaceTokens } from './forms';

/**
 * Evidence units are the retrievable pieces of a language's written record:
 * dictionary entries, their example sentences, grammar passages, and
 * word forms documented in a grammar. The builder turns source files and
 * dictionary rows into units; the index stores them with an embedding.
 */

export type EvidenceUnitKind =
  | 'dictionary'
  | 'example'
  | 'grammar'
  | 'grammar_form';

export interface EvidenceUnit {
  key: string;
  kind: EvidenceUnitKind;
  title: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
  /** Normalised written forms (and their lookup keys) found in this unit. */
  targetForms: string[];
  /** The text that is embedded for meaning-based search. */
  embedText: string;
  /** Always offered to the checker when any grammar is offered. */
  pinned: boolean;
  contentSha256: string;
}

type UnitInput = Omit<EvidenceUnit, 'contentSha256' | 'pinned'> & {
  pinned?: boolean;
};

const MAX_EMBED_CHARS = 6000;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function finishUnit(input: UnitInput): EvidenceUnit {
  const targetForms = [...new Set(input.targetForms)].sort();
  const embedText = input.embedText.slice(0, MAX_EMBED_CHARS);
  const pinned = input.pinned ?? false;
  return {
    ...input,
    targetForms,
    embedText,
    pinned,
    contentSha256: sha256(
      JSON.stringify([
        input.kind,
        input.title,
        input.body,
        input.sourceLabel,
        input.sourceUrl,
        targetForms,
        embedText,
        pinned,
      ]),
    ),
  };
}

function lookupKeysFor(forms: Iterable<string>): string[] {
  const keys = new Set<string>();
  for (const form of forms) {
    for (const key of formLookupKeys(form)) keys.add(key);
  }
  return [...keys];
}

// ---------------------------------------------------------------------------
// Dictionary entries and their example sentences
// ---------------------------------------------------------------------------

export interface DictionaryEntryRecord {
  word: string;
  wordType: string | null;
  glosses: string[];
  examples: { text: string; translation: string | null }[];
}

export function dictionaryWordUrl(dictionaryCode: string, word: string): string {
  return `https://mobtranslate.com/dictionaries/${encodeURIComponent(dictionaryCode)}/words/${encodeURIComponent(word)}`;
}

export function buildDictionaryUnits(
  dictionaryCode: string,
  dictionaryName: string,
  entries: readonly DictionaryEntryRecord[],
): EvidenceUnit[] {
  const units: EvidenceUnit[] = [];
  const seenExamples = new Set<string>();
  for (const entry of entries) {
    const word = entry.word.trim();
    const headword = normalizeForm(word);
    if (!headword) continue;
    const glosses = [...new Set(entry.glosses.map((gloss) => gloss.trim()).filter(Boolean))];
    if (glosses.length === 0) continue;
    const url = dictionaryWordUrl(dictionaryCode, word);
    const typeLabel = entry.wordType ? ` (${entry.wordType})` : '';
    const body = `${glosses.join('; ')}${typeLabel}`;
    units.push(
      finishUnit({
        key: `dictionary:${headword}`,
        kind: 'dictionary',
        title: word,
        body,
        sourceLabel: `${dictionaryName} dictionary entry`,
        sourceUrl: url,
        targetForms: lookupKeysFor(surfaceTokens(word)),
        embedText: `${word}: ${body}`,
      }),
    );

    for (const example of entry.examples) {
      const text = example.text.trim();
      if (!text) continue;
      const translation = example.translation?.trim() || '';
      const exampleKey = sha256(`${normalizeForm(text)}\u0000${translation}`).slice(0, 24);
      if (seenExamples.has(exampleKey)) continue;
      seenExamples.add(exampleKey);
      units.push(
        finishUnit({
          key: `example:${exampleKey}`,
          kind: 'example',
          title: text,
          body: translation || '(no English translation recorded)',
          sourceLabel: `Example sentence in the ${dictionaryName} dictionary entry for ${word}`,
          sourceUrl: url,
          targetForms: lookupKeysFor(surfaceTokens(text)),
          embedText: translation ? `${translation}\n${text}` : text,
        }),
      );
    }
  }
  return units;
}

// ---------------------------------------------------------------------------
// Word forms documented in a grammar (e.g. lexemes extracted from Patz)
// ---------------------------------------------------------------------------

export interface GrammarFormRecord {
  root: string;
  gloss: string;
  pos?: string | null;
  surface?: string | null;
  source?: string | null;
}

export interface GrammarSourceIdentity {
  label: string;
  url: string;
}

export function buildGrammarFormUnits(
  grammar: GrammarSourceIdentity,
  records: readonly GrammarFormRecord[],
): EvidenceUnit[] {
  const units = new Map<string, EvidenceUnit>();
  for (const record of records) {
    const root = record.root?.trim();
    const gloss = record.gloss?.trim();
    if (!root || !gloss) continue;
    const surface = record.surface?.trim() || null;
    const title = surface && normalizeForm(surface) !== normalizeForm(root) ? `${surface} (root ${root})` : root;
    const pos = record.pos?.trim();
    const body = `${gloss}${pos ? ` (${pos})` : ''}`;
    const where = record.source?.trim();
    const key = `grammar_form:${sha256(`${normalizeForm(root)}\u0000${normalizeForm(surface ?? '')}\u0000${gloss}\u0000${where ?? ''}`).slice(0, 24)}`;
    if (units.has(key)) continue;
    units.set(
      key,
      finishUnit({
        key,
        kind: 'grammar_form',
        title,
        body,
        sourceLabel: where ? `${grammar.label}, ${where}` : grammar.label,
        sourceUrl: grammar.url,
        targetForms: lookupKeysFor([root, ...(surface ? surfaceTokens(surface) : [])]),
        embedText: `${title}: ${body}`,
      }),
    );
  }
  return [...units.values()];
}

// ---------------------------------------------------------------------------
// Structured grammar digests (JSON objects of rules, inflections, cases, …)
// ---------------------------------------------------------------------------

function flattenToText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(flattenToText).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => {
        const text = flattenToText(child);
        return text ? `${key}: ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function firstStringField(value: Record<string, unknown>): string | null {
  for (const child of Object.values(value)) {
    if (typeof child === 'string' && child.trim()) return child.trim();
  }
  return null;
}

/**
 * Each leaf list item or text field of a grammar digest becomes one unit, so
 * a single inflection or case can be retrieved without the whole digest.
 */
export function buildGrammarDigestUnits(
  grammar: GrammarSourceIdentity,
  digest: Record<string, unknown>,
  knownStems: ReadonlySet<string>,
  skipFields: readonly string[] = [],
): EvidenceUnit[] {
  const units: EvidenceUnit[] = [];
  const skipped = new Set(skipFields);
  for (const [area, fields] of Object.entries(digest)) {
    if (!fields || typeof fields !== 'object') continue;
    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      if (skipped.has(field)) continue;
      const items = Array.isArray(value) ? value : [value];
      items.forEach((item, index) => {
        const text = flattenToText(item).trim();
        if (!text) return;
        const label =
          item && typeof item === 'object' && !Array.isArray(item)
            ? firstStringField(item as Record<string, unknown>)
            : null;
        const heading = `${area} · ${field.replace(/_/g, ' ')}`;
        const title = label && label.length <= 80 ? `${heading}: ${label}` : heading;
        units.push(
          finishUnit({
            key: `grammar:digest:${area}:${field}:${index}`,
            kind: 'grammar',
            title,
            body: text,
            sourceLabel: `${grammar.label} (structured summary: ${heading})`,
            sourceUrl: grammar.url,
            targetForms: grammarTargetForms(text, knownStems),
            embedText: `${title}\n${text}`,
          }),
        );
      });
    }
  }
  return units;
}

// ---------------------------------------------------------------------------
// Grammar prose (OCR markdown of a reference grammar)
// ---------------------------------------------------------------------------

export interface GrammarMarkdownOptions {
  /** Headings (exact text) whose section is always offered alongside grammar. */
  pinnedHeadings?: readonly string[];
  maxChunkChars?: number;
  maxBlockChars?: number;
}

interface GrammarSection {
  number: string | null;
  title: string;
  pinned: boolean;
  level: number;
  lines: string[];
}

// OCR sometimes reads a section digit 8 as "B" ("3.B.3"); those are repaired
// when the number is normalised.
const SECTION_HEADING = /^(\d+(?:\s*\.\s*[\dB]+)*)\.?\s+([\p{L}'‘(].*)$/u;
const PAGE_HEADER = /^[\d ]+\s+Chapter\s+\d+$|^Chapter\s+\d+\s+[\d ]+$/i;

function normalizeSectionNumber(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/B/g, '8');
}
const IMAGE_LINE = /^!\[[^\]]*\]\([^)]*\)\s*$/;

/**
 * Forms worth indexing in grammar text: segmented forms (interlinear
 * examples use hyphens at morpheme boundaries) and words that begin with a
 * stem recorded for the language. Plain English words are left out so a
 * draft word is only matched against the language's own forms.
 */
export function grammarTargetForms(text: string, knownStems: ReadonlySet<string>): string[] {
  const keys = new Set<string>();
  for (const token of surfaceTokens(text)) {
    if (/\d/.test(token)) continue;
    const segmented = segmentForm(token);
    let known = segmented.suffixes.length > 0 && segmented.stem.length >= 2;
    if (!known) {
      for (let length = Math.min(segmented.joined.length, 24); length >= 3; length -= 1) {
        if (knownStems.has(segmented.joined.slice(0, length))) {
          known = true;
          break;
        }
      }
    }
    if (!known) continue;
    for (const key of formLookupKeys(token)) keys.add(key);
  }
  return [...keys];
}

function parseGrammarSections(
  markdown: string,
  pinnedHeadings: ReadonlySet<string>,
): GrammarSection[] {
  const sections: GrammarSection[] = [];
  let current: GrammarSection | null = null;
  let seenNumberedSection = false;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      if (PAGE_HEADER.test(text)) continue;
      // Both "3.5.1 Personal pronouns" and a chapter title such as
      // "3 Morphology" open a new section.
      const numbered = SECTION_HEADING.exec(text);
      if (numbered) {
        seenNumberedSection = true;
        current = {
          number: normalizeSectionNumber(numbered[1]),
          title: numbered[2].trim(),
          pinned: false,
          level,
          lines: [],
        };
        sections.push(current);
        continue;
      }
      if (pinnedHeadings.has(text)) {
        current = { number: null, title: text, pinned: true, level, lines: [] };
        sections.push(current);
        continue;
      }
      if (!seenNumberedSection && current?.pinned && level <= current.level) {
        // A sibling or parent heading ends a pinned front-matter section.
        current = null;
        continue;
      }
      if (current) current.lines.push(`**${text}**`);
      continue;
    }
    if (!current) continue;
    // Front matter (contents, lists of tables) is skipped until the first
    // numbered section, except for headings the source config pins.
    if (!seenNumberedSection && !current.pinned) continue;
    if (PAGE_HEADER.test(line.trim()) || IMAGE_LINE.test(line.trim())) continue;
    current.lines.push(line);
  }
  return sections;
}

function splitBlocks(lines: readonly string[]): string[] {
  const blocks: string[] = [];
  let buffer: string[] = [];
  let inTable = false;
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push(text);
    buffer = [];
  };
  for (const line of lines) {
    const isTableLine = line.trimStart().startsWith('|');
    if (!line.trim()) {
      if (!inTable) flush();
      continue;
    }
    if (isTableLine !== inTable && buffer.length > 0) flush();
    inTable = isTableLine;
    buffer.push(line);
  }
  flush();
  return blocks;
}

function splitOversizedBlock(block: string, maxChars: number): string[] {
  if (block.length <= maxChars) return [block];
  const pieces: string[] = [];
  let buffer = '';
  for (const line of block.split('\n')) {
    if (buffer && buffer.length + line.length + 1 > maxChars) {
      pieces.push(buffer);
      buffer = '';
    }
    buffer = buffer ? `${buffer}\n${line}` : line;
    while (buffer.length > maxChars) {
      pieces.push(buffer.slice(0, maxChars));
      buffer = buffer.slice(maxChars);
    }
  }
  if (buffer) pieces.push(buffer);
  return pieces;
}

export function buildGrammarMarkdownUnits(
  grammar: GrammarSourceIdentity,
  markdown: string,
  knownStems: ReadonlySet<string>,
  options: GrammarMarkdownOptions = {},
): EvidenceUnit[] {
  const maxChunkChars = options.maxChunkChars ?? 1600;
  const maxBlockChars = options.maxBlockChars ?? 4000;
  const sections = parseGrammarSections(
    markdown,
    new Set(options.pinnedHeadings ?? []),
  );
  const units: EvidenceUnit[] = [];
  const keyCounts = new Map<string, number>();

  for (const section of sections) {
    const blocks = splitBlocks(section.lines).flatMap((block) =>
      splitOversizedBlock(block, maxBlockChars),
    );
    const chunks: string[] = [];
    let buffer = '';
    for (const block of blocks) {
      if (buffer && buffer.length + block.length + 2 > maxChunkChars) {
        chunks.push(buffer);
        buffer = '';
      }
      buffer = buffer ? `${buffer}\n\n${block}` : block;
    }
    if (buffer) chunks.push(buffer);

    const sectionLabel = section.number ? `§${section.number} ${section.title}` : section.title;
    const baseKey = `grammar:${section.number ?? normalizeForm(section.title).replace(/\s+/g, '-')}`;
    chunks.forEach((chunk, index) => {
      const part = chunks.length > 1 ? ` (part ${index + 1} of ${chunks.length})` : '';
      const title = `${sectionLabel}${part}`;
      const seen = keyCounts.get(baseKey) ?? 0;
      keyCounts.set(baseKey, seen + 1);
      units.push(
        finishUnit({
          key: `${baseKey}:${seen}`,
          kind: 'grammar',
          title,
          body: chunk,
          sourceLabel: section.number
            ? `${grammar.label}, §${section.number}`
            : `${grammar.label}, ${section.title}`,
          sourceUrl: grammar.url,
          targetForms: grammarTargetForms(chunk, knownStems),
          embedText: `${title}\n${chunk}`,
          pinned: section.pinned,
        }),
      );
    });
  }
  return units;
}

/** Stems every grammar form is checked against: headwords and grammar roots. */
export function collectKnownStems(
  entries: readonly DictionaryEntryRecord[],
  grammarForms: readonly GrammarFormRecord[] = [],
): Set<string> {
  const stems = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    for (const token of surfaceTokens(value)) {
      const joined = segmentForm(token).joined;
      if (joined.length >= 3) stems.add(joined);
      const stem = segmentForm(token).stem;
      if (stem.length >= 3) stems.add(stem);
    }
  };
  for (const entry of entries) add(entry.word);
  for (const record of grammarForms) {
    add(record.root);
    add(record.surface);
  }
  return stems;
}

/** A stable fingerprint of a whole index build. */
export function evidenceIndexRevision(
  units: readonly EvidenceUnit[],
  embeddingModel: string,
  dimensions: number,
): string {
  const hash = createHash('sha256');
  hash.update(`${embeddingModel}:${dimensions}\n`);
  for (const unit of [...units].sort((a, b) => a.key.localeCompare(b.key))) {
    hash.update(`${unit.key}\u0000${unit.contentSha256}\n`);
  }
  return hash.digest('hex');
}
