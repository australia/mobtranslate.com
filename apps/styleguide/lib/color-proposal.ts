import {
  argbFromHex,
  hexFromArgb,
  Hct,
  TonalPalette,
  Blend,
  Contrast,
  SchemeTonalSpot,
  SchemeExpressive,
  SchemeFidelity,
  type DynamicColor,
} from '@material/material-color-utilities';

const constructors = {
  tonal: SchemeTonalSpot,
  expressive: SchemeExpressive,
  fidelity: SchemeFidelity,
};
export type ColorVariant = keyof typeof constructors;
export interface ColorProposalInput {
  sourceMode: 'hex' | 'hct';
  sourceHex: string;
  hue: number;
  chroma: number;
  tone: number;
  variant: ColorVariant;
  specVersion: '2021' | '2025';
  isDark: boolean;
  contrastLevel: number;
  customHex: string;
  harmonize: boolean;
}
export const initialColorInput: ColorProposalInput = {
  sourceMode: 'hex',
  sourceHex: '#b45e2a',
  hue: 49,
  chroma: 45,
  tone: 50,
  variant: 'tonal',
  specVersion: '2025',
  isDark: false,
  contrastLevel: 0,
  customHex: '#386b4f',
  harmonize: false,
};
const validHex = (value: string) => /^#[\da-f]{6}$/i.test(value);
export function validateColorInput(input: ColorProposalInput): string[] {
  const errors: string[] = [];
  if (input.sourceMode !== 'hex' && input.sourceMode !== 'hct')
    errors.push('Choose a supported source mode.');
  if (input.sourceMode === 'hex' && !validHex(input.sourceHex))
    errors.push('Source must be an opaque #RRGGBB color.');
  if (input.sourceMode === 'hct') {
    if (!Number.isFinite(input.hue) || input.hue < 0 || input.hue > 360)
      errors.push('Hue must be 0–360 degrees.');
    if (
      !Number.isFinite(input.chroma) ||
      input.chroma < 0 ||
      input.chroma > 150
    )
      errors.push('Chroma must be 0–150.');
    if (!Number.isFinite(input.tone) || input.tone < 0 || input.tone > 100)
      errors.push('Tone must be 0–100.');
  }
  if (!Object.hasOwn(constructors, input.variant))
    errors.push('Choose a supported scheme variant.');
  if (input.specVersion !== '2021' && input.specVersion !== '2025')
    errors.push('Choose a supported specification version.');
  if (
    !Number.isFinite(input.contrastLevel) ||
    input.contrastLevel < -1 ||
    input.contrastLevel > 1
  )
    errors.push('Contrast level must be −1–1.');
  if (!validHex(input.customHex))
    errors.push('Custom color must be an opaque #RRGGBB color.');
  if (typeof input.isDark !== 'boolean' || typeof input.harmonize !== 'boolean')
    errors.push('Theme and harmonization choices must be explicit booleans.');
  return errors;
}
const coordinates = (argb: number) => {
  const color = Hct.fromInt(argb);
  return {
    hex: hexFromArgb(argb),
    hue: color.hue,
    chroma: color.chroma,
    tone: color.tone,
  };
};
export function opaqueColorRatio(first: string, second: string): number {
  if (!validHex(first) || !validHex(second))
    throw new RangeError('Contrast requires two opaque #RRGGBB colors.');
  return Contrast.ratioOfTones(
    Hct.fromInt(argbFromHex(first)).tone,
    Hct.fromInt(argbFromHex(second)).tone,
  );
}
export function buildColorProposal(input: ColorProposalInput) {
  const errors = validateColorInput(input);
  if (errors.length) throw new RangeError(errors.join(' '));
  const source =
    input.sourceMode === 'hex'
      ? Hct.fromInt(argbFromHex(input.sourceHex))
      : Hct.from(input.hue, input.chroma, input.tone);
  const Scheme = constructors[input.variant],
    scheme = new Scheme(
      source,
      input.isDark,
      input.contrastLevel,
      input.specVersion,
      'phone',
    );
  const roles = scheme.colors.allColors.map((color) => {
    const argb = color.getArgb(scheme),
      hex = hexFromArgb(argb);
    const backgrounds = [
      color.background?.(scheme),
      color.secondBackground?.(scheme),
    ].filter(
      (background): background is DynamicColor => background !== undefined,
    );
    const seen = new Set<string>();
    return {
      name: color.name,
      hex,
      tone: Hct.fromInt(argb).tone,
      isBackground: color.isBackground,
      sdkTarget:
        color.contrastCurve?.(scheme)?.get(input.contrastLevel) ?? null,
      backgrounds: backgrounds
        .filter((background) => {
          if (seen.has(background.name)) return false;
          seen.add(background.name);
          return true;
        })
        .map((background) => {
          const backgroundHex = hexFromArgb(background.getArgb(scheme));
          return {
            name: background.name,
            hex: backgroundHex,
            ratio: opaqueColorRatio(hex, backgroundHex),
          };
        }),
    };
  });
  const palettes = Object.entries({
    primary: scheme.primaryPalette,
    secondary: scheme.secondaryPalette,
    tertiary: scheme.tertiaryPalette,
    neutral: scheme.neutralPalette,
    neutralVariant: scheme.neutralVariantPalette,
    error: scheme.errorPalette,
  }).map(([name, palette]) => ({
    name,
    keyColor: coordinates(palette.keyColor.toInt()),
    tones: Array.from({ length: 11 }, (_, index) => ({
      requestedTone: index * 10,
      ...coordinates(palette.tone(index * 10)),
    })),
  }));
  const originalCustom = argbFromHex(input.customHex),
    custom = input.harmonize
      ? Blend.harmonize(originalCustom, source.toInt())
      : originalCustom;
  const customPalette = TonalPalette.fromInt(custom);
  const preview = {
    surface: hexFromArgb(scheme.surface),
    onSurface: hexFromArgb(scheme.onSurface),
    primary: hexFromArgb(scheme.primary),
    onPrimary: hexFromArgb(scheme.onPrimary),
  };
  const safePreview =
    opaqueColorRatio(preview.surface, preview.onSurface) >= 4.5 &&
    opaqueColorRatio(preview.primary, preview.onPrimary) >= 4.5;
  const capturedInput = {
    sourceMode: input.sourceMode,
    sourceHex: input.sourceMode === 'hex' ? input.sourceHex : null,
    requestedHct:
      input.sourceMode === 'hct'
        ? { hue: input.hue, chroma: input.chroma, tone: input.tone }
        : null,
    variant: input.variant,
    specVersion: input.specVersion,
    isDark: input.isDark,
    contrastLevel: input.contrastLevel,
    customHex: input.customHex,
    harmonize: input.harmonize,
  };
  return {
    library: '@material/material-color-utilities@0.4.0',
    input: capturedInput,
    requestedSpec: input.specVersion,
    effectiveSpec: scheme.specVersion,
    platform: scheme.platform,
    source: coordinates(source.toInt()),
    roles,
    palettes,
    custom: {
      original: coordinates(originalCustom),
      result: coordinates(custom),
      harmonized: input.harmonize,
      tones: Array.from({ length: 11 }, (_, index) => ({
        requestedTone: index * 10,
        ...coordinates(customPalette.tone(index * 10)),
      })),
    },
    preview,
    safePreview,
  };
}
