/**
 * Voice-model readiness model.
 *
 * Quantifies how close a single speaker's recording corpus is to being able to
 * fine-tune a personal neural TTS voice (an MMS-TTS / VITS model). The thresholds
 * below are grounded in published single-speaker fine-tuning practice:
 *
 *  - A pre-trained multilingual VITS/MMS base can be ADAPTED to a new speaker
 *    from ~30 min of clean, transcribed audio; quality keeps improving to a few
 *    hours. (Low-resource TTS papers fine-tune on 30 min / 1 h / 5 h subsets.)
 *  - ~3 hours is the figure cited to cover all phones of a low-resource language,
 *    but Kuku Yalanji has a SMALL phoneme inventory (3 vowels, ~17 consonants),
 *    so full phonemic coverage is reachable well before that.
 *  - Community VITS fine-tuning recipes want many short (2–10 s) single-speaker
 *    utterances with accurate transcripts and minimal background noise; a usable
 *    voice needs hundreds of clips, a strong one ~1000+.
 *
 * Sources: low-resource TTS adaptation literature (arXiv 2312.01107, 2406.08911,
 * 2110.05798) and community VITS fine-tuning guides (Plachtaa/VITS-fast-fine-tuning).
 *
 * Two gates are HARD (no amount of data substitutes):
 *   1. Consent — explicit, revocable, speaker-granted (CARE governance).
 *   2. Audio quality floor — clipped / noisy / wrong-rate clips can't train a clean voice.
 */

// Tier targets (the "good single-speaker voice" column is the 100% reference).
export const TARGETS = {
  minutes: { floor: 30, good: 120, strong: 180 },
  clips: { floor: 200, good: 600, strong: 1000 },
  sentences: { floor: 40, good: 100, strong: 250 }, // connected speech for prosody
  phonemeOccurrences: 5, // each phoneme should appear at least this many times
  qualityFloorPct: 80, // share of clips that must be clean before training is sane
} as const;

export interface RecordingLite {
  kind: string; // 'word' | 'phrase' | 'sentence'
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
  peakAmplitude: number | null;
  clipped: boolean | null;
  wordId: string | null;
}

export interface DimensionScore {
  key: string;
  label: string;
  pct: number; // 0..100 toward the "good" target
  value: number;
  target: number;
  unit: string;
  detail: string;
}

