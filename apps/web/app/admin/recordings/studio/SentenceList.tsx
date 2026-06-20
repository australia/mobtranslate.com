'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, CheckCircle2, Circle, Loader2, Plus, X } from 'lucide-react';
import { Input, Textarea, Button, cn } from '@mobtranslate/ui';
import { Modal } from './Modal';
import { createTarget, fetchSentences, fetchTargets, updateTarget, type CustomTarget, type SentenceItem } from './api';
import type { RecorderTarget } from './Recorder';

interface SentenceListProps {
  languageId: string;
  currentKey: string | null; // exampleId or targetId currently selected
  refreshKey: number;
  onPick: (t: RecorderTarget) => void;
}

type Filter = 'pending' | 'recorded' | 'all';
const PAGE = 40;

export function SentenceList({ languageId, currentKey, refreshKey, onPick }: SentenceListProps) {
  const [filter, setFilter] = useState<Filter>('pending');
  const [q, setQ] = useState('');
  const [dq, setDq] = useState('');
  const [examples, setExamples] = useState<SentenceItem[]>([]);
  const [custom, setCustom] = useState<CustomTarget[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      try {
        const [ex, ct] = await Promise.all([
          fetchSentences({ languageId, filter, q: dq, limit: PAGE, offset }),
          offset === 0 ? fetchTargets(languageId, 'pending') : Promise.resolve(null),
        ]);
        setExamples((prev) => (offset === 0 ? ex.items : [...prev, ...ex.items]));
        setHasMore(ex.hasMore);
        if (ct) setCustom(ct.filter((t) => t.kind === 'sentence' || t.kind === 'phrase'));
      } catch {
        if (offset === 0) setExamples([]);
      } finally {
        setLoading(false);
      }
    },
    [languageId, filter, dq],
  );

  useEffect(() => {
    void load(0);
  }, [load, refreshKey]);

  const removeCustom = async (id: string) => {
    await updateTarget(id, { status: 'skipped' });
    setCustom((c) => c.filter((x) => x.id !== id));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Record full sentences &amp; stories — this teaches the voice rhythm.</p>
        <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>
          Add
        </Button>
      </div>

      {/* Custom sentences/stories you've added */}
      {custom.length > 0 && (
        <div className="mb-3 space-y-1">
          {custom.map((t) => (
            <div key={t.id} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2', t.id === currentKey ? 'border-primary bg-primary/10' : 'border-border')}>
              <button type="button" onClick={() => onPick({ kind: 'sentence', label: t.text, gloss: t.gloss, targetId: t.id })} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium text-foreground">{t.text}</span>
                <span className="block truncate text-xs text-muted-foreground">Yours{t.gloss ? ` · ${t.gloss}` : ''}</span>
              </button>
              <button type="button" onClick={() => removeCustom(t.id)} aria-label="Remove" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1">
        {(['pending', 'recorded', 'all'] as Filter[]).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={cn('flex-1 rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors', filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {f === 'pending' ? 'To do' : f}
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search example sentences…" className="pl-9" />
      </div>

      <div className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
        {examples.length === 0 && !loading && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {filter === 'pending' ? 'No example sentences left to record. Add your own stories above.' : 'No example sentences found.'}
          </p>
        )}
        {examples.map((item) => {
          const active = item.example_id === currentKey;
          return (
            <button
              key={item.example_id}
              type="button"
              onClick={() => onPick({ kind: 'sentence', label: item.text, gloss: item.gloss, exampleId: item.example_id })}
              className={cn('flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors', active ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted')}
            >
              {item.has_active ? <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-secondary)]" /> : <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground/50" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{item.text}</span>
                {item.gloss && <span className="block truncate text-xs text-muted-foreground">{item.gloss}</span>}
              </span>
              {item.recording_count > 0 && <span className="flex-shrink-0 text-xs text-muted-foreground">×{item.recording_count}</span>}
            </button>
          );
        })}
        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {hasMore && !loading && (
          <button type="button" onClick={() => load(examples.length)} className="w-full rounded-lg py-2.5 text-sm font-medium text-primary hover:bg-muted">
            Load more
          </button>
        )}
      </div>

      <AddSentenceModal
        open={adding}
        languageId={languageId}
        onClose={() => setAdding(false)}
        onCreated={(t) => {
          setCustom((c) => [...c, t]);
          setAdding(false);
        }}
      />
    </div>
  );
}

function AddSentenceModal({ open, languageId, onClose, onCreated }: { open: boolean; languageId: string; onClose: () => void; onCreated: (t: CustomTarget) => void }) {
  const [text, setText] = useState('');
  const [gloss, setGloss] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const t = await createTarget({ languageId, kind: 'sentence', text: text.trim(), gloss: gloss.trim() || null });
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
    <Modal open={open} onClose={onClose} title="Add a sentence or story" description="Anything you'd like the speaker to read aloud — a sentence, a saying, a short story.">
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">Sentence / story (in language)</span>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Type the sentence or story to be spoken" autoFocus />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-foreground">English meaning (optional)</span>
          <Input size="lg" value={gloss} onChange={(e) => setGloss(e.target.value)} placeholder="what it means" />
        </label>
        {error && <p className="text-sm text-[var(--color-destructive)]">{error}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving} loadingText="Adding…" disabled={!text.trim()}>
          Add to list
        </Button>
      </div>
    </Modal>
  );
}
