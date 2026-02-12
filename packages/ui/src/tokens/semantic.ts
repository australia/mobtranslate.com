/**
 * Semantic Design Tokens
 * Role-based references to primitive values.
 */

import { colors, shadows } from './primitives';

export const semanticColors = {
  primary: colors.blue[600],
  'primary-hover': colors.blue[700],
  'primary-active': colors.blue[800],
  'primary-foreground': colors.white,

  secondary: colors.red[500],
  'secondary-hover': colors.red[600],
  'secondary-active': colors.red[700],
  'secondary-foreground': colors.white,

  accent: colors.amber[500],
  'accent-hover': colors.amber[600],
  'accent-active': colors.amber[700],
  'accent-foreground': colors.black,

  destructive: colors.red[500],
  'destructive-hover': colors.red[600],
  'destructive-active': colors.red[700],
  'destructive-foreground': colors.white,

  error: colors.red[500],
  'error-hover': colors.red[600],
  'error-foreground': colors.white,

  warning: colors.amber[500],
  'warning-hover': colors.amber[600],
  'warning-foreground': colors.black,

  success: colors.green[600],
  'success-hover': colors.green[700],
  'success-foreground': colors.white,

  info: colors.blue[500],
  'info-hover': colors.blue[600],
  'info-foreground': colors.white,

  muted: colors.gray[100],
  'muted-hover': colors.gray[200],
  'muted-foreground': colors.gray[600],

  background: colors.white,
  foreground: colors.black,

  card: colors.white,
  'card-foreground': colors.black,

  popover: colors.white,
  'popover-foreground': colors.black,

  border: colors.black,
  input: colors.black,
  ring: colors.blue[600],
} as const;

export const darkColors = {
  primary: colors.blue[500],
  'primary-hover': colors.blue[400],
  'primary-active': colors.blue[600],
  'primary-foreground': colors.white,

  secondary: colors.red[400],
  'secondary-hover': colors.red[300],
  'secondary-active': colors.red[500],
  'secondary-foreground': colors.white,

  accent: colors.amber[400],
  'accent-hover': colors.amber[300],
  'accent-active': colors.amber[500],
  'accent-foreground': colors.black,

  destructive: colors.red[400],
  'destructive-hover': colors.red[300],
  'destructive-active': colors.red[500],
  'destructive-foreground': colors.white,

  error: colors.red[400],
  'error-foreground': colors.white,

  warning: colors.amber[400],
  'warning-foreground': colors.black,

  success: colors.green[400],
  'success-hover': colors.green[300],
  'success-foreground': colors.black,

  info: colors.blue[400],
  'info-foreground': colors.white,

  muted: colors.gray[800],
  'muted-hover': colors.gray[700],
  'muted-foreground': colors.gray[400],

  background: colors.slate[900],
  foreground: colors.slate[100],

  card: colors.slate[800],
  'card-foreground': colors.slate[100],

  popover: colors.slate[800],
  'popover-foreground': colors.slate[100],

  border: colors.slate[700],
  input: colors.slate[700],
  ring: colors.blue[500],
} as const;

export const elevation = {
  0: 'none',
  1: shadows.xs,
  2: shadows.sm,
  3: shadows.md,
  4: shadows.lg,
  5: shadows.xl,
} as const;

export const motion = {
  duration: {
    instant: '0ms',
    fast: '100ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

export const zIndex = {
  dropdown: '50',
  sticky: '100',
  fixed: '200',
  'modal-backdrop': '300',
  modal: '400',
  popover: '500',
  tooltip: '600',
  toast: '700',
} as const;

export const focusRing = {
  width: '2px',
  offset: '2px',
  color: 'var(--color-ring)',
} as const;

export const transition = {
  colors: 'color, background-color, border-color, text-decoration-color, fill, stroke',
  opacity: 'opacity',
  shadow: 'box-shadow',
  transform: 'transform',
  all: 'all',
} as const;
