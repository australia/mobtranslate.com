/**
 * Record with an Elder — the in-person tablet studio (curator/admin only).
 *
 * A curator/admin drives the tablet; an Elder sits with them. For each
 * machine-generated Kuku Yalanji draft the Elder can:
 *   • CONFIRM the wording, then RECORD a lossless PCM WAV,
 *   • FIX the text, then record the corrected version,
 *   • SKIP it, or
 *   • MARK IT BAD.
 * Every judgment records speaker-present review of an unverified draft.
 *
 * Hits the SAME W1 sentence-corpus API as the web studio (speakers / next /
 * upload / review), role-gated server-side. Offline-tolerant: a take that can't
 * upload is kept on-device and retried — an Elder's take is never lost.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule, createAudioPlayer, setAudioModeAsync, useAudioStream,
  type AudioPlayer, type AudioStreamBuffer,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { deleteAsync } from 'expo-file-system/legacy';
import { randomUUID } from 'expo-crypto';
import { Button, Card, Screen, ScreenTitle } from '../components/kit';
import { StudioConsentFields } from '../components/StudioConsentFields';
import {
  getStudioAccess, getStudioSpeakers, createStudioSpeaker, getNextSentence,
  reviewSentence, setStudioSpeakerConsent, uploadSentenceTake,
  StudioUploadError,
  type StudioAccess, type StudioSpeaker, type StudioSentence, type StudioProgress, type SentenceTakeMeta,
} from '../lib/api';
import { discardPending, enqueueTake, pendingSummary, retryPending } from '../lib/elderQueue';
import { useAuth } from '../lib/auth';
import { encodeMonoPcm16Wav, type Pcm16Chunk } from '../lib/pcm-wav';
import {
  emptyStudioConsent,
  selectedSpeechUses,
  studioConsentFromSnapshot,
  type SpeechConsentGrant,
} from '../lib/studioConsent';
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
  const [blocked, setBlocked] = useState(0);
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
    pendingSummary().then((summary) => {
      if (!on) return;
      setPending(summary.total);
      setBlocked(summary.blocked);
    }).catch(() => {});
    return () => { on = false; };
  }, [user, authLoading, reload]);

  const refreshPending = useCallback(() => {
    pendingSummary().then((summary) => {
      setPending(summary.total);
      setBlocked(summary.blocked);
    }).catch(() => {});
  }, []);
  const onRetry = useCallback(async () => {
    const { remaining, blocked: blockedCount } = await retryPending();
    setPending(remaining);
    setBlocked(blockedCount);
  }, []);
  const onDiscardPending = useCallback(() => {
    Alert.alert(
      'Delete waiting recordings from this device?',
      'These lossless masters have not reached Mob Translate. Deleting them cannot be undone.',
      [
        { text: 'Keep recordings', style: 'cancel' },
        {
          text: 'Delete local copies',
          style: 'destructive',
          onPress: async () => {
            await discardPending();
            setPending(0);
            setBlocked(0);
          },
        },
      ],
    );
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
        blocked={blocked}
        onRetry={onRetry}
        onDiscardPending={onDiscardPending}
        onPick={setSpeaker}
        onAdd={() => setAdding(true)}
        addingOpen={adding}
        onCloseAdd={() => setAdding(false)}
        onAdded={(s) => {
          setSpeakers((items) => items.some((item) => item.id === s.id)
            ? items.map((item) => item.id === s.id ? s : item)
            : [...items, s]);
          setAdding(false);
        }}
      />
    );
  }

  return (
    <RecordFlow
      speaker={speaker}
      pending={pending}
      blocked={blocked}
      onRetry={onRetry}
      onDiscardPending={onDiscardPending}
      bumpPending={refreshPending}
      onChangeSpeaker={() => setSpeaker(null)}
    />
  );
}

/* ───────────────── speaker picker + consent ───────────────── */

