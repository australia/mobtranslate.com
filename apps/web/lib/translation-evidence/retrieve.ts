import { longestKnownPrefix, normalizeForm, segmentForm, surfaceTokens } from './forms';
import type { EvidenceUnitKind } from './units';

/**
 * Pure assembly of the evidence a translation checker sees. Two kinds of
 * search feed it:
 *
 *  - meaning search (embeddings) from the English source and each idea in
 *    it, so "speak" can find a verb whose dictionary gloss says "tell";
 *  - written-form lookup for every word of the draft, so an inflected form
 *    that is not a headword is still tied to the grammar table, grammar
 *    example or dictionary sentence that documents it.
 *
 * Form lookup comes first and is never crowded out by meaning search.
 */

export interface IndexedEvidenceUnit {
  key: string;
  kind: EvidenceUnitKind;
  title: string;
  body: string;
  sourceLabel: string;
  sourceUrl: string;
  targetForms: string[];
  pinned: boolean;
}

export interface SemanticHit {
  queryIndex: number;
  unitKey: string;
  similarity: number;
}

export interface EvidenceQuery {
  text: string;
  /** 'source' is the whole sentence; 'idea' is one idea the analysis found. */
  origin: 'source' | 'idea';
}

export type EvidenceItemKind = 'dictionary' | 'example' | 'grammar';

export interface PackedEvidence {
  id: string;
  kind: EvidenceItemKind;
  title: string;
  detail: string;
  sourceLabel: string;
  sourceUrl: string;
  unitKey: string;
  unitKind: EvidenceUnitKind;
  matchedIdeas: string[];
  matchedWords: string[];
}

export type WordRecordStatus =
  /** The exact form is a dictionary headword. */
  | 'recorded'
  /** The exact form appears in a grammar table, grammar example or dictionary sentence. */
  | 'documented_form'
  /** Only the stem is recorded; the ending is not attested on this stem. */
  | 'stem_known'
  | 'not_found';

export interface WordEvidence {
  form: string;
  status: WordRecordStatus;
  stem: string | null;
  ending: string | null;
  evidenceIds: string[];
}

export interface EvidencePack {
  items: PackedEvidence[];
  /** Always-offered notes on how to read grammar examples (abbreviations). */
  guide: PackedEvidence[];
  words: WordEvidence[];
}

export interface FormIndex {
  byForm: Map<string, string[]>;
  /** Hyphen-free forms of every headword and grammar-documented form. */
  stems: Set<string>;
}

export function buildFormIndex(units: Iterable<IndexedEvidenceUnit>): FormIndex {
  const byForm = new Map<string, string[]>();
  const stems = new Set<string>();
  for (const unit of units) {
    for (const form of unit.targetForms) {
      const keys = byForm.get(form);
      if (keys) keys.push(unit.key);
      else byForm.set(form, [unit.key]);
    }
    if (unit.kind === 'dictionary' || unit.kind === 'grammar_form') {
      for (const form of unit.targetForms) {
        if (!form.startsWith('-') && form.length >= 3) stems.add(segmentForm(form).joined);
      }
    }
  }
  return { byForm, stems };
}

export interface EvidenceLimits {
  /** Per looked-up word, per unit kind. */
  perWordPerKind: number;
  /** Items of each kind that meaning search and English-word match may add. */
  perKind: Record<EvidenceUnitKind, number>;
  /** Hard ceiling of each kind, including records of the draft's own words. */
  ceilingPerKind: Record<EvidenceUnitKind, number>;
  /** Longest grammar passage text offered; longer passages are excerpted. */
  passageChars: number;
}

export const DEFAULT_EVIDENCE_LIMITS: EvidenceLimits = {
  perWordPerKind: 2,
  perKind: { dictionary: 16, grammar_form: 8, example: 8, grammar: 5 },
  ceilingPerKind: { dictionary: 28, grammar_form: 16, example: 12, grammar: 8 },
  passageChars: 1400,
};

/**
 * The part of a long passage that matters: a window around the first
 * occurrence of a looked-up form, keeping the header of a table the window
 * starts inside so its columns can still be read.
 */
