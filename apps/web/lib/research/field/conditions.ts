import { getMoonIllumination, getMoonPosition, getMoonTimes, getPosition, getTimes } from 'suncalc';
import { FIELD_AREA } from './area';

/**
 * When and with what bait: a small model of fishing conditions, fitted from
 * the operator's own logs. Each log is a moment (time of day, moon, season,
 * weather, river) plus the bait used, and whether it caught the animal in
 * question. The same code runs on the server, to fit, and on the phone, to
 * rank the coming week's hours with no signal.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------
// Conditions feeds

export type WeatherHour = {
  hour: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  pressureHpa: number | null;
  cloudPct: number | null;
  windKmh: number | null;
};

export type RiverHour = { hour: string; levelM: number };

/** What the server knows about the area's weather and river, as saved on the phone. */
export type ConditionsFeed = {
  fetchedAt: string;
  weather: WeatherHour[];
  river: RiverHour[];
  riverName: string;
};

function hourKey(ms: number): number {
  return Math.floor(ms / HOUR_MS);
}

/** Hour-indexed weather and river readings, for looking up any moment. */
export class ConditionsIndex {
  private weather = new Map<number, WeatherHour>();
  private river = new Map<number, number>();
  private lastRiverHour: number | null = null;

  constructor(weather: WeatherHour[] = [], river: RiverHour[] = []) {
    for (const w of weather) this.weather.set(hourKey(Date.parse(w.hour)), w);
    for (const r of river) {
      const key = hourKey(Date.parse(r.hour));
      this.river.set(key, r.levelM);
      if (this.lastRiverHour === null || key > this.lastRiverHour) this.lastRiverHour = key;
    }
  }

  weatherAt(key: number): WeatherHour | undefined {
    return this.weather.get(key);
  }

  /** Rain over the `hours` before `key`, or null if most of that span is missing. */
  rain(key: number, hours: number): number | null {
    let total = 0;
    let seen = 0;
    for (let k = key - hours + 1; k <= key; k++) {
      const value = this.weather.get(k)?.precipitationMm;
      if (value !== null && value !== undefined) {
        total += value;
        seen++;
      }
    }
    return seen >= hours * 0.75 ? total : null;
  }

  /** The river level nearest `key`, within three hours. */
  riverAt(key: number): number | null {
    for (const d of [0, -1, 1, -2, 2, -3, 3]) {
      const value = this.river.get(key + d);
      if (value !== undefined) return value;
    }
    return null;
  }

  get latestRiverHour(): number | null {
    return this.lastRiverHour;
  }
}

// ---------------------------------------------------------------------------
// A moment on the river

export type Daypart = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'wet' | 'runoff' | 'dry' | 'buildup';

export const daypartLabels: Record<Daypart, string> = { dawn: 'Dawn', day: 'Daytime', dusk: 'Dusk', night: 'Night' };
export const seasonLabels: Record<Season, string> = {
  wet: 'Wet season (Dec–Mar)',
  runoff: 'Run-off (Apr–May)',
  dry: 'Dry season (Jun–Sep)',
  buildup: 'Build-up (Oct–Nov)',
};

/** Everything known about one moment, in plain terms. */
export type Situation = {
  daypart: Daypart;
  season: Season;
  /** Lit fraction of the moon, 0 (new) to 1 (full). */
  moonLight: number;
  moonUp: boolean;
  /** Within an hour of the moon overhead or underfoot. */
  moonOverhead: boolean;
  temperatureC: number | null;
  pressureChangeHpa: number | null;
  rain24hMm: number | null;
  rain7dMm: number | null;
  cloudPct: number | null;
  windKmh: number | null;
  riverLevelM: number | null;
  riverChange24hM: number | null;
  riverChange7dM: number | null;
};

const DAWN_BEFORE = HOUR_MS;
const DAWN_AFTER = 2 * HOUR_MS;
const DUSK_BEFORE = 2 * HOUR_MS;
const DUSK_AFTER = HOUR_MS;