function SpeakerPicker({
  speakers, pending, blocked, onRetry, onDiscardPending, onPick, onAdd, addingOpen, onCloseAdd, onAdded,
}: {
  speakers: StudioSpeaker[]; pending: number; blocked: number; onRetry: () => void; onDiscardPending: () => void;
  onPick: (s: StudioSpeaker) => void; onAdd: () => void;
  addingOpen: boolean; onCloseAdd: () => void; onAdded: (s: StudioSpeaker) => void;
}) {
  const [confirm, setConfirm] = useState<StudioSpeaker | null>(null);
  const [permissionSpeaker, setPermissionSpeaker] = useState<StudioSpeaker | null>(null);

  function chooseSpeaker(candidate: StudioSpeaker) {
    if (!candidate.consent_record_id || candidate.recording_allowed !== true) {
      setPermissionSpeaker(candidate);
      return;
    }
    setConfirm(candidate);
  }

  function mergePermission(speaker: StudioSpeaker, update: Partial<StudioSpeaker>): StudioSpeaker {
    return { ...speaker, ...update };
  }

  return (
    <Screen>
      <ScreenTitle title="Review drafts with an Elder" sub="Choose who is present, confirm today’s permission, then review one draft at a time." />
      {pending > 0 && <PendingBanner pending={pending} blocked={blocked} onRetry={onRetry} onDiscard={onDiscardPending} />}

      <Button label="Add an Elder" icon="person-add-outline" variant="soft" onPress={onAdd} full />

      {speakers.length === 0 ? (
        <Card><Text style={styles.gate}>No speakers yet. Add the Elder who is recording, with their consent.</Text></Card>
      ) : (
        <View style={{ gap: 10 }}>
          {speakers.map((s) => (
            <Pressable key={s.id} onPress={() => chooseSpeaker(s)}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}. ${s.recording_allowed === true ? `Recording permitted under version ${s.consent_version ?? 'unknown'}` : 'Permission review needed before recording'}`}
              style={({ pressed }) => [styles.speakerRow, pressed && { transform: [{ scale: 0.99 }] }]}>
              <View style={styles.avatar}><Ionicons name="person" size={24} color={C.forest} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.speakerName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.speakerMeta} numberOfLines={1}>
                  {[s.community, s.dialect].filter(Boolean).join(' · ') || 'Kuku Yalanji'}
                  {s.clips ? `  ·  ${s.clips} clips` : ''}
                </Text>
                <Text style={[styles.permissionState, s.recording_allowed === true ? styles.permissionOn : styles.permissionNeeded]}>
                  {s.recording_allowed === true
                    ? `Recording permitted · version ${s.consent_version ?? '—'}`
                    : 'Permission review needed before recording'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={C.faint} />
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.pd}>These are machine-generated drafts, not trusted language. The Elder’s correction or confirmation is recorded with the operator and current permission version.</Text>

      {addingOpen && (
        <AddSpeaker
          onClose={onCloseAdd}
          onAdded={(created) => {
            onAdded(created);
            setConfirm(created);
          }}
        />
      )}
      {permissionSpeaker && (
        <EditSpeakerPermission
          speaker={permissionSpeaker}
          onClose={() => setPermissionSpeaker(null)}
          onSaved={(update, canStart) => {
            const current = mergePermission(permissionSpeaker, update);
            onAdded(current);
            setPermissionSpeaker(null);
            if (canStart) setConfirm(current);
          }}
        />
      )}
      {confirm && (
        <SessionConfirmation
          speaker={confirm}
          onClose={() => setConfirm(null)}
          onReview={() => {
            setConfirm(null);
            setPermissionSpeaker(confirm);
          }}
          onStart={() => onPick(confirm)}
        />
      )}
    </Screen>
  );
}

function AddSpeaker({ onClose, onAdded }: { onClose: () => void; onAdded: (s: StudioSpeaker) => void }) {
  const [name, setName] = useState('');
  const [community, setCommunity] = useState('');
  const [dialect, setDialect] = useState('');
  const [consent, setConsent] = useState<SpeechConsentGrant>(() => emptyStudioConsent());
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 0
    && consent.rights.recordingAllowed
    && consent.withdrawalProcess.trim().length >= 10
    && present;

  async function submit() {
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const s = await createStudioSpeaker({
        name: name.trim(),
        community: community.trim() || null,
        dialect: dialect.trim() || null,
        consent: {
          ...consent,
          notes: [
            'Speaker-present consent recorded in the curator app; each selected purpose was reviewed without preselected publication or model rights.',
            consent.notes?.trim(),
          ].filter(Boolean).join(' '),
        },
      });
      onAdded(s);
    } catch (e: any) { setError(e?.message || 'Could not add the speaker.'); setBusy(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.grip} />
            <Text style={styles.sheetKind}>NEW SPEAKER · PERMISSION</Text>
            <Text style={styles.sheetTitle}>Make every use a real choice</Text>
            <Text style={styles.sheetGloss}>The Elder is present. Ask each item aloud and select only what they agree to.</Text>

            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Elder’s name" placeholderTextColor={C.muted} style={styles.input1} />
            <Text style={styles.fieldLabel}>Community (optional)</Text>
            <TextInput value={community} onChangeText={setCommunity} placeholder="e.g. Wujal Wujal" placeholderTextColor={C.muted} style={styles.input1} />
            <Text style={styles.fieldLabel}>Dialect or variety (optional)</Text>
            <TextInput value={dialect} onChangeText={setDialect} placeholder="e.g. Kuku Yalanji" placeholderTextColor={C.muted} style={styles.input1} />

            <View style={{ marginTop: 18 }}>
              <StudioConsentFields value={consent} onChange={setConsent} presentConfirmed={present} onPresentConfirmed={setPresent} />
            </View>

            <Button label="Save permission" icon="checkmark" onPress={submit} loading={busy} disabled={!valid} full style={{ marginTop: 18 }} />
            {!valid && <Text style={styles.hint}>Name, permission to make and keep the recordings, a withdrawal process, and the in-person confirmation are required.</Text>}
            {error && <Text style={styles.err}>{error}</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function EditSpeakerPermission({
  speaker, onClose, onSaved,
}: {
  speaker: StudioSpeaker;
  onClose: () => void;
  onSaved: (update: Partial<StudioSpeaker>, canStart: boolean) => void;
}) {
  const [consent, setConsent] = useState<SpeechConsentGrant>(() => studioConsentFromSnapshot(speaker));
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = consent.rights.recordingAllowed && consent.withdrawalProcess.trim().length >= 10 && present;

  async function save() {
    if (!valid) return;
    setBusy(true); setError(null);
    try {
      const update = await setStudioSpeakerConsent(speaker.id, {
        eventType: speaker.consent_record_id ? 'replace' : 'grant',
        consent: {
          ...consent,
          notes: [
            'Speaker-present permission version recorded in the curator app; each selected purpose was reviewed.',
            consent.notes?.trim(),
          ].filter(Boolean).join(' '),
        },
      });
      onSaved(update, true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save permission.');
      setBusy(false);
    }
  }

  function withdraw() {
    Alert.alert(
      `Withdraw ${speaker.name}’s current permissions?`,
      'Future recording, public playback, training, provider transfer, and project exports under this permission will stop. Earlier ledger evidence remains for audit.',
      [
        { text: 'Keep permissions', style: 'cancel' },
        {
          text: 'Record withdrawal',
          style: 'destructive',
          onPress: async () => {
            setBusy(true); setError(null);
            try {
              const update = await setStudioSpeakerConsent(speaker.id, {
                eventType: 'withdraw',
                reason: 'Speaker withdrew all current speech permissions in person through the curator app.',
              });
              onSaved(update, false);
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'Could not record withdrawal.');
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.grip} />
            <Text style={styles.sheetKind}>NEW PERMISSION VERSION</Text>
            <Text style={styles.sheetTitle}>{speaker.name}</Text>
            <Text style={styles.sheetGloss}>Earlier versions stay in the audit ledger. This version becomes the only current authority for future capture and use.</Text>
            <View style={{ marginTop: 18 }}>
              <StudioConsentFields value={consent} onChange={setConsent} presentConfirmed={present} onPresentConfirmed={setPresent} />
            </View>
            <Button label="Save new permission version" icon="shield-checkmark-outline" onPress={save} loading={busy} disabled={!valid} full style={{ marginTop: 18 }} />
            {speaker.consent_record_id && (
              <Button label="Withdraw all current permissions" icon="hand-left-outline" variant="ghost" onPress={withdraw} disabled={busy} full style={{ marginTop: 8 }} />
            )}
            {error && <Text style={styles.err}>{error}</Text>}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function SessionConfirmation({
  speaker, onClose, onReview, onStart,
}: {
  speaker: StudioSpeaker;
  onClose: () => void;
  onReview: () => void;
  onStart: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const uses = selectedSpeechUses(studioConsentFromSnapshot(speaker).rights);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdropCenter} onPress={onClose}>
        <Pressable style={styles.confirmCard} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ gap: 13 }}>
              <View style={styles.sessionIcon}><Ionicons name="people" size={28} color={C.cream} /></View>
              <Text style={styles.sheetKind}>TODAY’S IN-PERSON SESSION</Text>
              <Text style={styles.sheetTitle}>Start with {speaker.name}</Text>
              <Text style={styles.sheetGloss}>Current permission version {speaker.consent_version}. Selected uses:</Text>
              <View style={styles.useList}>
                {uses.map((use) => (
                  <View key={use} style={styles.useRow}><Ionicons name="checkmark-circle" size={18} color={C.success} /><Text style={styles.useText}>{use}</Text></View>
                ))}
              </View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: confirmed }}
                onPress={() => setConfirmed((value) => !value)}
                style={[styles.sessionConfirm, confirmed && styles.sessionConfirmOn]}
              >
                <Ionicons name={confirmed ? 'checkbox' : 'square-outline'} size={25} color={confirmed ? C.forest : C.faint} />
                <Text style={styles.sessionConfirmText}>{speaker.name} is here, has reviewed these current uses, and agrees to record today. They can stop at any time.</Text>
              </Pressable>
              <Button label="Begin speaker-present review" icon="arrow-forward" onPress={onStart} disabled={!confirmed} full />
              <Button label="Review or change permissions" icon="create-outline" variant="ghost" onPress={onReview} full />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ───────────────── the one-sentence-at-a-time record loop ───────────────── */

type CapturedTake = ReturnType<typeof encodeMonoPcm16Wav> & {
  uri: string;
  clientId: string;
};

function RecordFlow({
  speaker, pending, blocked, onRetry, onDiscardPending, bumpPending, onChangeSpeaker,
}: {
  speaker: StudioSpeaker; pending: number; blocked: number; onRetry: () => void; onDiscardPending: () => void;
  bumpPending: () => void; onChangeSpeaker: () => void;
}) {
  const [sessionId] = useState(() => randomUUID());
  const [sentence, setSentence] = useState<StudioSentence | null>(null);
  const [progress, setProgress] = useState<StudioProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded' | 'saving'>('idle');
  const [captured, setCaptured] = useState<CapturedTake | null>(null);
  const [sentenceConfirmed, setSentenceConfirmed] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fixing, setFixing] = useState(false);
  const [markingBad, setMarkingBad] = useState(false);
  const [acting, setActing] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = useRef<AudioPlayer | null>(null);
  const chunks = useRef<Pcm16Chunk[]>([]);
  const capturing = useRef(false);
  const capturedRef = useRef<CapturedTake | null>(null);

  const onPcmBuffer = useCallback((buffer: AudioStreamBuffer) => {
    if (!capturing.current) return;
    chunks.current.push({
      bytes: new Uint8Array(buffer.data.slice(0)),
      sampleRate: buffer.sampleRate,
      channels: buffer.channels,
    });
  }, []);
  const { stream } = useAudioStream({
    sampleRate: 16_000,
    channels: 1,
    encoding: 'int16',
    onBuffer: onPcmBuffer,
  });

  const resetTake = useCallback(() => {
    if (tick.current) { clearInterval(tick.current); tick.current = null; }
    if (autoStop.current) { clearTimeout(autoStop.current); autoStop.current = null; }
    capturing.current = false;
    const oldUri = capturedRef.current?.uri;
    capturedRef.current = null;
    if (oldUri) deleteAsync(oldUri, { idempotent: true }).catch(() => {});
    setPhase('idle'); setCaptured(null); setSeconds(0);
  }, []);

  const loadNext = useCallback(async () => {
    setLoading(true); setError(null); resetTake(); setSentenceConfirmed(false);
    try {
      const { sentence: s, progress: p } = await getNextSentence(speaker.id);
      setSentence(s); setProgress(p);
    } catch (e: any) { setError(e?.message || 'Could not load the next sentence.'); }
    setLoading(false);
  }, [speaker.id, resetTake]);

  useEffect(() => {
    loadNext();
    return () => {
      capturing.current = false;
      stream?.stop();
      if (tick.current) clearInterval(tick.current);
      if (autoStop.current) clearTimeout(autoStop.current);
      player.current?.remove();
      const oldUri = capturedRef.current?.uri;
      if (oldUri) deleteAsync(oldUri, { idempotent: true }).catch(() => {});
    };
  }, [loadNext, stream]);

  function playUri(u: string) { try { player.current?.remove(); const p = createAudioPlayer({ uri: u }); player.current = p; p.play(); } catch { /* ignore */ } }

  async function start() {
    if (!sentenceConfirmed) {
      setError('Ask the Elder to confirm or correct the draft before recording.');
      return;
    }
    if (!speaker.consent_record_id || speaker.recording_allowed !== true) {
      setError('Current permission to make this recording is required. Change speaker and review permissions.');
      return;
    }
    if (!stream || Platform.OS === 'web') {
      setError('Lossless studio capture is available in the Android or iOS app.');
      return;
    }
    setError(null); setNote(null);
    try {
      resetTake();
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) { setError('Please allow microphone access.'); return; }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      chunks.current = [];
      capturing.current = true;
      await stream.start();
      setSeconds(0); setPhase('recording');
      tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      autoStop.current = setTimeout(() => { void stop(); }, 58_000);
    } catch (e: any) {
      capturing.current = false;
      stream.stop();
      setError(e?.message || 'Could not start recording.');
    }
  }
  async function stop() {
    try {
      capturing.current = false;
      stream?.stop();
      if (tick.current) { clearInterval(tick.current); tick.current = null; }
      if (autoStop.current) { clearTimeout(autoStop.current); autoStop.current = null; }
      const encoded = encodeMonoPcm16Wav(chunks.current);
      if (encoded.durationMs < 250) throw new Error('Record at least a short word before stopping.');
      const clientId = randomUUID();
      const file = new File(Paths.cache, `elder-${clientId}.wav`);
      file.create({ overwrite: true });
      file.write(encoded.bytes);
      const take: CapturedTake = { ...encoded, uri: file.uri, clientId };
      capturedRef.current = take;
      setCaptured(take);
      setSeconds(Math.max(1, Math.round(encoded.durationMs / 1000)));
      setPhase('recorded');
    } catch (e: any) {
      setPhase('idle');
      setError(e?.message || 'Could not finish the lossless recording.');
    }
  }

  async function saveAndNext() {
    if (!captured || !sentence || !speaker.consent_record_id) return;
    setPhase('saving'); setError(null);
    const meta: SentenceTakeMeta = {
      clientId: captured.clientId,
      sessionId,
      sentenceId: sentence.id,
      speakerId: speaker.id,
      spokenKuku: sentence.kuku_text,
      consentRecordId: speaker.consent_record_id,
      sampleRate: captured.sampleRate,
      bitDepth: captured.bitDepth,
      channels: captured.channels,
      durationMs: captured.durationMs,
      peakAmplitude: captured.peakAmplitude,
      clipped: captured.clipped,
      condition: 'in_person_studio',
    };
    try {
      await uploadSentenceTake(meta, captured.uri);
      await deleteAsync(captured.uri, { idempotent: true }).catch(() => {});
      capturedRef.current = null;
      await loadNext();
    } catch (e: any) {
      if (e instanceof StudioUploadError && !e.retryable) {
        setError(e.message);
        setPhase('recorded');
        return;
      }
      // Network/transient failure: retain the permission-bound WAV on device.
      try {
        await enqueueTake(meta, captured.uri, sentence.kuku_text);
        capturedRef.current = null;
        bumpPending();
        setNote('Lossless recording saved on this device. It will retry only while this permission remains current.');
      }
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
    // Stay on the same draft so the Elder can confirm and record the correction.
    setSentence({ ...sentence, kuku_text: newKuku, already_fixed: true });
    setFixing(false); resetTake(); setSentenceConfirmed(false);
    setNote('Correction saved. Ask the Elder to confirm the wording, then record it.');
  }

  async function onMarkedBad(reason: string | null) {
    if (!sentence) return;
    await reviewSentence({ sentenceId: sentence.id, speakerId: speaker.id, action: 'marked_bad', reason });
    setMarkingBad(false);
    await loadNext();
  }

  const recording = phase === 'recording';
  const interactionLocked = phase !== 'idle';
  const pct = progress && progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <Screen>
      {/* header: who + progress + change speaker */}
      <View style={styles.hdr}>
        <Pressable onPress={onChangeSpeaker} style={styles.who} hitSlop={6} accessibilityRole="button" accessibilityLabel="Change speaker">
          <View style={styles.avatarSm}><Ionicons name="person" size={16} color={C.forest} /></View>
          <Text style={styles.whoName} numberOfLines={1}>{speaker.name}</Text>
          <Ionicons name="swap-horizontal" size={16} color={C.sage} />
        </Pressable>
        {progress && <Text style={styles.count}>{progress.recorded} recorded · {progress.total} drafts</Text>}
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${pct}%` }]} /></View>

      {pending > 0 && <PendingBanner pending={pending} blocked={blocked} onRetry={onRetry} onDiscard={onDiscardPending} />}

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
          <Text style={styles.doneSub}>Every draft in this batch has been recorded, corrected, marked unusable, or set aside. Thank you.</Text>
          <Button label="Change Elder" icon="swap-horizontal" variant="soft" onPress={onChangeSpeaker} />
        </View>
      ) : (
        <>
          {/* Machine draft, visibly awaiting speaker-present review. */}
          <View style={styles.stage}>
            <View style={styles.draftMeta}>
              <View style={[styles.draftTag, sentence.already_fixed && styles.correctedTag]}>
                <Ionicons name={sentence.already_fixed ? 'create' : 'sparkles-outline'} size={12} color={sentence.already_fixed ? C.clay : C.sage} />
                <Text style={[styles.draftTagText, sentence.already_fixed && { color: C.clay }]}>{sentence.already_fixed ? 'corrected draft' : 'machine-generated draft'}</Text>
              </View>
              <Text style={styles.reviewNeeded}>NEEDS SPEAKER REVIEW</Text>
            </View>
            <Text style={styles.kuku} selectable>{sentence.kuku_text}</Text>
            <Text style={styles.englishLabel}>ENGLISH PROMPT · DRAFT CONTEXT</Text>
            <Text style={styles.english}>{sentence.english_text}</Text>
          </View>

          {!sentenceConfirmed ? (
            <View style={styles.confirmWording}>
              <Text style={styles.confirmWordingTitle}>Is the Kuku Yalanji wording right?</Text>
              <Text style={styles.confirmWordingBody}>Ask the Elder. Confirm only if the words are right as shown; otherwise correct the draft or set it aside.</Text>
              <Button label="The Elder says this wording is right" icon="checkmark-circle-outline" onPress={() => { setSentenceConfirmed(true); setError(null); }} full />
            </View>
          ) : (
            <>
              <View style={styles.confirmedRow}>
                <Ionicons name="checkmark-circle" size={21} color={C.success} />
                <Text style={styles.confirmedText}>Wording confirmed in this speaker-present session</Text>
              </View>
              <View style={{ alignItems: 'center', gap: 12, marginTop: 4 }}>
                <Pressable onPress={recording ? stop : start} disabled={phase === 'saving'}
                  accessibilityRole="button"
                  accessibilityLabel={recording ? 'Stop recording' : 'Start lossless recording'}
                  style={({ pressed }) => [styles.mic, shadow, { backgroundColor: recording ? C.danger : C.forest, transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                  <Ionicons name={recording ? 'stop' : 'mic'} size={54} color={C.white} />
                </Pressable>
                <Text style={styles.micLabel}>
                  {recording ? `Recording lossless audio…  ${fmt(seconds)}  ·  tap to stop` : captured ? 'Tap to record again' : 'Tap the mic, then read the confirmed sentence'}
                </Text>
                <Text style={styles.lossless}>16 kHz · mono · 16-bit PCM WAV · current permission v{speaker.consent_version}</Text>
              </View>
            </>
          )}

          {/* after a take: play + save */}
          {captured && !recording && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Button label="Play" icon="play" variant="ghost" onPress={() => playUri(captured.uri)} style={{ flex: 1 }} />
              <Button label="Save & next" icon="arrow-forward" onPress={saveAndNext} loading={phase === 'saving'} style={{ flex: 1.4 }} />
            </View>
          )}

          {!!note && <Text style={styles.note}>{note}</Text>}
          {error && <Text style={styles.err}>{error}</Text>}

          {/* fix / skip / mark bad */}
          <View style={styles.actions}>
            <ActionBtn icon="create-outline" label="Correct wording" onPress={() => setFixing(true)} disabled={acting || interactionLocked} />
            <ActionBtn icon="play-skip-forward-outline" label="Set aside" onPress={doSkip} disabled={acting || interactionLocked} />
            <ActionBtn icon="close-circle-outline" label="Not usable" tone="danger" onPress={() => setMarkingBad(true)} disabled={acting || interactionLocked} />
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
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
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
          <Text style={styles.sheetKind}>CORRECT THE DRAFT</Text>
          <Text style={styles.sheetGloss}>Enter the Elder’s corrected Kuku Yalanji. You’ll confirm the wording again before recording.</Text>
          <TextInput value={text} onChangeText={setText} multiline autoFocus style={styles.fixInput} placeholderTextColor={C.muted} />
          {original.trim() !== current.trim() && <Text style={styles.origLine}>Original: {original}</Text>}
          <Button label="Save correction" icon="checkmark" onPress={save} loading={busy} disabled={!changed} full style={{ marginTop: 14 }} />
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
          <Text style={styles.sheetKind}>MARK THIS DRAFT NOT USABLE</Text>
          <Text style={styles.sheetGloss}>It leaves the recording queue but stays in the review ledger. Add the Elder’s reason if they want to give one.</Text>
          <TextInput value={reason} onChangeText={setReason} multiline placeholder="Why isn’t this draft usable? (optional)" placeholderTextColor={C.muted} style={styles.fixInput} />
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button label="Not usable" icon="close-circle" onPress={confirm} loading={busy} style={{ flex: 1 }} />
          </View>
          {error && <Text style={styles.err}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PendingBanner({ pending, blocked, onRetry, onDiscard }: { pending: number; blocked: number; onRetry: () => void; onDiscard: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <View style={styles.pendingBar}>
      <Ionicons name="cloud-offline-outline" size={18} color={C.clay} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pendingText}>{pending} lossless take{pending === 1 ? '' : 's'} waiting on this device</Text>
        <Text style={styles.pendingSub}>
          {blocked > 0
            ? `${blocked} cannot upload because its permission or request is no longer valid. It will not retry; keep it here or delete the local copy.`
            : 'Retry honours the consent version attached at capture. Withdrawn or invalid permission will be rejected.'}
        </Text>
      </View>
      {busy ? <ActivityIndicator color={C.clay} size="small" /> : (
        <View style={{ alignItems: 'flex-end', gap: 7 }}>
          <Pressable onPress={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }} hitSlop={6} accessibilityRole="button" accessibilityLabel="Retry waiting recordings"><Text style={styles.pendingRetry}>Retry</Text></Pressable>
          <Pressable onPress={onDiscard} hitSlop={6} accessibilityRole="button" accessibilityLabel="Delete waiting recordings from this device"><Text style={styles.pendingDelete}>Delete</Text></Pressable>
        </View>
      )}
    </View>
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
  permissionState: { fontFamily: F.semibold, fontSize: S.small, marginTop: 5 },
  permissionOn: { color: C.success },
  permissionNeeded: { color: C.clay },

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
  draftMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  draftTag: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: C.sageSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  correctedTag: { backgroundColor: C.claySoft },
  draftTagText: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 0.9, color: C.sage, textTransform: 'uppercase' },
  reviewNeeded: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1, color: C.clay },
  kuku: { fontFamily: F.displayBold, fontSize: 34, lineHeight: 44, color: C.ink },
  englishLabel: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1, color: C.faint },
  english: { fontFamily: F.serifItalic, fontSize: S.heading, color: C.muted, lineHeight: 28 },

  confirmWording: { gap: 10, padding: 16, borderRadius: radius.md, borderWidth: 1.5, borderColor: C.clay, backgroundColor: C.claySoft },
  confirmWordingTitle: { fontFamily: F.display, fontSize: S.heading, color: C.ink },
  confirmWordingBody: { fontFamily: F.body, fontSize: S.label, lineHeight: 22, color: C.inkSoft },
  confirmedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  confirmedText: { flexShrink: 1, fontFamily: F.semibold, fontSize: S.small, color: C.success, textAlign: 'center' },

  mic: { width: 128, height: 128, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  micLabel: { fontFamily: F.medium, fontSize: S.label, color: C.muted, textAlign: 'center' },
  lossless: { fontFamily: F.medium, fontSize: S.eyebrow, letterSpacing: 0.5, color: C.faint, textAlign: 'center' },
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
  pendingSub: { fontFamily: F.body, fontSize: S.eyebrow, lineHeight: 15, color: C.inkSoft, marginTop: 2 },
  pendingRetry: { fontFamily: F.bold, fontSize: S.label, color: C.clay },
  pendingDelete: { fontFamily: F.semibold, fontSize: S.small, color: C.danger },

  // sheets
  backdrop: { flex: 1, backgroundColor: 'rgba(20,28,22,0.45)', justifyContent: 'flex-end' },
  backdropCenter: { flex: 1, backgroundColor: 'rgba(20,28,22,0.52)', justifyContent: 'center', padding: 18 },
  sheet: { maxHeight: '94%', backgroundColor: C.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, paddingBottom: 30 },
  confirmCard: { maxHeight: '90%', backgroundColor: C.bg, borderRadius: radius.xl, padding: 20, ...shadow },
  grip: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.sageLine, marginBottom: 14 },
  sheetKind: { fontFamily: F.bold, fontSize: S.eyebrow, letterSpacing: 1.5, color: C.sage },
  sheetTitle: { fontFamily: F.displayBold, fontSize: S.title, lineHeight: 31, color: C.ink, marginTop: 2 },
  sheetGloss: { fontFamily: F.serifItalic, fontSize: S.body, color: C.muted, marginTop: 2 },
  sessionIcon: { width: 54, height: 54, borderRadius: radius.pill, backgroundColor: C.forest, alignItems: 'center', justifyContent: 'center' },
  useList: { gap: 7, padding: 13, borderRadius: radius.md, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.hair },
  useRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  useText: { flex: 1, fontFamily: F.medium, fontSize: S.small, lineHeight: 19, color: C.inkSoft },
  sessionConfirm: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface },
  sessionConfirmOn: { borderColor: C.forest, backgroundColor: C.sageSoft },
  sessionConfirmText: { flex: 1, fontFamily: F.medium, fontSize: S.label, lineHeight: 21, color: C.ink },
  fieldLabel: { fontFamily: F.semibold, fontSize: S.label, color: C.ink, marginTop: 14, marginBottom: 8 },
  input1: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 14, fontFamily: F.body, fontSize: S.body, color: C.ink },
  fixInput: { backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1, borderColor: C.border, padding: 15, fontFamily: F.display, fontSize: S.heading, color: C.ink, minHeight: 96, textAlignVertical: 'top', marginTop: 12 },
  origLine: { fontFamily: F.body, fontSize: S.small, color: C.faint, marginTop: 10 },
  hint: { fontFamily: F.body, fontSize: S.small, color: C.muted, textAlign: 'center', marginTop: 8 },
});