export interface ReadinessResult {
  // headline
  dataReadinessPct: number; // weighted blend of data dimensions (ignores consent)
  tier: 'none' | 'collecting' | 'adaptable' | 'good' | 'strong';
  verdict: string;
  blockers: string[];
  nextSteps: string[];
  // gates
  consent: { granted: boolean; at: string | null };
  qualityFloorMet: boolean;
  // breakdown
  dimensions: DimensionScore[];
  totals: {
    clips: number;
    words: number;
    sentences: number;
    minutes: number;
    cleanClips: number;
  };
  phonemes: {
    inventory: number;
    covered: number;
    coveragePct: number;
    underCovered: { symbol: string; count: number }[];
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Split an IPA string like "/ˈbabaɟaɡa/" into phoneme tokens (data-derived, no hardcoded list). */
export function ipaPhonemes(ipa: string): string[] {
  if (!ipa) return [];
  // Strip delimiters and suprasegmentals (stress, length, ties, syllable breaks).
  const cleaned = ipa
    .replace(/[/\[\]]/g, '')
    .replace(/[ˈˌːˑ.|‿͡ ]/g, '')
    .toLowerCase();
  // Grapheme clusters keep a base IPA letter + any combining diacritic together.
  // (Intl.Segmenter is available in the Node 18+ runtime.)
  try {
    const seg = new Intl.Segmenter('und', { granularity: 'grapheme' });
    return Array.from(seg.segment(cleaned), (s) => s.segment).filter(Boolean);
  } catch {
    return Array.from(cleaned);
  }
}

/** Is a single clip clean enough to be training material? */
export function isCleanClip(r: RecordingLite): boolean {
  if (r.clipped === true) return false;
  if (r.durationMs != null && (r.durationMs < 500 || r.durationMs > 15000)) return false;
  if (r.sampleRate != null && r.sampleRate < 16000) return false;
  if (r.channels != null && r.channels > 1) return false;
  if (r.peakAmplitude != null && (r.peakAmplitude < 0.03 || r.peakAmplitude > 0.999)) return false;
  return true;
}

function tierFor(minutes: number, clips: number): ReadinessResult['tier'] {
  if (clips === 0) return 'none';
  if (minutes >= TARGETS.minutes.strong && clips >= TARGETS.clips.strong) return 'strong';
  if (minutes >= TARGETS.minutes.good && clips >= TARGETS.clips.good) return 'good';
  if (minutes >= TARGETS.minutes.floor && clips >= TARGETS.clips.floor) return 'adaptable';
  return 'collecting';
}

export function computeReadiness(args: {
  recordings: RecordingLite[];
  // phonemic IPA for the words this speaker recorded, and the full language inventory
  recordedWordIpa: string[];
  languageInventory: Set<string>;
  consent: { granted: boolean; at: string | null };
}): ReadinessResult {
  const { recordings, recordedWordIpa, languageInventory, consent } = args;

  const clips = recordings.length;
  const words = recordings.filter((r) => r.kind === 'word').length;
  const sentences = recordings.filter((r) => r.kind === 'sentence' || r.kind === 'phrase').length;
  const minutes = round1(recordings.reduce((s, r) => s + (r.durationMs ?? 0), 0) / 60000);
  const cleanClips = recordings.filter(isCleanClip).length;
  const qualityPct = clips ? (cleanClips / clips) * 100 : 0;

  // Phoneme coverage from the recorded WORDS' IPA (the reliable phonetic signal).
  const counts = new Map<string, number>();
  for (const ipa of recordedWordIpa) {
    for (const p of new Set(ipaPhonemes(ipa))) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const inventory = languageInventory.size;
  const covered = [...languageInventory].filter((p) => counts.has(p)).length;
  const coveragePct = inventory ? (covered / inventory) * 100 : 0;
  const underCovered = [...languageInventory]
    .map((symbol) => ({ symbol, count: counts.get(symbol) ?? 0 }))
    .filter((x) => x.count < TARGETS.phonemeOccurrences)
    .sort((a, b) => a.count - b.count);

  const dimensions: DimensionScore[] = [
    {
      key: 'duration', label: 'Total clean audio', unit: 'min',
      value: minutes, target: TARGETS.minutes.good,
      pct: clamp((minutes / TARGETS.minutes.good) * 100),
      detail: `${minutes} min recorded · ${TARGETS.minutes.floor} min is the minimum to start adapting a voice, ${TARGETS.minutes.good}+ min for a good one`,
    },
    {
      key: 'clips', label: 'Utterances', unit: 'clips',
      value: clips, target: TARGETS.clips.good,
      pct: clamp((clips / TARGETS.clips.good) * 100),
      detail: `${clips} recordings · aim for many short (2–10 s) clips`,
    },
    {
      key: 'phonemes', label: 'Sound coverage', unit: '%',
      value: Math.round(coveragePct), target: 100,
      pct: clamp(coveragePct),
      detail: inventory
        ? `${covered}/${inventory} of the language's sounds captured · ${underCovered.length} still need ${TARGETS.phonemeOccurrences}+ examples`
        : 'No phonetic inventory available for this language yet',
    },
    {
      key: 'sentences', label: 'Sentences (prosody)', unit: 'clips',
      value: sentences, target: TARGETS.sentences.good,
      pct: clamp((sentences / TARGETS.sentences.good) * 100),
      detail: `${sentences} sentence/phrase recordings · connected speech teaches rhythm & intonation`,
    },
    {
      key: 'quality', label: 'Audio quality', unit: '%',
      value: Math.round(qualityPct), target: 100,
      pct: clamp(qualityPct),
      detail: `${cleanClips}/${clips || 0} clips are clean (single voice, no clipping, ≥16 kHz, mono, 0.5–15 s)`,
    },
  ];

  // Weighted blend — duration & coverage carry the most signal.
  const W: Record<string, number> = { duration: 0.3, clips: 0.2, phonemes: 0.25, sentences: 0.1, quality: 0.15 };
  const dataReadinessPct = Math.round(dimensions.reduce((s, d) => s + d.pct * (W[d.key] ?? 0), 0));

  const tier = tierFor(minutes, clips);
  const qualityFloorMet = clips > 0 && qualityPct >= TARGETS.qualityFloorPct;

  // Blockers (hard) and next steps (soft, prioritised).
  const blockers: string[] = [];
  if (!consent.granted) blockers.push('Training consent has not been granted for this voice.');
  if (clips > 0 && !qualityFloorMet)
    blockers.push(`Audio quality is below the ${TARGETS.qualityFloorPct}% clean-clip floor — re-record noisy or clipped clips.`);
  if (minutes < TARGETS.minutes.floor)
    blockers.push(`Below the ${TARGETS.minutes.floor}-minute minimum to begin adapting a voice (${minutes} min so far).`);

  const nextSteps: string[] = [];
  const needMin = Math.max(0, TARGETS.minutes.good - minutes);
  const needClips = Math.max(0, TARGETS.clips.good - clips);
  if (needMin > 0) nextSteps.push(`Record ~${Math.ceil(needMin)} more minutes of audio.`);
  if (needClips > 0) nextSteps.push(`Add ~${needClips} more clips (short words & phrases).`);
  if (underCovered.length > 0)
    nextSteps.push(`Cover ${underCovered.length} under-represented sound${underCovered.length === 1 ? '' : 's'} (need ${TARGETS.phonemeOccurrences}+ examples each).`);
  if (sentences < TARGETS.sentences.good)
    nextSteps.push(`Record ${TARGETS.sentences.good - sentences} more sentences for natural prosody.`);
  if (!consent.granted) nextSteps.push('Grant training consent when you’re ready (you can revoke it anytime).');

  let verdict: string;
  if (clips === 0) verdict = 'No recordings yet — record some words to begin building your voice.';
  else if (!consent.granted) verdict = `Your corpus is ${dataReadinessPct}% of the way to a good voice, but training needs your consent first.`;
  else if (tier === 'strong') verdict = 'Ready for a strong, production-quality personal voice.';
  else if (tier === 'good') verdict = 'Ready to fine-tune a good personal voice now.';
  else if (tier === 'adaptable') verdict = 'Enough to adapt a first rough voice — keep recording to make it good.';
  else verdict = `Collecting — ${dataReadinessPct}% of the way to a good voice.`;

  return {
    dataReadinessPct,
    tier,
    verdict,
    blockers,
    nextSteps,
    consent,
    qualityFloorMet,
    dimensions,
    totals: { clips, words, sentences, minutes, cleanClips },
    phonemes: { inventory, covered, coveragePct: Math.round(coveragePct), underCovered: underCovered.slice(0, 40) },
  };
}
