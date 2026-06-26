'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@mobtranslate/ui';
import {
  MessageSquare,
  Languages,
  Volume2,
  Play,
  Pause,
  Search,
  AlertTriangle,
  Users,
  Activity,
  HardDrive,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Stats {
  generatedAt: string;
  requests: {
    total: number; errors: number; users: number; last24h: number; last7d: number;
    byKind: { kind: string; count: number }[];
    daily: { label: string; count: number }[];
    languages: { code: string; count: number }[];
  };
  generations: {
    clips: number; plays: number; bytes: number; durationMs: number; neverPlayed: number;
    byEngine: { engine: string; count: number; plays: number }[];
    languages: { code: string; clips: number; plays: number }[];
  };
}

interface RequestRow {
  id: string; kind: string; source: string | null; languageCode: string | null;
  input: string; output: string | null; gloss: string | null; userId: string | null;
  status: string; error: string | null; model: string | null; durationMs: number | null; createdAt: string;
}
interface GenRow {
  id: string; languageCode: string; text: string; mapped: string | null; model: string;
  engine: string; format: string; durationMs: number | null; byteSize: number | null;
  playCount: number; lastPlayedAt: string | null; createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const nf = new Intl.NumberFormat('en-US');
function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}
function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
function ago(iso: string | null): string {
  if (!iso) return '—';
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.round(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const KIND_META: Record<string, { label: string; cls: string }> = {
  translate: { label: 'Translate', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  chat: { label: 'Chat', cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  chat_app: { label: 'Chat (app)', cls: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400' },
};

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------
function StatCard({ icon: Icon, label, value, sub, tone = 'text-primary' }: {
  icon: any; label: string; value: string | number; sub?: string; tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
          <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        </div>
        <div className="text-3xl font-bold text-foreground tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Spark({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Requests · last 14 days
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{nf.format(total)} total</span>
        </div>
        <div className="flex items-end gap-1 h-24">
          {data.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-primary/80 group-hover:bg-primary rounded-t transition-colors"
                  style={{ height: `${Math.max(d.count > 0 ? 6 : 0, (d.count / max) * 100)}%` }}
                  title={`${d.label}: ${d.count}`}
                />
              </div>
              <span className="text-[9px] text-muted-foreground truncate w-full text-center">{d.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DistroBar({ title, rows: data }: { title: string; rows: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <Card>
      <CardContent className="p-5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</span>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No data yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {data.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs font-mono w-28 shrink-0 truncate text-foreground" title={d.label}>{d.label}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary/70 rounded-full" style={{ width: `${(d.value / max) * 100}%` }} />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground w-20 text-right shrink-0">
                  {nf.format(d.value)}{d.hint ? ` ${d.hint}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type Tab = 'requests' | 'generations';

export default function ExplorePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<Tab>('requests');

  const loadStats = useCallback(() => {
    fetch('/api/v2/admin/explore?resource=stats')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Explore</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything people asked to translate, their chats, and every synthesized voice clip.
          </p>
        </div>
        <button
          onClick={loadStats}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 h-9 text-sm font-medium hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Requests" value={stats ? nf.format(stats.requests.total) : '—'}
          sub={stats ? `${nf.format(stats.requests.last24h)} in last 24h · ${nf.format(stats.requests.last7d)} this week` : ''} />
        <StatCard icon={Users} label="People" value={stats ? nf.format(stats.requests.users) : '—'}
          sub={stats && stats.requests.errors > 0 ? `${nf.format(stats.requests.errors)} errors` : 'signed-in users'} tone="text-emerald-500" />
        <StatCard icon={Volume2} label="Voice clips" value={stats ? nf.format(stats.generations.clips) : '—'}
          sub={stats ? `${fmtBytes(stats.generations.bytes)} · ${fmtDur(stats.generations.durationMs)} audio` : ''} tone="text-amber-500" />
        <StatCard icon={Play} label="Plays" value={stats ? nf.format(stats.generations.plays) : '—'}
          sub={stats ? `${nf.format(stats.generations.neverPlayed)} never played` : ''} tone="text-rose-500" />
      </div>

      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1"><Spark data={stats.requests.daily} /></div>
          <DistroBar title="Top languages · requests" rows={stats.requests.languages.map((l) => ({ label: l.code, value: l.count }))} />
          <DistroBar title="Voice clips by language" rows={stats.generations.languages.map((l) => ({ label: l.code, value: l.clips, hint: `· ${l.plays}▶` }))} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabBtn active={tab === 'requests'} onClick={() => setTab('requests')} icon={MessageSquare}
          label="Translations & Chats" count={stats?.requests.total} />
        <TabBtn active={tab === 'generations'} onClick={() => setTab('generations')} icon={Volume2}
          label="Voice generations" count={stats?.generations.clips} />
      </div>

      {tab === 'requests' ? <RequestsTab /> : <GenerationsTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, count }: {
  active: boolean; onClick: () => void; icon: any; label: string; count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count != null && (
        <span className={`text-xs tabular-nums rounded-full px-1.5 py-0.5 ${active ? 'bg-primary/10' : 'bg-muted'}`}>
          {nf.format(count)}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Requests tab
// ---------------------------------------------------------------------------
function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function RequestsTab() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ items: RequestRow[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const dq = useDebounced(q);

  useEffect(() => { setPage(0); }, [dq, kind]);
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ resource: 'requests', page: String(page) });
    if (dq) p.set('q', dq);
    if (kind) p.set('kind', kind);
    fetch(`/api/v2/admin/explore?${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [dq, kind, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search input or output text…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-1">
          {['', 'translate', 'chat', 'chat_app'].map((k) => (
            <button key={k || 'all'} onClick={() => setKind(k)}
              className={`text-xs px-2.5 h-9 rounded-lg border transition-colors ${
                kind === k ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
              }`}>
              {k ? KIND_META[k]?.label ?? k : 'All'}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <Loading />
          ) : !data || data.items.length === 0 ? (
            <Empty icon={MessageSquare} text={dq || kind ? 'No requests match your filters.' : 'No translate or chat requests captured yet.'} />
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((r) => (
                <li key={r.id}>
                  <button onClick={() => setOpen(open === r.id ? null : r.id)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <span className={`shrink-0 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded mt-0.5 ${KIND_META[r.kind]?.cls ?? 'bg-muted text-muted-foreground'}`}>
                        {KIND_META[r.kind]?.label ?? r.kind}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{r.input}</p>
                        {r.output && open !== r.id && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5" lang={r.languageCode ?? undefined}>
                            → {r.output}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2 text-xs text-muted-foreground">
                        {r.status === 'error' && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}
                        {r.languageCode && <span className="font-mono">{r.languageCode}</span>}
                        <span className="tabular-nums">{ago(r.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                  {open === r.id && (
                    <div className="px-4 pb-4 pt-1 bg-muted/30 text-sm space-y-3">
                      <Field label="Input">{r.input}</Field>
                      {r.output && <Field label="Output"><span lang={r.languageCode ?? undefined}>{r.output}</span></Field>}
                      {r.gloss && <Field label="Gloss">{r.gloss}</Field>}
                      {r.error && <Field label="Error"><span className="text-rose-500">{r.error}</span></Field>}
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground pt-1">
                        <Meta k="When" v={new Date(r.createdAt).toLocaleString()} />
                        <Meta k="Source" v={r.source ?? '—'} />
                        <Meta k="Model" v={r.model ?? '—'} />
                        <Meta k="Latency" v={r.durationMs != null ? `${nf.format(r.durationMs)}ms` : '—'} />
                        <Meta k="User" v={r.userId ? r.userId.slice(0, 8) : 'anonymous'} />
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data && data.total > data.pageSize && (
        <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} loading={loading} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generations tab
// ---------------------------------------------------------------------------
function GenerationsTab() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'plays' | 'recent'>('plays');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<{ items: GenRow[]; total: number; pageSize: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const dq = useDebounced(q);

  useEffect(() => { setPage(0); }, [dq, sort]);
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ resource: 'generations', page: String(page), sort });
    if (dq) p.set('q', dq);
    fetch(`/api/v2/admin/explore?${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [dq, sort, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search the spoken text…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['plays', 'recent'] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)}
              className={`text-xs px-2.5 h-9 rounded-lg border transition-colors capitalize ${
                sort === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
              }`}>
              {s === 'plays' ? 'Most played' : 'Newest'}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <Loading />
          ) : !data || data.items.length === 0 ? (
            <Empty icon={Volume2} text={dq ? 'No clips match your search.' : 'No voice clips generated yet.'} />
          ) : (
            <ul className="divide-y divide-border">
              {data.items.map((g) => <GenRowItem key={g.id} g={g} />)}
            </ul>
          )}
        </CardContent>
      </Card>

      {data && data.total > data.pageSize && (
        <Pager page={page} total={data.total} pageSize={data.pageSize} onPage={setPage} loading={loading} />
      )}
    </div>
  );
}

function GenRowItem({ g }: { g: GenRow }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = useCallback(() => {
    if (playing) { audioRef.current?.pause(); setPlaying(false); return; }
    const a = new Audio(`/api/v2/admin/explore/audio?id=${g.id}`);
    audioRef.current = a;
    a.onended = () => setPlaying(false);
    a.onerror = () => setPlaying(false);
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [playing, g.id]);

  return (
    <li className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="shrink-0 h-9 w-9 rounded-full grid place-items-center bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate" lang={g.languageCode}>{g.text}</p>
        <p className="text-xs text-muted-foreground truncate">
          {g.mapped && g.mapped !== g.text ? <span className="font-mono">/{g.mapped}/ · </span> : null}
          {g.engine} · {g.durationMs != null ? `${(g.durationMs / 1000).toFixed(1)}s` : '—'} · {fmtBytes(g.byteSize ?? 0)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <div className="flex items-center gap-1.5 justify-end text-foreground">
          <Play className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold tabular-nums">{nf.format(g.playCount)}</span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {g.playCount > 0 ? `last ${ago(g.lastPlayedAt)}` : 'never played'}
        </p>
      </div>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground w-20 text-right hidden sm:block">
        {g.languageCode}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-sm text-foreground whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}
function Meta({ k, v }: { k: string; v: string }) {
  return <span><span className="uppercase tracking-wide text-[10px]">{k}:</span> <span className="text-foreground">{v}</span></span>;
}
function Loading() {
  return (
    <div className="py-16 grid place-items-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}
function Empty({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="py-16 grid place-items-center text-center gap-3">
      <Icon className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm text-muted-foreground max-w-xs">{text}</p>
    </div>
  );
}
function Pager({ page, total, pageSize, onPage, loading }: {
  page: number; total: number; pageSize: number; onPage: (p: number) => void; loading: boolean;
}) {
  const pages = Math.ceil(total / pageSize);
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground tabular-nums">
        {nf.format(from)}–{nf.format(to)} of {nf.format(total)}
        {loading && <Loader2 className="inline h-3 w-3 animate-spin ml-2" />}
      </p>
      <div className="flex items-center gap-1">
        <button disabled={page === 0} onClick={() => onPage(page - 1)}
          className="h-8 w-8 grid place-items-center rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground tabular-nums px-2">{page + 1} / {pages}</span>
        <button disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}
          className="h-8 w-8 grid place-items-center rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
