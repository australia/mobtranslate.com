'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic, Play, Pause, Trash2, Plus, LogIn, Users, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button, cn } from '@mobtranslate/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Recorder, type RecorderTarget } from '@/app/admin/recordings/studio/Recorder';
import type { CapturedRecording } from '@/lib/recording/types';

interface RecordingItem {
  id: string;
  url: string | null;
  duration_ms: number | null;
  is_primary: boolean;
  speaker_name: string;
  speaker_community: string | null;
  speaker_dialect: string | null;
  created_at: string;
  is_mine: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Community pronunciations for a word OR a usage example.
 * `endpointBase` is e.g. `/api/v2/words/<id>` or `/api/v2/examples/<id>`;
 * the component appends `/recordings`. `variant="compact"` is the tight inline
 * version shown under example sentences.
 */
export function Recordings({
  endpointBase,
  target,
  variant = 'full',
}: {
  endpointBase: string;
  target: RecorderTarget;
  variant?: 'full' | 'compact';
}) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<RecordingItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${endpointBase}/recordings`, { cache: 'no-store' });
      const data = await res.json();
      setItems(res.ok ? (data.recordings as RecordingItem[]) : []);
    } catch {
      setItems([]);
    }
  }, [endpointBase]);

  useEffect(() => {
    void load();
  }, [load]);

  const uploadTake = useCallback(
    async (captured: CapturedRecording) => {
      const clientId = (crypto as Crypto & { randomUUID(): string }).randomUUID();
      const form = new FormData();
      form.append(
        'meta',
        JSON.stringify({
          clientId,
          durationMs: Math.round(captured.durationMs),
          sampleRate: captured.sampleRate,
          bitDepth: captured.bitDepth,
          channels: captured.channels,
          peakAmplitude: captured.peakAmplitude,
          clipped: captured.clipped,
          opusType: captured.opusBlob?.type ?? null,
        }),
      );
      form.append('master', captured.wavBlob, `${clientId}.wav`);
      if (captured.opusBlob) {
        const ext = captured.opusBlob.type.includes('ogg') ? 'ogg' : 'webm';
        form.append('opus', captured.opusBlob, `${clientId}.${ext}`);
      }
      const res = await fetch(`${endpointBase}/recordings`, { method: 'POST', body: form });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Could not save your recording');
      }
      setAdding(false);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2600);
      await load();
    },
    [endpointBase, load],
  );

  const onDelete = useCallback(
    async (id: string) => {
      setItems((prev) => prev?.filter((r) => r.id !== id) ?? null);
      await fetch(`${endpointBase}/recordings/${id}`, { method: 'DELETE' }).catch(() => undefined);
      await load();
    },
    [endpointBase, load],
  );

  const recorderPanel = adding ? (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-base font-semibold text-foreground">Record your pronunciation</p>
        <button
          type="button"
          onClick={() => setAdding(false)}
          aria-label="Cancel"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <Recorder target={target} speakerName={user?.name || null} onSave={uploadTake} showHints />
    </div>
  ) : null;

  // ---------- COMPACT (under an example sentence) ----------
  if (variant === 'compact') {
    const has = (items?.length ?? 0) > 0;
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-2">
          {items?.map((r) => <CompactChip key={r.id} item={r} onDelete={r.is_mine ? () => onDelete(r.id) : undefined} />)}
          {!authLoading && user && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--lang-accent)]/50 px-3 py-1.5 text-sm font-medium text-[var(--lang-accent)] transition-colors hover:bg-[var(--lang-accent-soft,var(--color-muted))]"
            >
              <Mic className="h-4 w-4" /> {has ? 'Add yours' : 'Record this'}
            </button>
          )}
          {!authLoading && !user && !has && (
            <Link href={`/auth/signin?redirect=${encodeURIComponent(pathname)}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-[var(--lang-accent)]">
              <Mic className="h-4 w-4" /> Sign in to record this
            </Link>
          )}
        </div>
        {justSaved && <p className="mt-2 text-sm font-medium text-[var(--color-secondary)]">Saved — thank you.</p>}
        {adding && <div className="mt-3">{recorderPanel}</div>}
      </div>
    );
  }

  // ---------- FULL (the word's section) ----------
  const count = items?.length ?? 0;
  return (
    <section aria-labelledby="community-pronunciations">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 id="community-pronunciations" className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lang-accent)]">
          Community pronunciations
        </h3>
        {count > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4 text-[var(--lang-accent)]" /> {count} {count === 1 ? 'voice' : 'voices'}
          </span>
        )}
      </div>

      {items === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-7 text-center">
          <Mic className="mx-auto h-8 w-8 text-[var(--lang-accent)]/70" />
          <p className="mt-3 text-base font-medium text-foreground">No community recordings yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Be the first to record how <span className="font-semibold text-foreground" lang="und">{target.label}</span> is said by a real speaker — it helps everyone learning this word.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((r) => <PlayRow key={r.id} item={r} onDelete={r.is_mine ? () => onDelete(r.id) : undefined} />)}
        </ul>
      )}

      <div className="mt-4">
        {justSaved && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-secondary)]/15 px-4 py-2 text-sm font-medium text-[var(--color-secondary)]">
            <CheckCircle2 className="h-4 w-4" /> Thank you — your pronunciation was added.
          </div>
        )}
        {authLoading ? null : user ? (
          adding ? (
            recorderPanel
          ) : (
            <Button size="lg" leftIcon={<Plus className="h-5 w-5" />} onClick={() => setAdding(true)}>
              Add your pronunciation
            </Button>
          )
        ) : (
          <Link
            href={`/auth/signin?redirect=${encodeURIComponent(pathname)}`}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
          >
            <LogIn className="h-5 w-5 text-[var(--lang-accent)]" /> Sign in to add your voice
          </Link>
        )}
      </div>
    </section>
  );
}

