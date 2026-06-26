'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic, Play, Pause, Trash2, Plus, LogIn, Users, X, Loader2, CheckCircle2 } from 'lucide-react';
import { Button, cn } from '@mobtranslate/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Recorder } from '@/app/admin/recordings/studio/Recorder';
import type { CapturedRecording } from '@/lib/recording/types';

interface WordRecordingItem {
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

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lang-accent)] mb-3">{children}</h3>
);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function WordRecordings({ wordId, word }: { wordId: string; word: string }) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const [items, setItems] = useState<WordRecordingItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/words/${wordId}/recordings`, { cache: 'no-store' });
      const data = await res.json();
      setItems(res.ok ? (data.recordings as WordRecordingItem[]) : []);
    } catch {
      setItems([]);
    }
  }, [wordId]);

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
      const res = await fetch(`/api/v2/words/${wordId}/recordings`, { method: 'POST', body: form });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'Could not save your recording');
      }
      setAdding(false);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2600);
      await load();
    },
    [wordId, load],
  );

  const onDelete = useCallback(
    async (id: string) => {
      // optimistic
      setItems((prev) => prev?.filter((r) => r.id !== id) ?? null);
      await fetch(`/api/v2/words/${wordId}/recordings/${id}`, { method: 'DELETE' }).catch(() => undefined);
      await load();
    },
    [wordId, load],
  );

  const count = items?.length ?? 0;

  return (
    <section aria-labelledby="community-pronunciations">
      <div className="flex items-center justify-between gap-3 mb-3">
        <SectionLabel>
          <span id="community-pronunciations">Community pronunciations</span>
        </SectionLabel>
        {count > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4 text-[var(--lang-accent)]" />
            {count} {count === 1 ? 'voice' : 'voices'}
          </span>
        )}
      </div>

      {/* List */}
      {items === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-7 text-center">
          <Mic className="mx-auto h-8 w-8 text-[var(--lang-accent)]/70" />
          <p className="mt-3 text-base font-medium text-foreground">No community recordings yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Be the first to record how <span className="font-semibold text-foreground" lang="und">{word}</span> is said by a real speaker — it helps everyone learning this word.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((r) => (
            <PlayRow key={r.id} item={r} onDelete={r.is_mine ? () => onDelete(r.id) : undefined} />
          ))}
        </ul>
      )}

      {/* Add affordance */}
      <div className="mt-4">
        {justSaved && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-secondary)]/15 px-4 py-2 text-sm font-medium text-[var(--color-secondary)]">
            <CheckCircle2 className="h-4 w-4" /> Thank you — your pronunciation was added.
          </div>
        )}

        {authLoading ? null : user ? (
          adding ? (
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
              <Recorder
                target={{ kind: 'word', label: word, gloss: null, wordId }}
                speakerName={user.name || null}
                onSave={uploadTake}
                showHints
              />
            </div>
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
            <LogIn className="h-5 w-5 text-[var(--lang-accent)]" />
            Sign in to add your voice
          </Link>
        )}
      </div>
    </section>
  );
}

function PlayRow({ item, onDelete }: { item: WordRecordingItem; onDelete?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!item.url) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio(item.url);
      a.onended = () => setPlaying(false);
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      audioRef.current = a;
    }
    if (a.paused) {
      a.currentTime = 0;
      a.play().catch(() => setPlaying(false));
    } else {
      a.pause();
    }
  };

  useEffect(() => () => audioRef.current?.pause(), []);

  const meta = [item.speaker_community, item.speaker_dialect].filter(Boolean).join(' · ');

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-card px-3 py-3 transition-colors',
        item.is_mine ? 'border-[var(--lang-accent)]/50' : 'border-border',
      )}
    >
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
          {item.is_mine && (
            <span className="rounded-full bg-[var(--lang-accent-soft,var(--color-muted))] px-2 py-0.5 text-xs font-semibold text-[var(--lang-accent)]">
              You
            </span>
          )}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {meta && <span>{meta} · </span>}
          {formatDate(item.created_at)}
        </p>
      </div>

      {item.duration_ms != null && (
        <span className="flex-shrink-0 text-sm tabular-nums text-muted-foreground">{(item.duration_ms / 1000).toFixed(1)}s</span>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete your recording"
          className="flex-shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-[var(--color-destructive)]/10 hover:text-[var(--color-destructive)]"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      )}
    </li>
  );
}
