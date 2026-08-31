import { createHash } from 'node:crypto';
import { z } from 'zod';

const A39AudioPathSchema = z
  .string()
  .regex(/^\/repository\/A39\/[^/]+\.(?:mp3|wav|webm)$/u);

const AudioListSchema = z
  .array(A39AudioPathSchema)
  .length(3)
  .superRefine((paths, context) => {
    const extensions = paths.map((value) => value.split('.').at(-1)).sort();
    if (extensions.join(',') !== 'mp3,wav,webm')
      context.addIssue({
        code: 'custom',
        message: 'audio list must contain one mp3, wav, and webm derivative',
      });
  });

const FiftyWordsWordSchema = z.object({
  english: z.string().trim().min(1),
  indigenous: z.string().trim().min(1),
  english_alternate: z.string().trim().min(1).optional(),
  audio: AudioListSchema,
});

export const FiftyWordsWajarriIndexSchema = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    language: z.object({
      name: z.literal('Wajarri'),
      audio: AudioListSchema,
    }),
    date_received: z.number().int().positive(),
    code: z.literal('A39'),
    words: z.array(FiftyWordsWordSchema).min(1),
    speaker: z.object({
      name: z.string().trim().min(1),
      audio: AudioListSchema,
    }),
    name: z.literal('Wajarri'),
    source: z.string().trim().min(1),
  }),
});

export const WajarriSourceDictionaryRecordSchema = z.object({
  Wajarri: z.string().trim().min(1),
  English: z.string().trim().min(1),
  description: z.string().trim().min(1),
  sound: z.string().trim().min(1),
  image: z.string().trim().min(1).optional(),
});

export type FiftyWordsWajarriIndex = z.infer<
  typeof FiftyWordsWajarriIndexSchema
>;
export type WajarriSourceDictionaryRecord = z.infer<
  typeof WajarriSourceDictionaryRecordSchema
>;

export interface FiftyWordsCurrentDictionaryMatch {
  sourceRecordId: string;
  sourceOrdinal: number;
  headwordSource: string;
  englishSource: string;
  descriptionSource: string;
  soundSource: string;
  exactEnglishSourceMatch: boolean;
  exactEnglishAlternateMatch: boolean;
  exactDescriptionMatch: boolean;
}

export interface FiftyWordsPairing {
  schemaVersion: 1;
  inventoryId: 'wajarri-50words-a39-evidence-v0.1.0';
  recordId: string;
  sourceId: 'src-wbv-50words-a39-2019-20260723';
  sourceOrdinal: number;
  englishSource: string;
  englishAlternateSource: string | null;
  wajarriSource: string;
  speakerSource: string;
  sourceCollection: string;
  dateReceivedSource: number;
  sourceAttestationStatus: 'speaker_attributed_published_pair';
  licenseScope: 'public_50words_site_material_only';
  acceptanceStatus: 'accepted_as_source_attestation';
  lexicalSenseStatus: 'unadjudicated';
  translationTaskEligibility: 'pending_task_and_sense_review';
  syntheticEligibility: 'not_yet_eligible';
  trainingEligibility: 'not_yet_eligible_pending_task_review';
  englishTokenCount: number;
  wajarriTokenCount: number;
  sourceHasTerminalPunctuation: boolean;
  audioPaths: string[];
  currentDictionaryRelation:
    | 'no_exact_current_headword'
    | 'unique_exact_current_headword'
    | 'multiple_exact_current_headwords';
  currentDictionaryMatches: FiftyWordsCurrentDictionaryMatch[];
  claimLimit: string;
}

export interface FiftyWordsAudioAsset {
  schemaVersion: 1;
  assetId: string;
  role: 'language_name' | 'speaker_name' | 'translation_pair';
  sourceRecordId: string | null;
  englishSource: string | null;
  wajarriSource: string;
  speakerSource: string;
  remotePath: string;
  remoteUrl: string;
  archiveRelativePath: string;
  mediaType: 'audio/mpeg' | 'audio/wav' | 'video/webm';
}

