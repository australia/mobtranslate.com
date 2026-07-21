'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from '@mobtranslate/ui';
import { useStudioMic } from '@/app/admin/recordings/studio/useStudioMic';
import type { CapturedRecording } from '@/lib/recording/types';
import {
  EMPTY_SPEECH_RIGHTS,
  SPEECH_CONSENT_FORM_VERSION,
  type SpeechConsentGrant,
  type SpeechRights,
} from '@/lib/recording/speech-consent';

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
  consent_record_id: string | null;
  consent_version: number | null;
  consent_event_type: 'grant' | 'replace' | 'withdraw' | null;
  withdrawal_process: string | null;
  recording_allowed: boolean | null;
  asr_evaluation_allowed: boolean | null;
  asr_training_allowed: boolean | null;
  hosted_provider_transfer_allowed: boolean | null;
  public_metrics_allowed: boolean | null;
  public_audio_allowed: boolean | null;
  public_transcript_allowed: boolean | null;
  asr_derived_weights_allowed: boolean | null;
  asr_weight_distribution_allowed: boolean | null;
  tts_training_allowed: boolean | null;
  speaker_voice_replication_allowed: boolean | null;
  tts_derived_weights_allowed: boolean | null;
  tts_weight_distribution_allowed: boolean | null;
  commercial_use_allowed: boolean | null;
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

function consentFromSpeaker(speaker?: Speaker | null): SpeechConsentGrant {
  const rights: SpeechRights = speaker
    ? {
        recordingAllowed: speaker.recording_allowed === true,
        asrEvaluationAllowed: speaker.asr_evaluation_allowed === true,
        asrTrainingAllowed: speaker.asr_training_allowed === true,
        hostedProviderTransferAllowed: speaker.hosted_provider_transfer_allowed === true,
        publicMetricsAllowed: speaker.public_metrics_allowed === true,
        publicAudioAllowed: speaker.public_audio_allowed === true,
        publicTranscriptAllowed: speaker.public_transcript_allowed === true,
        asrDerivedWeightsAllowed: speaker.asr_derived_weights_allowed === true,
        asrWeightDistributionAllowed: speaker.asr_weight_distribution_allowed === true,
        ttsTrainingAllowed: speaker.tts_training_allowed === true,
        speakerVoiceReplicationAllowed: speaker.speaker_voice_replication_allowed === true,
        ttsDerivedWeightsAllowed: speaker.tts_derived_weights_allowed === true,
        ttsWeightDistributionAllowed: speaker.tts_weight_distribution_allowed === true,
        commercialUseAllowed: speaker.commercial_use_allowed === true,
      }
    : { ...EMPTY_SPEECH_RIGHTS };
  return {
    consentFormVersion: SPEECH_CONSENT_FORM_VERSION,
    withdrawalProcess:
      speaker?.withdrawal_process ??
      'Contact the MobTranslate project operator to stop use and withdraw future permission.',
    authorizingBody: null,
    consentArtifactRef: null,
    consentArtifactSha256: null,
    notes: null,
    rights,
  };
}

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