export function excerptFor(body: string, forms: readonly string[], maxChars: number): string {
  if (body.length <= maxChars) return body;
  const lower = body.toLocaleLowerCase();
  let at = -1;
  for (const form of forms) {
    const index = form ? lower.indexOf(form.toLocaleLowerCase()) : -1;
    if (index >= 0 && (at < 0 || index < at)) at = index;
  }
  if (at < 0) return `${body.slice(0, maxChars).replace(/\s+\S*$/, '')} …`;

  // Begin about a third of the window before the match, moved forward to the
  // next line start (or word start) so no line or word is cut in half.
  let start = Math.max(0, at - Math.floor(maxChars / 3));
  if (start > 0) {
    const nextLine = body.indexOf('\n', start - 1);
    if (nextLine >= 0 && nextLine < at) start = nextLine + 1;
    else {
      const nextSpace = body.indexOf(' ', start);
      if (nextSpace >= 0 && nextSpace < at) start = nextSpace + 1;
    }
  }
  let end = Math.min(body.length, start + maxChars);
  const lineEnd = body.indexOf('\n', end);
  if (lineEnd >= 0 && lineEnd - end < 200) end = lineEnd;
  let excerpt = body.slice(start, end);

  if (start > 0 && excerpt.trimStart().startsWith('|')) {
    const before = body.slice(0, start).replace(/\n$/, '').split('\n');
    let first = before.length;
    while (first > 0 && before[first - 1].trimStart().startsWith('|')) first -= 1;
    const header = before.slice(first, first + 2);
    if (header.length > 0 && first < before.length) {
      excerpt = `${header.join('\n')}\n${excerpt}`;
    }
  }
  return `${start > 0 ? '… ' : ''}${excerpt}${end < body.length ? ' …' : ''}`;
}

const KIND_ORDER: EvidenceUnitKind[] = ['dictionary', 'grammar_form', 'example', 'grammar'];

interface Candidate {
  unit: IndexedEvidenceUnit;
  ideas: Set<string>;
  words: Set<string>;
}

function unitsFor(
  keys: readonly string[] | undefined,
  units: ReadonlyMap<string, IndexedEvidenceUnit>,
): IndexedEvidenceUnit[] {
  if (!keys) return [];
  return keys.map((key) => units.get(key)).filter((unit): unit is IndexedEvidenceUnit => Boolean(unit));
}

/**
 * Rank the units that contain a form: units containing more of the other
 * looked-up words first (a paradigm table or example that shows several
 * words together is the most informative), then by key for stability.
 */
function rankByCooccurrence(
  candidates: IndexedEvidenceUnit[],
  allForms: ReadonlySet<string>,
): IndexedEvidenceUnit[] {
  const score = (unit: IndexedEvidenceUnit) =>
    unit.targetForms.reduce((count, form) => count + (allForms.has(form) ? 1 : 0), 0);
  return [...candidates].sort(
    (left, right) => score(right) - score(left) || left.key.localeCompare(right.key),
  );
}

function takePerKind(
  candidates: IndexedEvidenceUnit[],
  perKind: number,
  kinds: readonly EvidenceUnitKind[] = KIND_ORDER,
): IndexedEvidenceUnit[] {
  const picked: IndexedEvidenceUnit[] = [];
  for (const kind of kinds) {
    picked.push(...candidates.filter((unit) => unit.kind === kind && !unit.pinned).slice(0, perKind));
  }
  return picked;
}

interface WordLookup {
  form: string;
  status: WordRecordStatus;
  stem: string | null;
  ending: string | null;
  unitKeys: string[];
}

