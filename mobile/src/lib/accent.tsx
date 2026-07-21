import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Easing } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useLang } from './langContext';

/** A Country-keyed accent palette. The app's warm cream base stays constant;
 *  these accents re-tint the "living" surfaces (hero wash, active pills, the
 *  speak ripple, section accents) so each language feels like its own place. */
export interface Accent {
  accent: string;      // primary accent for this Country
  accentDeep: string;  // darker accent (pressed / deep text)
  accentSoft: string;  // pale wash (chips, active pills)
  accentLine: string;  // hairline / selected border
  wash: [string, string]; // hero gradient top→bottom (fades to paper)
  rgb: string;         // "r,g,b" of accent, for rgba() ripples
}

const FOREST: Accent = { accent: '#324E3B', accentDeep: '#22382A', accentSoft: '#E7EEE3', accentLine: '#D2DECE', wash: ['#EAF0E4', '#F4F1E8'], rgb: '50,78,59' };

export const ACCENTS: Record<string, Accent> = {
  // Far North Queensland wet-tropics — rainforest green + reef water
  kuku_yalanji: { accent: '#2E7D6B', accentDeep: '#1C5A4C', accentSoft: '#DEEDE8', accentLine: '#BFDDD5', wash: ['#E9F1EC', '#F4F1E8'], rgb: '46,125,107' },
  // Groote Eylandt — turquoise sea + red sandstone
  anindilyakwa: { accent: '#2C8AA0', accentDeep: '#1C6373', accentSoft: '#DBEEF1', accentLine: '#BCE0E6', wash: ['#E4F0F2', '#F4F1E8'], rgb: '44,138,160' },
  // Mi'kma'ki, Atlantic Canada — slate blue + birch woodland
  migmaq: { accent: '#4F6D88', accentDeep: '#384F66', accentSoft: '#E2E9EF', accentLine: '#C7D4DE', wash: ['#E9EEF2', '#F4F1E8'], rgb: '79,109,136' },
  // Pilbara desert — red ochre + spinifex gold
  wbv: { accent: '#B26A3C', accentDeep: '#8A4E29', accentSoft: '#F1E3D4', accentLine: '#E4CDB2', wash: ['#F3EADD', '#F4F1E8'], rgb: '178,106,60' },
  default: FOREST,
};

export function accentFor(code: string): Accent {
  return ACCENTS[code] ?? FOREST;
}

interface AccentCtx {
  accent: Accent;         // the current (target) palette — for static reads
  from: Accent;           // previous palette (for cross-fade)
  t: SharedValue<number>; // 0→1 fade progress from `from` to `accent`
}
const Ctx = createContext<AccentCtx | null>(null);

/** Drives a smooth cross-fade of accent-bearing surfaces whenever the language
 *  changes. Sits inside LanguageProvider so it can read the active code. */
export function AccentProvider({ children }: { children: React.ReactNode }) {
  const { code } = useLang();
  const [pair, setPair] = useState<{ from: Accent; to: Accent }>(() => {
    const a = accentFor(code);
    return { from: a, to: a };
  });
  const t = useSharedValue(1);
  const lastCode = useRef(code);

  useEffect(() => {
    if (code === lastCode.current) return;
    lastCode.current = code;
    setPair((p) => ({ from: p.to, to: accentFor(code) }));
    t.value = 0;
    t.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
  }, [code]);

  return <Ctx.Provider value={{ accent: pair.to, from: pair.from, t }}>{children}</Ctx.Provider>;
}

/** Static current accent (safe fallback outside the provider). */
export function useAccent(): Accent {
  const ctx = useContext(Ctx);
  return ctx?.accent ?? FOREST;
}

/** Raw cross-fade state for bespoke animations (e.g. the hero's two washes). */
export function useAccentFade(): AccentCtx {
  const ctx = useContext(Ctx);
  const t = useSharedValue(1);
  return ctx ?? { accent: FOREST, from: FOREST, t };
}

/** A soft top-of-screen wash in the current Country's colour that cross-fades
 *  whenever the language changes (#1). Render it as the first child of a screen;
 *  it's absolutely positioned and bleeds full-width behind the header + hero. */
export function AccentWash({ height = 340, bleed = 20 }: { height?: number; bleed?: number }) {
  const { from, accent, t } = useAccentFade();
  const nextStyle = useAnimatedStyle(() => ({ opacity: t.value }));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -bleed, left: -bleed, right: -bleed, height }}>
      <LinearGradient colors={[from.wash[0], from.wash[1]]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, nextStyle]}>
        <LinearGradient colors={[accent.wash[0], accent.wash[1]]} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

type ColorProp = 'color' | 'backgroundColor' | 'borderColor' | 'tintColor' | 'shadowColor';
/** An animated style that cross-fades one accent color as the language changes. */
export function useAccentColor(key: keyof Omit<Accent, 'wash' | 'rgb'>, prop: ColorProp = 'color') {
  const ctx = useContext(Ctx);
  const t = ctx?.t;
  const from = ctx?.from ?? FOREST;
  const to = ctx?.accent ?? FOREST;
  return useAnimatedStyle(() => {
    'worklet';
    const v = t ? t.value : 1;
    return { [prop]: interpolateColor(v, [0, 1], [from[key], to[key]]) } as any;
  });
}
