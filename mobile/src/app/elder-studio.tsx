/**
 * Record with an Elder — the in-person tablet studio (curator/admin only).
 *
 * A curator/admin drives the tablet; an Elder sits with them. For each synthetic
 * Kuku Yalanji sentence the Elder can:
 *   • RECORD it (m4a via expo-audio) → uploaded as a TTS-corpus take,
 *   • FIX the text, then record the corrected version,
 *   • SKIP it, or
 *   • MARK IT BAD.
 * Every judgment is the elder verification that upgrades the synthetic corpus.
 *
 * Hits the SAME W1 sentence-corpus API as the web studio (speakers / next /
 * upload / review), role-gated server-side. Offline-tolerant: a take that can't
 * upload is kept on-device and retried — an Elder's take is never lost.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule, RecordingPresets, createAudioPlayer, setAudioModeAsync, useAudioRecorder, type AudioPlayer,
} from 'expo-audio';
import { Button, Card, Screen, ScreenTitle } from '../components/kit';
import {
  getStudioAccess, getStudioSpeakers, createStudioSpeaker, getNextSentence,
  reviewSentence, uploadSentenceTake,
  type StudioAccess, type StudioSpeaker, type StudioSentence, type StudioProgress, type SentenceTakeMeta,
} from '../lib/api';
import { enqueueTake, pendingCount, retryPending } from '../lib/elderQueue';
import { useAuth } from '../lib/auth';
import { C, F, S, radius, shadow } from '../lib/theme';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

export default function ElderStudioScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [access, setAccess] = useState<StudioAccess | null>(null);
  const [speakers, setSpeakers] = useState<StudioSpeaker[]>([]);
  const [speaker, setSpeaker] = useState<StudioSpeaker | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(0);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAccess('unauthenticated'); return; }
    let on = true;
    (async () => {
      const a = await getStudioAccess();
      if (!on) return;
      setAccess(a);
      if (a === 'ok') {
        try { const s = await getStudioSpeakers(); if (on) setSpeakers(s); } catch { /* shown below */ }
      }
    })();
    pendingCount().then((n) => on && setPending(n)).catch(() => {});
    return () => { on = false; };
  }, [user, authLoading, reload]);

  const bumpPending = useCallback(() => { pendingCount().then(setPending).catch(() => {}); }, []);
  const onRetry = useCallback(async () => {
    const { remaining } = await retryPending();
    setPending(remaining);
  }, []);

  if (authLoading || access === null) {
    return <Screen><ScreenTitle title="Record with an Elder" /><ActivityIndicator color={C.forest} size="large" style={{ marginTop: 24 }} /></Screen>;
  }

  if (access === 'unauthenticated') {
    return (
      <Screen>
        <ScreenTitle title="Record with an Elder" sub="Sign in with a curator account to run the studio." />
        <Card><Text style={styles.gate}>This studio is for curators and language admins. Sign in to continue.</Text>
          <Button label="Go to Sign in" icon="person-outline" onPress={() => router.push('/account')} full style={{ marginTop: 14 }} />
        </Card>
      </Screen>
    );
  }
  if (access === 'forbidden') {
    return (
      <Screen>
        <ScreenTitle title="Record with an Elder" sub="Curator access needed." />
        <Card><Text style={styles.gate}>Your account isn’t set up as a curator or language admin yet. Ask an admin to grant curator access, then come back.</Text>
          <Button label="Back" icon="arrow-back" variant="soft" onPress={() => router.back()} full style={{ marginTop: 14 }} />
        </Card>
      </Screen>
    );
  }
  if (access === 'error') {
    return (
      <Screen>
        <ScreenTitle title="Record with an Elder" />
        <Card><Text style={styles.gate}>Couldn’t reach the studio. Check the connection and try again.</Text>
          <Button label="Try again" icon="refresh" onPress={() => setReload((n) => n + 1)} full style={{ marginTop: 14 }} />
        </Card>
      </Screen>
    );
  }

  if (!speaker) {
    return (
      <SpeakerPicker
        speakers={speakers}
        pending={pending}
        onRetry={onRetry}
        onPick={setSpeaker}
        onAdd={() => setAdding(true)}
        addingOpen={adding}
        onCloseAdd={() => setAdding(false)}
        onAdded={(s) => { setSpeakers((xs) => [...xs, s]); setAdding(false); setSpeaker(s); }}
      />
    );
  }

  return (
    <RecordFlow
      speaker={speaker}
      pending={pending}
      onRetry={onRetry}
      bumpPending={bumpPending}
      onChangeSpeaker={() => setSpeaker(null)}
    />
  );
}

