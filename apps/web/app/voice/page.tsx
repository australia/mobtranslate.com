'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent } from '@mobtranslate/ui';
import {
  Mic, BookOpen, MessageSquareQuote, Clock, Globe, Flame, ChevronRight,
  Waypoints, LogIn, Loader2, AudioLines,
} from 'lucide-react';

interface VoiceStats {
  totals: { clips: number; words: number; sentences: number; minutes: number; languages: number; activeDays: number; lastRecordedAt: string | null };
  byLanguage: { code: string; name: string; clips: number; words: number; sentences: number; minutes: number }[];
  recent: { id: string; kind: string; label: string; gloss: string | null; durationMs: number | null; languageCode: string; createdAt: string }[];
  speakers: { id: string; name: string; community: string | null; dialect: string | null; languageName: string | null; trainingConsent: boolean }[];
}
interface Readiness {
  dataReadinessPct: number; tier: string; verdict: string;
  language: { code: string; name: string } | null;
}

const nf = new Intl.NumberFormat('en-US');
function ago(iso: string | null): string {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 3600) return `${Math.max(1, Math.floor(d / 60))}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const TIER_LABEL: Record<string, string> = {
  none: 'Not started', collecting: 'Collecting', adaptable: 'First voice possible',
  good: 'Ready for a good voice', strong: 'Production-ready',
};

function Stat({ icon: Icon, value, label, tone = 'text-primary' }: { icon: any; value: string | number; label: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <Icon className={`h-5 w-5 mb-3 ${tone}`} />
        <div className="text-3xl font-bold tabular-nums text-foreground">{value}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function VoicePage() {
  const { user, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<VoiceStats | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      fetch('/api/v2/me/voice').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/v2/me/voice/readiness').then((r) => (r.ok ? r.json() : null)),
    ]).then(([s, r]) => { setStats(s); setReadiness(r); }).finally(() => setLoading(false));
  }, [user]);

  if (authLoading) {
    return <SharedLayout><div className="py-24 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></SharedLayout>;
  }

  if (!user) {
    return (
      <SharedLayout>
        <div className="max-w-md mx-auto py-24 text-center">
          <AudioLines className="h-10 w-10 mx-auto text-primary mb-4" />
          <h1 className="text-2xl font-bold mb-2">Your Voice</h1>
          <p className="text-muted-foreground mb-6">Sign in to track the words and sentences you’ve recorded and watch your personal voice model take shape.</p>
          <Link href="/auth/signin" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 h-11 font-semibold">
            <LogIn className="h-4 w-4" /> Sign in
          </Link>
        </div>
      </SharedLayout>
    );
  }

  const t = stats?.totals;

  return (
    <SharedLayout>
      <div className="max-w-5xl mx-auto py-8 md:py-12 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary mb-2">Your Voice</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Contributions</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Every word and sentence you record helps build the dictionary — and brings a voice model trained on <em>your own voice</em> closer.
            </p>
          </div>
          {t?.activeDays ? (
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-border px-4 py-2 shrink-0">
              <Flame className="h-4 w-4 text-amber-500" />
              <span className="text-sm tabular-nums"><b>{t.activeDays}</b> day{t.activeDays === 1 ? '' : 's'} recording</span>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Stat icon={BookOpen} value={nf.format(t?.words ?? 0)} label="words recorded" />
              <Stat icon={MessageSquareQuote} value={nf.format(t?.sentences ?? 0)} label="sentences recorded" tone="text-violet-500" />
              <Stat icon={Clock} value={`${t?.minutes ?? 0}m`} label="of audio" tone="text-amber-500" />
              <Stat icon={Globe} value={nf.format(t?.languages ?? 0)} label={`language${(t?.languages ?? 0) === 1 ? '' : 's'}`} tone="text-emerald-500" />
            </div>

            {/* Voice model readiness teaser → the breakdown page */}
            {readiness && (
              <Link href="/voice/model" className="block group">
                <Card className="transition-all group-hover:border-primary group-hover:shadow-md">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center shrink-0">
                        <Waypoints className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg font-semibold">Your voice model</h2>
                          <span className="text-xs rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{TIER_LABEL[readiness.tier] ?? readiness.tier}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 truncate">{readiness.verdict}</p>
                        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${readiness.dataReadinessPct}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-bold tabular-nums text-primary">{readiness.dataReadinessPct}%</div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto mt-1 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {/* By language + recent */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">By language</h3>
                {stats && stats.byLanguage.length > 0 ? (
                  <div className="space-y-2">
                    {stats.byLanguage.map((l) => (
                      <Card key={l.code}>
                        <CardContent className="p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{l.name}</p>
                            <p className="text-xs text-muted-foreground">{nf.format(l.words)} words · {nf.format(l.sentences)} sentences</p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-muted-foreground">{l.minutes}m</span>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <EmptyRecord />
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Recent recordings</h3>
                {stats && stats.recent.length > 0 ? (
                  <div className="space-y-1.5">
                    {stats.recent.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                        <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          r.kind === 'word' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                        }`}>{r.kind}</span>
                        <span className="flex-1 min-w-0 truncate text-sm" lang={r.languageCode}>{r.label}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : ''} · {ago(r.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyRecord />
                )}
              </div>
            </div>

            {/* CTA */}
            <Card className="bg-muted/40 border-dashed">
              <CardContent className="p-6 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                <Mic className="h-8 w-8 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">Record more to grow your voice</p>
                  <p className="text-sm text-muted-foreground">Open any word in a dictionary and add your pronunciation, or record example sentences.</p>
                </div>
                <Link href="/dictionaries" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 h-10 font-semibold shrink-0">
                  Browse dictionaries <ChevronRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </SharedLayout>
  );
}

function EmptyRecord() {
  return (
    <Card className="border-dashed">
      <CardContent className="p-6 text-center text-sm text-muted-foreground">
        Nothing recorded yet. <Link href="/dictionaries" className="text-primary hover:underline">Start with a word →</Link>
      </CardContent>
    </Card>
  );
}
