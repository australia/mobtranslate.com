// @vitest-environment node
// Ported from quinkan-discovery/portal/tests (node:test -> vitest).

import assert from "node:assert/strict";
import {test} from "vitest";
import {haversineMetres, thinByMinimumSpacing} from "@/lib/research/quinkan/spatial-thinning";

// The library uses a spherical earth (R = 6,371,000 m), where one degree of
// latitude is R·π/180 ≈ 111,195 m. Offsets below are chosen well clear of the
// 300 m boundary so the assertions do not hinge on ellipsoid precision.
const base = {latitude: -15.7, longitude: 144.45};
const offsetNorth = (metres: number) => ({...base, latitude: base.latitude + metres / 111_195});

test("haversine distance matches a known latitude offset", () => {
  const d = haversineMetres(base, offsetNorth(1_000));
  assert.ok(Math.abs(d - 1_000) < 5, `expected ~1000 m, got ${d}`);
});

test("thinning keeps the top-ranked proposal of each locale and drops its neighbours", () => {
  const points = [
    {...offsetNorth(0), confidencePercentile: 0.999},
    {...offsetNorth(90), confidencePercentile: 0.998}, // same locale, lower rank -> dropped
    {...offsetNorth(180), confidencePercentile: 0.997}, // still <300 m of the first -> dropped
    {...offsetNorth(600), confidencePercentile: 0.99}, // new locale -> kept
    {...offsetNorth(1_200), confidencePercentile: 0.95}, // new locale -> kept
  ];
  const kept = thinByMinimumSpacing(points, 300, 60);
  assert.deepEqual(
    kept.map((point) => point.confidencePercentile),
    [0.999, 0.99, 0.95],
  );
});

test("thinning is rank-greedy, not order-greedy", () => {
  const points = [
    {...offsetNorth(90), confidencePercentile: 0.5}, // listed first but outranked
    {...offsetNorth(0), confidencePercentile: 0.9},
  ];
  const kept = thinByMinimumSpacing(points, 300, 60);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].confidencePercentile, 0.9);
});

test("thinning respects the maximum count", () => {
  const points = Array.from({length: 10}, (_, index) => ({
    ...offsetNorth(index * 1_000),
    confidencePercentile: 1 - index / 100,
  }));
  assert.equal(thinByMinimumSpacing(points, 300, 4).length, 4);
});

test("degenerate spacing or cap returns an empty list", () => {
  const points = [{...base, confidencePercentile: 0.9}];
  assert.equal(thinByMinimumSpacing(points, 0, 10).length, 0);
  assert.equal(thinByMinimumSpacing(points, Number.NaN, 10).length, 0);
  assert.equal(thinByMinimumSpacing(points, 300, 0).length, 0);
});