function sunEvents(at: Date, lat: number, lon: number): { rises: number[]; sets: number[] } {
  const rises: number[] = [];
  const sets: number[] = [];
  for (const offset of [-1, 0, 1]) {
    const times = getTimes(new Date(at.getTime() + offset * DAY_MS), lat, lon, 0, FIELD_AREA.utcOffsetMinutes);
    if (times.sunrise) rises.push(times.sunrise.getTime());
    if (times.sunset) sets.push(times.sunset.getTime());
  }
  return { rises, sets };
}

/** Dawn runs from an hour before sunrise to two after; dusk from two before sunset to one after. */
export function daypartAt(at: Date, lat: number, lon: number): Daypart {
  const t = at.getTime();
  const { rises, sets } = sunEvents(at, lat, lon);
  if (rises.some((r) => t >= r - DAWN_BEFORE && t < r + DAWN_AFTER)) return 'dawn';
  if (sets.some((s) => t >= s - DUSK_BEFORE && t < s + DUSK_AFTER)) return 'dusk';
  return getPosition(at, lat, lon).altitude > 0 ? 'day' : 'night';
}

/** Cape York seasons by the month in Queensland time. */
export function seasonAt(at: Date): Season {
  const month = new Date(at.getTime() + FIELD_AREA.utcOffsetMinutes * 60_000).getUTCMonth();
  if (month === 11 || month <= 2) return 'wet';
  if (month <= 4) return 'runoff';
  if (month <= 8) return 'dry';
  return 'buildup';
}

function moonOverheadAt(at: Date, lat: number, lon: number): boolean {
  const t = at.getTime();
  for (const offset of [-1, 0, 1]) {
    const times = getMoonTimes(new Date(t + offset * DAY_MS), lat, lon, FIELD_AREA.utcOffsetMinutes);
    for (const transit of [times.transit, times.lowerTransit]) {
      if (transit && Math.abs(transit.getTime() - t) <= HOUR_MS) return true;
    }
  }
  return false;
}

/** How long a river reading is carried forward into the outlook. */
const RIVER_PERSISTENCE_HOURS = 72;

export function situationAt(at: Date, index: ConditionsIndex, lat: number = FIELD_AREA.centre.lat, lon: number = FIELD_AREA.centre.lon): Situation {
  const key = hourKey(at.getTime());
  const weather = index.weatherAt(key);
  const before = index.weatherAt(key - 24);
  const pressure = weather?.pressureHpa ?? null;
  const pressureBefore = before?.pressureHpa ?? null;

  // Past the last gauge reading (the outlook), hold the river as it last was.
  let riverKey = key;
  const latest = index.latestRiverHour;
  if (latest !== null && key > latest + 3 && key - latest <= RIVER_PERSISTENCE_HOURS) riverKey = latest;
  const level = index.riverAt(riverKey);
  const level24 = index.riverAt(riverKey - 24);
  const level7d = index.riverAt(riverKey - 24 * 7);

  return {
    daypart: daypartAt(at, lat, lon),
    season: seasonAt(at),
    moonLight: getMoonIllumination(at).fraction,
    moonUp: getMoonPosition(at, lat, lon).altitude > 0,
    moonOverhead: moonOverheadAt(at, lat, lon),
    temperatureC: weather?.temperatureC ?? null,
    pressureChangeHpa: pressure !== null && pressureBefore !== null ? pressure - pressureBefore : null,
    rain24hMm: index.rain(key, 24),
    rain7dMm: index.rain(key, 24 * 7),
    cloudPct: weather?.cloudPct ?? null,
    windKmh: weather?.windKmh ?? null,
    riverLevelM: level,
    riverChange24hM: level !== null && level24 !== null ? level - level24 : null,
    riverChange7dM: level !== null && level7d !== null ? level - level7d : null,
  };
}

// ---------------------------------------------------------------------------
// The sky, for the almanac

export type MoonPhaseName =
  | 'New moon'
  | 'Waxing crescent'
  | 'First quarter'
  | 'Waxing gibbous'
  | 'Full moon'
  | 'Waning gibbous'
  | 'Last quarter'
  | 'Waning crescent';

