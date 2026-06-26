// Voice-model readiness model for single-speaker MMS/VITS fine-tuning.
//
// Grounds the "how close am I to a voice trained on my own voice" breakdown in
// published TTS fine-tuning data requirements (see docs/tts/VOICE-MODEL-READINESS.md
// and packages/tts — the project's MMS-TTS Pitjantjatjara pipeline). Pure functions
// so they can be unit-tested and shared by the API route and any pre-render.

export interface VoiceMetrics {
  totalClips: number;
  wordClips: number;
  phraseClips: number;
  sentenceClips: number;
  distinctWords: number;
  distinctSentences: number;
  totalDurationSeconds: number;
  sentenceDurationSeconds: number;
  clippedCount: number;
  withGloss: number;
  distinctSampleRates: number;
  minSampleRate: number | null;
  speakerProfiles: number;
  recordedPhonemics: string[];
}

export interface Tier {
  key: string;
  name: string;
  minSeconds: number;
  minClips: number;
  blurb: string;
}

// Single-speaker fine-tune tiers. Minutes are the dominant axis; clip counts are
// indicative. The "good" tier is the headline goal a contributor is scored against.
export const TIERS: Tier[] = [
  { key: 'clone', name: 'Voice clone', minSeconds: 30, minClips: 1,
    blurb: 'Enough for zero-shot speaker adaptation — borrows your timbre, lowest fidelity.' },
  { key: 'minimum', name: 'Minimum fine-tune', minSeconds: 20 * 60, minClips: 100,
    blurb: 'A LoRA fine-tune becomes viable: recognizably your voice, with some artefacts.' },
  { key: 'good', name: 'Good quality', minSeconds: 60 * 60, minClips: 300,
    blurb: 'Solid everyday quality — the practical target for a usable personal voice.' },
  { key: 'high', name: 'High quality', minSeconds: 3 * 3600, minClips: 800,
    blurb: 'Natural and hard to distinguish from a recording in most contexts.' },
  { key: 'full', name: 'Full coverage', minSeconds: 5 * 3600, minClips: 1500,
    blurb: 'Phonetic completeness; beyond this the base model, not data, is the limit.' },
];

export const HEADLINE_TARGET = TIERS.find((t) => t.key === 'good')!;

// Phoneme inventories per language code (from the reference-grammar analysis).
// Used to compute phonetic coverage from recorded words' IPA. Unknown languages
// simply skip the coverage dimension.
export const PHONEME_INVENTORY: Record<string, string[]> = {
  kuku_yalanji: ['b', 'd', 'ɟ', 'ɡ', 'm', 'n', 'ɲ', 'ŋ', 'l', 'r', 'ɻ', 'w', 'j', 'a', 'i', 'u'],
};

const STRESS_AND_DELIM = new Set(['/', 'ˈ', 'ˌ', ' ', '-', '.', 'ː']);

/** Phonemes (from the inventory) attested across a set of /.../ IPA strings. */
export function coveredPhonemes(phonemics: string[], inventory: string[]): Set<string> {
  const inv = new Set(inventory);
  const found = new Set<string>();
  for (const p of phonemics) {
    for (const ch of p) {
      if (STRESS_AND_DELIM.has(ch)) continue;
      if (inv.has(ch)) found.add(ch);
    }
  }
  return found;
}

export interface Dimension {
  key: string;
  label: string;
  score: number; // 0..100
  detail: string;
  weight: number;
  recommendation?: string;
}