function SpeakerPicker({ operatorName, onStart }: { operatorName: string; onStart: (_speaker: Speaker) => void }) {
  const [speakers, setSpeakers] = useState<Speaker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Speaker | null>(null);
  const [consentSpeaker, setConsentSpeaker] = useState<Speaker | null>(null);
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
              if (!s.consent_record_id || s.recording_allowed !== true) {
                setConsentSpeaker(s);
                return;
              }
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
            {(!s.consent_record_id || s.recording_allowed !== true) && (
              <div className="mt-2 text-sm font-medium text-amber-700">Record permissions before recording</div>
            )}
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
      {consentSpeaker && (
        <SpeechConsentModal
          speaker={consentSpeaker}
          onClose={() => setConsentSpeaker(null)}
          onSaved={() => {
            setConsentSpeaker(null);
            load();
          }}
        />
      )}

      {confirm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
            <h2 className="text-2xl font-bold">Start recording with {confirm.name}</h2>
            <p className="mt-3 text-stone-600">
              Please confirm that <strong>{confirm.name}</strong> is here in person and agrees to have their voice
              recorded today under consent record version {confirm.consent_version}. They can stop at any time and
              use the recorded withdrawal process later.
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
              <button
                onClick={() => {
                  setConfirm(null);
                  setConsentSpeaker(confirm);
                }}
                className="mr-auto rounded-xl px-4 py-3 text-sm font-semibold text-stone-600 hover:bg-stone-100"
              >
                Review permissions
              </button>
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
  const [consent, setConsent] = useState<SpeechConsentGrant>(() => consentFromSpeaker());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await jpost(`${API}/speakers`, {
        name: name.trim(),
        community: community.trim() || null,
        dialect: dialect.trim() || null,
        consent,
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4 sm:p-6">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-8">
        <h2 className="mb-1 text-2xl font-bold">New speaker and permissions</h2>
        <p className="mb-5 text-sm leading-relaxed text-stone-600">
          Record each permitted use separately with the speaker present. Nothing is selected for model work by default.
        </p>
        {error && <p className="mb-3 rounded-lg bg-rose-50 px-4 py-2 text-rose-700">{error}</p>}
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
          <input value={community} onChange={(e) => setCommunity(e.target.value)} placeholder="Community (e.g. Mossman Gorge)" className="w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
          <input value={dialect} onChange={(e) => setDialect(e.target.value)} placeholder="Dialect (optional)" className="w-full rounded-xl border border-stone-300 px-4 py-3 text-lg" />
          <SpeechConsentFields value={consent} onChange={setConsent} />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-5 py-3 font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
          <button disabled={!name.trim() || !consent.rights.recordingAllowed || busy} onClick={save} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            {busy ? 'Saving…' : 'Add speaker'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SpeechConsentModal({
  speaker,
  onClose,
  onSaved,
}: {
  speaker: Speaker;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [consent, setConsent] = useState<SpeechConsentGrant>(() => consentFromSpeaker(speaker));
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await jpost(`${API}/speakers/${speaker.id}/consent`, {
        eventType: speaker.consent_record_id ? 'replace' : 'grant',
        consent,
      });
      onSaved();
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  const withdraw = async () => {
    setBusy(true);
    setError(null);
    try {
      await jpost(`${API}/speakers/${speaker.id}/consent`, {
        eventType: 'withdraw',
        reason: 'Speaker withdrew all current speech permissions in person.',
      });
      onSaved();
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4 sm:p-6">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-8">
        <h2 className="text-2xl font-bold">Speech permissions for {speaker.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          The speaker must be present. Saving creates a new immutable version; it never changes the earlier record.
        </p>
        {error && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-rose-700">{error}</p>}
        <div className="mt-5">
          <SpeechConsentFields value={consent} onChange={setConsent} />
        </div>
        {withdrawing && (
          <div className="mt-5 border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
            This records a withdrawal event and immediately blocks future capture, public sentence audio, and model
            exports for this consent lineage. Existing evidence is retained for audit.
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={() => setWithdrawing(false)} className="rounded-xl px-4 py-2 font-semibold hover:bg-white">
                Keep permissions
              </button>
              <button type="button" onClick={() => void withdraw()} disabled={busy} className="rounded-xl bg-rose-700 px-4 py-2 font-semibold text-white disabled:opacity-40">
                Confirm withdrawal
              </button>
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
          {speaker.consent_record_id && !withdrawing && (
            <button type="button" onClick={() => setWithdrawing(true)} className="mr-auto rounded-xl px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">
              Withdraw all permissions
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-xl px-5 py-3 font-semibold text-stone-500 hover:bg-stone-100">Cancel</button>
          <button type="button" disabled={!consent.rights.recordingAllowed || busy} onClick={() => void save()} className="rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save new version'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsentOption({
  checked,
  onChange,
  title,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (_checked: boolean) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-12 items-start gap-3 border-b border-stone-200 py-3 last:border-b-0">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0"
      />
      <span>
        <span className="block font-medium text-stone-900">{title}</span>
        <span className="mt-0.5 block text-sm leading-relaxed text-stone-600">{description}</span>
      </span>
    </label>
  );
}

function SpeechConsentFields({
  value,
  onChange,
}: {
  value: SpeechConsentGrant;
  onChange: (_value: SpeechConsentGrant) => void;
}) {
  const setRight = (key: keyof SpeechRights, checked: boolean) => {
    const rights = { ...value.rights, [key]: checked };
    if (key === 'asrTrainingAllowed' && !checked) {
      rights.asrDerivedWeightsAllowed = false;
      rights.asrWeightDistributionAllowed = false;
    }
    if (key === 'asrDerivedWeightsAllowed') {
      if (checked) rights.asrTrainingAllowed = true;
      else rights.asrWeightDistributionAllowed = false;
    }
    if (key === 'asrWeightDistributionAllowed' && checked) {
      rights.asrTrainingAllowed = true;
      rights.asrDerivedWeightsAllowed = true;
    }
    if (key === 'ttsTrainingAllowed' && !checked) {
      rights.speakerVoiceReplicationAllowed = false;
      rights.ttsDerivedWeightsAllowed = false;
      rights.ttsWeightDistributionAllowed = false;
    }
    if (key === 'ttsDerivedWeightsAllowed') {
      if (checked) rights.ttsTrainingAllowed = true;
      else rights.ttsWeightDistributionAllowed = false;
    }
    if (key === 'ttsWeightDistributionAllowed' && checked) {
      rights.ttsTrainingAllowed = true;
      rights.ttsDerivedWeightsAllowed = true;
    }
    if (key === 'speakerVoiceReplicationAllowed' && checked) rights.ttsTrainingAllowed = true;
    if (
      key !== 'hostedProviderTransferAllowed' &&
      !rights.asrEvaluationAllowed &&
      !rights.asrTrainingAllowed &&
      !rights.ttsTrainingAllowed
    ) {
      rights.hostedProviderTransferAllowed = false;
    }
    onChange({ ...value, rights });
  };

  const hostedPurpose =
    value.rights.asrEvaluationAllowed ||
    value.rights.asrTrainingAllowed ||
    value.rights.ttsTrainingAllowed;

  return (
    <div className="space-y-4">
      <div className="border border-stone-300 px-4">
        <ConsentOption
          checked={value.rights.recordingAllowed}
          onChange={(checked) => setRight('recordingAllowed', checked)}
          title="Make and keep these recordings"
          description="Required for this recording session. This does not permit training, publication, or a computer voice."
        />
      </div>

      <details open className="border border-stone-300 px-4">
        <summary className="min-h-12 cursor-pointer py-3 font-semibold text-stone-900">Speech recognition</summary>
        <ConsentOption checked={value.rights.asrEvaluationAllowed} onChange={(checked) => setRight('asrEvaluationAllowed', checked)} title="Test speech recognition" description="Compare automatic transcripts with reviewed Kuku Yalanji transcripts." />
        <ConsentOption checked={value.rights.asrTrainingAllowed} onChange={(checked) => setRight('asrTrainingAllowed', checked)} title="Train speech recognition" description="Use the recordings and transcripts to improve a model that listens to Kuku Yalanji." />
        <ConsentOption checked={value.rights.asrDerivedWeightsAllowed} onChange={(checked) => setRight('asrDerivedWeightsAllowed', checked)} title="Create ASR model weights" description="Keep a trained model derived from these recordings." />
        <ConsentOption checked={value.rights.asrWeightDistributionAllowed} onChange={(checked) => setRight('asrWeightDistributionAllowed', checked)} title="Share ASR model weights" description="Allow the derived listening model to be downloaded or hosted by others." />
      </details>

      <details className="border border-stone-300 px-4">
        <summary className="min-h-12 cursor-pointer py-3 font-semibold text-stone-900">Computer speech</summary>
        <ConsentOption checked={value.rights.ttsTrainingAllowed} onChange={(checked) => setRight('ttsTrainingAllowed', checked)} title="Train Kuku Yalanji computer speech" description="Use the recordings to teach a computer to pronounce Kuku Yalanji text." />
        <ConsentOption checked={value.rights.speakerVoiceReplicationAllowed} onChange={(checked) => setRight('speakerVoiceReplicationAllowed', checked)} title="Allow a voice recognizably like this speaker" description="Separate permission for voice replication. Leave this off for a non-identifying shared computer voice." />
        <ConsentOption checked={value.rights.ttsDerivedWeightsAllowed} onChange={(checked) => setRight('ttsDerivedWeightsAllowed', checked)} title="Create speech-model weights" description="Keep a trained speaking model derived from these recordings." />
        <ConsentOption checked={value.rights.ttsWeightDistributionAllowed} onChange={(checked) => setRight('ttsWeightDistributionAllowed', checked)} title="Share speech-model weights" description="Allow the derived speaking model to be downloaded or hosted by others." />
      </details>

      <details className="border border-stone-300 px-4">
        <summary className="min-h-12 cursor-pointer py-3 font-semibold text-stone-900">Transfer and publication</summary>
        <ConsentOption checked={value.rights.hostedProviderTransferAllowed} disabled={!hostedPurpose} onChange={(checked) => setRight('hostedProviderTransferAllowed', checked)} title="Send audio to a hosted GPU provider" description="Needed for RunPod or another outside compute provider. Not needed for work kept on this box." />
        <ConsentOption checked={value.rights.publicMetricsAllowed} onChange={(checked) => setRight('publicMetricsAllowed', checked)} title="Publish combined benchmark results" description="Share aggregate accuracy results without publishing this speaker's audio or transcript." />
        <ConsentOption checked={value.rights.publicAudioAllowed} onChange={(checked) => setRight('publicAudioAllowed', checked)} title="Publish the recordings" description="Allow anyone with the public site to hear these sentence recordings." />
        <ConsentOption checked={value.rights.publicTranscriptAllowed} onChange={(checked) => setRight('publicTranscriptAllowed', checked)} title="Publish the transcripts" description="Allow the written Kuku Yalanji transcripts to appear in a public dataset." />
        <ConsentOption checked={value.rights.commercialUseAllowed} onChange={(checked) => setRight('commercialUseAllowed', checked)} title="Allow commercial use" description="Optional and separate. Leave off for research and non-commercial use only." />
      </details>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-stone-900">How to withdraw permission</span>
        <textarea
          value={value.withdrawalProcess}
          onChange={(event) => onChange({ ...value, withdrawalProcess: event.target.value.slice(0, 2000) })}
          rows={3}
          className="w-full resize-y rounded-xl border border-stone-300 px-4 py-3 text-base"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-stone-900">Authorizing body or family (optional)</span>
        <input
          value={value.authorizingBody ?? ''}
          onChange={(event) => onChange({ ...value, authorizingBody: event.target.value.slice(0, 500) || null })}
          className="w-full rounded-xl border border-stone-300 px-4 py-3 text-base"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-stone-900">Consent note (optional)</span>
        <textarea
          value={value.notes ?? ''}
          onChange={(event) => onChange({ ...value, notes: event.target.value.slice(0, 4000) || null })}
          rows={2}
          className="w-full resize-y rounded-xl border border-stone-300 px-4 py-3 text-base"
        />
      </label>
    </div>
  );
}

/* ------------------------------- Record flow ------------------------------- */

function RecordFlow({ speaker, onExit }: { speaker: Speaker; onExit: () => void }) {
  const mic = useStudioMic({ autoOpen: true });
  const sessionIdRef = useRef(crypto.randomUUID());
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
    if (!speaker.consent_record_id || speaker.recording_allowed !== true) {
      setError('Current speech-recording permission is required. Change speaker and record consent again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(
        'meta',
        JSON.stringify({
          clientId: clientIdRef.current,
          sessionId: sessionIdRef.current,
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
          condition: 'in_person_studio',
          consentRecordId: speaker.consent_record_id,
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
