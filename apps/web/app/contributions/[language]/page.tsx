'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import SharedLayout from '../../components/SharedLayout';
import { Card, CardContent, cn } from '@mobtranslate/ui';
import { LoadingState } from '@/components/layout/LoadingState';
import { ArrowLeft, Waves, CheckCircle2, Circle, Mic, BookOpen, MessageSquare, Clock, Info, Sparkles } from 'lucide-react';

interface Dimension { key: string; label: string; score: number; detail: string; weight: number; recommendation?: string }
interface Tier { key: string; name: string; minSeconds: number; minClips: number; blurb: string }
interface Readiness {
  overall: number;
  currentTier: Tier | null;
  nextTier: Tier | null;
  toNextTierSeconds: number;
  durationSeconds: number;
  durationMinutes: number;
  totalClips: number;
  dimensions: Dimension[];
  phonemeCoverage: { covered: number; total: number; missing: string[] } | null;
  nextActions: string[];
}
interface ReadinessResponse {
  language: { id: string; code: string; name: string };
  metrics: { totalClips: number; wordClips: number; sentenceClips: number; distinctWords: number; distinctSentences: number; durationSeconds: number; lastRecordedAt: string | null };
  readiness: Readiness;
}

const TIERS: Tier[] = [
  { key: 'clone', name: 'Voice clone', minSeconds: 30, minClips: 1, blurb: 'Zero-shot adaptation — borrows your timbre, lowest fidelity.' },
  { key: 'minimum', name: 'Minimum fine-tune', minSeconds: 1200, minClips: 100, blurb: 'A LoRA fine-tune becomes viable: recognizably your voice.' },
  { key: 'good', name: 'Good quality', minSeconds: 3600, minClips: 300, blurb: 'Solid everyday quality — the practical target.' },
  { key: 'high', name: 'High quality', minSeconds: 10800, minClips: 800, blurb: 'Natural, hard to distinguish from a recording.' },
  { key: 'full', name: 'Full coverage', minSeconds: 18000, minClips: 1500, blurb: 'Phonetic completeness; the model becomes the limit.' },
];

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
const barColor = (score: number) => (score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500');

export default function VoiceReadinessPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const code = String(params.language);
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push('/login'); return; }
    (async () => {
      try {
        const res = await fetch(`/api/v2/authenticated/user/voice-readiness?language=${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally { setLoading(false); }
    })();
  }, [user, authLoading, router, code]);

  if (authLoading || loading) {
    return <SharedLayout><LoadingState text="Analysing your voice data…" /></SharedLayout>;
  }
  if (error || !data) {
    return (
      <SharedLayout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <Card><CardContent className="p-6 text-sm text-red-600">{error || 'Not found'}</CardContent></Card>
        </div>
      </SharedLayout>
    );
  }

  const { language, metrics, readiness: r } = data;
  const reachedKeys = new Set(TIERS.filter((t) => r.durationSeconds >= t.minSeconds).map((t) => t.key));

  return (
    <SharedLayout>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        <Link href="/contributions" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> My contributions
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Waves className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wide">Voice model readiness</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">{language.name}</h1>
          <p className="text-muted-foreground max-w-2xl">
            How close your recordings are to training a text-to-speech voice on <em>your own voice</em>,
            measured against what single-speaker fine-tuning actually needs.
          </p>
        </header>

        {/* Overall hero */}
        <Card className="overflow-hidden">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              <div className="flex-shrink-0 text-center">
                <div className="text-5xl font-bold tabular-nums">{r.overall}%</div>
                <div className="text-xs text-muted-foreground mt-1">toward a good-quality voice</div>
              </div>
              <div className="flex-1 space-y-3">
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', barColor(r.overall))} style={{ width: `${r.overall}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span><strong>{fmtDuration(r.durationSeconds)}</strong> recorded</span>
                  <span><strong>{r.totalClips}</strong> clips</span>
                  <span><strong>{metrics.distinctWords}</strong> words · <strong>{metrics.distinctSentences}</strong> sentences</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.currentTier
                    ? <>You&apos;ve reached the <strong>{r.currentTier.name}</strong> stage. </>
                    : <>Not enough yet for the first stage. </>}
                  {r.nextTier && <>Next: <strong>{r.nextTier.name}</strong> — about <strong>{fmtDuration(r.toNextTierSeconds)}</strong> more audio.</>}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tier ladder */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Milestones</h2>
          <div className="space-y-2">
            {TIERS.map((t) => {
              const reached = reachedKeys.has(t.key);
              return (
                <div key={t.key} className={cn('flex items-start gap-3 rounded-lg border p-3', reached ? 'border-emerald-300/60 bg-emerald-50/40 dark:bg-emerald-950/10' : 'border-border/60')}>
                  {reached ? <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{fmtDuration(t.minSeconds)} · ~{t.minClips} clips</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{t.blurb}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Dimension breakdown */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">What goes into a good voice model</h2>
          <div className="space-y-4">
            {r.dimensions.map((d) => (
              <Card key={d.key} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="font-medium">{d.label}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">{d.score}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                    <div className={cn('h-full rounded-full', barColor(d.score))} style={{ width: `${d.score}%` }} />
                  </div>
                  <p className="text-sm text-muted-foreground">{d.detail}</p>
                  {d.recommendation && (
                    <p className="text-sm mt-1.5 text-amber-700 dark:text-amber-400">→ {d.recommendation}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Phoneme coverage */}
        {r.phonemeCoverage && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Phonetic coverage</h2>
            <Card className="border-border/60">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  A voice can only say sounds it has heard you make. You&apos;ve recorded words covering{' '}
                  <strong>{r.phonemeCoverage.covered} of {r.phonemeCoverage.total}</strong> phonemes in the language.
                </p>
                {r.phonemeCoverage.missing.length > 0 ? (
                  <div>
                    <p className="text-sm mb-1.5">Still missing — record words containing:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {r.phonemeCoverage.missing.map((p) => (
                        <span key={p} className="font-mono text-sm px-2 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">/{p}/</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Every phoneme in the language is covered.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>
        )}

        {/* Next actions */}
        {r.nextActions.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-500" /> What to do next</h2>
            <Card className="border-border/60">
              <CardContent className="p-4">
                <ol className="space-y-2">
                  {r.nextActions.map((a, i) => (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Explainer */}
        <section>
          <Card className="border-border/60 bg-muted/30">
            <CardContent className="p-4 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-foreground"><Info className="h-4 w-4" /> How this works</p>
              <p>
                We don&apos;t train from scratch. A personal voice is made by <strong>fine-tuning</strong> an
                existing neural model (the project uses Meta&apos;s MMS-TTS, with a related Aboriginal language
                as the base) on a contributor&apos;s own clean, transcribed recordings. The thresholds above
                reflect what single-speaker fine-tuning actually needs: roughly 20&nbsp;minutes to get a
                recognizable voice, about an hour for good quality, and 3–5&nbsp;hours for the best results —
                with clean audio, broad phonetic coverage, and some connected speech mattering as much as raw minutes.
              </p>
              <p>
                Synthesized audio is always a tool, never a replacement for a speaker, and a personal voice
                model would only ever be trained and used with the contributor&apos;s and community&apos;s consent.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </SharedLayout>
  );
}
