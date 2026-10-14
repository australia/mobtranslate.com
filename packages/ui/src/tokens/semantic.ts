/** Authored semantic values; CSS variables follow theme changes and local overrides. */
import { semanticColorValues, darkColorValues, shadows, darkShadows, transitionValues } from './generated';
export { motion, zIndex, focusRing, cssTokens, darkCssTokens } from './generated';

export const semanticColors = {
  ...semanticColorValues,
  /** @deprecated Helper alias; use destructive-hover or the live CSS role. */
  'error-hover': semanticColorValues['destructive-hover'],
  /** @deprecated Helper alias; use accent-hover or the live CSS role. */
  'warning-hover': semanticColorValues['accent-hover'],
  /** @deprecated No authored info-hover role; retain the info fill. */
  'info-hover': semanticColorValues.info,
} as const;
export const darkColors = {
  ...darkColorValues,
  'error-hover': darkColorValues['destructive-hover'],
  'warning-hover': darkColorValues['accent-hover'],
  'info-hover': darkColorValues.info,
} as const;

export const elevation = {
  0: 'none', 1: shadows.xs, 2: shadows.sm, 3: shadows.md, 4: shadows.lg, 5: shadows.xl,
} as const;
export const darkElevation = {
  0: 'none', 1: darkShadows.xs, 2: darkShadows.sm, 3: darkShadows.md, 4: darkShadows.lg, 5: darkShadows.xl,
} as const;
export const transition = { ...transitionValues, all: 'all' } as const;