/** Look up every written word of a text against the index's forms. */
export function lookupWords(
  text: string,
  units: ReadonlyMap<string, IndexedEvidenceUnit>,
  formIndex: FormIndex,
  perWordPerKind = DEFAULT_EVIDENCE_LIMITS.perWordPerKind,
): WordLookup[] {
  const forms = surfaceTokens(text);
  const allForms = new Set(forms.flatMap((form) => [form, segmentForm(form).joined]));
  return forms.map((form) => {
    const segmented = segmentForm(form);
    const exact = unitsFor(
      [...new Set([...(formIndex.byForm.get(form) ?? []), ...(formIndex.byForm.get(segmented.joined) ?? [])])],
      units,
    );
    if (exact.length > 0) {
      const ranked = rankByCooccurrence(exact, allForms);
      const recorded = ranked.some(
        (unit) => unit.kind === 'dictionary' && normalizeForm(unit.title) === form,
      );
      return {
        form,
        status: recorded ? 'recorded' : 'documented_form',
        stem: null,
        ending: null,
        unitKeys: takePerKind(ranked, perWordPerKind).map((unit) => unit.key),
      };
    }

    // Not attested as a whole: tie it to its stem and look for grammar that
    // documents the ending.
    let stem: string | null = null;
    let endings: string[] = [];
    if (segmented.suffixes.length > 0 && formIndex.stems.has(segmented.stem)) {
      stem = segmented.stem;
      endings = segmented.suffixes;
    } else {
      const prefix = longestKnownPrefix(form, formIndex.stems);
      if (prefix) {
        stem = prefix.stem;
        endings = prefix.remainder ? [`-${prefix.remainder}`] : [];
      }
    }
    if (!stem) {
      return { form, status: 'not_found', stem: null, ending: null, unitKeys: [] };
    }
    const stemUnits = takePerKind(
      rankByCooccurrence(unitsFor(formIndex.byForm.get(stem), units), allForms),
      perWordPerKind,
      ['dictionary', 'grammar_form'],
    );
    const endingUnits = endings.flatMap((ending) =>
      takePerKind(
        rankByCooccurrence(unitsFor(formIndex.byForm.get(ending), units), new Set([...allForms, stem!])),
        perWordPerKind,
        ['grammar', 'grammar_form', 'example'],
      ),
    );
    return {
      form,
      status: 'stem_known',
      stem,
      ending: endings.join('') || null,
      unitKeys: [...new Set([...stemUnits, ...endingUnits].map((unit) => unit.key))],
    };
  });
}

export interface AssembleEvidenceInput {
  units: ReadonlyMap<string, IndexedEvidenceUnit>;
  formIndex: FormIndex;
  /** The text whose words are looked up by form (the draft). */
  lookupText: string;
  queries: readonly EvidenceQuery[];
  semanticHits: readonly SemanticHit[];
  /** Dictionary unit keys found by English-word match, best first. */
  lexicalKeys?: readonly string[];
  limits?: EvidenceLimits;
}

const ID_PREFIX: Record<EvidenceUnitKind, string> = {
  dictionary: 'dictionary',
  example: 'example',
  grammar: 'grammar',
  grammar_form: 'form',
};

const ITEM_KIND: Record<EvidenceUnitKind, EvidenceItemKind> = {
  dictionary: 'dictionary',
  example: 'example',
  grammar: 'grammar',
  grammar_form: 'grammar',
};

