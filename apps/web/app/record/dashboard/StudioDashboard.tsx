'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = '/api/v2/recordings/sentence-corpus';

type Dash = {
  totals: {
    total_sentences: number;
    recorded: number;
    marked_bad: number;
    skipped: number;
    pending: number;
    clips: number;
    minutes: number;
    fixes: number;
    approvals: number;
  };
  perSpeaker: Array<{
    speaker_id: string;
    name: string;
    community: string | null;
    dialect: string | null;
    consent_record_id: string | null;
    recording_allowed: boolean | null;
    asr_evaluation_allowed: boolean | null;
    asr_training_allowed: boolean | null;
    hosted_provider_transfer_allowed: boolean | null;
    public_audio_allowed: boolean | null;
    public_transcript_allowed: boolean | null;
    tts_training_allowed: boolean | null;
    speaker_voice_replication_allowed: boolean | null;
    asr_weight_distribution_allowed: boolean | null;
    tts_weight_distribution_allowed: boolean | null;
    clips: number;
    minutes: number;
    clipped: number;
    last_recorded_at: string | null;
  }>;
  recentFixes: Array<{
    id: string;
    created_at: string;
    previous_kuku: string;
    new_kuku: string;
    corpus_sentence_id: number;
    english_text: string;
    speaker: string | null;
  }>;
  recentBad: Array<{ id: string; created_at: string; reason: string | null; corpus_sentence_id: number; kuku_text: string; english_text: string; speaker: string | null }>;
  recentRecordings: Array<{
    id: string;
    created_at: string;
    duration_ms: number | null;
    clipped: boolean;
    spoken_kuku: string;
    english_text: string;
    corpus_sentence_id: number;
    speaker: string | null;
    audio_url: string;
    transcript: string | null;
    transcript_status: 'draft' | 'single_review' | 'adjudicated' | 'rejected' | null;
    transcript_version: number | null;
    orthography_version: string | null;
    can_adjudicate: boolean;
  }>;
};

type RecentRecording = Dash['recentRecordings'][number];

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className={`text-3xl font-bold ${tone ?? 'text-stone-900'}`}>{value}</div>
      <div className="mt-1 text-sm text-stone-500">{label}</div>
    </div>
  );
}

