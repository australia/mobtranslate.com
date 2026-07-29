'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@mobtranslate/ui';
import { Mic, Globe, Users, Clock, ArrowLeft, AlertCircle } from 'lucide-react';

interface Recording {
  id: string;
  label: string;
  gloss: string | null;
  kind: string;
  status: string;
  duration_ms: number | null;
  created_at: string;
  master_url: string | null;
  opus_url: string | null;
  language_id: string;
  speaker_id: string | null;
  speaker?: { id: string; name: string; community: string | null } | null;
  language?: { id: string; name: string; code: string } | null;
}

interface LanguageOption {
  id: string;
  name: string;
}

const fmtDur = (ms: number | null) => (ms ? `${(ms / 1000).toFixed(1)}s` : '—');
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export default function RecordingLibraryPage() {
  const [recs, setRecs] = useState<Recording[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState('');
  const [speaker, setSpeaker] = useState('all');
  const [status, setStatus] = useState('active');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v2/admin/languages', { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to a language.' : 'Failed to load your languages.');
        const available = (await res.json()) as LanguageOption[];
        setLanguages(available);
        if (available.length === 0) throw new Error('No language has been assigned to this account.');
        setLang(available[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load recordings.');
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!lang) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v2/admin/recordings?languageId=${encodeURIComponent(lang)}&status=all&limit=500`, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 403 ? 'You do not have access to this language.' : 'Failed to load recordings.');
        return res.json() as Promise<Recording[]>;
      })
      .then((items) => { if (!cancelled) setRecs(items); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load recordings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lang]);

  const speakers = useMemo(() => {
    const m = new Map<string, string>();
    recs.forEach((r) => r.speaker && m.set(r.speaker.id, r.speaker.name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [recs]);

  const filtered = useMemo(
    () => recs.filter((r) =>
      (speaker === 'all' || r.speaker_id === speaker) &&
      (status === 'all' || r.status === status)
    ),
    [recs, speaker, status]
  );

  const totalDuration = filtered.reduce((s, r) => s + (r.duration_ms ?? 0), 0);

  if (loading) return <div className="animate-pulse text-muted-foreground py-12 text-center">Loading recordings…</div>;
  if (error) return (
    <Card><CardContent className="p-8 text-center flex flex-col items-center gap-2">
      <AlertCircle className="h-6 w-6 text-error" />
      <p className="text-foreground font-medium">{error}</p>
    </CardContent></Card>
  );

  const selectClass = 'h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/recordings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Recording studio
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Mic className="h-6 w-6 text-primary shrink-0" /> Recording library
        </h1>
        <p className="text-muted-foreground mt-1">Recordings for one language at a time, limited to the communities you manage.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Mic, label: 'Recordings', value: filtered.length },
          { icon: Globe, label: 'Language', value: lang ? 1 : 0 },
          { icon: Users, label: 'Speakers', value: speakers.length },
          { icon: Clock, label: 'Total audio', value: `${(totalDuration / 1000).toFixed(0)}s` },
        ].map((s) => (
          <Card key={s.label}><CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1.5">
              <s.icon className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs font-medium uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="text-2xl font-bold text-foreground tabular-nums">{s.value}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Language
          <select value={lang} onChange={(e) => setLang(e.target.value)} className={selectClass} aria-label="Filter by language">
            {languages.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Speaker
          <select value={speaker} onChange={(e) => setSpeaker(e.target.value)} className={selectClass} aria-label="Filter by speaker">
            <option value="all">All speakers</option>
            {speakers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass} aria-label="Filter by status">
            <option value="active">Active</option>
            <option value="superseded">Superseded</option>
            <option value="rejected">Rejected</option>
            <option value="all">All statuses</option>
          </select>
        </label>
      </div>

      {/* Recordings */}
      {filtered.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No recordings match these filters.</CardContent></Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 sm:w-56 shrink-0">
                  <div className="font-display text-lg font-semibold text-foreground truncate">{r.label}</div>
                  {r.gloss && <div className="text-sm text-muted-foreground truncate">{r.gloss}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground flex-1 min-w-0">
                  <span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 shrink-0" />{r.language?.name ?? 'Unknown'}</span>
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 shrink-0" />{r.speaker?.name ?? 'Unknown speaker'}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 shrink-0" />{fmtDur(r.duration_ms)}</span>
                  <span>{fmtDate(r.created_at)}</span>
                  {r.status !== 'active' && <span className="px-2 py-0.5 rounded-full bg-muted text-xs capitalize">{r.status}</span>}
                </div>
                <div className="shrink-0">
                  {(r.opus_url || r.master_url) ? (
                    <audio controls preload="none" className="h-9 w-full sm:w-64">
                      {r.opus_url && <source src={r.opus_url} type={r.opus_url.endsWith('.webm') ? 'audio/webm' : 'audio/ogg'} />}
                      {r.master_url && <source src={r.master_url} type="audio/wav" />}
                    </audio>
                  ) : (
                    <span className="text-xs text-muted-foreground">No audio file</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