export function assembleEvidencePack(input: AssembleEvidenceInput): EvidencePack {
  const limits = input.limits ?? DEFAULT_EVIDENCE_LIMITS;
  const candidates = new Map<string, Candidate>();
  const zero = (): Record<EvidenceUnitKind, number> => ({
    dictionary: 0,
    grammar_form: 0,
    example: 0,
    grammar: 0,
  });
  // Word records count against the hard ceiling only; meaning search and
  // English-word matches have their own allowance on top of them.
  const totalCounts = zero();
  const searchCounts = zero();
  const add = (
    unit: IndexedEvidenceUnit,
    reason: { idea?: string; word?: string },
    force = false,
  ): boolean => {
    const existing = candidates.get(unit.key);
    if (existing) {
      if (reason.idea) existing.ideas.add(reason.idea);
      if (reason.word) existing.words.add(reason.word);
      return true;
    }
    if (totalCounts[unit.kind] >= limits.ceilingPerKind[unit.kind]) return false;
    if (!force && searchCounts[unit.kind] >= limits.perKind[unit.kind]) return false;
    totalCounts[unit.kind] += 1;
    if (!force) searchCounts[unit.kind] += 1;
    candidates.set(unit.key, {
      unit,
      ideas: new Set(reason.idea ? [reason.idea] : []),
      words: new Set(reason.word ? [reason.word] : []),
    });
    return true;
  };

  // 1. Every draft word's own record. These go in first, so meaning search
  //    can never crowd them out.
  const lookups = lookupWords(
    input.lookupText,
    input.units,
    input.formIndex,
    limits.perWordPerKind,
  );
  for (const lookup of lookups) {
    for (const unit of unitsFor(lookup.unitKeys, input.units)) {
      add(unit, { word: lookup.form }, true);
    }
  }

  // 2. Meaning search, round-robin by rank so every idea gets its best hits
  //    before any idea gets its second.
  const hitsByKind = new Map<EvidenceUnitKind, { hit: SemanticHit; rank: number }[]>();
  const rankCounter = new Map<string, number>();
  const ordered = [...input.semanticHits].sort(
    (left, right) => left.queryIndex - right.queryIndex || right.similarity - left.similarity,
  );
  for (const hit of ordered) {
    const unit = input.units.get(hit.unitKey);
    if (!unit || unit.pinned) continue;
    const counterKey = `${hit.queryIndex}:${unit.kind}`;
    const rank = rankCounter.get(counterKey) ?? 0;
    rankCounter.set(counterKey, rank + 1);
    const list = hitsByKind.get(unit.kind) ?? [];
    list.push({ hit, rank });
    hitsByKind.set(unit.kind, list);
  }
  for (const kind of KIND_ORDER) {
    const list = (hitsByKind.get(kind) ?? []).sort(
      (left, right) => left.rank - right.rank || right.hit.similarity - left.hit.similarity,
    );
    for (const { hit } of list) {
      const unit = input.units.get(hit.unitKey)!;
      const query = input.queries[hit.queryIndex];
      add(unit, { idea: query?.text });
    }
  }

  // 3. English-word dictionary matches fill any remaining dictionary room.
  for (const key of input.lexicalKeys ?? []) {
    const unit = input.units.get(key);
    if (unit) add(unit, {});
  }

  const nextId = new Map<string, number>();
  const idFor = (kind: EvidenceUnitKind, pinned = false) => {
    const prefix = pinned ? 'guide' : ID_PREFIX[kind];
    const next = (nextId.get(prefix) ?? 0) + 1;
    nextId.set(prefix, next);
    return `${prefix}-${next}`;
  };
  const toItem = (candidate: Candidate, pinned = false): PackedEvidence => ({
    id: idFor(candidate.unit.kind, pinned),
    kind: ITEM_KIND[candidate.unit.kind],
    title: candidate.unit.title,
    detail:
      candidate.unit.kind === 'grammar' && !pinned
        ? excerptFor(
            candidate.unit.body,
            [...candidate.words].flatMap((word) => [word, segmentForm(word).joined]),
            limits.passageChars,
          )
        : candidate.unit.body,
    sourceLabel: candidate.unit.sourceLabel,
    sourceUrl: candidate.unit.sourceUrl,
    unitKey: candidate.unit.key,
    unitKind: candidate.unit.kind,
    matchedIdeas: [...candidate.ideas],
    matchedWords: [...candidate.words],
  });

  const items: PackedEvidence[] = [];
  for (const kind of KIND_ORDER) {
    for (const candidate of candidates.values()) {
      if (candidate.unit.kind === kind) items.push(toItem(candidate));
    }
  }
  const itemByKey = new Map(items.map((item) => [item.unitKey, item]));

  const usesGrammar = items.some((item) => item.unitKind === 'grammar' || item.unitKind === 'grammar_form');
  const guide = usesGrammar
    ? [...input.units.values()]
        .filter((unit) => unit.pinned)
        .sort((left, right) => left.key.localeCompare(right.key))
        .map((unit) => toItem({ unit, ideas: new Set(), words: new Set() }, true))
    : [];

  return {
    items,
    guide,
    words: lookups.map((lookup) => ({
      form: lookup.form,
      status: lookup.status,
      stem: lookup.stem,
      ending: lookup.ending,
      evidenceIds: lookup.unitKeys
        .map((key) => itemByKey.get(key)?.id)
        .filter((id): id is string => Boolean(id)),
    })),
  };
}