/** Named the way it looks: within about a day of full (over 98% lit) reads as full. */
export function moonPhaseName(phase: number): MoonPhaseName {
  if (phase < 0.04 || phase > 0.96) return 'New moon';
  if (phase < 0.21) return 'Waxing crescent';
  if (phase < 0.29) return 'First quarter';
  if (phase < 0.46) return 'Waxing gibbous';
  if (phase < 0.54) return 'Full moon';
  if (phase < 0.71) return 'Waning gibbous';
  if (phase < 0.79) return 'Last quarter';
  return 'Waning crescent';
}

export type DayAlmanac = { day: string; sunrise: string | null; sunset: string | null; moonLight: number; moonPhase: MoonPhaseName };

/** Sun and moon for the civil day containing `at`, in Queensland time. */
export function almanac(at: Date, lat: number = FIELD_AREA.centre.lat, lon: number = FIELD_AREA.centre.lon): DayAlmanac {
  const times = getTimes(at, lat, lon, 0, FIELD_AREA.utcOffsetMinutes);
  const moon = getMoonIllumination(new Date(times.solarNoon.getTime()));
  const local = new Date(at.getTime() + FIELD_AREA.utcOffsetMinutes * 60_000);
  return {
    day: local.toISOString().slice(0, 10),
    sunrise: times.sunrise?.toISOString() ?? null,
    sunset: times.sunset?.toISOString() ?? null,
    moonLight: moon.fraction,
    moonPhase: moonPhaseName(moon.phase),
  };
}

// ---------------------------------------------------------------------------
// Features

type NumericSpec = {
  id: string;
  read: (s: Situation) => number | null;
  /** Wording for the two ends: "Dark moon" ↔ "Bright moon". */
  low: string;
  high: string;
  binary?: boolean;
  transform?: (v: number) => number;
};

const log1p = (v: number) => Math.log1p(Math.max(0, v));

export const NUMERIC_FEATURES: NumericSpec[] = [
  { id: 'moon_light', read: (s) => s.moonLight, low: 'Dark moon', high: 'Bright moon' },
  { id: 'moon_up', read: (s) => (s.moonUp ? 1 : 0), low: 'Moon down', high: 'Moon up', binary: true },
  { id: 'moon_overhead', read: (s) => (s.moonOverhead ? 1 : 0), low: 'Moon off overhead', high: 'Moon overhead or underfoot', binary: true },
  { id: 'temperature', read: (s) => s.temperatureC, low: 'Cooler', high: 'Warmer' },
  { id: 'pressure_change', read: (s) => s.pressureChangeHpa, low: 'Pressure falling', high: 'Pressure rising' },
  { id: 'rain_24h', read: (s) => s.rain24hMm, low: 'No rain in the last day', high: 'Rain in the last day', transform: log1p },
  { id: 'rain_7d', read: (s) => s.rain7dMm, low: 'Dry week', high: 'Wet week', transform: log1p },
  { id: 'cloud', read: (s) => s.cloudPct, low: 'Clear sky', high: 'Cloudy' },
  { id: 'wind', read: (s) => s.windKmh, low: 'Calm', high: 'Windy' },
  { id: 'river_level', read: (s) => s.riverLevelM, low: 'River low', high: 'River high' },
  { id: 'river_change_24h', read: (s) => s.riverChange24hM, low: 'River falling', high: 'River rising' },
  { id: 'river_change_7d', read: (s) => s.riverChange7dM, low: 'River down on last week', high: 'River up on last week' },
];

export type LevelGroup = 'daypart' | 'season' | 'bait';

/** One log, ready to learn from. */
export type ConditionsRow = {
  situation: Situation;
  /** Normalised bait key, or null when none was used or recorded. */
  bait: string | null;
  positive: boolean;
  /** The Queensland date, so a day's logs are held out together. */
  day: string;
};

export function baitKey(bait: string | null | undefined): string | null {
  const key = bait?.trim().replace(/\s+/g, ' ').toLowerCase();
  return key ? key : null;
}