function useAudioToggle(url: string | null) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);
  const toggle = () => {
    if (!url) return;
    let a = ref.current;
    if (!a) {
      a = new Audio(url);
      a.onended = () => setPlaying(false);
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      ref.current = a;
    }
    if (a.paused) {
      a.currentTime = 0;
      a.play().catch(() => setPlaying(false));
    } else a.pause();
  };
  useEffect(() => () => ref.current?.pause(), []);
  return { playing, toggle };
}

function CompactChip({ item, onDelete }: { item: RecordingItem; onDelete?: () => void }) {
  const { playing, toggle } = useAudioToggle(item.url);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5">
      <button
        type="button"
        onClick={toggle}
        disabled={!item.url}
        aria-label={playing ? `Pause ${item.speaker_name}` : `Play ${item.speaker_name}`}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--lang-accent)] text-white disabled:opacity-40"
      >
        {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}
      </button>
      <span className="text-sm text-foreground">{item.speaker_name}</span>
      {onDelete && (
        <button type="button" onClick={onDelete} aria-label="Delete your recording" className="text-muted-foreground hover:text-[var(--color-destructive)]">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

function PlayRow({ item, onDelete }: { item: RecordingItem; onDelete?: () => void }) {
  const { playing, toggle } = useAudioToggle(item.url);
  const meta = [item.speaker_community, item.speaker_dialect].filter(Boolean).join(' · ');
  return (
    <li className={cn('flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 transition-colors', item.is_mine ? 'border-[var(--lang-accent)]/50' : 'border-border')}>
      <button
        type="button"
        onClick={toggle}
        disabled={!item.url}
        aria-label={playing ? `Pause ${item.speaker_name}` : `Play ${item.speaker_name}`}
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--lang-accent)] text-white shadow-sm transition-transform active:scale-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
      >
        {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-foreground">{item.speaker_name}</span>
          {item.is_mine && <span className="rounded-full bg-[var(--lang-accent-soft,var(--color-muted))] px-2 py-0.5 text-xs font-semibold text-[var(--lang-accent)]">You</span>}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {meta && <span>{meta} · </span>}
          {formatDate(item.created_at)}
        </p>
      </div>
      {item.duration_ms != null && <span className="flex-shrink-0 text-sm tabular-nums text-muted-foreground">{(item.duration_ms / 1000).toFixed(1)}s</span>}
      {onDelete && (
        <button type="button" onClick={onDelete} aria-label="Delete your recording" className="flex-shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]">
          <Trash2 className="h-5 w-5" />
        </button>
      )}
    </li>
  );
}
