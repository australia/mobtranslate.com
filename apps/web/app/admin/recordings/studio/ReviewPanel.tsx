'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, Pause, Star, Trash2, Ban, RotateCcw, Loader2, Download, Repeat2 } from 'lucide-react';
import { Button, cn } from '@mobtranslate/ui';
import { deleteRecording, fetchRecordings, patchRecording, type RecordingRow } from './api';

interface ReviewPanelProps {
  languageId: string;
  wordId: string | null;
  refreshKey: number;
  /** Re-record a specific take (the new recording supersedes this one). */
  onReplace?: (row: RecordingRow) => void;
}

export function ReviewPanel({ languageId, wordId, refreshKey, onReplace }: ReviewPanelProps) {
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchRecordings({ languageId, wordId: wordId ?? undefined, status: 'all' }));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [languageId, wordId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const onPrimary = async (id: string) => {
    await patchRecording(id, { isPrimary: true });
    await load();
  };
  const onReject = async (id: string, rejected: boolean) => {
    await patchRecording(id, { status: rejected ? 'rejected' : 'active' });
    await load();
  };
  const onDelete = async (id: string) => {
    await deleteRecording(id);
    setRows((r) => r.filter((x) => x.id !== id));
  };

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-base text-muted-foreground">
        {wordId ? 'No recordings for this word yet.' : 'No recordings yet. Record one to see it here.'}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!wordId && <p className="mb-2 text-sm text-muted-foreground">Most recent recordings across this language.</p>}
      {rows.map((r) => (
        <RecordingItem key={r.id} row={r} onPrimary={onPrimary} onReject={onReject} onDelete={onDelete} onReplace={onReplace} />
      ))}
    </div>
  );
}

function RecordingItem({
  row,
  onPrimary,
  onReject,
  onDelete,
  onReplace,
}: {
  row: RecordingRow;
  onPrimary: (id: string) => void;
  onReject: (id: string, rejected: boolean) => void;
  onDelete: (id: string) => void;
  onReplace?: (row: RecordingRow) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const src = row.opus_url || row.master_url;

  const toggle = () => {
    if (!src) return;
    let a = audio;
    if (!a) {
      a = new Audio(src);
      a.onended = () => setPlaying(false);
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      setAudio(a);
    }
    if (a.paused) {
      a.currentTime = 0;
      void a.play();
    } else {
      a.pause();
    }
  };

  const rejected = row.status === 'rejected';
  const superseded = row.status === 'superseded';

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-3',
        rejected ? 'border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 opacity-75' : 'border-border bg-card',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary-hover)] disabled:opacity-40"
      >
        {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-foreground">{row.label}</span>
          {row.is_primary && row.status === 'active' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-secondary)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-secondary)]">
              <Star className="h-3 w-3" fill="currentColor" /> Primary
            </span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">v{row.version}</span>
          {superseded && <span className="text-xs text-muted-foreground">replaced</span>}
          {rejected && <span className="text-xs font-medium text-[var(--color-destructive)]">rejected</span>}
          {row.clipped && <span className="text-xs text-[var(--color-warning)]">clipped</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {row.speaker?.name && <span>{row.speaker.name}</span>}
          {row.duration_ms != null && <span>· {(row.duration_ms / 1000).toFixed(1)}s</span>}
          {row.sample_rate != null && <span>· {(row.sample_rate / 1000).toFixed(0)}kHz</span>}
          {row.gloss && <span className="truncate">· {row.gloss}</span>}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        {row.master_url && (
          <a
            href={row.master_url}
            download
            aria-label="Download master WAV"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
        {row.status === 'active' && !row.is_primary && (
          <button type="button" onClick={() => onPrimary(row.id)} aria-label="Set as primary" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Star className="h-4 w-4" />
          </button>
        )}
        {row.status === 'active' && onReplace && (
          <button type="button" onClick={() => onReplace(row)} aria-label="Re-record / replace this take" title="Re-record / replace" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
            <Repeat2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onReject(row.id, !rejected)}
          aria-label={rejected ? 'Restore' : 'Reject'}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {rejected ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
        </button>
        {confirmDelete ? (
          <Button size="sm" variant="destructive" onClick={() => onDelete(row.id)}>
            Delete?
          </Button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} aria-label="Delete" className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-[var(--color-destructive)]">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
