import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Button } from './kit';
import { submitWordImprovement, submitTranslationCorrection, type ImprovementType } from '../lib/api';
import { C, F, S, radius } from '../lib/theme';

export type CorrectionTarget =
  | { kind: 'word'; wordId: string; word: string }
  | { kind: 'translation'; languageCode: string; sourceText: string; currentTranslation?: string };

const WORD_FIELDS: { type: ImprovementType; label: string }[] = [
  { type: 'translation', label: 'Translation' },
  { type: 'definition', label: 'Meaning' },
  { type: 'example', label: 'Example' },
  { type: 'pronunciation', label: 'Pronunciation' },
];

export function CorrectionModal({
  visible, target, onClose, onDone,
}: { visible: boolean; target: CorrectionTarget | null; onClose: () => void; onDone?: () => void }) {
  const [type, setType] = useState<ImprovementType>('translation');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() { setType('translation'); setValue(''); setReason(''); setBusy(false); setDone(false); setError(null); }
  function close() { reset(); onClose(); }

  async function submit() {
    if (!target || !value.trim()) return;
    setBusy(true); setError(null);
    try {
      if (target.kind === 'word') {
        await submitWordImprovement(target.wordId, { type, suggestedValue: value.trim(), reason: reason.trim() || undefined });
      } else {
        await submitTranslationCorrection({
          languageCode: target.languageCode, sourceText: target.sourceText,
          currentTranslation: target.currentTranslation, suggestedTranslation: value.trim(), reason: reason.trim() || undefined,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDone(true);
      setTimeout(() => { onDone?.(); close(); }, 1300);
    } catch (e: any) { setError(e?.message || 'Could not submit.'); setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          {done ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 22 }}>
              <View style={styles.tick}><Ionicons name="checkmark" size={30} color={C.white} /></View>
              <Text style={styles.title}>Thank you</Text>
              <Text style={styles.sub}>Your suggestion goes to the language keepers to review.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.kicker}>SUGGEST A CORRECTION</Text>
              <Text style={styles.title}>
                {target?.kind === 'word' ? target.word : `“${target?.sourceText ?? ''}”`}
              </Text>

              {target?.kind === 'word' && (
                <View style={styles.types}>
                  {WORD_FIELDS.map((f) => (
                    <Pressable key={f.type} onPress={() => setType(f.type)}
                      style={[styles.typeChip, type === f.type ? styles.typeOn : styles.typeOff]}>
                      <Text style={[styles.typeText, { color: type === f.type ? C.white : C.ink }]}>{f.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={styles.label}>{target?.kind === 'word' ? `Suggested ${labelFor(type)}` : 'Better translation'}</Text>
              <TextInput value={value} onChangeText={setValue} placeholder="Type your suggestion…"
                placeholderTextColor={C.muted} multiline style={styles.input} />

              <Text style={styles.label}>Why? (optional)</Text>
              <TextInput value={reason} onChangeText={setReason} placeholder="A note for the reviewers…"
                placeholderTextColor={C.muted} style={[styles.input, { minHeight: 48 }]} />

              <Button label="Send suggestion" icon="send" onPress={submit} loading={busy} disabled={!value.trim()} full style={{ marginTop: 14 }} />
              {error && <Text style={styles.error}>{error}</Text>}
              <Text style={styles.foot}>Suggestions are reviewed by the language’s keepers before anything changes.</Text>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function labelFor(t: ImprovementType): string {
  return t === 'definition' ? 'meaning' : t;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 30 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.sageLine, marginBottom: 14 },
  kicker: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  title: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink, marginTop: 4 },
  sub: { fontFamily: F.serifItalic, fontSize: S.body, color: C.muted, textAlign: 'center', lineHeight: 24 },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  typeChip: { paddingHorizontal: 14, height: 38, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1 },
  typeOn: { backgroundColor: C.forest, borderColor: C.forest },
  typeOff: { backgroundColor: C.surface, borderColor: C.border },
  typeText: { fontFamily: F.semibold, fontSize: S.label },
  label: { fontFamily: F.semibold, fontSize: S.label, color: C.ink, marginTop: 14, marginBottom: 8 },
  input: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 14, fontFamily: F.body, fontSize: S.body, color: C.ink, minHeight: 80, textAlignVertical: 'top' },
  error: { fontFamily: F.medium, fontSize: S.label, color: C.danger, textAlign: 'center', marginTop: 10 },
  foot: { fontFamily: F.body, fontSize: S.small, color: C.faint, textAlign: 'center', lineHeight: 18, marginTop: 12 },
  tick: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: C.success, alignItems: 'center', justifyContent: 'center' },
});
