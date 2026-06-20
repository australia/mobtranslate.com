'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, CheckCircle2, Circle, Loader2, Mic } from 'lucide-react';
import { Input, cn } from '@mobtranslate/ui';
import { fetchWorklist, type RecordingProgress, type WorklistItem } from './api';
import type { RecorderTarget } from './Recorder';

interface WorklistProps {
  languageId: string;
  currentWordId: string | null;
  refreshKey: number;
  onPick: (target: RecorderTarget) => void;
  onProgress?: (p: RecordingProgress | null) => void;
}

type Filter = 'pending' | 'recorded' | 'all';
const PAGE = 40;

export function Worklist({ languageId, currentWordId, refreshKey, onPick, onProgress }: WorklistProps) {
  const [filter, setFilter] = useState<Filter>('pending');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [items, setItems] = useState<WorklistItem[]>([]);
  const [progress, setProgress] = useState<RecordingProgress | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const res = await fetchWorklist({ languageId, filter, q: debouncedQ, limit: PAGE, offset });
        setItems((prev) => (offset === 0 ? res.items : [...prev, ...res.items]));
        setHasMore(res.hasMore);
        setProgress(res.progress);
        onProgress?.(res.progress);
      } catch {
        if (offset === 0) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [languageId, filter, debouncedQ, onProgress],
  );

  useEffect(() => {
    void load(0);
  }, [load, refreshKey]);

  const pct = progress && progress.total_words > 0 ? Math.round((progress.recorded_words / progress.total_words) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Progress */}
      {progress && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">Recording progress</span>
            <span className="text-sm text-muted-foreground">
              {progress.recorded_words.toLocaleString()} / {progress.total_words.toLocaleString()} words
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[var(--color-secondary)] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{progress.pending_words.toLocaleString()} still to record</p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1">
        {(['pending', 'recorded', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors',
              filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f === 'pending' ? 'To do' : f}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words…" className="pl-9" />
      </div>

      {/* List */}
      <div className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
        {items.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filter === 'pending' ? 'Nothing left to record here 🎉' : 'No words found.'}
          </p>
        )}
        {items.map((item) => {
          const active = item.word_id === currentWordId;
          return (
            <button
              key={item.word_id}
              type="button"
              onClick={() =>
                onPick({
                  kind: 'word',
                  label: item.word,
                  gloss: item.gloss,
                  wordId: item.word_id,
                  isCorrection: item.has_active,
                })
              }
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                active ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted',
              )}
            >
              {item.has_active ? (
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[var(--color-secondary)]" />
              ) : (
                <Circle className="h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium text-foreground">{item.word}</span>
                {item.gloss && <span className="block truncate text-sm text-muted-foreground">{item.gloss}</span>}
              </span>
              {item.recording_count > 0 && (
                <span className="flex-shrink-0 text-xs text-muted-foreground">×{item.recording_count}</span>
              )}
              {active && <Mic className="h-4 w-4 flex-shrink-0 text-primary" />}
            </button>
          );
        })}

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {hasMore && !loading && (
          <button
            type="button"
            onClick={() => load(items.length)}
            className="w-full rounded-lg py-2.5 text-sm font-medium text-primary hover:bg-muted"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