export interface FiftyWordsEvidenceInventory {
  pairings: FiftyWordsPairing[];
  audioAssets: FiftyWordsAudioAsset[];
  report: {
    pairings: number;
    uniqueEnglishSources: number;
    uniqueWajarriSources: number;
    multiTokenEnglishSources: number;
    multiTokenWajarriSources: number;
    punctuatedSourcePairs: number;
    noExactCurrentHeadword: number;
    uniqueExactCurrentHeadword: number;
    multipleExactCurrentHeadwords: number;
    exactCurrentHeadwordMatches: number;
    exactCurrentEnglishMatches: number;
    audioAssets: number;
    audioAssetsByMediaType: Record<string, number>;
    acceptedSourceAttestations: number;
    trainingEligibleRows: 0;
    syntheticEligibleRows: 0;
  };
}

function canonicalText(value: string): string {
  return value.normalize('NFC').trim().toLocaleLowerCase('en');
}

function tokenCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function mediaType(path: string): FiftyWordsAudioAsset['mediaType'] {
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.wav')) return 'audio/wav';
  return 'video/webm';
}

function audioAsset(input: {
  role: FiftyWordsAudioAsset['role'];
  sourceRecordId: string | null;
  englishSource: string | null;
  wajarriSource: string;
  speakerSource: string;
  remotePath: string;
}): FiftyWordsAudioAsset {
  const filename = input.remotePath.split('/').at(-1);
  if (!filename)
    throw new Error(`audio path has no filename: ${input.remotePath}`);
  return {
    schemaVersion: 1,
    assetId: `wbv-50words-a39-audio-${shortHash(input.remotePath)}`,
    role: input.role,
    sourceRecordId: input.sourceRecordId,
    englishSource: input.englishSource,
    wajarriSource: input.wajarriSource,
    speakerSource: input.speakerSource,
    remotePath: input.remotePath,
    remoteUrl: `https://50words.online${input.remotePath}`,
    archiveRelativePath: `audio/${filename}`,
    mediaType: mediaType(input.remotePath),
  };
}

