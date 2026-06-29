import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule, RecordingPresets, createAudioPlayer, setAudioModeAsync, useAudioRecorder, type AudioPlayer,
} from 'expo-audio';
import * as Crypto from 'expo-crypto';
import { BigButton, Card, Header, LangPicker, Screen } from '../../components/kit';
import { uploadRecording } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { languageId, useLanguages } from '../../lib/useLanguages';
import { C, F, S, radius } from '../../lib/theme';

type Phase = 'idle' | 'recording' | 'recorded' | 'saving' | 'done';
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

export default function RecordScreen() {
  const { user, loading: authLoading } = useAuth();
  const { languages } = useLanguages();
  const router = useRouter();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const [code, setCode] = useState('kuku_yalanji');
  const [sentence, setSentence] = useState('');
  const [english, setEnglish] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => { if (languages.length && !languages.some((l) => l.code === code)) setCode(languages[0].code); }, [languages]);
  useEffect(() => () => { if (tick.current) clearInterval(tick.current); player.current?.remove(); }, []);

  async function startRecording() {
    setError(null);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setError('Please allow microphone access to record.'); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setUri(null); setSeconds(0); setPhase('recording');
      tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e: any) { setError(e?.message || 'Could not start recording.'); }
  }
  async function stopRecording() {
    try {
      if (tick.current) clearInterval(tick.current);
      await recorder.stop();
      setUri(recorder.uri ?? null); setPhase('recorded');
    } catch (e: any) { setError(e?.message || 'Could not stop recording.'); }
  }
  function playBack() {
    if (!uri) return;
    try { player.current?.remove(); const p = createAudioPlayer({ uri }); player.current = p; p.play(); } catch {}
  }
  async function save() {
    if (!uri || !sentence.trim()) return;
    const langId = languageId(languages, code);
    if (!langId) { setError('Language not ready — try again in a moment.'); return; }
    setPhase('saving'); setError(null);
    try {
      await uploadRecording({ clientId: Crypto.randomUUID(), languageId: langId, kind: 'sentence',
        label: sentence.trim(), gloss: english.trim() || null, durationMs: seconds * 1000 }, uri);
      setPhase('done');
    } catch (e: any) { setError(e?.message || 'Could not save. Check your connection.'); setPhase('recorded'); }
  }
  function reset() { setSentence(''); setEnglish(''); setUri(null); setSeconds(0); setPhase('idle'); setError(null); }

  if (authLoading) return <Screen><ActivityIndicator color={C.ochre} size="large" style={{ marginTop: 40 }} /></Screen>;

  if (!user) {
    return (
      <Screen>
        <Header kicker="Record" title="Add your voice" sub="Sign in first, so your recordings are saved to you." />
        <BigButton label="Go to Sign in" icon="person" onPress={() => router.push('/account')} />
      </Screen>
    );
  }

  if (phase === 'done') {
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}><Ionicons name="checkmark" size={56} color={C.white} /></View>
          <Text style={styles.doneText}>Saved. Thank you!</Text>
          <BigButton label="Record another" icon="add" onPress={reset} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header kicker="Record" title="Add a sentence" sub="Write it, then record yourself saying it." />
      <LangPicker languages={languages} value={code} onChange={setCode} />

      <Text style={styles.label}>Sentence</Text>
      <TextInput value={sentence} onChangeText={setSentence} placeholder="Write the sentence in language…"
        placeholderTextColor={C.faint} multiline style={styles.input} />

      <Text style={styles.label}>What it means (English) — optional</Text>
      <TextInput value={english} onChangeText={setEnglish} placeholder="English meaning…"
        placeholderTextColor={C.faint} style={[styles.input, { minHeight: 54 }]} />

      {/* Big circular record control */}
      <View style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
        {phase !== 'recording' ? (
          <Pressable onPress={startRecording} style={({ pressed }) => [styles.mic, { backgroundColor: C.ochre, opacity: pressed ? 0.86 : 1 }]}>
            <Ionicons name="mic" size={48} color={C.white} />
          </Pressable>
        ) : (
          <Pressable onPress={stopRecording} style={({ pressed }) => [styles.mic, { backgroundColor: C.danger, opacity: pressed ? 0.86 : 1 }]}>
            <Ionicons name="stop" size={44} color={C.white} />
          </Pressable>
        )}
        <Text style={styles.micLabel}>
          {phase === 'recording' ? `Recording… ${fmt(seconds)}  ·  tap to stop` : uri ? 'Tap to record again' : 'Tap to record'}
        </Text>
      </View>

      {uri && phase !== 'recording' && (
        <Card soft>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <BigButton label="Play" icon="play" tone="ghost" onPress={playBack} style={{ flex: 1 }} />
            <BigButton label="Save" icon="cloud-upload" onPress={save} loading={phase === 'saving'} disabled={!sentence.trim()} style={{ flex: 1 }} />
          </View>
          {!sentence.trim() && <Text style={styles.hint}>Add the sentence text above before saving.</Text>}
        </Card>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  input: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 16, fontFamily: F.body, fontSize: S.body, color: C.ink, minHeight: 100, textAlignVertical: 'top' },
  mic: { width: 116, height: 116, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  micLabel: { fontFamily: F.medium, fontSize: S.label, color: C.muted },
  hint: { fontFamily: F.body, fontSize: S.small, color: C.muted, marginTop: 10, textAlign: 'center' },
  error: { fontFamily: F.medium, fontSize: S.label, color: C.danger },
  doneWrap: { alignItems: 'center', gap: 18, paddingVertical: 50 },
  doneIcon: { width: 96, height: 96, borderRadius: radius.pill, backgroundColor: C.success, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: F.display, fontSize: S.title, color: C.ink },
});
