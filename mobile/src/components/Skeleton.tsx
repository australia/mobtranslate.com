import { useEffect } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, interpolate } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { C, radius } from '../lib/theme';

const AGradient = Animated.createAnimatedComponent(LinearGradient);

/** A warm cream/sage shimmer block — never a gray spinner. Fades a soft sheen
 *  across the placeholder so loading feels like paper catching light (#11). */
export function Skeleton({ width, height = 16, radius: r = radius.sm, style }: {
  width?: number | `${number}%`; height?: number; radius?: number; style?: ViewStyle;
}) {
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1250, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, []);
  const sheen = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(x.value, [0, 1], [-140, 140]) }],
    opacity: interpolate(x.value, [0, 0.5, 1], [0, 0.9, 0]),
  }));
  return (
    <View style={[{ width: width as any, height, borderRadius: r, backgroundColor: C.sageSoft, overflow: 'hidden' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, sheen]}>
        <AGradient
          colors={['transparent', 'rgba(255,255,255,0.75)', 'transparent']}
          start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

/** Convenience: a few stacked shimmer lines (last one short, like a paragraph). */
export function SkeletonLines({ count = 3, gap = 9, height = 13 }: { count?: number; gap?: number; height?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} height={height} width={i === count - 1 ? '55%' : '100%'} />
      ))}
    </View>
  );
}
