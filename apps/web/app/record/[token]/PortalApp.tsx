'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, ListChecks, MessageSquareText, ChevronDown, Play, Pause, CheckCircle2, Circle, Loader2, X } from 'lucide-react';
import { Button, Input, Textarea, cn } from '@mobtranslate/ui';
import { uploadQueue } from '@/lib/recording/uploadQueue';
import type { CapturedRecording } from '@/lib/recording/types';
import { Recorder, type RecorderTarget } from '@/app/admin/recordings/studio/Recorder';
import { UploadStatus } from '@/app/admin/recordings/studio/UploadStatus';
import { Modal } from '@/app/admin/recordings/studio/Modal';
import { authTransport, tokenTransport, type MyRecording, type PortalTransport, type PortalWorkItem } from './portalApi';

// Only serializable data crosses the server→client boundary; the transport
// (which holds functions) is constructed here, on the client.
export type PortalSource =
  | { kind: 'token'; token: string; ctx: { language_id: string; language_code: string; language_name: string; speaker_name: string | null; speaker_id: string | null } }
  | { kind: 'auth'; ctx: { language_id: string; language_code: string; language_name: string } };

export function PortalApp({ source }: { source: PortalSource }) {
  // Key the memo on stable primitives, not the source object identity, so the
  // transport (and the effects depending on it) don't churn on re-render.
  const sourceKey = source.kind === 'token' ? `t:${source.token}:${source.ctx.language_id}` : `a:${source.ctx.language_id}`;
  const transport = useMemo<PortalTransport>(
    () => (source.kind === 'token' ? tokenTransport(source.token, source.ctx) : authTransport(source.ctx)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceKey],
  );
  const [kind, setKind] = useState<'word' | 'sentence'>('word');
  const [items, setItems] = useState<PortalWorkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<RecorderTarget | null>(null);
  const [adding, setAdding] = useState(false);
  const [showMine, setShowMine] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    uploadQueue.init();
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  const loadWorklist = useCallback(
    async (autoselect: boolean) => {
      setLoading(true);
      try {
        const res = await transport.worklist({ kind, filter: 'pending', limit: 40 });
        setItems(res.items);
        if (autoselect && res.items.length && !target) {
          const f = res.items[0];
          setTarget(toTarget(kind, f));
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [transport, kind, target],
  );

  useEffect(() => {
    void loadWorklist(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const advance = useCallback(async () => {
    try {
      const res = await transport.worklist({ kind, filter: 'pending', limit: 5 });
      setItems(res.items);
      const next = res.items.find((i) => i.key !== (target?.wordId ?? target?.exampleId));
      setTarget(next ? toTarget(kind, next) : null);
    } catch {
      setTarget(null);
    }
  }, [transport, kind, target]);

  const handleSave = useCallback(
    async (captured: CapturedRecording) => {
      if (!target) return;
      await uploadQueue.enqueue({
        captured,
        languageId: transport.languageId,
        languageCode: transport.languageCode,
        label: target.label,
        kind: target.kind,
        wordId: target.wordId ?? null,
        exampleId: target.exampleId ?? null,
        targetId: target.targetId ?? null,
        gloss: target.gloss,
        speakerId: transport.speakerId,
        uploadEndpoint: transport.uploadEndpoint,
      });
      await advance();
    },
    [target, transport, advance],
  );

  return (
    <div className="mx-auto min-h-screen max-w-xl px-4" style={{ paddingBottom: 'max(6rem, env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-30 -mx-4 mb-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-foreground">{transport.languageName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {transport.speakerName ? `Recording as ${transport.speakerName}` : 'Recording'}
            </p>
          </div>
          <UploadStatus />
        </div>
      </header>

      {!online && (
        <div className="mb-4 rounded-xl bg-[var(--color-warning)]/15 px-4 py-3 text-base font-medium text-[var(--color-warning)]">
          You’re offline — your recordings are safe on this phone and will upload by themselves when you’re back online.
        </div>
      )}

      {/* Recorder */}
      <Recorder target={target} speakerName={transport.speakerName} onSave={handleSave} onSkip={target ? () => advance() : undefined} />

      {/* What to record */}
      <div className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <TabBtn active={kind === 'word'} onClick={() => setKind('word')} icon={ListChecks} label="Words" />
            <TabBtn active={kind === 'sentence'} onClick={() => setKind('sentence')} icon={MessageSquareText} label="Sentences" />
          </div>
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
            Add
          </Button>
        </div>

        <div className="max-h-80 space-y-1 overflow-y-auto">
          {items.length === 0 && !loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing left here 🎉 — tap <strong>Add</strong> to record your own {kind === 'word' ? 'words' : 'sentences'}.
            </p>
          )}
          {items.map((item) => {
            const active = item.key === (target?.wordId ?? target?.exampleId);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTarget(toTarget(kind, item))}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  active ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted',
                )}
              >
                {item.has_active ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-secondary)]" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-medium text-foreground">{item.label}</span>
                  {item.gloss && <span className="block text-base text-muted-foreground">{item.gloss}</span>}
                </span>
                {item.recording_count > 0 && <span className="flex-shrink-0 text-sm text-muted-foreground">×{item.recording_count}</span>}
              </button>
            );
          })}
          {loading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* My recordings */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowMine((s) => !s)}
          className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left"
        >
          <span className="text-base font-medium text-foreground">My recordings</span>
          <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', showMine && 'rotate-180')} />
        </button>
        {showMine && <MyRecordings transport={transport} />}
      </div>

      <AddOwnModal
        open={adding}
        kind={kind}
        onClose={() => setAdding(false)}
        onCreated={(t) => {
          setAdding(false);
          setTarget({ kind: t.kind as RecorderTarget['kind'], label: t.text, gloss: t.gloss, targetId: t.id });
        }}
        transport={transport}
      />
    </div>
  );
}

function toTarget(kind: 'word' | 'sentence', item: PortalWorkItem): RecorderTarget {
  return kind === 'sentence'
    ? { kind: 'sentence', label: item.label, gloss: item.gloss, exampleId: item.key }
    : { kind: 'word', label: item.label, gloss: item.gloss, wordId: item.key };
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof ListChecks; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function MyRecordings({ transport }: { transport: PortalTransport }) {
  const [rows, setRows] = useState<MyRecording[] | null>(null);
  useEffect(() => {
    transport.myRecordings().then(setRows).catch(() => setRows([]));
    // refresh when a new upload completes
    const onUp = () => transport.myRecordings().then(setRows).catch(() => undefined);
    window.addEventListener('recording-uploaded', onUp);
    return () => window.removeEventListener('recording-uploaded', onUp);
  }, [transport]);

  if (rows === null) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (rows.length === 0) return <p className="px-1 py-4 text-center text-sm text-muted-foreground">Your saved recordings will appear here.</p>;

  return (
    <div className="mt-2 space-y-1">
      {rows.map((r) => (
        <PlayRow key={r.id} row={r} />
      ))}
    </div>
  );
}

function PlayRow({ row }: { row: MyRecording }) {
  const [playing, setPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
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
      a.play().catch(() => setPlaying(false));
    } else a.pause();
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-secondary)] text-white disabled:opacity-40"
      >
        {playing ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-foreground">{row.label}</span>
        {row.gloss && <span className="block truncate text-sm text-muted-foreground">{row.gloss}</span>}
      </span>
      {row.duration_ms != null && <span className="flex-shrink-0 text-xs text-muted-foreground">{(row.duration_ms / 1000).toFixed(1)}s</span>}
    </div>
  );
}

function AddOwnModal({
  open,
  kind,
  transport,
  onClose,
  onCreated,
}: {
  open: boolean;
  kind: 'word' | 'sentence';
  transport: PortalTransport;
  onClose: () => void;
  onCreated: (t: { id: string; text: string; gloss: string | null; kind: string }) => void;
}) {
  const [text, setText] = useState('');
  const [gloss, setGloss] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const t = await transport.addTarget({ kind, text: text.trim(), gloss: gloss.trim() || null });
      setText('');
      setGloss('');
      onCreated(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === 'sentence' ? 'Add a sentence' : 'Add a word'}
      description="Add your own to record. You can include what it means in English."
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">{kind === 'sentence' ? 'Sentence' : 'Word'} (in language)</span>
          {kind === 'sentence' ? (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus />
          ) : (
            <Input size="lg" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          )}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">What it means (English)</span>
          <Input size="lg" value={gloss} onChange={(e) => setGloss(e.target.value)} placeholder="optional" />
        </label>
        {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving} loadingText="Adding…" disabled={!text.trim()}>
          Add &amp; record
        </Button>
      </div>
    </Modal>
  );
}
