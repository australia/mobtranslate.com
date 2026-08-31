import { createHash } from 'node:crypto';

export type ParallelCandidate = {
  id: string;
  pair_kind: 'sentence_candidate' | 'verse' | 'verse_range';
  canonical_ref: string;
  source_text: string;
  target_text: string;
  alignment_confidence: string;
  alignment_status: string;
  rights_status: string;
};

export type NaturalBenchmark = {
  benchmark_id: string;
  input_english: string;
  expected_anindilyakwa: string;
};

export type LexicalBenchmark = {
  benchmark_id: string;
  prompt_english_glosses: string[];
  expected_anindilyakwa: string;
};

export type TrainingPair = {
  schema_version: 1;
  pair_id: string;
  source_language: 'eng';
  target_language: 'aoi';
  source_text: string;
  target_text: string;
  pair_kind: 'sentence_candidate' | 'verse';
  canonical_ref: string;
  base_ref: string;
  chapter_group: string;
  partition: 'train' | 'development';
  alignment_confidence: number;
  alignment_status: string;
  provenance: 'ebible_owner_attested_permission';
  permission_evidence_class: 'operator_attestation_without_documentary_exhibition';
  benchmark_overlap: false;
};

export type CorpusSelection = {
  pairs: TrainingPair[];
  exclusions: Array<{
    source_id: string;
    canonical_ref: string;
    reason:
      | 'verse_shadowed_by_sentence_candidates'
      | 'verse_range_derived_overlap'
      | 'empty_or_invalid'
      | 'normalized_duplicate_pair'
      | 'exact_benchmark_pair';
  }>;
  counts: {
    sentence_candidates_input: number;
    verses_input: number;
    verse_ranges_input: number;
    verses_shadowed_by_sentence_candidates: number;
    empty_or_invalid_rejected: number;
    duplicate_pairs_rejected: number;
    benchmark_overlap_rejected: number;
    selected: number;
    train: number;
    development: number;
    chapter_groups: number;
    train_chapter_groups: number;
    development_chapter_groups: number;
  };
};

