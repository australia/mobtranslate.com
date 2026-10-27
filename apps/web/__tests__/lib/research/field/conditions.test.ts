import { describe, expect, it } from 'vitest';
import {
  almanac,
  baitKey,
  ConditionsIndex,
  daypartAt,
  fitConditions,
  fitLogistic,
  isFitted,
  localDay,
  moonPhaseName,
  outlook,
  seasonAt,
  situationAt,
  type ConditionsRow,
} from '@/lib/research/field/conditions';
import { observationInputSchema, targetUpdateSchema } from '@/lib/research/field/types';
import { baitChoices } from '@/components/research/field/app/CatchForm';
import { dayLabel, shortTime, timeWindow, times } from '@/components/research/field/geo';

const LAT = -15.2;
const LON = 143.85;
const HOUR = 3_600_000;

describe('the sky over Kalinga', () => {
  const day = almanac(new Date('2026-07-15T02:00:00Z'));
  const sunrise = new Date(day.sunrise!);
  const sunset = new Date(day.sunset!);

  it('puts sunrise near 6:50 am and sunset near 6:10 pm Queensland time in July', () => {
    const local = (d: Date) => new Date(d.getTime() + 10 * HOUR).getUTCHours() + new Date(d.getTime() + 10 * HOUR).getUTCMinutes() / 60;
    expect(local(sunrise)).toBeGreaterThan(6.4);
    expect(local(sunrise)).toBeLessThan(7.2);
    expect(local(sunset)).toBeGreaterThan(17.8);
    expect(local(sunset)).toBeLessThan(18.6);
  });

  it('names the parts of the day', () => {
    expect(daypartAt(new Date(sunrise.getTime() + 30 * 60_000), LAT, LON)).toBe('dawn');
    expect(daypartAt(new Date(sunrise.getTime() - 50 * 60_000), LAT, LON)).toBe('dawn');
    expect(daypartAt(new Date(sunrise.getTime() + 5 * HOUR), LAT, LON)).toBe('day');
    expect(daypartAt(new Date(sunset.getTime() - HOUR), LAT, LON)).toBe('dusk');
    expect(daypartAt(new Date(sunset.getTime() + 4 * HOUR), LAT, LON)).toBe('night');
  });

  it('knows the Cape York seasons in Queensland time', () => {
    expect(seasonAt(new Date('2026-01-10T00:00:00Z'))).toBe('wet');
    // 30 Nov 15:00 UTC is already 1 December in Queensland.
    expect(seasonAt(new Date('2026-11-30T15:00:00Z'))).toBe('wet');
    expect(seasonAt(new Date('2026-04-20T00:00:00Z'))).toBe('runoff');
    expect(seasonAt(new Date('2026-07-01T00:00:00Z'))).toBe('dry');
    expect(seasonAt(new Date('2026-10-27T00:00:00Z'))).toBe('buildup');
    expect(localDay(new Date('2026-10-27T15:30:00Z'))).toBe('2026-10-28');
  });

  it('names moon phases', () => {
    expect(moonPhaseName(0)).toBe('New moon');
    expect(moonPhaseName(0.5)).toBe('Full moon');
    expect(moonPhaseName(0.25)).toBe('First quarter');
    expect(moonPhaseName(0.9)).toBe('Waning crescent');
    // 99% lit, a day past full, still looks full.
    expect(moonPhaseName(0.53)).toBe('Full moon');
  });
});

describe('weather and river lookups', () => {
  const start = Date.parse('2026-10-20T00:00:00Z');
  const weather = Array.from({ length: 24 * 8 }, (_, i) => ({
    hour: new Date(start + i * HOUR).toISOString(),
    temperatureC: 30,
    precipitationMm: i >= 24 * 7 ? 2 : 0,
    pressureHpa: 1010 + i * 0.01,
    cloudPct: 20,
    windKmh: 8,
  }));
  const river = Array.from({ length: 24 * 8 }, (_, i) => ({ hour: new Date(start + i * HOUR).toISOString(), levelM: 1 + i * 0.001 }));
  const index = new ConditionsIndex(weather, river);

  it('sums rain over the last day and week', () => {
    const at = new Date(start + (24 * 8 - 1) * HOUR);
    const s = situationAt(at, index);
    expect(s.rain24hMm).toBe(48);
    expect(s.rain7dMm).toBe(48);
    expect(s.pressureChangeHpa).toBeCloseTo(0.24, 5);
    expect(s.riverLevelM).toBeCloseTo(1.191, 5);
    expect(s.riverChange24hM).toBeCloseTo(0.024, 5);
    expect(s.riverChange7dM).toBeCloseTo(0.168, 5);
  });

  it('leaves weather unknown where most hours are missing', () => {
    const s = situationAt(new Date(start - 10 * 24 * HOUR), index);
    expect(s.rain7dMm).toBeNull();
    expect(s.temperatureC).toBeNull();
    expect(s.riverLevelM).toBeNull();
  });

  it('carries the last river reading into the next three days, no further', () => {
    const last = start + (24 * 8 - 1) * HOUR;
    expect(situationAt(new Date(last + 30 * HOUR), index).riverLevelM).toBeCloseTo(1.191, 5);
    expect(situationAt(new Date(last + 100 * HOUR), index).riverLevelM).toBeNull();
  });
});

