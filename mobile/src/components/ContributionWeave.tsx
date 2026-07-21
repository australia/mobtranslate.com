import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { C, F, S, radius } from '../lib/theme';
import type { Accent } from '../lib/accent';

const H = 138;
const N = 7;
const WAVELEN = 66;
const AMP = 9;

function strandPath(w: number, baseY: number, phase: number): string {
  const total = w + WAVELEN * 2;
  let d = `M ${-WAVELEN} ${baseY}`;
  for (let x = -WAVELEN; x <= total - WAVELEN; x += 8) {
    const y = baseY + Math.sin((x / WAVELEN) * Math.PI * 2 + phase) * AMP;
    d += ` L ${x} ${y.toFixed(1)}`;
  }
  return d;
}

function caption(progress: number): string {
  if (progress <= 0) return 'Your thread starts here — record a word to begin the weave.';
  if (progress < 0.34) return 'Your thread is taking shape in the weave.';
  if (progress < 0.7) return 'Woven into the language, clip by clip.';
  return 'A strong thread now — you are carrying Country forward.';
}

/** A living woven river that fills as you contribute (#9): warm, non-numeric.
 *  `progress` (0→1, a gentle log of your recordings) brightens more strands and
 *  the whole weave flows slowly, like water or a braid of thread. */
export function ContributionWeave({ progress, accent }: { progress: number; accent: Accent }) {
  const [w, setW] = useState(320);
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false); }, []);

  const flow = useAnimatedStyle(() => ({ transform: [{ translateX: -WAVELEN * t.value }] }));

  const pad = 20;
  const span = H - pad * 2;
  const active = Math.max(1, Math.round(Math.min(1, progress) * N));

  return (
    <View style={[styles.wrap, { backgroundColor: accent.accentDeep }]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View style={[{ width: w + WAVELEN * 2, height: H }, flow]}>
        <Svg width={w + WAVELEN * 2} height={H}>
          {Array.from({ length: N }).map((_, i) => {
            const baseY = pad + (span * i) / (N - 1);
            const on = i < active;
            // Warm gradient across active strands: accent → gold; faint threads behind.
            const mix = active > 1 ? i / (active - 1) : 0;
            const stroke = on ? blend(accent.accent, C.gold, mix) : 'rgba(255,255,255,0.10)';
            return (
              <Path key={i} d={strandPath(w, baseY, i * 0.8)} stroke={stroke}
                strokeWidth={on ? 3.5 : 2} fill="none" strokeLinecap="round" opacity={on ? 0.92 : 1} />
            );
          })}
        </Svg>
      </Animated.View>
      <View style={styles.scrim} pointerEvents="none" />
      <View style={styles.captionWrap} pointerEvents="none">
        <Text style={styles.captionEyebrow}>YOUR CONTRIBUTION</Text>
        <Text style={styles.caption}>{caption(progress)}</Text>
      </View>
    </View>
  );
}

// Simple hex blend without animation (static per-render mix of two hex colors).
function blend(a: string, b: string, m: number): string {
  const pa = hex(a), pb = hex(b);
  const c = (i: number) => Math.round(pa[i] + (pb[i] - pa[i]) * m);
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}
function hex(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

const styles = StyleSheet.create({
  wrap: { height: H, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,28,22,0.14)' },
  captionWrap: { position: 'absolute', left: 18, right: 18, bottom: 16 },
  captionEyebrow: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: 'rgba(247,243,234,0.7)' },
  caption: { fontFamily: F.serifMedItalic, fontSize: S.body, color: C.cream, marginTop: 3, lineHeight: 23 },
});
