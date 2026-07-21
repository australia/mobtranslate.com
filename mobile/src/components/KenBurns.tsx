import { useEffect } from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const AImage = Animated.createAnimatedComponent(Image);

/** A watercolour thumbnail that breathes with a slow, subtle Ken-Burns drift (#6).
 *  `seed` (e.g. the row index) varies the pan direction so a list doesn't move in
 *  lockstep. Kept gentle + on the UI thread — cheap for the handful of visible rows. */
export function KenBurns({ source, style, seed = 0, opacity = 1 }: {
  source: any; style?: StyleProp<ImageStyle>; seed?: number; opacity?: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 9000 + (seed % 5) * 900, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, []);
  const dir = seed % 2 === 0 ? 1 : -1;
  const anim = useAnimatedStyle(() => ({
    transform: [
      { scale: 1.04 + t.value * 0.09 },
      { translateX: (t.value - 0.5) * 5 * dir },
      { translateY: (t.value - 0.5) * -4 },
    ],
  }));
  return (
    <Animated.View style={[styles.clip, style]}>
      <AImage source={source} style={[StyleSheet.absoluteFill, { opacity }, anim]} resizeMode="cover" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