export function baitLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export function localDay(at: Date): string {
  return new Date(at.getTime() + FIELD_AREA.utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

export type Effect = { id: string; label: string; ratio: number; logs: number };
export type Tally = { group: LevelGroup; level: string; logs: number; positives: number };
export type BaitStat = { bait: string; logs: number; positives: number; ratio: number | null };

export type ConditionsModel = {
  version: 1;
  targetId: string;
  fittedAt: string;
  logs: number;
  positives: number;
  days: number;
  numeric: Array<{ id: string; mean: number; sd: number }>;
  levels: Array<{ group: LevelGroup; level: string }>;
  intercept: number;
  /** Numeric features first, then levels, in the order above. */
  coefficients: number[];
  /** Mean predicted chance over the logs: the "usual" a ratio is measured against. */
  baseline: number;
  validation: { auc: number | null; folds: number };
  effects: Effect[];
  baits: BaitStat[];
  tallies: Tally[];
};

/** Why there is no model yet, in words for the screen. */
export type ConditionsUnfitted = { reason: string; logs: number; positives: number; tallies: Tally[]; baits: BaitStat[] };

export const MIN_POSITIVES = 3;
export const MIN_NEGATIVES = 3;
const L2 = 2;

function levelOf(group: LevelGroup, row: { situation: Situation; bait: string | null }): string | null {
  if (group === 'daypart') return row.situation.daypart;
  if (group === 'season') return row.situation.season;
  return row.bait;
}

function design(model: Pick<ConditionsModel, 'numeric' | 'levels'>, situation: Situation, bait: string | null): number[] {
  const x: number[] = [];
  for (const f of model.numeric) {
    const spec = NUMERIC_FEATURES.find((n) => n.id === f.id)!;
    const raw = spec.read(situation);
    x.push(raw === null ? 0 : ((spec.transform ? spec.transform(raw) : raw) - f.mean) / f.sd);
  }
  const row = { situation, bait };
  for (const l of model.levels) x.push(levelOf(l.group, row) === l.level ? 1 : 0);
  return x;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));

function linear(intercept: number, beta: number[], x: number[]): number {
  let z = intercept;
  for (let j = 0; j < x.length; j++) z += beta[j] * x[j];
  return z;
}

/** Solve A x = b (A symmetric positive definite) by Cholesky. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const l = a.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = a[i][j];
      for (let k = 0; k < j; k++) sum -= l[i][k] * l[j][k];
      if (i === j) l[i][i] = Math.sqrt(Math.max(sum, 1e-12));
      else l[i][j] = sum / l[j][j];
    }
  }
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let k = 0; k < i; k++) sum -= l[i][k] * y[k];
    y[i] = sum / l[i][i];
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = y[i];
    for (let k = i + 1; k < n; k++) sum -= l[k][i] * x[k];
    x[i] = sum / l[i][i];
  }
  return x;
}

/** Ridge logistic regression by Newton's method; the intercept is not penalised. */
export function fitLogistic(xs: number[][], ys: number[], l2 = L2): { intercept: number; beta: number[] } {
  const p = xs[0]?.length ?? 0;
  let w = new Array<number>(p + 1).fill(0);
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  w[0] = Math.log(Math.max(1e-3, mean) / Math.max(1e-3, 1 - mean));
  for (let iteration = 0; iteration < 60; iteration++) {
    const gradient = new Array<number>(p + 1).fill(0);
    const hessian = Array.from({ length: p + 1 }, () => new Array<number>(p + 1).fill(0));
    for (let i = 0; i < xs.length; i++) {
      const row = [1, ...xs[i]];
      const mu = sigmoid(linear(w[0], w.slice(1), xs[i]));
      const weight = Math.max(mu * (1 - mu), 1e-9);
      for (let j = 0; j <= p; j++) {
        gradient[j] += (ys[i] - mu) * row[j];
        for (let k = 0; k <= j; k++) hessian[j][k] += weight * row[j] * row[k];
      }
    }
    for (let j = 0; j <= p; j++) {
      for (let k = 0; k < j; k++) hessian[k][j] = hessian[j][k];
      if (j > 0) {
        gradient[j] -= l2 * w[j];
        hessian[j][j] += l2;
      }
    }
    const step = solve(hessian, gradient);
    w = w.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return { intercept: w[0], beta: w.slice(1) };
}

export function auc(positives: number[], negatives: number[]): number | null {
  if (positives.length === 0 || negatives.length === 0) return null;
  let wins = 0;
  for (const p of positives) for (const n of negatives) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (positives.length * negatives.length);
}

function tallies(rows: ConditionsRow[]): Tally[] {
  const counts = new Map<string, Tally>();
  for (const row of rows) {
    for (const group of ['daypart', 'season', 'bait'] as const) {
      const level = levelOf(group, row);
      if (level === null) continue;
      const key = `${group}:${level}`;
      const t = counts.get(key) ?? { group, level, logs: 0, positives: 0 };
      t.logs++;
      if (row.positive) t.positives++;
      counts.set(key, t);
    }
  }
  return [...counts.values()].sort((a, b) => b.logs - a.logs);
}

function prepare(rows: ConditionsRow[]): Pick<ConditionsModel, 'numeric' | 'levels'> {
  const numeric: ConditionsModel['numeric'] = [];
  for (const spec of NUMERIC_FEATURES) {
    const values = rows
      .map((r) => spec.read(r.situation))
      .filter((v): v is number => v !== null && Number.isFinite(v))
      .map((v) => (spec.transform ? spec.transform(v) : v));
    if (values.length < Math.max(3, rows.length * 0.3)) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
    if (sd < 1e-6) continue;
    numeric.push({ id: spec.id, mean, sd });
  }
  const levels: ConditionsModel['levels'] = [];
  for (const t of tallies(rows)) {
    // A bait tried once can't be told apart from luck.
    if (t.group === 'bait' && t.logs < 2) continue;
    levels.push({ group: t.group, level: t.level });
  }
  return { numeric, levels };
}

function predictWith(spec: Pick<ConditionsModel, 'numeric' | 'levels' | 'intercept' | 'coefficients'>, situation: Situation, bait: string | null): number {
  return sigmoid(linear(spec.intercept, spec.coefficients, design(spec, situation, bait)));
}

/** Chance of catching the animal at this moment with this bait (null: no bait in particular). */
export function predict(model: ConditionsModel, situation: Situation, bait: string | null = null): number {
  return predictWith(model, situation, bait);
}

function validate(rows: ConditionsRow[]): { auc: number | null; folds: number } {
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const positives = rows.filter((r) => r.positive).length;
  const negatives = rows.length - positives;
  if (days.length < 3 || positives < 4 || negatives < 4) return { auc: null, folds: 0 };
  const folds = Math.min(5, days.length);
  const foldOf = new Map(days.map((d, i) => [d, i % folds]));
  const held: { p: number; positive: boolean }[] = [];
  for (let f = 0; f < folds; f++) {
    const train = rows.filter((r) => foldOf.get(r.day) !== f);
    const test = rows.filter((r) => foldOf.get(r.day) === f);
    if (!train.some((r) => r.positive) || train.every((r) => r.positive) || test.length === 0) continue;
    const spec = prepare(train);
    const { intercept, beta } = fitLogistic(
      train.map((r) => design(spec, r.situation, r.bait)),
      train.map((r) => (r.positive ? 1 : 0)),
    );
    for (const r of test) held.push({ p: predictWith({ ...spec, intercept, coefficients: beta }, r.situation, r.bait), positive: r.positive });
  }
  return {
    auc: auc(
      held.filter((h) => h.positive).map((h) => h.p),
      held.filter((h) => !h.positive).map((h) => h.p),
    ),
    folds,
  };
}

/** Average chance over the logs with one thing changed: how much that thing matters on its own. */
function partial(model: ConditionsModel, rows: ConditionsRow[], change: (row: ConditionsRow) => ConditionsRow): number {
  let total = 0;
  for (const row of rows) {
    const changed = change(row);
    total += predict(model, changed.situation, changed.bait);
  }
  return total / rows.length;
}

function effectsOf(model: ConditionsModel, rows: ConditionsRow[]): Effect[] {
  const effects: Effect[] = [];
  const counts = tallies(rows);
  for (const group of ['daypart', 'season'] as const) {
    for (const level of model.levels.filter((l) => l.group === group)) {
      const p = partial(model, rows, (r) => ({ ...r, situation: { ...r.situation, [group]: level.level } }));
      // A time or season that does worse than usual has no single opposite to name; list what
      // helps, and only once it has been fished a few times.
      const logs = counts.find((t) => t.group === group && t.level === level.level)?.logs ?? 0;
      if (p <= model.baseline || logs < 3) continue;
      effects.push({
        id: `${group}:${level.level}`,
        label: group === 'daypart' ? daypartLabels[level.level as Daypart] : seasonLabels[level.level as Season],
        ratio: p / model.baseline,
        logs,
      });
    }
  }
  for (const f of model.numeric) {
    const spec = NUMERIC_FEATURES.find((n) => n.id === f.id)!;
    const index = model.numeric.indexOf(f);
    // Compare the two ends: on/off for yes-no features, a typical spread for the rest.
    const [low, high] = spec.binary ? [(0 - f.mean) / f.sd, (1 - f.mean) / f.sd] : [-1, 1];
    const at = (z: number) => {
      let total = 0;
      for (const row of rows) {
        const x = design(model, row.situation, row.bait);
        x[index] = z;
        total += sigmoid(linear(model.intercept, model.coefficients, x));
      }
      return total / rows.length;
    };
    const ratio = at(high) / at(low);
    const logs = rows.filter((r) => spec.read(r.situation) !== null).length;
    effects.push(ratio >= 1 ? { id: f.id, label: spec.high, ratio, logs } : { id: f.id, label: spec.low, ratio: 1 / ratio, logs });
  }
  return effects.filter((e) => Math.abs(Math.log(e.ratio)) > Math.log(1.1)).sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio)));
}

