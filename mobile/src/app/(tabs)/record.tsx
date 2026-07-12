import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule, RecordingPresets, createAudioPlayer, setAudioModeAsync, useAudioRecorder, type AudioPlayer,
} from 'expo-audio';
import { Button, Card, Screen, ScreenTitle } from '../../components/kit';
import {
  addSentenceTarget, browseWords, getVoiceTotals, getWorklist, selfEnroll,
  getWordRecordings, getExampleRecordings, uploadWordRecording, uploadExampleRecording,
  getStudioAccess,
  type VoiceTotals, type WorklistItem, type ExistingRecording,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLang } from '../../lib/langContext';
import { C, F, S, radius, shadow } from '../../lib/theme';

type Kind = 'word' | 'sentence';
type Filter = 'pending' | 'recorded' | 'all';

export default function RecordScreen() {
  const { user, loading: authLoading } = useAuth();
  const { code, lang } = useLang();
  const router = useRouter();
  const languageId = lang?.id;

  const [tab, setTab] = useState<Kind>('word');
  const [filter, setFilter] = useState<Filter>('pending');
  const [words, setWords] = useState<WorklistItem[]>([]);
  const [sentences, setSentences] = useState<WorklistItem[]>([]);
  const [totals, setTotals] = useState<VoiceTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<{ item: WorklistItem; kind: Kind } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [canStudio, setCanStudio] = useState(false);

  // The in-person Elder studio is curator/admin only and Kuku Yalanji only.
  // Probe the role so the entry appears only for authorized operators.
  useEffect(() => {
    let on = true;
    if (user && code === 'kuku_yalanji') {
      getStudioAccess().then((a) => { if (on) setCanStudio(a === 'ok'); }).catch(() => {});
    } else {
      setCanStudio(false);
    }
    return () => { on = false; };
  }, [user, code]);

  const load = useCallback(async () => {
    if (!languageId) return;
    setLoading(true);
    await selfEnroll(languageId);
    const [w, s, t] = await Promise.all([
      getWorklist(languageId, 'word', filter),
      getWorklist(languageId, 'sentence', filter),
      getVoiceTotals(),
    ]);
    let wordItems = w.items;
    if (wordItems.length === 0 && filter === 'pending') {
      const b = await browseWords(code, { page: 1 });
      wordItems = b.words.map((x) => ({ key: x.id, label: x.word, gloss: x.meaning, recording_count: 0, has_active: false }));
    }
    setWords(wordItems); setSentences(s.items); setTotals(t); setLoading(false);
  }, [languageId, code, filter]);

  useEffect(() => { if (user && languageId) load(); }, [user, languageId, load]);

  function afterSave(kind: Kind, key: string) {
    // mark recorded; if we're on the "to record" filter, drop it from the list
    const mark = (xs: WorklistItem[]) => xs.map((i) => i.key === key ? { ...i, has_active: true, recording_count: i.recording_count + 1 } : i);
    if (kind === 'word') setWords((xs) => filter === 'pending' ? xs.filter((i) => i.key !== key) : mark(xs));
    else setSentences((xs) => filter === 'pending' ? xs.filter((i) => i.key !== key) : mark(xs));
    getVoiceTotals().then((t) => t && setTotals(t));
  }

  if (authLoading) return <Screen><ScreenTitle title="Add your voice" /><ActivityIndicator color={C.forest} size="large" style={{ marginTop: 20 }} /></Screen>;

  if (!user) {
    return (
      <Screen>
        <View style={styles.markRow}><View style={styles.mark}><Ionicons name="mic" size={30} color={C.forest} /></View></View>
        <ScreenTitle title="Add your voice" sub="Record yourself speaking, and keep your language strong for the next generation." />
        <Card><Text style={styles.gate}>Sign in first, so your recordings are saved to you.</Text>
          <Button label="Go to Sign in" icon="person-outline" onPress={() => router.push('/account')} full style={{ marginTop: 14 }} />
        </Card>
        <Text style={styles.pd}>All recordings are contributed to the public domain in perpetuity.</Text>
      </Screen>
    );
  }

  const list = tab === 'word' ? words : sentences;
  const langName = lang?.name ?? 'your language';

  return (
    <Screen>
      <ScreenTitle title="Add your voice" sub={`Help record ${langName}. Every clip keeps the language strong.`} />

      <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        <Stat n={totals?.words ?? 0} label="words" />
        <View style={styles.vline} />
        <Stat n={totals?.sentences ?? 0} label="sentences" />
        <View style={styles.vline} />
        <Stat n={totals?.minutes ?? 0} label="minutes" />
      </Card>

      {/* Curator/admin only: the in-person Elder recording studio. */}
      {canStudio && (
        <Pressable onPress={() => router.push('/elder-studio')}
          style={({ pressed }) => [styles.studioCard, pressed && { transform: [{ scale: 0.99 }] }]}>
          <View style={styles.studioIcon}><Ionicons name="people" size={24} color={C.white} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.studioTitle}>Record with an Elder</Text>
            <Text style={styles.studioSub}>In-person studio: record, fix, skip or verify sentences.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={C.forest} />
        </Pressable>
      )}

      {/* word / sentence tabs */}
      <View style={styles.tabs}>
        {(['word', 'sentence'] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]}>
            <Text style={[styles.tabText, { color: tab === t ? C.forest : C.muted }]}>{t === 'word' ? 'Words' : 'Sentences'}</Text>
          </Pressable>
        ))}
      </View>

      {/* filter */}
      <View style={styles.filters}>
        {([['pending', 'To record'], ['recorded', 'Recorded'], ['all', 'All']] as [Filter, string][]).map(([f, label]) => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.fChip, filter === f ? styles.fOn : styles.fOff]}>
            <Text style={[styles.fText, { color: filter === f ? C.white : C.muted }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'sentence' && (
        <Button label="Add a sentence for everyone" icon="add" variant="soft" onPress={() => setAddOpen(true)} full />
      )}

      {loading && <ActivityIndicator color={C.forest} style={{ marginTop: 16 }} />}

      {!loading && list.length === 0 && (
        <Card><Text style={styles.empty}>
          {filter === 'pending'
            ? (tab === 'word' ? 'No words waiting — you’ve recorded them all. Thank you!' : 'No sentences waiting. Add one above to share with everyone.')
            : filter === 'recorded' ? 'Nothing recorded yet here.' : 'Nothing here yet.'}
        </Text></Card>
      )}

      <View style={{ gap: 10 }}>
        {list.map((item) => (
          <Pressable key={item.key} onPress={() => setActive({ item, kind: tab })}
            style={({ pressed }) => [styles.row, pressed && { transform: [{ scale: 0.99 }] }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel} numberOfLines={2}>{item.label}</Text>
              {!!item.gloss && <Text style={styles.rowGloss} numberOfLines={1}>{item.gloss}</Text>}
            </View>
            {item.has_active
              ? <View style={styles.doneBadge}><Ionicons name="checkmark" size={16} color={C.white} /></View>
              : <View style={styles.recBtn}><Ionicons name="mic" size={20} color={C.white} /></View>}
          </Pressable>
        ))}
      </View>

      <Text style={styles.pd}>Tap any card to listen to recordings or add your own. Recordings are public domain in perpetuity.</Text>

      {active && languageId && (
        <ItemSheet
          item={active.item} kind={active.kind} languageId={languageId}
          onClose={() => setActive(null)}
          onSaved={() => { afterSave(active.kind, active.item.key); }}
        />
      )}
      {addOpen && languageId && (
        <AddSentence languageId={languageId} onClose={() => setAddOpen(false)} onAdded={() => setAddOpen(false)} />
      )}
    </Screen>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

/* ── Card detail: existing recordings (playback) + record ── */
function ItemSheet({
  item, kind, languageId, onClose, onSaved,
}: { item: WorklistItem; kind: Kind; languageId: string; onClose: () => void; onSaved: () => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded' | 'saving'>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingRecording[] | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  useEffect(() => {
    let on = true;
    (kind === 'word' ? getWordRecordings(item.key) : getExampleRecordings(item.key)).then((r) => on && setExisting(r));
    return () => { on = false; if (tick.current) clearInterval(tick.current); player.current?.remove(); };
  }, []);

  function playUri(u: string) { try { player.current?.remove(); const p = createAudioPlayer({ uri: u }); player.current = p; p.play(); } catch {} }

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
    try {
      if (kind === 'word') await uploadWordRecording(item.key, uri, seconds * 1000);
      else await uploadExampleRecording(item.key, uri, seconds * 1000);
      onSaved(); onClose();
    } catch (e: any) { setError(e?.message || 'Could not save.'); setPhase('recorded'); }
  }

  const recording = phase === 'recording';
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={styles.sheetKind}>{kind === 'word' ? 'WORD' : 'SENTENCE'}</Text>
          <Text style={styles.sheetLabel}>{item.label}</Text>
          {!!item.gloss && <Text style={styles.sheetGloss}>{item.gloss}</Text>}

          {/* existing recordings */}
          {existing === null ? <ActivityIndicator color={C.forest} style={{ marginTop: 14 }} /> : existing.length > 0 && (
            <View style={{ marginTop: 14, gap: 8 }}>
              <Text style={styles.subhead}>Recordings ({existing.length})</Text>
              {existing.map((r) => (
                <Pressable key={r.id} onPress={() => playUri(r.url)} style={styles.recRow}>
                  <Ionicons name="play-circle" size={28} color={C.forest} />
                  <Text style={styles.recName}>{r.isMine ? 'You' : (r.speaker || 'Community')}</Text>
                  {!!r.durationMs && <Text style={styles.recDur}>{Math.round(r.durationMs / 1000)}s</Text>}
                </Pressable>
              ))}
            </View>
          )}

          {/* record */}
          <View style={{ alignItems: 'center', gap: 12, paddingVertical: 16 }}>
            <Pressable onPress={recording ? stop : start}
              style={({ pressed }) => [styles.mic, shadow, { backgroundColor: recording ? C.danger : C.forest, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              <Ionicons name={recording ? 'stop' : 'mic'} size={44} color={C.white} />
            </Pressable>
            <Text style={styles.micLabel}>{recording ? `Recording…  ${fmt(seconds)}  ·  tap to stop` : uri ? 'Tap to record again' : (existing && existing.length ? 'Add your recording' : 'Tap to record')}</Text>
          </View>

          {uri && !recording && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button label="Play" icon="play" variant="ghost" onPress={() => playUri(uri)} style={{ flex: 1 }} />
              <Button label="Save" icon="cloud-upload-outline" onPress={save} loading={phase === 'saving'} style={{ flex: 1 }} />
            </View>
          )}
          {error && <Text style={styles.err}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Add a shared sentence (English required) ── */
function AddSentence({ languageId, onClose, onAdded }: { languageId: string; onClose: () => void; onAdded: () => void }) {
  const [text, setText] = useState('');
  const [english, setEnglish] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = text.trim().length > 0 && english.trim().length > 0;

  async function submit() {
    if (!valid) return;
    setBusy(true); setError(null);
    const ok = await addSentenceTarget(languageId, text.trim(), english.trim());
    setBusy(false);
    if (ok) { setDone(true); setTimeout(onAdded, 1200); }
    else setError('Could not add. Try again.');
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          {done ? (
            <View style={{ alignItems: 'center', gap: 12, paddingVertical: 20 }}>
              <View style={[styles.mark, { backgroundColor: C.success }]}><Ionicons name="checkmark" size={30} color={C.white} /></View>
              <Text style={styles.sheetLabel}>Added for everyone</Text>
              <Text style={styles.sheetGloss}>It’ll appear for the community to record.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sheetKind}>ADD A SENTENCE</Text>
              <Text style={styles.sheetGloss}>Shared with everyone to record.</Text>
              <Text style={styles.fieldLabel}>Sentence in language</Text>
              <TextInput value={text} onChangeText={setText} placeholder="Write the sentence in language…"
                placeholderTextColor={C.muted} multiline style={styles.input} />
              <Text style={styles.fieldLabel}>What it means in English (required)</Text>
              <TextInput value={english} onChangeText={setEnglish} placeholder="The English meaning…"
                placeholderTextColor={C.muted} style={[styles.input, { minHeight: 48 }]} />
              <Button label="Add sentence" icon="add" onPress={submit} loading={busy} disabled={!valid} full style={{ marginTop: 14 }} />
              {!valid && <Text style={styles.hint}>Both the sentence and its English meaning are needed.</Text>}
              {error && <Text style={styles.err}>{error}</Text>}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  markRow: { alignItems: 'center', marginTop: 4 },
  mark: { width: 64, height: 64, borderRadius: radius.pill, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },
  gate: { fontFamily: F.body, fontSize: S.body, color: C.muted, textAlign: 'center', lineHeight: 26 },
  pd: { fontFamily: F.body, fontSize: S.small, color: C.faint, textAlign: 'center', lineHeight: 18, marginTop: 4 },

  statN: { fontFamily: F.displayBold, fontSize: S.title + 3, color: C.forest },
  statL: { fontFamily: F.medium, fontSize: S.small, color: C.muted, marginTop: 2 },
  vline: { width: 1, backgroundColor: C.hair },

  studioCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.sageSoft, borderRadius: radius.md, borderWidth: 1, borderColor: C.sageLine, padding: 16 },
  studioIcon: { width: 46, height: 46, borderRadius: radius.pill, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' },
  studioTitle: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  studioSub: { fontFamily: F.body, fontSize: S.small, color: C.muted, marginTop: 2, lineHeight: 18 },

  tabs: { flexDirection: 'row', backgroundColor: C.surfaceAlt, borderRadius: radius.md, padding: 4, gap: 4 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 42, borderRadius: radius.sm },
  tabOn: { backgroundColor: C.surface, ...shadow },
  tabText: { fontFamily: F.semibold, fontSize: S.label },

  filters: { flexDirection: 'row', gap: 8 },
  fChip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1 },
  fOn: { backgroundColor: C.forest, borderColor: C.forest },
  fOff: { backgroundColor: C.surface, borderColor: C.border },
  fText: { fontFamily: F.semibold, fontSize: S.small },

  empty: { fontFamily: F.body, fontSize: S.label, color: C.muted, textAlign: 'center', lineHeight: 24 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 16, ...shadow },
  rowLabel: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  rowGloss: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 2 },
  recBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' },
  doneBadge: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: C.success, alignItems: 'center', justifyContent: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 30 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.sageLine, marginBottom: 14 },
  sheetKind: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  sheetLabel: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink, marginTop: 4 },
  sheetGloss: { fontFamily: F.serifItalic, fontSize: S.body, color: C.muted, marginTop: 2 },
  subhead: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1, color: C.sage },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 12 },
  recName: { flex: 1, fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  recDur: { fontFamily: F.body, fontSize: S.small, color: C.muted },
  mic: { width: 108, height: 108, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  micLabel: { fontFamily: F.medium, fontSize: S.label, color: C.muted },
  fieldLabel: { fontFamily: F.semibold, fontSize: S.label, color: C.ink, marginTop: 14, marginBottom: 8 },
  input: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 15, fontFamily: F.body, fontSize: S.body, color: C.ink, minHeight: 80, textAlignVertical: 'top' },
  hint: { fontFamily: F.body, fontSize: S.small, color: C.muted, textAlign: 'center', marginTop: 8 },
  err: { fontFamily: F.medium, fontSize: S.label, color: C.danger, textAlign: 'center', marginTop: 10 },
});
