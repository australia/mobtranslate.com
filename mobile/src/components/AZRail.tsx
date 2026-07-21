import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { C, F, S, radius, shadow } from '../lib/theme';
import type { Accent } from '../lib/accent';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Right-edge alphabet scrubber (#6): drag or tap a letter to jump. Letters with
 *  no loaded words are dimmed; a floating bubble shows the active letter while
 *  you drag. `active` = the set of first-letters currently present. */
export function AZRail({ active, onPick, accent }: {
  active: Set<string>; onPick: (letter: string) => void; accent: Accent;
}) {
  const [h, setH] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const lastRef = useRef<string | null>(null);

  function pickAt(y: number) {
    if (h <= 0) return;
    const idx = Math.max(0, Math.min(ALPHABET.length - 1, Math.floor((y / h) * ALPHABET.length)));
    const letter = ALPHABET[idx];
    if (letter !== lastRef.current) {
      lastRef.current = letter;
      Haptics.selectionAsync().catch(() => {});
      onPick(letter);
      setBubble(letter);
    }
  }
  function endPick() { lastRef.current = null; setBubble(null); }

  const pan = Gesture.Pan()
    .onBegin((e) => runOnJS(pickAt)(e.y))
    .onUpdate((e) => runOnJS(pickAt)(e.y))
    .onFinalize(() => runOnJS(endPick)());
  const tap = Gesture.Tap().onEnd((e) => { runOnJS(pickAt)(e.y); runOnJS(endPick)(); });

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      {bubble && (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(160)} style={[styles.bubble, { backgroundColor: accent.accent }]}>
          <Text style={styles.bubbleText}>{bubble}</Text>
        </Animated.View>
      )}
      <GestureDetector gesture={Gesture.Simultaneous(pan, tap)}>
        <View style={styles.rail} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
          {ALPHABET.map((l) => {
            const on = active.has(l);
            return (
              <Text key={l} style={[styles.letter, { color: bubble === l ? accent.accent : on ? C.muted : C.faint, fontFamily: on ? F.bold : F.medium }]}>
                {l}
              </Text>
            );
          })}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 2, top: 8, bottom: 8, justifyContent: 'center', alignItems: 'flex-end' },
  rail: { paddingHorizontal: 6, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 10.5, lineHeight: 15, letterSpacing: 0.3, textAlign: 'center', width: 16 },
  bubble: { position: 'absolute', right: 34, width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', ...shadow },
  bubbleText: { fontFamily: F.displayBold, fontSize: 30, color: C.white },
});