/* ───────────────── speaker picker + consent ───────────────── */

function SpeakerPicker({
  speakers, pending, onRetry, onPick, onAdd, addingOpen, onCloseAdd, onAdded,
}: {
  speakers: StudioSpeaker[]; pending: number; onRetry: () => void;
  onPick: (s: StudioSpeaker) => void; onAdd: () => void;
  addingOpen: boolean; onCloseAdd: () => void; onAdded: (s: StudioSpeaker) => void;
}) {
  return (
    <Screen>
      <ScreenTitle title="Record with an Elder" sub="Choose who is recording today, then start." />
      {pending > 0 && <PendingBanner pending={pending} onRetry={onRetry} />}

      <Button label="Add an Elder" icon="person-add-outline" variant="soft" onPress={onAdd} full />

      {speakers.length === 0 ? (
        <Card><Text style={styles.gate}>No speakers yet. Add the Elder who is recording, with their consent.</Text></Card>
      ) : (
        <View style={{ gap: 10 }}>
          {speakers.map((s) => (
            <Pressable key={s.id} onPress={() => onPick(s)}
              style={({ pressed }) => [styles.speakerRow, pressed && { transform: [{ scale: 0.99 }] }]}>
              <View style={styles.avatar}><Ionicons name="person" size={24} color={C.forest} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.speakerName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.speakerMeta} numberOfLines={1}>
                  {[s.community, s.dialect].filter(Boolean).join(' · ') || 'Kuku Yalanji'}
                  {s.clips ? `  ·  ${s.clips} clips` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={C.faint} />
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.pd}>Every recording is stored with the Elder’s consent. Corrections and approvals here verify the synthetic sentences.</Text>

      {addingOpen && <AddSpeaker onClose={onCloseAdd} onAdded={onAdded} />}
    </Screen>
  );
}

function AddSpeaker({ onClose, onAdded }: { onClose: () => void; onAdded: (s: StudioSpeaker) => void }) {
  const [name, setName] = useState('');
  const [community, setCommunity] = useState('');
  const [dialect, setDialect] = useState('');
  const [cultural, setCultural] = useState(false);
  const [training, setTraining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 0 && cultural;

  async function submit() {
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const s = await createStudioSpeaker({
        name: name.trim(),
        community: community.trim() || null,
        dialect: dialect.trim() || null,
        culturalConsent: cultural,
        trainingConsent: training,
        consentNote: 'In-person consent affirmed on the app by the operating curator.',
      });
      onAdded(s);
    } catch (e: any) { setError(e?.message || 'Could not add the speaker.'); setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={styles.sheetKind}>ADD AN ELDER</Text>
          <Text style={styles.sheetGloss}>Record their name and consent to record.</Text>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="Elder’s name" placeholderTextColor={C.muted} style={styles.input1} />
          <Text style={styles.fieldLabel}>Community (optional)</Text>
          <TextInput value={community} onChangeText={setCommunity} placeholder="e.g. Wujal Wujal" placeholderTextColor={C.muted} style={styles.input1} />
          <Text style={styles.fieldLabel}>Dialect (optional)</Text>
          <TextInput value={dialect} onChangeText={setDialect} placeholder="e.g. Kuku Yalanji" placeholderTextColor={C.muted} style={styles.input1} />

          <ConsentToggle
            on={cultural} onToggle={() => setCultural((v) => !v)}
            title="Consent to record & publish"
            desc="The Elder agrees to be recorded and for the recordings to be kept and shared for language work."
          />
          <ConsentToggle
            on={training} onToggle={() => setTraining((v) => !v)}
            title="Consent to use for the voice model (optional)"
            desc="The recordings may also be used to build a Kuku Yalanji text-to-speech voice."
          />

          <Button label="Add & start recording" icon="checkmark" onPress={submit} loading={busy} disabled={!valid} full style={{ marginTop: 16 }} />
          {!valid && <Text style={styles.hint}>A name and consent to record are needed.</Text>}
          {error && <Text style={styles.err}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ConsentToggle({ on, onToggle, title, desc }: { on: boolean; onToggle: () => void; title: string; desc: string }) {
  return (
    <Pressable onPress={onToggle} style={[styles.consent, on && { borderColor: C.forest, backgroundColor: C.sageSoft }]}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={26} color={on ? C.forest : C.faint} />
      <View style={{ flex: 1 }}>
        <Text style={styles.consentTitle}>{title}</Text>
        <Text style={styles.consentDesc}>{desc}</Text>
      </View>
    </Pressable>
  );
}

/* ───────────────── the one-sentence-at-a-time record loop ───────────────── */

function RecordFlow({
  speaker, pending, onRetry, bumpPending, onChangeSpeaker,
}: {
  speaker: StudioSpeaker; pending: number; onRetry: () => void;
  bumpPending: () => void; onChangeSpeaker: () => void;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [sentence, setSentence] = useState<StudioSentence | null>(null);
  const [progress, setProgress] = useState<StudioProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded' | 'saving'>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [markingBad, setMarkingBad] = useState(false);
  const [acting, setActing] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const player = useRef<AudioPlayer | null>(null);

  const resetTake = useCallback(() => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    setPhase('idle'); setUri(null); setSeconds(0);
  }, []);

  const loadNext = useCallback(async () => {
    setLoading(true); setError(null); resetTake();
    try {
      const { sentence: s, progress: p } = await getNextSentence(speaker.id);
      setSentence(s); setProgress(p);
    } catch (e: any) { setError(e?.message || 'Could not load the next sentence.'); }
    setLoading(false);
  }, [speaker.id, resetTake]);

  useEffect(() => { loadNext(); return () => { if (tick.current) clearInterval(tick.current); player.current?.remove(); }; }, [loadNext]);

  function playUri(u: string) { try { player.current?.remove(); const p = createAudioPlayer({ uri: u }); player.current = p; p.play(); } catch { /* ignore */ } }

  async function start() {
    setError(null); setNote(null);
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setError('Please allow microphone access.'); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync(); recorder.record();
      setUri(null); setSeconds(0); setPhase('recording');
      tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e: any) { setError(e?.message || 'Could not start recording.'); }
  }
  async function stop() {
    try { if (tick.current) clearInterval(tick.current); await recorder.stop(); setUri(recorder.uri ?? null); setPhase('recorded'); }
    catch (e: any) { setError(e?.message || 'Could not stop.'); }
  }

  async function saveAndNext() {
    if (!uri || !sentence) return;
    setPhase('saving'); setError(null);
    const clientId = `app-${speaker.id.slice(0, 8)}-${sentence.id.slice(0, 8)}-${Date.now()}`;
    const meta: SentenceTakeMeta = {
      clientId, sentenceId: sentence.id, speakerId: speaker.id,
      spokenKuku: sentence.kuku_text, durationMs: seconds * 1000, channels: 1,
      culturalConsent: speaker.cultural_consent, trainingConsent: speaker.training_consent,
    };
    try {
      await uploadSentenceTake(meta, uri);
      await loadNext();
    } catch (e: any) {
      // Offline-tolerant: never lose the take. Keep it on-device, advance anyway.
      try { await enqueueTake(meta, uri, sentence.kuku_text); bumpPending(); setNote('Saved on the device — will upload when back online.'); }
      catch { setError('Could not save the recording. Try again.'); setPhase('recorded'); return; }
      await loadNext();
    }
  }

  async function doSkip() {
    if (!sentence || acting) return;
    setActing(true); setError(null);
    try { await reviewSentence({ sentenceId: sentence.id, speakerId: speaker.id, action: 'skipped' }); await loadNext(); }
    catch (e: any) { setError(e?.message || 'Could not skip.'); }
    setActing(false);
  }

  async function onFixed(newKuku: string) {
    if (!sentence) return;
    await reviewSentence({ sentenceId: sentence.id, speakerId: speaker.id, action: 'fixed', newKuku });
    // Stay on the same sentence so the Elder records the corrected version.
    setSentence({ ...sentence, kuku_text: newKuku, already_fixed: true });
    setFixing(false); resetTake();
    setNote('Text fixed. Now record the corrected sentence.');
  }

  async function onMarkedBad(reason: string | null) {
    if (!sentence) return;
    await reviewSentence({ sentenceId: sentence.id, speakerId: speaker.id, action: 'marked_bad', reason });
    setMarkingBad(false);
    await loadNext();
  }

  const recording = phase === 'recording';
  const pct = progress && progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <Screen>
      {/* header: who + progress + change speaker */}
      <View style={styles.hdr}>
        <Pressable onPress={onChangeSpeaker} style={styles.who} hitSlop={6}>
          <View style={styles.avatarSm}><Ionicons name="person" size={16} color={C.forest} /></View>
          <Text style={styles.whoName} numberOfLines={1}>{speaker.name}</Text>
          <Ionicons name="swap-horizontal" size={16} color={C.sage} />
        </Pressable>
        {progress && <Text style={styles.count}>{progress.recorded} recorded · {progress.total} total</Text>}
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct}%` }]} /></View>

      {pending > 0 && <PendingBanner pending={pending} onRetry={onRetry} />}

      {loading ? (
        <ActivityIndicator color={C.forest} size="large" style={{ marginTop: 40 }} />
      ) : error && !sentence ? (
        <Card><Text style={styles.gate}>{error}</Text>
          <Button label="Try again" icon="refresh" onPress={loadNext} full style={{ marginTop: 12 }} />
        </Card>
      ) : !sentence ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 40 }}>
          <View style={styles.doneMark}><Ionicons name="checkmark" size={40} color={C.white} /></View>
          <Text style={styles.doneTitle}>All done for this batch</Text>
          <Text style={styles.doneSub}>Every sentence has been recorded, fixed, or set aside. Thank you.</Text>
          <Button label="Change Elder" icon="swap-horizontal" variant="soft" onPress={onChangeSpeaker} />
        </View>
      ) : (
        <>
          {/* the sentence — huge */}
          <View style={styles.stage}>
            {sentence.already_fixed && <View style={styles.fixedTag}><Ionicons name="create" size={12} color={C.clay} /><Text style={styles.fixedTagText}>corrected</Text></View>}
            <Text style={styles.kuku} selectable>{sentence.kuku_text}</Text>
            <Text style={styles.english}>{sentence.english_text}</Text>
          </View>

          {/* record button */}
          <View style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
            <Pressable onPress={recording ? stop : start} disabled={phase === 'saving'}
              style={({ pressed }) => [styles.mic, shadow, { backgroundColor: recording ? C.danger : C.forest, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
              <Ionicons name={recording ? 'stop' : 'mic'} size={54} color={C.white} />
            </Pressable>
            <Text style={styles.micLabel}>
              {recording ? `Recording…  ${fmt(seconds)}  ·  tap to stop` : uri ? 'Tap to record again' : 'Tap the mic, then read the sentence'}
            </Text>
          </View>

          {/* after a take: play + save */}
          {uri && !recording && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button label="Play" icon="play" variant="ghost" onPress={() => playUri(uri)} style={{ flex: 1 }} />
              <Button label="Save & next" icon="arrow-forward" onPress={saveAndNext} loading={phase === 'saving'} style={{ flex: 1.4 }} />
            </View>
          )}

          {!!note && <Text style={styles.note}>{note}</Text>}
          {error && <Text style={styles.err}>{error}</Text>}

          {/* fix / skip / mark bad */}
          <View style={styles.actions}>
            <ActionBtn icon="create-outline" label="Fix text" onPress={() => setFixing(true)} disabled={acting || phase === 'saving'} />
            <ActionBtn icon="play-skip-forward-outline" label="Skip" onPress={doSkip} disabled={acting || phase === 'saving'} />
            <ActionBtn icon="close-circle-outline" label="Mark bad" tone="danger" onPress={() => setMarkingBad(true)} disabled={acting || phase === 'saving'} />
          </View>
        </>
      )}

      {fixing && sentence && (
        <FixTextModal original={sentence.original_kuku} current={sentence.kuku_text} onClose={() => setFixing(false)} onSave={onFixed} />
      )}
      {markingBad && sentence && (
        <MarkBadModal onClose={() => setMarkingBad(false)} onConfirm={onMarkedBad} />
      )}
    </Screen>
  );
}

function ActionBtn({ icon, label, onPress, tone, disabled }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; tone?: 'danger'; disabled?: boolean;
}) {
  const fg = tone === 'danger' ? C.danger : C.forest;
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: C.sageSoft }, disabled && { opacity: 0.4 }]}>
      <Ionicons name={icon} size={26} color={fg} />
      <Text style={[styles.actionText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function FixTextModal({ original, current, onClose, onSave }: {
  original: string; current: string; onClose: () => void; onSave: (v: string) => Promise<void>;
}) {
  const [text, setText] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = text.trim().length > 0 && text.trim() !== current.trim();

  async function save() {
    if (!changed) return;
    setBusy(true); setError(null);
    try { await onSave(text.trim()); }
    catch (e: any) { setError(e?.message || 'Could not save the fix.'); setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={styles.sheetKind}>FIX THE TEXT</Text>
          <Text style={styles.sheetGloss}>Correct the Kuku Yalanji, then record the fixed sentence.</Text>
          <TextInput value={text} onChangeText={setText} multiline autoFocus style={styles.fixInput} placeholderTextColor={C.muted} />
          {original.trim() !== current.trim() && <Text style={styles.origLine}>Original: {original}</Text>}
          <Button label="Save fix" icon="checkmark" onPress={save} loading={busy} disabled={!changed} full style={{ marginTop: 14 }} />
          {!changed && <Text style={styles.hint}>Change the text to save a correction.</Text>}
          {error && <Text style={styles.err}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MarkBadModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string | null) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true); setError(null);
    try { await onConfirm(reason.trim() || null); }
    catch (e: any) { setError(e?.message || 'Could not mark bad.'); setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.grip} />
          <Text style={styles.sheetKind}>MARK THIS SENTENCE BAD</Text>
          <Text style={styles.sheetGloss}>It won’t be shown again. Add a reason if you like.</Text>
          <TextInput value={reason} onChangeText={setReason} multiline placeholder="Why is it wrong? (optional)" placeholderTextColor={C.muted} style={styles.fixInput} />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button label="Mark bad" icon="close-circle" onPress={confirm} loading={busy} style={{ flex: 1 }} />
          </View>
          {error && <Text style={styles.err}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PendingBanner({ pending, onRetry }: { pending: number; onRetry: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Pressable onPress={async () => { setBusy(true); await onRetry(); setBusy(false); }} style={styles.pendingBar}>
      <Ionicons name="cloud-offline-outline" size={18} color={C.clay} />
      <Text style={styles.pendingText}>{pending} take{pending === 1 ? '' : 's'} waiting to upload</Text>
      {busy ? <ActivityIndicator color={C.clay} size="small" /> : <Text style={styles.pendingRetry}>Retry</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gate: { fontFamily: F.body, fontSize: S.body, color: C.muted, textAlign: 'center', lineHeight: 26 },
  pd: { fontFamily: F.body, fontSize: S.small, color: C.faint, textAlign: 'center', lineHeight: 18, marginTop: 4 },

  // speaker picker
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.hair, padding: 16, ...shadow },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },
  speakerName: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  speakerMeta: { fontFamily: F.body, fontSize: S.label, color: C.muted, marginTop: 2 },

  // consent
  consent: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1.5, borderColor: C.border, padding: 14, marginTop: 12 },
  consentTitle: { fontFamily: F.semibold, fontSize: S.label, color: C.ink },
  consentDesc: { fontFamily: F.body, fontSize: S.small, color: C.muted, marginTop: 3, lineHeight: 18 },

  // record header + progress
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  avatarSm: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: C.sageSoft, alignItems: 'center', justifyContent: 'center' },
  whoName: { fontFamily: F.semibold, fontSize: S.label, color: C.ink, flexShrink: 1 },
  count: { fontFamily: F.medium, fontSize: S.small, color: C.muted },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: C.sageLine, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: C.forest },

  // the stage (huge sentence)
  stage: { backgroundColor: C.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: C.hair, padding: 22, gap: 14, ...shadow },
  fixedTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: C.claySoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  fixedTagText: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1, color: C.clay },
  kuku: { fontFamily: F.displayBold, fontSize: 34, lineHeight: 44, color: C.ink },
  english: { fontFamily: F.serifItalic, fontSize: S.heading, color: C.muted, lineHeight: 28 },

  mic: { width: 128, height: 128, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  micLabel: { fontFamily: F.medium, fontSize: S.label, color: C.muted, textAlign: 'center' },
  note: { fontFamily: F.medium, fontSize: S.label, color: C.forest, textAlign: 'center', marginTop: 4 },
  err: { fontFamily: F.medium, fontSize: S.label, color: C.danger, textAlign: 'center', marginTop: 10 },

  // action row
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, paddingVertical: 16 },
  actionText: { fontFamily: F.semibold, fontSize: S.small },

  // done state
  doneMark: { width: 78, height: 78, borderRadius: radius.pill, backgroundColor: C.success, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: F.displayBold, fontSize: S.title, color: C.ink },
  doneSub: { fontFamily: F.body, fontSize: S.body, color: C.muted, textAlign: 'center', lineHeight: 26 },

  // pending banner
  pendingBar: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.claySoft, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  pendingText: { flex: 1, fontFamily: F.semibold, fontSize: S.label, color: C.clay },
  pendingRetry: { fontFamily: F.bold, fontSize: S.label, color: C.clay },

  // sheets
  backdrop: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 30 },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.sageLine, marginBottom: 14 },
  sheetKind: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  sheetGloss: { fontFamily: F.serifItalic, fontSize: S.body, color: C.muted, marginTop: 2 },
  fieldLabel: { fontFamily: F.semibold, fontSize: S.label, color: C.ink, marginTop: 14, marginBottom: 8 },
  input1: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 14, fontFamily: F.body, fontSize: S.body, color: C.ink },
  fixInput: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 15, fontFamily: F.display, fontSize: S.heading, color: C.ink, minHeight: 96, textAlignVertical: 'top', marginTop: 12 },
  origLine: { fontFamily: F.body, fontSize: S.small, color: C.faint, marginTop: 10 },
  hint: { fontFamily: F.body, fontSize: S.small, color: C.muted, textAlign: 'center', marginTop: 8 },
});