describe('the when-and-bait model', () => {
  // Forty dry-season days, four logs a day. Sooty grunter take cherabin at
  // dusk; worms and the middle of the day do little.
  function synthetic(): ConditionsRow[] {
    const index = new ConditionsIndex();
    const rows: ConditionsRow[] = [];
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    for (let d = 0; d < 40; d++) {
      const date = new Date(Date.parse('2026-06-01T02:00:00Z') + d * 24 * HOUR);
      const sky = almanac(date);
      const moments = [
        Date.parse(sky.sunrise!) + 30 * 60_000,
        Date.parse(sky.sunrise!) + 5 * HOUR,
        Date.parse(sky.sunset!) - 30 * 60_000,
        Date.parse(sky.sunset!) + 4 * HOUR,
      ];
      moments.forEach((t, i) => {
        const at = new Date(t);
        const bait = (d + i) % 2 === 0 ? 'cherabin' : 'worm';
        const situation = situationAt(at, index);
        const chance = (situation.daypart === 'dusk' ? 0.75 : 0.12) * (bait === 'cherabin' ? 1 : 0.35);
        rows.push({ situation, bait, positive: random() < chance, day: localDay(at) });
      });
    }
    return rows;
  }

  it('fits plain ridge logistic regression', () => {
    const xs = [[-2], [-1], [0], [1], [2], [-1.5], [1.5], [0.5]];
    const ys = [0, 0, 0, 1, 1, 0, 1, 1];
    const { beta } = fitLogistic(xs, ys, 0.1);
    expect(beta[0]).toBeGreaterThan(1);
  });

  it('finds dusk and cherabin, and holds up on days it has not seen', () => {
    const model = fitConditions('sooty-grunter', synthetic());
    expect(isFitted(model)).toBe(true);
    if (!isFitted(model)) return;
    expect(model.effects[0].label).toBe('Dusk');
    expect(model.effects[0].ratio).toBeGreaterThan(1.5);
    expect(model.baits[0].bait).toBe('cherabin');
    expect(model.baits[0].ratio!).toBeGreaterThan(model.baits[1].ratio!);
    // A quarter of the logs are catches and chance is noisy: about 0.68 here.
    expect(model.validation.auc).toBeGreaterThan(0.6);
    expect(model.days).toBe(40);
  });

  it('points the week ahead at dusk', () => {
    const model = fitConditions('sooty-grunter', synthetic());
    if (!isFitted(model)) throw new Error('not fitted');
    const windows = outlook(model, new ConditionsIndex(), new Date('2026-07-20T00:00:00Z'));
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].daypart).toBe('dusk');
    expect(windows[0].ratio).toBeGreaterThan(1);
    expect(windows[0].reasons).toContain('Dusk');
    // Sessions, not whole days: at most four hours each, and apart from each other.
    for (const w of windows) expect(Date.parse(w.end) - Date.parse(w.start)).toBeLessThanOrEqual(4 * HOUR);
    const starts = windows.map((w) => Date.parse(w.start)).sort((a, b) => a - b);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThan(4 * HOUR);
  });

  it('says what is missing before it has enough logs', () => {
    const rows = synthetic().slice(0, 3);
    const model = fitConditions('barramundi', rows.map((r) => ({ ...r, positive: false })));
    expect(isFitted(model)).toBe(false);
    if (isFitted(model)) return;
    expect(model.reason).toMatch(/at least 3 catches/);
    expect(model.baits.length).toBeGreaterThan(0);
  });
});

describe('logging a catch', () => {
  const base = {
    clientId: '3f1c2a9e-6b1d-4c55-9a51-0d6e7f3b2a10',
    targetId: 'sooty-grunter',
    kind: 'presence',
    latitude: -15.2,
    longitude: 143.85,
    observedAt: '2026-10-26T08:12:45.120Z',
  };

  it('accepts the catch details', () => {
    expect(observationInputSchema.safeParse({ ...base, bait: 'cherabin', method: 'handline', catchCount: 2, sizeCm: 32.5, kept: true }).success).toBe(true);
    expect(observationInputSchema.safeParse({ ...base, method: 'spear', bait: null }).success).toBe(true);
  });

  it('rejects bad details', () => {
    expect(observationInputSchema.safeParse({ ...base, method: 'dynamite' }).success).toBe(false);
    expect(observationInputSchema.safeParse({ ...base, catchCount: 0 }).success).toBe(false);
    expect(observationInputSchema.safeParse({ ...base, sizeCm: -4 }).success).toBe(false);
  });

  it('leaves out of a target update what was not sent', () => {
    expect(targetUpdateSchema.parse({ name: 'Sooty' })).toEqual({ name: 'Sooty' });
  });

  it('offers your baits first, then the common ones', () => {
    const choices = baitChoices(['Worm', 'worm ', 'Red claw', null, 'WORM']);
    expect(choices[0]).toBe('worm');
    expect(choices[1]).toBe('red claw');
    expect(choices).toContain('cherabin');
    expect(new Set(choices).size).toBe(choices.length);
    expect(baitKey('  Fish   strip ')).toBe('fish strip');
  });
});

describe('time words', () => {
  // Queensland time, whatever the phone (or test machine) is set to.
  const qld = (day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, 9, day, hour - 10, minute));

  it('reads times at a glance, in Queensland time', () => {
    expect(shortTime(qld(27, 18))).toBe('6 pm');
    expect(shortTime(qld(27, 6, 30))).toBe('6:30 am');
    const now = qld(27, 9);
    expect(timeWindow(qld(28, 16).toISOString(), qld(28, 19).toISOString(), now)).toBe('Tomorrow 4–7 pm');
    expect(timeWindow(qld(27, 22).toISOString(), qld(28, 1).toISOString(), now)).toBe('Today 10 pm – 1 am');
    expect(dayLabel(qld(28, 0, 30), qld(27, 23, 30))).toBe('Tomorrow');
    expect(times(1.84)).toBe('1.8×');
    expect(times(3.4)).toBe('3×');
  });
});
