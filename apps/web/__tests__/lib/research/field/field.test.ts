import { describe, expect, it } from 'vitest';
import { observationBatchSchema, slugifyTarget, targetIdPattern } from '@/lib/research/field/types';
import { bearingDeg, compassPoint, distanceM, formatDistance } from '@/components/research/field/geo';

describe('field targets', () => {
  it('turns names into stable ids', () => {
    expect(slugifyTarget('Long yam')).toBe('long-yam');
    expect(slugifyTarget('  Cheeky yam (Dioscorea bulbifera)  ')).toBe('cheeky-yam-dioscorea-bulbifera');
    expect(targetIdPattern.test(slugifyTarget('Gälpu ŋ yam'))).toBe(true);
    expect(targetIdPattern.test(slugifyTarget('!'))).toBe(true);
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
