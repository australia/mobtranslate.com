'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Badge } from '@/app/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/app/components/ui/table';
import { useToast } from '@/app/components/ui/use-toast';
import { RefreshCw, Database, Clock, AlertTriangle, Sparkles, MapPinned, PlayCircle } from 'lucide-react';

interface SyncTask {
  id: string;
  task_type: 'yaml_sync' | 'location_enrichment';
  name: string;
  enabled: boolean;
  interval_minutes: number;
  next_run_at: string;
  last_run_at?: string | null;
  last_status: 'idle' | 'running' | 'success' | 'failed';
  last_error?: string | null;
  is_running: boolean;
  languages?: {
    code: string;
    name: string;
  };
}

interface SyncRun {
  id: string;
  task_type: 'yaml_sync' | 'location_enrichment';
  status: 'running' | 'success' | 'failed';
  started_at: string;
  finished_at?: string | null;
  words_scanned: number;
  words_upserted: number;
  words_deleted: number;
  locations_resolved: number;
  cache_hits: number;
  cache_misses: number;
  error_details?: string | null;
  languages?: {
    code: string;
    name: string;
  };
}

interface SyncDashboardResponse {
  tasks: SyncTask[];
  runs: SyncRun[];
  stats: {
    running_tasks: number;
    failing_tasks: number;
    successful_runs: number;
    failed_runs: number;
    cache_records: number;
  };
}

const fetcher = async (url: string): Promise<SyncDashboardResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to load dictionary sync dashboard');
  }
  return response.json();
};

export default function DictionarySyncAdminPage() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR('/api/v2/admin/dictionary-sync', fetcher, {
    refreshInterval: 15000
  });

  const recentRuns = useMemo(() => data?.runs?.slice(0, 25) || [], [data]);

  async function runAction(action: 'run_due' | 'sync_all' | 'enrich_locations') {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/v2/admin/dictionary-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Failed to run action');
      }

      const payload = await response.json();
      toast({
        title: 'Sync Action Started',
        description: `${action} executed for ${payload.count || 0} task(s).`
      });
      await mutate();
    } catch (requestError) {
      toast({
        title: 'Sync Action Failed',
        description: requestError instanceof Error ? requestError.message : 'Unexpected error',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (error) {
    toast({
      title: 'Failed to load sync dashboard',
      description: error.message,
      variant: 'destructive'
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dictionary Sync Control</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-200">
              Production pipeline for YAML-to-DB sync, scheduled task tracking, and AI-assisted location enrichment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="bg-white text-slate-900 hover:bg-slate-100"
              disabled={isSubmitting}
              onClick={() => runAction('run_due')}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Run Due Tasks
            </Button>
            <Button
              variant="secondary"
              className="bg-cyan-200 text-slate-900 hover:bg-cyan-100"
              disabled={isSubmitting}
              onClick={() => runAction('sync_all')}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync YAML
            </Button>
            <Button
              variant="secondary"
              className="bg-emerald-200 text-slate-900 hover:bg-emerald-100"
              disabled={isSubmitting}
              onClick={() => runAction('enrich_locations')}
            >
              <MapPinned className="mr-2 h-4 w-4" />
              Enrich Locations
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Running Tasks</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.stats?.running_tasks ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failing Tasks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.stats?.failing_tasks ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful Runs</CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.stats?.successful_runs ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Runs</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.stats?.failed_runs ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Geo Cache</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(data?.stats?.cache_records ?? 0).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scheduled Tasks</CardTitle>
          <CardDescription>Every task is tracked and auto-rescheduled after execution.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Language</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead>Last Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">Loading tasks...</TableCell>
                </TableRow>
              ) : (data?.tasks || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No sync tasks configured yet.</TableCell>
                </TableRow>
              ) : (
                (data?.tasks || []).map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>{task.languages?.name || 'Unknown'}</TableCell>
                    <TableCell>
                      <code className="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">{task.task_type}</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          task.last_status === 'failed'
                            ? 'destructive'
                            : task.last_status === 'success'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {task.is_running ? 'running' : task.last_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{task.interval_minutes} min</TableCell>
                    <TableCell>{new Date(task.next_run_at).toLocaleString()}</TableCell>
                    <TableCell>{task.last_run_at ? new Date(task.last_run_at).toLocaleString() : '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Runs</CardTitle>
          <CardDescription>Execution history with throughput and enrichment metrics.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Words</TableHead>
                <TableHead>Locations</TableHead>
                <TableHead>Cache</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">No runs yet.</TableCell>
                </TableRow>
              ) : (
                recentRuns.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>{new Date(run.started_at).toLocaleString()}</TableCell>
                    <TableCell>{run.languages?.name || '-'}</TableCell>
                    <TableCell>{run.task_type}</TableCell>
                    <TableCell>
                      <Badge variant={run.status === 'failed' ? 'destructive' : run.status === 'success' ? 'default' : 'secondary'}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{run.words_upserted.toLocaleString()} / {run.words_scanned.toLocaleString()}</TableCell>
                    <TableCell>{run.locations_resolved.toLocaleString()}</TableCell>
                    <TableCell>{run.cache_hits.toLocaleString()} hits, {run.cache_misses.toLocaleString()} miss</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

