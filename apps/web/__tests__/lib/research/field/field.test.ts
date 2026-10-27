import { describe, expect, it } from 'vitest';
import { observationBatchSchema, samplingGroupOf, slugifyTarget, targetIdPattern } from '@/lib/research/field/types';
import { bearingDeg, compassPoint, distanceM, formatDistance } from '@/components/research/field/geo';

describe('field targets', () => {
  it('turns names into stable ids', () => {
    expect(slugifyTarget('Long yam')).toBe('long-yam');
    expect(slugifyTarget('  Cheeky yam (Dioscorea bulbifera)  ')).toBe('cheeky-yam-dioscorea-bulbifera');
    expect(targetIdPattern.test(slugifyTarget('Gälpu ŋ yam'))).toBe(true);
    expect(targetIdPattern.test(slugifyTarget('!'))).toBe(true);
  });
});

describe('sampling groups', () => {
  it('takes the group most public records belong to', () => {
    const goanna = { kingdom: 'Animalia', className: 'Reptilia' };
    expect(samplingGroupOf([goanna, goanna, { kingdom: 'Animalia', className: 'Aves' }])).toBe('reptiles');
    expect(samplingGroupOf([{ kingdom: 'Plantae', className: 'Liliopsida' }])).toBe('plants');
    expect(samplingGroupOf([{ kingdom: 'Animalia', className: 'Actinopterygii' }])).toBe('fish');
  });

  it('leaves mixed or unknown records ungrouped', () => {
    expect(samplingGroupOf([])).toBeNull();
    expect(samplingGroupOf([{ kingdom: 'Animalia', className: 'Aves' }])).toBeNull();
    expect(samplingGroupOf([{ kingdom: 'Plantae' }, { kingdom: 'Animalia', className: 'Mammalia' }])).toBeNull();
  });
});

describe('observation uploads', () => {
  const base = {
    clientId: '3f1c2a9e-6b1d-4c55-9a51-0d6e7f3b2a10',
    targetId: 'long-yam',
    kind: 'presence',
    latitude: -15.2,
    longitude: 143.85,
    accuracyM: 4.2,
    observedAt: '2026-10-26T03:12:45.120Z',
  };

  it('accepts a phone batch', () => {
    expect(observationBatchSchema.safeParse({ observations: [base, { ...base, clientId: 'abcdef12', kind: 'absence' }] }).success).toBe(true);
  });

  it('rejects malformed finds', () => {
    for (const bad of [
      { ...base, latitude: -91 },
      { ...base, kind: 'maybe' },
      { ...base, clientId: 'x' },
      { ...base, targetId: 'Long Yam' },
      { ...base, observedAt: 'yesterday' },
    ]) {
      expect(observationBatchSchema.safeParse({ observations: [bad] }).success).toBe(false);
    }
    expect(observationBatchSchema.safeParse({ observations: [] }).success).toBe(false);
  });
});

describe('where-to-look geometry', () => {
  it('measures distance and direction', () => {
    const d = distanceM(-15.2, 143.85, -15.19, 143.85);
    expect(d).toBeGreaterThan(1100);
    expect(d).toBeLessThan(1120);
    expect(compassPoint(bearingDeg(-15.2, 143.85, -15.19, 143.85))).toBe('N');
    expect(compassPoint(bearingDeg(-15.2, 143.85, -15.2, 143.86))).toBe('E');
    expect(formatDistance(343)).toBe('340 m');
    expect(formatDistance(2345)).toBe('2.3 km');
  });
});

describe('plain-language field copy', () => {
  it('says directions as words and ranks as shares of the station', async () => {
    const { directionWords, topShare, whenLogged, inBounds } = await import('@/components/research/field/geo');
    expect(directionWords(0)).toBe('north');
    expect(directionWords(44)).toBe('north-east');
    expect(directionWords(181)).toBe('south');
    expect(directionWords(359)).toBe('north');
    expect(topShare(97.2)).toBe('top 3%');
    expect(topShare(99.99)).toBe('top 1%');
    const now = new Date('2026-10-26T12:00:00');
    expect(whenLogged('2026-10-26T09:42:00', now)).toMatch(/^Today /);
    expect(whenLogged('2026-10-25T09:42:00', now)).toMatch(/^Yesterday /);
    const box = { west: 143.6, south: -15.45, east: 144.1, north: -14.95 };
    expect(inBounds(box, 143.85, -15.2)).toBe(true);
    expect(inBounds(box, 145, -15.2)).toBe(false);
    expect(inBounds(null, 143.85, -15.2)).toBe(false);
  });
});

describe('position quality', () => {
  it('turns GPS accuracy into words', async () => {
    const { fixQuality } = await import('@/components/research/field/app/sensors');
    expect(fixQuality(5).level).toBe('good');
    expect(fixQuality(20).level).toBe('fair');
    expect(fixQuality(80).level).toBe('weak');
  });
});
