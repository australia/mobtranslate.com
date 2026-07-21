import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ProgressRing } from './motion';
import { C, F, S, radius, shadow } from '../lib/theme';
import type { Accent } from '../lib/accent';
import type { WorklistItem } from '../lib/api';

const SWIPE = 108;

function encouragement(done: number, kind: 'word' | 'sentence'): string {
  const noun = kind === 'word' ? 'words' : 'sentences';
  if (done === 0) return `Record one ${kind} to begin — every clip keeps the language strong.`;
  if (done < 3) return `You kept ${done} ${done === 1 ? kind : noun} strong. Keep going.`;
  if (done < 6) return `${done} ${noun} today — beautiful work.`;
  return `${done} ${noun} today. You're carrying it forward.`;
}

/** A calm one-at-a-time deck (#7): swipe up to record, swipe aside to pass. A
 *  daily progress ring + gentle, non-numeric encouragement sit above it. The
 *  actual record/skip flows are owned by the parent (sheets); the deck just
 *  triggers them and springs back — data removal advances the deck. */
export function RecordDeck({
  items, kind, accent, done, goal = 5, onRecord, onSkip,
}: {
  items: WorklistItem[]; kind: 'word' | 'sentence'; accent: Accent;
  done: number; goal?: number; onRecord: (item: WorklistItem) => void; onSkip: (item: WorklistItem) => void;
}) {
  const top = items[0];
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const fireRecord = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onRecord(top); };
  const fireSkip = () => { Haptics.selectionAsync().catch(() => {}); onSkip(top); };

  const pan = Gesture.Pan()
    .enabled(!!top)
    // only claim the gesture on a deliberate drag, so the screen still scrolls
    .activeOffsetX([-14, 14])
    .activeOffsetY([-14, 14])
    .onUpdate((e) => { tx.value = e.translationX; ty.value = e.translationY; })
    .onEnd((e) => {
      const up = e.translationY < -SWIPE && Math.abs(e.translationX) < SWIPE * 0.9;
      const aside = Math.abs(e.translationX) > SWIPE;
      if (up) runOnJS(fireRecord)();
      else if (aside) runOnJS(fireSkip)();
      tx.value = withSpring(0, { damping: 16, stiffness: 220 });
      ty.value = withSpring(0, { damping: 16, stiffness: 220 });
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value }, { translateY: ty.value },
      { rotateZ: `${interpolate(tx.value, [-200, 200], [-9, 9], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const recordHint = useAnimatedStyle(() => ({ opacity: interpolate(ty.value, [-SWIPE, -30, 0], [1, 0, 0], Extrapolation.CLAMP) }));
  const skipHint = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(tx.value), [30, SWIPE], [0, 1], Extrapolation.CLAMP) }));

  const behind = items.slice(1, 3);

  return (
    <View style={{ gap: 16 }}>
      <View style={styles.progressRow}>
        <ProgressRing progress={Math.min(1, done / goal)} size={56} stroke={5} track={accent.accentSoft} color={accent.accent}>
          <Ionicons name={done >= goal ? 'checkmark' : 'leaf'} size={20} color={accent.accent} />
        </ProgressRing>
        <Text style={styles.encourage}>{encouragement(done, kind)}</Text>
      </View>

      <View style={styles.deck}>
        {/* depth: the next couple of cards peeking behind */}
        {behind.map((it, i) => (
          <View key={it.key} style={[styles.card, styles.cardBehind, {
            transform: [{ scale: 1 - (i + 1) * 0.045 }, { translateY: (i + 1) * 12 }],
            opacity: 1 - (i + 1) * 0.25,
          }]} pointerEvents="none">
            <Text style={styles.word} numberOfLines={1}>{it.label}</Text>
          </View>
        ))}

        {top ? (
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.card, shadow, topStyle]}>
              <Animated.View style={[styles.hint, styles.hintUp, { backgroundColor: accent.accent }, recordHint]}>
                <Ionicons name="mic" size={14} color={C.white} />
                <Text style={styles.hintText}>RECORD</Text>
              </Animated.View>
              <Animated.View style={[styles.hint, styles.hintSide, skipHint]}>
                <Ionicons name="play-skip-forward" size={14} color={C.clay} />
                <Text style={[styles.hintText, { color: C.clay }]}>SKIP</Text>
              </Animated.View>

              <Text style={styles.kind}>{kind === 'word' ? 'WORD' : 'SENTENCE'}</Text>
              <Text style={styles.word} numberOfLines={3}>{top.label}</Text>
              {!!top.gloss && <Text style={styles.gloss} numberOfLines={2}>{top.gloss}</Text>}

              <View style={styles.actions}>
                <View style={styles.swipeCue}><Ionicons name="arrow-back" size={15} color={C.faint} /><Text style={styles.cueText}>skip</Text></View>
                <View style={[styles.micCue, { backgroundColor: accent.accent }]}><Ionicons name="arrow-up" size={16} color={C.white} /><Text style={styles.micCueText}>record</Text></View>
                <View style={styles.swipeCue}><Text style={styles.cueText}>skip</Text><Ionicons name="arrow-forward" size={15} color={C.faint} /></View>
              </View>
            </Animated.View>
          </GestureDetector>
        ) : (
          <View style={[styles.card, styles.cardEmpty]}>
            <Ionicons name="checkmark-circle" size={40} color={accent.accent} />
            <Text style={styles.emptyText}>All done here — thank you for keeping it strong.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  encourage: { flex: 1, fontFamily: F.serifItalic, fontSize: S.body, color: C.sage, lineHeight: 24 },

  deck: { minHeight: 250, alignItems: 'stretch', justifyContent: 'flex-start' },
  card: { backgroundColor: C.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: C.hair, padding: 22, minHeight: 236, justifyContent: 'center', gap: 8 },
  cardBehind: { position: 'absolute', left: 0, right: 0, top: 0 },
  cardEmpty: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontFamily: F.serifItalic, fontSize: S.body, color: C.muted, textAlign: 'center', lineHeight: 24 },

  kind: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  word: { fontFamily: F.displayBold, fontSize: S.display, color: C.ink, lineHeight: S.display * 1.08 },
  gloss: { fontFamily: F.serifItalic, fontSize: S.body, color: C.muted, marginTop: 2 },

  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  swipeCue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cueText: { fontFamily: F.medium, fontSize: S.small, color: C.faint },
  micCue: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: radius.pill },
  micCueText: { fontFamily: F.bold, fontSize: S.small + 1, color: C.white },

  hint: { position: 'absolute', top: 18, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, height: 30, borderRadius: radius.pill, borderWidth: 1 },
  hintUp: { left: '50%', width: 108, marginLeft: -54, justifyContent: 'center', borderColor: 'transparent' },
  hintSide: { right: 18, backgroundColor: C.claySoft, borderColor: 'transparent' },
  hintText: { fontFamily: F.bold, fontSize: S.small, letterSpacing: 1, color: C.white },
});