export default function StudioDashboard({ canExport }: { canExport: boolean }) {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<RecentRecording | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);

  const load = () => {
    setError(null);
    fetch(`${API}/dashboard`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`);
        return r.json();
      })
      .then(setD)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const openReview = (recording: RecentRecording) => {
    setReviewing(recording);
    setReviewText(recording.transcript ?? recording.spoken_kuku);
    setReviewNotes('');
    setReviewError(null);
  };

  const submitReview = async (status: 'adjudicated' | 'rejected') => {
    if (!reviewing?.transcript_version || !reviewText.trim()) return;
    setSubmittingReview(true);
    setReviewError(null);
    try {
      const response = await fetch(`${API}/transcripts/${reviewing.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: reviewing.transcript_version,
          status,
          transcript: reviewText.trim(),
          orthographyVersion: reviewing.orthography_version ?? 'project-nfc-v1',
          notes: reviewNotes.trim() || null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Review failed (${response.status})`);
      }
      setReviewing(null);
      load();
    } catch (reviewFailure) {
      setReviewError((reviewFailure as Error).message);
    } finally {
      setSubmittingReview(false);
    }
  };

  const t = d?.totals;
  return (
    <main className="min-h-screen bg-stone-50 px-6 py-8 text-stone-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Sentence recording studio</h1>
            <p className="text-stone-500">Kuku Yalanji TTS corpus · elder verification</p>
          </div>
          <div className="flex gap-3">
            <Link href="/record" className="rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700">
              Open studio →
            </Link>
            <button onClick={load} className="rounded-xl border border-stone-300 px-4 py-2.5 font-semibold text-stone-600 hover:bg-stone-100">
              Refresh
            </button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-rose-700">{error}</p>}
        {!d && !error && <p className="text-stone-400">Loading…</p>}

        {t && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
              <Stat label="Recorded" value={t.recorded} tone="text-emerald-700" />
              <Stat label="Minutes of audio" value={t.minutes} />
              <Stat label="Clips" value={t.clips} />
              <Stat label="Pending" value={t.pending} tone="text-stone-500" />
              <Stat label="Elder fixes" value={t.fixes} tone="text-amber-600" />
              <Stat label="Marked bad" value={t.marked_bad} tone="text-rose-600" />
            </div>

            {/* Exports */}
            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="text-lg font-bold">Exports</h2>
              {canExport ? (
                <div className="mt-3 flex flex-wrap gap-3">
                  <a href={`${API}/export/pairs`} download className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
                    ⬇ Elder-verified pairs (JSONL)
                  </a>
                  <a href={`${API}/export/tts-manifest`} download className="rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-stone-700">
                    ⬇ Governed TTS manifest (local)
                  </a>
                  <a href={`${API}/export/tts-manifest?execution=hosted`} download className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100">
                    ⬇ TTS manifest (hosted GPU)
                  </a>
                  <a href={`${API}/export/asr-inventory?purpose=evaluation&execution=local`} download className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100">
                    ⬇ ASR evaluation inventory
                  </a>
                  <a href={`${API}/export/asr-inventory?purpose=training&execution=hosted&promotion=1`} download className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100">
                    ⬇ ASR training inventory (hosted GPU)
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-500">Exports require a language-admin role.</p>
              )}
              <p className="mt-3 text-xs text-stone-400">
                {t.approvals} sentences confirmed as-is · {t.fixes} corrected · {t.marked_bad} rejected — the verified-pairs export is the elder-verification record for the synthetic corpus.
              </p>
            </div>

            {/* Speakers */}
            <h2 className="mt-8 mb-3 text-xl font-bold">Speakers</h2>
            <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Speaker</th>
                    <th className="px-4 py-3">Community</th>
                    <th className="px-4 py-3 text-right">Clips</th>
                    <th className="px-4 py-3 text-right">Minutes</th>
                    <th className="px-4 py-3 text-right">Clipped</th>
                    <th className="px-4 py-3">Consent</th>
                    <th className="px-4 py-3">Last recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {d.perSpeaker.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-stone-400">No recordings yet.</td></tr>
                  )}
                  {d.perSpeaker.map((s) => (
                    <tr key={s.speaker_id} className="border-t border-stone-100">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-stone-500">{[s.community, s.dialect].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-4 py-3 text-right">{s.clips}</td>
                      <td className="px-4 py-3 text-right">{s.minutes}</td>
                      <td className="px-4 py-3 text-right">{s.clipped}</td>
                      <td className="px-4 py-3 text-xs">
                        {!s.consent_record_id && <span className="text-rose-700">legacy only</span>}
                        {s.recording_allowed && <span className="mr-1 inline-block rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">record</span>}
                        {s.asr_evaluation_allowed && <span className="mr-1 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">ASR test</span>}
                        {s.asr_training_allowed && <span className="mr-1 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">ASR train</span>}
                        {s.tts_training_allowed && <span className="mr-1 inline-block rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">speech train</span>}
                        {s.speaker_voice_replication_allowed && <span className="mr-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">voice likeness</span>}
                        {s.hosted_provider_transfer_allowed && <span className="mr-1 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-stone-700">hosted GPU</span>}
                      </td>
                      <td className="px-4 py-3 text-stone-500">{s.last_recorded_at ? new Date(s.last_recorded_at).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent fixes with diff */}
            <h2 className="mt-8 mb-3 text-xl font-bold">Recent elder corrections</h2>
            <div className="space-y-3">
              {d.recentFixes.length === 0 && <p className="text-stone-400">No corrections yet.</p>}
              {d.recentFixes.map((f) => (
                <div key={f.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="mb-1 text-xs text-stone-400">
                    #{f.corpus_sentence_id} · {f.speaker ?? 'unknown'} · {new Date(f.created_at).toLocaleString()}
                  </div>
                  <div className="text-sm text-stone-500">{f.english_text}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-lg">
                    <span lang="gvn" className="rounded bg-rose-50 px-2 py-1 text-rose-700 line-through">{f.previous_kuku}</span>
                    <span className="text-stone-400">→</span>
                    <span lang="gvn" className="rounded bg-emerald-50 px-2 py-1 font-semibold text-emerald-800">{f.new_kuku}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent recordings */}
            <h2 className="mt-8 mb-3 text-xl font-bold">Recent recordings</h2>
            <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-50 text-stone-500">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Kuku (spoken)</th>
                    <th className="px-4 py-3">Audio</th>
                    <th className="px-4 py-3">Speaker</th>
                    <th className="px-4 py-3">Transcript</th>
                    <th className="px-4 py-3 text-right">Length</th>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentRecordings.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-stone-400">No recordings yet.</td></tr>
                  )}
                  {d.recentRecordings.map((r) => (
                    <tr key={r.id} className="border-t border-stone-100">
                      <td className="px-4 py-3 text-stone-400">{r.corpus_sentence_id}</td>
                      <td className="px-4 py-3" lang="gvn">{r.spoken_kuku}{r.clipped && <span className="ml-2 text-xs text-rose-500">clipped</span>}</td>
                      <td className="px-4 py-3">
                        <audio className="h-8 w-48" controls preload="none" src={r.audio_url}>
                          Your browser cannot play this recording.
                        </audio>
                      </td>
                      <td className="px-4 py-3 text-stone-500">{r.speaker ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${r.transcript_status === 'adjudicated' ? 'bg-emerald-50 text-emerald-700' : r.transcript_status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
                          {r.transcript_status?.replace('_', ' ') ?? 'legacy'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                      <td className="px-4 py-3 text-stone-500">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {r.transcript_version && r.can_adjudicate ? (
                          <button
                            type="button"
                            onClick={() => openReview(r)}
                            className="whitespace-nowrap rounded-lg border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                          >
                            Review transcript
                          </button>
                        ) : r.transcript_version ? (
                          <span className="text-xs text-stone-400">Another reviewer needed</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {reviewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="transcript-review-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="transcript-review-title" className="text-xl font-bold">Check the recording</h2>
                <p className="mt-1 text-sm text-stone-500">Listen closely, then correct the written Kuku Yalanji before confirming it.</p>
              </div>
              <button
                type="button"
                onClick={() => setReviewing(null)}
                className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
                aria-label="Close transcript review"
              >
                ✕
              </button>
            </div>

            <audio className="mt-5 w-full" controls autoPlay preload="metadata" src={reviewing.audio_url}>
              Your browser cannot play this recording.
            </audio>
            <p className="mt-4 text-sm text-stone-500">English prompt</p>
            <p className="font-medium">{reviewing.english_text}</p>

            <label className="mt-5 block">
              <span className="mb-1 block text-sm font-semibold">Kuku Yalanji transcript</span>
              <textarea
                lang="gvn"
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value.slice(0, 4000))}
                rows={4}
                className="w-full resize-y rounded-lg border border-stone-300 px-4 py-3 text-lg focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-semibold">Review note (optional)</span>
              <textarea
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value.slice(0, 4000))}
                rows={2}
                className="w-full resize-y rounded-lg border border-stone-300 px-4 py-3 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            {reviewError && <p className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{reviewError}</p>}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={submittingReview}
                onClick={() => void submitReview('rejected')}
                className="rounded-lg border border-rose-300 px-4 py-2.5 font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              >
                Reject recording
              </button>
              <button
                type="button"
                disabled={submittingReview || !reviewText.trim()}
                onClick={() => void submitReview('adjudicated')}
                className="rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {submittingReview ? 'Saving…' : 'Confirm transcript'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