function baitStats(rows: ConditionsRow[], model: ConditionsModel | null): BaitStat[] {
  return tallies(rows)
    .filter((t) => t.group === 'bait')
    .map((t) => {
      const inModel = model?.levels.some((l) => l.group === 'bait' && l.level === t.level);
      const ratio = model && inModel ? partial(model, rows, (r) => ({ ...r, bait: t.level })) / model.baseline : null;
      return { bait: t.level, logs: t.logs, positives: t.positives, ratio };
    })
    .sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1) || b.positives / b.logs - a.positives / a.logs || b.logs - a.logs);
}

export function fitConditions(targetId: string, rows: ConditionsRow[], now = new Date()): ConditionsModel | ConditionsUnfitted {
  const positives = rows.filter((r) => r.positive).length;
  const negatives = rows.length - positives;
  const counts = tallies(rows);
  if (positives < MIN_POSITIVES || negatives < MIN_NEGATIVES) {
    return {
      reason:
        positives < MIN_POSITIVES
          ? `Needs at least ${MIN_POSITIVES} catches of it (has ${positives}).`
          : `Needs at least ${MIN_NEGATIVES} other fishing logs to compare against (has ${negatives}).`,
      logs: rows.length,
      positives,
      tallies: counts,
      baits: baitStats(rows, null),
    };
  }
  const spec = prepare(rows);
  const { intercept, beta } = fitLogistic(
    rows.map((r) => design(spec, r.situation, r.bait)),
    rows.map((r) => (r.positive ? 1 : 0)),
  );
  const model: ConditionsModel = {
    version: 1,
    targetId,
    fittedAt: now.toISOString(),
    logs: rows.length,
    positives,
    days: new Set(rows.map((r) => r.day)).size,
    ...spec,
    intercept,
    coefficients: beta,
    baseline: 0,
    validation: { auc: null, folds: 0 },
    effects: [],
    baits: [],
    tallies: counts,
  };
  model.baseline = rows.reduce((total, r) => total + predict(model, r.situation, r.bait), 0) / rows.length;
  model.effects = effectsOf(model, rows);
  model.baits = baitStats(rows, model);
  model.validation = validate(rows);
  return model;
}

