'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mobtranslate/ui';
import { AlertCircle, Calendar, CheckCircle, FilePenLine, FileText, Globe, RefreshCw, User } from 'lucide-react';

type TimeRange = '24h' | '7d' | '30d';

interface ApprovedActivity {
  id: string;
  activity_type: 'word_approved' | 'improvement_approved';
  created_at: string;
  activity_data?: { notes?: string; word?: string; improvement_type?: string } | null;
  languages?: { name?: string | null } | null;
  profiles?: { display_name?: string | null; username?: string | null } | null;
  targetDetails?: {
    word?: string;
    definitions?: Array<{ definition: string }>;
    translations?: Array<{ translation: string }>;
    improvement_type?: string;
    field_name?: string | null;
    suggested_value?: unknown;
    words?: { word?: string | null } | null;
  } | null;
}

interface ApprovedResponse {
  activities?: ApprovedActivity[];
  stats?: { totalApproved?: number; wordsApproved?: number; improvementsApproved?: number };
  error?: string;
}

function rangeStart(range: TimeRange): string {
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function reviewer(activity: ApprovedActivity) {
  return activity.profiles?.display_name || activity.profiles?.username || 'Reviewer not named';
}

function activityTitle(activity: ApprovedActivity) {
  if (activity.activity_type === 'word_approved') return activity.targetDetails?.word || activity.activity_data?.word || 'Dictionary entry';
  return activity.targetDetails?.words?.word || activity.activity_data?.word || 'Standalone improvement';
}

function activityDetail(activity: ApprovedActivity) {
  if (activity.activity_type === 'word_approved') {
    return activity.targetDetails?.translations?.[0]?.translation || activity.targetDetails?.definitions?.[0]?.definition || 'Internal word review recorded';
  }
  const field = activity.targetDetails?.field_name || activity.targetDetails?.improvement_type || activity.activity_data?.improvement_type || 'improvement';
  return `${field.replaceAll(/[_-]/g, ' ')} approved`;
}

export default function ApprovedPage() {
  const [activities, setActivities] = useState<ApprovedActivity[]>([]);
  const [stats, setStats] = useState({ totalApproved: 0, wordsApproved: 0, improvementsApproved: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  const fetchApproved = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ dateFrom: rangeStart(timeRange), limit: '100' });
      const response = await fetch(`/api/v2/curator/approved?${params}`);
      const data = (await response.json().catch(() => ({}))) as ApprovedResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load approval history.');
      setActivities(Array.isArray(data.activities) ? data.activities : []);
      setStats({
        totalApproved: data.stats?.totalApproved ?? 0,
        wordsApproved: data.stats?.wordsApproved ?? 0,
        improvementsApproved: data.stats?.improvementsApproved ?? 0,
      });
    } catch (error) {
      setActivities([]);
      setStats({ totalApproved: 0, wordsApproved: 0, improvementsApproved: 0 });
      setLoadError(error instanceof Error ? error.message : 'Could not load approval history.');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    void fetchApproved();
  }, [fetchApproved]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Curator workspace</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Approval history</h1>
          <p className="mt-2 text-muted-foreground">A real audit trail of entries and suggestions reviewed by the signed-in curator.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([['24h', 'Today'], ['7d', 'This week'], ['30d', 'This month']] as const).map(([value, label]) => (
            <Button key={value} variant="outline" size="sm" className={timeRange === value ? 'bg-primary/10' : ''} onClick={() => setTimeRange(value)}>{label}</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Total approved" value={stats.totalApproved} icon={CheckCircle} />
        <Metric title="Word entries" value={stats.wordsApproved} icon={FileText} />
        <Metric title="Improvements" value={stats.improvementsApproved} icon={FilePenLine} />
      </div>

      <Card>
        <CardHeader><CardTitle>Reviewed items</CardTitle><CardDescription>{stats.totalApproved} approval{stats.totalApproved === 1 ? '' : 's'} in this period</CardDescription></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3" aria-label="Loading approval history">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg bg-muted" aria-hidden="true" />)}</div>
          ) : loadError ? (
            <HistoryError message={loadError} onRetry={() => void fetchApproved()} />
          ) : activities.length === 0 ? (
            <div className="py-12 text-center"><CheckCircle className="mx-auto mb-4 h-11 w-11 text-muted-foreground" /><p className="text-lg font-medium">No approvals in this period</p><p className="mt-1 text-sm text-muted-foreground">The audit trail is empty; no example history is shown.</p></div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <article key={activity.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold">{activityTitle(activity)}</p><Badge variant="secondary">{activity.activity_type === 'word_approved' ? 'Word' : 'Improvement'}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{activityDetail(activity)}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{activity.languages?.name || 'Language not named'}</span>
                      <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />{reviewer(activity)}</span>
                      <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(activity.created_at).toLocaleString()}</span>
                    </div>
                    {activity.activity_data?.notes ? <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">{activity.activity_data.notes}</p> : null}
                  </div>
                  <Badge variant="primary" className="w-fit bg-success">Approved</Badge>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof CheckCircle }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-success" /></CardHeader><CardContent><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground">In the selected period</p></CardContent></Card>;
}

function HistoryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex flex-col items-center py-12 text-center"><AlertCircle className="mb-4 h-11 w-11 text-error" /><p className="text-lg font-semibold">Approval history did not load</p><p className="mt-2 max-w-xl text-sm text-muted-foreground">{message}</p><Button className="mt-5" variant="outline" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>;
}
