'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@mobtranslate/ui';
import { useStudioMic } from '@/app/admin/recordings/studio/useStudioMic';
import type { CapturedRecording } from '@/lib/recording/types';

const API = '/api/v2/recordings/sentence-corpus';

type Speaker = {
  id: string;
  name: string;
  community: string | null;
  dialect: string | null;
  gender: string | null;
  age: number | null;
  cultural_consent: boolean;
  training_consent: boolean;
  clips: number;
  minutes: number;
};

type Sentence = {
  id: string;
  corpus_sentence_id: number;
  kuku_text: string;
  english_text: string;
  original_kuku: string;
  analysis: string | null;
  frame: string | null;
  already_fixed: boolean;
};

type Progress = { total: number; done: number; pending: number; skipped: number; recorded: number; position: number };

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
  return r.json();
}
async function jpost<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
  return r.json();
}

function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SentenceStudio({ operatorName }: { operatorName: string }) {
  const [step, setStep] = useState<'pick' | 'record'>('pick');
  const [speaker, setSpeaker] = useState<Speaker | null>(null);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-900">
      {step === 'pick' ? (
        <SpeakerPicker
          operatorName={operatorName}
          onStart={(s) => {
            setSpeaker(s);
            setStep('record');
          }}
        />
      ) : (
        <RecordFlow speaker={speaker!} onExit={() => setStep('pick')} />
      )}
    </main>
  );
}

/* ------------------------------- Speaker picker ------------------------------- */

