/** CSS-derived authored primitives. Prefer CSS variables for runtime theme/scoped styling. */
import { textSizes } from './generated';
export { colors, spacing, textSizes, fontFamily, borderRadius, shadows, darkShadows, breakpoints, opacity, containers } from './generated';

/** Typography helpers: line-height/weight/tracking presets are not CSS token declarations. */
export const fontSize = {
  xs: [textSizes['xs'], { lineHeight: '1rem' }],
  sm: [textSizes['sm'], { lineHeight: '1.25rem' }],
  base: [textSizes['base'], { lineHeight: '1.5rem' }],
  lg: [textSizes['lg'], { lineHeight: '1.75rem' }],
  xl: [textSizes['xl'], { lineHeight: '1.75rem' }],
  '2xl': [textSizes['2xl'], { lineHeight: '2rem' }],
  '3xl': [textSizes['3xl'], { lineHeight: '2.25rem' }],
  '4xl': [textSizes['4xl'], { lineHeight: '2.5rem' }],
  '5xl': [textSizes['5xl'], { lineHeight: '1' }],
  '6xl': [textSizes['6xl'], { lineHeight: '1' }],
} as const;

export const fontWeight = {
  thin: '100',
  extralight: '200',
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const;

export const lineHeight = {
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
} as const;

export const letterSpacing = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
} as const;
