'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@mobtranslate/ui';
import { AlertCircle, Calendar, FilePenLine, FileText, FileX, Globe, RefreshCw, User, XCircle } from 'lucide-react';

type TimeRange = '24h' | '7d' | '30d';

interface RejectedActivity {
  id: string;
  activity_type: 'word_rejected' | 'improvement_rejected';
  created_at: string;
  rejectionReason?: string;
  activity_data?: { reason?: string; notes?: string } | null;
  languages?: { name?: string | null } | null;
  profiles?: { display_name?: string | null; username?: string | null } | null;
  targetDetails?: {
    word?: string;
    improvement_type?: string;
    field_name?: string | null;
    suggested_value?: unknown;
    improvement_reason?: string | null;
    words?: { word?: string | null } | null;
    profiles?: { display_name?: string | null; username?: string | null } | null;
  } | null;
}

interface RejectedResponse {
  activities?: RejectedActivity[];
  stats?: {
    totalRejected?: number;
    wordsRejected?: number;
    improvementsRejected?: number;
    commonRejectionReasons?: Array<{ reason: string; count: number }>;
  };
  error?: string;
}

function rangeStart(range: TimeRange): string {
  const hours = range === '24h' ? 24 : range === '7d' ? 24 * 7 : 24 * 30;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function reviewer(activity: RejectedActivity) {
  return activity.profiles?.display_name || activity.profiles?.username || 'Reviewer not named';
}

function submitter(activity: RejectedActivity) {
  return activity.targetDetails?.profiles?.display_name || activity.targetDetails?.profiles?.username;
}

function activityTitle(activity: RejectedActivity) {
  if (activity.activity_type === 'word_rejected') return activity.targetDetails?.word || 'Dictionary entry';
  return activity.targetDetails?.words?.word || 'Standalone improvement';
}

function suggestionSummary(activity: RejectedActivity) {
  if (activity.activity_type === 'word_rejected') return 'Submitted word entry';
  const field = activity.targetDetails?.field_name || activity.targetDetails?.improvement_type || 'improvement';
  const value = activity.targetDetails?.suggested_value;
  const displayValue = typeof value === 'string' ? value : value ? JSON.stringify(value) : null;
  return `${field.replaceAll(/[_-]/g, ' ')}${displayValue ? `: ${displayValue}` : ''}`;
}

export default function RejectedPage() {
  const [activities, setActivities] = useState<RejectedActivity[]>([]);
  const [stats, setStats] = useState({ totalRejected: 0, wordsRejected: 0, improvementsRejected: 0, commonRejectionReasons: [] as Array<{ reason: string; count: number }> });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  const fetchRejected = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ dateFrom: rangeStart(timeRange), limit: '100' });
      const response = await fetch(`/api/v2/curator/rejected?${params}`);
      const data = (await response.json().catch(() => ({}))) as RejectedResponse;
      if (!response.ok) throw new Error(data.error || 'Could not load rejection history.');
      setActivities(Array.isArray(data.activities) ? data.activities : []);
      setStats({
        totalRejected: data.stats?.totalRejected ?? 0,
        wordsRejected: data.stats?.wordsRejected ?? 0,
        improvementsRejected: data.stats?.improvementsRejected ?? 0,
        commonRejectionReasons: Array.isArray(data.stats?.commonRejectionReasons) ? data.stats.commonRejectionReasons : [],
      });
    } catch (error) {
      setActivities([]);
      setStats({ totalRejected: 0, wordsRejected: 0, improvementsRejected: 0, commonRejectionReasons: [] });
      setLoadError(error instanceof Error ? error.message : 'Could not load rejection history.');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    void fetchRejected();
  }, [fetchRejected]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Curator workspace</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Rejection history</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">Review decisions and their recorded reasons. Rejection is an internal workflow state, not a judgment about a language or community.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([['24h', 'Today'], ['7d', 'This week'], ['30d', 'This month']] as const).map(([value, label]) => (
            <Button key={value} variant="outline" size="sm" className={timeRange === value ? 'bg-primary/10' : ''} onClick={() => setTimeRange(value)}>{label}</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric title="Total rejected" value={stats.totalRejected} icon={XCircle} />
        <Metric title="Word entries" value={stats.wordsRejected} icon={FileText} />
        <Metric title="Improvements" value={stats.improvementsRejected} icon={FilePenLine} />
      </div>

      <Card>
        <CardHeader><CardTitle>Reviewed items</CardTitle><CardDescription>{stats.totalRejected} rejection{stats.totalRejected === 1 ? '' : 's'} recorded in this period</CardDescription></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3" aria-label="Loading rejection history">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-muted" aria-hidden="true" />)}</div>
          ) : loadError ? (
            <HistoryError message={loadError} onRetry={() => void fetchRejected()} />
          ) : activities.length === 0 ? (
            <div className="py-12 text-center"><FileX className="mx-auto mb-4 h-11 w-11 text-muted-foreground" /><p className="text-lg font-medium">No rejections in this period</p><p className="mt-1 text-sm text-muted-foreground">There is no recorded history to show.</p></div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => {
                const reason = activity.rejectionReason || activity.activity_data?.reason || 'No reason recorded';
                return (
                  <article key={activity.id} className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/30">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><p className="text-lg font-semibold">{activityTitle(activity)}</p><Badge variant="secondary">{activity.activity_type === 'word_rejected' ? 'Word' : 'Improvement'}</Badge></div>
                        <p className="mt-1 break-words text-sm text-muted-foreground">{suggestionSummary(activity)}</p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{activity.languages?.name || 'Language not named'}</span>
                          <span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Reviewed by {reviewer(activity)}</span>
                          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{new Date(activity.created_at).toLocaleString()}</span>
                        </div>
                        {submitter(activity) ? <p className="mt-2 text-xs text-muted-foreground">Submitted by {submitter(activity)}</p> : null}
                      </div>
                      <Badge variant="error" className="w-fit">Rejected</Badge>
                    </div>
                    <div className="mt-4 rounded-lg border border-error/20 bg-error/5 p-3"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" /><div><p className="text-sm font-medium">Recorded reason</p><p className="mt-1 text-sm text-muted-foreground">{reason}</p>{activity.activity_data?.notes ? <p className="mt-2 text-sm text-muted-foreground">{activity.activity_data.notes}</p> : null}</div></div></div>
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recorded reasons</CardTitle><CardDescription>Counts from the review history shown above</CardDescription></CardHeader>
        <CardContent>
          {stats.commonRejectionReasons.length === 0 ? <p className="text-sm text-muted-foreground">No rejection reasons are available for this period.</p> : (
            <div className="space-y-2">{stats.commonRejectionReasons.map(({ reason, count }) => <div key={reason} className="flex items-center justify-between gap-4 rounded-lg bg-muted/40 px-3 py-2"><span className="text-sm">{reason}</span><Badge variant="secondary">{count}</Badge></div>)}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof XCircle }) {
  return <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">{title}</CardTitle><Icon className="h-4 w-4 text-error" /></CardHeader><CardContent><div className="text-2xl font-bold">{value}</div><p className="text-xs text-muted-foreground">In the selected period</p></CardContent></Card>;
}

function HistoryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex flex-col items-center py-12 text-center"><AlertCircle className="mb-4 h-11 w-11 text-error" /><p className="text-lg font-semibold">Rejection history did not load</p><p className="mt-2 max-w-xl text-sm text-muted-foreground">{message}</p><Button className="mt-5" variant="outline" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>;
}