export interface ReadinessResult {
  overall: number; // 0..100 toward the headline "good" target
  currentTier: Tier | null;
  nextTier: Tier | null;
  toNextTierSeconds: number;
  durationSeconds: number;
  durationMinutes: number;
  totalClips: number;
  dimensions: Dimension[];
  phonemeCoverage: { covered: number; total: number; missing: string[] } | null;
  nextActions: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const fmtMin = (s: number) => `${Math.round(s / 60)} min`;

export function computeReadiness(m: VoiceMetrics, languageCode: string): ReadinessResult {
  const dur = m.totalDurationSeconds;

  // Tier reached (by duration, gated by a sane clip count).
  let currentTier: Tier | null = null;
  for (const t of TIERS) {
    if (dur >= t.minSeconds && m.totalClips >= Math.min(t.minClips, 1)) currentTier = t;
  }
  const nextTier = TIERS.find((t) => t.minSeconds > dur) ?? null;
  const toNextTierSeconds = nextTier ? Math.max(0, nextTier.minSeconds - dur) : 0;

  // --- Phonetic coverage ---
  const inventory = PHONEME_INVENTORY[languageCode] ?? null;
  let phonemeCoverage: ReadinessResult['phonemeCoverage'] = null;
  let coverageScore = 100; // if unknown inventory, don't penalize
  if (inventory) {
    const covered = coveredPhonemes(m.recordedPhonemics, inventory);
    const missing = inventory.filter((p) => !covered.has(p));
    phonemeCoverage = { covered: covered.size, total: inventory.length, missing };
    coverageScore = clamp((covered.size / inventory.length) * 100);
  }

  // --- Dimension scores ---
  const quantity = clamp((dur / HEADLINE_TARGET.minSeconds) * 100);
  const utterances = clamp((m.totalClips / HEADLINE_TARGET.minClips) * 100);
  // connected speech: aim for ~10 min of sentence audio for prosody
  const connected = clamp((m.sentenceDurationSeconds / (10 * 60)) * 100);
  // audio quality: clipping-free, and sample rate >= 16 kHz
  const clipRate = m.totalClips > 0 ? m.clippedCount / m.totalClips : 0;
  const srOk = m.minSampleRate == null || m.minSampleRate >= 16000;
  const quality = clamp((1 - clipRate) * 100 * (srOk ? 1 : 0.6));
  // consistency: single speaker profile + single recording format
  let consistency = 100;
  if (m.speakerProfiles > 1) consistency -= 50;
  if (m.distinctSampleRates > 1) consistency -= 20;
  consistency = clamp(consistency);

  const dimensions: Dimension[] = [
    { key: 'quantity', label: 'Audio quantity', score: quantity, weight: 0.34,
      detail: `${fmtMin(dur)} of ${fmtMin(HEADLINE_TARGET.minSeconds)} target`,
      recommendation: quantity < 100
        ? `Record about ${fmtMin(Math.max(0, HEADLINE_TARGET.minSeconds - dur))} more clean audio.` : undefined },
    { key: 'coverage', label: 'Phonetic coverage', score: coverageScore, weight: 0.24,
      detail: phonemeCoverage
        ? `${phonemeCoverage.covered}/${phonemeCoverage.total} phonemes attested`
        : 'No phoneme inventory for this language yet',
      recommendation: phonemeCoverage && phonemeCoverage.missing.length
        ? `Record words containing: ${phonemeCoverage.missing.join(' ')}` : undefined },
    { key: 'connected', label: 'Connected speech', score: connected, weight: 0.16,
      detail: `${fmtMin(m.sentenceDurationSeconds)} of sentences (${m.sentenceClips} clips)`,
      recommendation: connected < 100
        ? 'Record more full sentences — prosody needs connected speech, not just words.' : undefined },
    { key: 'quality', label: 'Audio quality', score: quality, weight: 0.16,
      detail: `${Math.round(clipRate * 100)}% clipped${srOk ? '' : `, sample rate ${m.minSampleRate} Hz < 16 kHz`}`,
      recommendation: quality < 90
        ? (srOk ? 'Re-record clipped clips in a quieter space, a little further from the mic.'
                : 'Record at 16 kHz or higher.') : undefined },
    { key: 'consistency', label: 'Speaker & format consistency', score: consistency, weight: 0.10,
      detail: `${m.speakerProfiles} speaker profile${m.speakerProfiles === 1 ? '' : 's'}, ${m.distinctSampleRates} format${m.distinctSampleRates === 1 ? '' : 's'}`,
      recommendation: consistency < 100
        ? 'Use one device/microphone and one speaker profile per language for a clean training set.' : undefined },
  ];

  const overall = clamp(dimensions.reduce((s, d) => s + d.score * d.weight, 0));

  const nextActions = dimensions
    .filter((d) => d.recommendation)
    .sort((a, b) => a.score * a.weight - b.score * b.weight)
    .map((d) => d.recommendation!) as string[];

  return {
    overall,
    currentTier,
    nextTier,
    toNextTierSeconds,
    durationSeconds: dur,
    durationMinutes: Math.round(dur / 60),
    totalClips: m.totalClips,
    dimensions,
    phonemeCoverage,
    nextActions,
  };
}
