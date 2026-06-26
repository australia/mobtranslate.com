'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SharedLayout from '../components/SharedLayout';
import { Card, CardContent, Button } from '@mobtranslate/ui';
import { StatsCard } from '@/components/stats/StatsCard';
import { LoadingState } from '@/components/layout/LoadingState';
import { Mic, BookOpen, MessageSquare, Clock, Globe, ChevronRight, Waves, Plus } from 'lucide-react';

interface LangContribution {
  languageId: string;
  code: string;
  name: string;
  totalClips: number;
  distinctWords: number;
  distinctSentences: number;
  durationSeconds: number;
  lastRecordedAt: string | null;
}
interface ContributionsResponse {
  totals: { totalClips: number; distinctWords: number; distinctSentences: number; durationSeconds: number; languages: number };
  languages: LangContribution[];
}

function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function ContributionsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ContributionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/v2/authenticated/user/contributions');
        if (!res.ok) throw new Error((await res.json()).error || 'Failed to load');
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <SharedLayout>
        <LoadingState text="Loading your contributions…" />
      </SharedLayout>
    );
  }

  const totals = data?.totals;
  const languages = data?.languages ?? [];
  const hasData = languages.length > 0;

  return (
    <SharedLayout>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Mic className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wide">My contributions</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">Your recordings</h1>
          <p className="text-muted-foreground max-w-2xl">
            Every word and sentence you record helps build these dictionaries — and brings a voice
            trained on your own speech a little closer. Here is everything you have contributed.
          </p>
        </header>

        {error && (
          <Card><CardContent className="p-4 text-sm text-red-600">{error}</CardContent></Card>
        )}

        {!hasData && !error && (
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <Waves className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <div>
                <p className="font-medium">You haven&apos;t recorded anything yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Recordings come from the speaker portal or studio. Once you record words and
                  sentences, your progress toward a personal voice model will appear here.
                </p>
              </div>
              <Button asChild>
                <Link href="/speak"><Plus className="h-4 w-4 mr-1" /> Start recording</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {hasData && totals && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard title="Words recorded" value={totals.distinctWords} icon={BookOpen} iconColor="text-amber-600" />
              <StatsCard title="Sentences recorded" value={totals.distinctSentences} icon={MessageSquare} iconColor="text-sky-600" />
              <StatsCard title="Total clips" value={totals.totalClips} icon={Mic} iconColor="text-emerald-600" />
              <StatsCard title="Time recorded" value={fmtDuration(totals.durationSeconds)} icon={Clock} iconColor="text-violet-600" />
            </div>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">By language</h2>
                <span className="text-sm text-muted-foreground">({totals.languages})</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {languages.map((l) => (
                  <Link key={l.languageId} href={`/contributions/${l.code}`} className="block group">
                    <Card className="transition-all hover:shadow-md hover:-translate-y-0.5 border-border/60">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">{l.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              {l.distinctWords} words · {l.distinctSentences} sentences · {fmtDuration(l.durationSeconds)}
                            </p>
                          </div>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-sm font-medium text-primary">
                          <Waves className="h-4 w-4" />
                          View voice-model readiness
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </SharedLayout>
  );
}