function ensureUnique<T>(
  rows: T[],
  key: (_row: T) => string,
  label: string,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = key(row);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function buildFiftyWordsWajarriEvidence(input: {
  indexValue: unknown;
  currentDictionaryValue: unknown;
}): FiftyWordsEvidenceInventory {
  const index = FiftyWordsWajarriIndexSchema.parse(input.indexValue);
  const currentDictionary = z
    .array(WajarriSourceDictionaryRecordSchema)
    .parse(input.currentDictionaryValue);
  ensureUnique(
    index.properties.words,
    (row) => canonicalText(row.english),
    'English source',
  );

  const currentByHeadword = new Map<
    string,
    Array<{ row: WajarriSourceDictionaryRecord; ordinal: number }>
  >();
  for (const [index, row] of currentDictionary.entries()) {
    const normalized = canonicalText(row.Wajarri);
    const values = currentByHeadword.get(normalized) ?? [];
    values.push({ row, ordinal: index + 1 });
    currentByHeadword.set(normalized, values);
  }

  const speaker = index.properties.speaker.name;
  const pairings = index.properties.words.map((word, offset) => {
    const ordinal = offset + 1;
    const recordId = `wbv-50words-a39-pair-${shortHash(
      `${ordinal}\u0000${word.english}\u0000${word.indigenous}`,
    )}`;
    const english = canonicalText(word.english);
    const alternate = word.english_alternate
      ? canonicalText(word.english_alternate)
      : null;
    const matches = (
      currentByHeadword.get(canonicalText(word.indigenous)) ?? []
    ).map(
      ({ row, ordinal: sourceOrdinal }): FiftyWordsCurrentDictionaryMatch => ({
        sourceRecordId: `wbv-src-local-${String(sourceOrdinal).padStart(6, '0')}`,
        sourceOrdinal,
        headwordSource: row.Wajarri,
        englishSource: row.English,
        descriptionSource: row.description,
        soundSource: row.sound,
        exactEnglishSourceMatch: canonicalText(row.English) === english,
        exactEnglishAlternateMatch:
          alternate !== null && canonicalText(row.English) === alternate,
        exactDescriptionMatch: canonicalText(row.description) === english,
      }),
    );
    const relation =
      matches.length === 0
        ? 'no_exact_current_headword'
        : matches.length === 1
          ? 'unique_exact_current_headword'
          : 'multiple_exact_current_headwords';
    return {
      schemaVersion: 1,
      inventoryId: 'wajarri-50words-a39-evidence-v0.1.0',
      recordId,
      sourceId: 'src-wbv-50words-a39-2019-20260723',
      sourceOrdinal: ordinal,
      englishSource: word.english,
      englishAlternateSource: word.english_alternate ?? null,
      wajarriSource: word.indigenous,
      speakerSource: speaker,
      sourceCollection: index.properties.source,
      dateReceivedSource: index.properties.date_received,
      sourceAttestationStatus: 'speaker_attributed_published_pair',
      licenseScope: 'public_50words_site_material_only',
      acceptanceStatus: 'accepted_as_source_attestation',
      lexicalSenseStatus: 'unadjudicated',
      translationTaskEligibility: 'pending_task_and_sense_review',
      syntheticEligibility: 'not_yet_eligible',
      trainingEligibility: 'not_yet_eligible_pending_task_review',
      englishTokenCount: tokenCount(word.english),
      wajarriTokenCount: tokenCount(word.indigenous),
      sourceHasTerminalPunctuation: /[?!.]$/u.test(
        `${word.english}${word.indigenous}`,
      ),
      audioPaths: [...word.audio],
      currentDictionaryRelation: relation,
      currentDictionaryMatches: matches,
      claimLimit:
        'This row proves one speaker-attributed public source pairing. It does not by itself establish part of speech, morpheme boundaries, productive grammar, unrestricted substitutability, source independence, or synthetic sentence eligibility.',
    } satisfies FiftyWordsPairing;
  });

  const audioAssets = [
    ...index.properties.language.audio.map((remotePath) =>
      audioAsset({
        role: 'language_name',
        sourceRecordId: null,
        englishSource: 'Wajarri',
        wajarriSource: 'Wajarri',
        speakerSource: speaker,
        remotePath,
      }),
    ),
    ...index.properties.speaker.audio.map((remotePath) =>
      audioAsset({
        role: 'speaker_name',
        sourceRecordId: null,
        englishSource: speaker,
        wajarriSource: speaker,
        speakerSource: speaker,
        remotePath,
      }),
    ),
    ...pairings.flatMap((pairing) =>
      pairing.audioPaths.map((remotePath) =>
        audioAsset({
          role: 'translation_pair',
          sourceRecordId: pairing.recordId,
          englishSource: pairing.englishSource,
          wajarriSource: pairing.wajarriSource,
          speakerSource: speaker,
          remotePath,
        }),
      ),
    ),
  ];
  ensureUnique(audioAssets, (row) => row.assetId, 'audio asset ID');
  ensureUnique(audioAssets, (row) => row.remotePath, 'audio remote path');

  const relationCount = (
    value: FiftyWordsPairing['currentDictionaryRelation'],
  ) => pairings.filter((row) => row.currentDictionaryRelation === value).length;
  const audioAssetsByMediaType: Record<string, number> = {};
  for (const asset of audioAssets)
    audioAssetsByMediaType[asset.mediaType] =
      (audioAssetsByMediaType[asset.mediaType] ?? 0) + 1;

  return {
    pairings,
    audioAssets,
    report: {
      pairings: pairings.length,
      uniqueEnglishSources: new Set(
        pairings.map((row) => canonicalText(row.englishSource)),
      ).size,
      uniqueWajarriSources: new Set(
        pairings.map((row) => canonicalText(row.wajarriSource)),
      ).size,
      multiTokenEnglishSources: pairings.filter(
        (row) => row.englishTokenCount > 1,
      ).length,
      multiTokenWajarriSources: pairings.filter(
        (row) => row.wajarriTokenCount > 1,
      ).length,
      punctuatedSourcePairs: pairings.filter(
        (row) => row.sourceHasTerminalPunctuation,
      ).length,
      noExactCurrentHeadword: relationCount('no_exact_current_headword'),
      uniqueExactCurrentHeadword: relationCount(
        'unique_exact_current_headword',
      ),
      multipleExactCurrentHeadwords: relationCount(
        'multiple_exact_current_headwords',
      ),
      exactCurrentHeadwordMatches: pairings.reduce(
        (sum, row) => sum + row.currentDictionaryMatches.length,
        0,
      ),
      exactCurrentEnglishMatches: pairings.filter((row) =>
        row.currentDictionaryMatches.some(
          (match) =>
            match.exactEnglishSourceMatch ||
            match.exactEnglishAlternateMatch ||
            match.exactDescriptionMatch,
        ),
      ).length,
      audioAssets: audioAssets.length,
      audioAssetsByMediaType,
      acceptedSourceAttestations: pairings.length,
      trainingEligibleRows: 0,
      syntheticEligibleRows: 0,
    },
  };
}