export function isFitted(model: ConditionsModel | ConditionsUnfitted | null | undefined): model is ConditionsModel {
  return Boolean(model && 'coefficients' in model);
}

// ---------------------------------------------------------------------------
// The week ahead

export type OutlookWindow = {
  start: string;
  end: string;
  /** Chance relative to the usual across your logs. */
  ratio: number;
  daypart: Daypart;
  reasons: string[];
};

/** The features pushing this moment's chance up, in words. */
function reasonsFor(model: ConditionsModel, situation: Situation): string[] {
  const x = design(model, situation, null);
  const parts: Array<{ label: string; value: number }> = [];
  model.numeric.forEach((f, j) => {
    const spec = NUMERIC_FEATURES.find((n) => n.id === f.id)!;
    const value = model.coefficients[j] * x[j];
    parts.push({ label: x[j] >= 0 ? spec.high : spec.low, value });
  });
  model.levels.forEach((l, i) => {
    const j = model.numeric.length + i;
    if (l.group === 'bait' || x[j] === 0) return;
    parts.push({ label: l.group === 'daypart' ? daypartLabels[l.level as Daypart] : seasonLabels[l.level as Season], value: model.coefficients[j] });
  });
  return parts
    .filter((p) => p.value > 0.05)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((p) => p.label);
}

