'use client';

import { useState } from 'react';
import { Cloud, CloudOff, CheckCircle2, Loader2, AlertTriangle, RotateCcw, ChevronUp } from 'lucide-react';
import { cn } from '@mobtranslate/ui';
import { useUploadQueue } from './useUploadQueue';

/**
 * Persistent, calm status pill showing the background upload queue.
 * Expands to a detail list. Makes "your recordings are safe" always visible.
 */
export function UploadStatus() {
  const { pending, errored, uploaded, items, queue } = useUploadQueue();
  const [open, setOpen] = useState(false);

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const busy = pending.length > 0;

  let label: string;
  let Icon = Cloud;
  let tone = 'text-muted-foreground';
  if (offline && (busy || errored.length)) {
    label = `Offline — ${pending.length + errored.length} saved here, will upload`;
    Icon = CloudOff;
    tone = 'text-[var(--color-warning)]';
  } else if (errored.length) {
    label = `${errored.length} need attention`;
    Icon = AlertTriangle;
    tone = 'text-[var(--color-destructive)]';
  } else if (busy) {
    label = `Uploading ${pending.length}…`;
    Icon = Loader2;
    tone = 'text-[var(--color-secondary)]';
  } else {
    label = uploaded.length ? 'All recordings saved' : 'Ready';
    Icon = CheckCircle2;
    tone = 'text-[var(--color-secondary)]';
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-sm hover:bg-muted"
      >
        <Icon className={cn('h-4 w-4', tone, busy && Icon === Loader2 && 'animate-spin')} />
        <span className="text-sm font-medium text-foreground">{label}</span>
        {items.length > 0 && <ChevronUp className={cn('h-4 w-4 text-muted-foreground transition-transform', !open && 'rotate-180')} />}
      </button>

      {open && items.length > 0 && (
        <div className="absolute right-0 z-30 mt-2 max-h-80 w-80 overflow-y-auto rounded-xl border border-border bg-card p-2 shadow-lg">
          {[...items].reverse().map((it) => (
            <div key={it.clientId} className="flex items-center gap-2 rounded-lg px-2 py-2">
              <StatusIcon status={it.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{it.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {it.status === 'uploaded'
                    ? 'Saved to cloud'
                    : it.status === 'uploading'
                      ? 'Uploading…'
                      : it.status === 'error'
                        ? it.lastError || 'Failed — will retry'
                        : 'Saved here, waiting to upload'}
                </span>
              </span>
              {it.status === 'error' && (
                <button
                  type="button"
                  onClick={() => queue.retry(it.clientId)}
                  aria-label="Retry upload"
                  className="rounded-md p-1.5 text-primary hover:bg-muted"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'uploaded') return <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--color-secondary)]" />;
  if (status === 'uploading') return <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[var(--color-secondary)]" />;
  if (status === 'error') return <AlertTriangle className="h-4 w-4 flex-shrink-0 text-[var(--color-destructive)]" />;
  return <Cloud className="h-4 w-4 flex-shrink-0 text-muted-foreground" />;
}