function SpeakerPicker({ operatorName, onStart }: { operatorName: string; onStart: (s: Speaker) => void }) {
  const [speakers, setSpeakers] = useState<Speaker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Speaker | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);

  const load = useCallback(() => {
    setError(null);
    jget<Speaker[]>(`${API}/speakers`).then(setSpeakers).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold">Who is recording today?</h1>
        <Link href="/record/dashboard" className="text-sm font-medium text-stone-500 hover:text-stone-800">
          Operator dashboard →
        </Link>
      </div>
      <p className="text-stone-500 mb-8">Operator: {operatorName} · Kuku Yalanji sentence studio</p>

      {error && <p className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-rose-700">{error}</p>}
      {!speakers && !error && <p className="text-stone-400">Loading speakers…</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {speakers?.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setConfirm(s);
              setConsentChecked(false);
            }}
            className="rounded-2xl border border-stone-200 bg-white p-6 text-left shadow-sm transition hover:border-emerald-400 hover:shadow"
          >
            <div className="text-2xl font-semibold">{s.name}</div>
            <div className="text-stone-500">{[s.community, s.dialect].filter(Boolean).join(' · ') || '—'}</div>
            <div className="mt-3 text-sm text-stone-400">
              {s.clips} clips · {s.minutes} min recorded
            </div>
          </button>
        ))}
        {speakers && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-2xl border-2 border-dashed border-stone-300 p-6 text-left text-stone-500 transition hover:border-emerald-400 hover:text-emerald-700"
          >
            <div className="text-2xl font-semibold">+ New speaker</div>
            <div className="text-sm">Add an elder and record their consent</div>
          </button>
        )}
      </div>

      {adding && <NewSpeakerModal onClose={() => setAdding(false)} onCreated={() => { setAdding(false); load(); }} />}

      {confirm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-bold">Start recording with {confirm.name}</h2>
            <p className="mt-3 text-stone-600">
              Please confirm that <strong>{confirm.name}</strong> is here in person and agrees to have their voice
              recorded today for the Kuku Yalanji language project, and for these recordings to help build a
              community speech and translation resource.
            </p>
            <label className="mt-5 flex items-start gap-3 rounded-xl bg-stone-50 p-4">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-1 h-6 w-6 shrink-0"
              />
              <span className="text-lg text-stone-700">
                {confirm.name} is present and consents to record today.
              </span>
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirm(null)} className="rounded-xl px-5 py-3 text-lg font-semibold text-stone-500 hover:bg-stone-100">
                Cancel
              </button>
              <button
                disabled={!consentChecked}
                onClick={() => onStart(confirm)}
                className="rounded-xl bg-emerald-600 px-6 py-3 text-lg font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Start recording
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewSpeakerModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [community, setCommunity] = useState('');
  const [dialect, setDialect] = useState('');
  const [culturalConsent, setCulturalConsent] = useState(false);
  const [trainingConsent, setTrainingConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await jpost(`${API}/speakers`, { name: name.trim(), community: community.trim() || null, dialect: dialect.trim() || null, culturalConsent, trainingConsent });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="text-2xl font-bold mb-4">New speaker</h2>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-rose-700">{error}</p>}
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
          <input value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="Community (e.g. Mossman Gorge)" className="w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
          <input value={dialect} onChange={(e) => setDialect(e.target.value)} placeholder="Dialect (optional)" className="w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
          <label className="flex items-start gap-3 rounded-xl bg-stone-50 p-3">
            <input type="checkbox" checked={culturalConsent} onChange={(e) => setCulturalConsent(e.target.checked)} className="mt-1 h-5 w-5" />
            <span className="text-stone-700">Consents to record their voice and publish recordings for the language project.</span>
          </label>
          <label className="flex items-start gap-3 rounded-xl bg-stone-50 p-3">
            <input type="checkbox" checked={trainingConsent} onChange={(e) => setTrainingConsent(e.target.checked)} className="mt-1 h-5 w-5" />
            <span className="text-stone-700">Consents to their recordings being used to train a Kuku Yalanji voice/model (optional).</span>
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-5 py-3 font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
          <button disabled={!name.trim() || !culturalConsent || busy} onClick={save} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            {busy ? 'Saving…' : 'Add speaker'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Record flow ------------------------------- */

function RecordFlow({ speaker, onExit }: { speaker: Speaker; onExit: () => void }) {
  const mic = useStudioMic({ autoOpen: true });
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // capture state
  const [captured, setCaptured] = useState<CapturedRecording | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // dialogs
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [markingBad, setMarkingBad] = useState(false);
  const [badReason, setBadReason] = useState('');

  const clearTake = useCallback(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    clientIdRef.current = null;
    setCaptured(null);
    setElapsed(0);
  }, []);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError(null);
    clearTake();
    try {
      const data = await jget<{ sentence: Sentence | null; progress: Progress }>(`${API}/next?speakerId=${speaker.id}`);
      setSentence(data.sentence);
      setProgress(data.progress);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [speaker.id, clearTake]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  // elapsed timer while recording
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - startRef.current), 200);
    return () => clearInterval(t);
  }, [recording]);

  const flashToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  };

  const startRec = async () => {
    if (!mic.recorder) return;
    clearTake();
    try {
      await mic.recorder.start();
      startRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
    } catch (e) {
      setError((e as Error).message || 'Could not start the microphone.');
    }
  };

  const stopRec = async () => {
    if (!mic.recorder) return;
    try {
      const take = await mic.recorder.stop();
      setRecording(false);
      clientIdRef.current = (crypto as any).randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      audioUrlRef.current = URL.createObjectURL(take.opusBlob ?? take.wavBlob);
      setCaptured(take);
    } catch (e) {
      setRecording(false);
      setError((e as Error).message);
    }
  };

  const play = () => {
    if (audioRef.current && audioUrlRef.current) {
      audioRef.current.src = audioUrlRef.current;
      void audioRef.current.play();
    }
  };

  const save = async () => {
    if (!captured || !sentence || !clientIdRef.current) return;
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(
        'meta',
        JSON.stringify({
          clientId: clientIdRef.current,
          sentenceId: sentence.id,
          speakerId: speaker.id,
          spokenKuku: sentence.kuku_text,
          sampleRate: captured.sampleRate,
          bitDepth: captured.bitDepth,
          channels: captured.channels,
          durationMs: captured.durationMs,
          peakAmplitude: captured.peakAmplitude,
          clipped: captured.clipped,
          recordedVia: 'web',
          culturalConsent: speaker.cultural_consent,
          trainingConsent: speaker.training_consent,
        }),
      );
      fd.append('master', captured.wavBlob, 'master.wav');
      if (captured.opusBlob) fd.append('opus', captured.opusBlob, 'take.webm');
      const r = await fetch(`${API}/upload`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Upload failed (${r.status})`);
      flashToast('Saved ✓');
      await loadNext();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    } finally {
      setSaving(false);
    }
  };

  const doFix = async () => {
    if (!sentence || !editText.trim()) return;
    try {
      await jpost(`${API}/review`, { sentenceId: sentence.id, speakerId: speaker.id, action: 'fixed', newKuku: editText.trim() });
      setSentence({ ...sentence, kuku_text: editText.trim(), already_fixed: true });
      setEditing(false);
      clearTake();
      flashToast('Text fixed — now record it');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doSkip = async () => {
    if (!sentence) return;
    try {
      await jpost(`${API}/review`, { sentenceId: sentence.id, speakerId: speaker.id, action: 'skipped' });
      await loadNext();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doMarkBad = async () => {
    if (!sentence) return;
    try {
      await jpost(`${API}/review`, { sentenceId: sentence.id, speakerId: speaker.id, action: 'marked_bad', reason: badReason.trim() || null });
      setMarkingBad(false);
      setBadReason('');
      await loadNext();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const pct = progress && progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0;
  const micBlocked = mic.micState === 'denied' || mic.micState === 'nomic' || mic.micState === 'inuse';

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-5">
      {/* Header + progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="text-stone-500 hover:text-stone-800">‹ Change speaker</button>
          <div className="text-right">
            <div className="text-lg font-semibold">{speaker.name}</div>
            <div className="text-sm text-stone-500" data-testid="progress-count">
              {progress ? `${progress.done} of ${progress.total}` : '…'}
            </div>
          </div>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-stone-200">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {micBlocked && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-800">
          {mic.micState === 'denied' && 'Microphone is blocked. Allow microphone access in the browser to record.'}
          {mic.micState === 'nomic' && 'No microphone found. Plug one in and reload.'}
          {mic.micState === 'inuse' && 'The microphone is in use by another app.'}
          <button onClick={() => void mic.open()} className="ml-3 underline">Try again</button>
        </div>
      )}
      {error && <div className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</div>}

      {/* Sentence */}
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {loading ? (
          <p className="text-2xl text-stone-400">Loading…</p>
        ) : !sentence ? (
          <div>
            <p className="text-4xl font-bold text-emerald-700">All done! 🎉</p>
            <p className="mt-3 text-xl text-stone-500">There are no more sentences to record right now.</p>
          </div>
        ) : (
          <>
            <p
              lang="gvn"
              data-testid="kuku-text"
              className="max-w-3xl text-5xl font-bold leading-tight tracking-tight text-stone-900 md:text-6xl"
            >
              {sentence.kuku_text}
            </p>
            <p className="mt-6 max-w-2xl text-2xl text-stone-500">{sentence.english_text}</p>
            {sentence.already_fixed && (
              <p className="mt-3 text-sm font-medium text-amber-600">✎ text corrected by elder</p>
            )}
            {recording && (
              <div className="mt-8 flex items-center gap-3 text-2xl font-semibold text-rose-600">
                <span className="inline-block h-5 w-5 animate-pulse rounded-full bg-rose-600" />
                Recording {fmtElapsed(elapsed)}
              </div>
            )}
            {captured && !recording && (
              <p className="mt-8 text-lg text-stone-500">Recorded {fmtElapsed(captured.durationMs)} · listen back, then save</p>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      {sentence && (
        <div className="mt-6 space-y-3">
          {/* primary row: record / stop / play / save */}
          <div className="grid grid-cols-2 gap-3">
            {!recording ? (
              <BigButton onClick={startRec} className="bg-rose-600 text-white hover:bg-rose-700" testid="btn-record">
                ⏺ {captured ? 'Record again' : 'Record'}
              </BigButton>
            ) : (
              <BigButton onClick={stopRec} className="animate-pulse bg-rose-700 text-white" testid="btn-stop">
                ⏹ Stop
              </BigButton>
            )}
            <BigButton onClick={play} disabled={!captured} className="bg-stone-200 text-stone-800 hover:bg-stone-300" testid="btn-play">
              ▶ Play back
            </BigButton>
          </div>
          <BigButton
            onClick={save}
            disabled={!captured || saving}
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
            testid="btn-save"
          >
            {saving ? 'Saving…' : '✓ Save & next'}
          </BigButton>
          {/* secondary row */}
          <div className="grid grid-cols-3 gap-3">
            <BigButton onClick={() => { setEditText(sentence.kuku_text); setEditing(true); }} className="bg-amber-100 text-amber-800 hover:bg-amber-200" small testid="btn-fix">
              ✏️ Fix the words
            </BigButton>
            <BigButton onClick={doSkip} className="bg-stone-100 text-stone-600 hover:bg-stone-200" small testid="btn-skip">
              ⏭ Skip
            </BigButton>
            <BigButton onClick={() => setMarkingBad(true)} className="bg-rose-50 text-rose-700 hover:bg-rose-100" small testid="btn-bad">
              ✗ Not right
            </BigButton>
          </div>
        </div>
      )}

      <audio ref={audioRef} className="hidden" />
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-stone-900 px-6 py-3 text-lg font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Fix text modal */}
      {editing && sentence && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-bold">Fix the Kuku Yalanji words</h2>
            <p className="mt-1 text-stone-500">English: {sentence.english_text}</p>
            <p className="mt-1 text-sm text-stone-400">Original: {sentence.original_kuku}</p>
            <textarea
              data-testid="fix-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="mt-4 w-full rounded-xl border border-stone-300 p-4 text-3xl leading-snug"
              autoFocus
            />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditing(false)} className="rounded-xl px-5 py-3 text-lg font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
              <button onClick={doFix} disabled={!editText.trim()} data-testid="fix-save" className="rounded-xl bg-amber-500 px-6 py-3 text-lg font-semibold text-white hover:bg-amber-600 disabled:opacity-40">
                Save correction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark bad modal */}
      {markingBad && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-bold">Mark this sentence as not right</h2>
            <p className="mt-2 text-stone-600">This removes it from the queue. You can add a quick reason (optional).</p>
            <input
              data-testid="bad-reason"
              value={badReason}
              onChange={(e) => setBadReason(e.target.value)}
              placeholder="e.g. wrong word, not how we say it"
              className="mt-4 w-full rounded-xl border border-stone-300 px-4 py-3 text-lg"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setMarkingBad(false)} className="rounded-xl px-5 py-3 text-lg font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
              <button onClick={doMarkBad} data-testid="bad-confirm" className="rounded-xl bg-rose-700 px-6 py-3 text-lg font-semibold text-white hover:bg-rose-800">
                Mark not right
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BigButton({
  children,
  onClick,
  disabled,
  className,
  small,
  testid,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  small?: boolean;
  testid?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      data-testid={testid}
      className={cn(
        'flex items-center justify-center rounded-2xl font-bold transition disabled:cursor-not-allowed disabled:opacity-40',
        small ? 'min-h-[72px] px-3 text-lg' : 'min-h-[88px] px-4 text-2xl',
        className,
      )}
    >
      {children}
    </button>
  );
}