/** The outlook assumes the bait that has done best for this animal, else the one used most. */
export function outlookBait(model: ConditionsModel): string | null {
  const inModel = model.baits.filter((b) => b.ratio !== null);
  return inModel[0]?.bait ?? model.baits[0]?.bait ?? null;
}

/** A window is a fishing session, not a day: at most this long. */
const MAX_WINDOW_HOURS = 4;
/** Two windows this close together are one outing. */
const WINDOW_GAP_HOURS = 3;

/**
 * Rank the coming hours and pick out the best separate stretches: take the
 * best hour not already near a chosen one, widen it to neighbours nearly as
 * good (up to four hours), and repeat.
 */
export function outlook(
  model: ConditionsModel,
  index: ConditionsIndex,
  from: Date,
  { hours = 24 * 7, limit = 3, bait = outlookBait(model) }: { hours?: number; limit?: number; bait?: string | null } = {},
): OutlookWindow[] {
  const start = Math.ceil(from.getTime() / HOUR_MS) * HOUR_MS;
  const scored = Array.from({ length: hours }, (_, i) => {
    const at = new Date(start + i * HOUR_MS);
    const situation = situationAt(at, index);
    return { at, situation, p: predict(model, situation, bait) };
  });
  const order = scored.map((_, i) => i).sort((a, b) => scored[b].p - scored[a].p);
  const chosen: Array<{ from: number; to: number; peak: number }> = [];
  for (const i of order) {
    if (chosen.length >= limit || scored[i].p / model.baseline <= 1.05) break;
    if (chosen.some((w) => i >= w.from - WINDOW_GAP_HOURS && i <= w.to + WINDOW_GAP_HOURS)) continue;
    let [a, b] = [i, i];
    const good = (j: number) => j >= 0 && j < scored.length && scored[j].p >= 0.9 * scored[i].p;
    while (b - a + 1 < MAX_WINDOW_HOURS && (good(a - 1) || good(b + 1))) {
      if (good(a - 1) && (!good(b + 1) || scored[a - 1].p >= scored[b + 1].p)) a--;
      else b++;
    }
    chosen.push({ from: a, to: b, peak: i });
  }
  return chosen.map((w) => {
    const run = scored.slice(w.from, w.to + 1);
    const peak = scored[w.peak];
    return {
      start: run[0].at.toISOString(),
      end: new Date(run[run.length - 1].at.getTime() + HOUR_MS).toISOString(),
      ratio: run.reduce((total, s) => total + s.p, 0) / run.length / model.baseline,
      daypart: peak.situation.daypart,
      reasons: reasonsFor(model, peak.situation),
    };
  });
}
