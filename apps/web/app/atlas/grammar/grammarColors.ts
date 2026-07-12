// Value → colour + honest grey-state helpers for the /atlas/grammar lens.
//
// Colours are fixed hex (not theme tokens): the circles paint onto a raster
// basemap, so they must read on BOTH light and dark tiles. Drawn from the same
// earth palette as the hub map (atlasConfig) so the atlas stays grounded.
//
// HONESTY: '?'-unknown and not-coded and not-profiled are ALL rendered as
// explicit distinct greys — never conflated with 'absent' (which is a real,
// categorical value with its own colour). Value labels are ALWAYS spelled out in
// the legend, so colour is never the only signal (WCAG "never colour alone").

// Binary present/absent get fixed, strongly-contrasting earth colours.
export const PRESENT_COLOR = '#2f7d5a'; // eucalyptus green
export const ABSENT_COLOR = '#cf7b3a'; // clay / amber

// Multistate ("value") features cycle this categorical earth palette, assigned
// by descending frequency so the commonest value is the most stable colour.
export const VALUE_PALETTE = [
  '#3f6bb0', // nightsky blue
  '#7d4a9e', // muted purple
  '#2f9c95', // teal
  '#c69223', // amber gold
  '#c94f6d', // rose
  '#6f9a2f', // olive
  '#4b93c4', // sky blue
  '#a83e3e', // deep red
  '#8a6d3b', // earth brown
  '#5f8f6a', // sage
  '#b0742c', // burnt orange
];

// Honest grey states — visibly distinct from any categorical value.
export const GREY_UNKNOWN = '#9c8f7c'; // coded '?' (the coder marked it unknown)
export const GREY_NA = '#b9b0a0'; // coded N/A (feature not applicable)
export const GREY_NOT_CODED = '#ccc4b5'; // profiled, but this feature was not coded
export const NEUTRAL_FAINT = '#8a8172'; // located but NOT grammatically profiled at all

export type StateChar = 'p' | 'a' | 'v' | 'u' | 'x';

export interface FeatureValue {
  v: string;
  state: string; // present | absent | value | na
  count: number;
}

export interface ValueLegendRow {
  value: string; // spelled-out label
  color: string;
  count: number;
  kind: 'value';
}

export interface ValueColoring {
  /** resolved value label -> hex colour */
  colorByValue: Record<string, string>;
  /** ordered legend rows for the real values (most common first) */
  legend: ValueLegendRow[];
}

const isPresent = (s: string) => /^(present|yes)$/i.test(s.trim());
const isAbsent = (s: string) => /^(absent|none|no)$/i.test(s.trim());

/**
 * Deterministic value -> colour assignment for one feature. present/absent keep
 * their fixed colours even inside a multistate feature; every other distinct
 * value takes the next categorical earth colour.
 */
export function buildValueColors(values: FeatureValue[]): ValueColoring {
  const colorByValue: Record<string, string> = {};
  const legend: ValueLegendRow[] = [];
  let paletteIdx = 0;
  for (const { v, count } of values) {
    let color: string;
    if (isPresent(v)) color = PRESENT_COLOR;
    else if (isAbsent(v)) color = ABSENT_COLOR;
    else color = VALUE_PALETTE[paletteIdx++ % VALUE_PALETTE.length];
    colorByValue[v] = color;
    legend.push({ value: v, color, count, kind: 'value' });
  }
  return { colorByValue, legend };
}

/** Colour for one language's datum given its [value,stateChar] (or absence). */
export function colorForDatum(
  datum: [string, StateChar] | undefined,
  colorByValue: Record<string, string>,
  profiled: boolean,
): { color: string; opacity: number; kind: 'value' | 'unknown' | 'na' | 'not_coded' | 'not_profiled' } {
  if (datum) {
    const [value, sc] = datum;
    if (sc === 'u') return { color: GREY_UNKNOWN, opacity: 0.55, kind: 'unknown' };
    if (sc === 'x') return { color: GREY_NA, opacity: 0.5, kind: 'na' };
    return { color: colorByValue[value] ?? VALUE_PALETTE[0], opacity: 0.92, kind: 'value' };
  }
  if (profiled) return { color: GREY_NOT_CODED, opacity: 0.5, kind: 'not_coded' };
  return { color: NEUTRAL_FAINT, opacity: 0.16, kind: 'not_profiled' };
}

export const humanizeDomain = (d: string | null | undefined): string =>
  !d || d === 'other' || d === 'Other'
    ? 'Other'
    : d
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/\bAnd\b/g, 'and')
        .replace(/\bOr\b/g, 'or');

export function familyLabel(f: string): string {
  return f === 'unclassified' ? 'Unclassified' : f;
}
