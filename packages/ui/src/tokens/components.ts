/**
 * Component-Level Design Tokens
 * Per-component overrides referencing semantic tokens.
 */

export const buttonTokens = {
  sm: { height: '2.25rem', paddingX: '0.75rem', fontSize: '0.875rem' },
  md: { height: '2.75rem', paddingX: '1rem', fontSize: '1rem' },
  lg: { height: '3rem', paddingX: '1.5rem', fontSize: '1.125rem' },
  icon: { height: '2.75rem', width: '2.75rem', fontSize: '1rem' },
  radius: 'var(--radius-md)',
} as const;

export const inputTokens = {
  sm: { height: '2.25rem', paddingX: '0.625rem', fontSize: '0.875rem' },
  md: { height: '2.75rem', paddingX: '0.75rem', fontSize: '1rem' },
  lg: { height: '3rem', paddingX: '1rem', fontSize: '1.125rem' },
  borderWidth: '2px',
  radius: 'var(--radius-md)',
} as const;

export const dialogTokens = {
  sm: { maxWidth: '24rem' },
  md: { maxWidth: '32rem' },
  lg: { maxWidth: '42rem' },
  xl: { maxWidth: '56rem' },
  padding: '1.5rem',
  backdropOpacity: '0.5',
  radius: 'var(--radius-lg)',
} as const;

export const selectTokens = {
  triggerHeight: '2.75rem',
  contentMaxHeight: '16rem',
  itemPaddingX: '0.5rem',
  itemPaddingY: '0.375rem',
  radius: 'var(--radius-md)',
} as const;

export const tabsTokens = {
  listHeight: '2.75rem',
  triggerPaddingX: '1rem',
  radius: 'var(--radius-md)',
} as const;

export const tooltipTokens = {
  paddingX: '0.75rem',
  paddingY: '0.375rem',
  fontSize: '0.875rem',
  radius: 'var(--radius-md)',
  maxWidth: '20rem',
} as const;

export const popoverTokens = {
  padding: '1rem',
  radius: 'var(--radius-lg)',
  maxWidth: '24rem',
} as const;

export const toastTokens = {
  padding: '1rem',
  radius: 'var(--radius-lg)',
  maxWidth: '26rem',
} as const;

export const checkboxTokens = {
  size: '1.25rem',
  radius: 'var(--radius-sm)',
} as const;

export const switchTokens = {
  width: '2.75rem',
  height: '1.5rem',
  thumbSize: '1.25rem',
  radius: 'var(--radius-full)',
} as const;

export const radioTokens = {
  size: '1.25rem',
  dotSize: '0.5rem',
} as const;

export const sliderTokens = {
  trackHeight: '0.375rem',
  thumbSize: '1.25rem',
  radius: 'var(--radius-full)',
} as const;

export const progressTokens = {
  height: '0.5rem',
  radius: 'var(--radius-full)',
} as const;

export const menuTokens = {
  itemPaddingX: '0.5rem',
  itemPaddingY: '0.375rem',
  radius: 'var(--radius-md)',
  minWidth: '12rem',
} as const;

export const accordionTokens = {
  headerPadding: '1rem',
  contentPadding: '1rem',
  radius: 'var(--radius-md)',
} as const;

export const avatarTokens = {
  sm: { size: '2rem', fontSize: '0.75rem' },
  md: { size: '2.5rem', fontSize: '0.875rem' },
  lg: { size: '3rem', fontSize: '1rem' },
  xl: { size: '4rem', fontSize: '1.25rem' },
} as const;

export const separatorTokens = {
  thickness: '1px',
} as const;

export const meterTokens = {
  height: '0.5rem',
  radius: 'var(--radius-full)',
} as const;

export const scrollAreaTokens = {
  scrollbarSize: '0.5rem',
  scrollbarRadius: 'var(--radius-full)',
} as const;
