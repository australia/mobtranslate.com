import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Button } from './kit';
import { type SkipReason } from '../lib/api';
import { C, F, S, radius, shadow } from '../lib/theme';

const AView = Animated.createAnimatedComponent(View);

const REASONS: { key: SkipReason; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'unsure', label: "I'm not sure how to say it", icon: 'help-circle-outline' },
  { key: 'bad_sentence', label: "This sentence doesn't make sense", icon: 'warning-outline' },
  { key: 'wrong_spelling', label: 'The spelling looks wrong', icon: 'create-outline' },
  { key: 'inappropriate', label: 'Not right to record', icon: 'hand-left-outline' },
  { key: 'too_hard', label: 'Too hard right now', icon: 'hourglass-outline' },
  { key: 'other', label: 'Another reason', icon: 'ellipsis-horizontal' },
];

/** Polished "pass on this one" sheet: pick an optional reason (staggered chips,
 *  haptics), add an optional note, and skip. Reason/note are a quality signal for
 *  keepers — but skipping is never blocked. */
export function SkipSheet({
  kind, label, onSkip, onClose,
}: {
  kind: 'word' | 'sentence';
  label: string;
  onSkip: (reason: SkipReason | null, note: string) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<SkipReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function pick(k: SkipReason) {
    Haptics.selectionAsync().catch(() => {});
    setReason((r) => (r === k ? null : k));
  }
  async function submit() {
    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // onSkip owns dismissing the whole flow; Cancel/backdrop use onClose instead.
    try { await onSkip(reason, note.trim()); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <AView entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <AView entering={FadeInDown.springify().damping(20).mass(0.7)} style={styles.sheet}>
          <View style={styles.grip} />
          <View style={styles.header}>
            <View style={styles.passIcon}><Ionicons name="play-skip-forward" size={18} color={C.clay} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Pass on this one?</Text>
              <Text style={styles.sub}>You can skip it. If something’s off, tell the keepers why — it makes the {kind === 'word' ? 'dictionary' : 'sentences'} better.</Text>
            </View>
          </View>

          <Text style={styles.item} numberOfLines={2}>“{label}”</Text>

          <View style={styles.chips}>
            {REASONS.map((r, i) => {
              const on = reason === r.key;
              return (
                <Animated.View key={r.key} entering={FadeInDown.delay(60 + i * 45).springify().damping(18)}>
                  <Pressable
                    onPress={() => pick(r.key)}
                    style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { transform: [{ scale: 0.97 }] }]}
                  >
                    <Ionicons name={on ? 'checkmark-circle' : r.icon} size={17} color={on ? C.white : C.clay} />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.label}</Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>

          {(reason === 'other' || note.length > 0) && (
            <Animated.View entering={FadeInDown.springify().damping(18)}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Add a note (optional)"
                placeholderTextColor={C.faint}
                style={styles.note}
                multiline
              />
            </Animated.View>
          )}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button
              label={reason || note ? 'Skip & send' : 'Skip this one'}
              icon="play-skip-forward"
              onPress={submit}
              loading={busy}
              style={{ flex: 1.5 }}
            />
          </View>
        </AView>
      </AView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 30, ...shadow },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.sageLine, marginBottom: 16 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  passIcon: { width: 38, height: 38, borderRadius: radius.pill, backgroundColor: C.claySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink },
  sub: { fontFamily: F.body, fontSize: S.small, color: C.muted, marginTop: 2, lineHeight: 18 },
  item: { fontFamily: F.serifItalic, fontSize: S.body, color: C.sage, marginTop: 14, marginBottom: 4 },
  chips: { gap: 9, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, paddingVertical: 13, paddingHorizontal: 14 },
  chipOn: { backgroundColor: C.clay, borderColor: C.clay },
  chipText: { flex: 1, fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  chipTextOn: { color: C.white },
  note: { marginTop: 12, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 14, minHeight: 60, fontFamily: F.body, fontSize: S.label, color: C.ink, textAlignVertical: 'top' },
});
