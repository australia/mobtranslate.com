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
    cultural_consent: boolean;
    training_consent: boolean;
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
  recentRecordings: Array<{ id: string; created_at: string; duration_ms: number | null; clipped: boolean; spoken_kuku: string; english_text: string; corpus_sentence_id: number; speaker: string | null }>;
};

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

  const load = () => {
    fetch(`${API}/dashboard`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`);
        return r.json();
      })
      .then(setD)
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

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
                    ⬇ TTS manifest (JSONL)
                  </a>
                  <a href={`${API}/export/tts-manifest?cleanOnly=1`} download className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-100">
                    ⬇ TTS manifest — clean clips only
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
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">record</span>
                        {s.training_consent && <span className="ml-1 rounded bg-sky-50 px-1.5 py-0.5 text-sky-700">train</span>}
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
                    <th className="px-4 py-3">Speaker</th>
                    <th className="px-4 py-3 text-right">Length</th>
                    <th className="px-4 py-3">When</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentRecordings.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-stone-400">No recordings yet.</td></tr>
                  )}
                  {d.recentRecordings.map((r) => (
                    <tr key={r.id} className="border-t border-stone-100">
                      <td className="px-4 py-3 text-stone-400">{r.corpus_sentence_id}</td>
                      <td className="px-4 py-3" lang="gvn">{r.spoken_kuku}{r.clipped && <span className="ml-2 text-xs text-rose-500">clipped</span>}</td>
                      <td className="px-4 py-3 text-stone-500">{r.speaker ?? '—'}</td>
                      <td className="px-4 py-3 text-right">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                      <td className="px-4 py-3 text-stone-500">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
