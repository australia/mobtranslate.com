import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule, RecordingPresets, createAudioPlayer, setAudioModeAsync, useAudioRecorder, type AudioPlayer,
} from 'expo-audio';
import * as Crypto from 'expo-crypto';
import { BigButton, Card, LangPicker, Screen, Sub, Title } from '../../components/kit';
import { uploadRecording } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { languageId, useLanguages } from '../../lib/useLanguages';
import { C, S, radius } from '../../lib/theme';

type Phase = 'idle' | 'recording' | 'recorded' | 'saving' | 'done';

function fmt(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

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

  useEffect(() => {
    if (languages.length && !languages.some((l) => l.code === code)) setCode(languages[0].code);
  }, [languages]);

  useEffect(() => () => {
    if (tick.current) clearInterval(tick.current);
    player.current?.remove();
  }, []);

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
    } catch (e: any) {
      setError(e?.message || 'Could not start recording.');
    }
  }

  async function stopRecording() {
    try {
      if (tick.current) clearInterval(tick.current);
      await recorder.stop();
      setUri(recorder.uri ?? null);
      setPhase('recorded');
    } catch (e: any) {
      setError(e?.message || 'Could not stop recording.');
    }
  }

  function playBack() {
    if (!uri) return;
    try {
      player.current?.remove();
      const p = createAudioPlayer({ uri });
      player.current = p;
      p.play();
    } catch { /* ignore */ }
  }

  async function save() {
    if (!uri || !sentence.trim()) return;
    const langId = languageId(languages, code);
    if (!langId) { setError('Language not ready — try again in a moment.'); return; }
    setPhase('saving'); setError(null);
    try {
      await uploadRecording(
        {
          clientId: Crypto.randomUUID(),
          languageId: langId,
          kind: 'sentence',
          label: sentence.trim(),
          gloss: english.trim() || null,
          durationMs: seconds * 1000,
        },
        uri,
      );
      setPhase('done');
    } catch (e: any) {
      setError(e?.message || 'Could not save. Check your connection and try again.');
      setPhase('recorded');
    }
  }

  function reset() {
    setSentence(''); setEnglish(''); setUri(null); setSeconds(0); setPhase('idle'); setError(null);
  }

  if (authLoading) {
    return <Screen><ActivityIndicator color={C.ochre} size="large" style={{ marginTop: 40 }} /></Screen>;
  }

  if (!user) {
    return (
      <Screen>
        <Title>Record</Title>
        <Sub>Sign in first, so your recordings are saved to you.</Sub>
        <BigButton label="Go to Sign in" icon="person" onPress={() => router.push('/account')} />
      </Screen>
    );
  }

  if (phase === 'done') {
    return (
      <Screen>
        <View style={styles.doneWrap}>
          <Ionicons name="checkmark-circle" size={88} color={C.success} />
          <Text style={styles.doneText}>Saved. Thank you!</Text>
          <BigButton label="Record another" icon="add" onPress={reset} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Record a sentence</Title>
      <Sub>Type the sentence, then record yourself saying it.</Sub>

      <LangPicker languages={languages} value={code} onChange={setCode} />

      <Text style={styles.fieldLabel}>Sentence</Text>
      <TextInput
        value={sentence} onChangeText={setSentence}
        placeholder="Write the sentence in language…" placeholderTextColor={C.muted}
        multiline style={styles.input}
      />

      <Text style={styles.fieldLabel}>What it means (English) — optional</Text>
      <TextInput
        value={english} onChangeText={setEnglish}
        placeholder="English meaning…" placeholderTextColor={C.muted}
        style={[styles.input, { minHeight: 54 }]}
      />

      {phase !== 'recording' ? (
        <Pressable onPress={startRecording} style={({ pressed }) => [styles.recBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name="mic" size={40} color={C.white} />
          <Text style={styles.recText}>{uri ? 'Record again' : 'Record'}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={stopRecording} style={({ pressed }) => [styles.stopBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name="stop" size={40} color={C.white} />
          <Text style={styles.recText}>Stop  ·  {fmt(seconds)}</Text>
        </Pressable>
      )}

      {uri && phase !== 'recording' && (
        <Card>
          <Text style={styles.fieldLabel}>Your recording</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 10 }}>
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
  fieldLabel: { fontSize: S.label, fontWeight: '700', color: C.ink, marginTop: 4 },
  input: {
    backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border,
    padding: 16, fontSize: S.body, color: C.ink, minHeight: 96, textAlignVertical: 'top',
  },
  recBtn: {
    backgroundColor: C.ochre, minHeight: 96, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6,
  },
  stopBtn: {
    backgroundColor: C.danger, minHeight: 96, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6,
  },
  recText: { fontSize: S.button, fontWeight: '800', color: C.white },
  hint: { fontSize: S.small, color: C.muted, marginTop: 8, textAlign: 'center' },
  error: { fontSize: S.label, color: C.danger },
  doneWrap: { alignItems: 'center', gap: 18, paddingVertical: 50 },
  doneText: { fontSize: S.title, fontWeight: '800', color: C.ink },
});
