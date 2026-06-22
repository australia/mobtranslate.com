'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@mobtranslate/ui';
import { Users, GraduationCap, Target, Brain, BookOpen, Globe, TrendingUp, Activity } from 'lucide-react';

interface Bar { label: string; count: number }
interface Analytics {
  generatedAt: string;
  totals: {
    users: number; activeLearners: number; quizAttempts: number; quizAccuracy: number;
    wordsInLearning: number; words: number; languages: number; sessions: number;
  };
  recent: { newUsers30d: number; attempts30d: number; sessions30d: number };
  signupsByMonth: Bar[];
  quizByMonth: Bar[];
  learningBuckets: Array<{ bucket: number; label: string; count: number }>;
  perLanguage: Array<{ name: string; code: string; words: number; learners: number; sessions: number }>;
  topLearners: Array<{ name: string; attempts: number; accuracy: number }>;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-3xl font-bold text-foreground tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function BarChart({ data, accent = 'bg-primary' }: { data: Bar[]; accent?: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No activity in this period yet.</p>;
  }
  return (
    <div className="flex items-end gap-1.5 h-40">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex-1 flex items-end">
            <div
              className={`w-full ${accent} rounded-t transition-all`}
              style={{ height: `${Math.max(d.count > 0 ? 4 : 0, (d.count / max) * 100)}%` }}
              title={`${d.label}: ${d.count}`}
            />
          </div>
          <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/admin/analytics');
        if (!res.ok) throw new Error(res.status === 403 ? 'You need an admin role to view analytics.' : 'Failed to load analytics.');
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load analytics.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading analytics…</div>;
  }
  if (error || !data) {
    return (
      <Card><CardContent className="p-8 text-center">
        <p className="text-foreground font-medium">{error || 'No analytics available.'}</p>
      </CardContent></Card>
    );
  }

  const { totals, recent } = data;
  const bucketMax = Math.max(1, ...data.learningBuckets.map((b) => b.count));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary shrink-0" />
          Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Real usage across MobTranslate · updated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      {/* Headline stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total users" value={totals.users} sub={`${recent.newUsers30d} new in last 30 days`} />
        <StatCard icon={GraduationCap} label="Active learners" value={totals.activeLearners} sub="took a quiz or learned words" />
        <StatCard icon={Target} label="Quiz questions answered" value={totals.quizAttempts} sub={`${totals.quizAccuracy}% answered correctly`} />
        <StatCard icon={Brain} label="Words in learning" value={totals.wordsInLearning} sub="spaced-repetition cards started" />
        <StatCard icon={BookOpen} label="Dictionary words" value={totals.words.toLocaleString()} sub={`across ${totals.languages} languages`} />
        <StatCard icon={Activity} label="Quiz sessions" value={totals.sessions} sub={`${recent.sessions30d} in last 30 days`} />
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">New sign-ups (last 12 months)</CardTitle></CardHeader>
          <CardContent><BarChart data={data.signupsByMonth} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Quiz questions answered (last 12 months)</CardTitle></CardHeader>
          <CardContent><BarChart data={data.quizByMonth} accent="bg-success" /></CardContent>
        </Card>
      </div>

      {/* Learning progress funnel */}
      <Card>
        <CardHeader><CardTitle className="text-base">Word-learning progress</CardTitle></CardHeader>
        <CardContent>
          {totals.wordsInLearning === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No words being learned yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.learningBuckets.map((b) => (
                <div key={b.bucket} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-muted-foreground shrink-0">{b.label}</span>
                  <div className="flex-1 bg-muted rounded-full h-5 overflow-hidden">
                    <div className="h-full bg-primary rounded-full flex items-center justify-end px-2" style={{ width: `${Math.max(b.count > 0 ? 6 : 0, (b.count / bucketMax) * 100)}%` }}>
                      {b.count > 0 && <span className="text-[10px] font-medium text-primary-foreground">{b.count}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Per language */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> By language</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-12 text-xs text-muted-foreground font-medium pb-2 border-b border-border">
                <span className="col-span-6">Language</span>
                <span className="col-span-3 text-right">Words</span>
                <span className="col-span-3 text-right">Learners</span>
              </div>
              {data.perLanguage.map((l) => (
                <div key={l.code} className="grid grid-cols-12 py-2 text-sm border-b border-border/50 last:border-0">
                  <span className="col-span-6 font-medium text-foreground truncate">{l.name}</span>
                  <span className="col-span-3 text-right tabular-nums text-muted-foreground">{l.words.toLocaleString()}</span>
                  <span className="col-span-3 text-right tabular-nums text-muted-foreground">{l.learners}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top learners */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><GraduationCap className="h-4 w-4 text-primary" /> Most active learners</CardTitle></CardHeader>
          <CardContent>
            {data.topLearners.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No quiz activity yet.</p>
            ) : (
              <div className="space-y-1">
                {data.topLearners.map((u, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 text-sm border-b border-border/50 last:border-0">
                    <span className="w-5 text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="flex-1 font-medium text-foreground truncate">{u.name}</span>
                    <span className="text-muted-foreground tabular-nums">{u.attempts} answered</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-foreground tabular-nums">{u.accuracy}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
