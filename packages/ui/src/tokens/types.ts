/**
 * TypeScript types for design token values.
 */

export type ColorShade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950;

export type ColorPalette = Record<ColorShade, string>;

export type SpacingKey = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24;

export type FontSizeKey = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';

export type FontWeightKey = 'thin' | 'extralight' | 'light' | 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';

export type LineHeightKey = 'tight' | 'snug' | 'normal' | 'relaxed' | 'loose';

export type LetterSpacingKey = 'tighter' | 'tight' | 'normal' | 'wide' | 'wider' | 'widest';

export type RadiusKey = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

export type ShadowKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export type ElevationLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type MotionDuration = 'instant' | 'fast' | 'normal' | 'slow' | 'slower';

export type MotionEasing = 'default' | 'in' | 'out' | 'in-out' | 'bounce';

export type ZIndexKey = 'dropdown' | 'sticky' | 'fixed' | 'modal-backdrop' | 'modal' | 'popover' | 'tooltip' | 'toast';

export type BreakpointKey = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export type OpacityKey = 0 | 5 | 10 | 20 | 25 | 30 | 40 | 50 | 60 | 70 | 75 | 80 | 90 | 95 | 100;

export type ContainerKey = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'prose';

export type TransitionProperty = 'colors' | 'opacity' | 'shadow' | 'transform' | 'all';
