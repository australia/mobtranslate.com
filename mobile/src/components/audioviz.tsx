import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, interpolate, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

/** Soft concentric rings that bloom outward from a speak/record control — an
 *  echo of Country's water rings. Fires while `active`, fades when it stops (#3/#4). */
export function Ripple({ active, color, size = 64, rings = 2 }: {
  active: boolean; color: string; size?: number; rings?: number;
}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {Array.from({ length: rings }).map((_, i) => (
        <RippleRing key={i} active={active} color={color} size={size} delay={i * 700} />
      ))}
    </View>
  );
}

function RippleRing({ active, color, size, delay }: { active: boolean; color: string; size: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (active) {
      t.value = 0;
      t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false));
    } else {
      cancelAnimation(t);
      t.value = withTiming(0, { duration: 220 });
    }
  }, [active]);
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.05, 1], [0, 0.5, 0]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.75, 2.3]) }],
  }));
  const d = size * 0.92;
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: d, height: d, borderRadius: d / 2, borderWidth: 2, borderColor: color },
        style,
      ]}
    />
  );
}

/** A row of bars that undulate while audio plays / records. Pass `level`
 *  (0→1, e.g. smoothed mic metering) to make it react to real amplitude;
 *  otherwise it gently rolls while `active` (a "now playing" pulse). */
export function Waveform({ active, color, level, bars = 5, height = 22, width = 3 }: {
  active: boolean; color: string; level?: SharedValue<number>; bars?: number; height?: number; width?: number;
}) {
  const clock = useSharedValue(0);
  useEffect(() => {
    if (active) {
      clock.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false);
    } else {
      cancelAnimation(clock);
      clock.value = withTiming(0, { duration: 200 });
    }
  }, [active]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: width, height }}>
      {Array.from({ length: bars }).map((_, i) => (
        <Bar key={i} index={i} count={bars} clock={clock} level={level} color={color} height={height} width={width} />
      ))}
    </View>
  );
}

function Bar({ index, count, clock, level, color, height, width }: {
  index: number; count: number; clock: SharedValue<number>; level?: SharedValue<number>; color: string; height: number; width: number;
}) {
  // A smooth per-bar wave; center bars taller. amp scales by real level if given.
  const amp = useDerivedValue(() => {
    'worklet';
    const base = level ? Math.max(0.12, level.value) : (clock.value > 0 ? 1 : 0.12);
    const phase = clock.value * Math.PI * 2 + index * 0.9;
    const centerBias = 1 - Math.abs(index - (count - 1) / 2) / ((count - 1) / 2 || 1) * 0.45;
    return Math.max(0.14, (0.35 + 0.65 * Math.abs(Math.sin(phase))) * base * centerBias);
  });
  const style = useAnimatedStyle(() => ({ height: interpolate(amp.value, [0, 1], [height * 0.16, height]) }));
  return <Animated.View style={[{ width, borderRadius: width, backgroundColor: color }, style]} />;
}
