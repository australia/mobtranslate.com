import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { AnimatedMark } from './AnimatedMark';
import { C, F } from '../lib/theme';

/** A brief branded intro over the app on cold start (#2): the mark's two pages
 *  settle together into the logo, the wordmark rises, then the whole thing fades
 *  to reveal the app. Self-dismisses; calls `onDone` when gone. */
export function SplashReveal({ onDone }: { onDone: () => void }) {
  const op = useSharedValue(1);
  useEffect(() => {
    op.value = withDelay(1050, withTiming(0, { duration: 440 }, (fin) => { if (fin) runOnJS(onDone)(); }));
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  const wordmark = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <Animated.View style={[styles.fill, style]} pointerEvents="none">
      <AnimatedMark size={104} mode="reveal" />
      <Animated.View style={[styles.words, wordmark]}>
        <Text style={styles.name}>Mob Translate</Text>
        <Text style={styles.tag}>Community-built. Country-owned.</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 22 },
  words: { alignItems: 'center', gap: 4 },
  name: { fontFamily: F.bold, fontSize: 22, color: C.ink, letterSpacing: 0.2 },
  tag: { fontFamily: F.medium, fontSize: 12.5, color: C.muted },
});
