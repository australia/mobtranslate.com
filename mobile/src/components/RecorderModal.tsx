import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule, RecordingPresets, createAudioPlayer, setAudioModeAsync, useAudioRecorder, type AudioPlayer,
} from 'expo-audio';
import { Button } from './kit';
import { type ExistingRecording } from '../lib/api';
import { C, F, S, radius, shadow } from '../lib/theme';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

/** Record audio (+ play existing recordings) and upload via onUpload. Mount it
 *  only when needed so the audio recorder hook stays clean. */
export function RecorderModal({
  kind, label, sub, recordings, onUpload, onClose, onSaved,
}: {
  kind: 'WORD' | 'SENTENCE';
  label: string;
  sub?: string | null;
  recordings: ExistingRecording[] | null;
  onUpload: (uri: string, durationMs: number) => Promise<void>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded' | 'saving'>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => () => { if (tick.current) clearInterval(tick.current); player.current?.remove(); }, []);

  function play(u: string) { try { player.current?.remove(); const p = createAudioPlayer({ uri: u }); player.current = p; p.play(); } catch {} }

  async function start() {
    setError(null);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setError('Please allow microphone access.'); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync(); recorder.record();
      setUri(null); setSeconds(0); setPhase('recording');
      tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e: any) { setError(e?.message || 'Could not start recording.'); }
  }
  async function stop() { try { if (tick.current) clearInterval(tick.current); await recorder.stop(); setUri(recorder.uri ?? null); setPhase('recorded'); } catch (e: any) { setError(e?.message || 'Could not stop.'); } }
  async function save() {
    if (!uri) return;
    setPhase('saving'); setError(null);
    try { await onUpload(uri, seconds * 1000); onSaved(); onClose(); }
    catch (e: any) { setError(e?.message || 'Could not save.'); setPhase('recorded'); }
  }

  const recording = phase === 'recording';
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={styles.kind}>{kind}</Text>
          <Text style={styles.label}>{label}</Text>
          {!!sub && <Text style={styles.sub}>{sub}</Text>}

          {recordings === null ? <ActivityIndicator color={C.forest} style={{ marginTop: 14 }} /> : recordings.length > 0 && (
            <View style={{ marginTop: 14, gap: 8 }}>
              <Text style={styles.subhead}>Community recordings ({recordings.length})</Text>
              {recordings.map((r) => (
                <Pressable key={r.id} onPress={() => play(r.url)} style={styles.recRow}>
                  <Ionicons name="play-circle" size={28} color={C.forest} />
                  <Text style={styles.recName}>{r.isMine ? 'You' : (r.speaker || 'Community')}</Text>
                  {!!r.durationMs && <Text style={styles.recDur}>{Math.round(r.durationMs / 1000)}s</Text>}
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
            <Pressable onPress={recording ? stop : start}
              style={({ pressed }) => [styles.mic, shadow, { backgroundColor: recording ? C.danger : C.forest, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              <Ionicons name={recording ? 'stop' : 'mic'} size={44} color={C.white} />
            </Pressable>
            <Text style={styles.micLabel}>{recording ? `Recording…  ${fmt(seconds)}  ·  tap to stop` : uri ? 'Tap to record again' : (recordings && recordings.length ? 'Add your recording' : 'Tap to record')}</Text>
          </View>

          {uri && !recording && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button label="Play" icon="play" variant="ghost" onPress={() => play(uri)} style={{ flex: 1 }} />
              <Button label="Save" icon="cloud-upload-outline" onPress={save} loading={phase === 'saving'} style={{ flex: 1 }} />
            </View>
          )}
          {error && <Text style={styles.err}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 30 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.sageLine, marginBottom: 14 },
  kind: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  label: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink, marginTop: 4 },
  sub: { fontFamily: F.serifItalic, fontSize: S.body, color: C.muted, marginTop: 2 },
  subhead: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1, color: C.sage },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 12 },
  recName: { flex: 1, fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  recDur: { fontFamily: F.body, fontSize: S.small, color: C.muted },
  mic: { width: 108, height: 108, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  micLabel: { fontFamily: F.medium, fontSize: S.label, color: C.muted },
  err: { fontFamily: F.medium, fontSize: S.label, color: C.danger, textAlign: 'center', marginTop: 10 },
});
