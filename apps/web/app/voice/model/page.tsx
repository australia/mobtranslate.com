'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import SharedLayout from '../../components/SharedLayout';
import { Card, CardContent } from '@mobtranslate/ui';
import {
  ArrowLeft, Waypoints, Globe, AlertTriangle, CheckCircle2,
  Clock, Mic, AudioLines, MessageSquareQuote, Volume2, Loader2, LogIn, ListChecks, Info,
} from 'lucide-react';

interface Dimension { key: string; label: string; pct: number; value: number; target: number; unit: string; detail: string }
interface Readiness {
  dataReadinessPct: number; tier: string; verdict: string;
  blockers: string[]; nextSteps: string[];
  qualityFloorMet: boolean;
  dimensions: Dimension[];
  totals: { clips: number; words: number; sentences: number; minutes: number; cleanClips: number };
  phonemes: { inventory: number; covered: number; coveragePct: number; underCovered: { symbol: string; count: number }[] };
  language: { code: string; name: string } | null;
}

const DIM_ICON: Record<string, any> = {
  duration: Clock, clips: Mic, phonemes: AudioLines, sentences: MessageSquareQuote, quality: Volume2,
};
const TIER: Record<string, { label: string; cls: string }> = {
  none: { label: 'Not started', cls: 'bg-muted text-muted-foreground' },
  collecting: { label: 'Collecting', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  adaptable: { label: 'First voice possible', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  good: { label: 'Ready for a good voice', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  strong: { label: 'Production-ready', cls: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300' },
};

function barColor(pct: number): string {
  if (pct >= 100) return 'bg-emerald-500';
  if (pct >= 60) return 'bg-primary';
  if (pct >= 30) return 'bg-amber-500';
  return 'bg-rose-400';
}

export default function VoiceModelPage() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/v2/me/voice/readiness').then((r) => (r.ok ? r.json() : null)).then(setData).finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (authLoading) {
    return <SharedLayout><div className="py-24 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></SharedLayout>;
  }
  if (!user) {
    return (
      <SharedLayout>
        <div className="max-w-md mx-auto py-24 text-center">
          <Waypoints className="h-10 w-10 mx-auto text-primary mb-4" />
          <h1 className="text-2xl font-bold mb-2">Voice model readiness</h1>
          <p className="text-muted-foreground mb-6">Sign in to see how close your recordings are to a personal voice model.</p>
          <Link href="/auth/signin" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 h-11 font-semibold">
            <LogIn className="h-4 w-4" /> Sign in
          </Link>
        </div>
      </SharedLayout>
    );
  }

  const tier = data ? (TIER[data.tier] ?? TIER.none) : TIER.none;

  return (
    <SharedLayout>
      <div className="max-w-3xl mx-auto py-8 md:py-12 space-y-6">
        <Link href="/voice" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Your Voice
        </Link>

        {loading || !data ? (
          <div className="py-20 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Headline */}
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary mb-2">Voice model readiness</p>
              <div className="flex items-end gap-4 flex-wrap">
                <h1 className="text-5xl font-bold tabular-nums tracking-tight">{data.dataReadinessPct}%</h1>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full mb-1.5 ${tier.cls}`}>{tier.label}</span>
                {data.language && <span className="text-sm text-muted-foreground mb-2">· {data.language.name}</span>}
              </div>
              <p className="text-muted-foreground mt-2">{data.verdict}</p>
              <div className="mt-4 h-3 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor(data.dataReadinessPct)}`} style={{ width: `${data.dataReadinessPct}%` }} />
              </div>
            </div>

            {/* Licensing note */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <Globe className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h2 className="font-semibold">Public domain</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      All uploaded recordings are contributed to the public domain in perpetuity, so anyone can use them to build and improve voices for the community.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Blockers */}
            {data.blockers.length > 0 && (
              <Card className="border-rose-500/30 bg-rose-500/5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-2 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="h-4 w-4" />
                    <h2 className="font-semibold text-sm uppercase tracking-wider">Before training can start</h2>
                  </div>
                  <ul className="space-y-1.5">
                    {data.blockers.map((b, i) => (
                      <li key={i} className="text-sm text-foreground flex gap-2"><span className="text-rose-500">•</span>{b}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Dimensions */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">The breakdown</h2>
              <div className="space-y-3">
                {data.dimensions.map((d) => {
                  const Icon = DIM_ICON[d.key] ?? AudioLines;
                  return (
                    <Card key={d.key}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium text-sm flex-1">{d.label}</span>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            <b className="text-foreground">{d.value}</b>{d.unit === '%' ? '%' : ` / ${d.target} ${d.unit}`}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${barColor(d.pct)}`} style={{ width: `${d.pct}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">{d.detail}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Phoneme coverage */}
            {data.phonemes.inventory > 0 && (
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold text-sm">Sound coverage</h2>
                    <span className="text-sm tabular-nums text-muted-foreground">{data.phonemes.covered}/{data.phonemes.inventory} sounds</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    A voice needs several clean examples of every sound in the language. These still need more
                    {' '}(grey = not yet recorded, number = examples so far):
                  </p>
                  {data.phonemes.underCovered.length === 0 ? (
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Every sound is well covered.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {data.phonemes.underCovered.map((p) => (
                        <span key={p.symbol}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-mono ${
                            p.count === 0 ? 'bg-muted text-muted-foreground' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          }`}>
                          {p.symbol}<span className="text-[10px] opacity-70">{p.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Next steps */}
            {data.nextSteps.length > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold text-sm uppercase tracking-wider">What to do next</h2>
                  </div>
                  <ol className="space-y-2">
                    {data.nextSteps.map((s, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="shrink-0 h-5 w-5 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold tabular-nums">{i + 1}</span>
                        <span className="text-foreground">{s}</span>
                      </li>
                    ))}
                  </ol>
                  <Link href="/dictionaries" className="inline-flex items-center gap-2 mt-4 rounded-lg bg-primary text-primary-foreground px-4 h-10 text-sm font-semibold">
                    <Mic className="h-4 w-4" /> Record more
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* What it takes — research grounding */}
            <details className="rounded-xl border border-border">
              <summary className="cursor-pointer px-5 py-3 text-sm font-medium flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" /> What it takes to train a voice
              </summary>
              <div className="px-5 pb-5 pt-1 text-sm text-muted-foreground space-y-2">
                <p>Your recordings fine-tune a pre-trained multilingual neural voice model (MMS-TTS / VITS) into one that sounds like you. From published single-speaker practice:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><b className="text-foreground">~30 minutes</b> of clean, transcribed audio is the minimum to adapt a first rough voice; <b className="text-foreground">1–2 hours</b> gives a good one, and quality keeps improving up to a few hours.</li>
                  <li>Many <b className="text-foreground">short clips</b> (2–10 s) beat a few long ones — hundreds for a usable voice, ~1,000+ for a strong one.</li>
                  <li>Every <b className="text-foreground">sound</b> in the language should appear in several clips, so the model can pronounce anything.</li>
                  <li><b className="text-foreground">Sentences</b> (not just words) teach natural rhythm and intonation.</li>
                  <li>Audio must be <b className="text-foreground">clean</b>: one voice, no clipping, low background noise, consistent microphone, ≥16&nbsp;kHz mono.</li>
                  <li>All uploaded recordings are <b className="text-foreground">public domain</b> in perpetuity, so the community can freely build and improve voices.</li>
                </ul>
              </div>
            </details>
          </>
        )}
      </div>
    </SharedLayout>
  );
}