export function normalizeComparable(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function baseReference(canonicalRef: string): string {
  return canonicalRef.split('#', 1)[0] ?? canonicalRef;
}

export function chapterGroup(canonicalRef: string): string {
  const [book = '', chapter = ''] = baseReference(canonicalRef).split('.');
  return `${book}.${chapter}`;
}

export function partitionForChapter(group: string): 'train' | 'development' {
  const bucket =
    Number.parseInt(
      createHash('sha256')
        .update(`anindilyakwa-owner-attested-v0.3.0:${group}`)
        .digest('hex')
        .slice(0, 8),
      16,
    ) % 10;
  return bucket === 0 ? 'development' : 'train';
}

function benchmarkPairs(
  natural: NaturalBenchmark[],
  lexical: LexicalBenchmark[],
): Set<string> {
  const keys = new Set<string>();
  for (const row of natural) {
    keys.add(
      `${normalizeComparable(row.input_english)}\u0000${normalizeComparable(row.expected_anindilyakwa)}`,
    );
  }
  for (const row of lexical) {
    for (const gloss of row.prompt_english_glosses) {
      keys.add(
        `${normalizeComparable(gloss)}\u0000${normalizeComparable(row.expected_anindilyakwa)}`,
      );
    }
  }
  return keys;
}

export function selectAnindilyakwaTrainingCorpus(input: {
  sentenceCandidates: ParallelCandidate[];
  verses: ParallelCandidate[];
  verseRanges: ParallelCandidate[];
  naturalBenchmarks: NaturalBenchmark[];
  lexicalBenchmarks: LexicalBenchmark[];
}): CorpusSelection {
  const candidateBaseRefs = new Set(
    input.sentenceCandidates.map((row) => baseReference(row.canonical_ref)),
  );
  const shadowedVerses = input.verses.filter((row) =>
    candidateBaseRefs.has(baseReference(row.canonical_ref)),
  );
  const sourceRows = [
    ...input.sentenceCandidates,
    ...input.verses.filter(
      (row) => !candidateBaseRefs.has(baseReference(row.canonical_ref)),
    ),
  ].sort((left, right) => {
    const reference = left.canonical_ref.localeCompare(right.canonical_ref);
    if (reference !== 0) return reference;
    return left.id.localeCompare(right.id);
  });

  const reservedPairs = benchmarkPairs(
    input.naturalBenchmarks,
    input.lexicalBenchmarks,
  );
  const seenPairs = new Set<string>();
  const pairs: TrainingPair[] = [];
  const exclusions: CorpusSelection['exclusions'] = [
    ...shadowedVerses.map((row) => ({
      source_id: row.id,
      canonical_ref: row.canonical_ref,
      reason: 'verse_shadowed_by_sentence_candidates' as const,
    })),
    ...input.verseRanges.map((row) => ({
      source_id: row.id,
      canonical_ref: row.canonical_ref,
      reason: 'verse_range_derived_overlap' as const,
    })),
  ];
  let emptyOrInvalidRejected = 0;
  let duplicatePairsRejected = 0;
  let benchmarkOverlapRejected = 0;

  for (const row of sourceRows) {
    const english = row.target_text.trim();
    const anindilyakwa = row.source_text.trim();
    const normalizedEnglish = normalizeComparable(english);
    const normalizedAnindilyakwa = normalizeComparable(anindilyakwa);
    if (
      !normalizedEnglish ||
      !normalizedAnindilyakwa ||
      !Number.isFinite(Number(row.alignment_confidence)) ||
      (row.pair_kind !== 'sentence_candidate' && row.pair_kind !== 'verse')
    ) {
      emptyOrInvalidRejected += 1;
      exclusions.push({
        source_id: row.id,
        canonical_ref: row.canonical_ref,
        reason: 'empty_or_invalid',
      });
      continue;
    }

    const pairKey = `${normalizedEnglish}\u0000${normalizedAnindilyakwa}`;
    if (reservedPairs.has(pairKey)) {
      benchmarkOverlapRejected += 1;
      exclusions.push({
        source_id: row.id,
        canonical_ref: row.canonical_ref,
        reason: 'exact_benchmark_pair',
      });
      continue;
    }
    if (seenPairs.has(pairKey)) {
      duplicatePairsRejected += 1;
      exclusions.push({
        source_id: row.id,
        canonical_ref: row.canonical_ref,
        reason: 'normalized_duplicate_pair',
      });
      continue;
    }
    seenPairs.add(pairKey);

    const baseRef = baseReference(row.canonical_ref);
    const group = chapterGroup(baseRef);
    pairs.push({
      schema_version: 1,
      pair_id: `aoi-owner-attested-v0.3.0:${row.id}`,
      source_language: 'eng',
      target_language: 'aoi',
      source_text: english,
      target_text: anindilyakwa,
      pair_kind: row.pair_kind,
      canonical_ref: row.canonical_ref,
      base_ref: baseRef,
      chapter_group: group,
      partition: partitionForChapter(group),
      alignment_confidence: Number(row.alignment_confidence),
      alignment_status: row.alignment_status,
      provenance: 'ebible_owner_attested_permission',
      permission_evidence_class:
        'operator_attestation_without_documentary_exhibition',
      benchmark_overlap: false,
    });
  }

  const trainGroups = new Set(
    pairs
      .filter((row) => row.partition === 'train')
      .map((row) => row.chapter_group),
  );
  const developmentGroups = new Set(
    pairs
      .filter((row) => row.partition === 'development')
      .map((row) => row.chapter_group),
  );
  for (const group of trainGroups) {
    if (developmentGroups.has(group)) {
      throw new Error(`chapter group crosses partitions: ${group}`);
    }
  }

  return {
    pairs,
    exclusions,
    counts: {
      sentence_candidates_input: input.sentenceCandidates.length,
      verses_input: input.verses.length,
      verse_ranges_input: input.verseRanges.length,
      verses_shadowed_by_sentence_candidates: shadowedVerses.length,
      empty_or_invalid_rejected: emptyOrInvalidRejected,
      duplicate_pairs_rejected: duplicatePairsRejected,
      benchmark_overlap_rejected: benchmarkOverlapRejected,
      selected: pairs.length,
      train: pairs.filter((row) => row.partition === 'train').length,
      development: pairs.filter((row) => row.partition === 'development')
        .length,
      chapter_groups: new Set(pairs.map((row) => row.chapter_group)).size,
      train_chapter_groups: trainGroups.size,
      development_chapter_groups: developmentGroups.size,
    },
  };
}
